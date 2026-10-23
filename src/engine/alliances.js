// C3 (docs/plan-structure.md): the defence-pact graph as state the engine moves, not an edge set frozen at as-of.
//
// Two pair-year hazards, fitted on the dated pact graph (scripts/lib/hist.mjs:loadPacts — CoW 3.03 or ATOP 5.1 to
// 2018, dated accessions after) with labels at or before the forecaster's as-of year:
//   form  P(allied in t | not allied in t-1)   over CANDIDATE pairs: contiguous, either a great power, or sharing an ally
//   end   P(not allied in t | allied in t-1)   over every allied pair
// Covariates (all read at t-1): contiguous, either / both great powers, joint democracy, |regime gap|, log capability
// ratio, log(1 + shared allies) — triadic closure, which is how a bloc accession looks pair by pair — and, for `end`,
// log pact age; and the mean log degree of the two (saturation). The candidate rule is the same in the fit and in the engine, so the sample the coefficients are
// estimated on is the set they are drawn over. Penalised logistic (prior sd 1 on slopes), pure JS (browser-safe).
// Nothing here names a country.

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const ALLY = { prior_sd: 1, min_events: 10, max_rows: 400000 };

/** Shared-ally counts for every pair with at least one, from an adjacency map. */
export function sharedAllies(adj) {
  const m = new Map();
  for (const ps of adj.values()) { const xs = [...ps]; for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) { const k = pk(xs[i], xs[j]); m.set(k, (m.get(k) ?? 0) + 1); } }
  return m;
}
export const adjacency = (edges) => { const m = new Map(); for (const k of edges) { const i = k.indexOf('|'); const a = k.slice(0, i), b = k.slice(i + 1); (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); } return m; };

/** Feature vector. s = { contiguous, gpA, gpB, regA, regB, capA, capB, shared, age, degA, degB } */
export function allyFeatures(s) {
  const ra = s.regA ?? 1, rb = s.regB ?? 1, ca = Math.max(s.capA ?? 1e-5, 1e-6), cb = Math.max(s.capB ?? 1e-5, 1e-6);
  return [1, s.contiguous ? 1 : 0, (s.gpA || s.gpB) ? 1 : 0, (s.gpA && s.gpB) ? 1 : 0, ra >= 2 && rb >= 2 ? 1 : 0, Math.abs(ra - rb) / 3, Math.abs(Math.log(ca / cb)) / 5, Math.log1p(s.shared ?? 0), Math.log1p(s.age ?? 0), (Math.log1p(s.degA ?? 0) + Math.log1p(s.degB ?? 0)) / 2];
}
// `deg` (mean log degree of the two) is the saturation brake: without it triadic closure alone densifies a simulated
// graph without limit, because history forms blocs in a single accession year and pairs drawn independently do not
export const ALLY_COLS = { form: [0, 1, 2, 3, 4, 5, 6, 7, 9], end: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
/** The candidate rule for formation, identical in fit and engine. */
export const candidate = (s) => s.contiguous || s.gpA || s.gpB || (s.shared ?? 0) > 0;

function fitLogit(X, y, cols) {
  const p = cols.length; let b = new Array(p).fill(0);
  const base = Math.min(0.99, Math.max(1e-5, y.reduce((s, v) => s + v, 0) / y.length)); b[0] = Math.log(base / (1 - base));
  const lam = 1 / ALLY.prior_sd ** 2;
  for (let it = 0; it < 30; it++) {
    const g = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) { const x = X[i]; let eta = 0; for (let j = 0; j < p; j++) eta += b[j] * x[cols[j]]; const mu = sigmoid(eta), w = Math.max(1e-9, mu * (1 - mu)); for (let j = 0; j < p; j++) { const xj = x[cols[j]]; g[j] += (y[i] - mu) * xj; for (let k = 0; k <= j; k++) H[j][k] += w * xj * x[cols[k]]; } }
    for (let j = 0; j < p; j++) for (let k = j + 1; k < p; k++) H[j][k] = H[k][j];
    for (let j = 1; j < p; j++) { g[j] -= lam * b[j]; H[j][j] += lam; }
    const A = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < p; i++) { let m = i; for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; [A[i], A[m]] = [A[m], A[i]]; for (let r = i + 1; r < p; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c]; } }
    const d = new Array(p).fill(0); for (let i = p - 1; i >= 0; i--) { let s = A[i][p]; for (let c = i + 1; c < p; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i]; }
    b = b.map((v, j) => v + d[j]); if (Math.max(...d.map(Math.abs)) < 1e-7) break;
  }
  return b;
}

/** The pact edge set in force at year y (the dated graph: `A|B|y` keys). */
export function edgesAt(pacts, y) {
  const memo = (pacts.__edgesAt ??= new Map()); if (memo.has(y)) return memo.get(y);
  const byYear = (pacts.__byYearA ??= (() => { const m = new Map(); for (const k of pacts) { const i = k.lastIndexOf('|'); const yy = k.slice(i + 1); if (yy === '*') continue; (m.get(+yy) ?? m.set(+yy, new Set()).get(+yy)).add(k.slice(0, i)); } return m; })());
  const out = byYear.get(y) ?? new Set(); memo.set(y, out); return out;
}
const contigAt = (contiguity, k, y) => (contiguity[k] ?? []).some?.(([f, t]) => y >= f && y <= t) ?? false;

/**
 * Fit both hazards on years (from, maxYear]. Rows are subsampled deterministically to ALLY.max_rows per side (every
 * event is kept; non-events are thinned and reweighted by the intercept correction log(keep share)).
 */
export function fitAlliances({ panel, pacts, contiguity }, maxYear, from = 1820) {
  const memo = (fitAlliances.__memo ??= new Map()); const key = `${maxYear}|${from}`; if (memo.has(key)) return memo.get(key);
  const Y0 = panel.meta.y0; const rows = { form: { X: [], y: [] }, end: { X: [], y: [] } };
  const nonEv = { form: 0, end: 0 }; const keep = { form: 0.12, end: 1 };   // formation non-events are thinned
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const since = new Map();
  for (let y = Math.max(from, Y0 + 1); y <= Math.min(maxYear, panel.meta.y1); y++) {
    const prev = edgesAt(pacts, y - 1), now = edgesAt(pacts, y); if (!prev.size && !now.size) continue;
    for (const k of prev) if (!since.has(k)) since.set(k, y - 1);
    const i = y - Y0 - 1; const live = Object.entries(panel.actors).filter(([, a]) => a.live?.[i] && a.live?.[i + 1]).map(([id]) => id); const liveSet = new Set(live);
    const adj = adjacency([...prev].filter(k => { const j = k.indexOf('|'); return liveSet.has(k.slice(0, j)) && liveSet.has(k.slice(j + 1)); }));
    const shared = sharedAllies(adj);
    const st = (a, b, k) => { const A = panel.actors[a], B = panel.actors[b]; return { contiguous: contigAt(contiguity, k, y - 1), gpA: (A.great_power?.[i] ?? 0) > 0, gpB: (B.great_power?.[i] ?? 0) > 0, regA: A.regime?.[i], regB: B.regime?.[i], capA: A.cinc?.[i], capB: B.cinc?.[i], shared: shared.get(k) ?? 0, age: since.has(k) ? y - 1 - since.get(k) : 0, degA: adj.get(a)?.size ?? 0, degB: adj.get(b)?.size ?? 0 }; };
    // dissolution: every allied live pair
    for (const k of adj.size ? prev : []) { const j = k.indexOf('|'); const a = k.slice(0, j), b = k.slice(j + 1); if (!liveSet.has(a) || !liveSet.has(b)) continue; const ev = now.has(k) ? 0 : 1; rows.end.X.push(allyFeatures(st(a, b, k))); rows.end.y.push(ev); if (ev) since.delete(k); }
    // formation: candidate pairs not allied at t-1
    for (let p = 0; p < live.length; p++) for (let q = p + 1; q < live.length; q++) {
      const k = pk(live[p], live[q]); if (prev.has(k)) continue;
      const s = st(live[p], live[q], k); if (!candidate(s)) continue;
      const ev = now.has(k) ? 1 : 0;
      if (!ev) { nonEv.form++; if (rnd() > keep.form) continue; }
      rows.form.X.push(allyFeatures(s)); rows.form.y.push(ev);
    }
    for (const k of now) if (!prev.has(k)) since.set(k, y);
  }
  const out = { trained_through: Math.min(maxYear, panel.meta.y1) };
  for (const side of ['form', 'end']) {
    const ev = rows[side].y.reduce((s, v) => s + v, 0);
    if (ev < ALLY.min_events) { out[side] = { status: 'unfitted', events: ev, n: rows[side].y.length }; continue; }
    const beta = fitLogit(rows[side].X, rows[side].y, ALLY_COLS[side]);
    beta[0] += Math.log(keep[side]);   // undo the thinning of non-events (case-control intercept correction)
    out[side] = { status: 'fitted', cols: ALLY_COLS[side], beta, events: ev, n: rows[side].y.length };
  }
  memo.set(key, out);
  return out;
}

export function allyHazard(fit, side, s) {
  const f = fit?.[side]; if (!f || f.status !== 'fitted') return null;
  const x = allyFeatures(s); let eta = 0; f.cols.forEach((c, j) => { eta += f.beta[j] * x[c]; });
  return sigmoid(eta);
}
