/**
 * The provenance envelope — ADR-0004 §1, REQ-UX-004, REQ-DATA-010.
 *
 * "A value without a provenance envelope may not be rendered. This is enforced by type, not
 * by review." These tests cover the runtime half of that: the constructors refuse to produce
 * an envelope that would violate ADR-0004 §2's directional rules.
 */
import { describe, expect, it } from 'vitest';
import {
  ProvenanceError,
  derived,
  inferred,
  observed,
  ruleVersion,
  valueReference,
} from '@platform/provenance';
import { instant } from '@platform/time';

const at = instant('2026-08-31T00:00:00Z');
const source = { context: 'financial', entityType: 'Invoice', entityId: 'INV-001' };

describe('L1 — observed fact', () => {
  it('carries the record it came from', () => {
    const p = observed('4200000.00', source, at);
    expect(p.layer).toBe('L1');
    expect(p.sources).toEqual([source]);
    expect(p.ruleVersion).toBeUndefined();
  });
});

describe('L2 — deterministic derived metric', () => {
  it('stamps the rule version that produced it (REQ-HLTH-005)', () => {
    const p = derived(72, [source], ruleVersion('HEALTH-v1'), at);
    expect(p.layer).toBe('L2');
    expect(p.ruleVersion).toBe('HEALTH-v1');
  });

  it('refuses to exist without naming its inputs (REQ-DATA-010)', () => {
    expect(() => derived(72, [], ruleVersion('HEALTH-v1'), at)).toThrow(ProvenanceError);
  });

  it('rejects a malformed rule version rather than storing an unversioned result', () => {
    expect(() => ruleVersion('health-1')).toThrow(TypeError);
    expect(() => ruleVersion('HEALTH')).toThrow(TypeError);
    expect(ruleVersion('PRIORITY-v2')).toBe('PRIORITY-v2');
  });
});

describe('L3 — inferred intelligence', () => {
  it('may be produced with evidence', () => {
    const p = inferred(0.82, [source], at);
    expect(p.layer).toBe('L3');
  });

  it('cannot be produced without citable evidence (ADR-0004 §2, REQ-AI-002)', () => {
    expect(() => inferred(0.82, [], at)).toThrow(ProvenanceError);
    expect(() => inferred(0.82, [], at)).toThrow(/may not be produced/);
  });

  it('may carry a rule version — deterministic does not mean L2', () => {
    // ADR-0004 §Consequences: "'L3' means *inferred*, not *non-deterministic*."
    const p = inferred(0.82, [source], at, ruleVersion('TRAJECTORY-v1'));
    expect(p.layer).toBe('L3');
    expect(p.ruleVersion).toBe('TRAJECTORY-v1');
  });
});

describe('value references — ADR-0004 §4', () => {
  it('describes a number to resolve rather than a number to print', () => {
    const ref = valueReference('MET-FIN-014', 'Project', 'PRJ-014', at);
    expect(ref.kind).toBe('value-reference');
    expect(ref.metricId).toBe('MET-FIN-014');
    // Deliberately no `value` field: the model cannot express a figure at all.
    expect(Object.keys(ref)).not.toContain('value');
  });
});
