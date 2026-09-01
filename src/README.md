# Source layout

Structure is defined by [ADR-0001](../docs/adr/ADR-0001-poc-architecture.md) and
[`ARCHITECTURE_DECISIONS.md` §4](../ARCHITECTURE_DECISIONS.md). Phase 1 populated it with the
layering skeleton, public surfaces, and platform contracts. **No domain logic exists yet** — Phase 2
lands the canonical model, Phase 4 the engines.

```
src/
├── presentation/   SHELL only. May import @app and nothing else.
├── app/            Application layer. The authorization enforcement point (ADR-0005).
│                   Single public surface: `@app` → src/app/index.ts
├── contexts/       19 bounded contexts. Each exposes `index.ts`: types + service interfaces.
│                   Everything below it is internal and unreachable from outside.
└── platform/       decimal (Money) · time (Clock) · provenance (envelope) ·
                    authz · audit · persistence · config. No business logic.
```

## Import rules — enforced, not advisory

The only legal cross-unit import forms are the aliases:

| From | May import | Violation if not |
| --- | --- | --- |
| `presentation` | `@app` exactly | `ARCH-001` / `ARCH-002` |
| `app` | `@contexts/<name>`, `@platform/<name>` | `ARCH-001` |
| `contexts/<c>` | `@platform/<name>`, plus the contexts declared in the manifest | `ARCH-001` / `ARCH-003` |
| `platform/<m>` | the platform modules declared in the manifest | `ARCH-011` |

`ai-intelligence` may import **no** context (`ARCH-004`). `rules` may import **no** context
(`ARCH-005`). `decimal.js` is confined to `platform/decimal` (`ARCH-006`). Cycles are build failures
(`ARCH-007`).

The rules live in [`architecture/manifest.json`](../architecture/manifest.json); run them with
`npm run check:architecture`. Full explanation:
[`docs/architecture/MODULE-MAP.md`](../docs/architecture/MODULE-MAP.md).

## Implementation state

Every context and platform module exports an `IMPLEMENTATION_STATE` constant naming its state and
target phase. `DEFINITION_OF_DONE.md` §2 governs the vocabulary — a `STUB` says so in the code, not
only in a report.
