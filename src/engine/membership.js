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

// Breakup (docs/plan-structure.md, C5): where data/holders.json says which state holds a territory (CShapes 2.0, 1886+),
// a territory's birth is not an independent coin. It is drawn in two stages over its HOLDER:
//   breakup  P(at least one territory the state holds becomes a state in t), per live holder, on the holder at t-1:
//            log1p(territories held), the colonial share of them, its rise in electoral democracy over three years
//            (a centre that liberalises lets go: Portugal 1974, the USSR 1989-91), at war, a breakup of its own in the
//            five years before (an empire comes apart over years), the world's recent births, its democratic share,
//            great-power status
//   member   P(a held territory is born | its holder breaks up in t), on: colony or integral, log area, territories held
// The two stages are what correlate the members: the USSR's twelve and Yugoslavia's four come apart in the same draw,
// not as twelve independent 3% coins. A territory with no holder on record (pre-1886, small islands CShapes omits)
// keeps the single-stage birth hazard. Death reads whether the state broke up that year and the share of its held
// territories that left (Austria-Hungary 1918, Czechoslovakia 1993), and a dead state's territories pass to its absorber.
export const BREAKUP = { rise_years: 3 };
const breakupX = (s) => [1, Math.log1p(s.held ?? 0), s.colonial ?? 0, Math.max(0, s.rise ?? 0) * 10, s.atWar ? 1 : 0, s.recentBreak ? 1 : 0, Math.log1p(s.recent ?? 0), (s.dem ?? 0.3) * 3, s.great ? 1 : 0];
const memberX = (s) => [1, s.colony ? 1 : 0, Math.log(Math.max(s.area ?? 1e-5, 1e-7)) + 8, Math.log1p(s.held ?? 0)];
const deathBX = (s) => [...deathX(s), s.broke ? 1 : 0, s.shareBorn ?? 0];

/** The holder of a territory in year y from data/holders.json spans: { h, status } (h 'self', a model id, or null). */
export function holderAt(holders, poly, y) {
  const sp = holders?.[poly]; if (!sp?.length) return null;
  if (y < sp[0][0]) return null;
  const yy = Math.min(y, sp[sp.length - 1][1]);
  for (const [a, b, h, status] of sp) if (yy >= a && yy <= b) return { h, status };
  return null;
}
const COLONIAL = new Set(['colony', 'protectorate', 'mandate', 'occupied']);
export const isColonial = (status) => COLONIAL.has(status);

/**
 * Fit the hazards on years (Y0, maxYear]. `polygons` = [{ id, area }] (area in steradians, d3.geoArea);
 * `polygonOf` = actor id -> polygon id for entities that draw on another's polygon; `holders` = data/holders.json's
 * spans (optional: without it every territory takes the single-stage birth hazard, the first C5 build).
 */
export function fitMembership({ panel, polygons, polygonOf = {}, contiguity = {}, holders = null }, maxYear) {
  const memo = (fitMembership.__memo ??= new Map()); const key = `${maxYear}|${polygons.length}|${holders ? 1 : 0}`; if (memo.has(key)) return memo.get(key);
  const Y0 = panel.meta.y0;
  const B = { X: [], y: [] }, D = { X: [], y: [] }, K = { X: [], y: [] }, C = { X: [], y: [] }; const births = []; const nb = neighbours(contiguity); const bornAt = new Map();
  const breakYears = new Map();   // holder -> years it broke up
  const R = BREAKUP.rise_years;
  for (let t = Y0 + 1; t <= Math.min(maxYear, panel.meta.y1); t++) {
    const i = t - Y0;
    const liveBefore = [], liveNow = new Set(), occBefore = new Set(), bornPolys = new Set();
    for (const [id, a] of Object.entries(panel.actors)) {
      const p = polygonKey(id, polygonOf);
      if (a.live?.[i - 1]) { liveBefore.push([id, a]); occBefore.add(p); }
      if (a.live?.[i]) { liveNow.add(id); if (!a.live?.[i - 1]) bornPolys.add(p); }
    }
    const liveSet = new Set(liveBefore.map(([id]) => id));
    const recent = births.filter(y => y >= t - MEMBERSHIP.wave_years && y < t).length;
    let dem = null; for (const [, a] of liveBefore) { const d = a.dem_share?.[i - 1]; if (d != null) { dem = d; break; } }
    const held = new Map();   // holder -> [{ poly, colony }]
    for (const poly of polygons) {
      if (occBefore.has(poly.id)) continue;
      const ho = holders ? holderAt(holders, poly.id, t - 1) : null;
      if (ho?.h && ho.h !== 'self' && liveSet.has(ho.h)) { (held.get(ho.h) ?? held.set(ho.h, []).get(ho.h)).push({ poly, colony: isColonial(ho.status) }); continue; }
      const ev = bornPolys.has(poly.id) ? 1 : 0; B.X.push(birthX({ recent, area: poly.area, local: localBirths(nb, bornAt, poly.id, t), dem })); B.y.push(ev);
    }
    const broke = new Map();   // holder -> share of its held territories born in t
    for (const [h, list] of held) {
      const a = panel.actors[h]; const n = list.length; const nBorn = list.filter(x => bornPolys.has(x.poly.id)).length;
      const p1 = a.polyarchy?.[i - 1], p0 = a.polyarchy?.[i - 1 - R];
      K.X.push(breakupX({ held: n, colonial: list.filter(x => x.colony).length / n, rise: p1 != null && p0 != null ? p1 - p0 : 0, atWar: (a.at_war?.[i - 1] ?? 0) > 0, recentBreak: (breakYears.get(h) ?? []).some(y => y >= t - 5 && y < t), recent, dem, great: (a.great_power?.[i - 1] ?? 0) > 0 }));
      K.y.push(nBorn ? 1 : 0);
      if (nBorn) {
        broke.set(h, nBorn / n); (breakYears.get(h) ?? breakYears.set(h, []).get(h)).push(t);
        for (const x of list) { C.X.push(memberX({ colony: x.colony, area: x.poly.area, held: n })); C.y.push(bornPolys.has(x.poly.id) ? 1 : 0); }
      }
    }
    for (const p of bornPolys) (bornAt.get(p) ?? bornAt.set(p, []).get(p)).push(t);
    // count every birth for the wave term, including states whose polygon is not on today's map
    for (const [id, a] of Object.entries(panel.actors)) if (a.live?.[i] && !a.live?.[i - 1]) births.push(t);
    const cincs = liveBefore.map(([, a]) => a.cinc?.[i - 1]).filter(x => x != null);
    for (const [id, a] of liveBefore) {
      const died = !liveNow.has(id) && !bornPolys.has(polygonKey(id, polygonOf)) ? 1 : 0;   // a rename is not a death
      const s = { cinc: a.cinc?.[i - 1] ?? (cincs.length ? Math.min(...cincs) : 1e-5), atWar: (a.at_war?.[i - 1] ?? 0) > 0, great: (a.great_power?.[i - 1] ?? 0) > 0, dem, broke: broke.has(id), shareBorn: broke.get(id) ?? 0 };
      D.X.push(holders ? deathBX(s) : deathX(s)); D.y.push(died);
    }
  }
  const one = (R) => { const ev = R.y.reduce((s, v) => s + v, 0); return ev < MEMBERSHIP.min_events ? { status: 'unfitted', events: ev, n: R.y.length } : { status: 'fitted', beta: fitLogit(R.X, R.y), events: ev, n: R.y.length }; };
  const out = { trained_through: Math.min(maxYear, panel.meta.y1), birth: one(B), death: one(D), ...(holders ? { breakup: one(K), member: one(C), deathForm: 'breakup' } : {}) };
  memo.set(key, out); return out;
}
const hz = (f, x) => { if (f?.status !== 'fitted') return null; let eta = 0; for (let j = 0; j < x.length; j++) eta += f.beta[j] * x[j]; return sigmoid(eta); };
export const birthHazard = (fit, s) => hz(fit?.birth, birthX(s));
export const deathHazard = (fit, s) => hz(fit?.death, fit?.deathForm === 'breakup' ? deathBX(s) : deathX(s));
export const breakupHazard = (fit, s) => hz(fit?.breakup, breakupX(s));
export const memberHazard = (fit, s) => hz(fit?.member, memberX(s));
