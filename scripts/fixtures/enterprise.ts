/**
 * The Phase 13 demonstration fixtures — **DEMO — SYNTHETIC DATA** throughout.
 *
 * Six enterprise connector fixtures, an identity registry, an authority registry, and the four
 * uploads the mandatory demonstrations need: a statement of work, a supplemental financial workbook,
 * a workbook of deliberately bad rows, and a workbook that disagrees with Finance.
 *
 * ## What is invented here and what is not
 *
 * **Not invented:** anything about GlobalLogic. No system name, no schema, no object name, no
 * endpoint and no authentication method here is a claim about a real GlobalLogic tenant. Column
 * names are generic to their category — `actual_cost` is what a cost column is called in general —
 * and `docs/ENTERPRISE_INTEGRATION_MATRIX.md` records `SCHEMA DISCOVERED: NO` for every one of them.
 *
 * **Invented:** the values, the client aliases and the contract language, all synthetic, all
 * consistent with the frozen portfolio, and none of it describing a real engagement.
 *
 * ## The conflict is deliberate and its size is chosen
 *
 * The supplemental workbook reports a forecast revenue that differs from the governed figure by
 * enough to clear the materiality threshold, so the conflict engine has something real to detect.
 * The demonstration is not that a conflict can be manufactured — it is that a **supplemental source
 * cannot move a governed number**, and the disagreement surfaces instead of the value.
 */
import type {
  DiscoveredSchema, IdentityMapping, RawRecord, SchemaMapping, SourceDomain, SourceSystem,
} from '@contexts/integration';
import { FixtureConnector, ProjectIdentityHub, SourceAuthorityRegistry } from '@contexts/integration';
import type { Instant } from '@platform/time';
import { buildPdf, buildXlsx } from './office.js';

const NOW = () => '2026-08-31T09:00:00.000Z' as Instant;

const field = (name: string, type: DiscoveredSchema['fields'][number]['type'], sample: string) => ({
  name, type, nullable: false, sample,
});

/**
 * Builds one fixture connector.
 *
 * `schemaVersion` is carried on both the schema and the mapping so that changing one without the
 * other is exactly what drift detection catches — which is how the drift demonstration works
 * without any special-case code.
 */
function fixture(args: {
  sourceId: string; displayName: string; system: SourceSystem; domain: SourceDomain;
  entity: string; concepts: readonly string[]; identityField: string; periodField: string | null;
  fields: readonly { name: string; type: DiscoveredSchema['fields'][number]['type']; sample: string; concept: string }[];
  records: readonly RawRecord[];
  demonstrates: string;
}): FixtureConnector {
  const schema: DiscoveredSchema = {
    entity: args.entity,
    fields: [
      field(args.identityField, 'string', 'FIN-1001'),
      ...(args.periodField === null ? [] : [field(args.periodField, 'date', '2026-08-31')]),
      ...args.fields.map((f) => field(f.name, f.type, f.sample)),
    ],
    // Always false for a fixture. The integration matrix reads this field directly.
    discoveredFromLiveSystem: false,
    schemaVersion: 'v1',
  };
  const mapping: SchemaMapping = {
    mappingVersion: `${args.sourceId}-map-v1`,
    entity: args.entity,
    schemaVersion: 'v1',
    identityField: args.identityField,
    periodField: args.periodField,
    fields: args.fields.map((f) => ({
      sourceField: f.name,
      concept: f.concept as never,
      required: true,
      confirmedBy: 'POC fixture configuration',
    })),
  };
  return new FixtureConnector({
    sourceId: args.sourceId,
    displayName: args.displayName,
    system: args.system,
    domain: args.domain,
    suppliesConcepts: args.concepts as never,
    schema,
    mapping,
    records: args.records,
    demonstrates: args.demonstrates,
    now: NOW,
  });
}

/** The three projects the cross-source demonstration is built on. */
export const DEMO_PROJECTS = ['prj-001', 'prj-002', 'prj-003'] as const;

const record = (
  key: string, version: string, observedAt: string, fields: Record<string, string>,
): RawRecord => ({ naturalKey: key, sourceVersion: version, observedAt, fields });

export function financeFixture(): FixtureConnector {
  return fixture({
    sourceId: 'src-finance', displayName: 'Finance / ERP', system: 'FINANCE_ERP',
    domain: 'FINANCE_ERP', entity: 'project_financials',
    concepts: ['financial.actualCost', 'financial.estimateToComplete', 'financial.forecastRevenue'],
    identityField: 'finance_project_id', periodField: 'period',
    fields: [
      { name: 'actual_cost', type: 'number', sample: '4820000', concept: 'financial.actualCost' },
      { name: 'etc', type: 'number', sample: '1200000', concept: 'financial.estimateToComplete' },
      { name: 'forecast_revenue', type: 'number', sample: '7400000', concept: 'financial.forecastRevenue' },
    ],
    records: [
      record('FIN-1001', 'v3', '2026-08-31', { finance_project_id: 'FIN-1001', period: '2026-08-31', actual_cost: '4820000', etc: '1200000', forecast_revenue: '7400000' }),
      record('FIN-1002', 'v3', '2026-08-31', { finance_project_id: 'FIN-1002', period: '2026-08-31', actual_cost: '2100000', etc: '950000', forecast_revenue: '3600000' }),
      record('FIN-1003', 'v3', '2026-08-31', { finance_project_id: 'FIN-1003', period: '2026-08-31', actual_cost: '8940000', etc: '3100000', forecast_revenue: '12800000' }),
    ],
    demonstrates: 'Finance is the authoritative source for actual cost; a supplemental upload that '
      + 'disagrees is disclosed rather than merged.',
  });
}

export function salesforceFixture(): FixtureConnector {
  return fixture({
    sourceId: 'src-crm', displayName: 'CRM / Commercial', system: 'SALESFORCE',
    domain: 'CRM_COMMERCIAL', entity: 'opportunity',
    concepts: ['commercial.opportunity', 'commercial.accountOwnership', 'contract.soldValue'],
    identityField: 'external_project_ref', periodField: null,
    fields: [
      { name: 'opportunity_stage', type: 'string', sample: 'Closed Won', concept: 'commercial.opportunity' },
      { name: 'account_owner', type: 'string', sample: 'Regional Director', concept: 'commercial.accountOwnership' },
      { name: 'contract_value', type: 'number', sample: '9200000', concept: 'contract.soldValue' },
    ],
    records: [
      record('CRM-4401', 'v2', '2026-08-20', { external_project_ref: 'CRM-4401', opportunity_stage: 'Closed Won', account_owner: 'Regional Director, Americas', contract_value: '9200000' }),
      record('CRM-4402', 'v2', '2026-08-20', { external_project_ref: 'CRM-4402', opportunity_stage: 'Closed Won', account_owner: 'Regional Director, EMEA', contract_value: '4600000' }),
    ],
    demonstrates: 'A CRM is a governed source for commercial metadata and is not authoritative for '
      + 'delivery progress, even though it stores a percentage.',
  });
}

export function psaFixture(): FixtureConnector {
  return fixture({
    sourceId: 'src-psa', displayName: 'PSA / Resource management', system: 'PSA',
    domain: 'PSA_RESOURCE', entity: 'resource_assignment',
    concepts: ['resource.plannedEffort', 'resource.actualEffort', 'resource.staffing'],
    identityField: 'engagement_code', periodField: 'week_ending',
    fields: [
      { name: 'planned_hours', type: 'number', sample: '1840', concept: 'resource.plannedEffort' },
      { name: 'actual_hours', type: 'number', sample: '1955', concept: 'resource.actualEffort' },
      { name: 'fte', type: 'number', sample: '46', concept: 'resource.staffing' },
    ],
    records: [
      record('ENG-77120', 'v5', '2026-08-28', { engagement_code: 'ENG-77120', week_ending: '2026-08-28', planned_hours: '1840', actual_hours: '1955', fte: '46' }),
      record('ENG-77121', 'v5', '2026-08-28', { engagement_code: 'ENG-77121', week_ending: '2026-08-28', planned_hours: '960', actual_hours: '910', fte: '24' }),
    ],
    demonstrates: 'Effort actuals arrive weekly and are supplemental to Finance for cost.',
  });
}

export function almFixture(): FixtureConnector {
  return fixture({
    sourceId: 'src-alm', displayName: 'ALM (Jira / Azure DevOps)', system: 'ALM',
    domain: 'ALM_DELIVERY', entity: 'iteration_summary',
    concepts: ['delivery.plannedWork', 'delivery.completedWork', 'delivery.velocity', 'delivery.defectCount'],
    identityField: 'project_key', periodField: 'iteration_end',
    fields: [
      { name: 'planned_points', type: 'number', sample: '120', concept: 'delivery.plannedWork' },
      { name: 'completed_points', type: 'number', sample: '86', concept: 'delivery.completedWork' },
      { name: 'velocity', type: 'number', sample: '86', concept: 'delivery.velocity' },
      { name: 'open_defects', type: 'number', sample: '31', concept: 'delivery.defectCount' },
    ],
    records: [
      record('ATLAS', 'v9', '2026-08-29', { project_key: 'ATLAS', iteration_end: '2026-08-29', planned_points: '120', completed_points: '86', velocity: '86', open_defects: '31' }),
      record('KESTREL', 'v9', '2026-08-29', { project_key: 'KESTREL', iteration_end: '2026-08-29', planned_points: '95', completed_points: '92', velocity: '92', open_defects: '7' }),
    ],
    demonstrates: 'An ALM abstraction, not Jira-specific semantics: the same adapter serves Azure '
      + 'DevOps or any other backlog system supplying the same governed concepts.',
  });
}

export function assuranceFixture(): FixtureConnector {
  return fixture({
    sourceId: 'src-assurance', displayName: 'Delivery Assurance platform',
    system: 'DELIVERY_ASSURANCE', domain: 'DELIVERY_ASSURANCE', entity: 'assurance_review',
    concepts: ['assurance.reviewDate', 'assurance.finding', 'assurance.actionStatus'],
    identityField: 'da_project_id', periodField: 'review_date',
    fields: [
      { name: 'findings_open', type: 'number', sample: '4', concept: 'assurance.finding' },
      { name: 'actions_overdue', type: 'number', sample: '2', concept: 'assurance.actionStatus' },
    ],
    records: [
      record('DA-9001', 'v2', '2026-05-14', { da_project_id: 'DA-9001', review_date: '2026-05-14', findings_open: '4', actions_overdue: '2' }),
      record('DA-9002', 'v2', '2026-08-11', { da_project_id: 'DA-9002', review_date: '2026-08-11', findings_open: '1', actions_overdue: '0' }),
    ],
    demonstrates: 'An assurance review dated three months ago is overdue evidence — which is the '
      + 'third fact the cross-source question needs.',
  });
}

export function analyticsFixture(): FixtureConnector {
  return fixture({
    sourceId: 'src-analytics', displayName: 'Enterprise analytics (Tableau)', system: 'TABLEAU',
    domain: 'ANALYTICS', entity: 'published_data_source',
    concepts: ['financial.recognisedRevenue', 'delivery.milestoneStatus'],
    identityField: 'project_key', periodField: 'as_of',
    fields: [
      { name: 'recognised_revenue', type: 'number', sample: '5100000', concept: 'financial.recognisedRevenue' },
      { name: 'milestone_state', type: 'string', sample: 'AT_RISK', concept: 'delivery.milestoneStatus' },
    ],
    records: [
      record('TAB-501', 'v1', '2026-08-30', { project_key: 'TAB-501', as_of: '2026-08-30', recognised_revenue: '5100000', milestone_state: 'AT_RISK' }),
    ],
    demonstrates: 'Read through a published data source, never scraped from a rendered chart: a fact '
      + 'derived from pixels has no lineage and no authority.',
  });
}

export function allFixtures(): readonly FixtureConnector[] {
  return [
    financeFixture(), salesforceFixture(), psaFixture(), almFixture(), assuranceFixture(),
    analyticsFixture(),
  ];
}

/**
 * The declared identity mappings.
 *
 * Deliberately **incomplete**: `FIN-1003` and `DA-9002` have no mapping, so the demonstration
 * includes rows that quarantine as `UNRESOLVED_IDENTITY` rather than being fuzzily joined. A
 * registry that mapped everything would demonstrate nothing about what happens when one does not.
 */
export function identityHub(): ProjectIdentityHub {
  const hub = new ProjectIdentityHub();
  const mappings: readonly IdentityMapping[] = [
    { projectId: 'prj-001', system: 'FINANCE_ERP', externalId: 'FIN-1001', declaredBy: 'POC fixture' },
    { projectId: 'prj-002', system: 'FINANCE_ERP', externalId: 'FIN-1002', declaredBy: 'POC fixture' },
    { projectId: 'prj-001', system: 'SALESFORCE', externalId: 'CRM-4401', declaredBy: 'POC fixture' },
    { projectId: 'prj-002', system: 'SALESFORCE', externalId: 'CRM-4402', declaredBy: 'POC fixture' },
    { projectId: 'prj-001', system: 'PSA', externalId: 'ENG-77120', declaredBy: 'POC fixture' },
    { projectId: 'prj-002', system: 'PSA', externalId: 'ENG-77121', declaredBy: 'POC fixture' },
    { projectId: 'prj-001', system: 'ALM', externalId: 'ATLAS', declaredBy: 'POC fixture' },
    { projectId: 'prj-002', system: 'ALM', externalId: 'KESTREL', declaredBy: 'POC fixture' },
    { projectId: 'prj-001', system: 'DELIVERY_ASSURANCE', externalId: 'DA-9001', declaredBy: 'POC fixture' },
    { projectId: 'prj-001', system: 'TABLEAU', externalId: 'TAB-501', declaredBy: 'POC fixture' },
    { projectId: 'prj-001', system: 'UPLOAD', externalId: 'FIN-1001', declaredBy: 'POC fixture' },
    { projectId: 'prj-002', system: 'UPLOAD', externalId: 'FIN-1002', declaredBy: 'POC fixture' },
  ];
  hub.declareAll(mappings);
  return hub;
}

/**
 * The authority registry, per canonical concept.
 *
 * **POC configuration, not GlobalLogic policy.** Every rendering of it says so. The one entry that
 * carries the demonstration is `financial.forecastRevenue`: Finance is `AUTHORITATIVE` and an
 * uploaded workbook is `SUPPLEMENTAL`, so a disagreement is disclosed and the governed value does
 * not move.
 */
export function authorityRegistry(): SourceAuthorityRegistry {
  const registry = new SourceAuthorityRegistry();
  const grant = (
    sourceId: string, concept: string, authority: string, rationale: string, priority = 1,
  ): void => {
    registry.register({
      sourceId, concept: concept as never, authority: authority as never, priority,
      conflictBehaviour: 'DISCLOSE', rationale,
    });
  };

  grant('src-finance', 'financial.actualCost', 'AUTHORITATIVE',
    'The general ledger is where cost is recorded. Nothing else observes it.');
  grant('src-finance', 'financial.forecastRevenue', 'AUTHORITATIVE',
    'Revenue recognition is a finance judgement, not a delivery one.');
  grant('src-finance', 'financial.estimateToComplete', 'GOVERNED_REFERENCE',
    'Finance holds the ETC of record; delivery proposes it and finance accepts it.');
  grant('src-crm', 'commercial.opportunity', 'AUTHORITATIVE',
    'The commercial system owns the opportunity and its stage.');
  grant('src-crm', 'commercial.accountOwnership', 'AUTHORITATIVE',
    'Account ownership is a commercial fact.');
  grant('src-crm', 'contract.soldValue', 'GOVERNED_REFERENCE',
    'The contract system is authoritative for the executed baseline; the CRM reflects it.');
  grant('src-alm', 'delivery.completedWork', 'AUTHORITATIVE',
    'The backlog is where completion is recorded.');
  grant('src-alm', 'delivery.plannedWork', 'AUTHORITATIVE', 'The backlog holds the plan.');
  grant('src-alm', 'delivery.velocity', 'AUTHORITATIVE', 'Velocity is derived from the backlog.');
  grant('src-alm', 'delivery.defectCount', 'AUTHORITATIVE', 'Defects are raised and closed here.');
  grant('src-psa', 'resource.actualEffort', 'AUTHORITATIVE',
    'Time is booked in the professional-services system.');
  grant('src-psa', 'resource.plannedEffort', 'GOVERNED_REFERENCE', 'Staffing plans originate here.');
  grant('src-psa', 'resource.staffing', 'AUTHORITATIVE', 'Assignment is recorded here.');
  grant('src-assurance', 'assurance.reviewDate', 'AUTHORITATIVE',
    'The assurance platform is the record of when a review happened.');
  grant('src-assurance', 'assurance.finding', 'AUTHORITATIVE', 'Findings are raised here.');
  grant('src-assurance', 'assurance.actionStatus', 'AUTHORITATIVE', 'Actions are tracked here.');
  grant('src-analytics', 'financial.recognisedRevenue', 'SUPPLEMENTAL',
    'An analytics layer reports what its upstream told it. It is a convenience, not a source.', 2);
  grant('src-analytics', 'delivery.milestoneStatus', 'SUPPLEMENTAL',
    'Reported through analytics; the delivery system remains the source.', 2);
  grant('src-upload-financials', 'financial.forecastRevenue', 'SUPPLEMENTAL',
    'An uploaded workbook is one person\u2019s extract. It is evidence of what someone believes and is '
    + 'not a system of record.', 5);
  grant('src-upload-financials', 'financial.actualCost', 'SUPPLEMENTAL',
    'Same reasoning: an extract, not the ledger.', 5);

  return registry;
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/**
 * The Atlas statement of work.
 *
 * Synthetic contract language written for this POC. It describes no real engagement and no real
 * commercial term. Page two carries the acceptance clause the before/after demonstration asks about,
 * and its **stated acceptance date differs from the canonical delivery plan** — which is the
 * discrepancy ADR-0035 §7 exists to preserve rather than resolve.
 */
export function atlasSow(): Uint8Array {
  return buildPdf([
    {
      lines: [
        'ATLAS CONNECTED PLATFORM — RELEASE 2',
        'Statement of Work · Version 3 · Effective 12 January 2026',
        'DEMO — SYNTHETIC DATA. This document describes no real engagement.',
        '',
        '1. Scope of Services',
        '',
        'The Supplier shall design, build and deliver the Connected Platform Release 2',
        'comprising the vehicle telemetry ingest service, the dealer portal and the',
        'reporting workspace, together with migration of the Release 1 data set.',
        '',
        '2. Governance',
        '',
        'The parties shall hold a monthly steering review. Change to scope, schedule or',
        'charges takes effect only through a Change Request signed by both parties.',
        'Work performed in anticipation of an unsigned Change Request is performed at',
        'the Supplier risk and shall not be chargeable.',
        '',
      ],
    },
    {
      lines: [
        'Acceptance Criteria',
        '',
        'Acceptance of each Release occurs when the Customer confirms in writing that',
        'the Release passes the agreed acceptance test suite with no outstanding Severity 1',
        'or Severity 2 defects, within ten business days of the Supplier notice of',
        'readiness. Where the Customer neither confirms nor rejects within ten business',
        'days, the Release is deemed accepted.',
        '',
        'The Release 2 acceptance milestone date is 15 December 2026.',
        '',
        'Payment of the Release 2 milestone charge falls due on acceptance and not before.',
        '',
        'Defects of Severity 3 and below shall not prevent acceptance and shall be',
        'remedied under the warranty provisions of clause 9.',
        '',
      ],
    },
    {
      lines: [
        'Charges and Liability',
        '',
        'The charges are fixed for the scope described in clause 1. The Supplier bears',
        'the risk of effort overrun within that scope.',
        '',
        'Liquidated damages accrue at 0.5% of the Release 2 milestone charge for each',
        'complete week of delay beyond the acceptance milestone date, capped at 5%.',
        '',
      ],
    },
  ], 'Atlas Connected Platform R2 — Statement of Work v3');
}

/** A governance document with no project association, to demonstrate what "indexed" does not mean. */
export function unassociatedMinutes(): Uint8Array {
  return buildPdf([
    {
      lines: [
        'PORTFOLIO GOVERNANCE BOARD — MINUTES',
        'DEMO — SYNTHETIC DATA',
        '',
        'The board reviewed portfolio contingency policy and agreed no change.',
        'The board noted the assurance backlog and asked for a plan by the next meeting.',
        '',
      ],
    },
  ], 'Portfolio Governance Board minutes — August 2026');
}

/**
 * A supplemental financial workbook.
 *
 * Row 1 agrees with Finance. Row 2 **disagrees materially** on forecast revenue — the conflict the
 * demonstration turns on. Row 3 names a finance id with no declared identity mapping.
 */
export function supplementalFinancials(): Uint8Array {
  return buildXlsx([{
    name: 'Financials',
    headers: ['finance_project_id', 'period', 'actual_cost', 'forecast_revenue'],
    rows: [
      ['FIN-1001', '2026-08-31', '4820000', '7400000'],
      ['FIN-1002', '2026-08-31', '2100000', '5100000'],
      ['FIN-1003', '2026-08-31', '8940000', '12800000'],
    ],
  }]);
}

/**
 * Deliberately bad rows, one defect class each (§65).
 *
 * Every one of these must quarantine, and the question they would have affected must answer
 * identically before and after. That is the demonstration: wrong data does not teach the system.
 */
export function badRows(): Uint8Array {
  return buildXlsx([{
    name: 'Financials',
    headers: ['finance_project_id', 'period', 'actual_cost', 'forecast_revenue'],
    rows: [
      ['FIN-9999', '2026-08-31', '1000000', '2000000'],
      ['FIN-1001', 'the third of never', '1000000', '2000000'],
      ['FIN-1002', '2026-08-31', 'not a number', '2000000'],
      ['FIN-1001', '2026-08-31', '-500000', '2000000'],
      ['', '2026-08-31', '1000000', '2000000'],
      ['FIN-1002', '2026-08-31', '', ''],
    ],
    uncachedFormulaCells: [[5, 2]],
  }]);
}
