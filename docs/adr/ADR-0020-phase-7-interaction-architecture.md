# ADR-0020 — Phase 7 interaction architecture: an application gateway, and no transport

- **Status:** **ACCEPTED**
- **Date:** 2026-08-30 (Phase 6 closure / Phase 7 entry gate)
- **Approver:** Principal Front-End Architect, Enterprise Platform Architect,
  Principal Security Architect
- **Phase:** 6 closure, resolving **DR-041**
- **Affects:** `src/app/gateway.ts` (new); `src/app/index.ts`; `scripts/security/demo-api.ts`;
  `tests/authz/gateway.test.ts`
- **Does NOT affect:** ADR-0006, which remains `Proposed`. **DR-029 remains closed.**

---

## Context

Phase 6 delivered components built to receive interaction as **view-model changes** — sort state is a
column field, filter selection is a filter field, scope is a selector field. Nothing dispatches those
changes. DR-041 recorded the gap and marked it a Phase 7 blocker.

Phase 7 needs sorting, filtering, scope and period selection, drill-down, evidence disclosure,
navigation and pagination. The obvious way to get them is an HTTP server, and that is the trap:

> **ADR-0006 (BFF and transport) is `Proposed`.** `ARCHITECTURE_DECISIONS.md` §2 forbids code
> depending on a `Proposed` ADR. And the moment a transport exists, **DR-029's entire security
> obligation activates** — TLS, HSTS, CSRF, CORS, cookie attributes — every one of which is currently
> `DECLARED / NOT YET ENFORCED` in the control matrix.

A dashboard would have created a security surface as a side effect. That is precisely the failure the
Phase 5 closure spent a phase making impossible to do by accident, and it must not be undone by a
sprint that needed a click to work.

---

## Decision

### D-1 — Three kinds of interaction, only one of which could need a network

| Kind | Examples | Owner | Needs transport? |
| --- | --- | --- | --- |
| **Presentation state** | expanded disclosure, focused row, open tab, in-flight control state | The browser | **No** |
| **Application query** | "projects in this scope, ranked by priority, page 2" | `ApplicationGateway` | Not necessarily |
| **Application command** | "apply this RAG override" | `ApplicationGateway` | Not necessarily |

The top row is the majority of what a dashboard feels like, and it needs nothing from this ADR: it is
already served by native HTML. Phase 6's evidence drawer is `<details>`/`<summary>` — keyboard
operable, screen-reader announced and printable with no script at all.

The other two rows carry authorization, and they are what the gateway exists to keep honest.

### D-2 — `ApplicationGateway`: one interface, one method, two possible implementations

```ts
interface ApplicationGateway {
  readonly kind: 'IN_PROCESS' | 'HTTP';
  request(ctx: RequestContext, request: ViewRequest): Promise<ApiResponse>;
}
```

A surface names a **view** and a **page** of it. It cannot express a field selector, an order-by, a
predicate or a raw identifier list — a caller that can shape a query can eventually shape one you did
not intend. `VIEW_ROUTES` is a closed table; an unlisted view is not requestable, which is REQ-SEC-005
deny-by-default applied to reads.

Every request goes through `Dispatcher` → `EnforcementPoint`: session, RBAC, ABAC, object-level check,
field shaping, audit — same path, same order, **whichever implementation is installed**.

### D-3 — The POC ships the in-process implementation. No transport is introduced.

`InProcessGateway` calls the same `Dispatcher` the adversarial suite attacks. Nothing is
short-circuited because the caller happens to share a process.

**DR-029 is therefore untouched, and ADR-0006 stays `Proposed`.** When ADR-0006 is accepted, an
`HttpApplicationGateway` implements the same interface, `kind` becomes `'HTTP'`, and **no Phase 7 code
changes** — because Phase 7 was never allowed to know which one it had.

This is asserted rather than asserted-in-prose. `tests/authz/gateway.test.ts` fails if:

- any HTTP server package (`express`, `fastify`, `koa`, `next`, `hapi`, `hono`, `@nestjs/core`) enters
  `package.json`;
- any file under `src/` imports `node:http`/`node:https`/`node:net`, calls `fetch`, or calls
  `createServer`/`.listen`;
- `ADR-0006` stops saying `Proposed`.

### D-4 — Client-side re-arrangement is permitted only over an already-authorised set

Sorting and filtering **within data the server already returned** is presentation, not authorization:
the rows were authorised and shaped before they left the Application layer, and re-ordering them
discloses nothing new. What is forbidden is a client that filters *the page it happened to be given*
and presents the result as the whole answer — on a ranked portfolio that is a wrong answer delivered
confidently.

So `SortIntent` and `FilterIntent` travel to the gateway as **intent**, and the service decides
whether it can honour them. A Phase 7 screen that wants a fully sorted portfolio asks for one; it does
not sort a hundred rows locally and call it the ranking.

### D-5 — Routing and state ownership

- **Routing:** none. Navigation destinations are `href`s; the POC has no client router, and adding
  one would need this ADR revisited.
- **State ownership:** presentation state lives in the component tree. **No application data is
  cached client-side across a scope or period change** — a stale authorised set surviving a scope
  change is the shape of a data leak, even when every individual response was correctly authorised.

---

## Consequences

**Positive**

- Phase 7 has a real, typed contract to build against, and it is the same contract an HTTP transport
  would satisfy.
- No transport, so DR-029 stays closed and the Phase 5 security posture is preserved intact.
- The interaction boundary is now testable in the direction that matters: "no authorization decision
  in React" and "no network dependency" are assertions, not intentions.

**Negative**

- **Phase 7 still cannot demonstrate a live click-to-load in a browser.** The gateway makes
  interaction *expressible and correct*; it does not make it *interactive*. AC-1 counts interactions,
  so Phase 7 must either pre-render the small number of states an AC-1 demo traverses, or accept that
  the demo is narrated rather than driven. **This is the residual half of DR-041 and it is recorded
  as DR-044** — not closed, not hidden.
- An in-process gateway is easy to mistake for "we have an API". The `kind` field exists so that a
  surface, a test or a reviewer can always tell.

**Neutral**

- Adding client hydration later is additive: it changes how `ApplicationGateway` is called, not what
  it is.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Add Express/Fastify now** | Implements a `Proposed` ADR and activates DR-029's full obligation as a side effect of building a dashboard. The exact failure this ADR exists to prevent |
| **Next.js server components / API routes** | A transport with better ergonomics and the same consequence, plus a framework opinion about routing and data fetching that competes with ADR-0006 before it is decided |
| **Client-side state library over a bundled data dump** | Ships the authorised set to the browser and re-derives views there. Works right up until someone filters on a field the server withheld, at which point the shaping boundary has moved into React |
| **Call use cases directly from components** | Fastest, and it is `PRODUCT_SPEC.md` §8 anti-requirement 4 in a different costume. It would put presentation on the wrong side of the trust boundary |
| **Leave DR-041 open and let Phase 7 decide** | The decision would then be taken under delivery pressure by whoever hit the problem first, which is how a transport arrives without an ADR |

## Rollback

Delete `src/app/gateway.ts` and its export; the demo composition root loses `gateway` and Phase 7
returns to having no interaction contract. Nothing else depends on it, because nothing else may.
