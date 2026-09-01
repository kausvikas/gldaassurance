/**
 * The authorization matrix, asserted in both directions.
 *
 * `SECURITY_MODEL.md` §4.4 is a table a CISO reads; `CAPABILITY_MATRIX` is a table the code reads.
 * If they can drift, the document is decoration. So this suite generates a case for **every** role ×
 * **every** capability — 6 × 18 = 108 decisions — and asserts each one, and separately asserts that
 * every capability and every role is covered. Adding a capability without adding a row fails here.
 */
import { describe, expect, it } from 'vitest';
import {
  type AuthorizationContext, type Capability, type CorrelationId, type FieldClassification,
  type Role, type SessionId, type ActorId,
  ALL_CAPABILITIES, ALL_CLASSIFICATIONS, ALL_ROLES, CAPABILITY_MATRIX, CLASSIFICATION_MATRIX,
  DeclarativePolicy, placementInScope,
} from '@platform/authz';

const policy = new DeclarativePolicy([
  { projectId: 'prj-a', businessUnitId: 'bu-emea', geographyId: 'Europe', portfolioId: 'pf-1', accountId: 'acc-1' },
  { projectId: 'prj-b', businessUnitId: 'bu-amer', geographyId: 'Americas', portfolioId: 'pf-2', accountId: 'acc-2' },
  { projectId: 'prj-c', businessUnitId: 'bu-emea', geographyId: 'Europe', portfolioId: 'pf-3', accountId: 'acc-3' },
]);

const ctxFor = (role: Role, scope: AuthorizationContext['scope'] = []): AuthorizationContext => ({
  actorId: 'usr-test' as ActorId,
  role,
  sessionId: 'ses-1' as SessionId,
  correlationId: 'cor-1' as CorrelationId,
  scope,
});

/**
 * The expected matrix, transcribed **independently** from `SECURITY_MODEL.md` §4.4 rather than
 * imported from the implementation. Comparing `CAPABILITY_MATRIX` to itself would pass forever.
 */
const EXPECTED: Readonly<Record<Capability, readonly Role[]>> = {
  'project.view': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
  'project.viewCommercial': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
  'portfolio.viewAggregates': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
  'resource.viewIndividual': [],
  'health.setReportedRag': ['PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER'],
  'health.applyOverride': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR'],
  'intervention.manage': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER'],
  'rules.editThresholds': ['EXECUTIVE'],
  'audit.read': ['ASSURANCE_AUDITOR'],
  'audit.readAccessEventsOnly': ['SECURITY_ADMIN'],
  'identity.manageGrants': ['SECURITY_ADMIN'],
  'assistant.use': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
  'forecast.updateEtc': ['DELIVERY_MANAGER', 'PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER'],
  'contract.reviseBaseline': ['PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER'],
  'commercial.setCrAssumption': ['PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER'],
  'risk.acceptRisk': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR'],
  'recovery.setAssumption': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER'],
  'data.applyCorrection': ['FINANCE_CONTROLLER'],
};

describe('RBAC — every role × every capability', () => {
  for (const capability of ALL_CAPABILITIES) {
    for (const role of ALL_ROLES) {
      const shouldGrant = (EXPECTED[capability]).includes(role);
      it(`${shouldGrant ? 'grants' : 'DENIES'} ${role} → ${capability}`, () => {
        const decision = policy.may(ctxFor(role), capability);
        expect(decision.decision).toBe(shouldGrant ? 'GRANT' : 'DENY');
        if (!shouldGrant) expect(decision.reason).toBeDefined();
      });
    }
  }

  it('covers every declared capability, in both directions', () => {
    expect([...ALL_CAPABILITIES].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(CAPABILITY_MATRIX).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('names only declared roles in every row', () => {
    for (const [capability, roles] of Object.entries(CAPABILITY_MATRIX)) {
      for (const role of roles) {
        expect(ALL_ROLES, `${capability} names an unknown role`).toContain(role);
      }
    }
  });
});

describe('deny-by-default (REQ-SEC-005)', () => {
  it('denies a capability that does not exist', () => {
    for (const role of ALL_ROLES) {
      const d = policy.may(ctxFor(role), 'project.deleteEverything');
      expect(d.decision).toBe('DENY');
      expect(d.reason).toMatch(/not declared/);
    }
  });

  it('denies a field classification that does not exist', () => {
    const d = policy.mayReadField(ctxFor('EXECUTIVE'), 'SUPER_SECRET' as FieldClassification);
    expect(d.decision).toBe('DENY');
    expect(d.reason).toMatch(/not declared/);
  });

  it('denies an empty capability string', () => {
    expect(policy.may(ctxFor('EXECUTIVE'), '').decision).toBe('DENY');
  });
});

describe('field classification (REQ-SEC-004)', () => {
  const expected: Readonly<Record<FieldClassification, readonly Role[]>> = {
    PUBLIC_INTERNAL: ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
    DELIVERY_SENSITIVE: ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
    COMMERCIAL_CONFIDENTIAL: ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
    PERSONAL_DATA: [],
    // ADR-0016 C-14 (ACCEPTED). The auditor alone, and never as a side effect of any other grant.
    SECURITY_TELEMETRY: ['ASSURANCE_AUDITOR'],
  };

  for (const [classification, roles] of Object.entries(expected) as [FieldClassification, Role[]][]) {
    for (const role of ALL_ROLES) {
      const shouldGrant = roles.includes(role);
      it(`${shouldGrant ? 'permits' : 'DENIES'} ${role} → ${classification}`, () => {
        expect(policy.mayReadField(ctxFor(role), classification).decision)
          .toBe(shouldGrant ? 'GRANT' : 'DENY');
      });
    }
  }

  it('grants PERSONAL_DATA to nobody — an aggregate is not individual data', () => {
    expect(CLASSIFICATION_MATRIX.PERSONAL_DATA).toEqual([]);
  });

  it('denies a DELIVERY_MANAGER commercial data (OQ-3 assumed "no")', () => {
    expect(policy.mayReadField(ctxFor('DELIVERY_MANAGER'), 'COMMERCIAL_CONFIDENTIAL').decision).toBe('DENY');
  });

  it('denies a SECURITY_ADMIN every classification, business and security alike', () => {
    // Including SECURITY_TELEMETRY: the identity administrator manages grants, and reading who
    // looked at what from where is the assurance function's duty, not theirs (ADR-0016 C-14).
    for (const c of ALL_CLASSIFICATIONS) {
      expect(policy.mayReadField(ctxFor('SECURITY_ADMIN'), c).decision, c).toBe('DENY');
    }
  });

  it('covers every declared classification, in both directions', () => {
    expect([...ALL_CLASSIFICATIONS].sort()).toEqual(Object.keys(expected).sort());
    expect(Object.keys(CLASSIFICATION_MATRIX).sort()).toEqual(Object.keys(expected).sort());
  });
});

describe('CONFLICT C-13 — masking is a seam, not a behaviour (ADR-0016 D-3)', () => {
  it('leaves every classified field on OMIT', async () => {
    const { PROJECT_FIELDS, AUDIT_FIELDS, LINEAGE_FIELDS } =
      await import('../../scripts/security/demo-api.js');
    for (const map of [PROJECT_FIELDS, AUDIT_FIELDS, LINEAGE_FIELDS]) {
      for (const policy of Object.values(map)) {
        expect(policy.disposition, `${policy.field} is set to REDACT`).toBe('OMIT');
      }
    }
  });

  it('never emits the redaction placeholder in a shaped payload', async () => {
    const { shape, REDACTION_PLACEHOLDER } = await import('@app');
    const { PROJECT_FIELDS } = await import('../../scripts/security/demo-api.js');
    const shaped = shape('project', {
      projectId: 'prj-001', contractValue: '1000.00', leadDeveloperName: 'A Person',
    }, PROJECT_FIELDS, ctxFor('DELIVERY_MANAGER'));
    expect(JSON.stringify(shaped.payload)).not.toContain(REDACTION_PLACEHOLDER);
    expect(Object.keys(shaped.payload)).toEqual(['projectId']);
  });
});

describe('ABAC — scope resolution (REQ-SEC-003)', () => {
  it('resolves an empty scope to an empty set, never to everything', async () => {
    const set = await policy.resolveScope(ctxFor('EXECUTIVE', []));
    expect(set.projectIds).toEqual([]);
  });

  it('resolves a business-unit scope to exactly its projects', async () => {
    const set = await policy.resolveScope(ctxFor('PORTFOLIO_DIRECTOR', [{ kind: 'BUSINESS_UNIT', id: 'bu-emea' }]));
    expect(set.projectIds).toEqual(['prj-a', 'prj-c']);
  });

  it('resolves overlapping scope nodes without duplicating a project', async () => {
    const set = await policy.resolveScope(ctxFor('EXECUTIVE', [
      { kind: 'BUSINESS_UNIT', id: 'bu-emea' },
      { kind: 'PORTFOLIO', id: 'pf-1' },
    ]));
    expect(set.projectIds).toEqual(['prj-a', 'prj-c']);
  });

  it('resolves a project-level grant to exactly one project', async () => {
    const set = await policy.resolveScope(ctxFor('DELIVERY_MANAGER', [{ kind: 'PROJECT', id: 'prj-b' }]));
    expect(set.projectIds).toEqual(['prj-b']);
  });

  it('does not match a scope node id against the wrong level', () => {
    // 'pf-1' is a portfolio; asserting it as a business unit must not match.
    expect(placementInScope(
      { projectId: 'prj-a', businessUnitId: 'bu-emea', geographyId: 'Europe', portfolioId: 'pf-1', accountId: 'acc-1' },
      [{ kind: 'BUSINESS_UNIT', id: 'pf-1' }],
    )).toBe(false);
  });

  it('is deterministic and sorted, so aggregates over it are reproducible', async () => {
    const a = await policy.resolveScope(ctxFor('EXECUTIVE', [{ kind: 'GEOGRAPHY', id: 'Europe' }]));
    const b = await policy.resolveScope(ctxFor('EXECUTIVE', [{ kind: 'GEOGRAPHY', id: 'Europe' }]));
    expect(a.projectIds).toEqual(b.projectIds);
    expect([...a.projectIds].sort()).toEqual(a.projectIds);
  });
});
