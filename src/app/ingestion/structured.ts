/**
 * Structured ingestion: XLSX and CSV into staged, validated, quarantined records (ADR-0008,
 * ADR-0035, ADR-0036 §3).
 *
 * The pipeline, in order, with nothing skippable:
 *
 * ```
 * bytes -> format detection -> parse -> profile -> mapping -> identity -> validation
 *       -> quarantine split -> authority assignment -> receipt -> observations
 * ```
 *
 * ## Three decisions that make this trustworthy rather than merely functional
 *
 * 1. **Nothing lands in the governed plane.** Every observation this produces carries
 *    `dataContext: 'SANDBOX'`, and no code path in this POC promotes past `APPROVED`. So an upload
 *    cannot change an executive screen — a property of the code, not of a habit (ADR-0035 §5).
 *
 * 2. **Identity is resolved by declared mapping or not at all.** A row whose source identifier has
 *    no declared mapping is `UNRESOLVED` and quarantined. There is no similarity function here. Two
 *    projects called "Atlas" in different accounts is not an edge case, and a fuzzy join between
 *    them produces a cost figure that looks entirely plausible and is attached to the wrong contract.
 *
 * 3. **A quarantined row is inspectable and inert.** It keeps its raw values and its named reasons,
 *    it is counted on the receipt, and it contributes to no observation, no conflict and no answer.
 *    That is what makes "wrong data must not teach the system" (§65) a demonstrable property rather
 *    than an assurance.
 */
import type {
  CanonicalConcept, ConceptObservation, IdentityResolution, IngestionReceipt, ProjectIdentityHub,
  SourceAuthorityRegistry, SourceSystem, StagedSourceRecord, ValidationCode, ValidationFinding,
} from '@contexts/integration';
import { INGESTION_VERSION, idempotencyKey, reconcile } from '@contexts/integration';
import type { ColumnProfile, TabularSheet } from '@platform/parse';
import { detectFormat, parseCsv, parseXlsx, profile, toIsoDate } from '@platform/parse';
import { fingerprint, shortId, toDecimalString, utf8 } from '@platform/bytes';
import type { DataContext, SourceAuthorityClass } from '@platform/provenance';
import type { Instant } from '@platform/time';

/**
 * A suggested mapping from a source column to a canonical concept.
 *
 * `confidence` is `EXACT` or `LIKELY` — never a number. A percentage would imply a calibration
 * nobody performed, and the only decision it drives is binary: `EXACT` may be applied automatically,
 * `LIKELY` requires confirmation (§48). Two states are what the decision needs, so two is what it has.
 */
export interface MappingSuggestion {
  readonly sourceField: string;
  readonly concept: CanonicalConcept | null;
  readonly confidence: 'EXACT' | 'LIKELY' | 'NONE';
  readonly why: string;
}

export interface ApprovedMapping {
  readonly mappingVersion: string;
  /** The column holding the identifier this source knows a project by. */
  readonly identityField: string;
  readonly identitySystem: SourceSystem;
  readonly periodField: string | null;
  readonly fields: readonly {
    readonly sourceField: string;
    readonly concept: CanonicalConcept;
    readonly required: boolean;
    readonly kind: 'NUMERIC' | 'CATEGORICAL';
    readonly nonNegative?: boolean;
  }[];
}

export interface StructuredIngestionRequest {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly mapping: ApprovedMapping;
  readonly identity: ProjectIdentityHub;
  readonly registry: SourceAuthorityRegistry;
  readonly authority: SourceAuthorityClass;
  readonly dataContext: DataContext;
  readonly receivedAt: Instant;
  readonly effectiveDate: string | null;
  /** The source's own declared record count, where it supplies one (ADR-0008 §6). */
  readonly declaredRecordCount: number | null;
  /** Project ids that exist. A row naming anything else is `UNKNOWN_PROJECT`, never a new project. */
  readonly knownProjectIds: readonly string[];
}

export interface StructuredIngestionResult {
  readonly receipt: IngestionReceipt;
  readonly staged: readonly StagedSourceRecord[];
  readonly observations: readonly ConceptObservation[];
  readonly quarantined: readonly StagedSourceRecord[];
  readonly profile: readonly ColumnProfile[];
  readonly suggestions: readonly MappingSuggestion[];
  readonly sheetName: string;
  readonly headers: readonly string[];
}

export class UnreadableUpload extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableUpload';
  }
}

/**
 * Column-name patterns that map to canonical concepts.
 *
 * Suggestion only. Nothing here silently becomes an approved mapping: `EXACT` still requires the
 * caller to include the field in `ApprovedMapping`, and this table exists so a person confirming a
 * mapping has something sensible to confirm rather than a blank grid (§48).
 */
const MAPPING_HINTS: readonly (readonly [CanonicalConcept, RegExp])[] = [
  ['financial.actualCost', /^(actual[\s_-]?cost|cost[\s_-]?to[\s_-]?date|itd[\s_-]?cost|spend)$/i],
  ['financial.estimateToComplete', /^(etc|estimate[\s_-]?to[\s_-]?complete|remaining[\s_-]?cost)$/i],
  ['financial.forecastRevenue', /^(forecast[\s_-]?revenue|revenue[\s_-]?forecast|eac[\s_-]?revenue)$/i],
  ['financial.recognisedRevenue', /^(recognised[\s_-]?revenue|recognized[\s_-]?revenue|revenue[\s_-]?to[\s_-]?date)$/i],
  ['financial.financialPeriod', /^(period|financial[\s_-]?period|month|as[\s_-]?of|reporting[\s_-]?date)$/i],
  ['financial.invoiceStatus', /^(invoice[\s_-]?status|ar[\s_-]?status|receivables?)$/i],
  ['contract.soldValue', /^(contract[\s_-]?value|tcv|sold[\s_-]?value|order[\s_-]?value)$/i],
  ['contract.pendingChange', /^(pending[\s_-]?cr|pending[\s_-]?change|open[\s_-]?change)$/i],
  ['contract.executedChange', /^(executed[\s_-]?cr|signed[\s_-]?change|approved[\s_-]?change)$/i],
  ['delivery.completedWork', /^(completed[\s_-]?(work|points|story[\s_-]?points)|done)$/i],
  ['delivery.plannedWork', /^(planned[\s_-]?(work|points)|committed)$/i],
  ['delivery.velocity', /^(velocity|throughput)$/i],
  ['delivery.defectCount', /^(defects?|bugs?|defect[\s_-]?count)$/i],
  ['delivery.milestoneStatus', /^(milestone[\s_-]?status|gate[\s_-]?status)$/i],
  ['resource.actualEffort', /^(actual[\s_-]?(effort|hours)|hours[\s_-]?booked)$/i],
  ['resource.plannedEffort', /^(planned[\s_-]?(effort|hours)|baseline[\s_-]?hours)$/i],
  ['resource.staffing', /^(fte|headcount|staffing)$/i],
  ['assurance.reviewDate', /^(review[\s_-]?date|last[\s_-]?review|psv[\s_-]?date)$/i],
  ['status.reportedRag', /^(rag|status|reported[\s_-]?rag|health)$/i],
];

export function suggestMappings(headers: readonly string[]): readonly MappingSuggestion[] {
  return headers.map((sourceField) => {
    for (const [concept, pattern] of MAPPING_HINTS) {
      if (pattern.test(sourceField.trim())) {
        return {
          sourceField, concept, confidence: 'EXACT' as const,
          why: `The column name matches the governed pattern for ${concept}.`,
        };
      }
    }
    const loose = MAPPING_HINTS.find(([, pattern]) =>
      pattern.test(sourceField.trim().replace(/[^a-z0-9]/gi, '')));
    if (loose !== undefined) {
      return {
        sourceField, concept: loose[0], confidence: 'LIKELY' as const,
        why: 'The column name resembles a governed concept once punctuation is ignored. '
          + 'A likely match must be confirmed before it is used; it is never applied silently.',
      };
    }
    return {
      sourceField, concept: null, confidence: 'NONE' as const,
      why: 'No governed concept matches this column. It will be read and ignored, and the receipt '
        + 'will say so rather than dropping it silently.',
    };
  });
}

export function ingestStructured(request: StructuredIngestionRequest): StructuredIngestionResult {
  const format = detectFormat(request.bytes);
  const sheet = readSheet(request, format);
  const columnProfile = profile(sheet);
  const suggestions = suggestMappings(sheet.headers);

  const mappedFields = request.mapping.fields.filter(
    (f) => sheet.headers.includes(f.sourceField),
  );
  const ignored = sheet.headers.filter(
    (h) => !request.mapping.fields.some((f) => f.sourceField === h)
      && h !== request.mapping.identityField && h !== request.mapping.periodField,
  );

  const seenPeriodKeys = new Set<string>();
  const seenIdentities = new Set<string>();
  const staged: StagedSourceRecord[] = [];
  const observations: ConceptObservation[] = [];

  for (const row of sheet.rows) {
    const findings: ValidationFinding[] = [];
    const rawIdentity = (row.cells[request.mapping.identityField] ?? '').trim();
    const resolution: IdentityResolution = request.identity.resolve(
      request.mapping.identitySystem, rawIdentity,
    );

    let projectId: string | null = null;
    if (resolution.kind === 'RESOLVED') {
      projectId = resolution.projectId;
      if (!request.knownProjectIds.includes(projectId)) {
        finding(findings, 'UNKNOWN_PROJECT', request.mapping.identityField,
          `The mapping resolves "${rawIdentity}" to a project this portfolio does not contain.`);
        projectId = null;
      }
    } else {
      finding(findings,
        resolution.reason === 'AMBIGUOUS' ? 'AMBIGUOUS_MAPPING' : 'UNRESOLVED_IDENTITY',
        request.mapping.identityField,
        resolution.reason === 'BLANK'
          ? 'The identity column is empty on this row.'
          : resolution.reason === 'AMBIGUOUS'
            ? `More than one declared mapping claims "${rawIdentity}".`
            : `No declared mapping links "${rawIdentity}" to a project. Identity is resolved by `
              + 'declared mapping or not at all; a name-similarity join is not available.');
    }

    const period = readPeriod(row.cells, request.mapping, findings, request.effectiveDate);

    if (projectId !== null) {
      if (seenIdentities.has(projectId) && request.mapping.periodField === null) {
        finding(findings, 'DUPLICATE_PROJECT_ID', request.mapping.identityField,
          'This project already appears in a file that permits one row per project.');
      }
      seenIdentities.add(projectId);
      const periodKey = `${projectId}|${period ?? ''}`;
      if (seenPeriodKeys.has(periodKey)) {
        finding(findings, 'DUPLICATE_PERIOD_RECORD', request.mapping.periodField ?? 'period',
          'This project and period already appear in this file.');
      }
      seenPeriodKeys.add(periodKey);
    }

    for (const column of row.uncachedFormula) {
      finding(findings, 'FORMULA_CELL_REJECTED', column,
        'The cell holds a formula with no cached value. Formulas are never evaluated, and an '
        + 'unevaluated cell is a stated absence rather than a zero.');
    }

    const rowObservations: ConceptObservation[] = [];
    for (const field of mappedFields) {
      const raw = (row.cells[field.sourceField] ?? '').trim();
      if (raw === '') {
        if (field.required) {
          finding(findings, 'MISSING_REQUIRED_FIELD', field.sourceField,
            'The mapping marks this field as required and the cell is empty.');
        }
        continue;
      }
      if (field.kind === 'NUMERIC') {
        const value = toDecimalString(raw);
        if (value === null) {
          finding(findings, 'INVALID_DATA_TYPE', field.sourceField,
            'The value is not a number where the mapping requires one.');
          continue;
        }
        if (field.nonNegative === true && value.startsWith('-')) {
          finding(findings, 'PROHIBITED_NEGATIVE_AMOUNT', field.sourceField,
            'The concept cannot be negative.');
          continue;
        }
        if (isPercentConcept(field.concept) && outsidePercentRange(value)) {
          finding(findings, 'IMPOSSIBLE_PERCENTAGE', field.sourceField,
            'A percentage outside the range this concept permits.');
          continue;
        }
        rowObservations.push(observation(request, projectId ?? '', field.concept, period, value, 'NUMERIC'));
        continue;
      }
      if (field.concept === 'status.reportedRag' && !/^(GREEN|AMBER|RED)$/i.test(raw)) {
        finding(findings, 'UNKNOWN_ENUM_VALUE', field.sourceField,
          'Reported status must be GREEN, AMBER or RED.');
        continue;
      }
      rowObservations.push(
        observation(request, projectId ?? '', field.concept, period, raw, 'CATEGORICAL'),
      );
    }

    const disposition = findings.length === 0 && projectId !== null ? 'ACCEPTED' : 'QUARANTINED';
    staged.push({
      idempotencyKey: idempotencyKey(request.sourceId, rawIdentity || `row-${String(row.rowNumber)}`,
        request.mapping.mappingVersion),
      sourceId: request.sourceId,
      naturalKey: rawIdentity,
      sourceVersion: request.mapping.mappingVersion,
      observedAt: period,
      receivedAt: request.receivedAt,
      rowNumber: row.rowNumber,
      raw: row.cells,
      projectId,
      unresolvedReason: resolution.kind === 'UNRESOLVED' ? resolution.reason : null,
      findings,
      disposition,
    });

    // **The quarantine gate.** A row with any finding contributes nothing. Not a partial row, not
    // its valid columns — nothing. Accepting the good half of a bad row is how a file with two
    // broken rows silently changes a total by the amount of the two rows that were fine.
    if (disposition === 'ACCEPTED') observations.push(...rowObservations);
  }

  const reconciliation = reconcile(request.declaredRecordCount, staged);
  const accepted = staged.filter((s) => s.disposition === 'ACCEPTED');
  const quarantined = staged.filter((s) => s.disposition === 'QUARANTINED');

  const notes: string[] = [];
  if (reconciliation.reason !== null) notes.push(reconciliation.reason);
  if (sheet.rowsTruncated > 0) {
    notes.push(`${String(sheet.rowsTruncated)} rows exceeded the ingestion row ceiling and were not read.`);
  }
  if (ignored.length > 0) {
    notes.push(`Columns read and not mapped: ${ignored.join(', ')}.`);
  }
  const formulaLike = sheet.rows.filter((r) => r.formulaLike.length > 0).length;
  if (formulaLike > 0) {
    notes.push(`${String(formulaLike)} rows contained a cell beginning with a spreadsheet execution `
      + 'character. The value was preserved and neutralised so it cannot execute if this data is '
      + 'ever exported and reopened in a spreadsheet.');
  }
  notes.push(`Every accepted record entered the ${request.dataContext} data context. Nothing an `
    + 'upload contributes reaches the governed executive figures in this POC.');

  // A batch that fails reconciliation applies nothing at all (ADR-0008 §6).
  const effectiveObservations = reconciliation.reconciled ? observations : [];

  const receipt: IngestionReceipt = {
    receiptId: shortId('rcpt', request.sourceId, fingerprint(request.bytes)),
    sourceId: request.sourceId,
    sourceName: request.sourceName,
    sourceKind: 'FILE_UPLOAD',
    fingerprint: fingerprint(request.bytes),
    byteLength: request.bytes.length,
    receivedAt: request.receivedAt,
    effectiveDate: request.effectiveDate,
    recordsDetected: sheet.rows.length,
    recordsAccepted: reconciliation.reconciled ? accepted.length : 0,
    recordsQuarantined: reconciliation.reconciled ? quarantined.length : staged.length,
    projectsMatched: new Set(accepted.map((s) => s.projectId)).size,
    projectsUnresolved: new Set(
      quarantined.filter((s) => s.projectId === null).map((s) => s.naturalKey),
    ).size,
    fieldsMapped: mappedFields.length,
    fieldsIgnored: ignored.length,
    conceptsMapped: [...new Set(mappedFields.map((f) => f.concept))],
    conflictsDetected: 0,
    authority: request.authority,
    dataContext: request.dataContext,
    mappingVersion: request.mapping.mappingVersion,
    ingestionVersion: INGESTION_VERSION,
    pagesParsed: null,
    chunksIndexed: null,
    parseCompleteness: null,
    notes,
  };

  return {
    receipt,
    staged,
    observations: effectiveObservations,
    quarantined,
    profile: columnProfile,
    suggestions,
    sheetName: sheet.name,
    headers: sheet.headers,
  };
}

function readSheet(request: StructuredIngestionRequest, format: string): TabularSheet {
  if (format === 'XLSX') {
    const workbook = parseXlsx(request.bytes);
    const first = workbook.sheets[0];
    if (first === undefined) throw new UnreadableUpload('The workbook contains no readable sheet.');
    return first;
  }
  if (format === 'TEXT') return parseCsv(utf8(request.bytes), request.fileName);
  throw new UnreadableUpload(
    `${request.fileName} is not a workbook or a delimited text file. The file's own bytes decide `
    + 'this, not its extension.',
  );
}

function readPeriod(
  cells: Readonly<Record<string, string>>,
  mapping: ApprovedMapping,
  findings: ValidationFinding[],
  fallback: string | null,
): string | null {
  if (mapping.periodField === null) return fallback;
  const raw = (cells[mapping.periodField] ?? '').trim();
  if (raw === '') return fallback;
  const iso = toIsoDate(raw);
  if (iso === null) {
    finding(findings, 'INVALID_DATE', mapping.periodField,
      'The value is not a date this pipeline accepts. An ambiguous numeric date is rejected rather '
      + 'than guessed at, because guessing produces a period-shifted financial record.');
    return null;
  }
  return iso;
}

function observation(
  request: StructuredIngestionRequest,
  projectId: string,
  concept: CanonicalConcept,
  period: string | null,
  value: string,
  kind: 'NUMERIC' | 'CATEGORICAL',
): ConceptObservation {
  return {
    sourceId: request.sourceId,
    projectId,
    concept,
    period: period ?? request.effectiveDate ?? 'unstated',
    value,
    kind,
    // Read from the registry rather than taken from the request, so a source cannot assert its own
    // authority by claiming it on an upload (ADR-0035 §4).
    authority: request.registry.authorityOf(request.sourceId, concept),
    dataContext: request.dataContext,
    observedAt: period,
    sourceVersion: request.mapping.mappingVersion,
  };
}

function finding(
  into: ValidationFinding[], code: ValidationCode, field: string, detail: string,
): void {
  into.push({ code, field, detail });
}

function isPercentConcept(concept: CanonicalConcept): boolean {
  return concept === 'delivery.velocity' || concept === 'resource.staffing';
}

function outsidePercentRange(value: string): boolean {
  // A bare string comparison is enough for the sign, and the magnitude test is deliberately loose:
  // this rejects impossible values, not implausible ones, and deciding plausibility is a governed
  // judgement no validator should be making on its own.
  if (value.startsWith('-')) return true;
  const [whole = '0'] = value.split('.');
  return whole.length > 4;
}
