import { generatePortfolio } from '../generator/index.js';
import { projectExecutiveHealthFor } from '../assessment/project-health-adapter.js';

const p = generatePortfolio();
const ids = p.structure.projects.filter((s) => s.engagementModel === 'FIXED_BID').map((s) => s.projectId);
for (const id of ids) {
  const h = projectExecutiveHealthFor(p, id) as unknown as {
    progressBurn: { plannedCompletion: string; actualCompletion: string; costConsumed: string; narrative: string };
    summary: { cause: string };
  };
  const pb = h.progressBurn;
  const m = /([\d.]+)× the delivery rate/.exec(h.summary.cause + ' ' + pb.narrative);
  if (m && pb.actualCompletion.startsWith('1.')) {
    console.log(id);
    console.log('  planned  ', pb.plannedCompletion);
    console.log('  actual   ', pb.actualCompletion);
    console.log('  cost     ', pb.costConsumed);
    console.log('  ratio    ', m[1] + '×');
    console.log('  narrative', pb.narrative);
    console.log('  cause    ', h.summary.cause);
    break;
  }
}
