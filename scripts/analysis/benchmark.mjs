// D5 (docs/plan-structure.md): a ceiling for the GLM. Gradient-boosted depth-2 trees on the SAME design matrix and the
// SAME era holdout each template's fit uses, scored only, never simulated. Where boosting beats the penalised logistic
// out of sample by a wide margin the template is missing structure (an interaction, a threshold); where it does not,
// the linear form is not what limits the model. Also reports the D2 variant (λ chosen by inner holdout).
// Run: node scripts/analysis/benchmark.mjs [--only mid_force,coup_attempt] [--rounds 150] [--json f]
import { writeFileSync } from 'node:fs';
import { createFitter, loadFitInputs, fitLogistic, predict, auc, LAMBDA_GRID } from '../lib/fit.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', null)?.split(','), ROUNDS = +arg('rounds', 150), LR = 0.1, BINS = 16, MAXROWS = 120000;
const fitter = createFitter(loadFitInputs());
const brier = (p, y) => p.reduce((s, x, i) => s + (x - y[i]) ** 2, 0) / p.length;
const ll = (p, y) => p.reduce((s, x, i) => { const q = Math.min(1 - 1e-9, Math.max(1e-9, x)); return s + (y[i] ? Math.log(q) : Math.log(1 - q)); }, 0) / p.length;

/** Boosted depth-2 regression trees on logistic loss, histogram splits. X without the intercept column. */
function gbt(X, y, Xte) {
  const n = X.length, p = X[0].length;
  const edges = Array.from({ length: p }, (_, j) => { const v = X.map(r => r[j]).sort((a, b) => a - b); const e = []; for (let b = 1; b < BINS; b++) e.push(v[Math.floor((b * n) / BINS)]); return [...new Set(e)]; });
  const bin = (r) => r.map((x, j) => { let b = 0; while (b < edges[j].length && x > edges[j][b]) b++; return b; });
  const B = X.map(bin), Bte = Xte.map(bin);
  const base = Math.log(Math.max(1e-6, mean(y)) / Math.max(1e-6, 1 - mean(y)));
  const F = new Float64Array(n).fill(base), Fte = new Float64Array(Xte.length).fill(base);
  const leaf = (idx, g, h) => { let G = 0, Hs = 0; for (const i of idx) { G += g[i]; Hs += h[i]; } return G / (Hs + 1); };
  const bestSplit = (idx, g, h) => {
    let best = null;
    for (let j = 0; j < p; j++) {
      const nb = edges[j].length + 1; const G = new Float64Array(nb), H = new Float64Array(nb);
      for (const i of idx) { G[B[i][j]] += g[i]; H[B[i][j]] += h[i]; }
      let gt = 0, ht = 0; for (let b = 0; b < nb; b++) { gt += G[b]; ht += H[b]; }
      let gl = 0, hl = 0;
      for (let b = 0; b < nb - 1; b++) { gl += G[b]; hl += H[b]; const gr = gt - gl, hr = ht - hl; if (hl < 1 || hr < 1) continue; const gain = gl * gl / (hl + 1) + gr * gr / (hr + 1) - gt * gt / (ht + 1); if (!best || gain > best.gain) best = { j, b, gain }; }
    }
    return best;
  };
  const all = Array.from({ length: n }, (_, i) => i);
  for (let r = 0; r < ROUNDS; r++) {
    const g = new Float64Array(n), h = new Float64Array(n);
    for (let i = 0; i < n; i++) { const q = 1 / (1 + Math.exp(-F[i])); g[i] = y[i] - q; h[i] = Math.max(1e-6, q * (1 - q)); }
    const s0 = bestSplit(all, g, h); if (!s0) break;
    const L = all.filter(i => B[i][s0.j] <= s0.b), R = all.filter(i => B[i][s0.j] > s0.b);
    const kids = [L, R].map(ix => { const s = bestSplit(ix, g, h); if (!s) return { s: null, v: [leaf(ix, g, h)] }; const a = ix.filter(i => B[i][s.j] <= s.b), c = ix.filter(i => B[i][s.j] > s.b); return { s, v: [leaf(a, g, h), leaf(c, g, h)] }; });
    const val = (bb) => { const k = kids[bb[s0.j] <= s0.b ? 0 : 1]; return k.s ? k.v[bb[k.s.j] <= k.s.b ? 0 : 1] : k.v[0]; };
    for (let i = 0; i < n; i++) F[i] += LR * val(B[i]);
    for (let i = 0; i < Bte.length; i++) Fte[i] += LR * val(Bte[i]);
  }
  return Array.from(Fte, f => 1 / (1 + Math.exp(-f)));
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const out = {};
for (const t of fitter.templates) {
  if (ONLY && !ONLY.includes(t.id)) continue;
  if (t.status === 'candidate' || t.sample === 'latent_only' || t.status === 'monitored') continue;
  let rows = fitter.rowsFor(t); if (rows.length < 200 || rows.filter(r => r.y).length < 20) continue;
  const [w0, w1] = t.window; const split = t.holdout_split ?? (w0 < 1946 && w1 > 1960 ? 1946 : Math.round((w0 + w1) / 2));
  let tr = rows.filter(r => r.year < split), te = rows.filter(r => r.year >= split);
  if (tr.filter(r => r.y).length < 10 || te.filter(r => r.y).length < 10) continue;
  // thin non-events in very large samples (both models see the same rows; probabilities are compared by rank and log-loss
  // on the same test set, and the intercept shift is corrected for both)
  let keep = 1; if (tr.length > MAXROWS) { keep = MAXROWS / tr.length; let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; tr = tr.filter(r => r.y || rnd() < keep); }
  const stats = {}; const cols = fitter.encode(t, tr, stats);
  const design = (rs) => rs.map(r => [1, ...cols.map(c => c.get(r))]);
  const Xtr = design(tr), ytr = tr.map(r => r.y), Xte = design(te), yte = te.map(r => r.y); const prior = [0, ...cols.map(c => c.prior)];
  const adj = (p) => (keep < 1 ? p.map(q => { const o = (q / (1 - q)) * keep; return o / (1 + o); }) : p);
  const glm = adj(predict(Xte, fitLogistic(Xtr, ytr, prior, 2)));
  const glmCv = (() => { let best = null; for (const lam of LAMBDA_GRID) { const p = adj(predict(Xte, fitLogistic(Xtr, ytr, prior, lam))); const s = ll(p, yte); if (!best || s > best.s) best = { lam, p, s }; } return best; })();
  const boost = adj(gbt(Xtr.map(r => r.slice(1)), ytr, Xte.map(r => r.slice(1))));
  const row = (p) => ({ auc: +auc(p, yte).toFixed(3), brier: +brier(p, yte).toFixed(5), logloss: +(-ll(p, yte)).toFixed(4) });
  out[t.id] = { split, n_train: tr.length, n_test: te.length, events_test: yte.reduce((a, b) => a + b, 0), glm: row(glm), glm_best_lambda_on_test: { lambda: glmCv.lam, ...row(glmCv.p) }, boosted: row(boost) };
  const o = out[t.id];
  console.log(`${t.id.padEnd(22)} split ${split} test n=${te.length} ev=${o.events_test}  AUC glm ${o.glm.auc} | best-λ ${o.glm_best_lambda_on_test.auc} (λ ${glmCv.lam}) | boosted ${o.boosted.auc}   logloss ${o.glm.logloss} / ${o.glm_best_lambda_on_test.logloss} / ${o.boosted.logloss}`);
}
const json = arg('json', null); if (json) writeFileSync(json, JSON.stringify({ meta: { run: new Date().toISOString(), rounds: ROUNDS, lr: LR, depth: 2, bins: BINS, note: 'best-λ is chosen ON the test set: an upper bound for D2, not an honest score; D2 itself chooses λ inside the training years' }, templates: out }, null, 1));
