/**
 * Public surface — `identity`.
 * Owns: users, roles, sessions, permission grants.
 * Tier 1 · Produces L1 · Depends on: nothing.
 *
 * This context is the *record* of who exists and what they were granted. It contains no
 * authorization logic — that lives at the Application layer, once (SECURITY_MODEL.md §2 B3).
 *
 * **Behaviour is Phase 5** (REQ-SEC-001). The canonical model is Phase 2.
 */
import type { ActorId, Role, ScopeNode, SessionId } from '@platform/authz';
import type { CalendarDate, Instant } from '@platform/time';

export const CONTEXT_ID = 'identity' as const;

export interface User {
  readonly actorId: ActorId;
  /** Synthetic login handle. No real employee data (REQ-DATA-009). */
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly scope: readonly ScopeNode[];
  readonly activeFrom: CalendarDate;
  readonly activeTo?: CalendarDate;
  readonly synthetic: true;
}

/** A grant is recorded, dated and attributed — never implicit in a role name alone. */
export interface RoleGrant {
  readonly actorId: ActorId;
  readonly role: Role;
  readonly grantedAt: Instant;
  readonly grantedByActorId: ActorId;
  readonly revokedAt?: Instant;
  readonly reason: string;
}

export interface SessionRecord {
  readonly sessionId: SessionId;
  readonly actorId: ActorId;
  readonly issuedAt: Instant;
  readonly absoluteExpiry: Instant;
  readonly idleExpiry: Instant;
  readonly revokedAt?: Instant;
}

export interface IdentityService {
  findUser(actorId: ActorId): Promise<User | undefined>;
  findByUsername(username: string): Promise<User | undefined>;
  grantsFor(actorId: ActorId, asOf: Instant): Promise<readonly RoleGrant[]>;
  findSession(sessionId: SessionId): Promise<SessionRecord | undefined>;
  /** Role or scope change invalidates active sessions (SECURITY_MODEL.md §3). */
  revokeSessionsFor(actorId: ActorId): Promise<void>;
}

// --- IdentityProvider and sessions (Phase 5) --------------------------------
export type { IdentityProvider, SessionRejection, VerifiedSubject } from './internal/identity-provider.js';
export {
  MockIdentityProvider, SESSION_ABSOLUTE_LIFETIME_MS, SESSION_IDLE_LIFETIME_MS,
  SessionStore, assertDemoEnvironment,
} from './internal/identity-provider.js';

export const IMPLEMENTATION_STATE =
  'IMPLEMENTED (Phase 5) — IdentityProvider abstraction, synthetic-persona implementation (labelled), real server-side session lifecycle. OIDC/SSO/MFA are the production target and are debt DR-023.' as const;
