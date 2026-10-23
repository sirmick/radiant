// C5 (docs/plan-structure.md): who is a state, as a fitted process rather than read from the dated membership list.
//
// Births are drawn over TERRITORIES, not over future states: the candidate pool in a year is every map polygon
// (Natural Earth admin-0, today's map) that no live state occupies — a colony before independence, a Soviet republic
// before 1991, Greenland or Puerto Rico today. That a territory exists is knowledge a forecaster holds at the origin;
// when it becomes a state is the outcome. Polygons that never became states stay in the pool, so the pool does not
// leak which territories will. (The polygons are today's borders — a stated, smaller leak.)
//   birth  P(the polygon is a live state in t | unoccupied in t-1) on: log1p(births in the world in the five years to
//          t-1) — the decolonisation and post-Soviet waves are contagious — births among the territory's own neighbours
//          in the same five years (the waves were regional: Africa 1960, the Soviet periphery 1991), and log polygon area
//   death  P(not live in t | live in t-1), excluding renames (the polygon reoccupied by a new state the same year), on:
//          log capability share, at war in t-1, great power
// Both also read the world's democratic share in t-1 (the panel's derived `dem_share`, src/engine/polarity.js) — the
// one structural quantity the model has for the post-1945 order in which conquest stopped and empires let go; a
// derived state, not a calendar year, so a forecast can move it.
// Fitted on labels at or before as-of from the panel's own live column. Penalised logistic, pure JS.
// Nothing here names a country.

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const MEMBERSHIP = { prior_sd: 1, min_events: 3, wave_years: 5 };

const birthX = (s) => [1, Math.log1p(s.recent ?? 0), Math.log(Math.max(s.area ?? 1e-5, 1e-7)) + 8, Math.log1p(s.local ?? 0), (s.dem ?? 0.3) * 3];
const deathX = (s) => [1, Math.log(Math.max(s.cinc ?? 1e-5, 1e-6)) + 6, s.atWar ? 1 : 0, s.great ? 1 : 0, (s.dem ?? 0.3) * 3];

function fitLogit(X, y) {
  const p = X[0].length; let b = new Array(p).fill(0);
  const base = Math.min(0.5, Math.max(1e-6, y.reduce((s, v) => s + v, 0) / y.length)); b[0] = Math.log(base / (1 - base));
  const lam = 1 / MEMBERSHIP.prior_sd ** 2;
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

/** Geographic neighbours of every polygon: any pair the contiguity source has ever recorded (borders are geography). */
export function neighbours(contiguity) {
  const m = new Map(); for (const k of Object.keys(contiguity ?? {})) { const i = k.indexOf('|'); if (i < 0) continue; const a = k.slice(0, i), b = k.slice(i + 1); (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); }
  return m;
}
/** Births among a polygon's neighbours in [y - window, y - 1]. `bornAt` = polygon -> [birth years]. */
export const localBirths = (nb, bornAt, poly, y) => { let n = 0; for (const o of nb.get(poly) ?? []) for (const b of bornAt.get(o) ?? []) if (b >= y - MEMBERSHIP.wave_years && b < y) n++; return n; };

/** The polygon an actor draws on: its own id, or its modern successor's (`polygonOf` from the entity table). */
export const polygonKey = (id, polygonOf) => polygonOf?.[id] ?? id;

/**
 * Fit both hazards on years (Y0, maxYear]. `polygons` = [{ id, area }] (area in steradians, d3.geoArea);
 * `polygonOf` = actor id -> polygon id for entities that draw on another's polygon.
 */
export function fitMembership({ panel, polygons, polygonOf = {}, contiguity = {} }, maxYear) {
  const memo = (fitMembership.__memo ??= new Map()); const key = `${maxYear}|${polygons.length}`; if (memo.has(key)) return memo.get(key);
  const Y0 = panel.meta.y0; const area = new Map(polygons.map(p => [p.id, p.area]));
  const B = { X: [], y: [] }, D = { X: [], y: [] }; const births = []; const nb = neighbours(contiguity); const bornAt = new Map();
  for (let t = Y0 + 1; t <= Math.min(maxYear, panel.meta.y1); t++) {
    const i = t - Y0;
    const liveBefore = [], liveNow = new Set(), occBefore = new Set(), bornPolys = new Set();
    for (const [id, a] of Object.entries(panel.actors)) {
      const p = polygonKey(id, polygonOf);
      if (a.live?.[i - 1]) { liveBefore.push([id, a]); occBefore.add(p); }
      if (a.live?.[i]) { liveNow.add(id); if (!a.live?.[i - 1]) bornPolys.add(p); }
    }
    const recent = births.filter(y => y >= t - MEMBERSHIP.wave_years && y < t).length;
    let dem = null; for (const [, a] of liveBefore) { const d = a.dem_share?.[i - 1]; if (d != null) { dem = d; break; } }
    for (const poly of polygons) { if (occBefore.has(poly.id)) continue; const ev = bornPolys.has(poly.id) ? 1 : 0; B.X.push(birthX({ recent, area: poly.area, local: localBirths(nb, bornAt, poly.id, t), dem })); B.y.push(ev); }
    for (const p of bornPolys) (bornAt.get(p) ?? bornAt.set(p, []).get(p)).push(t);
    // count every birth for the wave term, including states whose polygon is not on today's map
    for (const [id, a] of Object.entries(panel.actors)) if (a.live?.[i] && !a.live?.[i - 1]) births.push(t);
    const cincs = liveBefore.map(([, a]) => a.cinc?.[i - 1]).filter(x => x != null);
    for (const [id, a] of liveBefore) {
      const died = !liveNow.has(id) && !bornPolys.has(polygonKey(id, polygonOf)) ? 1 : 0;   // a rename is not a death
      D.X.push(deathX({ cinc: a.cinc?.[i - 1] ?? (cincs.length ? Math.min(...cincs) : 1e-5), atWar: (a.at_war?.[i - 1] ?? 0) > 0, great: (a.great_power?.[i - 1] ?? 0) > 0, dem })); D.y.push(died);
    }
  }
  const one = (R) => { const ev = R.y.reduce((s, v) => s + v, 0); return ev < MEMBERSHIP.min_events ? { status: 'unfitted', events: ev, n: R.y.length } : { status: 'fitted', beta: fitLogit(R.X, R.y), events: ev, n: R.y.length }; };
  const out = { trained_through: Math.min(maxYear, panel.meta.y1), birth: one(B), death: one(D) };
  memo.set(key, out); return out;
}
const hz = (f, x) => { if (f?.status !== 'fitted') return null; let eta = 0; for (let j = 0; j < x.length; j++) eta += f.beta[j] * x[j]; return sigmoid(eta); };
export const birthHazard = (fit, s) => hz(fit?.birth, birthX(s));
export const deathHazard = (fit, s) => hz(fit?.death, deathX(s));
