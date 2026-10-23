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
export const BREAKUP = { rise_years: 3, growth_years: 5 };
// The breakup covariates, by name, so a variant can be fitted and scored without editing code (BREAKUP_X selects them;
// docs/plan-structure.md, "breakup scoring"). Each reads one field of the holder state `s`, built the same way from the
// panel (fit, scoring) and from a simulated world (src/engine/core.js:stepMembership). A missing value takes a neutral
// constant, stated here.
//   held        log1p(territories it holds)                      colonial    share of them held as dependencies
//   rise        3-year rise in electoral democracy (x10)        atWar       at war in t-1
//   recentBreak a breakup of its own in the five years before   recent      log1p(world births in five years)
//   dem         world democratic share (x3)                     great       a great power
//   open        3-year rise in freedom of expression (x5): the centre loosening its grip — glasnost, Portugal 1974
//   freexp      freedom of expression, level (missing = 0.3)    corr        political corruption, level (missing = 0.5)
//   gap         freedom gap: the freest contiguous neighbour's electoral democracy minus its own (x3, >= 0)
//   prior       share of held territories that were states before and lost it (subjugated: the Baltics, Poland 1918)
//   growth      5-year mean output growth (x20; missing = the world mean 0.02)
//   heldShare   held territories' area over held + own
const BFEAT = {
  held: (s) => Math.log1p(s.held ?? 0), colonial: (s) => s.colonial ?? 0, rise: (s) => Math.max(0, s.rise ?? 0) * 10,
  atWar: (s) => (s.atWar ? 1 : 0), recentBreak: (s) => (s.recentBreak ? 1 : 0), recent: (s) => Math.log1p(s.recent ?? 0),
  dem: (s) => (s.dem ?? 0.3) * 3, great: (s) => (s.great ? 1 : 0), open: (s) => Math.max(0, s.open ?? 0) * 5,
  freexp: (s) => s.freexp ?? 0.3, corr: (s) => s.corr ?? 0.5, gap: (s) => Math.max(0, s.gap ?? 0) * 3, prior: (s) => s.prior ?? 0,
  growth: (s) => (s.growth ?? 0.02) * 20, heldShare: (s) => s.heldShare ?? 0,
};
// The default, chosen by scripts/analysis/breakup.mjs (5-year windows, origins 1900-2014, hazards refit at each origin):
// the world-births wave and the democratic share act on colonies only, the centre's opening on integral territory only.
// Skill vs climatology 0.113 -> 0.199, AUC 0.668 -> 0.743 against the pooled first build (held, colonial, rise, atWar,
// recentBreak, recent, dem, great); 1980-2014 AUC 0.394 -> 0.634. Prior statehood, the freedom gap, corruption,
// growth and the held-area share added nothing on top (docs/plan-structure.md, "breakup scoring").
export const BREAKUP_FIRST = ['held', 'colonial', 'rise', 'atWar', 'recentBreak', 'recent', 'dem', 'great'];
export const BREAKUP_BASE = ['held', 'colonial', 'atWar', 'recentBreak', 'recent:c', 'dem:c', 'great', 'open:i'];
const envX = typeof process !== 'undefined' ? process.env?.BREAKUP_X : null;
export let BREAKUP_ON = envX ? envX.split(',') : BREAKUP_BASE;
export const setBreakupFeatures = (list) => { BREAKUP_ON = list; };
// The breakup unit: a holder's colonies and its integral territory are two units with their own breakup draw — a
// remnant of small island dependencies (France, the US after 1980) and a federation of subject nations (the USSR,
// Yugoslavia) do not come apart for the same reasons. BREAKUP_SPLIT=0 pools them (the first breakup build).
export let BREAKUP_SPLIT = !(typeof process !== 'undefined' && process.env?.BREAKUP_SPLIT === '0');
export const setBreakupSplit = (v) => { BREAKUP_SPLIT = v; };
export const unitKey = (h, colony) => (BREAKUP_SPLIT ? `${h}|${colony ? 'c' : 'i'}` : h);
export const unitHolder = (k) => k.split('|')[0];
// `name:i` = the feature on integral units only (x (1 - colonial share)): an effect the colonies need not share
// `name:c` = on colonial units only (x colonial share)
const bf = (k, s) => (k.endsWith(':i') ? BFEAT[k.slice(0, -2)](s) * (1 - (s.colonial ?? 0)) : k.endsWith(':c') ? BFEAT[k.slice(0, -2)](s) * (s.colonial ?? 0) : BFEAT[k](s));
const breakupX = (s) => [1, ...BREAKUP_ON.map(k => bf(k, s))];
const memberX = (s) => [1, s.colony ? 1 : 0, Math.log(Math.max(s.area ?? 1e-5, 1e-7)) + 8, Math.log1p(s.held ?? 0), s.prior ? 1 : 0];

/**
 * The holder state the breakup covariates read, from the panel at row i-1 (year t-1). `list` = the unoccupied
 * territories it holds [{ poly, colony, prior }]; `ctx` = { panel, nbOf, contig, breakYears, recent, dem, areaOf, own }.
 */
export function holderStatePanel(h, i, list, ctx) {
  const { panel, breakYears, recent, dem, areaOf, own } = ctx; const a = panel.actors[h]; const Y0 = panel.meta.y0; const t = Y0 + i;
  const R = BREAKUP.rise_years; const at = (v, k) => a[v]?.[k] ?? null;
  const p1 = at('polyarchy', i - 1), p0 = at('polyarchy', i - 1 - R), f1 = at('freexp', i - 1), f0 = at('freexp', i - 1 - R);
  const g = []; for (let k = 1; k <= BREAKUP.growth_years; k++) { const x = at('gdp_growth', i - k); if (x != null) g.push(x); }
  let gap = null; if (p1 != null) for (const o of ctx.nbOf(h, t - 1)) { const q = panel.actors[o]?.polyarchy?.[i - 1]; if (q != null && panel.actors[o]?.live?.[i - 1]) gap = Math.max(gap ?? -1, q - p1); }
  const hA = list.reduce((s, x) => s + (areaOf(x.poly.id) ?? 0), 0), oA = areaOf(own(h)) ?? 0;
  return {
    held: list.length, colonial: list.filter(x => x.colony).length / list.length, rise: p1 != null && p0 != null ? p1 - p0 : 0,
    atWar: (at('at_war', i - 1) ?? 0) > 0, recentBreak: (breakYears.get(h) ?? []).some(y => y >= t - 5 && y < t), recent, dem,
    great: (at('great_power', i - 1) ?? 0) > 0, open: f1 != null && f0 != null ? f1 - f0 : 0, freexp: f1, corr: at('corr', i - 1),
    gap, prior: list.filter(x => x.prior).length / list.length, growth: g.length ? g.reduce((s, x) => s + x, 0) / g.length : null,
    heldShare: hA + oA > 0 ? hA / (hA + oA) : 0,
  };
}
/**
 * The same holder state from a simulated world: `hist` = { polyarchy: [...], freexp: [...] } with index 0 the year just
 * closed (src/engine/core.js:stepMembership keeps it). Only the fields the default and candidate features read.
 */
export function holderStateWorld(a, list, { hist, breakYears, recent, dem, y }) {
  const R = BREAKUP.rise_years; const d = (k) => (hist?.[k]?.[0] != null && hist?.[k]?.[R] != null ? hist[k][0] - hist[k][R] : 0);
  return {
    held: list.length, colonial: list.filter(x => x.colony).length / list.length, rise: d('polyarchy'), open: d('freexp'),
    atWar: (a.cur.at_war ?? 0) > 0, recentBreak: (breakYears.get(a.id) ?? []).some(b => b >= y - 5 && b < y), recent, dem,
    great: (a.cur.great_power ?? 0) > 0, freexp: a.cur.freexp ?? null, corr: a.cur.corr ?? null,
    prior: list.filter(x => x.prior).length / list.length, growth: a.cur.gdp_growth ?? null,
  };
}
/** contiguous(h, y): the actors contiguous with h in year y, from the dated contiguity pairs. */
export function contiguityIndex(contiguity) {
  const nb = neighbours(contiguity);
  return (h, y) => [...(nb.get(h) ?? [])].filter(o => { const k = h < o ? `${h}|${o}` : `${o}|${h}`; return (contiguity[k] ?? []).some?.(([f, to]) => y >= f && y <= to); });
}
/** polygon -> first year any actor drawing on it was live (a territory whose state existed before: `prior`). */
export function firstLiveIndex(panel, polygonOf) {
  const m = new Map(); const Y0 = panel.meta.y0;
  for (const [id, a] of Object.entries(panel.actors)) { const i = a.live?.findIndex(x => x === 1) ?? -1; if (i < 0) continue; const p = polygonKey(id, polygonOf); m.set(p, Math.min(m.get(p) ?? Infinity, Y0 + i)); }
  return m;
}
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
  const memo = (fitMembership.__memo ??= new Map()); const key = `${maxYear}|${polygons.length}|${holders ? 1 : 0}|${BREAKUP_ON.join(',')}|${BREAKUP_SPLIT}`; if (memo.has(key)) return memo.get(key);
  const Y0 = panel.meta.y0;
  const B = { X: [], y: [] }, D = { X: [], y: [] }, K = { X: [], y: [] }, C = { X: [], y: [] }; const births = []; const nb = neighbours(contiguity); const bornAt = new Map();
  const breakYears = new Map();   // holder -> years it broke up
  const groups = [];   // breakups of units holding >= 2: where the members start in C, and the share that left
  const areaMap = new Map(polygons.map(p => [p.id, p.area])); const firstLive = firstLiveIndex(panel, polygonOf);
  const ctx = { panel, breakYears, nbOf: contiguityIndex(contiguity), areaOf: (p) => areaMap.get(p), own: (h) => polygonKey(h, polygonOf) };
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
      if (ho?.h && ho.h !== 'self' && liveSet.has(ho.h)) { const u = unitKey(ho.h, isColonial(ho.status)); (held.get(u) ?? held.set(u, []).get(u)).push({ poly, colony: isColonial(ho.status), prior: (firstLive.get(poly.id) ?? Infinity) < t - 1 }); continue; }
      const ev = bornPolys.has(poly.id) ? 1 : 0; B.X.push(birthX({ recent, area: poly.area, local: localBirths(nb, bornAt, poly.id, t), dem })); B.y.push(ev);
    }
    const broke = new Map();   // holder -> share of its held territories born in t
    const heldN = new Map(); for (const [u, list] of held) heldN.set(unitHolder(u), (heldN.get(unitHolder(u)) ?? 0) + list.length);
    for (const [u, list] of held) {
      const h = unitHolder(u); const n = list.length; const nBorn = list.filter(x => bornPolys.has(x.poly.id)).length;
      K.X.push(breakupX(holderStatePanel(h, i, list, { ...ctx, recent, dem })));
      K.y.push(nBorn ? 1 : 0);
      if (nBorn) {
        broke.set(h, (broke.get(h) ?? 0) + nBorn / heldN.get(h)); const l = breakYears.get(h) ?? breakYears.set(h, []).get(h); if (!l.includes(t)) l.push(t);
        const c0 = C.X.length; for (const x of list) { C.X.push(memberX({ colony: x.colony, area: x.poly.area, held: n, prior: x.prior })); C.y.push(bornPolys.has(x.poly.id) ? 1 : 0); }
        if (n >= 2) groups.push({ from: c0, n, share: nBorn / n, u, t });
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
  const member = holders ? one(C) : null;
  // overdispersion of the members (a beta-binomial on the share that leaves): members of one breakup do not leave
  // independently — one secedes (Norway, Bangladesh) or the whole thing dissolves (Austria-Hungary, the USSR). The
  // intra-breakup correlation rho by moments, from the share each multi-member breakup lost against its expected share.
  // rho by maximum likelihood on a grid, ZERO-TRUNCATED: a breakup is at least one member by definition, so a
  // one-of-two exit is not evidence against correlation (the moment estimator read it so and returned 0).
  let rho = 0, rhoLL = null;
  if (member?.status === 'fitted' && groups.length >= 3) {
    const G = groups.map(g => { const q = C.X.slice(g.from, g.from + g.n).map(x => hz(member, x)); return { n: g.n, k: Math.round(g.share * g.n), m: Math.min(0.98, Math.max(0.02, q.reduce((a, b) => a + b, 0) / g.n)) }; });
    let best = null;
    for (const r of [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
      let ll = 0;
      for (const g of G) { const lp = (k) => (r === 0 ? logBinom(g.n, k) + k * Math.log(g.m) + (g.n - k) * Math.log(1 - g.m) : logBetaBinom(g.n, k, g.m * (1 / r - 1), (1 - g.m) * (1 / r - 1))); ll += lp(g.k) - Math.log(Math.max(1e-300, 1 - Math.exp(lp(0)))); }
      if (!best || ll > best.ll) best = { r, ll };
    }
    rho = best.r; rhoLL = +best.ll.toFixed(2);
    if (typeof process !== 'undefined' && process.env?.RHO_DEBUG) console.log('rho', rho, 'll', rhoLL, 'groups', G.length);
  }
  const out = { trained_through: Math.min(maxYear, panel.meta.y1), birth: one(B), death: one(D), ...(holders ? { breakup: one(K), member: member ? { ...member, rho, rho_ll: rhoLL, groups: groups.length } : member, deathForm: 'breakup' } : {}) };
  memo.set(key, out); return out;
}
const lgamma = (x) => { // Lanczos
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < g + 2; i++) a += c[i] / (x + i); return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
};
const logBinom = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
const logBetaBinom = (n, k, a, b) => logBinom(n, k) + lgamma(k + a) + lgamma(n - k + b) - lgamma(n + a + b) - (lgamma(a) + lgamma(b) - lgamma(a + b));
const hz = (f, x) => { if (f?.status !== 'fitted') return null; let eta = 0; for (let j = 0; j < x.length; j++) eta += f.beta[j] * x[j]; return sigmoid(eta); };
export const birthHazard = (fit, s) => hz(fit?.birth, birthX(s));
export const deathHazard = (fit, s) => hz(fit?.death, fit?.deathForm === 'breakup' ? deathBX(s) : deathX(s));
export const breakupHazard = (fit, s) => hz(fit?.breakup, breakupX(s));
export const memberHazard = (fit, s) => hz(fit?.member, memberX(s));
