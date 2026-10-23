// C4 (docs/plan-structure.md): nuclear acquisition as a fitted hazard, replacing world.nukes frozen at as-of.
//
// P(weapon in t | none in t-1) over every live non-nuclear actor-year from 1945 to as-of, on: log capability share,
// log GDP per head, a contiguous nuclear state (threat, Singh & Way 2004), a defence pact with a nuclear state
// (substitution, Jo & Gartzke 2007), great-power status. Labels are the dated `nuclear` / `status: weapon` events.
// About ten events in the whole record, so the fit is a prior update rather than a regression: Gaussian priors centred
// on the template's literature signs (data/templates.yaml `weaponization`) with sd 0.7. Disarmament (one case) is not
// modelled: a weapon state stays one. Pure JS; nothing here names a country.

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const NUKE = { from: 1945, prior: [null, 0.6, 0.3, 0.8, -1.2, 0.5], prior_sd: 0.7, min_events: 3 };

/** [1, log cinc, log gdp_pc, nuclear neighbour, nuclear ally, great power] */
export const nukeFeatures = (s) => [1, Math.log(Math.max(s.cinc ?? 1e-5, 1e-6)) + 6, Math.log(Math.max(s.gdp ?? 1000, 100)) - 8.5, s.neighbour ? 1 : 0, s.ally ? 1 : 0, s.great ? 1 : 0];

function fitLogit(X, y, prior) {
  const p = prior.length; let b = prior.map(v => v ?? 0);
  const base = Math.min(0.5, Math.max(1e-5, y.reduce((s, v) => s + v, 0) / y.length)); b[0] = Math.log(base / (1 - base));
  const lam = 1 / NUKE.prior_sd ** 2;
  for (let it = 0; it < 40; it++) {
    const g = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) { const x = X[i]; let eta = 0; for (let j = 0; j < p; j++) eta += b[j] * x[j]; const mu = sigmoid(eta), w = Math.max(1e-9, mu * (1 - mu)); for (let j = 0; j < p; j++) { g[j] += (y[i] - mu) * x[j]; for (let k = 0; k < p; k++) H[j][k] += w * x[j] * x[k]; } }
    for (let j = 1; j < p; j++) { g[j] -= lam * (b[j] - prior[j]); H[j][j] += lam; }
    const A = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < p; i++) { let m = i; for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; [A[i], A[m]] = [A[m], A[i]]; for (let r = i + 1; r < p; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c]; } }
    const d = new Array(p).fill(0); for (let i = p - 1; i >= 0; i--) { let s = A[i][p]; for (let c = i + 1; c < p; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i]; }
    b = b.map((v, j) => v + d[j]); if (Math.max(...d.map(Math.abs)) < 1e-8) break;
  }
  return b;
}

/** Fit on actor-years in [NUKE.from, maxYear]. `alliedAt(y)` returns the pact edge set in force in year y. */
export function fitNuclear({ panel, events, contiguity, alliedAt }, maxYear) {
  const memo = (fitNuclear.__memo ??= new Map()); if (memo.has(maxYear)) return memo.get(maxYear);
  const first = new Map(); for (const e of events) if (e.kind === 'nuclear' && e.status === 'weapon') { const y = Math.floor(e.year); if (!first.has(e.actor) || y < first.get(e.actor)) first.set(e.actor, y); }
  const Y0 = panel.meta.y0; const X = [], y = [];
  const contig = (k, yy) => (contiguity[k] ?? []).some?.(([f, t]) => yy >= f && yy <= t) ?? false;
  for (let t = NUKE.from; t <= Math.min(maxYear, panel.meta.y1); t++) {
    const i = t - Y0 - 1; const nukes = new Set([...first].filter(([, fy]) => fy < t).map(([id]) => id));
    const allied = alliedAt(t - 1);
    for (const [id, a] of Object.entries(panel.actors)) {
      if (!a.live?.[i] || !a.live?.[i + 1] || nukes.has(id)) continue;
      const s = { cinc: a.cinc?.[i], gdp: a.gdp_pc?.[i], great: (a.great_power?.[i] ?? 0) > 0, neighbour: [...nukes].some(n => contig(pk(id, n), t - 1)), ally: [...nukes].some(n => allied.has(pk(id, n))) };
      X.push(nukeFeatures(s)); y.push(first.get(id) === t ? 1 : 0);
    }
  }
  const ev = y.reduce((s, v) => s + v, 0);
  const out = ev < NUKE.min_events ? { status: 'unfitted', events: ev, n: y.length, trained_through: maxYear } : { status: 'fitted', beta: fitLogit(X, y, NUKE.prior), events: ev, n: y.length, trained_through: maxYear };
  memo.set(maxYear, out); return out;
}
export function nukeHazard(fit, s) { if (fit?.status !== 'fitted') return null; const x = nukeFeatures(s); let eta = 0; for (let j = 0; j < x.length; j++) eta += fit.beta[j] * x[j]; return sigmoid(eta); }
