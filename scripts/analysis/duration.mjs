// D4 (docs/plan-structure.md): does a termination hazard bend with the spell's age? For each spell template, its
// covariates as they are, against the same plus a hinge max(0, duration - knot) at each knot, on the template's own era
// holdout (fit before the split, score after). A hinge is worth promoting where it improves held-out log-loss and AUC.
// Run: node scripts/analysis/duration.mjs
import { createFitter, loadFitInputs, fitLogistic, predict, auc } from '../lib/fit.mjs';
const fitter = createFitter(loadFitInputs());
const DUR = { war_end: 'war_duration', intrastate_end: 'conflict_duration', record_reopen: 'impair_duration', contest_settle: 'contest_duration' };
const ll = (p, y) => -p.reduce((s, x, i) => { const q = Math.min(1 - 1e-9, Math.max(1e-9, x)); return s + (y[i] ? Math.log(q) : Math.log(1 - q)); }, 0) / p.length;
for (const t of fitter.templates) {
  const v = DUR[t.id]; if (!v) continue;
  const rows = fitter.rowsFor(t); const [w0, w1] = t.window; const split = t.holdout_split ?? (w0 < 1946 && w1 > 1960 ? 1946 : Math.round((w0 + w1) / 2));
  const tr = rows.filter(r => r.year < split), te = rows.filter(r => r.year >= split);
  const ages = rows.map(r => r.feats[v]).filter(x => x != null).sort((a, b) => a - b);
  const q = (f) => ages[Math.floor(ages.length * f)];
  console.log(`${t.id} (${v}): n ${rows.length}, split ${split}, test ${te.length} / ${te.filter(r => r.y).length} endings; duration quartiles ${q(0.25)} ${q(0.5)} ${q(0.75)} max ${ages[ages.length - 1]}`);
  for (const knot of [null, 1, 2, 3, 5, 8]) {
    const tt = knot == null ? t : { ...t, covariates: [...t.covariates, { var: v, transform: 'hinge', knot, prior: 0 }] };
    const stats = {}; const cols = fitter.encode(tt, tr, stats); const design = (rs) => rs.map(r => [1, ...cols.map(c => c.get(r))]);
    const b = fitLogistic(design(tr), tr.map(r => r.y), [0, ...cols.map(c => c.prior)], 2);
    const p = predict(design(te), b), y = te.map(r => r.y);
    console.log(`   ${knot == null ? 'base     ' : `hinge @${String(knot).padEnd(3)}`}  holdout AUC ${auc(p, y).toFixed(3)}  log-loss ${ll(p, y).toFixed(4)}  exp/obs ${(p.reduce((s, x) => s + x, 0) / Math.max(1, y.reduce((s, x) => s + x, 0))).toFixed(2)}${knot != null ? `  hinge coef ${b[b.length - 1].toFixed(2)}` : ''}`);
  }
}
