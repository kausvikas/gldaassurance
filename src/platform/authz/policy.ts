/**
 * The policy decision point — `SECURITY_MODEL.md` §4.4 as executable data.
 *
 * The matrix is a table because it must be *readable by someone who is not a programmer*. A CISO
 * reviewing this reads `CAPABILITY_MATRIX` and compares it line by line with §4.4; if it were
 * expressed as branching code they would have to trust a reviewer instead. Every row here appears
 * in that table and every row in that table appears here, and a test asserts both directions.
 *
 * **Deny by default is a property of the lookup, not a branch.** `may()` denies anything it does not
 * find. A capability nobody declared, a role nobody mapped, a field nobody classified — all denied,
 * all audited (REQ-SEC-005). Adding a capability without adding a row does not open a hole; it
 * closes one that never existed.
 */
import type {
  AuthorisedEntitySet,
  AuthorizationContext,
  AuthorizationDecision,
  FieldClassification,
  Role,
  ScopeNode,
} from './index.js';

/** Every capability the system recognises. An action outside this union cannot be requested. */
export type Capability =
  | 'project.view'
  | 'project.viewCommercial'
  | 'portfolio.viewAggregates'
  | 'resource.viewIndividual'
  | 'health.setReportedRag'
  | 'health.applyOverride'
  | 'intervention.manage'
  | 'rules.editThresholds'
  | 'audit.read'
  | 'audit.readAccessEventsOnly'
  | 'identity.manageGrants'
  | 'assistant.use'
  // Phase 5 mutations that SECURITY_MODEL.md §5.1 requires be audited as writes.
  | 'forecast.updateEtc'
  | 'contract.reviseBaseline'
  | 'commercial.setCrAssumption'
  | 'risk.acceptRisk'
  | 'recovery.setAssumption'
  | 'data.applyCorrection';

export const ALL_CAPABILITIES: readonly Capability[] = [
  'project.view', 'project.viewCommercial', 'portfolio.viewAggregates', 'resource.viewIndividual',
  'health.setReportedRag', 'health.applyOverride', 'intervention.manage', 'rules.editThresholds',
  'audit.read', 'audit.readAccessEventsOnly', 'identity.manageGrants', 'assistant.use',
  'forecast.updateEtc', 'contract.reviseBaseline', 'commercial.setCrAssumption',
  'risk.acceptRisk', 'recovery.setAssumption', 'data.applyCorrection',
];

export const ALL_ROLES: readonly Role[] = [
  'EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER',
  'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR', 'SECURITY_ADMIN',
];

/**
 * `SECURITY_MODEL.md` §4.4, transcribed. Absence from a row is a denial.
 *
 * `resource.viewIndividual` is granted to nobody: §4.3 permits `EXECUTIVE` *aggregate only*, and an
 * aggregate is not individual data. Reading a named person's utilisation is therefore denied to
 * every role in the POC — which is the correct reading of §8 ("resource metrics are aggregate by
 * default; individual-level data requires explicit permission") when no such permission has been
 * granted to anyone.
 */
export const CAPABILITY_MATRIX: Readonly<Record<Capability, readonly Role[]>> = {
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
  // Writes. Each is audited as a WRITE with before/after (SECURITY_MODEL.md §5.1).
  'forecast.updateEtc': ['DELIVERY_MANAGER', 'PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER'],
  'contract.reviseBaseline': ['PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER'],
  'commercial.setCrAssumption': ['PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER'],
  'risk.acceptRisk': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR'],
  'recovery.setAssumption': ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER'],
  // SECURITY_ADMIN deliberately absent. §4.1 gives that role "identity and grants; **no business
  // data**", and a data correction mutates a financial fact. Granting it here would have made the
  // identity administrator — the one role that can widen anyone's scope — also able to change the
  // numbers, which is the classic separation-of-duties failure.
  'data.applyCorrection': ['FINANCE_CONTROLLER'],
};

/**
 * `SECURITY_MODEL.md` §4.3 — which roles may read which classification.
 *
 * `PERSONAL_DATA` maps to the empty set for the same reason as `resource.viewIndividual`: §4.3
 * grants `EXECUTIVE` *aggregate only*, and an aggregate carries no `PERSONAL_DATA` field. Granting
 * the classification to a role because that role may see a derived aggregate would be exactly the
 * over-grant §8's data-minimisation rule exists to prevent.
 *
 * **`SECURITY_TELEMETRY` is granted to `ASSURANCE_AUDITOR` and to nobody else** (ADR-0016 C-14).
 * That is the narrowest grant that closes the gap C-14 named — an audit log recording a source IP
 * that not even the auditor could read. Note what was *not* done: `PERSONAL_DATA` was not opened up
 * to the auditor as a workaround, and `SECURITY_ADMIN` was not given the grant either. The security
 * administrator manages identity; investigating who read what is the assurance function's job, and
 * keeping those apart is the same separation of duties that keeps `data.applyCorrection` away from
 * `SECURITY_ADMIN`.
 */
export const CLASSIFICATION_MATRIX: Readonly<Record<FieldClassification, readonly Role[]>> = {
  PUBLIC_INTERNAL: ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
  DELIVERY_SENSITIVE: ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
  COMMERCIAL_CONFIDENTIAL: ['EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR'],
  PERSONAL_DATA: [],
  SECURITY_TELEMETRY: ['ASSURANCE_AUDITOR'],
};

export const ALL_CLASSIFICATIONS: readonly FieldClassification[] = [
  'PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL',
  'PERSONAL_DATA', 'SECURITY_TELEMETRY',
];

/**
 * Classifications whose *read* must be audited (`SECURITY_MODEL.md` §5.1).
 *
 * `SECURITY_TELEMETRY` is on this list because an investigative grant that is not itself
 * investigable is a blind spot exactly where one is least affordable: the one role that can read
 * everyone's access history must leave a record when it does.
 */
export const AUDITED_READ_CLASSIFICATIONS: readonly FieldClassification[] =
  ['COMMERCIAL_CONFIDENTIAL', 'PERSONAL_DATA', 'SECURITY_TELEMETRY'];

/**
 * The resources on which a `SECURITY_TELEMETRY` field may legitimately appear.
 *
 * A classification grant is global — `ASSURANCE_AUDITOR` may read `SECURITY_TELEMETRY` wherever it
 * occurs — so the second half of "narrowly scoped" is limiting *where it can occur*. Without this,
 * a future DTO could carry a `sourceIp` on a project payload and the auditor's investigative grant
 * would quietly become a general one. `shape()` refuses a security-telemetry field on any resource
 * absent from this list, which makes that a build failure rather than a slow widening.
 */
export const SECURITY_TELEMETRY_RESOURCES: readonly string[] = ['auditEvent'];

/**
 * How an entity's place in the organisation is described, so scope can be resolved without this
 * module importing a domain context. The application layer supplies these; nothing here queries.
 */
export interface EntityPlacement {
  readonly projectId: string;
  readonly businessUnitId: string;
  readonly geographyId: string;
  readonly portfolioId: string;
  readonly accountId: string;
}

const NODE_FIELD: Readonly<Record<ScopeNode['kind'], keyof EntityPlacement>> = {
  BUSINESS_UNIT: 'businessUnitId',
  GEOGRAPHY: 'geographyId',
  PORTFOLIO: 'portfolioId',
  ACCOUNT: 'accountId',
  PROJECT: 'projectId',
};

/**
 * ABAC: does this entity fall inside any node of the caller's scope?
 *
 * Exported because the enforcement point needs it per entity as well as per set, and because a
 * second implementation of this rule elsewhere is how row-level security drifts open.
 */
export function placementInScope(
  placement: EntityPlacement,
  scope: readonly ScopeNode[],
): boolean {
  return scope.some((node) => placement[NODE_FIELD[node.kind]] === node.id);
}

/**
 * The policy engine.
 *
 * Pure and synchronous apart from scope resolution, which needs the placement set the application
 * layer supplies. It holds no database handle and can reach nothing: a policy that can query is a
 * policy that can be made to query for the wrong caller.
 */
export class DeclarativePolicy {
  constructor(private readonly placements: readonly EntityPlacement[]) {}

  /** RBAC. Denies anything not in the matrix — including a capability that does not exist. */
  may(ctx: AuthorizationContext, capability: string): AuthorizationDecision {
    const allowed = (CAPABILITY_MATRIX as Record<string, readonly Role[] | undefined>)[capability];
    if (allowed === undefined) {
      return {
        decision: 'DENY',
        reason: `capability "${capability}" is not declared; deny-by-default (REQ-SEC-005)`,
      };
    }
    if (!allowed.includes(ctx.role)) {
      return {
        decision: 'DENY',
        reason: `role ${ctx.role} is not granted "${capability}" by SECURITY_MODEL.md §4.4`,
      };
    }
    return { decision: 'GRANT' };
  }

  /**
   * ABAC. Resolves organisational scope to the concrete set of project ids the caller may touch.
   *
   * ADR-0005 §5: aggregates are computed over this set, never computed globally and filtered
   * afterwards. Returning the set rather than a predicate is deliberate — a predicate invites a
   * caller to fetch first and filter second, which has already read the rows.
   */
  resolveScope(ctx: AuthorizationContext): Promise<AuthorisedEntitySet> {
    const projectIds = this.placements
      .filter((p) => placementInScope(p, ctx.scope))
      .map((p) => p.projectId)
      .sort();
    return Promise.resolve({ projectIds, resolvedFrom: ctx.scope });
  }

  /** Field-level gate. Denies an unrecognised classification, not just an unpermitted one. */
  mayReadField(ctx: AuthorizationContext, classification: FieldClassification): AuthorizationDecision {
    const allowed = (CLASSIFICATION_MATRIX as Record<string, readonly Role[] | undefined>)[classification];
    if (allowed === undefined) {
      return {
        decision: 'DENY',
        reason: `field classification "${classification}" is not declared; deny-by-default`,
      };
    }
    if (!allowed.includes(ctx.role)) {
      return {
        decision: 'DENY',
        reason: `role ${ctx.role} may not read ${classification} (SECURITY_MODEL.md §4.3)`,
      };
    }
    return { decision: 'GRANT' };
  }

  /** True when a read of these classifications must itself produce an audit record. */
  readIsAudited(classifications: readonly FieldClassification[]): boolean {
    return classifications.some((c) => AUDITED_READ_CLASSIFICATIONS.includes(c));
  }
}
