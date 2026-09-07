// The corridor / chokepoint layer's fit, and what the named falsifiers do to it (era-1914-1945/corridors-7).
// Prints, per template: the fitted coefficients, every observed transition ranked by the probability the model gave
// it, and the same fit with the falsifier record-years dropped — the test of whether a case the covariate set cannot
// see is distorting the coefficients or merely sitting in the residual.
// Run: node scripts/corridor-fit.mjs [--as-of YEAR] [--case id:year ...]
import { createFitter, loadFitInputs, fitLogistic, predict, auc } from '../lib/fit.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const AS_OF = arg('as-of', null) ? +arg('as-of') : null;
const CASES = process.argv.filter(a => a.includes(':') && !a.startsWith('--')).length
  ? process.argv.filter(a => a.includes(':') && !a.startsWith('--'))
  : ['panama:1915', 'burma_road:1940', 'berlin_baghdad:1896', 'berlin_baghdad:1914', 'berlin_baghdad:1940'];

const f = createFitter(loadFitInputs());
const fitOf = (t, rows) => {
  const stats = {}; const cols = f.encode(t, rows, stats);
  const X = rows.map(r => [1, ...cols.map(c => c.get(r))]), y = rows.map(r => r.y);
  const beta = fitLogistic(X, y, [0, ...cols.map(c => c.prior)]);
  return { cols, beta, p: predict(X, beta), y, rows, stats, X };
};
for (const id of ['chokepoint_status', 'corridor_status']) {
  const t = f.templates.find(x => x.id === id);
  let rows = f.rowsFor(t);
  if (AS_OF != null) rows = rows.filter(r => r.year + (t.lead ?? 0) <= AS_OF);
  const F = fitOf(t, rows);
  const ev = F.y.reduce((a, b) => a + b, 0);
  console.log(`\n${id}  n=${rows.length}  events=${ev}  base=${(ev / rows.length * 100).toFixed(2)}%  AUC(in)=${auc(F.p, F.y)?.toFixed(3)}${AS_OF ? `  [labels ≤ ${AS_OF}]` : ''}`);
  console.log(`  ${F.cols.map((c, j) => `${c.name} ${F.beta[j + 1] >= 0 ? '+' : ''}${F.beta[j + 1].toFixed(2)}`).join('  ')}  intercept ${F.beta[0].toFixed(2)}`);
  // every observed transition, ranked by the probability the model put on it
  const sorted = [...F.p].sort((a, b) => a - b);
  const pct = (x) => sorted.filter(v => v < x).length / sorted.length;
  const evRows = rows.map((r, i) => ({ r, p: F.p[i] })).filter(x => x.r.y).sort((a, b) => b.p - a.p);
  console.log(`  observed transitions, best-predicted first:`);
  for (const { r, p } of evRows) console.log(`    ${String(r.year).padEnd(6)} ${r.unit.padEnd(26)} p=${p.toFixed(4)}  pct=${(pct(p) * 100).toFixed(0)}%  ${Object.entries(r.feats).map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(3) : v}`).join(' ')}`);
  // the named cases, and the fit with them dropped
  const cases = CASES.map(c => c.split(':')).filter(([u, y]) => rows.some(r => r.unit === u && r.year === +y));
  if (!cases.length) continue;
  const keep = rows.filter(r => !cases.some(([u, y]) => r.unit === u && r.year === +y));
  const G = fitOf(t, keep);
  console.log(`  falsifiers dropped (${cases.map(c => c.join(' ')).join(', ')}): n=${keep.length} events=${G.y.reduce((a, b) => a + b, 0)}`);
  console.log(`  ${G.cols.map((c, j) => `${c.name} ${G.beta[j + 1] >= 0 ? '+' : ''}${G.beta[j + 1].toFixed(2)} (${(G.beta[j + 1] - F.beta[j + 1] >= 0 ? '+' : '') + (G.beta[j + 1] - F.beta[j + 1]).toFixed(2)})`).join('  ')}  intercept ${G.beta[0].toFixed(2)} (${(G.beta[0] - F.beta[0] >= 0 ? '+' : '') + (G.beta[0] - F.beta[0]).toFixed(2)})  AUC(in)=${auc(G.p, G.y)?.toFixed(3)}`);
}
