/**
 * Architecture / boundary suite — the Phase 1 deliverable that must exist *before* domain
 * code does (`PHASE_HANDOFF.md` §3.4, ADR-0001 §Migration implications).
 *
 * Two halves, and both matter:
 *   1. the real tree is clean;
 *   2. the rules actually reject the things they claim to reject. A gate that has never
 *      failed is not a gate — it is a green tick of unknown provenance.
 *
 * Authority: ADR-0001 §Verification, ARCHITECTURE_DECISIONS.md §4.1, TEST_STRATEGY.md §5.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../../architecture/analyze.mjs';
import {
  VIOLATION,
  evaluateImport,
  evaluateManifestConsistency,
  manifest,
} from '../../architecture/ruleset.mjs';

const codesFor = (file: string, spec: string): string[] =>
  evaluateImport(file, spec).map((v: { code: string }) => v.code);

describe('the declared architecture is internally consistent', () => {
  it('declares the nineteen contexts of ADR-0001 plus the evidence plane ADR-0036 added', () => {
    // Nineteen from ADR-0001 §Decision 2, plus `knowledge` (Phase 13). A count assertion is worth
    // keeping precisely because adding a bounded context should be a decision someone had to make
    // twice: once in the manifest, once here.
    expect(Object.keys(manifest.contexts)).toHaveLength(20);
    expect(Object.keys(manifest.contexts)).toContain('knowledge');
  });

  it('contains no tier inversion in its own allow-lists', () => {
    expect(evaluateManifestConsistency()).toEqual([]);
  });

  it('gives every context and platform module a public surface', () => {
    const missing = analyze().violations.filter(
      (v: { code: string }) => v.code === VIOLATION.MISSING_PUBLIC_SURFACE,
    );
    expect(missing).toEqual([]);
  });
});

describe('the source tree obeys it', () => {
  const result = analyze();

  it('scans a non-trivial tree — a passing gate over zero files proves nothing', () => {
    expect(result.filesScanned).toBeGreaterThan(20);
  });

  it('has no violations of any kind', () => {
    expect(result.violations).toEqual([]);
  });
});

describe('rule 1 — dependencies point downward and inward only', () => {
  it('rejects a domain context importing the application layer', () => {
    expect(codesFor('src/contexts/health/scoring.ts', '@app')).toContain(
      VIOLATION.LAYER_DIRECTION,
    );
  });

  it('rejects the platform layer importing a context', () => {
    expect(codesFor('src/platform/decimal/money.ts', '@contexts/financial')).toContain(
      VIOLATION.LAYER_DIRECTION,
    );
  });

  it('rejects the presentation layer importing a context directly', () => {
    expect(codesFor('src/presentation/panel.ts', '@contexts/health')).toContain(
      VIOLATION.LAYER_DIRECTION,
    );
  });

  it('rejects the presentation layer reaching into platform persistence', () => {
    expect(codesFor('src/presentation/panel.ts', '@platform/persistence')).toContain(
      VIOLATION.LAYER_DIRECTION,
    );
  });

  it('rejects any import of the presentation layer (rule 6)', () => {
    expect(codesFor('src/app/dashboard-use-case.ts', '@presentation/panel')).toContain(
      VIOLATION.LAYER_DIRECTION,
    );
  });

  it('rejects an import that escapes src/ into seed data', () => {
    expect(codesFor('src/contexts/project/repo.ts', '../../../data/synthetic/projects.json'))
      .toContain(VIOLATION.LAYER_DIRECTION);
  });

  it('permits the application layer to orchestrate a context', () => {
    expect(codesFor('src/app/portfolio-use-case.ts', '@contexts/portfolio')).toEqual([]);
  });
});

describe('rule 2 — no context imports another context internals', () => {
  it('rejects a deep import past a context public surface', () => {
    expect(codesFor('src/contexts/health/scoring.ts', '@contexts/financial/internal/eac'))
      .toContain(VIOLATION.PUBLIC_SURFACE);
  });

  it('rejects a relative import that tunnels into a sibling context', () => {
    expect(codesFor('src/contexts/health/scoring.ts', '../financial/internal/eac')).toContain(
      VIOLATION.PUBLIC_SURFACE,
    );
  });

  it('rejects a deep import into the application layer from presentation', () => {
    expect(codesFor('src/presentation/panel.ts', '@app/authorization/enforcement')).toContain(
      VIOLATION.PUBLIC_SURFACE,
    );
  });

  it('permits a context to import within itself', () => {
    expect(codesFor('src/contexts/health/scoring.ts', './internal/weights')).toEqual([]);
  });

  it('permits an import of a declared context public surface', () => {
    expect(codesFor('src/contexts/health/scoring.ts', '@contexts/financial')).toEqual([]);
  });
});

describe('rule 3 — a fact does not know its own score', () => {
  it('rejects an L1 fact context importing an L2 context', () => {
    const codes = codesFor('src/contexts/financial/margin.ts', '@contexts/health');
    expect(codes).toContain(VIOLATION.UNDECLARED_CONTEXT_DEP);
  });

  it('names the tier inversion in the message, not just the code', () => {
    const violations = evaluateImport('src/contexts/quality/defects.ts', '@contexts/forecast');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toMatch(/tier 2.*tier 4|does not know its own score/);
  });

  it('rejects an undeclared sideways dependency even between peers', () => {
    expect(codesFor('src/contexts/quality/defects.ts', '@contexts/resource')).toContain(
      VIOLATION.UNDECLARED_CONTEXT_DEP,
    );
  });

  it('permits health to read the six fact domains it is defined over', () => {
    for (const dep of ['financial', 'delivery', 'commercial', 'quality', 'resource', 'risk']) {
      expect(codesFor('src/contexts/health/scoring.ts', `@contexts/${dep}`)).toEqual([]);
    }
  });
});

describe('rule 4 — AI Intelligence has no privileged path to data', () => {
  it.each([
    'financial',
    'health',
    'forecast',
    'contract',
    'commercial',
    'resource',
    'identity',
  ])('rejects ai-intelligence importing %s', (context) => {
    expect(codesFor('src/contexts/ai-intelligence/retrieval.ts', `@contexts/${context}`))
      .toContain(VIOLATION.AI_DOMAIN_IMPORT);
  });

  it('rejects ai-intelligence importing the application layer too — it receives ports', () => {
    expect(codesFor('src/contexts/ai-intelligence/retrieval.ts', '@app')).toContain(
      VIOLATION.LAYER_DIRECTION,
    );
  });

  it('permits ai-intelligence to use platform primitives', () => {
    expect(codesFor('src/contexts/ai-intelligence/retrieval.ts', '@platform/provenance'))
      .toEqual([]);
  });
});

describe('rule 5 — Rules is depended upon and depends on nothing', () => {
  it.each(['financial', 'health', 'delivery'])('rejects rules importing %s', (context) => {
    expect(codesFor('src/contexts/rules/health-v1.ts', `@contexts/${context}`)).toContain(
      VIOLATION.RULES_DEPENDENCY,
    );
  });

  it('permits rules to use platform primitives', () => {
    expect(codesFor('src/contexts/rules/health-v1.ts', '@platform/provenance')).toEqual([]);
  });
});

describe('external dependencies are confined', () => {
  it('rejects decimal.js outside the platform layer — no context touches a raw Decimal', () => {
    expect(codesFor('src/contexts/financial/margin.ts', 'decimal.js')).toContain(
      VIOLATION.EXTERNAL_PACKAGE,
    );
  });

  it('permits decimal.js inside platform/decimal', () => {
    expect(codesFor('src/platform/decimal/money.ts', 'decimal.js')).toEqual([]);
  });

  it('rejects a node builtin in domain code', () => {
    expect(codesFor('src/contexts/integration/loader.ts', 'node:fs')).toContain(
      VIOLATION.EXTERNAL_PACKAGE,
    );
  });

  it('rejects an arbitrary package anywhere in src', () => {
    expect(codesFor('src/app/http.ts', 'express')).toContain(VIOLATION.EXTERNAL_PACKAGE);
  });
});

describe('source gates', () => {
  const gate = (id: string) => {
    const found = manifest.sourceGates.find((g) => g.id === id);
    if (!found) throw new Error(`Source gate "${id}" is not declared in the manifest.`);
    return found;
  };

  it('G-CLOCK covers domain, application and presentation code and exempts platform/time', () => {
    const g = gate('G-CLOCK');
    // Phase 6 extended this to the UI: a component that reads the clock has started to compute,
    // and "as at" is a value the service supplies, never one a screen decides for itself.
    expect(g.appliesTo).toEqual(['src/contexts', 'src/app', 'src/presentation']);
    expect(g.exempt).toEqual(['src/platform/time']);
    expect(new RegExp(g.pattern).test('const t = Date.now();')).toBe(true);
    expect(new RegExp(g.pattern).test('const t = new Date();')).toBe(true);
    expect(new RegExp(g.pattern).test("const t = new Date('2026-08-31');")).toBe(false);
  });

  it('G-ORACLE stops the Phase 3 oracle becoming a Phase 4 production dependency', () => {
    const g = gate('G-ORACLE');
    expect(g.appliesTo).toEqual(['src']);
    const re = new RegExp(g.pattern);
    // Any production import of the generator or its recomputation module is rejected.
    expect(re.test("import { recomputeEconomics } from '../../scripts/generator/validate.js';")).toBe(true);
    expect(re.test("import { mc6Cohort } from '../../../scripts/generator/cohorts.js';")).toBe(true);
    expect(re.test("import { generatePortfolio } from './generator/index.js';")).toBe(true);
    // Ordinary domain imports are untouched.
    expect(re.test("import { Money } from '@platform/decimal';")).toBe(false);
    expect(re.test("import type { RuleExplanation } from '@contexts/rules';")).toBe(false);
  });

  it('G-FLOAT rejects float coercion of amounts in domain, app and presentation code', () => {
    const g = gate('G-FLOAT');
    expect(g.appliesTo).toEqual(['src/contexts', 'src/app', 'src/presentation']);
    expect(new RegExp(g.pattern).test('parseFloat(row.amount)')).toBe(true);
    expect(new RegExp(g.pattern).test('Number(row.amount)')).toBe(true);
    expect(new RegExp(g.pattern).test('money.toDto().amount')).toBe(false);
  });

  it('G-COLOUR exempts the palette and nothing else', () => {
    const g = gate('G-COLOUR');
    expect(g.appliesTo).toEqual(['src/presentation']);
    // Exactly one path. A second exemption is how "tokens only" quietly becomes "tokens mostly".
    expect(g.exempt).toEqual(['src/presentation/tokens/palette.ts']);
    const re = new RegExp(g.pattern);
    expect(re.test("background: '#FF5F2D'")).toBe(true);
    expect(re.test('color: rgba(0,0,0,.4)')).toBe(true);
    expect(re.test('background: var(--gl-action-primary)')).toBe(false);
    expect(re.test('color-mix(in srgb, var(--gl-status-caution) 30%, transparent)')).toBe(false);
  });

  it('G-DEMO is active over presentation and rejects a hand-typed marker', () => {
    const g = gate('G-DEMO');
    expect(g.appliesTo).toEqual(['src/presentation']);
    const re = new RegExp(g.pattern);
    // Every plausible way somebody retypes it instead of importing the constant.
    expect(re.test("const label = 'DEMO — SYNTHETIC DATA';")).toBe(true);
    expect(re.test("const label = 'DEMO - SYNTHETIC DATA';")).toBe(true);
    expect(re.test("<span>DEMO – SYNTHETIC DATA</span>")).toBe(true);
    expect(re.test('import { DEMO_DATA_BANNER } from \'@app\';')).toBe(false);
  });

  it('G-BROWSER keeps the DOM out of domain, application and platform code', () => {
    const g = gate('G-BROWSER');
    expect(g.appliesTo).toEqual(['src/contexts', 'src/app', 'src/platform']);
    const re = new RegExp(g.pattern);
    expect(re.test('document.querySelector(".x")')).toBe(true);
    expect(re.test('localStorage.setItem("k", v)')).toBe(true);
    expect(re.test('window.location.href')).toBe(true);
    // `window` is a domain word here — a rate-limit window, a trajectory window. It must stay usable.
    expect(re.test('const window = this.#windows.get(key); window.count += 1;')).toBe(false);
    expect(re.test('const windowDays = policy.windowMs;')).toBe(false);
  });
});
