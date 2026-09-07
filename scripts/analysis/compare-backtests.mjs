// Diff two backtest score files: pooled and per-as-of rows, before -> after.
// Run: node scripts/analysis/compare-backtests.mjs <before.json> <after.json> [template-id regexp]
import { readFileSync } from 'node:fs';
const A = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const B = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const f = (v, d = 3) => (v == null ? '—' : (+v).toFixed(d));
console.log('pooled (exp/obs · skill · auc):');
for (const k of Object.keys(B.pooled)) {
  const x = A.pooled[k], y = B.pooled[k];
  const eo = t => t ? (t.predicted / (t.observed || 1)) : null;
  console.log(`  ${k.padEnd(20)} ${f(eo(x),2)} / ${f(x?.skill)} / ${f(x?.auc)}   ->   ${f(eo(y),2)} / ${f(y?.skill)} / ${f(y?.auc)}`);
}
console.log('\nby as-of (auc / auc_at_risk / exp:obs):');
for (const r of B.byAsOf) {
  const a = A.byAsOf.find(z => z.asOf === r.asOf); if (!a) continue;
  for (const id of Object.keys(r.templates)) {
    const x = a.templates[id], y = r.templates[id];
    if (!y?.n && !x?.n) continue;
    const eo = t => (t && t.n ? (t.predicted / (t.observed || 1)) : null);
    const line = `  ${r.asOf} ${id.padEnd(20)} ${f(x?.auc,3)}/${f(x?.auc_at_risk,3)}/${f(eo(x),2)}  ->  ${f(y?.auc,3)}/${f(y?.auc_at_risk,3)}/${f(eo(y),2)}  n ${x?.n ?? 0}->${y?.n ?? 0}`;
    if (process.argv[4] && !new RegExp(process.argv[4]).test(id)) continue;
    console.log(line);
  }
}
