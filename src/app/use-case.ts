/**
 * Use-case contract.
 *
 * A use case is the only way the Presentation layer, and the only way the assistant, reaches
 * a domain context. Both go through the same door under the same authorization context —
 * that identity of path is what makes AC-6 testable (ADR-0004 §3).
 */
import type { CapabilityDeclaration, RequestContext } from './authorization/enforcement.js';

export interface UseCase<TRequest, TResponse> {
  /** Deny-by-default input: an undeclared capability is inaccessible (REQ-SEC-005). */
  readonly declaration: CapabilityDeclaration;
  execute(ctx: RequestContext, request: TRequest): Promise<TResponse>;
}

/**
 * Every response carries the demo marker (REQ-UX-005, global invariant 11) and the as-of
 * instant it was computed against, so a stale surface is detectable rather than merely
 * plausible (REQ-DQ-004).
 */
export interface ApplicationResponse<T> {
  readonly data: T;
  readonly asOf: string;
  readonly demoMarker: string;
  /** Present when the surface is serving degraded or last-known-good data. */
  readonly degradation?: {
    readonly state: 'STALE' | 'DEGRADED' | 'UNAVAILABLE';
    readonly since?: string;
    readonly affectedSources: readonly string[];
  };
}
