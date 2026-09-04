import { generatePortfolio } from '../generator/index.js';
import { commandCenterProject } from '../assessment/command-center-adapter.js';

const p = generatePortfolio();
const cc = commandCenterProject(p, 'prj-024') as unknown as Record<string, unknown>;
console.log('--- top-level keys ---', Object.keys(cc).join(', '));
const walk = (o: unknown, path: string, depth: number): void => {
  if (depth > 3 || o === null || typeof o !== 'object') return;
  const rec = o as Record<string, unknown>;
  if ('metricId' in rec) {
    console.log(`  ${path.padEnd(46)} ${String(rec['value'])} ${String(rec['adverseState'] ?? '')} ${String(rec['notComputableReason'] ?? '')}`);
    return;
  }
  for (const [k, v] of Object.entries(rec)) walk(v, path === '' ? k : `${path}.${k}`, depth + 1);
};
walk(cc, '', 0);
const spec = p.structure.projects.find((s) => s.projectId === 'prj-024');
console.log('--- spec ---');
console.log('  baselineCompletion', spec?.baselineCompletionDate ?? '(n/a)');
console.log('  asOf              ', p.asOf);
const claims = p.facts.progressClaims.filter((r) => r.projectId === 'prj-024');
console.log('--- progress claims (last 10 of', claims.length, ') ---');
for (const c of claims.slice(-10)) console.log('   ', c.week, c.physicalCompletion);
