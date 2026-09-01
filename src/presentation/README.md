# Presentation layer

**Untrusted. Renders; never decides.** (`ARCHITECTURE_DECISIONS.md` §4, `SECURITY_MODEL.md` §2 B1.)

Phase 1 delivers a layering shell only — no components, no design system, no dashboards
(`PHASE_HANDOFF.md` §3.3). The design system lands in Phase 6 and the six executive surfaces in
Phases 7–11.

What is already enforced here, mechanically, by `architecture/manifest.json`:

| Rule | Violation code |
| --- | --- |
| The only permitted import is `@app` | `ARCH-001` |
| Reaching past `@app` into a use case, a context, or platform | `ARCH-002` |
| Any external package | `ARCH-006` |
| Colour literals instead of design tokens (`REQ-UX-001`) | `ARCH-008` / `G-COLOUR` |

What it must never do: compute a metric, compute money, or enforce authorization. UI hiding is
never an access control (global invariant 7).
