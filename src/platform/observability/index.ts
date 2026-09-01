/**
 * Observability — OpenTelemetry-**shaped**, deliberately not OpenTelemetry-**dependent**.
 *
 * ADR-0009 proposes OpenTelemetry and is still `Proposed`. `ARCHITECTURE_DECISIONS.md` §2 is
 * explicit that no code may depend on a Proposed ADR, so this module imports no OTel package.
 * What it does instead is adopt OTel's *vocabulary and data shape* — spans with a trace id, span
 * id, parent, attributes and a status; counters and histograms with attribute sets; logs with a
 * severity and a trace correlation — so that accepting ADR-0009 later is a wiring change at the
 * exporter, not a rewrite of every call site.
 *
 * **The load-bearing part is `redact()`.** `SECURITY_MODEL.md` §7 forbids secrets, `PERSONAL_DATA`
 * and full commercial payloads in application logs. A rule like that enforced by reviewer attention
 * fails on a Tuesday afternoon six months from now, so it is enforced here instead: attribute values
 * pass through a redactor that drops anything whose key looks sensitive and truncates anything long
 * enough to be a payload. Telemetry is a place data leaks *out* of a system while everyone is
 * looking at the API.
 */
import type { Instant } from '@platform/time';
import type { CorrelationId } from '@platform/authz';

export type SpanStatus = 'UNSET' | 'OK' | 'ERROR';

/** Values telemetry may carry. Objects are deliberately not permitted — they hide payloads. */
export type AttributeValue = string | number | boolean;

export type Attributes = Readonly<Record<string, AttributeValue>>;

export interface Span {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly startedAt: Instant;
  endedAt?: Instant;
  status: SpanStatus;
  readonly attributes: Record<string, AttributeValue>;
  readonly events: { readonly name: string; readonly at: Instant; readonly attributes: Attributes }[];
}

export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogRecord {
  readonly at: Instant;
  readonly severity: Severity;
  readonly message: string;
  readonly attributes: Attributes;
  readonly traceId?: string;
  readonly correlationId?: CorrelationId;
}

export interface MetricPoint {
  readonly name: string;
  readonly kind: 'COUNTER' | 'HISTOGRAM';
  readonly value: number;
  readonly attributes: Attributes;
  readonly at: Instant;
}

/**
 * Attribute keys that must never reach telemetry, matched case-insensitively as substrings.
 *
 * Substring matching is intentional and errs toward over-redaction: `costRate`, `blended_cost_rate`
 * and `rateCard` should all disappear, and inventing a precise list of every field name a future
 * developer might choose is a losing game. A redacted attribute that did not need redacting costs a
 * debugging session; an un-redacted rate card costs the pricing strategy.
 */
export const REDACTED_KEY_PATTERNS: readonly string[] = [
  'password', 'secret', 'token', 'credential', 'apikey', 'api_key', 'authorization', 'cookie',
  'salary', 'compensation', 'rate', 'cost', 'margin', 'gm', 'revenue', 'contractvalue',
  'email', 'phone', 'username', 'displayname', 'name',
  // SECURITY_TELEMETRY (ADR-0016 C-14). The audit log gates these behind one role and audits the
  // read; a trace attribute gates them behind whoever can open the tracing UI. If they were
  // reachable there, the narrow investigative grant would be decoration — telemetry is exactly
  // where a control gets quietly routed around.
  'sourceip', 'source_ip', 'clientip', 'client_ip', 'ipaddress', 'ip_address', 'remoteaddr',
  'useragent', 'user_agent', 'sessionid', 'session_id',
];

/** Attribute values longer than this are truncated: a long string in telemetry is a payload. */
export const MAX_ATTRIBUTE_LENGTH = 128;

export const REDACTED = '[redacted]' as const;

/**
 * Drops sensitive keys and truncates long values.
 *
 * Note what this does **not** do: it does not hash, and it does not keep a prefix of the value.
 * Both are recognisable, and a recognisable fragment of a rate card is still a rate card.
 */
export function redact(attributes: Readonly<Record<string, unknown>>): Attributes {
  const out: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const lower = key.toLowerCase();
    if (REDACTED_KEY_PATTERNS.some((p) => lower.includes(p))) {
      out[key] = REDACTED;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.length > MAX_ATTRIBUTE_LENGTH
        ? `${value.slice(0, MAX_ATTRIBUTE_LENGTH)}…[truncated]`
        : value;
      continue;
    }
    // Objects, arrays, functions, symbols: never serialised into telemetry.
    out[key] = REDACTED;
  }
  return out;
}

/** The exporter seam. ADR-0009, once accepted, supplies an OTLP implementation of this. */
export interface TelemetryExporter {
  exportSpan(span: Span): void;
  exportLog(record: LogRecord): void;
  exportMetric(point: MetricPoint): void;
}

/** Collects in memory. What the POC runs, and what the tests assert against. */
export class InMemoryExporter implements TelemetryExporter {
  readonly spans: Span[] = [];
  readonly logs: LogRecord[] = [];
  readonly metrics: MetricPoint[] = [];
  exportSpan(span: Span): void { this.spans.push(span); }
  exportLog(record: LogRecord): void { this.logs.push(record); }
  exportMetric(point: MetricPoint): void { this.metrics.push(point); }
}

/**
 * Tracer, meter and logger in one object because they share a trace id and a clock.
 *
 * Ids are derived from a monotonically increasing counter seeded per instance, not from randomness
 * or from the wall clock — G-CLOCK forbids ambient time here, and a deterministic id is what lets a
 * test assert on a trace at all.
 */
export class Telemetry {
  #seq = 0;

  constructor(
    private readonly exporter: TelemetryExporter,
    private readonly now: () => Instant,
    private readonly traceId: string,
  ) {}

  #nextId(): string {
    this.#seq += 1;
    return `${this.traceId}-${String(this.#seq).padStart(4, '0')}`;
  }

  startSpan(name: string, attributes: Readonly<Record<string, unknown>> = {}, parentSpanId?: string): Span {
    return {
      name,
      traceId: this.traceId,
      spanId: this.#nextId(),
      ...(parentSpanId !== undefined ? { parentSpanId } : {}),
      startedAt: this.now(),
      status: 'UNSET',
      attributes: { ...redact(attributes) },
      events: [],
    };
  }

  endSpan(span: Span, status: SpanStatus = 'OK'): void {
    span.endedAt = this.now();
    span.status = status;
    this.exporter.exportSpan(span);
  }

  addEvent(span: Span, name: string, attributes: Readonly<Record<string, unknown>> = {}): void {
    span.events.push({ name, at: this.now(), attributes: redact(attributes) });
  }

  log(
    severity: Severity,
    message: string,
    attributes: Readonly<Record<string, unknown>> = {},
    correlationId?: CorrelationId,
  ): void {
    this.exporter.exportLog({
      at: this.now(),
      severity,
      message,
      attributes: redact(attributes),
      traceId: this.traceId,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  counter(name: string, value = 1, attributes: Readonly<Record<string, unknown>> = {}): void {
    this.exporter.exportMetric({
      name, kind: 'COUNTER', value, attributes: redact(attributes), at: this.now(),
    });
  }

  histogram(name: string, value: number, attributes: Readonly<Record<string, unknown>> = {}): void {
    this.exporter.exportMetric({
      name, kind: 'HISTOGRAM', value, attributes: redact(attributes), at: this.now(),
    });
  }
}

/** Metric names the platform emits, so a dashboard is built against a declared set. */
export const METRIC_NAMES = {
  authorizationDecisions: 'gldi.authz.decisions',
  authorizationDenials: 'gldi.authz.denials',
  auditRecords: 'gldi.audit.records',
  requestDuration: 'gldi.api.request.duration_ms',
  rateLimitRejections: 'gldi.api.ratelimit.rejections',
  sourceFreshnessDays: 'gldi.lineage.source_age_days',
} as const;

export const OBSERVABILITY_IMPLEMENTATION_STATE =
  'IMPLEMENTED in process (Phase 5) — OTel-shaped, no OTel package. Exporting to a collector requires ADR-0009 acceptance; debt DR-025.' as const;
