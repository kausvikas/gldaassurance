/**
 * Walks the source tree and applies the rules in `ruleset.mjs`.
 *
 * Used by three callers so there is exactly one implementation of the gate:
 *   - `architecture/check.mjs`                       (CI / `npm run check:architecture`)
 *   - `tests/integration/architecture.boundaries.test.ts`
 *   - `architecture/eslint-plugin-boundaries.mjs`    (editor feedback, import rules only)
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  REPO_ROOT,
  manifest,
  classifyFile,
  evaluateImport,
  evaluateManifestConsistency,
  resolveSpecifier,
  VIOLATION,
} from './ruleset.mjs';

const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

export function listSourceFiles(root = join(REPO_ROOT, 'src')) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (SOURCE_EXT.test(entry)) out.push(relative(REPO_ROOT, full).split('\\').join('/'));
    }
  };
  walk(root);
  return out.sort();
}

/** Strip comments and template/quoted literals that could contain false positives. */
export function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

const IMPORT_PATTERNS = [
  /\bimport\s+(?:type\s+)?[^'"();]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^'"();]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

export function extractImports(source) {
  const code = stripNonCode(source);
  const found = new Set();
  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) found.add(m[1]);
  }
  return [...found];
}

function checkPublicSurfaces() {
  const out = [];
  const check = (layerKey, units) => {
    const dir = manifest.layers[layerKey].dir;
    for (const unit of Object.keys(units)) {
      const surface = join(REPO_ROOT, dir, unit, 'index.ts');
      if (!existsSync(surface)) {
        out.push({
          file: `${dir}/${unit}`,
          code: VIOLATION.MISSING_PUBLIC_SURFACE,
          message: `Declared unit "${unit}" has no public surface at ${dir}/${unit}/index.ts. A named empty context is a decision; a missing one is an omission.`,
          authority: 'ADR-0001 §Decision 4 and §Consequences',
        });
      }
    }
  };
  check('contexts', manifest.contexts);
  check('platform', manifest.platformModules);
  return out;
}

function checkSourceGates(files, contents) {
  const out = [];
  for (const gate of manifest.sourceGates) {
    if (!gate.appliesTo.length) continue;
    const re = new RegExp(gate.pattern, 'g');
    for (const file of files) {
      if (!gate.appliesTo.some((prefix) => file.startsWith(prefix))) continue;
      if (gate.exempt.some((prefix) => file.startsWith(prefix))) continue;
      const code = stripNonCode(contents.get(file));
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        const line = code.slice(0, m.index).split('\n').length;
        out.push({
          file,
          line,
          code: VIOLATION.SOURCE_GATE,
          gate: gate.id,
          message: `${gate.id}: ${gate.description} Found: "${m[0].trim()}".`,
          authority: gate.authority,
        });
      }
    }
  }
  return out;
}

function detectCycles(edges) {
  // edges: Map<node, Set<node>>. Returns array of cycles as node arrays.
  const cycles = [];
  const state = new Map();
  const stack = [];
  const visit = (node) => {
    state.set(node, 'open');
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (!edges.has(next)) continue;
      if (state.get(next) === 'open') {
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, 'closed');
  };
  for (const node of edges.keys()) if (!state.has(node)) visit(node);
  return cycles;
}

export function analyze() {
  const files = listSourceFiles();
  const contents = new Map(
    files.map((f) => [f, readFileSync(join(REPO_ROOT, f), 'utf8')]),
  );

  const violations = [
    ...evaluateManifestConsistency(),
    ...checkPublicSurfaces(),
  ];

  const fileEdges = new Map();
  const unitEdges = new Map();

  for (const file of files) {
    const source = classifyFile(file);
    const unitKey = source ? `${source.layer}${source.unit ? `/${source.unit}` : ''}` : null;
    if (unitKey && !unitEdges.has(unitKey)) unitEdges.set(unitKey, new Set());
    if (!fileEdges.has(file)) fileEdges.set(file, new Set());

    for (const spec of extractImports(contents.get(file))) {
      violations.push(...evaluateImport(file, spec));

      const target = resolveSpecifier(file, spec);
      if (target.kind !== 'internal') continue;
      const targetUnitKey = `${target.layer}${target.unit ? `/${target.unit}` : ''}`;
      if (unitKey && targetUnitKey !== unitKey) {
        unitEdges.get(unitKey).add(targetUnitKey);
      }
      if (target.relative && target.path) {
        for (const candidate of [`${target.path}.ts`, `${target.path}/index.ts`, target.path]) {
          if (contents.has(candidate)) {
            fileEdges.get(file).add(candidate);
            break;
          }
        }
      }
    }
  }

  for (const cycle of [...detectCycles(unitEdges), ...detectCycles(fileEdges)]) {
    violations.push({
      file: cycle[0],
      code: VIOLATION.CYCLE,
      message: `Dependency cycle: ${cycle.join(' -> ')}.`,
      authority: 'ARCHITECTURE_DECISIONS.md §4.1 rule 7',
    });
  }

  violations.push(...checkSourceGates(files, contents));

  return {
    filesScanned: files.length,
    contextsDeclared: Object.keys(manifest.contexts).length,
    platformModulesDeclared: Object.keys(manifest.platformModules).length,
    violations,
  };
}
