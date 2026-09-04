import { generatePortfolio } from '../generator/index.js';
import { projectExecutiveHealthFor } from '../assessment/project-health-adapter.js';

const p = generatePortfolio();
const ids = p.structure.projects.filter((s) => s.engagementModel === 'FIXED_BID').map((s) => s.projectId);
const rows: { id: string; completion: number; ratio: number; obs: number }[] = [];
for (const id of ids) {
  const h = projectExecutiveHealthFor(p, id) as unknown as {
    progressBurn: { actualCompletion: string };
    summary: { cause: string };
  };
  const m = /([\d.]+)× the delivery rate/.exec(h.summary.cause);
  const claims = p.facts.progressClaims.filter((r) => r.projectId === id);
  const last = claims.at(-1);
  if (!m || last === undefined) continue;
  rows.push({ id, completion: Number(last.physicalCompletion), ratio: Number(m[1]), obs: claims.length });
}
rows.sort((a, b) => a.completion - b.completion);
console.log('projects whose CAUSE cites a required-velocity ratio:', rows.length, 'of', ids.length);
console.log('completion  ratio   obs   project');
for (const r of rows.slice(0, 8)) console.log(`  ${(r.completion * 100).toFixed(1).padStart(5)}%  ${r.ratio.toFixed(2).padStart(6)}×  ${String(r.obs).padStart(3)}   ${r.id}`);
console.log('  ...');
for (const r of rows.slice(-8)) console.log(`  ${(r.completion * 100).toFixed(1).padStart(5)}%  ${r.ratio.toFixed(2).padStart(6)}×  ${String(r.obs).padStart(3)}   ${r.id}`);
const early = rows.filter((r) => r.completion < 0.10);
const late = rows.filter((r) => r.completion >= 0.40);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log(`\n  under 10% complete: n=${early.length} mean ratio ${mean(early.map((r) => r.ratio)).toFixed(2)}×`);
console.log(`  over  40% complete: n=${late.length} mean ratio ${mean(late.map((r) => r.ratio)).toFixed(2)}×`);
