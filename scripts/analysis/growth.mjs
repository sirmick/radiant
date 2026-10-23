// C1 (docs/plan-structure.md): the growth process the engine draws, fitted to the panel's own per-capita growth.
//
// Model: g_it = m + s_it + f_it + e_it + w * at_war_it
//   s   slow AR(1) component, persistence phi_s  (decade-scale divergence: why shares move)
//   f   fast AR(1) component, persistence phi_f  (business-cycle-scale)
//   e   iid noise
// The three variance shares and two persistences are fitted by matching the pooled within-actor autocorrelation of
// annual growth at lags 1..10 (method of moments, grid search), with the total variance from the panel. The war term is
// the within-era difference in mean growth between war and non-war actor-years. The 20-year dispersion the process
// implies is printed next to the panel's, which is the check that matters for capability shares.
// Run: node scripts/analysis/growth.mjs [--to 2025]
import { readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const TO = +arg('to', 9999);
const p = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = p.meta.y0;
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const series = new Map(); const rows = [];
for (const [id, a] of Object.entries(p.actors)) {
  const gp = a.gdp_pc; if (!gp) continue; const m = new Map();
  for (let i = 1; i < gp.length; i++) {
    const y = Y0 + i; if (y > TO) break;
    if (gp[i] == null || gp[i - 1] == null || !a.live?.[i] || a.gdp_pc_interp?.[i] || a.gdp_pc_interp?.[i - 1]) continue;
    const g = Math.log(gp[i] / gp[i - 1]); if (Math.abs(g) > 0.5) continue;   // re-basings and data breaks, not growth
    m.set(y, g); rows.push({ y, g, war: (a.at_war?.[i] ?? 0) > 0 });
  }
  if (m.size) series.set(id, m);
}
const era = (y) => (y < 1914 ? 0 : y < 1950 ? 1 : y < 1990 ? 2 : 3);
// demean by era (the level of world growth is not what the process is about)
const eraMean = [0, 1, 2, 3].map(e => { const gs = rows.filter(r => era(r.y) === e).map(r => r.g); return gs.length ? mean(gs) : 0; });
const dev = (y, g) => g - eraMean[era(y)];
const allDev = rows.map(r => dev(r.y, r.g)); const V = mean(allDev.map(x => x * x));
const ac = (lag) => { let c = 0, v = 0, n = 0; for (const m of series.values()) for (const [y, g] of m) { const h = m.get(y - lag); if (h == null) continue; c += dev(y, g) * dev(y - lag, h); n++; } return c / n / V; };
const target = Array.from({ length: 10 }, (_, i) => ac(i + 1));
// fit a·phi_f^L + c·phi_s^L to the autocorrelations
let best = null;
for (let pf = 0.05; pf <= 0.8; pf += 0.01) for (let ps = 0.8; ps <= 0.995; ps += 0.002) {
  // given the persistences the two shares are a linear least-squares problem
  const A = target.map((_, i) => [pf ** (i + 1), ps ** (i + 1)]);
  let s11 = 0, s12 = 0, s22 = 0, b1 = 0, b2 = 0; for (let i = 0; i < 10; i++) { s11 += A[i][0] ** 2; s12 += A[i][0] * A[i][1]; s22 += A[i][1] ** 2; b1 += A[i][0] * target[i]; b2 += A[i][1] * target[i]; }
  const det = s11 * s22 - s12 * s12; if (Math.abs(det) < 1e-12) continue;
  const a = (b1 * s22 - b2 * s12) / det, c = (s11 * b2 - s12 * b1) / det; if (a < 0 || c < 0 || a + c > 1) continue;
  const err = target.reduce((t, x, i) => t + (x - a * pf ** (i + 1) - c * ps ** (i + 1)) ** 2, 0);
  if (!best || err < best.err) best = { pf, ps, a, c, err };
}
const sd = Math.sqrt(V);
const params = {
  phi_fast: +best.pf.toFixed(3), phi_slow: +best.ps.toFixed(3),
  sd_fast: +(sd * Math.sqrt(best.a) * Math.sqrt(1 - best.pf ** 2)).toFixed(4),   // innovation sd
  sd_slow: +(sd * Math.sqrt(best.c) * Math.sqrt(1 - best.ps ** 2)).toFixed(4),
  sd_iid: +(sd * Math.sqrt(1 - best.a - best.c)).toFixed(4),
};
// war: within-era difference in mean growth, war vs not
const wd = [0, 1, 2, 3].map(e => { const rs = rows.filter(r => era(r.y) === e); const w = rs.filter(r => r.war), n = rs.filter(r => !r.war); return w.length > 20 ? { d: mean(w.map(r => r.g)) - mean(n.map(r => r.g)), n: w.length } : null; }).filter(Boolean);
params.war = +(wd.reduce((t, x) => t + x.d * x.n, 0) / wd.reduce((t, x) => t + x.n, 0)).toFixed(4);
// the check: 20-year log-change dispersion implied vs observed
const implied = (() => { const T = 20; const vs = (s, phi) => { const v = s * s / (1 - phi * phi); let t = T * v; for (let k = 1; k < T; k++) t += 2 * (T - k) * v * phi ** k; return t; }; return Math.sqrt(T * params.sd_iid ** 2 + vs(params.sd_fast, params.phi_fast) + vs(params.sd_slow, params.phi_slow)); })();
const obs20 = []; for (const t0 of [1950, 1960, 1970, 1980, 1990, 2000]) { if (t0 + 20 > TO) continue; const ch = []; for (const a of Object.values(p.actors)) { const i0 = t0 - Y0; if (a.gdp_pc?.[i0] && a.gdp_pc?.[i0 + 20] && a.live?.[i0]) ch.push(Math.log(a.gdp_pc[i0 + 20] / a.gdp_pc[i0])); } const m = mean(ch); obs20.push(Math.sqrt(mean(ch.map(x => (x - m) ** 2)))); }
console.log(`n ${rows.length} actor-years to ${Math.min(TO, p.meta.y1)}, sd ${sd.toFixed(4)} (era-demeaned)`);
console.log(`autocorrelation lag 1..10: ${target.map(x => x.toFixed(3)).join(' ')}`);
console.log(`fitted:                   ${target.map((_, i) => (best.a * best.pf ** (i + 1) + best.c * best.ps ** (i + 1)).toFixed(3)).join(' ')}`);
console.log(`variance shares: fast ${best.a.toFixed(3)} slow ${best.c.toFixed(3)} iid ${(1 - best.a - best.c).toFixed(3)}; war by era ${wd.map(x => x.d.toFixed(4)).join(' ')}`);
console.log(`20-year log change sd: implied ${implied.toFixed(3)}, panel ${obs20.map(x => x.toFixed(3)).join(' ')}`);
console.log(JSON.stringify(params));
