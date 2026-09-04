/**
 * Input validation at the application boundary.
 *
 * `SECURITY_MODEL.md` §7: "Schema-validated at the Application boundary; reject unknown fields."
 * Rejecting unknown fields is the part that does the work. An API that ignores what it does not
 * recognise will happily accept `{"projectId": "x", "scope": "ALL"}` forever, and the day someone
 * adds a `scope` parameter for an internal tool, that request starts meaning something.
 *
 * Written by hand rather than with a schema library because the whole surface is eight routes, and a
 * dependency that parses untrusted input is itself attack surface worth not adding for this.
 */

import { parseBoundedCount } from '@platform/decimal';
import { countOf } from '@platform/language';

export class ValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    // Generic to the client (§4.5); the issues go to the server-side log and the audit reason.
    super('Invalid request');
    this.name = 'ValidationError';
  }
}

export type Validator<T> = (input: unknown) => T;

/** Ids are opaque to the client and constrained here: no separators, no traversal, no wildcards. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function identifier(field: string, value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError([`${field} must be a string`]);
  if (!ID_PATTERN.test(value)) {
    throw new ValidationError([
      `${field} must match ${ID_PATTERN.source} — got a value of length ${value.length}`,
    ]);
  }
  return value;
}

export function boundedString(field: string, value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string') throw new ValidationError([`${field} must be a string`]);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError([`${field} must be at least ${min} characters`]);
  if (trimmed.length > max) throw new ValidationError([`${field} must be at most ${max} characters`]);
  return trimmed;
}

export function oneOf<T extends string>(
  field: string, value: unknown, allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError([`${field} must be one of: ${allowed.join(', ')}`]);
  }
  return value as T;
}

/**
 * A non-negative counting number, bounded.
 *
 * Coercion is delegated to `platform/decimal` — the app layer does not convert text to numbers
 * itself, which is what the G-FLOAT gate is there to keep true. Negative values are not "clamped to
 * zero": a negative offset is not a preference a client expressed, it is a probe, and it is rejected.
 */
export function boundedInteger(field: string, value: unknown, min: number, max: number): number {
  const text = typeof value === 'number'
    ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : '')
    : typeof value === 'string' ? value : '';
  const n = parseBoundedCount(text, min, max);
  if (n === null) {
    throw new ValidationError([`${field} must be an integer between ${min} and ${max}`]);
  }
  return n;
}

/**
 * Rejects any property the schema does not name.
 *
 * Runs **before** the field validators, so a request carrying both a valid `projectId` and a
 * stowaway `role` is rejected outright rather than partially honoured.
 */
export function rejectUnknownFields(
  input: unknown, allowed: readonly string[],
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ValidationError(['body must be an object']);
  }
  const record = input as Record<string, unknown>;
  const unknown = Object.keys(record).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new ValidationError([`${countOf(unknown.length, 'unknown field')}: ${unknown.sort().join(', ')}`]);
  }
  // Prototype-pollution keys are rejected explicitly: `Object.keys` does not report `__proto__`
  // when it arrives via `JSON.parse`, so the allow-list above would not catch it.
  for (const forbidden of ['__proto__', 'constructor', 'prototype']) {
    if (Object.prototype.hasOwnProperty.call(record, forbidden)) {
      throw new ValidationError([`forbidden field: ${forbidden}`]);
    }
  }
  return record;
}

export interface PageRequest {
  readonly limit: number;
  readonly offset: number;
}

/**
 * Pagination, clamped rather than rejected on the upper bound — a caller asking for too much gets
 * the ceiling, which keeps a legitimate client working while making the ceiling non-negotiable.
 * A *negative* or non-integer value is rejected, because that is not a preference, it is a probe.
 */
export function pageRequest(
  query: Readonly<Record<string, unknown>>,
  maxPageSize: number,
  defaultPageSize: number,
): PageRequest {
  const rawLimit = query['limit'];
  const rawOffset = query['offset'];
  const limit = rawLimit === undefined
    ? defaultPageSize
    : boundedInteger('limit', rawLimit, 1, 1_000_000);
  const offset = rawOffset === undefined ? 0 : boundedInteger('offset', rawOffset, 0, 1_000_000);
  return { limit: Math.min(limit, maxPageSize), offset };
}

/** Filters are an allow-list of keys and a ceiling on values, both enforced here. */
export function filterValues(
  field: string, value: unknown, allowed: readonly string[], maxValues: number,
): readonly string[] {
  const list = Array.isArray(value) ? value : [value];
  if (list.length > maxValues) {
    throw new ValidationError([`${field} accepts at most ${maxValues} values`]);
  }
  return list.map((v) => oneOf(field, v, allowed));
}
