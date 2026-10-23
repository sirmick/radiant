// C2 (docs/plan-structure.md): great-power status as state the engine moves, not a flag frozen at as-of.
//
// Two transition hazards over actor-years, fitted on the panel's CoW major-power column with labels at or before the
// forecaster's as-of year (so a run from 1900 knows nothing of 1918):
//   entry  P(major power in t | not in t-1)   on log capability share in t-1 and its rank among live states
//   exit   P(not in t | major power in t-1)   on the same, plus being at war in t-1 (1917, 1918, 1940, 1943, 1945)
// The capability share is CINC, which the engine now moves (C1), so a state can grow into the club or fall out of it.
// The fit is a small penalised logistic (Gaussian prior sd 1 on the slopes), pure JS so it runs in the browser too.
// Nothing here names a country.

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const GP = { prior_sd: 1, min_events: 3, rank_cap: 12 };

/** Feature vector for one actor-year: [1, log cinc share, min(rank, cap) / cap, at war]. */
const feats = (cinc, rank, atWar) => [1, Math.log(Math.max(cinc, 1e-6)), Math.min(rank, GP.rank_cap) / GP.rank_cap, atWar ? 1 : 0];

function fitLogit(X, y, cols) {
  const p = cols.length; let b = new Array(p).fill(0);
  const base = Math.min(0.99, Math.max(0.001, y.reduce((s, v) => s + v, 0) / y.length)); b[0] = Math.log(base / (1 - base));
  const lam = 1 / (GP.prior_sd ** 2);
  for (let it = 0; it < 40; it++) {
    const g = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) { const x = cols.map(c => X[i][c]); let eta = 0; for (let j = 0; j < p; j++) eta += b[j] * x[j]; const mu = sigmoid(eta), w = Math.max(1e-6, mu * (1 - mu)); for (let j = 0; j < p; j++) { g[j] += (y[i] - mu) * x[j]; for (let k = 0; k < p; k++) H[j][k] += w * x[j] * x[k]; } }
    for (let j = 1; j < p; j++) { g[j] -= lam * b[j]; H[j][j] += lam; }
    // solve H d = g (p <= 4: Gaussian elimination)
    const A = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < p; i++) { let m = i; for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; [A[i], A[m]] = [A[m], A[i]]; for (let r = i + 1; r < p; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c]; } }
    const d = new Array(p).fill(0); for (let i = p - 1; i >= 0; i--) { let s = A[i][p]; for (let c = i + 1; c < p; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i]; }
    b = b.map((v, j) => v + d[j]); if (Math.max(...d.map(Math.abs)) < 1e-8) break;
  }
  return b;
}

/**
 * Fit both transitions on panel actor-years whose label year is <= maxYear. Returns null for a transition with fewer
 * than GP.min_events events in the sample (the engine then holds that direction frozen, and says so in `note`).
 */
export function fitGreatPower(panel, maxYear) {
  const Y0 = panel.meta.y0; const rows = { entry: { X: [], y: [] }, exit: { X: [], y: [] } };
  const last = Math.min(maxYear, panel.meta.y1);
  for (let y = Y0 + 1; y <= last; y++) {
    const i = y - Y0; const live = [];
    for (const [id, a] of Object.entries(panel.actors)) if (a.live?.[i - 1] && a.live?.[i] && a.cinc?.[i - 1] != null && a.great_power?.[i - 1] != null && a.great_power?.[i] != null) live.push([id, a, a.cinc[i - 1]]);
    live.sort((p, q) => q[2] - p[2]);
    live.forEach(([, a, c], r) => { const was = a.great_power[i - 1] > 0, is = a.great_power[i] > 0; const x = feats(c, r + 1, (a.at_war?.[i - 1] ?? 0) > 0); if (was) { rows.exit.X.push(x); rows.exit.y.push(is ? 0 : 1); } else { rows.entry.X.push(x); rows.entry.y.push(is ? 1 : 0); } });
  }
  const out = { trained_through: last };
  for (const [k, cols] of [['entry', [0, 1, 2]], ['exit', [0, 1, 2, 3]]]) {
    const ev = rows[k].y.reduce((s, v) => s + v, 0);
    out[k] = ev < GP.min_events ? { status: 'unfitted', events: ev, n: rows[k].y.length } : { status: 'fitted', cols, beta: fitLogit(rows[k].X, rows[k].y, cols), events: ev, n: rows[k].y.length };
  }
  return out;
}

/** The transition probability for one actor this year (null where the direction is unfitted). */
export function gpHazard(fit, wasGreat, cinc, rank, atWar) {
  const f = wasGreat ? fit?.exit : fit?.entry; if (!f || f.status !== 'fitted' || cinc == null) return null;
  const x = feats(cinc, rank, atWar); let eta = 0; f.cols.forEach((c, j) => { eta += f.beta[j] * x[c]; });
  return sigmoid(eta);
}
