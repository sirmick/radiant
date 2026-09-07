// Radiant engine v0 — annual-step stochastic world model, pure ESM (node + browser).
// State is built from the historical panel as-of a year; hazards are the fitted templates (data/fits.json);
// events fire per actor-year / dyad-year and rewrite state; a thin structural layer drifts the slow variables.
// No country names anywhere in this file.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
// Structural drift constants. GROWTH_MEAN is the panel's live-actor mean log growth 1900–2000 (n=8,453, mean 0.0172,
// sd 0.0705); GROWTH_PHI gives the deviation from it a ~4-year half-life. Source: data/panel.json gdp_growth.
const GROWTH_MEAN = 0.0172, GROWTH_PHI = 0.85;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Rivalry memory: an exponentially decaying trace of the pair's last militarized dispute, δ^(years since it fired),
 * 0 for a pair that has never had one. It replaces the binary `win5(mid_force)` flag, which held a dyad at its
 * post-dispute odds (e² = 7.5×) for five full years and re-armed itself every time a simulated dispute rewrote it.
 * δ is declared once per dyadic template in data/templates.yaml (`decay:` on the rivalry covariate) and read by both
 * the fitter (scripts/lib/fit.mjs) and this engine, so the two cannot drift apart.
 */
export const rivalryScore = (lastYear, year, decay) => (lastYear == null || lastYear >= year ? 0 : Math.pow(decay, year - lastYear));
/** The single δ the templates declare. RIVALRY_DECAY in the environment overrides it — the ablation switch, node only. */
export function rivalryDecay(templates) {
  const env = (typeof process !== 'undefined' && process.env && process.env.RIVALRY_DECAY) || null;
  const ds = new Set();
  for (const t of templates ?? []) for (const c of t.covariates ?? []) if (c.var === 'rivalry') {
    if (c.decay == null) throw new Error(`template '${t.id}': the rivalry covariate must declare its decay`);
    ds.add(c.decay);
  }
  if (ds.size > 1) throw new Error(`rivalry is one process: templates declare decay ${[...ds].join(', ')}`);
  if (env != null && ds.size) return +env;
  return ds.size ? [...ds][0] : null;
}

/**
 * The at-war run lengths the panel shows by `asOf` — the distribution a fired war's duration is drawn from.
 * A spell still running at asOf is right-censored (its length is not yet observed) and is dropped, as is anything
 * dated after asOf. Memoised per panel × asOf; the panel's own `at_war` is the only source, so no number is typed here.
 */
const warRunCache = new WeakMap();
export function warRunLengths(panel, asOf) {
  let m = warRunCache.get(panel); if (!m) warRunCache.set(panel, m = new Map());
  if (m.has(asOf)) return m.get(asOf);
  const Y0 = panel.meta.y0; const out = [];
  for (const vars of Object.values(panel.actors)) {
    const arr = vars.at_war; if (!arr) continue;
    let n = 0;
    for (let y = Y0; y <= asOf; y++) { const x = arr[y - Y0]; if (x != null && x > 0) n++; else { if (n) out.push(n); n = 0; } }
  }
  m.set(asOf, out); return out;
}
const drawWarDuration = (world, rng) => { const d = world.warDurations; return d && d.length ? d[Math.floor(rng() * d.length)] : 1; };

// Ablation switches, node only (the browser build reads nothing here): ENGINE_ABLATE=war_duration,war_nesting turns a
// mechanism off so the backtest can score it on its own. With both off the dyad draw is the pre-2026-09-07 one, and the
// random stream is deliberately the same either way — two draws per dyad-year — so an ablation differs by mechanism only.
const ABLATE = ((typeof process !== 'undefined' && process.env && process.env.ENGINE_ABLATE) || '').split(',').map(s => s.trim());
const NO_NESTING = ABLATE.includes('war_nesting');
// ENGINE_ABLATE=corridor_layer takes the corridor / chokepoint layer out of the world entirely (era-1914-1945/corridors-7).
// With it off the engine consumes no random numbers for records, so a run reproduces the pre-2026-09-07 random stream
// exactly — which is how the claim "the dyadic numbers moved by stream noise only" is checked rather than asserted.
const NO_CORRIDORS = ABLATE.includes('corridor_layer');
/**
 * Whether war duration is switched on. It is declared in the data, not here: `duration.status` on the dyadic war
 * template in data/templates.yaml. It stands at `candidate` — built, measured on 2026-09-07 and not promoted, because
 * it moves every pooled calibration number the wrong way (the numbers are in that file under `rejected:`). Flipping it
 * to `active` reproduces the measured run; ENGINE_ABLATE=war_duration forces it off whatever the data says.
 */
const warDurationOn = (templates) => !ABLATE.includes('war_duration') && (templates ?? []).some(t => t.unit === 'dyad-year' && t.duration?.status === 'active');

/**
 * Coalition joining and the relevance set it implies (era-1914-1945/engine-1), declared in the data on the dyadic war
 * template (`coalition:` in data/templates.yaml) and read by both this engine and scripts/lib/fit.mjs, so the sample
 * the coefficients are estimated on and the sample the simulation draws are one set. ENGINE_ABLATE=coalition forces it
 * off on both sides at once. Returns null when it is off.
 */
export function coalitionRule(templates) {
  if (ABLATE.includes('coalition')) return null;
  const t = (templates ?? []).find(t => t.unit === 'dyad-year' && t.coalition);
  // COALITION_ON=1 switches a candidate mechanism on for an ablation run without editing the data (node only), the way
  // ENGINE_ABLATE switches an active one off. Both are stamped into the backtest's meta and its filename.
  const on = t && (t.coalition.status === 'active' || (typeof process !== 'undefined' && process.env?.COALITION_ON));
  if (!on) return null;
  if (t.coalition.p_join == null) throw new Error(`template '${t.id}': coalition must declare p_join`);
  // ablation switches, node only: COALITION_P_JOIN=<p> overrides the calibrated joining probability and
  // ENGINE_ABLATE=coalition_relevance keeps the joining rule but drops the relevance half (on both sides at once).
  const env = (typeof process !== 'undefined' && process.env) || {};
  return {
    pJoin: env.COALITION_P_JOIN != null ? +env.COALITION_P_JOIN : +t.coalition.p_join,
    relevance: ABLATE.includes('coalition_relevance') ? false : (env.COALITION_RELEVANCE || t.coalition.relevance || false),
  };
}

/**
 * Dyadic war spans from the hand-coded war records: a cross-side pair of a war is at war in every year both of its
 * members are in it. The same construction scripts/build-panel.mjs uses for the actor-level `at_war` flag
 * (per-participant `entries:`/`exits:` where declared, the war-level span otherwise), lifted to the pair — which is
 * what a coalition is: the pairs the sides lists imply and no dyadic dataset before CoW Dyadic MID carries.
 * Returns pairKey -> [[y0, y1], ...].
 */
export function warDyadSpans(events, endDefault = 2026) {
  const out = new Map();
  for (const e of events) {
    if (e.kind !== 'war' || !Array.isArray(e.sides) || e.sides.length < 2) continue;
    const end = e.end ?? endDefault;
    const span = (a) => [Math.floor(e.entries?.[a] ?? e.start), Math.floor(e.exits?.[a] ?? end)];
    for (const a of e.sides[0]) for (const b of e.sides[1]) {
      const [a0, a1] = span(a), [b0, b1] = span(b); const y0 = Math.max(a0, b0), y1 = Math.min(a1, b1);
      if (y1 < y0 || a === b) continue;
      const k = pairKey(a, b); (out.get(k) ?? out.set(k, []).get(k)).push([y0, y1]);
    }
  }
  return out;
}
/** actor -> Set(actors it is at war with) in `year`, from the spans above. */
export function warPartnersAt(spans, year) {
  const m = new Map();
  for (const [k, ivs] of spans) {
    if (!ivs.some(([f, t]) => year >= f && year <= t)) continue;
    const i = k.indexOf('|'); const a = k.slice(0, i), b = k.slice(i + 1);
    (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a);
  }
  return m;
}
/**
 * The coalition relevance clause, evaluated at the simulated year rather than frozen at as-of: a pair is politically
 * relevant if it is itself at war, or if one side is at war with a state allied to the other. `partners` is last
 * year's war graph; `allied` is the defence-pact graph (frozen at as-of in the engine, dated in the fitter).
 */
export function warLinked(partners, allied, a, b, mode = 'linked') {
  const pa = partners.get(a), pb = partners.get(b);
  if (!pa && !pb) return false;
  if (mode === 'both_at_war' && !(pa && pb)) return false;   // the tighter form: both sides already in a war
  if (pa) { if (pa.has(b)) return true; for (const c of pa) if (c !== b && allied.has(pairKey(c, b))) return true; }
  if (pb) { for (const c of pb) if (c !== a && allied.has(pairKey(c, a))) return true; }
  return false;
}

// ---------------------------------------------------------------- the corridor / chokepoint layer
// One row per record per year (data/corridors.yaml), the unit era-1914-1945/corridors-7 asked for. Everything below is
// read by BOTH scripts/lib/fit.mjs (over the historical panel) and this engine (over the simulated world): the `look`
// argument is the only difference between the two, so the sample the coefficients are estimated on and the state the
// hazard is drawn from cannot drift apart. No country names — every id comes out of the record.
export const CORRIDOR_UNIT = { chokepoint: 'chokepoint-year', corridor: 'corridor-year' };
const IMPAIRED = new Set(['closed', 'contested']);           // a record first observed impaired existed before it
const BASE_STATUS = { chokepoint: 'open', corridor: 'built' };
const ACTIVE_STATUS = new Set(['open', 'built', 'building', 'contested']);   // carries traffic (or will): stake > 0
// the record's history sorted once, memoised on the record itself (non-enumerable: a record is also serialised into
// public/world.json by scripts/build-world.mjs, and a memo must never turn into published data)
const histOf = (rec) => {
  if (!rec.__hist) Object.defineProperty(rec, '__hist', { value: [...(rec.history ?? [])].sort((a, b) => a.year - b.year), enumerable: false });
  return rec.__hist;
};

/**
 * The first year the record is a unit. A record enters the sample when its dated history opens — except where the
 * first row is already an impairment (`closed`/`contested`), which is only observable if the thing existed in its
 * unimpaired state before: those records start at the template window instead (a strait is not built).
 */
export function corridorFirstYear(rec, windowFrom) {
  const h = histOf(rec); if (!h.length) return null;
  return IMPAIRED.has(h[0].status) ? windowFrom : Math.max(windowFrom, Math.floor(h[0].year));
}
/** Status and controller in force at the END of `year`; controller carries forward across rows that omit it. */
export function corridorStateAt(rec, year) {
  const h = histOf(rec); if (!h.length) return null;
  let s = IMPAIRED.has(h[0].status) ? { status: BASE_STATUS[rec.kind] ?? 'open', controller: null } : null;
  for (const r of h) { if (Math.floor(r.year) > year) break; s = { status: r.status, controller: r.controller ?? s?.controller ?? null }; }
  return s;
}
/**
 * The years in [from, to] in which the record's status OR controller changed — the label of the two templates.
 * Control is half of what the layer is for (a record can change hands at constant status), and a
 * change that reverses inside one year is still a transition in that year: the unit is the record-year.
 */
export function corridorTransitionYears(rec, from, to) {
  const h = histOf(rec); const out = new Set(); if (!h.length) return out;
  let cur = IMPAIRED.has(h[0].status) ? { status: BASE_STATUS[rec.kind] ?? 'open', controller: null } : null;
  for (const r of h) {
    const next = { status: r.status, controller: r.controller ?? cur?.controller ?? null }, y = Math.floor(r.year);
    if (cur && (next.status !== cur.status || next.controller !== cur.controller) && y >= from && y <= to) out.add(y);
    cur = next;
  }
  return out;
}
/**
 * The record's transit states as they stand this year: a transit that is not a live actor is followed through the
 * successor chain (an empire's corridor is its successor's corridor), and the controller counts as a transit — which
 * is what keeps a record scorable through a period when no state on it is in the international system (a transit
 * out of the system under occupation, with an occupier holding the record). The cases are in docs/refine-log.md.
 */
export function corridorTransits(rec, state, look) {
  const out = [];
  const add = (id0) => { let id = id0, n = 0; while (id && !look.live(id) && n++ < 4) id = look.successor(id); if (id && look.live(id) && !out.includes(id)) out.push(id); };
  for (const t of rec.transits ?? []) add(t);
  if (state?.controller) add(state.controller);
  return out;
}
/** The covariate block for one record-year. `null` where the source does not cover the year (see `default_outside`). */
export function corridorFeatures(rec, state, look) {
  const T = corridorTransits(rec, state, look);
  const anyOf = (f) => { let seen = false; for (const id of T) { const x = f(id); if (x == null) continue; seen = true; if (x > 0) return 1; } return seen ? 0 : null; };
  const war = anyOf(look.atWar);
  const gs = T.map(look.gdpGrowth).filter(x => x != null);
  const sponsor = rec.sponsor ?? state?.controller ?? null;
  const sponsorLive = sponsor && look.live(sponsor) ? sponsor : null;
  return {
    adjacent_war: war, transit_at_war_any: war,                    // the same construction under each template's name
    adjacent_intrastate: anyOf(look.intrastate),
    transit_gdp_growth_mean: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
    sponsor_great_power: sponsorLive ? (look.greatPower(sponsorLive) > 0 ? 1 : 0) : 0,
    n_transits: T.length,
  };
}

/**
 * The corridor dampener (docs/schema.md): infrastructure that runs through one of a pair and is load-bearing for a
 * third party which is tied by a defence pact to one of the two. Summed over records and third parties, log1p'd
 * because the sum is a long tail, and z-scored by the fitter. Registered as a candidate on the dyadic templates.
 */
export function corridorIndex(entries, look) {
  const byTransit = new Map();
  for (const { rec, state } of entries) {
    if (!state || !ACTIVE_STATUS.has(state.status)) continue;      // planned, abandoned or closed: no traffic to lose
    for (const id of corridorTransits(rec, state, look)) (byTransit.get(id) ?? byTransit.set(id, []).get(id)).push(rec);
  }
  return { byTransit };
}
/** A covariate's declared structural default where its source does not cover the year (`default_outside`). */
export function outsideDefault(c, year) {
  if (!c.default_outside) return null;
  const [w0, w1] = c.default_outside.window;
  return (year < w0 || year > w1) ? c.default_outside.value : null;
}
/**
 * What a fired transition moves the record to: the empirical status mix observed at asOf (kind -> from -> to counts),
 * so the outcome of a simulated transition is drawn from the record layer's own history and not from a typed number.
 */
export function corridorOutcomeMix(records, asOf) {
  const m = {};
  for (const rec of records) {
    const h = histOf(rec); if (!h.length) continue;
    let cur = IMPAIRED.has(h[0].status) ? (BASE_STATUS[rec.kind] ?? 'open') : null;
    for (const r of h) {
      if (Math.floor(r.year) > asOf) break;
      if (cur && r.status !== cur) { const k = (m[rec.kind] ??= {}); const f = (k[cur] ??= {}); f[r.status] = (f[r.status] ?? 0) + 1; }
      cur = r.status;
    }
  }
  return m;
}
export function corridorStake(index, a, b, allied) {
  const ra = index.byTransit.get(a), rb = index.byTransit.get(b);
  if (!ra && !rb) return 0;
  let s = 0;
  const one = (rec) => { let w = 0; for (const [c, lb] of Object.entries(rec.load_bearing_for ?? {})) { if (c === a || c === b) continue; if (allied.has(pairKey(c, a)) || allied.has(pairKey(c, b))) w += lb; } return w; };
  for (const rec of ra ?? []) s += one(rec);
  for (const rec of rb ?? []) if (!ra?.includes(rec)) s += one(rec);
  return Math.log1p(s);
}

/** Build one actor's state at year `at` from its panel row. `asOf` only marks which staleness is recorded. */
function buildActorState({ panel, events, id, vars, at, asOf }) {
  const Y0 = panel.meta.y0;
  const pv = (v, y) => { const arr = vars[v]; const i = y - Y0; return arr && i >= 0 && i < arr.length ? arr[i] : null; };
  // carry the last observation forward where a dataset ends before `at` (leaders age; flags reset to 0); record staleness
  const stale = {};
  const lastKnown = (v, y) => { const arr = vars[v]; for (let i = y - Y0; i >= Math.max(0, y - Y0 - 30); i--) if (arr[i] != null) return [arr[i], Y0 + i]; return [null, null]; };
  const FLAG = new Set(['coup_attempt', 'coup_success', 'mid_force', 'mid_war', 'regime_up', 'regime_down', 'interstate_ucdp']);
  const build = (y) => { const o = {}; for (const v of Object.keys(vars)) { const x = vars[v][y - Y0]; if (x != null) { o[v] = x; continue; } if (FLAG.has(v)) { o[v] = 0; continue; } const [val, yr] = lastKnown(v, y); if (val == null) { o[v] = null; continue; } o[v] = (v === 'leader_age' || v === 'leader_tenure') ? val + (y - yr) : val; if (y === asOf) stale[v] = y - yr; } return o; };
  const cur = build(at);
  // trailing growth rates for the structural layer
  const g = []; for (let k = 1; k <= 10; k++) { const x = pv('gdp_growth', at - k); if (x != null) g.push(x); }
  const pg = []; for (let k = 1; k <= 10; k++) { const a = pv('population', at - k), b = pv('population', at - k - 1); if (a && b) pg.push(Math.log(a / b)); }
  // recent-event memory (for win5 covariates) seeded from the panel/events
  const recent = {};
  for (const v of ['coup_attempt', 'intrastate', 'mid_force', 'at_war']) { recent[v] = []; for (let k = 1; k <= 5; k++) { const x = pv(v, at - k); recent[v].push(x != null && x > 0 ? 1 : 0); } }
  recent.leader_exit = []; for (let k = 1; k <= 5; k++) recent.leader_exit.push(events.some(e => e.kind === 'leader_exit' && e.actor === id && Math.floor(e.year) === at - k) ? 1 : 0);
  const prev = build(at - 1);
  if (cur.gdp_growth == null && g.length) cur.gdp_growth = g.reduce((a, b) => a + b, 0) / g.length;
  return { id, cur, prev, recent, stale, growth: g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0.015, popGrowth: pg.length ? pg.reduce((a, b) => a + b, 0) / pg.length : 0.01, fired: {} };
}

/**
 * Build a world state at `asOf` from the panel. Only actors live at asOf are included; actors whose system
 * membership starts or ends inside the horizon are introduced/retired by stepYear from the same dated lifecycle.
 * Alliance and contiguity graphs are frozen at asOf: their future values are not knowledge a forecaster has.
 * `contiguityFrom` is the first year the contiguity source covers — for an asOf before it, that first snapshot
 * stands in (documented imputation; CShapes 2.0 begins 1886 and there is no border data behind it).
 */
export function createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe = 'modeled', successors, contiguityFrom = null, corridors = [] }) {
  const Y0 = panel.meta.y0; const idx = asOf - Y0;
  // as-of dating: nothing dated after asOf is knowledge a forecaster has. The event list is truncated once here so it
  // cannot leak back in through buildActorState's `recent` scan when an actor is introduced mid-horizon.
  events = events.filter(e => (e.year ?? e.start) <= asOf);
  const actors = {};
  const lifecycleIds = [];
  for (const [id, vars] of Object.entries(panel.actors)) {
    if (universe === 'modeled' && !vars.modeled?.[idx]) continue;
    lifecycleIds.push(id);
    if (!vars.live?.[idx]) continue;
    actors[id] = buildActorState({ panel, events, id, vars, at: asOf, asOf });
  }
  // dyad memory: the year of the pair's last militarized dispute, over the whole observed history (the rivalry trace
  // decays, so it has no window to truncate at — and the year itself, not asOf, is what δ^(age) is measured from).
  const dyadRecent = new Map();
  for (const e of events) if ((e.kind === 'mid_force' || e.kind === 'mid_war') && e.a && e.b && e.year <= asOf) {
    const k = pairKey(e.a, e.b), y = Math.floor(e.year);
    if (y > (dyadRecent.get(k) ?? -Infinity)) dyadRecent.set(k, y);
  }
  const nukes = new Set(); for (const e of events) if (e.kind === 'nuclear' && e.status === 'weapon' && e.year <= asOf) nukes.add(e.actor);
  // entry prior: the median live actor at asOf, used to instantiate an actor introduced inside the horizon whose panel
  // row at asOf is empty (a colony has no regime or income series). A stated, dated imputation — the alternative is a
  // structural zero, which reads as "this state cannot have a regime transition" for the whole decolonisation cohort.
  const med = (v) => { const xs = Object.values(actors).map(a => a.cur[v]).filter(x => x != null).sort((p, q) => p - q); return xs.length ? xs[Math.floor(xs.length / 2)] : null; };
  const entryPrior = Object.fromEntries(['regime', 'polyarchy', 'gdp_pc', 'log_gdp_pc', 'gdp_growth', 'population', 'tpop'].map(v => [v, med(v)]));
  // coalition joining and the relevance set it implies (era-1914-1945/engine-1). `warPartners` is the war graph as it
  // stood in the last observed year — seeded from the dated war records at asOf and rewritten by stepYear from the
  // simulation's own wars thereafter, so the relevance rule is evaluated at the simulated year and not frozen at as-of.
  const coalition = coalitionRule(templates);
  const allied = alliedAt(pacts, asOf);
  return {
    year: asOf, asOf, actors, dyadRecent, nukes, entryPrior,
    coalition, warPartners: coalition ? warPartnersAt(warDyadSpans(events), asOf) : new Map(),
    allyOf: coalition ? allyAdjacency(allied) : null,
    // interstate war as a spell rather than a one-year flag: warSpells holds the years left on each pair's war,
    // warDurations is the panel's own run-length distribution as observed at asOf, and warSeed is the set of actors
    // already at war at asOf (a war in progress takes a fresh draw as its residual — a stated approximation).
    // Both are null unless the data switches the mechanism on (see warDurationOn), and then warSpells stays empty.
    warSpells: new Map(), warDurations: warDurationOn(templates) ? warRunLengths(panel, asOf) : null,
    warSeed: warDurationOn(templates) ? new Set(Object.keys(actors).filter(id => actors[id].cur.at_war > 0)) : null,
    rivalryDecay: rivalryDecay(templates),
    // the corridor / chokepoint layer, as-of dated like everything else: a record is in the world only if its dated
    // history has opened by asOf (a corridor announced inside the horizon is not knowledge the forecaster holds — the
    // backtest reports those records and their transitions separately rather than scoring them at zero), its status and
    // controller are the ones in force at asOf, and the outcome mix a fired transition draws from is the history to date.
    corridors: NO_CORRIDORS ? [] : corridors.filter(rec => { const t = templates.find(x => x.unit === CORRIDOR_UNIT[rec.kind]); const f = t ? corridorFirstYear(rec, t.window[0]) : null; return f != null && f <= asOf; })
      .map(rec => ({ rec, state: corridorStateAt(rec, asOf) })),
    corridorMix: corridorOutcomeMix(corridors, asOf),
    allied, contiguous: contiguousAt(contiguity, contiguityFrom == null ? asOf : Math.max(asOf, contiguityFrom)),
    lifecycle: { panel, events, ids: lifecycleIds, Y0, successors: successors ?? {} },
    fits, templates, log: [],
  };
}

/** Defence-pact edges as they stood at `asOf` (carried forward from the last year the alliance source covers). */
function alliedAt(pacts, asOf) {
  if (!pacts || !pacts.size) return new Set();
  const memo = (pacts.__at ??= new Map()); if (memo.has(asOf)) return memo.get(asOf);
  const byYear = (pacts.__byYear ??= (() => { const m = new Map(); for (const k of pacts) { const i = k.lastIndexOf('|'); const y = k.slice(i + 1); (m.get(y) ?? m.set(y, []).get(y)).push(k.slice(0, i)); } return m; })());
  let best = null; for (const y of byYear.keys()) { if (y === '*') continue; const n = +y; if (n <= asOf && (best == null || n > best)) best = n; }
  const out = new Set([...(byYear.get('*') ?? []), ...(best == null ? [] : byYear.get(String(best)))]);
  memo.set(asOf, out); return out;
}
/** actor -> sorted array of its defence-pact partners, from the frozen alliance edge set (deterministic order). */
function allyAdjacency(allied) {
  const m = new Map();
  for (const k of allied) { const i = k.indexOf('|'); const a = k.slice(0, i), b = k.slice(i + 1); (m.get(a) ?? m.set(a, []).get(a)).push(b); (m.get(b) ?? m.set(b, []).get(b)).push(a); }
  for (const v of m.values()) v.sort();
  return m;
}
/** Contiguous pairs as they stood at `snapYear`. */
function contiguousAt(contiguity, snapYear) {
  if (!contiguity) return new Set();
  const memo = (contiguity.__at ??= new Map()); if (memo.has(snapYear)) return memo.get(snapYear);
  const out = new Set();
  for (const [k, ivs] of Object.entries(contiguity)) if (k !== '__at' && ivs.some?.(([f, t]) => snapYear >= f && snapYear <= t)) out.add(k);
  memo.set(snapYear, out); return out;
}

/** Feature value for a covariate spec, mirroring scripts/fit-hazards.mjs. */
function featureActor(world, a, c) {
  const v = c.var;
  const derived = {
    milper_share: (s) => (s.milper != null && s.tpop ? (s.milper * 1e3) / s.tpop : null),
    leader_exit_recent: () => (a.recent.leader_exit.some(x => x) ? 1 : 0),
    regime_change: () => (a.fired.regime_change ? 1 : 0),
  };
  if (c.transform === 'win5') { if (derived[v]) return derived[v](a.cur); return a.recent[v]?.some(x => x) ? 1 : 0; }
  const lag = c.lag ?? (c.transform === 'lag1' ? 1 : 0);
  const src = lag ? a.prev : a.cur;
  if (derived[v]) return derived[v](src);
  const x = src[v] ?? null;
  // a covariate whose source dataset does not cover this year takes the template's declared structural default
  if (x == null && c.default_outside) { const [w0, w1] = c.default_outside.window; const yy = world.year - lag; if (yy < w0 || yy > w1) return c.default_outside.value; }
  return x;
}
function encodeValue(fit, name, x) { return x; }
function linearPredictor(fit, t, feats) {
  let eta = fit.intercept;
  for (const c of t.covariates) {
    const v = c.var, x = feats[v]; if (x == null) return null;
    if (c.transform === 'cat') { const levels = Object.keys(c.prior).map(Number).sort(); for (const L of levels.slice(1)) { const k = `${v}=${L}`; if (fit.coefs[k] && x === L) eta += fit.coefs[k].value; } }
    else if (c.transform === 'z') { const s = fit.stats[v]; eta += fit.coefs[`z(${v})`].value * ((x - s.mean) / (s.sd || 1)); }
    else if (c.transform === 'log') { const s = fit.stats[`log_${v}`]; eta += fit.coefs[`log(${v})`].value * (Math.log(x + 1e-3) - s.mean); }
    else { const k = c.transform === 'win5' ? `win5(${v})` : c.transform === 'lag1' ? `lag1(${v})` : v; eta += fit.coefs[k].value * (x > 0 ? 1 : 0); }
  }
  return eta;
}

/** Annual probability of each fitted actor-year template for one actor in the current state. */
export function actorHazards(world, a) {
  const out = {};
  for (const t of world.templates) {
    const fit = world.fits[t.id]; if (!fit || fit.status !== 'fitted' || t.unit !== 'actor-year' || t.status === 'monitored') continue;
    if (t.sample?.regime_max != null && !(a.cur.regime <= t.sample.regime_max)) continue;
    if (t.sample?.regime_min != null && !(a.cur.regime >= t.sample.regime_min)) continue;
    const feats = {}; let ok = true;
    for (const c of t.covariates) { const x = featureActor(world, a, c); if (x == null) { ok = false; break; } feats[c.var] = x; }
    if (!ok) continue;
    const eta = linearPredictor(fit, t, feats); if (eta == null) continue;
    out[t.id] = sigmoid(eta);
  }
  return out;
}
export function dyadHazards(world, a, b) {
  const out = {}; const ca = a.cur.cinc, cb = b.cur.cinc; if (ca == null || cb == null || a.cur.regime == null || b.cur.regime == null) return out;
  const k = pairKey(a.id, b.id);
  const contiguous = world.contiguous.has(k) ? 1 : 0;
  const major = (a.cur.great_power || b.cur.great_power) ? 1 : 0;
  // politically relevant dyads only (Lemke & Reed 2001) — plus, where the coalition rule is on, the pairs a running war
  // makes relevant: at war with each other, or at war with a state allied to the other. That clause is read from the
  // simulated year's war graph, not frozen at as-of, which is the whole point: a small-power pair on opposite sides of
  // a coalition war is at probability exactly zero for twenty years without it (docs/escalations.md names the pairs).
  if (!contiguous && !major && !(world.coalition?.relevance && warLinked(world.warPartners, world.allied, a.id, b.id, world.coalition.relevance))) return out;
  const feats = {
    contiguous,
    allied: world.allied.has(k) ? 1 : 0,
    joint_democracy: a.cur.regime >= 2 && b.cur.regime >= 2 ? 1 : 0,
    cap_ratio: Math.max(ca, cb) / Math.max(1e-6, Math.min(ca, cb)),
    major_power_any: (a.cur.great_power || b.cur.great_power) ? 1 : 0,
    rivalry: rivalryScore(world.dyadRecent.get(k), world.year, world.rivalryDecay),
    at_war_any: (a.prev.at_war || b.prev.at_war) ? 1 : 0,
    nuclear_both: world.nukes.has(a.id) && world.nukes.has(b.id) ? 1 : 0,
    // era term (era-1870-1914/statistics-6): a derived constant, mirrored in scripts/lib/fit.mjs's dyad feature block
    pre_1946: world.year < 1946 ? 1 : 0,
    // corridor dampener (era-1914-1945/corridors-7): infrastructure running through one of the pair that a third party
    // tied to either side leans on. Same construction in scripts/lib/fit.mjs; a candidate, not a fitted covariate.
    corridor_stake: corridorStakeFor(world, a.id, b.id),
  };
  for (const t of world.templates) {
    const fit = world.fits[t.id]; if (!fit || fit.status !== 'fitted' || t.unit !== 'dyad-year') continue;
    const eta = linearPredictor(fit, t, feats); if (eta != null) out[t.id] = sigmoid(eta);
  }
  return out;
}

/** The world as the record layer reads it: the simulated actors, not the panel. The fitter passes the panel instead. */
export function worldLook(world) {
  return {
    live: (id) => world.actors[id] != null,
    atWar: (id) => world.actors[id]?.cur.at_war ?? null,
    intrastate: (id) => world.actors[id]?.cur.intrastate ?? null,
    gdpGrowth: (id) => world.actors[id]?.cur.gdp_growth ?? null,
    greatPower: (id) => world.actors[id]?.cur.great_power ?? null,
    successor: (id) => world.lifecycle?.successors?.[id] ?? null,
  };
}
/** The dampener for one pair, with the year's record index built once per step. */
function corridorStakeFor(world, a, b) {
  if (!world.corridors?.length) return 0;
  if (world.corridorIdxYear !== world.year) { world.corridorIdx = corridorIndex(world.corridors, worldLook(world)); world.corridorIdxYear = world.year; }
  return corridorStake(world.corridorIdx, a, b, world.allied);
}

/** Annual probability of a status/control transition for one corridor or chokepoint record in the current state. */
export function corridorHazards(world, entry) {
  const t = world.templates.find(x => x.unit === CORRIDOR_UNIT[entry.rec.kind]);
  const fit = t && world.fits[t.id]; if (!fit || fit.status !== 'fitted') return null;
  const feats = corridorFeatures(entry.rec, entry.state, worldLook(world));
  for (const c of t.covariates) { if (feats[c.var] == null) { const d = outsideDefault(c, world.year); if (d == null) return null; feats[c.var] = d; } }
  const eta = linearPredictor(fit, t, feats); if (eta == null) return null;
  return { template: t.id, event: t.event, p: sigmoid(eta) };
}
/** Where a fired transition goes: drawn from the status mix the record layer showed at asOf (never a typed number). */
function drawCorridorStatus(world, entry, rng) {
  const kind = world.corridorMix?.[entry.rec.kind] ?? {};
  const from = kind[entry.state.status];
  let opts = from ? Object.entries(from) : null;
  if (!opts?.length) {   // an unseen origin status: fall back to every status this kind has ever moved to, minus the current one
    const all = {}; for (const row of Object.values(kind)) for (const [to, n] of Object.entries(row)) all[to] = (all[to] ?? 0) + n;
    opts = Object.entries(all).filter(([to]) => to !== entry.state.status);
  }
  if (!opts.length) return entry.state.status;
  const tot = opts.reduce((s, [, n]) => s + n, 0); let u = rng() * tot;
  for (const [to, n] of opts) { u -= n; if (u <= 0) return to; }
  return opts[opts.length - 1][0];
}

/** Effects of a fired event on state — the generic rewrites. */
function applyActorEvent(world, a, kind, rng) {
  const y = world.year; a.fired[kind] = y;
  switch (kind) {
    case 'irregular_exit': applyActorEvent(world, a, 'leader_exit', rng); a.cur.leader_irregular_entry = 1; if (a.cur.regime > 0 && rng() < 0.5) a.cur.regime -= 1; break;
    case 'leader_exit': a.cur.leader_tenure = 0; a.cur.leader_age = 45 + Math.floor(rng() * 25); a.cur.leader_military = rng() < 0.2 ? 1 : 0; a.recent.leader_exit[0] = 1; break;
    case 'coup': a.cur.coup_attempt = 1; if (rng() < 0.5) { a.cur.coup_success = 1; applyActorEvent(world, a, 'leader_exit', rng); a.cur.leader_irregular_entry = 1; if (a.cur.regime > 0 && rng() < 0.6) a.cur.regime -= 1; } break;
    case 'autocratization_onset': case 'autocratize_step': if (a.cur.regime > 0) a.cur.regime -= 1; a.cur.polyarchy = Math.max(0, (a.cur.polyarchy ?? 0.5) - 0.1); a.cur.regime_down = 1; break;
    case 'democratization_onset': case 'democratize_step': if (a.cur.regime < 3) a.cur.regime += 1; a.cur.polyarchy = Math.min(1, (a.cur.polyarchy ?? 0.5) + 0.1); a.cur.regime_up = 1; break;
    case 'autocratic_closure': if (a.cur.regime > 0) a.cur.regime -= 1; a.cur.polyarchy = Math.max(0, (a.cur.polyarchy ?? 0.5) - 0.1); a.cur.regime_down = 1; break;
    case 'liberal_erosion': a.cur.regime = 2; a.cur.polyarchy = Math.max(0, (a.cur.polyarchy ?? 0.5) - 0.1); a.cur.regime_down = 1; break;
    case 'democratic_deepening': a.cur.regime = 3; a.cur.polyarchy = Math.min(1, (a.cur.polyarchy ?? 0.5) + 0.1); a.cur.regime_up = 1; break;
    case 'intrastate_onset': a.cur.intrastate = 1; a.conflictLeft = 1 + Math.floor(rng() * 6); a.cur.gdp_pc *= 0.97; break;
    default: throw new Error(`applyActorEvent: no state rewrite for '${kind}' — a simulated template must change state`);
  }
}
// every template the engine simulates must have a rewrite above; checked once per world at the first step
const HANDLED = new Set(['irregular_exit', 'leader_exit', 'coup', 'autocratization_onset', 'autocratize_step', 'democratization_onset', 'democratize_step', 'autocratic_closure', 'liberal_erosion', 'democratic_deepening', 'intrastate_onset']);

/** Introduce actors whose system membership starts this year and retire those whose membership ends. */
function stepLifecycle(world, y) {
  const lc = world.lifecycle; if (!lc) return;
  const { panel, events, ids, Y0, successors } = lc; const i = y - Y0;
  if (y > panel.meta.y1 || i < 0) return;   // past the panel's last year there are no dated membership facts: the universe stands as it is (a forward run is not a retirement)
  for (const id of ids) {
    const vars = panel.actors[id]; const alive = vars.live?.[i] === 1; const present = world.actors[id] != null;
    // as-of dating: an actor introduced inside the horizon enters with its state as last observed at asOf, not with the
    // panel row of the year it appears (which is an observation the forecaster cannot have). Where the panel has nothing
    // for it at asOf its covariates are null and it simply carries no hazard — an honest miss, not a seeded truth.
    if (alive && !present) {
      const a = buildActorState({ panel, events, id, vars, at: Math.min(y, world.asOf), asOf: world.asOf });
      a.imputed = [];
      for (const [v, x] of Object.entries(world.entryPrior ?? {})) if (x != null && a.cur[v] == null) { a.cur[v] = x; a.prev[v] = x; a.imputed.push(v); }
      if (a.cur.gdp_pc != null && a.cur.log_gdp_pc == null) a.cur.log_gdp_pc = Math.log(a.cur.gdp_pc);
      // flags and ties an actor that does not yet exist cannot have: a structural zero, not a missing value
      for (const v of ['at_war', 'intrastate', 'mid_force', 'mid_war', 'coup_attempt', 'coup_success', 'interstate_ucdp', 'pact_usa', 'pact_rus', 'defence_pacts', 'sp_client_any', 'sp_client_one', 'great_game', 'aid_conditionality']) { a.cur[v] ??= 0; a.prev[v] ??= 0; }
      world.actors[id] = a;
    }
  }
  for (const id of ids) {
    const vars = panel.actors[id]; const alive = vars.live?.[i] === 1; const a = world.actors[id];
    if (alive || !a) continue;
    const succ = successors[id] && world.actors[successors[id]];
    if (succ) {   // the successor inherits the rivalry memory: the dispute history is the state's, not the name's
      for (const [k, yr] of [...world.dyadRecent]) { const [p, q] = k.split('|'); if (p !== id && q !== id) continue; const other = p === id ? q : p; if (other === succ.id) continue; const nk = pairKey(succ.id, other); world.dyadRecent.set(nk, Math.max(world.dyadRecent.get(nk) ?? -1e9, yr)); world.dyadRecent.delete(k); }
      for (const v of Object.keys(succ.recent)) succ.recent[v] = succ.recent[v].map((x, j) => (x || a.recent[v]?.[j] ? 1 : 0));
    } else for (const k of [...world.dyadRecent.keys()]) { const [p, q] = k.split('|'); if (p === id || q === id) world.dyadRecent.delete(k); }
    delete world.actors[id];
  }
}

/** One annual step: lifecycle, structural drift, then hazards. */
export function stepYear(world, rng, opts = {}) {
  world.year += 1; const y = world.year; const fired = [];
  stepLifecycle(world, y);
  const ids = Object.keys(world.actors);
  // a war already running at asOf keeps running: it is given a residual drawn from the same run-length distribution
  // as a fresh war (an approximation — the panel dates the spell's start but its end is past the as-of date).
  if (world.warSeed) { for (const id of world.warSeed) { const a = world.actors[id]; if (a) a.warLeft = drawWarDuration(world, rng); } world.warSeed = null; }
  // snapshot prev, structural drift
  for (const id of ids) {
    const a = world.actors[id]; a.prev = { ...a.cur };
    const warShock = a.cur.at_war ? -0.04 : 0;
    const shock = (rng() - 0.5) * 0.04;
    // the trailing 10-year growth rate is a state, not a constant: it decays toward the panel's long-run mean.
    // Freezing it for a 20-year horizon projected the 1910–20 collapse forward to 1940 (one actor's gdp_pc fell to
    // 1/12 of the observed value, 3.3 sd on a covariate carrying −0.37 on autocratic_closure).
    a.driftYears = (a.driftYears ?? 0) + 1;
    const g0 = GROWTH_MEAN + (a.growth - GROWTH_MEAN) * Math.pow(GROWTH_PHI, a.driftYears);
    if (a.cur.gdp_pc != null) { const g = g0 + warShock + shock; a.cur.gdp_pc *= Math.exp(g); a.cur.gdp_growth = g; a.cur.log_gdp_pc = Math.log(a.cur.gdp_pc); }
    if (a.cur.population != null) a.cur.population *= Math.exp(a.popGrowth);
    if (a.cur.tpop != null) a.cur.tpop *= Math.exp(a.popGrowth);
    if (a.cur.leader_age != null) { a.cur.leader_age += 1; a.cur.leader_tenure = (a.cur.leader_tenure ?? 0) + 1; }
    // information access diffuses as a wave: logistic toward 1, rate from the observed 1990–2020 global trajectory (~0.15/yr), slow before 1985
    // superpower structure: bipolarity is a world-level state (1947–1991 historically; later a function of how many actors hold >10% CINC)
    a.cur.bipolar = y >= 1947 && y <= 1991 ? 1 : 0;
    a.cur.sp_client_any = (a.cur.pact_usa || a.cur.pact_rus) ? 1 : 0;
    a.cur.sp_client_one = ((a.cur.pact_usa ? 1 : 0) + (a.cur.pact_rus ? 1 : 0)) === 1 ? 1 : 0;
    a.cur.great_game = a.cur.bipolar && a.cur.sp_client_any ? 1 : 0;
    // unipolar democracy-promotion era (1992–2016 historically); aid dependence held at last observed level
    a.cur.unipolar_us = y >= 1992 && y <= 2016 ? 1 : 0;
    // aid conditionality is zero by construction outside the promotion era — a structural zero, not a missing value
    a.cur.aid_conditionality = a.cur.unipolar_us ? Math.min(a.cur.aid_gni ?? 0, 30) / 10 : 0;
    // major-power status is frozen at as-of, like the alliance and border graphs and like world.nukes: who stops being a
    // great power in 1917, 1918, 1943 and 1945 is an outcome of the horizon, not a fact the forecaster holds. Reading the
    // panel forward was worth ~0.03 of the pre-1946 dyad AUC (it gates the politically-relevant filter and carries
    // major_power_any). Great-power entry/exit as a modelled hazard is an escalation (docs/escalations.md).
    a.cur.hegemon_x_client = a.cur.pact_usa ? (a.cur.hegemon_regime ?? 3) : 0;   // panel var: the hegemon's own regime score, no actor id in the engine
    if (a.cur.info_access != null) { const r = y >= 1985 ? 0.15 : 0.03; const x = Math.max(0.02, a.cur.info_access); a.cur.info_access = Math.min(1, x + r * x * (1 - x)); }
    // clear annual flags; decay conflicts
    a.cur.coup_attempt = 0; a.cur.coup_success = 0; a.cur.at_war = 0; a.cur.mid_force = 0; a.cur.mid_war = 0; a.cur.regime_up = 0; a.cur.regime_down = 0;
    if (a.cur.intrastate) { a.conflictLeft = (a.conflictLeft ?? 1) - 1; if (a.conflictLeft <= 0) a.cur.intrastate = 0; }
    for (const v of Object.keys(a.recent)) { a.recent[v].unshift(0); a.recent[v].length = 5; }
    if (a.prev.coup_attempt) a.recent.coup_attempt[0] = 1; if (a.prev.intrastate) a.recent.intrastate[0] = 1; if (a.prev.mid_force) a.recent.mid_force[0] = 1; if (a.prev.at_war) a.recent.at_war[0] = 1;
  }
  // interstate war duration (era-1914-1945/engine-5): at_war is a spell, not a one-year flag. The drift loop above
  // cleared it; every war still running re-sets it on both belligerents, so lag1(at_war) and the war shock mean in
  // simulation what they mean in the panel, whose observed spells are 3.0 years long on average.
  for (const [k, left] of [...world.warSpells]) {
    const i = k.indexOf('|'); const A = world.actors[k.slice(0, i)], B = world.actors[k.slice(i + 1)];
    if (!A || !B) { world.warSpells.delete(k); continue; }
    A.cur.at_war = 1; B.cur.at_war = 1;
    if (left <= 1) world.warSpells.delete(k); else world.warSpells.set(k, left - 1);
  }
  for (const id of ids) { const a = world.actors[id]; if (a.warLeft > 0) { a.cur.at_war = 1; a.warLeft -= 1; } }
  // actor hazards
  for (const id of ids) {
    const a = world.actors[id]; const hz = actorHazards(world, a);
    for (const [kind, p] of Object.entries(hz)) {
      if (rng() < p) {
        const t = world.templates.find(t => t.id === kind); const ev = { kind: t.event, template: kind, actor: id, year: y };
        const rewrite = ev.kind === 'coup' ? 'coup' : (t.event_filter ? kind : ev.kind);
        if (!HANDLED.has(rewrite)) throw new Error(`stepYear: template '${kind}' fires but applyActorEvent has no rewrite for '${rewrite}'`);
        fired.push(ev); applyActorEvent(world, a, rewrite, rng);
      }
    }
  }
  // dyad hazards. A war nests inside a dispute (era-1870-1914/engine-7): CoW hostility level 5 is a subset of use of
  // force and the labels are built that way, so the engine draws the dispute first and the war only inside it, at
  // P(war | dispute) = p_war / max(p_force, p_war). The marginal is unchanged where p_war <= p_force and capped at
  // the dispute's own probability where the war model runs hotter than the dispute model. A pair already at war has
  // no fresh onset to draw: the spell it is in is the same conflict.
  const warPairs = [];   // the pairs at war this year: fired onsets plus any spell still running
  if (!opts.skipDyads) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = world.actors[ids[i]], b = world.actors[ids[j]]; const k = pairKey(a.id, b.id);
    const hz = dyadHazards(world, a, b);
    const suppressed = world.warSpells.has(k);   // a pair already inside a war spell has no fresh onset to draw
    const u1 = hz.mid_force != null ? rng() : null;
    const force = u1 != null && u1 < hz.mid_force && !suppressed;
    if (force) { fired.push({ kind: 'mid_force', a: a.id, b: b.id, year: y }); world.dyadRecent.set(k, y); a.cur.mid_force = 1; b.cur.mid_force = 1; }
    const u2 = hz.mid_war != null ? rng() : null;
    const pWar = suppressed ? 0 : NO_NESTING ? hz.mid_war : force ? hz.mid_war / Math.max(hz.mid_force ?? 0, hz.mid_war) : 0;
    if (u2 != null && u2 < pWar) {
      fired.push({ kind: 'mid_war', a: a.id, b: b.id, year: y }); world.dyadRecent.set(k, y);
      a.cur.at_war = 1; b.cur.at_war = 1; a.cur.mid_war = 1; b.cur.mid_war = 1;
      warPairs.push([a.id, b.id]);
      if (world.warDurations) { const dur = drawWarDuration(world, rng); if (dur > 1) world.warSpells.set(k, dur - 1); }
    }
  }
  if (world.coalition && !opts.skipDyads) fired.push(...coalitionJoin(world, rng, warPairs, y));
  // the corridor / chokepoint layer (era-1914-1945/corridors-7), drawn last in the step so that a transit state that
  // went to war this year is visible to the corridor hazard — the fit reads the same contemporaneous at_war. A fired
  // transition rewrites the record's status from the observed outcome mix; control transfer is not simulated (the
  // competing-risks control model over claimants in docs/schema.md is still an escalation), so a simulated record
  // moves only through status while the label counts control changes too.
  for (const entry of world.corridors ?? []) {
    const hz = corridorHazards(world, entry); if (!hz) continue;
    if (rng() < hz.p) {
      const to = drawCorridorStatus(world, entry, rng);
      fired.push({ kind: hz.event, template: hz.template, record: entry.rec.id, year: y, from: entry.state.status, status: to });
      entry.state = { status: to, controller: entry.state.controller };
    }
  }
  // the war graph the next year's relevance clause reads: this year's onsets, its joiners, and any spell still open
  if (world.coalition) {
    const spans = new Map(); for (const [a, b] of warPairs) spans.set(pairKey(a, b), [[y, y]]);
    for (const k of world.warSpells.keys()) if (!spans.has(k)) spans.set(k, [[y, y]]);
    world.warPartners = warPartnersAt(spans, y);
  }
  world.log.push(...fired);
  return fired;
}

/**
 * Coalition joining (era-1914-1945/engine-1). A fired war is a war between two *sides*, not two states: each defence-pact
 * ally of each side is drawn into it with probability `p_join`, and every joiner × opposing-side pair becomes a war of
 * its own. One round — a joiner's own allies are not drawn, so a cascade cannot run away on alliance chains alone.
 * `p_join` is calibrated on the `sides:` lists in data/history/events.yaml and declared in data/templates.yaml; the
 * `warPairs` array is mutated so the pairs the joiners make are in next year's war graph too.
 */
function coalitionJoin(world, rng, warPairs, y) {
  const out = []; const p = world.coalition.pJoin; if (!(p > 0)) return out;
  const allyOf = world.allyOf ?? new Map();
  for (const [ida, idb] of warPairs.slice()) {
    const sides = [[ida], [idb]], joined = [[], []];
    for (let s = 0; s < 2; s++) {
      const cands = new Set(); for (const m of sides[s]) for (const c of allyOf.get(m) ?? []) cands.add(c);
      for (const c of [...cands].sort()) {
        if (c === ida || c === idb || !world.actors[c]) continue;
        if (rng() < p) joined[s].push(c);
      }
    }
    for (let s = 0; s < 2; s++) for (const c of joined[s]) {
      if (joined[1 - s].includes(c)) continue;   // an ally of both sides stays out
      const j = world.actors[c]; j.cur.at_war = 1; j.cur.mid_war = 1; j.cur.mid_force = 1;
      for (const o of [...sides[1 - s], ...joined[1 - s]]) {
        const k = pairKey(c, o); if (world.warSpells.has(k) || c === o) continue;
        // a coalition pair is a dispute as well as a war: the labels nest (mid_war ⊂ mid_force) and so does the engine
        out.push({ kind: 'mid_force', a: c, b: o, year: y, via: 'coalition' });
        out.push({ kind: 'mid_war', a: c, b: o, year: y, via: 'coalition' });
        world.dyadRecent.set(k, y); warPairs.push([c, o]);
        if (world.warDurations) { const dur = drawWarDuration(world, rng); if (dur > 1) world.warSpells.set(k, dur - 1); }
      }
    }
  }
  return out;
}

/** Run an ensemble from a world factory. Returns per-run event logs and aggregated probabilities. */
export function runEnsemble(makeWorld, { runs = 200, horizon = 20, seed = 1, skipDyads = false, track = false } = {}) {
  const regimeHist = {};  // actor -> Uint32Array(horizon*4): counts of regime level per year offset
  const gdpRuns = {};     // actor -> Float32Array(runs*horizon)
  const infoRuns = {};
  const anyBy = {};   // `${kind}|${actor}` -> count of runs with ≥1 event within horizon
  const countBy = {}; // expected counts
  const dyadAny = {};
  const yearHist = {}; // `${kind}|${actor}` -> [count per year offset]
  const firstBy = {};  // first-occurrence histogram, for P(any within k years)
  for (let r = 0; r < runs; r++) {
    const rng = mulberry32(seed * 7919 + r); const w = makeWorld();
    const seen = new Set(), seenD = new Set();
    for (let h = 1; h <= horizon; h++) {
      const fired = stepYear(w, rng, { skipDyads });
      if (track) for (const [id, a] of Object.entries(w.actors)) {
        if (a.cur.regime != null) { const hh = (regimeHist[id] ??= new Uint32Array(horizon * 4)); hh[(h - 1) * 4 + Math.max(0, Math.min(3, Math.round(a.cur.regime)))]++; }
        if (a.cur.gdp_pc != null) (gdpRuns[id] ??= new Float32Array(runs * horizon))[r * horizon + (h - 1)] = a.cur.gdp_pc;
        if (a.cur.info_access != null) (infoRuns[id] ??= new Float32Array(runs * horizon))[r * horizon + (h - 1)] = a.cur.info_access;
      }
      for (const e of fired) {
        const unit = e.actor ?? e.record;   // actor-year, corridor-year and chokepoint-year units all key the same way
        if (unit) { const k = `${e.template ?? e.kind}|${unit}`; countBy[k] = (countBy[k] ?? 0) + 1; (yearHist[k] ??= new Array(horizon).fill(0))[h - 1]++; if (!seen.has(k)) { seen.add(k); anyBy[k] = (anyBy[k] ?? 0) + 1; (firstBy[k] ??= new Array(horizon).fill(0))[h - 1]++; } }
        else { const k = `${e.kind}|${pairKey(e.a, e.b)}`; if (!seenD.has(k)) { seenD.add(k); dyadAny[k] = (dyadAny[k] ?? 0) + 1; (firstBy[k] ??= new Array(horizon).fill(0))[h - 1]++; } }
      }
    }
  }
  const norm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / runs]));
  const pAnyWithin = (k, years) => (firstBy[k] ?? []).slice(0, years).reduce((a, b) => a + b, 0) / runs;
  const cumulative = (k) => { let c = 0; return (firstBy[k] ?? new Array(horizon).fill(0)).map(x => (c += x) / runs); };
  const quantiles = (arr) => { const out = []; for (let h = 0; h < horizon; h++) { const col = []; for (let r = 0; r < runs; r++) { const v = arr[r * horizon + h]; if (v > 0) col.push(v); } col.sort((a, b) => a - b); out.push(col.length ? [col[Math.floor(col.length * 0.1)], col[Math.floor(col.length * 0.5)], col[Math.floor(col.length * 0.9)]] : null); } return out; };
  const tracks = track ? {
    regime: Object.fromEntries(Object.entries(regimeHist).map(([id, hh]) => [id, Array.from({ length: horizon }, (_, h) => { const row = [0, 1, 2, 3].map(l => hh[h * 4 + l]); const n = row.reduce((a, b) => a + b, 0) || 1; return row.map(x => +(x / n).toFixed(3)); })])),
    gdp_pc: Object.fromEntries(Object.entries(gdpRuns).map(([id, arr]) => [id, quantiles(arr)])),
    info_access: Object.fromEntries(Object.entries(infoRuns).map(([id, arr]) => [id, quantiles(arr)])),
  } : null;
  return { runs, horizon, pAny: norm(anyBy), expected: norm(countBy), pAnyDyad: norm(dyadAny), yearHist, pAnyWithin, cumulative, firstBy, tracks };
}
