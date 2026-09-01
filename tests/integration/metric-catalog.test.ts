/**
 * `METRIC_CATALOG.md` is generated from the metric registry, and this is what stops the two
 * diverging.
 *
 * The catalog is the artifact a controller reads and the registry is the artifact the code reads.
 * If they can disagree, one of them is wrong and nobody finds out until Phase 9. Here they are the
 * same artifact seen twice, and any edit to either that is not mirrored in the other fails the
 * build.
 *
 * Regenerate with `npm run catalog:generate`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  METRIC_REGISTRY,
  METRIC_VERSION_HISTORY,
  PHASE_2_DEFINITION_REFINEMENTS,
  validateRegistry,
} from '@contexts/rules';
import { renderCatalog } from '../../scripts/catalog/render-catalog.js';

const CATALOG = join(import.meta.dirname, '..', '..', 'METRIC_CATALOG.md');

const rendered = (): string =>
  renderCatalog(METRIC_REGISTRY, METRIC_VERSION_HISTORY, PHASE_2_DEFINITION_REFINEMENTS);

describe('METRIC_CATALOG.md is generated and cannot silently diverge', () => {
  if (process.env['METRIC_CATALOG_UPDATE'] === '1') {
    it('regenerates the catalog', () => {
      writeFileSync(CATALOG, rendered(), 'utf8');
      expect(readFileSync(CATALOG, 'utf8')).toBe(rendered());
    });
    return;
  }

  it('matches the registry byte for byte', () => {
    const onDisk = readFileSync(CATALOG, 'utf8');
    expect(
      onDisk,
      'METRIC_CATALOG.md is out of date. Run `npm run catalog:generate`. ' +
        'If you edited the document by hand, edit the registry instead — the document is generated.',
    ).toBe(rendered());
  });

  it('documents every registered metric', () => {
    const onDisk = readFileSync(CATALOG, 'utf8');
    for (const m of METRIC_REGISTRY) {
      expect(onDisk, `${m.id} is registered but absent from the catalog`).toContain(m.id);
    }
  });

  it('carries no violations into the published document', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('states plainly that the catalog is not yet frozen', () => {
    const onDisk = readFileSync(CATALOG, 'utf8');
    expect(onDisk).toContain('Not yet fully `Frozen`');
    const draft = METRIC_REGISTRY.filter((m) => m.status === 'Draft');
    expect(draft.length).toBeGreaterThan(0);
    expect(onDisk).toContain(`${draft.length} of ${METRIC_REGISTRY.length} metrics remain`);
    expect(onDisk).toContain('cannot be declared `Frozen` while any of these is open');
  });
});
