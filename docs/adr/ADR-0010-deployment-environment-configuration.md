# ADR-0010 — Deployment, environments and configuration

- **Status:** **Accepted** — 2026-09-03 for §2–§9 (promoted from Proposed by ADR-0032). §1 four environments remains aspirational: the POC runs `dev` locally and a static `prod`.
- **Date proposed:** 2026-08-29
- **Approver:** *pending — surfaced in the Phase 1 report*
- **Phase:** 1
- **Affects:** `platform/config`, build and CI; REQ-SEC-008, REQ-SEC-009, REQ-OPS-003
- **Supersedes:** —

---

## Context

REQ-OPS-003 requires the demo to execute end-to-end reproducibly from a clean environment, and Phase
12 will test that adversarially. Environment drift and undocumented manual steps are discovered at
exactly the wrong moment.

`SECURITY_MODEL.md` §2 B6 is also unusually strict: "There is no bypass path to persistence. No debug
endpoint, no admin console, no 'internal' route that skips §3–§5. If one is needed for development,
it must not exist in the demo build." That is a constraint on the *build*, not on discipline, and it
has to be decided before anyone needs a development shortcut.

## Decision

1. **Four environments** — `dev`, `test`, `staging`, `prod` — all running **synthetic data only**.
   `prod` holding synthetic data is a permanent POC property, not a migration stage.
2. **One artefact across all environments.** Configuration differs; the build does not. No code path
   is selected by an environment check.
3. **No development bypass exists in any build.** A shortcut that must not exist in the demo build
   does not exist at all, because a build-time exclusion is a control that can fail.
4. **Configuration is environment-injected and read once**, at the composition root, via
   `loadConfig(process.env)`. Nothing below reads the environment; the architecture gate already
   confines node builtins to the platform layer (`ARCH-006`).
5. **Invalid configuration fails at start-up** with no dangerous default.
6. **Secrets are never in the repository** (REQ-SEC-008): `.env` git-ignored, `.env.example` with keys
   and no values, and a secret scan as a CI gate.
7. **The container is the deployment unit.** Scheduled work is a separate entrypoint on the same
   image, which is also the extraction seam if it later becomes its own service.
8. **No browser-to-enterprise-source coupling, ever.** All ingestion is server-side; no source
   credential reaches the browser; no source system grants CORS to the SPA; the SPA's only origin is
   the BFF.
9. **IaC is readiness, not implementation**: configuration-driven application, no manual step between
   build and run, ordered forward-only migrations, container as the unit.

Detail: `docs/architecture/DEPLOYMENT.md`.

## Rationale

- **One artefact** is what makes staging results transferable. A build that behaves differently by
  environment tests something other than what ships.
- **No bypass in any build** is stricter than B6 requires and is the only version that is actually
  enforceable. "Excluded from the production build" is a configuration that can be wrong once.
- **Configuration read once at the composition root** is what keeps the demo reproducible and keeps
  secrets out of domain code; it is also why `Clock` is injected rather than read from an env var
  deep in a context.
- **Browser-to-source coupling** is easy to add under demo deadline pressure ("just call Jira from the
  SPA") and structurally hard to remove afterwards. Naming it as an architectural constraint is
  cheaper than discovering it in Phase 12.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Environment-specific builds** | Common and produces "works in staging" failures. The environment stops being a variable and becomes a variant. |
| **Development-only admin endpoint, excluded from production builds** | Directly contradicts `SECURITY_MODEL.md` §2 B6, and the exclusion is a configuration that can be wrong once — which is enough. |
| **Configuration read where needed** | Convenient; makes the demo non-reproducible and scatters environment coupling through the domain. |
| **Secrets in a committed encrypted file** | Better than plaintext, worse than injection, and puts key management inside the repository. |
| **Serverless deployment** | Rejected in ADR-0001 for determinism and audit-continuity reasons; nothing here changes that. |
| **Write IaC now** | Infrastructure for one demo environment, maintained across eleven phases, with no second environment to prove it against. |

## Consequences

**Positive**
- Clean-environment reproducibility (REQ-OPS-003) is a property of the design.
- No bypass path exists to be found in Phase 12.
- Secrets have controls before there are secrets.

**Negative / accepted costs**
- No development shortcuts; local work goes through the same authorization path.
- Configuration must be complete for the process to start.
- IaC will be written later against a system that has never been provisioned by IaC.

**Neutral but notable**
- The POC has no secrets today. The controls exist first, which is the only order that works.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | None |
| Data model / persistence | Migration ordering is part of environment provisioning |
| Formulas or metrics | None |
| Security model | Implements REQ-SEC-008; reinforces `SECURITY_MODEL.md` §2 B6 |
| Brand / design tokens | None |
| Requirements affected | REQ-SEC-008, REQ-SEC-009, REQ-OPS-003 |
| Tests that must change | CI runs the secret scan; Phase 12 runs the clean-environment demo |

## Migration implications

None — greenfield. `src/platform/config` already exists and is tested, so the configuration contract
is settled before anything depends on it.

## Rollback path

Each element is independently reversible; none is structural. The one that should not be relaxed is
the no-bypass rule — relaxing it would need a superseding ADR explaining how B6 is otherwise
satisfied, and no alternative has met that burden.

**Reconsider if:** the POC is productised, at which point real data, real identity and real residency
requirements make this a genuinely different problem.

## Verification

- CI: `npm ci`, typecheck, architecture gate, lint, tests, secret scan, vulnerability scan.
- Unit test: `loadConfig` rejects an unknown environment and a malformed as-of date.
- Phase 12: REQ-OPS-003 — the demo runs end-to-end from a clean checkout.
- Phase 12: adversarial review searches for any route that reaches persistence outside the
  Application layer.

## Open questions

- DQ-9 (does the BFF deploy separately?) — post-POC.
- Data residency and multi-region topology — post-POC, and out of scope per
  `SECURITY_MODEL.md` §9.
