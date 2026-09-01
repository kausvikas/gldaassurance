/**
 * Response shaping — how an unauthorised field leaves a payload.
 *
 * **CONFLICT C-13, and why this file has two dispositions but uses one.**
 *
 * Phase 5 direction asks for "field classification/**masking** seams". `SECURITY_MODEL.md` §4.5 and
 * ADR-0005 §4 say the opposite, in terms that leave no room:
 *
 * > Unauthorised fields are **absent** from the payload — not `null`, not `0`, not `"***"`.
 * > A null still discloses that the field exists and applies.
 *
 * They are not reconcilable by preference. A masked field tells the caller *this project has a
 * forecast margin and you may not see it*, which is itself commercial information: run it across a
 * portfolio and the pattern of masked and absent fields maps the shape of the business. The
 * `SECURITY_MODEL` outranks a phase instruction (`CLAUDE.md` precedence), so:
 *
 *   - `OMIT` is the disposition every classified field uses, and the only one the enforcement point
 *     applies today;
 *   - `REDACT` exists as the requested **seam** and is used by nothing. A test asserts that. Turning
 *     it on for a field is an ADR, not a config change.
 *
 * ADR-0016 records the conflict and asks whether any field should ever be masked.
 */
import type { AuthorizationContext, FieldClassification } from '@platform/authz';
import {
  AUDITED_READ_CLASSIFICATIONS, CLASSIFICATION_MATRIX, SECURITY_TELEMETRY_RESOURCES,
} from '@platform/authz';

export type Disposition = 'OMIT' | 'REDACT';

/** One field of one resource, and the rule that governs it. */
export interface FieldPolicy {
  readonly field: string;
  readonly classification: FieldClassification;
  /**
   * `OMIT` unless an accepted ADR says otherwise. See the file header — this is not a style choice.
   */
  readonly disposition: Disposition;
}

export const REDACTION_PLACEHOLDER = '[restricted]' as const;

/**
 * A resource's complete field classification.
 *
 * "Complete" is enforced: `shape()` throws on a field the map does not classify, so adding a
 * property to a DTO without classifying it fails loudly rather than shipping it to everyone. That is
 * `REQ-SEC-005` deny-by-default applied to fields rather than to routes, and it is the single
 * highest-value line in this file — the realistic leak is not a bypassed check, it is a new field
 * nobody thought about.
 */
export type FieldClassificationMap = Readonly<Record<string, FieldPolicy>>;

/**
 * A `SECURITY_TELEMETRY` field declared on a resource that is not a security-telemetry resource.
 *
 * The auditor's telemetry grant is deliberately narrow (ADR-0016 C-14): it exists so an
 * investigation can see where a read came from, not so security-operational fields can be sprinkled
 * onto business payloads where the same grant would read as general access. Attaching one to a
 * project DTO fails here rather than being noticed in a review six months later.
 */
export class MisplacedSecurityTelemetry extends Error {
  constructor(readonly resource: string, readonly field: string) {
    super(
      `Field "${field}" is classified SECURITY_TELEMETRY on resource "${resource}", which is not a ` +
      `declared security-telemetry resource (${SECURITY_TELEMETRY_RESOURCES.join(', ')}). ` +
      'ADR-0016 C-14 keeps that grant narrow; widening it is an ADR, not a field declaration.',
    );
    this.name = 'MisplacedSecurityTelemetry';
  }
}

export class UnclassifiedField extends Error {
  constructor(readonly resource: string, readonly field: string) {
    super(
      `Field "${field}" on resource "${resource}" has no classification. Deny-by-default ` +
      '(REQ-SEC-005): classify it in the resource\'s field map before it can be returned.',
    );
    this.name = 'UnclassifiedField';
  }
}

export interface ShapeResult<T> {
  readonly payload: Partial<T>;
  /** Fields removed, for the audit record. Named, because "3 fields withheld" is not investigable. */
  readonly withheld: readonly string[];
  /** Fields returned that required an audited classification (`SECURITY_MODEL.md` §5.1). */
  readonly sensitiveFieldsRead: readonly string[];
  /** Security-telemetry fields returned, so the audit record can say the access was investigative. */
  readonly securityTelemetryRead: readonly string[];
}

/**
 * Removes every field the caller may not read, and reports what it removed.
 *
 * Applied at serialisation, at the application boundary, once. Not in a domain context (B3), not in
 * the UI (invariant 7), and not by the caller remembering to.
 */
export function shape<T extends Record<string, unknown>>(
  resource: string,
  value: T,
  classifications: FieldClassificationMap,
  ctx: AuthorizationContext,
): ShapeResult<T> {
  const payload: Record<string, unknown> = {};
  const withheld: string[] = [];
  const sensitiveFieldsRead: string[] = [];
  const securityTelemetryRead: string[] = [];

  for (const [field, raw] of Object.entries(value)) {
    const policy = classifications[field];
    if (policy === undefined) throw new UnclassifiedField(resource, field);
    if (
      policy.classification === 'SECURITY_TELEMETRY'
      && !SECURITY_TELEMETRY_RESOURCES.includes(resource)
    ) {
      throw new MisplacedSecurityTelemetry(resource, field);
    }

    const allowed = CLASSIFICATION_MATRIX[policy.classification].includes(ctx.role);
    if (allowed) {
      payload[field] = raw;
      if (AUDITED_READ_CLASSIFICATIONS.includes(policy.classification)) {
        sensitiveFieldsRead.push(field);
      }
      if (policy.classification === 'SECURITY_TELEMETRY') securityTelemetryRead.push(field);
      continue;
    }

    withheld.push(field);
    // OMIT: the key never appears. REDACT is the declared seam and is unreachable today.
    if (policy.disposition === 'REDACT') payload[field] = REDACTION_PLACEHOLDER;
  }

  return {
    payload: payload as Partial<T>,
    withheld: withheld.sort(),
    sensitiveFieldsRead: sensitiveFieldsRead.sort(),
    securityTelemetryRead: securityTelemetryRead.sort(),
  };
}

/** Convenience builder so a resource's map reads like a table. */
export function classify(
  entries: readonly (readonly [string, FieldClassification])[],
): FieldClassificationMap {
  const out: Record<string, FieldPolicy> = {};
  for (const [field, classification] of entries) {
    out[field] = { field, classification, disposition: 'OMIT' };
  }
  return out;
}
