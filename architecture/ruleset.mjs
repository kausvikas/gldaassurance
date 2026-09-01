/**
 * Pure evaluation of the architecture rules declared in `manifest.json`.
 *
 * Authority: ADR-0001 §Decision 3-6, ARCHITECTURE_DECISIONS.md §4.1, ADR-0004 §2.
 * This module has no dependencies so the gate runs on a bare Node install, in CI,
 * and from the ESLint plugin, all against exactly one definition of the rules.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..');

export const manifest = JSON.parse(
  readFileSync(join(HERE, 'manifest.json'), 'utf8'),
);

export const VIOLATION = {
  LAYER_DIRECTION: 'ARCH-001',
  PUBLIC_SURFACE: 'ARCH-002',
  UNDECLARED_CONTEXT_DEP: 'ARCH-003',
  AI_DOMAIN_IMPORT: 'ARCH-004',
  RULES_DEPENDENCY: 'ARCH-005',
  EXTERNAL_PACKAGE: 'ARCH-006',
  CYCLE: 'ARCH-007',
  SOURCE_GATE: 'ARCH-008',
  TIER_INVERSION: 'ARCH-009',
  MISSING_PUBLIC_SURFACE: 'ARCH-010',
  PLATFORM_MODULE_DEP: 'ARCH-011',
};

const ALIAS_TO_LAYER = Object.fromEntries(
  Object.entries(manifest.layers).map(([layer, cfg]) => [cfg.alias, layer]),
);

/** Repo-relative POSIX path -> { layer, unit, rest } or null if outside src. */
export function classifyFile(repoRelPath) {
  const p = repoRelPath.split('\\').join('/');
  for (const [layer, cfg] of Object.entries(manifest.layers)) {
    if (p === cfg.dir || p.startsWith(`${cfg.dir}/`)) {
      const rest = p.slice(cfg.dir.length).replace(/^\//, '');
      const segments = rest ? rest.split('/') : [];
      const unitised = layer === 'contexts' || layer === 'platform';
      return {
        layer,
        unit: unitised ? (segments[0] ?? null) : null,
        rest: unitised ? segments.slice(1).join('/') : rest,
      };
    }
  }
  return null;
}

/**
 * Resolve an import specifier as written in `fromFile` into a target descriptor.
 * `deep` means the specifier reaches past the target's public surface.
 */
export function resolveSpecifier(fromFile, spec) {
  if (spec.startsWith('node:')) return { kind: 'node' };

  if (spec.startsWith('.')) {
    const resolved = posix.normalize(
      posix.join(dirname(fromFile.split('\\').join('/')), spec),
    );
    const target = classifyFile(resolved);
    if (!target) return { kind: 'outside-src', path: resolved };
    const source = classifyFile(fromFile);
    const sameUnit =
      source &&
      source.layer === target.layer &&
      source.unit === target.unit;
    return {
      kind: 'internal',
      layer: target.layer,
      unit: target.unit,
      // A relative import that lands in another unit is by definition deep:
      // the only legal cross-unit form is the alias to the public surface.
      deep: !sameUnit,
      path: resolved,
      relative: true,
    };
  }

  const [head, ...tail] = spec.split('/');
  const layer = ALIAS_TO_LAYER[head];
  if (layer) {
    const unitised = layer === 'contexts' || layer === 'platform';
    if (unitised) {
      return { kind: 'internal', layer, unit: tail[0] ?? null, deep: tail.length > 1 };
    }
    return { kind: 'internal', layer, unit: null, deep: tail.length > 0 };
  }

  return { kind: 'external', package: head.startsWith('@') ? `${head}/${tail[0]}` : head };
}

function contextCfg(id) {
  return manifest.contexts[id];
}

/**
 * Evaluate one import. Returns an array of violations (usually 0 or 1).
 * `fromFile` is repo-relative POSIX.
 */
export function evaluateImport(fromFile, spec) {
  const source = classifyFile(fromFile);
  if (!source) return [];
  const target = resolveSpecifier(fromFile, spec);
  const out = [];
  const at = { file: fromFile, specifier: spec };

  if (target.kind === 'node') {
    if (source.layer !== 'platform') {
      out.push({
        ...at,
        code: VIOLATION.EXTERNAL_PACKAGE,
        message: `Node builtin "${spec}" may only be used in the platform layer. ${source.layer} code must go through a platform contract.`,
        authority: 'ADR-0001 §Decision 5',
      });
    }
    return out;
  }

  if (target.kind === 'external') {
    const allowed = manifest.layers[source.layer].allowedExternal;
    if (!allowed.includes(target.package)) {
      out.push({
        ...at,
        code: VIOLATION.EXTERNAL_PACKAGE,
        message: `External package "${target.package}" is not permitted in the ${source.layer} layer (allowed: ${allowed.length ? allowed.join(', ') : 'none'}).`,
        authority: 'ADR-0001 §Decision 7, ADR-0002 §Decision 1',
      });
    }
    return out;
  }

  if (target.kind === 'outside-src') {
    out.push({
      ...at,
      code: VIOLATION.LAYER_DIRECTION,
      message: `Import escapes src/ to "${target.path}". Source files may not reach into data, scripts, or configuration directly.`,
      authority: 'PRODUCT_SPEC.md §8.2, ADR-0001 §Decision 5',
    });
    return out;
  }

  const sameLayer = source.layer === target.layer;
  const sameUnit = sameLayer && source.unit === target.unit;

  // Rule 1 — layer direction.
  if (!sameLayer && !manifest.layers[source.layer].mayDependOn.includes(target.layer)) {
    out.push({
      ...at,
      code: VIOLATION.LAYER_DIRECTION,
      message: `${source.layer} may not depend on ${target.layer}. Permitted: ${manifest.layers[source.layer].mayDependOn.join(', ') || 'nothing'}.`,
      authority: 'ARCHITECTURE_DECISIONS.md §4.1 rules 1 and 6',
    });
    return out;
  }

  // Rule 2 — public surface. Everything internal to a unit is private to it.
  if (!sameUnit && target.deep) {
    const surface =
      target.layer === 'contexts' || target.layer === 'platform'
        ? `${manifest.layers[target.layer].alias}/${target.unit}`
        : manifest.layers[target.layer].alias;
    out.push({
      ...at,
      code: VIOLATION.PUBLIC_SURFACE,
      message: `Import reaches past the public surface. Import "${surface}" instead; everything below it is internal.`,
      authority: 'ADR-0001 §Decision 4, ARCHITECTURE_DECISIONS.md §4.1 rule 2',
    });
    return out;
  }

  if (sameUnit) return out;

  // Context-to-context rules.
  if (source.layer === 'contexts' && target.layer === 'contexts') {
    const from = contextCfg(source.unit);
    const to = contextCfg(target.unit);
    if (!from || !to) return out;

    if (from.forbidAllContexts) {
      out.push({
        ...at,
        code: VIOLATION.AI_DOMAIN_IMPORT,
        message: `"${source.unit}" may not import any domain context. It declares ports and the Application layer injects authorised implementations.`,
        authority: 'ARCHITECTURE_DECISIONS.md §4.1 rule 4, ADR-0004 §3',
      });
      return out;
    }

    if (source.unit === 'rules') {
      out.push({
        ...at,
        code: VIOLATION.RULES_DEPENDENCY,
        message: `"rules" is depended upon and depends on nothing but platform.`,
        authority: 'ARCHITECTURE_DECISIONS.md §4.1 rule 5',
      });
      return out;
    }

    if (!from.mayDependOn.includes(target.unit)) {
      const upward = to.tier > from.tier;
      out.push({
        ...at,
        code: VIOLATION.UNDECLARED_CONTEXT_DEP,
        message: upward
          ? `"${source.unit}" (tier ${from.tier}) may not depend on "${target.unit}" (tier ${to.tier}). A fact does not know its own score.`
          : `"${source.unit}" does not declare a dependency on "${target.unit}". Declare it in architecture/manifest.json with a justification, or invert it with a port.`,
        authority: upward
          ? 'ARCHITECTURE_DECISIONS.md §4.1 rule 3, ADR-0004 §2'
          : 'ARCHITECTURE_DECISIONS.md §4.1 rule 2',
      });
    }
    return out;
  }

  // Platform module-to-module rules.
  if (source.layer === 'platform' && target.layer === 'platform') {
    const from = manifest.platformModules[source.unit];
    if (from && !from.mayDependOn.includes(target.unit)) {
      out.push({
        ...at,
        code: VIOLATION.PLATFORM_MODULE_DEP,
        message: `platform/${source.unit} does not declare a dependency on platform/${target.unit}.`,
        authority: 'ADR-0001 §Decision 5',
      });
    }
  }

  return out;
}

/** Static self-check: the declared allow-lists must not themselves invert a tier. */
export function evaluateManifestConsistency() {
  const out = [];
  for (const [id, cfg] of Object.entries(manifest.contexts)) {
    for (const dep of cfg.mayDependOn) {
      const to = manifest.contexts[dep];
      if (!to) {
        out.push({
          file: 'architecture/manifest.json',
          code: VIOLATION.UNDECLARED_CONTEXT_DEP,
          message: `"${id}" declares a dependency on unknown context "${dep}".`,
          authority: 'ARCHITECTURE_DECISIONS.md §4.2',
        });
        continue;
      }
      if (to.tier > cfg.tier) {
        out.push({
          file: 'architecture/manifest.json',
          code: VIOLATION.TIER_INVERSION,
          message: `Declared dependency "${id}" (tier ${cfg.tier}) -> "${dep}" (tier ${to.tier}) inverts the tier order.`,
          authority: 'ARCHITECTURE_DECISIONS.md §4.1 rule 3',
        });
      }
    }
  }
  return out;
}
