// C6 (docs/plan-structure.md): military presence as state the engine moves, not a layer frozen at as-of.
//
// Two hazards over the dated stations of data/presence.yaml, fitted with labels at or before the forecaster's as-of:
//   close  P(a station active in t-1 ends in t)        on: the patron still a great power, patron and host allied,
//                                                      host at war, log station age, level, a fleet area
//   open   P(a power opens a station on a host)        over (patron x live land host) pairs without one — a patron is a
//          great power or a state already holding a station somewhere (the layer's own powers) — on:
//          allied, contiguous, host at war, patron at war, log capability ratio, the host already hosting another power
// Covariates at t-1; the panel's great-power and war columns and the dated pact graph. Penalised logistic, pure JS.
// A simulated opening is a level-1 station with no coordinates (the viewer draws it at the host). Nothing here names a
// country: every id comes from the records.
import { activeAt } from './presence.js';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const SEA = (h) => typeof h === 'string' && h.startsWith('sea:');
export const STATIONS = { from: 1871, prior_sd: 1, min_events: 5 };

export const closeX = (s) => [1, s.patronGreat ? 1 : 0, s.allied ? 1 : 0, s.hostWar ? 1 : 0, Math.log1p(s.age ?? 0), (s.level ?? 1) / 3, s.sea ? 1 : 0];
export const openX = (s) => [1, s.allied ? 1 : 0, s.contiguous ? 1 : 0, s.hostWar ? 1 : 0, s.patronWar ? 1 : 0, Math.min(6, Math.abs(Math.log(Math.max(s.capP ?? 1e-4, 1e-6) / Math.max(s.capH ?? 1e-4, 1e-6)))) / 3, s.hosting ? 1 : 0];

function fitLogit(X, y) {
  const p = X[0].length; let b = new Array(p).fill(0);
  const base = Math.min(0.5, Math.max(1e-6, y.reduce((s, v) => s + v, 0) / y.length)); b[0] = Math.log(base / (1 - base));
  const lam = 1 / STATIONS.prior_sd ** 2;
  for (let it = 0; it < 40; it++) {
    const g = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) { const x = X[i]; let eta = 0; for (let j = 0; j < p; j++) eta += b[j] * x[j]; const mu = sigmoid(eta), w = Math.max(1e-9, mu * (1 - mu)); for (let j = 0; j < p; j++) { g[j] += (y[i] - mu) * x[j]; for (let k = 0; k < p; k++) H[j][k] += w * x[j] * x[k]; } }
    for (let j = 1; j < p; j++) { g[j] -= lam * b[j]; H[j][j] += lam; }
    const A = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < p; i++) { let m = i; for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; [A[i], A[m]] = [A[m], A[i]]; for (let r = i + 1; r < p; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c]; } }
    const d = new Array(p).fill(0); for (let i = p - 1; i >= 0; i--) { let s = A[i][p]; for (let c = i + 1; c < p; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i]; }
    b = b.map((v, j) => v + d[j]); if (Math.max(...d.map(Math.abs)) < 1e-8) break;
  }
  return b;
}

/** Fit on years [STATIONS.from, maxYear]. `alliedAt(y)` = the pact edge set in force in y; `contiguity` the pair map. */
export function fitStations({ panel, presence, alliedAt, contiguity }, maxYear) {
  const memo = (fitStations.__memo ??= new Map()); if (memo.has(maxYear)) return memo.get(maxYear);
  const Y0 = panel.meta.y0; const A = panel.actors;
  const contig = (k, y) => (contiguity[k] ?? []).some?.(([f, t]) => y >= f && y <= t) ?? false;
  const C = { X: [], y: [] }, O = { X: [], y: [] };
  for (let t = STATIONS.from; t <= Math.min(maxYear, panel.meta.y1); t++) {
    const i = t - Y0 - 1; const allied = alliedAt(t - 1);
    const gp = (id) => (A[id]?.great_power?.[i] ?? 0) > 0, war = (id) => (A[id]?.at_war?.[i] ?? 0) > 0;
    const active = presence.filter(r => activeAt(r, t - 1));
    for (const r of active) {
      C.X.push(closeX({ patronGreat: gp(r.actor), allied: !SEA(r.host) && allied.has(pk(r.actor, r.host)), hostWar: !SEA(r.host) && war(r.host), age: t - 1 - r.from, level: r.level, sea: SEA(r.host) }));
      C.y.push(r.to === t ? 1 : 0);
    }
    const has = new Set(active.filter(r => !SEA(r.host)).map(r => `${r.actor}>${r.host}`)); const hosting = new Set(active.filter(r => !SEA(r.host)).map(r => r.host));
    const opened = new Set(presence.filter(r => !SEA(r.host) && Math.floor(r.from) === t).map(r => `${r.actor}>${r.host}`));
    const live = Object.keys(A).filter(id => A[id].live?.[i] && A[id].live?.[i + 1]);
    const holders = new Set(active.map(r => r.actor));
    for (const p of live) {
      if (!gp(p) && !holders.has(p)) continue;
      for (const h of live) {
        if (h === p || has.has(`${p}>${h}`)) continue;
        O.X.push(openX({ allied: allied.has(pk(p, h)), contiguous: contig(pk(p, h), t - 1), hostWar: war(h), patronWar: war(p), capP: A[p].cinc?.[i], capH: A[h].cinc?.[i], hosting: hosting.has(h) }));
        O.y.push(opened.has(`${p}>${h}`) ? 1 : 0);
      }
    }
  }
  const one = (R) => { const ev = R.y.reduce((s, v) => s + v, 0); return ev < STATIONS.min_events ? { status: 'unfitted', events: ev, n: R.y.length } : { status: 'fitted', beta: fitLogit(R.X, R.y), events: ev, n: R.y.length }; };
  const out = { trained_through: Math.min(maxYear, panel.meta.y1), close: one(C), open: one(O) };
  memo.set(maxYear, out); return out;
}
const hz = (f, x) => { if (f?.status !== 'fitted') return null; let eta = 0; for (let j = 0; j < x.length; j++) eta += f.beta[j] * x[j]; return sigmoid(eta); };
export const closeHazard = (fit, s) => hz(fit?.close, closeX(s));
export const openHazard = (fit, s) => hz(fit?.open, openX(s));
