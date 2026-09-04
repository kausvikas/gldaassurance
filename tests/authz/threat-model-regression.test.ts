/**
 * Threat-model regression.
 *
 * A threat model is a document, and documents rot. These tests bind it to the code in the two
 * directions that matter: every threat marked `MITIGATED` must name evidence, and the specific
 * mechanisms the model claims must still exist.
 *
 * The point is not to re-test the controls — the suites above do that. It is to make the *claim*
 * falsifiable, so that deleting a control makes the threat model fail rather than merely become
 * untrue.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALL_CAPABILITIES, CAPABILITY_MATRIX, CLASSIFICATION_MATRIX,
} from '@platform/authz';
import { ROUTES, SECURITY_HEADERS } from '@app';
import { REDACTED_KEY_PATTERNS } from '@platform/observability';

const threatModel = readFileSync('docs/THREAT_MODEL.md', 'utf8');
const debtRegister = readFileSync('docs/SECURITY_DEBT_REGISTER.md', 'utf8');
const controlMatrix = readFileSync('docs/SECURITY_CONTROL_MATRIX.md', 'utf8');
const handoff = readFileSync('PHASE_HANDOFF.md', 'utf8');
const securityModel = readFileSync('SECURITY_MODEL.md', 'utf8');

/**
 * Every `DR-nnn` mentioned anywhere in a document.
 *
 * The lookbehind is load-bearing. Without it, `ADR-0031` matches as `DR-003`, and the four phantom
 * ids `DR-000`…`DR-003` were produced by ADR citations rather than by debt references. They passed
 * only because the register happens to cite `ADR-000x` and `ADR-002x` somewhere — the control was
 * satisfied by coincidence rather than by the property it claims to test, which also means a
 * genuinely missing `DR-nnn` could have been excused by an unrelated ADR number sharing its digits.
 * Found at Phase 11A, when ADR-0030/0031 produced a `DR-003` no ADR citation happened to cover.
 */
const drsIn = (text: string): Set<string> =>
  new Set((text.match(/(?<!A)DR-\d{3}/g) ?? []));

/** The gate vocabulary §1 of the register declares. Anything else is an ungoverned label. */
const GATE_VOCABULARY = [
  'PHASE_6_BLOCKER', 'PHASE_7_BLOCKER', 'PHASE_8_BLOCKER', 'PHASE_9_BLOCKER',
  'PHASE_10_BLOCKER', 'PHASE_11_BLOCKER', 'PHASE_12_BLOCKER', 'EXECUTIVE_DEMO_BLOCKER',
  'PRODUCTION_BLOCKER', 'ACCEPTED_DEBT',
] as const;
const manifest = JSON.parse(readFileSync('architecture/manifest.json', 'utf8')) as {
  sourceGates: { id: string; pattern: string; appliesTo: string[] }[];
};

describe('the threat model stays bound to the code', () => {
  it('names evidence for every threat it claims is MITIGATED', () => {
    const rows = threatModel
      .split('\n')
      .filter((l) => l.startsWith('| T-') && l.includes('`MITIGATED`'));
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      const evidence = cells.at(-2) ?? '';
      expect(evidence.length, `${cells[1]} claims MITIGATED with no evidence`).toBeGreaterThan(3);
      expect(evidence, `${cells[1]} evidence is a dash`).not.toBe('—');
    }
  });

  it('covers every STRIDE category', () => {
    for (const category of [
      'Spoofing', 'Tampering', 'Repudiation', 'Information disclosure',
      'Denial of service', 'Elevation',
    ]) {
      expect(threatModel, category).toContain(category);
    }
  });

  it('covers every surface the phase brief names', () => {
    for (const surface of ['Web / UI', 'API surface', 'Database', 'Ingestion', 'Admin and rules', 'Exports', 'AI assistant']) {
      expect(threatModel, surface).toContain(surface);
    }
  });
});

describe('T-API-2 — the G-EXEC gate exists and covers all source', () => {
  it('is declared in the manifest over src', () => {
    const gate = manifest.sourceGates.find((g) => g.id === 'G-EXEC');
    expect(gate).toBeDefined();
    expect(gate?.appliesTo).toContain('src');
  });

  it('matches the constructs it claims to ban', () => {
    const gate = manifest.sourceGates.find((g) => g.id === 'G-EXEC');
    const pattern = new RegExp(gate?.pattern as string);
    for (const snippet of [
      'eval(userInput)',
      'new Function("return 1")',
      "import cp from 'node:child_process'",
      "require('vm')",
    ]) {
      expect(pattern.test(snippet), snippet).toBe(true);
    }
  });

  it('does not match ordinary code', () => {
    const gate = manifest.sourceGates.find((g) => g.id === 'G-EXEC');
    const pattern = new RegExp(gate?.pattern as string);
    for (const snippet of ['evaluateRules(x)', 'const evaluation = 1', 'functionName()']) {
      expect(pattern.test(snippet), snippet).toBe(false);
    }
  });
});

describe('T-EXP-1 — there is no export path that bypasses shaping', () => {
  it('declares no export route', () => {
    for (const route of ROUTES) {
      expect(route.path, route.path).not.toMatch(/export|download|csv|xlsx|report\.pdf/i);
    }
  });
});

describe('T-ADM-2 — SECURITY_ADMIN holds no business capability or classification', () => {
  it('appears in no business capability row', () => {
    const business = ALL_CAPABILITIES.filter(
      (c) => !c.startsWith('audit.') && !c.startsWith('identity.'));
    for (const capability of business) {
      expect(CAPABILITY_MATRIX[capability], capability).not.toContain('SECURITY_ADMIN');
    }
  });

  it('appears in no classification row', () => {
    for (const [classification, roles] of Object.entries(CLASSIFICATION_MATRIX)) {
      expect(roles, classification).not.toContain('SECURITY_ADMIN');
    }
  });
});

describe('T-X-1 — telemetry redaction covers the asset classes SECURITY_MODEL §1 names', () => {
  it('redacts money, rates, margin and identity by key', () => {
    for (const term of ['cost', 'rate', 'margin', 'revenue', 'salary', 'name', 'token', 'secret']) {
      expect(REDACTED_KEY_PATTERNS, term).toContain(term);
    }
  });
});

describe('T-UI-2 / T-UI-4 — transport configuration has not been weakened', () => {
  it('keeps the CSP restrictive', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy'] as string;
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).not.toMatch(/unsafe-|\bdata:\s*;?\s*script/);
  });

  it('keeps every declared header present', () => {
    // The set is asserted by name so removing one is a test failure, not a silent regression.
    expect(Object.keys(SECURITY_HEADERS).sort()).toEqual([
      'Cache-Control',
      'Content-Security-Policy',
      'Cross-Origin-Opener-Policy',
      'Cross-Origin-Resource-Policy',
      'Permissions-Policy',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
    ]);
  });
});

/**
 * Governance consistency — the documents must agree with each other, not merely each be plausible.
 *
 * A debt item that appears in the handoff and not in the register has no owning gate and no closure
 * evidence, which means nobody can say what "done" looks like for it. A DR cited by the threat model
 * but absent from the register is a mitigation pointing at nothing. Both are the kind of drift that
 * is invisible in review and obvious six months later, so they are assertions rather than habits.
 */
describe('debt is governed, not merely listed', () => {
  it('gives every DR named in the handoff an entry in the debt register', () => {
    for (const dr of drsIn(handoff)) {
      expect(debtRegister, `${dr} is in PHASE_HANDOFF but not in the debt register`).toContain(dr);
    }
  });

  it('uses only the declared gate vocabulary', () => {
    // Every ALL_CAPS_BLOCKER-shaped token in the register must be a declared gate.
    const tokens = debtRegister.match(/`(?:[A-Z0-9_]+)`/g) ?? [];
    const gateShaped = tokens
      .map((t) => t.replace(/`/g, ''))
      .filter((t) => t.endsWith('_BLOCKER') || t === 'ACCEPTED_DEBT');
    expect(gateShaped.length).toBeGreaterThan(20);
    for (const token of new Set(gateShaped)) {
      expect(GATE_VOCABULARY, `${token} is not a declared gate`).toContain(token);
    }
  });

  it('gives every open DR a gate and a next-phase blocking verdict', () => {
    // The index table in PHASE_HANDOFF §3 carries both columns for every row. The verdict may be
    // emphasised or qualified ("**Yes**", "No — but see DR-041"), but it must *start* with a plain
    // Yes or No: a reader scanning the column has to get an answer, not a paragraph.
    const rows = handoff
      .split('\n')
      .filter((l) => /^\| \*{0,2}DR-\d{3}/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      const gate = cells.at(-3) ?? '';
      const blocks = (cells.at(-2) ?? '').replace(/\*/g, '');
      expect(gate, `${cells[1]} has no target gate`).toMatch(/_BLOCKER|ACCEPTED_DEBT/);
      expect(blocks, `${cells[1]} has no next-phase blocking verdict`).toMatch(/^(Yes|No)\b/);
    }
  });

  it('does not cite a DR that the register does not carry', () => {
    for (const source of [threatModel, controlMatrix, securityModel]) {
      for (const dr of drsIn(source)) {
        expect(debtRegister, `${dr} is cited but is not in the debt register`).toContain(dr);
      }
    }
  });
});

describe('the required-coverage table points at threats that exist', () => {
  it('names only threat ids the model declares', () => {
    const declared = new Set(
      (threatModel.match(/^\| (T-[A-Z]+-\d+)/gm) ?? []).map((m) => m.replace('| ', '')),
    );
    expect(declared.size).toBeGreaterThan(40);
    const coverage = threatModel.split('## 13. Required coverage')[1] ?? '';
    expect(coverage.length).toBeGreaterThan(500);
    for (const cited of new Set(coverage.match(/T-[A-Z]+-\d+/g) ?? [])) {
      expect(declared, `coverage table cites ${cited}, which is not declared`).toContain(cited);
    }
  });

  it('covers all twenty topics the closure requires', () => {
    const coverage = threatModel.split('## 13. Required coverage')[1] ?? '';
    const rows = coverage.split('\n').filter((l) => /^\| \d+ \|/.test(l));
    expect(rows.length).toBe(20);
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      expect(cells[3], `topic "${cells[2]}" names no threat`).toMatch(/T-[A-Z]+-\d+/);
      expect(cells[4], `topic "${cells[2]}" has no state`).not.toBe('');
    }
  });
});

describe('T-X-7 / T-X-8 — the security-telemetry grant stays narrow', () => {
  it('keeps PERSONAL_DATA granted to nobody, so C-14 was not closed by widening it', () => {
    expect(CLASSIFICATION_MATRIX.PERSONAL_DATA).toEqual([]);
  });

  it('grants SECURITY_TELEMETRY to exactly one role', () => {
    expect(CLASSIFICATION_MATRIX.SECURITY_TELEMETRY).toEqual(['ASSURANCE_AUDITOR']);
  });

  it('redacts security-telemetry keys from observability', () => {
    for (const term of ['sourceip', 'useragent', 'sessionid']) {
      expect(REDACTED_KEY_PATTERNS, term).toContain(term);
    }
  });
});

/**
 * Governance coherence of `PHASE_HANDOFF.md`.
 *
 * The handoff is rewritten wholesale every phase, which is the moment a merge leaves two phases'
 * text interleaved — duplicate headings, a stale "current state", two competing "read this before"
 * sections, the same debt row twice, contradictory test counts. Every one of those is invisible in a
 * diff and misleading to the next phase, which reads this file first.
 *
 * These assertions are cheap and they are the difference between a handoff that describes one
 * coherent state and one that describes two.
 */
describe('PHASE_HANDOFF describes exactly one current state', () => {
  const lines = handoff.split('\n');
  const headings = lines.filter((l) => l.startsWith('#'));

  it('repeats no heading', () => {
    const seen = new Map<string, number>();
    for (const h of headings) seen.set(h, (seen.get(h) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([h]) => h)).toEqual([]);
  });

  it('names one phase as current, not two', () => {
    const current = lines.filter((l) => l.startsWith('**Current state:**'));
    expect(current).toHaveLength(1);
  });

  it('carries exactly one "read this before" section, pointing at the next phase', () => {
    const readBefore = headings.filter((h) => /Read this before/i.test(h));
    expect(readBefore).toHaveLength(1);
    const nextPhase = /Phase (\d+)/.exec(readBefore[0] ?? '')?.[1];
    expect(nextPhase, 'the read-before section must name a phase').toBeDefined();
  });

  it('lists every debt item exactly once', () => {
    const rows = lines
      .filter((l) => /^\| \*{0,2}DR-\d{3}/.test(l))
      .map((l) => /DR-\d{3}/.exec(l)?.[0] ?? '');
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('lists every open question exactly once', () => {
    const rows = lines
      .filter((l) => /^\| ~?~?\*{0,2}(MC-\d|C-\d+|OQ-\d|DQ-\d)/.test(l))
      .map((l) => /(MC-\d+|C-\d+|OQ-\d+|DQ-\d+)/.exec(l)?.[0] ?? '');
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('quotes one test total, not several', () => {
    const totals = new Set(
      [...handoff.matchAll(/\b(\d{3,4}) (?:tests? pass|passed)/g)].map((m) => m[1]),
    );
    expect([...totals], 'contradictory test counts in the handoff').toHaveLength(1);
  });

  it('states a blocking verdict against the phase it is handing off to', () => {
    const header = lines.find((l) => l.startsWith('**Current state:**')) ?? '';
    const next = /Phase (\d+) not started|Phase (\d+) may begin/.exec(header);
    expect(next, 'the header must say which phase is next').not.toBeNull();
  });
});

describe('ADR status is consistent across the index, the files and the code', () => {
  const index = readFileSync('docs/adr/README.md', 'utf8');

  it('gives every ADR file a row in the index, with a matching status', () => {
    const files = readdirSync('docs/adr')
      .filter((f) => /^ADR-\d{4}-/.test(f))
      .sort();
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) {
      const id = /^ADR-(\d{4})/.exec(file)?.[1] as string;
      const row = index.split('\n').find((l) => l.startsWith(`| [${id}]`));
      expect(row, `${file} has no row in docs/adr/README.md`).toBeDefined();

      const body = readFileSync(`docs/adr/${file}`, 'utf8');
      const declared = /\*\*Status:\*\*\s*\**\s*([A-Za-z]+)/.exec(body)?.[1]?.toUpperCase();
      // Three states, not two. An ADR that answers several conflicts can have some decisions
      // accepted and others still open — ADR-0015 is exactly that, and collapsing it into either
      // binary would be a lie in one direction or the other: "Proposed" would say the resolved C-7
      // decision is not binding, and "Accepted" would say the open C-9 question is settled.
      // Four states, not two. An ADR whose decision was wrong is **superseded**, not un-accepted:
      // it stays in the record so a reader can see what was believed and why it changed.
      //
      // Read the **status cell**, not the whole row: ADR-0015's title legitimately says
      // "C-8 superseded by 0019", and matching anywhere in the row misread it as superseded itself.
      const cells = (row ?? '').split('|').map((c) => c.trim()).filter((c) => c !== '');
      const statusCell = cells.at(-1) ?? '';
      // And read the **leading token** of that cell: ADR-0015's status is "Partially accepted"
      // and then explains that two of its decisions were superseded by other ADRs. The status is
      // what the cell opens with, not every word it contains.
      const leading = statusCell.replace(/^\*+/, '');
      const indexed = /^Superseded/i.test(leading)
        ? 'SUPERSEDED'
        : /^Partially accepted/i.test(leading)
          ? 'PARTIALLY'
          : (/^Proposed/i.test(leading) ? 'PROPOSED' : 'ACCEPTED');
      expect(declared, `${file} declares ${declared ?? 'nothing'}; the index says ${indexed}`)
        .toBe(indexed);

      // A partially accepted ADR must say which decisions are binding and which are not, or the
      // status is unusable: a reader cannot tell whether the part they depend on is one of them.
      // A superseded ADR must name its replacement, or the record is a dead end.
      if (indexed === 'SUPERSEDED') {
        expect(body, `${file} is superseded but names no replacement`)
          .toMatch(/SUPERSEDED by ADR-\d{4}/);
      }
      if (indexed === 'PARTIALLY') {
        expect(body, `${file} is partially accepted but names no resolved decision`)
          .toMatch(/resolved|superseded/i);
        expect(body, `${file} is partially accepted but names nothing still open`)
          .toMatch(/still open|remains open|open\b/i);
      }
    }
  });

  /*
   * DR-029 was kept closed for eleven phases by keeping ADR-0006 Proposed: no transport, no
   * obligation. ADR-0032 accepts it, which activates the obligation rather than removing it — so
   * this test flips from *"the transport does not exist"* to *"the transport exists and the
   * obligations it activates are discharged in a named ADR"*. Deleting it would have been the
   * quiet version of the same change.
   */
  it('accepts ADR-0006 only alongside an ADR that discharges DR-029', () => {
    const adr = readFileSync('docs/adr/ADR-0006-api-bff-contract-strategy.md', 'utf8');
    expect(adr).toMatch(/\*\*Status:\*\*\s*\*\*Accepted\*\*/i);
    expect(adr, 'ADR-0006 was accepted without naming what promoted it')
      .toMatch(/ADR-0032/);
    const runtime = readFileSync('docs/adr/ADR-0032-trusted-server-runtime.md', 'utf8');
    expect(runtime).toMatch(/DR-029 is discharged/i);
  });

  it('records the Phase 6 closure decisions as Accepted', () => {
    for (const id of ['0017', '0018', '0019', '0020']) {
      const row = index.split('\n').find((l) => l.startsWith(`| [${id}]`));
      expect(row, `ADR-${id} is missing from the index`).toBeDefined();
      expect(row, `ADR-${id} is not Accepted`).not.toMatch(/Proposed/);
    }
  });
});
