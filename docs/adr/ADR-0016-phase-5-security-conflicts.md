# ADR-0016 — Phase 5 security conflicts: role taxonomy, classification taxonomy, masking, and audit telemetry

- **Status:** **ACCEPTED**
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-30 (Phase 5 closure)
- **Approver:** CISO (C-12, C-13, C-14), Sponsor / Delivery leadership (C-11)
- **Phase:** 5
- **Affects:** `SECURITY_MODEL.md` §4.1, §4.1a, §4.3, §4.4, §4.5, §5.2, §5.4, §12; `platform/authz`
  `Role` and `FieldClassification`; `platform/config` `SecurityPolicy`;
  `src/app/authorization/field-policy.ts`; `src/app/api/contract.ts`; `scripts/security/demo-api.ts`
- **Supersedes:** —

> **Accepted at Phase 5 closure.** The four conflicts below were raised by Phase 5 and settled by the
> closure pass. The `Decision` section records what was *implemented*; the "what acceptance must
> settle" questions that stood in the Proposed version are answered inline and marked **RESOLVED**.
> One decision (C-14) changed the code; the other three confirmed what shipped and wrote down why.

---

## Context

Phase 5 direction and `SECURITY_MODEL.md` disagree in four places. `SECURITY_MODEL.md` sits at rank 3
in the precedence order (`CLAUDE.md`) and a phase instruction is not in that order at all, so in every
case the approved artifact was implemented and the conflict raised rather than resolved by preference.

### C-11 — nine roles or six?

Phase 5 direction: *"Roles **may** include: Executive, Global Delivery Head, Delivery Group Head,
Account Leader, Delivery Manager, DA, Finance, Commercial, Administrator."*

`SECURITY_MODEL.md` §4.1 and §4.4 define six: `EXECUTIVE`, `PORTFOLIO_DIRECTOR`, `DELIVERY_MANAGER`,
`FINANCE_CONTROLLER`, `ASSURANCE_AUDITOR`, `SECURITY_ADMIN`. The same six are the CHECK constraint on
`identity.app_user.role` in `migrations/0008`, the `Role` union in `platform/authz`, and the seeded
persona set in `SYNTHETIC_DATA_SPEC.md` §7.

The two sets are not a renaming. The nine-role taxonomy **refines** the six along the delivery
hierarchy (Global Delivery Head / Delivery Group Head / Account Leader are three scopes of what §4.1
calls `PORTFOLIO_DIRECTOR`) and **splits** `FINANCE_CONTROLLER` into Finance and Commercial, which are
different permission sets in a real organisation — Commercial sees contract terms and CR values,
Finance sees cost and margin, and they are not the same person. It also introduces `DA` (Delivery
Assurance), which has no counterpart, and drops `ASSURANCE_AUDITOR` — or renames it, and the
difference matters because the auditor is the only role permitted to read the audit log.

Adopting it means a new CHECK constraint, a rewritten §4.4 matrix, a rewritten `tests/authz` matrix,
and new personas. That is a governed change, not a refactor.

### C-12 — which classification taxonomy?

Phase 5 direction: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `HIGHLY RESTRICTED`.

`SECURITY_MODEL.md` §4.3: `PUBLIC_INTERNAL`, `DELIVERY_SENSITIVE`, `COMMERCIAL_CONFIDENTIAL`,
`PERSONAL_DATA`.

Same cardinality, different axis. The approved taxonomy classifies by **what the data is about**,
which is what determines who may see it: a delivery manager may read `DELIVERY_SENSITIVE` and not
`COMMERCIAL_CONFIDENTIAL`, and no severity ordering expresses that — both would be "CONFIDENTIAL".
The generic ladder is easier to explain and carries less information; the approved one drives the
permission table directly.

### C-13 — masking or omission?

Phase 5 direction: *"Create policy seams for **masking** sensitive fields."*

`SECURITY_MODEL.md` §4.5 and ADR-0005 §4: *"Unauthorised fields are **absent** from the payload — not
`null`, not `0`, not `"***"`. A null still discloses that the field exists and applies."*

These are opposites. A masked field tells the caller *this project has a forecast margin and you may
not see it*; run that across a portfolio and the pattern of masked-versus-absent maps the shape of
the business — which engagements are fixed-price, which have contingency, which have CRs in flight.

### C-14 — the audit log needs personal data that nobody may read

Found by the `UnclassifiedField` control, not by review. `SECURITY_MODEL.md` §5.2 requires every
audit record to carry `sourceIp` and `userAgent`. Both identify a person's device and approximate
location, which makes them personal data under any reading a privacy officer would accept. §4.3
grants `PERSONAL_DATA` to **nobody**.

So the two fields an investigator most needs — "was that read from the office or from a hotel at
2am?" — are omitted from the audit API response for every role, including `ASSURANCE_AUDITOR`, whose
entire purpose is to read that log. The records still hold them; the API does not return them.

The four-classification model has no category for **security telemetry**: data that is personal, that
an auditor must see, and that nobody else may.

---

## Decision

*Accepted at Phase 5 closure. Each decision states what is implemented, what the implementation
reference is, and what acceptance settled.*

### C-11 — ACCEPTED. Product personas and security roles are intentionally decoupled.

**Decision.** A **product persona** is a UX and business concept: a job to be done, a time budget, a
primary surface. A **security role** is an authorization construct: a row in a capability matrix. The
two are related and are **not** required to be one-to-one, and forcing them into correspondence to
make counts match would damage both — it would put UX vocabulary into the access-control table and
access-control vocabulary into the product.

Consequences of accepting the decoupling:

- a persona may map to **more than one** role (CISO / Assurance covers both the audit-reading duty
  and the identity-administration duty, which are deliberately different roles);
- a role may exist with **no** primary product persona (`SECURITY_ADMIN` administers identity; it is
  not a Delivery Intelligence user in the product sense and holds no business capability);
- two personas may share a role where their remit is the same breadth (CTO / Engineering Leadership
  reads the same delivery and quality signals at the same breadth as the CDO).

**Implemented.** `platform/authz` keeps the six-role union `SECURITY_MODEL.md` §4.1 defines,
`migrations/0008` keeps its CHECK constraint, and `CAPABILITY_MATRIX` implements §4.4 exactly. The
canonical persona-to-role mapping is published as **`SECURITY_MODEL.md` §4.1a** — one table showing
persona, role(s), business purpose, default scope type, allowed capability families and explicit
exclusions, built from the persona names in `PRODUCT_SPEC.md` §2 and the role names in §4.1. **No new
role was invented to complete the table.**

**RESOLVED — the nine-role question.** The Phase 5 brief's nine names remain a *refinement proposal*,
not an implemented taxonomy. **Eight of the nine** are already expressible against the six, three of
them as **scope** rather than as role, which is the ABAC model working as designed. (The Proposed
version of this ADR said "seven"; the table below has eight mapped rows and one unmapped, and the
count is corrected here rather than left to a reader to notice.)

| Phase 5 direction role | Maps to | Note |
| --- | --- | --- |
| Executive | `EXECUTIVE` | direct |
| Global Delivery Head | `PORTFOLIO_DIRECTOR` scoped to all business units | scope, not a new role |
| Delivery Group Head | `PORTFOLIO_DIRECTOR` scoped to one business unit | scope, not a new role |
| Account Leader | `PORTFOLIO_DIRECTOR` scoped to one account | scope, not a new role |
| Delivery Manager | `DELIVERY_MANAGER` | direct |
| DA (Delivery Assurance) | `ASSURANCE_AUDITOR` | closest; the audit-read grant is the substantive difference |
| Finance | `FINANCE_CONTROLLER` | direct |
| Commercial | **no equivalent** | would need a new role and a new §4.4 column |
| Administrator | `SECURITY_ADMIN` | direct |

Only **Commercial** would genuinely require a new role — contract terms, CR values and pricing
without cost or margin. Adding it is a migration, a §4.4 row, ~30 generated test cases and a new
persona, and it is **not** taken in this closure. It is carried as **DR-038**, gated
`PRODUCTION_BLOCKER`, and it is not a Phase 6 blocker: no UI decision depends on whether the
commercial split exists, because the UI reads capabilities rather than role names (§12 invariant 1).

### C-12 — ACCEPTED WITH EXTENSION. The taxonomy stays data-centric; `SECURITY_TELEMETRY` is added.

**Decision.** Classification answers *what kind of information is this?* Authorization answers *who
may do what to it, under what scope?* They are different questions and they stay on different axes.
The severity ladder (`PUBLIC` / `INTERNAL` / `CONFIDENTIAL` / `HIGHLY RESTRICTED`) is **not** adopted:
it cannot express "a delivery manager reads delivery detail and not commercial", which is the single
most consequential row in §4.3. Persona-shaped classifications — `DELIVERY_MANAGER_DATA`,
`EXECUTIVE_DATA`, `AUDITOR_DATA` — are **prohibited**, because a classification named after a role is
a second copy of the authorization matrix, and two copies of an access rule is one rule and one
liability. `tests/authz/security-telemetry.test.ts` asserts no classification carries a role name.

**Extension.** A fifth classification, **`SECURITY_TELEMETRY`**, is added for security-operational
information: source IP, user agent, session security metadata, authentication event metadata,
authorization decision metadata, failed-access metadata, security/device context, and security
correlation identifiers.

**Not** every audit field became telemetry. Fields were classified on semantic content:

| Audit field | Classification | Why |
| --- | --- | --- |
| `sourceIp`, `userAgent` | `SECURITY_TELEMETRY` | security-operational metadata about the connection the action arrived on |
| `actorId`, `actorRole`, `action`, `entityType`, `entityId`, `decision`, `occurredAt`, `id`, `correlationId`, `ruleVersion`, `impersonatorId` | `PUBLIC_INTERNAL` | what the log is *about*; relabelling them would make the new category mean "audit" |
| `fields`, `reason` | `COMMERCIAL_CONFIDENTIAL` | can name a margin field or quote a business justification |

**Implemented.** `FieldClassification` in `src/platform/authz/index.ts`; `CLASSIFICATION_MATRIX` and
`ALL_CLASSIFICATIONS` in `src/platform/authz/policy.ts`; `AUDIT_FIELDS` in
`scripts/security/demo-api.ts`; `SECURITY_MODEL.md` §4.3.

**Security telemetry is not the same question as personal data.** `SECURITY_TELEMETRY` is an
*authorization and data-handling* classification. It does not stop a source IP being personal data
for privacy and retention purposes: a source IP is simultaneously security telemetry for
access-control purposes and personal data for lawful-basis and retention purposes, and collapsing the
two dimensions would let an authorization decision quietly answer a legal question. The current model
carries **exactly one classification per field**, so the privacy dimension is documented rather than
modelled — `SECURITY_MODEL.md` §8.2 gives security telemetry a 90-day retention category, and the
dual-characterisation model is carried as **DR-037** (`PRODUCTION_BLOCKER`). Redesigning the taxonomy
to carry two orthogonal dimensions was explicitly **not** attempted in a closure pass.

### C-13 — ACCEPTED. Omission is the default field-authorization behaviour.

**Decision.** An unauthorised field is **absent** from the response. Not `null`, not `0`, not
`"*****"`. Masking leaks the field's existence, the schema's shape, the fact that a value is present,
and sometimes its type or length — and run across a portfolio, the pattern of masked-versus-absent
maps the shape of the business: which engagements are fixed-price, which carry contingency, which
have change requests in flight.

**RESOLVED — should any field ever be masked?** No field is masked today and none is approved to be.
`Disposition` keeps its `'OMIT' | 'REDACT'` seam because the Phase 5 brief asked for one and because
removing it would make a future product requirement a refactor rather than a switch. `REDACT` is
reachable by nothing: every entry `classify()` produces is `OMIT`, and two tests assert it — one that
no field map contains `REDACT`, one that no shaped payload contains the placeholder. **Enabling it
for a field requires an approved product requirement and a superseding ADR**, not a configuration
change.

Deny-by-default for unclassified fields is preserved and is the stronger half of this decision:
`shape()` throws `UnclassifiedField` on any property no map classifies, so the realistic leak — a new
DTO property nobody thought about — fails the build rather than shipping to every role.

**Implemented.** `src/app/authorization/field-policy.ts`; asserted in
`tests/authz/matrix.test.ts` ("CONFLICT C-13 — masking is a seam") and
`tests/authz/adversarial.test.ts` §3.

### C-14 — ACCEPTED. Security telemetry receives a narrow investigative grant.

**Decision.** The gap was real: `sourceIp` and `userAgent` were recorded on every audit record and
classified `PERSONAL_DATA`, which is granted to nobody — so the audit log recorded exactly the two
fields an investigator needs and then withheld them from the investigator. Three ways of closing it
were available and two were rejected:

- **rejected** — grant `ASSURANCE_AUDITOR` or `SECURITY_ADMIN` blanket `PERSONAL_DATA` read. That
  buys two audit fields at the price of every individual utilisation and attrition field in the
  system. `CLASSIFICATION_MATRIX.PERSONAL_DATA` remains `[]`, and a test asserts it;
- **rejected** — accept the omission and investigate from infrastructure logs. Splits the audit trail
  across two systems with two access models, which is how an investigation stalls;
- **accepted** — classify the two fields `SECURITY_TELEMETRY` and grant that classification narrowly.

**"Narrow" is four properties, not one.** Each is separately enforced and separately tested:

1. **One role.** `CLASSIFICATION_MATRIX.SECURITY_TELEMETRY === ['ASSURANCE_AUDITOR']`. No business
   role, and deliberately **not** `SECURITY_ADMIN` — administering identity and investigating who
   read what are different duties, and keeping them apart is the same separation of duties that keeps
   `data.applyCorrection` away from that role. No new role was created; the existing model expressed
   the policy.
2. **One resource.** `SECURITY_TELEMETRY_RESOURCES = ['auditEvent']`. `shape()` throws
   `MisplacedSecurityTelemetry` if a security-telemetry field is declared on any other resource, so a
   future DTO cannot quietly turn the investigative grant into a general one.
3. **Within scope.** The audit read is narrowed to the caller's resolved entity set
   (`withinAuthorisedEntities` in `platform/audit`), because §4.2 says *all* reads are computed over
   that set and an access history is at least as revealing as the data it describes. Records naming
   no project — logins, session events, collection-level reads — are kept, because hiding the security
   events an investigation needs in order to look tidy would defeat the log's purpose.
4. **Audited.** `SECURITY_TELEMETRY` is in `AUDITED_READ_CLASSIFICATIONS`, and the dispatcher names
   the telemetry fields returned in the audit reason (`securityTelemetry=sourceIp,userAgent`). An
   investigative grant that is not itself investigable is a blind spot exactly where a reviewer looks
   first.

**Implemented.** `src/platform/authz/policy.ts`, `src/app/authorization/field-policy.ts`,
`src/app/api/dispatcher.ts`, `src/app/api/contract.ts` (`/v1/audit` reads `SECURITY_TELEMETRY`),
`src/platform/audit/append-only.ts`, `scripts/security/demo-api.ts`. Verified by
`tests/authz/security-telemetry.test.ts` (19 tests).

**Defence in depth.** `REDACTED_KEY_PATTERNS` in `platform/observability` now drops
`sourceIp`, `userAgent`, client-IP and session-id attribute keys. Without that, the audit log would
gate these fields behind one role and audit the read while a trace attribute handed them to anyone
who can open a tracing UI — telemetry is exactly where a control gets quietly routed around.

---

## Consequences

**Positive**

- No approved security assumption was changed to match a phase instruction. §4.1, §4.3, §4.4 and §4.5
  are implemented as written, and the tests assert them against an independent transcription.
- The audit log is now usable for the investigation it exists to support, without widening any other
  grant by a single field.
- The persona/role decoupling is written down, so a later phase cannot infer a permission from a
  persona name and call it a mapping.
- Security thresholds (session windows, rate limits) moved into `platform/config` as
  `POC_SECURITY_POLICY`, labelled `SECURITY_POLICY_PROVENANCE` — *"POC / initial security-policy
  defaults, not an approved GlobalLogic enterprise standard"*. A number a security document quotes is
  now findable in one governed place, and nobody can represent a Phase 5 choice as corporate policy.

**Negative**

- A fifth classification is a fifth row in every generated matrix and a fifth thing a reviewer must
  hold in mind. That cost is accepted; the alternative was a category error in the taxonomy.
- The taxonomy carries one dimension where two exist. `SECURITY_TELEMETRY` says nothing about privacy
  obligations, and a reader who assumes it does will under-protect a source IP. Documented in §4.3 and
  §8.2 and carried as **DR-037**.
- `SECURITY_ADMIN` still cannot read the security telemetry that would help them investigate an
  account compromise. That is the intended separation of duties and it will feel wrong to a security
  administrator during an incident; the escalation path is the assurance function, and if that proves
  unworkable in practice it is an ADR, not a quiet grant.

**Neutral**

- The nine-role refinement and the `COMMERCIAL_MANAGER` split remain open as **DR-038**. Nothing in
  Phase 6 depends on them.

## Alternatives considered

1. **Implement the nine roles and migrate.** Deferred, not rejected: it changes a CHECK constraint,
   the §4.4 matrix, the persona set and ~50 test cases on the strength of a permissive "may include"
   in a phase brief. **DR-038.**
2. **Use the generic four-level ladder.** Rejected: it cannot express "delivery manager sees delivery
   detail but not commercial", which is the most important row in §4.3.
3. **Persona-named classifications.** Rejected: makes the taxonomy a duplicate of the authorization
   matrix. Asserted against by test.
4. **Mask instead of omit.** Rejected: contradicts §4.5 and ADR-0005 §4, and leaks structure.
5. **Classify `sourceIp` as `COMMERCIAL_CONFIDENTIAL` so the auditor can read it.** Rejected: an IP
   address is not commercial data, and relabelling it to make a table work is how a classification
   scheme stops meaning anything.
6. **Grant `PERSONAL_DATA` to the auditor.** Rejected: buys two audit fields at the price of every
   individual-level field in the system.
7. **Redesign the taxonomy to carry an authorization dimension and a privacy dimension.** Rejected
   *for this closure* — it is the right long-term model and it is not a narrow closure change.
   **DR-037.**

## Rollback

- **C-11:** documentation and a published mapping table; nothing to roll back in code.
- **C-12 / C-14:** revert `SECURITY_TELEMETRY` to `PERSONAL_DATA` in `AUDIT_FIELDS`, drop the union
  member, the matrix row, `SECURITY_TELEMETRY_RESOURCES` and the route classification. No migration —
  the columns already exist and are already populated. The system returns to the C-14 gap.
- **C-13:** delete the `REDACT` arm of `Disposition`. Nothing references it.
- **Security policy relocation:** `POC_SECURITY_POLICY` is a value object; re-inlining the constants
  restores the prior state and reopens the governance gap it closed.
