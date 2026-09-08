// Radiant engine v0 — annual-step stochastic world model, pure ESM (node + browser).
// State is built from the historical panel as-of a year; hazards are the fitted templates (data/fits.json);
// events fire per actor-year / dyad-year and rewrite state; a thin structural layer drifts the slow variables.
// No country names anywhere in this file.

import { POLARITY, normalise, smoothShares, classify, eraFlags, conditionality, greatGame, infoStep, INFO_WAVE } from './polarity.js';

/** The dyadic conflict-onset kinds the rivalry trace remembers. MID stops in 2010; UCDP's interstate onsets run to
 *  2024, and without them the memory is empty at every origin past the MID window (era-1991-2026-r2/engine-4). */
export const DYADIC_DISPUTE = new Set(['mid_force', 'mid_war', 'interstate_onset']);
import { PRESENCE, presenceIndex, lastFall, patronMap, patronFeatures, guarantorLevel, guarantorFall, hostLevel } from './presence.js';
import { IMPAIRED, RESOLVED, SPELL_UNITS, warSpells, spellAge, territoryFirstYear, territoryStateAt,
  warEndFeatures, contestFeatures, reopenFeatures } from './termination.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
// Structural drift constants. GROWTH_MEAN is the panel's live-actor mean log growth 1900–2000 (n=8,453, mean 0.0172,
// sd 0.0705); GROWTH_PHI gives the deviation from it a ~4-year half-life. Source: data/panel.json gdp_growth.
const GROWTH_MEAN = 0.0172, GROWTH_PHI = 0.85;
// POP_GROWTH_MEAN is the same statistic on `population`: the panel's live-actor mean log population growth
// 1900–2000 (n=9,977, mean 0.0174). It is the fallback for an actor nobody simulates in stepPolarity's projection
// of capability MASS (era-1991-2026-r2/engine-5).
const POP_GROWTH_MEAN = 0.0174;
// Ablation switch (node only), like RIVALRY_DECAY: INFO_DIFFUSION=switch restores the hand-typed diffusion rate the
// fitted information wave replaced (0.15/yr from 1985, 0.03 before), so the two halves of package 9 — the derived
// eras and the derived diffusion — can be scored apart. Unset (the default) uses the fitted wave.
const INFO_TYPED_RATE = (typeof process !== 'undefined' && process.env && process.env.INFO_DIFFUSION === 'switch') ? 0.15 : null;
const infoDiffuse = (x, y, wave) => {
  if (INFO_TYPED_RATE == null) return infoStep(x, y, wave);
  const r = y >= 1985 ? INFO_TYPED_RATE : 0.03;
  return Math.min(1, x + r * x * (1 - x));
};
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

/**
 * The termination layer (operator/termination, package 8). Four fitted hazards replace four typed constants:
 * a war's length (was: one year, or a resampled run length), an internal conflict's length (was: 1 + U{0..5}),
 * an impaired corridor or chokepoint's return to service (was: only through the status template's outcome mix), and
 * a territorial contest's settlement (was: territories were not in the engine at all). Every one of them draws from
 * data/fits.json through the same covariate blocks scripts/lib/fit.mjs estimated them on (src/engine/termination.js).
 */
const spellTemplate = (templates, unit, spell = null) => (templates ?? []).find(t => t.unit === unit && (spell == null || t.spell === spell));
/** Annual probability for one spell-year, given its already-assembled covariate block. null = not drawable. */
function spellHazard(world, t, feats) {
  const fit = t && world.fits[t.id]; if (!fit || fit.status !== 'fitted') return null;
  for (const c of t.covariates) { if (feats[c.var] == null) { const d = outsideDefault(c, world.year); if (d == null) return null; feats[c.var] = d; } }
  const eta = linearPredictor(fit, t, feats);
  return eta == null || !Number.isFinite(eta) ? null : sigmoid(eta);
}

// Ablation switches, node only (the browser build reads nothing here): ENGINE_ABLATE=war_duration,war_nesting turns a
// mechanism off so the backtest can score it on its own. With both off the dyad draw is the pre-2026-09-07 one, and the
// random stream is deliberately the same either way — two draws per dyad-year — so an ablation differs by mechanism only.
const ABLATE = ((typeof process !== 'undefined' && process.env && process.env.ENGINE_ABLATE) || '').split(',').map(s => s.trim());
const NO_NESTING = ABLATE.includes('war_nesting');
// ENGINE_ABLATE=corridor_layer takes the corridor / chokepoint layer out of the world entirely (era-1914-1945/corridors-7).
// With it off the engine consumes no random numbers for records, so a run reproduces the pre-2026-09-07 random stream
// exactly — which is how the claim "the dyadic numbers moved by stream noise only" is checked rather than asserted.
const NO_CORRIDORS = ABLATE.includes('corridor_layer');
// era-1945-1991-r2/statistics-3, engine-5: the hand-typed regime decrements on an irregular exit and a successful coup.
// They are OFF by default from 2026-09-07 (the fitted autocratization templates already contain the coup-caused
// downgrades); ENGINE_ABLATE=coup_regime_step turns them back on so the removal can be scored against itself.
const COUP_REGIME_STEP = ABLATE.includes('coup_regime_step');
// era-1945-1991-r2/statistics-3, engine-4: irregular_exit is declared `event: leader_exit` with
// `event_filter: { irregular: 1 }`, so its events are a strict SUBSET of leader_exit's. The engine drew the two as
// independent competing risks and applied a leader replacement for each, which fired leader turnover ~2x the observed
// rate and irregular exits ~5x. They are nested from 2026-09-07 exactly as mid_war nests inside mid_force;
// ENGINE_ABLATE=exit_nesting restores the independent draws.
const NO_EXIT_NESTING = ABLATE.includes('exit_nesting');
// operator/termination: one switch per fitted ending, so each can be scored on its own. With all four off the engine
// is the pre-2026-09-07 one — a one-year war, a uniform 1..6-year internal conflict, no reopening hazard and no
// territory layer — except that the war half is also gated by `duration.status` in the data (see warDurationOn).
const NO_TERM = {
  war: ABLATE.includes('war_duration') || ABLATE.includes('war_end'),
  intrastate: ABLATE.includes('intrastate_end'),
  record: ABLATE.includes('record_reopen'),
  territory: ABLATE.includes('contest_settle'),
};
/**
 * Whether interstate war has a duration at all. Declared in the data, not here: `duration.status` on the dyadic war
 * template in data/templates.yaml. Until 2026-09-07 the length was a resample of the panel's own at_war run lengths
 * and the mechanism stood at `candidate` (built, measured, not promoted — the numbers are in that file under
 * `rejected: war_duration`). It is now the fitted `war_end` hazard (`duration.draw: war_end`), drawn once per running
 * spell per year. ENGINE_ABLATE=war_duration forces it off whatever the data says.
 */
const warDurationOn = (templates) => {
  if (ABLATE.includes('war_duration')) return false;
  // WAR_DURATION_ON=1 runs the candidate without editing the data, the way COALITION_ON does (node only).
  const env = (typeof process !== 'undefined' && process.env) || {};
  if (env.WAR_DURATION_ON) return true;
  return (templates ?? []).some(t => t.unit === 'dyad-year' && t.duration?.status === 'active');
};

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
// IMPAIRED comes from src/engine/termination.js: the same set defines a record's impaired spell and the reopen sample
const BASE_STATUS = { chokepoint: 'open', corridor: 'built' };
const ACTIVE_STATUS = new Set(['open', 'built', 'building', 'contested']);   // carries traffic (or will): stake > 0
// the record's history sorted once, memoised on the record itself (non-enumerable: a record is also serialised into
// public/world.json by scripts/build-world.mjs, and a memo must never turn into published data)
/** Statuses in which a record is not yet in service: its next transition is a construction stage, not a seizure. */
const BUILDING = new Set(['planned', 'building']);

const histOf = (rec) => {
  if (!rec.__hist) Object.defineProperty(rec, '__hist', { value: [...(rec.history ?? [])].sort((a, b) => a.year - b.year), enumerable: false });
  return rec.__hist;
};

/**
 * The first year the record is a unit: the year its dated history opens, clipped to the template window.
 *
 * It used to be the window start whenever the first row was an impairment, on the reasoning that a strait must have
 * existed unimpaired before it was closed. That is true of the strait and false of the RECORD: it back-dated four
 * chokepoints whose first coded entry is 1942, 1984, 1996 and 2023 to 1869 and handed each of them 70-150 years of
 * synthesised `open` state carrying no transition — 469 record-years of guaranteed non-events, 41% of the fitted
 * sample, reported by the backtest as born and at risk (era-1870-1914-r2/statistics-3, engine-3). Existence is now
 * declared rather than inferred: a record whose history genuinely opens before its first dated row says so with
 * `exists_from:` and a source, and everything else enters when its history does.
 */
export function corridorFirstYear(rec, windowFrom) {
  const h = histOf(rec); if (!h.length) return null;
  const first = rec.exists_from != null ? Math.floor(rec.exists_from) : Math.floor(h[0].year);
  return Math.max(windowFrom, first);
}
/**
 * The last year a record is a unit at all — era-1991-2026-r2/corridors-6. Records had `exists_from` and no
 * counterpart, so a corridor whose thing stopped existing decades ago went on contributing non-event record-years
 * forever: 952 of the 1,479 corridor-years in 1992-2025 came from 28 records whose last dated row is before 1950,
 * and 102 of the 133 impaired record-years in that window were three pipelines sitting closed since 1948, 1944 and
 * 1990 — the exact artefact data/templates.yaml's own record_reopen note describes for the pre-1946 sample. Actors
 * (data/history/actors.yaml `retired`) and waves (data/waves.yaml `retired`) both had an ending; records did not.
 * `exists_until` + `exists_until_source` on the record is that ending, and it is honoured here so the engine, the
 * fitter and the backtest all stop at the same year.
 */
export function corridorLastYear(rec, windowTo) {
  return rec.exists_until != null ? Math.min(windowTo, Math.floor(rec.exists_until)) : windowTo;
}
/** Whether the record exists as a unit in `year` (its history has opened and it has not been retired). */
export const corridorAlive = (rec, year, windowFrom = -Infinity) => {
  const f = corridorFirstYear(rec, windowFrom);
  return f != null && year >= f && year <= corridorLastYear(rec, Infinity);
};
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
  // the guarantor terms (operator/presence): the strongest great-power station near the record or on one of its
  // transit states, and whether that level has fallen inside the withdrawal window. `look.guarantor` returns the
  // level and the year of the last fall; the recency is computed here against `look.year`, so in a forward run the
  // frozen as-of configuration still lets a withdrawal age out of the window instead of firing for twenty years.
  const g = look.guarantor ? look.guarantor(rec, T) : null;
  return {
    adjacent_war: war, transit_at_war_any: war,                    // the same construction under each template's name
    adjacent_intrastate: anyOf(look.intrastate),
    // the record's own status word, read the way contest_reversible reads a territory's: a record still being built
    // changes status because construction has stages, one in service changes status because somebody takes it or
    // shuts it. Two processes under one hazard; without the term the base rate is the mixture.
    record_building: state?.status == null ? null : (BUILDING.has(state.status) ? 1 : 0),
    transit_gdp_growth_mean: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
    sponsor_great_power: sponsorLive ? (look.greatPower(sponsorLive) > 0 ? 1 : 0) : 0,
    n_transits: T.length,
    guarantor_presence: g?.level ?? null,
    guarantor_withdrawal: g == null || g.level == null ? null : (g.fall != null && look.year - g.fall <= PRESENCE.window ? 1 : 0),
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
export function corridorStake(index, a, b, allied, year = null) {
  const ra = index.byTransit.get(a), rb = index.byTransit.get(b);
  if (!ra && !rb) return 0;
  let s = 0;
  // era-1945-1991-r2/corridors-3: `load_bearing_for` is ONE undated map per record — the 2026 dependence weights —
  // read at every simulated year, so at as-of 1950 the dampener knew Japan's Gulf-oil dependence and Singapore's
  // Malacca dependence decades before either was true (Singapore was not a state until 1965). A record may now
  // declare `load_bearing_from: <year>`, the first year its weights are a claim about the world rather than a
  // back-projection, and it contributes nothing before it: silence is better than a 2026 number at 1950. Records
  // without the field keep the old behaviour and the limitation is declared on the corridor_stake candidate in
  // data/templates.yaml — dating the whole layer is a separate change.
  const one = (rec) => { if (year != null && rec.load_bearing_from != null && year < rec.load_bearing_from) return 0; let w = 0; for (const [c, lb] of Object.entries(rec.load_bearing_for ?? {})) { if (c === a || c === b) continue; if (allied.has(pairKey(c, a)) || allied.has(pairKey(c, b))) w += lb; } return w; };
  for (const rec of ra ?? []) s += one(rec);
  for (const rec of rb ?? []) if (!ra?.includes(rec)) s += one(rec);
  return Math.log1p(s);
}

/** Build one actor's state at year `at` from its panel row. `asOf` only marks which staleness is recorded. */
function buildActorState({ panel, events, id, vars, at, asOf }) {
  const Y0 = panel.meta.y0;
  const pv = (v, y) => { const arr = vars[v]; const i = y - Y0; return arr && i >= 0 && i < arr.length ? arr[i] : null; };
  // carry the last observation forward where a dataset ends before `at` (leaders age; flags reset to 0), and record
  // what that cost. Two maps, written for the as-of year only (operator / modern-capability, package 10):
  //   stale[v]  years since the panel last observed v for this actor — null where it never did
  //   carry[v]  how the value at as-of was produced when the panel does not observe it there:
  //             'last' (last observation carried), 'aged' (carried and advanced by the elapsed years — leader age and
  //             tenure), 'zero' (an event flag reset to no-event), 'trailing_mean' (gdp_growth from the trailing decade)
  // A value the panel observes at as-of appears in neither map. Every value that is NOT the panel's own measurement
  // is in both, so a viewer or a scorer can say "capability as of <asOf - stale.cinc>" instead of showing a carried
  // number as if it were current.
  const stale = {}, carry = {};
  const lastKnown = (v, y) => { const arr = vars[v]; for (let i = y - Y0; i >= Math.max(0, y - Y0 - 30); i--) if (arr[i] != null) return [arr[i], Y0 + i]; return [null, null]; };
  const FLAG = new Set(['coup_attempt', 'coup_success', 'mid_force', 'mid_war', 'regime_up', 'regime_down', 'interstate_ucdp']);
  const note = (y, v, yr, how) => { if (y !== asOf) return; stale[v] = yr == null ? null : y - yr; carry[v] = how; };
  // `introduced` is the panel's own first year for a column (data/panel.json meta): below it there is nothing to carry
  // forward, so the 30-year scan is skipped. Same result, and it keeps the modern columns (2000+) free on a 1870 world.
  const intro = panel.meta.introduced ?? {};
  const build = (y) => { const o = {}; for (const v of Object.keys(vars)) { const x = vars[v][y - Y0]; if (x != null) { o[v] = x; continue; } if (FLAG.has(v)) { o[v] = 0; note(y, v, lastKnown(v, y)[1], 'zero'); continue; } if (intro[v] != null && y < intro[v]) { o[v] = null; continue; } const [val, yr] = lastKnown(v, y); if (val == null) { o[v] = null; continue; } const aged = (v === 'leader_age' || v === 'leader_tenure'); o[v] = aged ? val + (y - yr) : val; note(y, v, yr, aged ? 'aged' : 'last'); } return o; };
  const cur = build(at);
  // trailing growth rates for the structural layer
  const g = []; for (let k = 1; k <= 10; k++) { const x = pv('gdp_growth', at - k); if (x != null) g.push(x); }
  const pg = []; for (let k = 1; k <= 10; k++) { const a = pv('population', at - k), b = pv('population', at - k - 1); if (a && b) pg.push(Math.log(a / b)); }
  // recent-event memory (for win5 covariates) seeded from the panel/events
  const recent = {};
  for (const v of ['coup_attempt', 'intrastate', 'mid_force', 'at_war']) { recent[v] = []; for (let k = 1; k <= 5; k++) { const x = pv(v, at - k); recent[v].push(x != null && x > 0 ? 1 : 0); } }
  recent.leader_exit = []; for (let k = 1; k <= 5; k++) recent.leader_exit.push(events.some(e => e.kind === 'leader_exit' && e.actor === id && Math.floor(e.year) === at - k) ? 1 : 0);
  const prev = build(at - 1);
  if (cur.gdp_growth == null && g.length) { cur.gdp_growth = g.reduce((a, b) => a + b, 0) / g.length; stale.gdp_growth = null; carry.gdp_growth = 'trailing_mean'; }
  // operator/termination: the first year of the internal-conflict run the actor is in at `at`, so a spell already
  // running when the horizon opens enters the termination hazard with its observed duration rather than at age 0.
  const onConflict = (y) => (pv('intrastate', y) ?? 0) > 0;
  const conflictStart = onConflict(at) ? at - spellAge(onConflict, at) : null;
  cur.conflict_duration = conflictStart == null ? null : at - conflictStart;
  return { id, cur, prev, recent, stale, carry, conflictStart, growth: g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0.015, popGrowth: pg.length ? pg.reduce((a, b) => a + b, 0) / pg.length : 0.01, fired: {} };
}

/**
 * The derived world state at a year: projection-weighted capability shares (raw and smoothed), the democratic share
 * of the system, and the polarity they classify to — operator / derived-polarity (package 9). Built over every actor
 * the panel has live at asOf and not only over the simulated universe, because a share is a share of the whole
 * system: dropping the 130 states nobody simulates would rescale every pole. The panel's own columns are read with
 * the same last-observation carry buildActorState uses, so an as-of year the sources do not reach yet (capability
 * ends before the forecast does) starts from the last year they do.
 */
function initPolarity(panel, asOf, actors) {
  const Y0 = panel.meta.y0;
  const last = (vars, v) => { const arr = vars[v]; if (!arr) return null; for (let i = Math.min(asOf - Y0, arr.length - 1); i >= Math.max(0, asOf - Y0 - 30); i--) if (arr[i] != null) return arr[i]; return null; };
  // check(operator/derived-polarity): pol_mass/pol_share are one year's share of one distribution, not an actor
  // attribute, so they carry only PAST the column's own last measured year — the case this carry exists for. Reading
  // them back through a mid-series gap injects mass the panel never gave that actor and rescales every pole: at as-of
  // 1950 a live-but-unmeasured actor's 1945 share (0.207) came back as the second-ranked pole and the engine started
  // the world multipolar where the panel — and the fit — say bipolar, for as-of 1950-1954.
  const lastPol = (vars, v) => { const arr = vars[v]; if (!arr) return null; const end = Math.min(asOf, panel.meta.vars?.[v]?.last ?? asOf) - Y0, floor = end < asOf - Y0 ? Math.max(0, end - 30) : end; for (let i = Math.min(end, arr.length - 1); i >= floor; i--) if (arr[i] != null) return arr[i]; return null; };
  const raw = new Map(), sm = new Map(); let demShare = null;
  for (const [id, vars] of Object.entries(panel.actors)) {
    if (vars.live?.[asOf - Y0] !== 1) continue;
    const r = lastPol(vars, 'pol_mass'), k = lastPol(vars, 'pol_share');
    if (r != null) raw.set(id, r);
    if (k != null) sm.set(id, k);
    if (demShare == null) demShare = last(vars, 'dem_share');
  }
  const state = classify(normalise(sm));
  if (!state) return null;
  const hegemonRegime = last(panel.actors[state.hegemon] ?? {}, 'regime');
  const pol = {
    raw: normalise(raw), sm: normalise(sm), state, hegemonRegime,
    demShare, demShare0: demShare, simDem0: simDemShare(actors), simN0: simDemN(actors),
    // era-1991-2026-r2/engine-7: the denominator the panel's own dem_share is measured over (the actors V-Dem
    // scores), so a regime step inside a small simulated universe is not scored as if it moved the whole system.
    demN: (panel.meta.polarity ?? []).find(w => w.year === asOf)?.dem_share_n ?? null,
    simIds: new Set(Object.keys(actors)),
    infoWave: panel.meta.info_wave ?? INFO_WAVE,
    aidFrom: panel.meta.introduced?.aid_gni ?? 1960,
  };
  pol.flags = eraFlags({ polarity: state.polarity, hegemonRegime, demShare });
  return pol;
}
/** Democratic share over a set of actor states — the quantity the anti-coup norm is a threshold on. */
function simDemShare(actors) {
  let n = 0, d = 0;
  for (const a of Object.values(actors)) { if (a.cur.regime == null) continue; n++; if (a.cur.regime >= POLARITY.hegemon_regime_min) d++; }
  return n ? d / n : null;
}
/** How many actor states that share was measured over. */
function simDemN(actors) { let n = 0; for (const a of Object.values(actors)) if (a.cur.regime != null) n++; return n; }
/**
 * One year of the derived world state. Capability share follows relative output: an actor's projection mass is
 * carried forward multiplied by its own simulated growth (an actor nobody simulates grows at the panel's long-run
 * mean), the shares are renormalised, and the EWMA and the gap rule are the panel's. This is what lets a forecast
 * change polarity — the typed flags could not — and it is an assumption, not a measurement: CINC and military
 * expenditure track output only loosely, and the dyadic capability ratio still reads the carried `cinc`, not this.
 * The democratic share is anchored at the panel's value for the whole system and moved by the simulated universe's
 * own regime changes, so it is on the panel's scale whichever universe is being run.
 */
function stepPolarity(world) {
  const p = world.pol; if (!p) return;
  const raw = new Map();
  for (const [id, m] of p.raw) {
    if (p.simIds.has(id) && !world.actors[id]) continue;   // a state that has left the system leaves the distribution
    const a = world.actors[id];
    // era-1991-2026-r2/engine-5: TOTAL output growth, not per-capita. `gdp_growth` is log(gdp_pc / gdp_pc[-1]) —
    // per capita — while the quantity being projected is `pol_mass`, the geometric mean of the CINC share and the
    // military-expenditure share, and four of CINC's six indicators (tpop, upop, energy, iron/steel) are pure mass.
    // The population half was computed two lines from here (buildActorState's popGrowth, applied to population and
    // tpop in the drift loop) and thrown away, and the cross-actor spread in it is large: trailing 10-year
    // population growth to 2024 runs from +3.3%/yr to -0.3%/yr across live actors, a factor of 4.2 in projected
    // mass over a 40-year horizon that the projector simply omitted. The unsimulated-actor fallback takes the
    // panel's long-run means for both halves.
    const g = a && a.cur.gdp_growth != null ? a.cur.gdp_growth : GROWTH_MEAN;
    const pg = a ? (a.popGrowth ?? POP_GROWTH_MEAN) : POP_GROWTH_MEAN;
    raw.set(id, m * Math.exp(g + pg));
  }
  p.raw = normalise(raw);
  p.sm = smoothShares(p.sm, p.raw, POLARITY.lambda, new Set(p.raw.keys()));
  const st = classify(p.sm); if (st) p.state = st;
  const heg = world.actors[p.state.hegemon];
  if (heg && heg.cur.regime != null) p.hegemonRegime = heg.cur.regime;
  const sim = simDemShare(world.actors);
  // era-1991-2026-r2/engine-7: the simulated delta is a share over the SIMULATED universe and the anchor is a share
  // over the panel's, so adding one to the other unscaled amplified every regime step by nPanel/nSim — with
  // universe='modeled' (59-64 actors against the panel's 173 regime-scored ones) a single step moved the world share
  // by 1/64 instead of 1/173, about 2.7x, on a quantity that is then thresholded at 0.5. The delta is converted to
  // the panel's scale by the ratio of the two denominators; where the panel denominator is unknown it is left as it
  // was, which is the universe='all' case where the two are nearly the same number anyway.
  const scale = p.demN && p.simN0 ? p.simN0 / p.demN : 1;
  if (sim != null && p.simDem0 != null && p.demShare0 != null) p.demShare = Math.max(0, Math.min(1, p.demShare0 + (sim - p.simDem0) * scale));
  p.flags = eraFlags({ polarity: p.state.polarity, hegemonRegime: p.hegemonRegime, demShare: p.demShare });
}
/** Write the derived world state onto one actor — the same columns scripts/build-panel.mjs writes into the panel. */
function applyWorldState(world, id, a) {
  const p = world.pol; if (!p) return;
  for (const [k, v] of Object.entries(p.flags)) a.cur[k] = v;
  a.cur.n_poles = p.state.n_poles;
  a.cur.hegemon_share = p.state.hegemon_share;
  a.cur.is_hegemon = p.state.hegemon === id ? 1 : 0;
  a.cur.pol_mass = p.raw.get(id) ?? null;
  a.cur.pol_share = p.sm.get(id) ?? null;
  a.cur.dem_share = p.demShare;
  a.cur.hegemon_regime = p.hegemonRegime;
  a.cur.great_game = greatGame(a.cur.sp_client_any, p.flags.bipolar);
  a.cur.aid_conditionality = conditionality(p.flags.promotion_era, a.cur.aid_gni, world.year >= p.aidFrom);
  a.cur.hegemon_x_client = a.cur.pact_usa ? (p.hegemonRegime ?? 3) : 0;   // panel var: the hegemon's own regime score, no actor id in the engine
}
/**
 * The presence layer forward (operator/presence). Levels are frozen at as-of — where a garrison will be in year t of
 * the horizon is an outcome — but the *withdrawal* flag is a recency, so it ages: the actor keeps the year it last
 * lost a station and `presence_change` is on only while that year is inside PRESENCE.window. Without this the panel's
 * value at as-of would be carried unchanged and a withdrawal in the as-of year would fire for the whole horizon.
 */
function applyPresence(world, a) {
  if (!world.presence || a.cur.presence_change == null) return;
  a.cur.presence_change = a.presenceFall != null && world.year - a.presenceFall <= PRESENCE.window ? 1 : 0;
}

/**
 * Build a world state at `asOf` from the panel. Only actors live at asOf are included; actors whose system
 * membership starts or ends inside the horizon are introduced/retired by stepYear from the same dated lifecycle.
 * Alliance and contiguity graphs are frozen at asOf: their future values are not knowledge a forecaster has.
 * `contiguityFrom` is the first year the contiguity source covers — for an asOf before it, that first snapshot
 * stands in (a documented imputation). Since era-1870-1914-r2 the source is CShapes 2.0 merged with CoW Direct
 * Contiguity 3.2 and covers 1816, so the stand-in no longer fires anywhere in the modelled window; the guard stays
 * because the floor is a property of data/contiguity.json's own meta, not of this code.
 */
export function createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe = 'modeled', successors, contiguityFrom = null, corridors = [], territories = [], presence = null }) {
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
  // era-1991-2026-r2/engine-4: `interstate_onset` (UCDP/PRIO type 2, 1946-2024) counts too. Seeding only from the
  // CoW/GML MID kinds left the memory dead at every modern origin — at as-of 2025 not one pair scored above 0.2 and
  // the era's three most active pairs all read "no dispute ever", so z(rivalry) (+0.382 on mid_force) was a
  // constant at the live forecast origin. The same union is applied in scripts/lib/fit.mjs, so the trace means one thing in the fit
  // and one thing in the simulation.
  const dyadRecent = new Map();
  for (const e of events) if (DYADIC_DISPUTE.has(e.kind) && e.a && e.b && e.year <= asOf) {
    const k = pairKey(e.a, e.b), y = Math.floor(e.year);
    if (y > (dyadRecent.get(k) ?? -Infinity)) dyadRecent.set(k, y);
  }
  const nukes = new Set(); for (const e of events) if (e.kind === 'nuclear' && e.status === 'weapon' && e.year <= asOf) nukes.add(e.actor);
  // entry prior: the median live actor at asOf, used to instantiate an actor introduced inside the horizon whose panel
  // row at asOf is empty (a colony has no regime or income series). A stated, dated imputation — the alternative is a
  // structural zero, which reads as "this state cannot have a regime transition" for the whole decolonisation cohort.
  const quant = (v, q) => { const xs = Object.values(actors).map(a => a.cur[v]).filter(x => x != null).sort((p, o) => p - o); return xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * q))] : null; };
  const med = (v) => quant(v, 0.5);
  const entryPrior = Object.fromEntries(['regime', 'polyarchy', 'gdp_pc', 'log_gdp_pc', 'gdp_growth', 'population', 'tpop'].map(v => [v, med(v)]));
  // the leader block has to be in it too (era-1945-1991-r2/data-1, statistics-1, engine-1). actorHazards drops a whole
  // template on the first null covariate, so before this every state born inside the horizon carried probability
  // exactly zero on leader_exit, irregular_exit and coup_attempt for its entire simulated life — the whole
  // decolonisation cohort. Measured at as-of 1960: 48 actors enter in 1961-1980, 27 of them have an observed leader
  // exit inside the window and 17 a coup, and the backtest reported all of them as n_structural_miss.
  // Two of the four are structural facts rather than medians and are set as such: a state entering the system has a
  // leader who took office at or about the year it entered (tenure 0), and that leader did not take power by
  // overthrowing a predecessor of a state that did not yet exist (irregular entry 0). leader_age and leader_military
  // are the live-actor median at asOf, exactly as regime and income already are. milper has no structural value and
  // takes the 25th percentile of the live actors, on the same reasoning as cinc: a state entering the system is not a
  // median power. All of them are recorded in a.imputed by the loop in stepLifecycle.
  entryPrior.leader_tenure = 0;
  entryPrior.leader_irregular_entry = 0;
  entryPrior.leader_age = med('leader_age');
  entryPrior.leader_military = med('leader_military');
  entryPrior.milper = quant('milper', 0.25);
  entryPrior.info_access = med('info_access');
  // capability has to be in the entry prior too (era-1870-1914-r2/statistics-2, engine-4): dyadHazards returns {} the
  // moment either side's cinc is null, so before this every state born inside the horizon carried probability exactly
  // zero on every dyadic template for its whole simulated life — 30 of the 99 observed mid_force pairs at as-of 1900.
  // The quantile is the 25th and not the median because a state entering the system is not a median power; where the
  // newborn has a predecessor in the successor chain, stepLifecycle overrides this with the predecessor's own
  // capability scaled by population share, which is the better estimate and is information the forecaster holds.
  entryPrior.cinc = quant('cinc', 0.25);
  // coalition joining and the relevance set it implies (era-1914-1945/engine-1). `warPartners` is the war graph as it
  // stood in the last observed year — seeded from the dated war records at asOf and rewritten by stepYear from the
  // simulation's own wars thereafter, so the relevance rule is evaluated at the simulated year and not frozen at as-of.
  const coalition = coalitionRule(templates);
  const allied = alliedAt(pacts, asOf);
  // the presence layer: the records in, indexed once. The index is memoised on the record array itself and is
  // non-enumerable (like the corridor histories): a memo must never turn into published data if the array is
  // ever serialised.
  let pres = null;
  if (presence) { if (!presence.__index) Object.defineProperty(presence, '__index', { value: presenceIndex(presence, { y0: Y0, y1: Math.max(panel.meta.y1, PRESENCE.covers[1]) }), enumerable: false }); pres = presence.__index; }
  if (pres) for (const [id, a] of Object.entries(actors)) a.presenceFall = lastFall(pres, id, asOf);
  return {
    year: asOf, asOf, actors, dyadRecent, nukes, entryPrior,
    // the derived world state (polarity, hegemon, era flags) and the fitted information wave — package 9
    pol: initPolarity(panel, asOf, actors),
    coalition, warPartners: coalition ? warPartnersAt(warDyadSpans(events), asOf) : new Map(),
    allyOf: coalition ? allyAdjacency(allied) : null,
    // interstate war as a spell rather than a one-year flag (operator/termination): warSpells maps a pair to the year
    // its war started, and the fitted `war_end` hazard decides each year whether it stops. The spells running at asOf
    // are seeded from the OBSERVED record — a pair at war at the as-of date is state the forecaster holds, and its
    // start year is dated, so the seeded spell enters the horizon with its real duration-so-far rather than a fresh
    // draw. The mechanism is off unless the data switches it on (see warDurationOn), and then the map stays empty.
    warSpells: warDurationOn(templates) ? seedWarSpells(events, actors, asOf) : new Map(),
    warDuration: warDurationOn(templates),
    rivalryDecay: rivalryDecay(templates),
    // the corridor / chokepoint layer, as-of dated like everything else: a record is in the world only if its dated
    // history has opened by asOf (a corridor announced inside the horizon is not knowledge the forecaster holds — the
    // backtest reports those records and their transitions separately rather than scoring them at zero), its status and
    // controller are the ones in force at asOf, and the outcome mix a fired transition draws from is the history to date.
    corridors: NO_CORRIDORS ? [] : corridors.filter(rec => { const t = templates.find(x => x.unit === CORRIDOR_UNIT[rec.kind] && !x.spell); const f = t ? corridorFirstYear(rec, t.window[0]) : null; return f != null && f <= asOf && asOf <= corridorLastYear(rec, Infinity); })
      .map(rec => ({ rec, state: corridorStateAt(rec, asOf), impairAge: impairAgeAt(rec, asOf) })),
    corridorMix: corridorOutcomeMix(corridors, asOf),
    // the territory layer (operator/termination): the records whose dated history has opened by asOf, with the status
    // and controller in force then. Territories had no place in the engine at all before this package — the contest
    // half of "faithful first" (docs/system.md) — so the only hazard on them is the one this package fits, and a
    // record moves in one direction only: from unresolved to settled. A contest that RE-opens is the onset half and
    // is still escalated, which is why a settled record simply leaves the draw.
    territories: territories.filter(rec => { const f = territoryFirstYear(rec); return f != null && f <= asOf; })
      .map(rec => ({ rec, state: territoryStateAt(rec, asOf), age: contestAge(rec, asOf) })),
    // the military-presence layer (operator/presence), frozen at as-of like the alliance graph. `patrons` is the
    // host -> patron-power map the dyadic term reads; the per-actor `presenceFall` is the year that actor last lost a
    // station, so `presence_change` can age out of its window during the horizon instead of firing for all of it.
    presence: pres, patrons: pres ? patronMap(pres, asOf) : new Map(),
    allied, contiguous: contiguousAt(contiguity, contiguityFrom == null ? asOf : Math.max(asOf, contiguityFrom)),
    // `predecessors` is the successor map inverted, so a state entering the horizon can be seeded from the state it
    // succeeds instead of from the world median; `retiredState` keeps the last state of an actor stepLifecycle has
    // already removed, for a successor that enters a year or more after its predecessor leaves.
    lifecycle: { panel, events, ids: lifecycleIds, Y0, successors: successors ?? {}, predecessors: invertMap(successors ?? {}), retiredState: new Map() },
    fits, templates, log: [],
  };
}

/** id -> [ids that name it as their successor] — the successor map read backwards. */
function invertMap(successors) {
  const out = {};
  for (const [id, succ] of Object.entries(successors)) (out[succ] ??= []).push(id);
  return out;
}

/**
 * The war spells running at `asOf`, from the observed dyadic record (src/engine/termination.js:warSpells over the
 * event log, which is already truncated at asOf by createWorld). Only pairs both of whose members are live enter.
 * The value is the spell's OBSERVED start year, so a seeded war carries its real duration-so-far into the hazard —
 * the previous mechanism gave every running war a fresh residual drawn from the whole run-length distribution.
 */
function seedWarSpells(events, actors, asOf) {
  const out = new Map();
  for (const [k, spells] of warSpells(events)) {
    const i = k.indexOf('|'); if (!actors[k.slice(0, i)] || !actors[k.slice(i + 1)]) continue;
    for (const s of spells) if (s.y0 <= asOf && s.y1 >= asOf) out.set(k, { y0: s.y0, coalition: s.n_participants ?? 2 });
  }
  return out;
}
/** Years a corridor/chokepoint record has already been impaired when `asOf` opens (0 if it is not). */
function impairAgeAt(rec, asOf) {
  return spellAge((y) => { const s = corridorStateAt(rec, y); return s != null && IMPAIRED.has(s.status); }, asOf);
}
/** Years a territorial contest has already run when `asOf` opens: back to the last year the record was settled. */
function contestAge(rec, asOf) {
  const first = territoryFirstYear(rec); if (first == null) return 0;
  return spellAge((y) => { if (y < first) return false; const s = territoryStateAt(rec, y); return s != null && !RESOLVED.has(s.status); }, asOf);
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

/**
 * Actor-year templates whose label set is a strict SUBSET of another fitted template's: same `event`, and the child
 * carries an `event_filter` the parent does not. era-1945-1991-r2/statistics-3, engine-4 — `irregular_exit` is
 * declared `event: leader_exit, event_filter: { irregular: 1 }`, so every one of its events is also a leader_exit
 * event, yet stepYear drew the two against independent uniforms and applied a leader replacement for each. Measured
 * at as-of 1980: 69.4 actor-years per run fired both, simulated leader turnover ran 1.98x the observed count and
 * simulated irregular exits 5.4x. Returns child template id -> parent template id; the draw is nested exactly as
 * mid_war nests inside mid_force.
 */
function subsetNesting(templates) {
  const m = new Map();
  for (const t of templates) {
    if (t.unit !== 'actor-year' || !t.event_filter || t.spell || t.status === 'monitored') continue;
    const parent = templates.find(x => x.id !== t.id && x.unit === 'actor-year' && x.event === t.event && !x.event_filter && !x.spell && x.status !== 'monitored');
    if (parent) m.set(t.id, parent.id);
  }
  return m;
}

/** Annual probability of each fitted actor-year template for one actor in the current state. */
export function actorHazards(world, a) {
  const out = {};
  for (const t of world.templates) {
    // a spell template on the actor-year unit (operator/termination: `intrastate_end`) is not an onset: it is drawn
    // by stepYear over the actors whose spell is running, after the onsets, and it must not fire here.
    const fit = world.fits[t.id]; if (!fit || fit.status !== 'fitted' || t.unit !== 'actor-year' || t.status === 'monitored' || t.spell) continue;
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
    // the era interaction on the contagion term (era-1914-1945-r2/engine-1). One pooled coefficient (+1.77 on the
    // war template) was doing two jobs: the stratified log-odds ratio on the fitter's own rows is +2.02 before 1946
    // and +0.50 after, so the modern dyad was handed 4.8x the odds multiplier its own era supports and the simulated
    // at-war count climbed monotonically instead of staying flat. Entered as a delta on at_war_any above, over the
    // same `pre_1946` constant already in this block; same construction in scripts/lib/fit.mjs.
    at_war_any_post46: ((a.prev.at_war || b.prev.at_war) && world.year >= 1946) ? 1 : 0,
    nuclear_both: world.nukes.has(a.id) && world.nukes.has(b.id) ? 1 : 0,
    // era term (era-1870-1914/statistics-6): a derived constant, mirrored in scripts/lib/fit.mjs's dyad feature block
    pre_1946: world.year < 1946 ? 1 : 0,
    // corridor dampener (era-1914-1945/corridors-7): infrastructure running through one of the pair that a third party
    // tied to either side leans on. Same construction in scripts/lib/fit.mjs; a candidate, not a fitted covariate.
    corridor_stake: corridorStakeFor(world, a.id, b.id),
    // the patron term (operator/presence): a great power with a station of level >= PRESENCE.patron_min on one side,
    // allied to it and not to the other. Same construction in scripts/lib/fit.mjs's dyad block.
    ...patronFeatures({ patrons: world.patrons ?? new Map(), allied: (p, h) => world.allied.has(pairKey(p, h)), major: (id) => (world.actors[id]?.cur.great_power ?? 0) > 0, a: a.id, b: b.id }),
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
    year: world.year,
    live: (id) => world.actors[id] != null,
    atWar: (id) => world.actors[id]?.cur.at_war ?? null,
    intrastate: (id) => world.actors[id]?.cur.intrastate ?? null,
    gdpGrowth: (id) => world.actors[id]?.cur.gdp_growth ?? null,
    greatPower: (id) => world.actors[id]?.cur.great_power ?? null,
    successor: (id) => world.lifecycle?.successors?.[id] ?? null,
    // the termination layer's reads (operator/termination) — the engine's twin of scripts/lib/fit.mjs:termLook
    cinc: (id) => world.actors[id]?.cur.cinc ?? null,
    regime: (id) => world.actors[id]?.cur.regime ?? null,
    logGdpPc: (id) => world.actors[id]?.cur.log_gdp_pc ?? null,
    gdpGrowthPrev: (id) => world.actors[id]?.prev.gdp_growth ?? null,
    allied: (a, b) => world.allied.has(pairKey(a, b)),
    contiguous: (a, b) => world.contiguous.has(pairKey(a, b)),
    hostPresence: (id) => (world.presence ? hostLevel(world.presence, id, world.asOf) : null),
    patron: (a, b) => patronFeatures({ patrons: world.patrons ?? new Map(), allied: (p, h) => world.allied.has(pairKey(p, h)), major: (id) => (world.actors[id]?.cur.great_power ?? 0) > 0, a, b }),
    // the presence layer is frozen at as-of, like the alliance and border graphs: where great-power forces will sit
    // in year t of the horizon is an outcome, not knowledge the forecaster holds. The level and the last fall are
    // therefore read at as-of; corridorFeatures ages the fall against the simulated year.
    guarantor: world.presence ? (rec, T) => ({ level: guarantorLevel(world.presence, rec, T, world.asOf), fall: guarantorFall(world.presence, rec, T, world.asOf) }) : null,
  };
}
/** The dampener for one pair, with the year's record index built once per step. */
function corridorStakeFor(world, a, b) {
  if (!world.corridors?.length) return 0;
  if (world.corridorIdxYear !== world.year) { world.corridorIdx = corridorIndex(world.corridors, worldLook(world)); world.corridorIdxYear = world.year; }
  return corridorStake(world.corridorIdx, a, b, world.allied, world.year);
}

/** Annual probability that a running war between this pair stops during the year. `age` = years already elapsed. */
export function warEndHazard(world, a, b, age, coalition = 2) {
  const t = spellTemplate(world.templates, SPELL_UNITS.war);
  return t ? spellHazard(world, t, warEndFeatures({ a, b, age, coalition, look: worldLook(world) })) : null;
}
/** Annual probability that an impaired corridor or chokepoint record returns to service during the year. */
export function reopenHazard(world, entry) {
  const t = spellTemplate(world.templates, SPELL_UNITS.record);
  if (!t || !(t.kinds ?? []).includes(entry.rec.kind)) return null;
  return spellHazard(world, t, reopenFeatures({ age: entry.impairAge ?? 0, corridor: corridorFeatures(entry.rec, entry.state, worldLook(world)) }));
}
/** Annual probability that a territorial contest is settled during the year. */
export function contestHazard(world, entry) {
  const t = spellTemplate(world.templates, SPELL_UNITS.territory);
  return t ? spellHazard(world, t, contestFeatures({ rec: entry.rec, state: entry.state, age: entry.age ?? 0, look: worldLook(world) })) : null;
}

/** Annual probability of a status/control transition for one corridor or chokepoint record in the current state. */
export function corridorHazards(world, entry) {
  const t = world.templates.find(x => x.unit === CORRIDOR_UNIT[entry.rec.kind] && !x.spell);
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
    // era-1945-1991-r2/statistics-3, engine-5: the two typed regime decrements that used to sit here (rng() < 0.5 on an
    // irregular exit, rng() < 0.6 on a successful coup) were unfitted hand-typed constants stacked on top of
    // autocratize_step / autocratic_closure, which are fitted on V-Dem RoW downward steps that ALREADY contain the
    // coup-caused ones. Sized at as-of 1980 they fired ~128 downgrades per run against 63 fitted autocratic_closure
    // firings — the unfitted channel was 2x the fitted one — and the simulated regime mix at 2000 stayed at its as-of
    // 1980 value (0.46/0.31/0.08/0.14 against an observed 0.18/0.32/0.27/0.23): the third wave did not happen, and
    // because irregular_exit carries -0.8/-2.5/-2.9 on regime that alone multiplied the irregular hazard by 1.7x.
    // Removed; ENGINE_ABLATE=coup_regime_step restores them for the diff.
    case 'irregular_exit': if (a.fired.leader_exit !== y) applyActorEvent(world, a, 'leader_exit', rng); a.cur.leader_irregular_entry = 1; if (COUP_REGIME_STEP && a.cur.regime > 0 && rng() < 0.5) a.cur.regime -= 1; break;
    // a regular exit clears the irregular-entry flag: the incoming leader did not take power by force. Before
    // era-1945-1991-r2/engine-3 the panel column was 1 for 99.3% of actor-years, so the `= 1` assignments below were
    // a no-op and the engine had no coup-trap feedback at all despite reading as if it did.
    case 'leader_exit': a.cur.leader_tenure = 0; a.cur.leader_age = 45 + Math.floor(rng() * 25); a.cur.leader_military = rng() < 0.2 ? 1 : 0; a.cur.leader_irregular_entry = 0; a.recent.leader_exit[0] = 1; break;
    case 'coup': a.cur.coup_attempt = 1; if (rng() < 0.5) { a.cur.coup_success = 1; if (a.fired.leader_exit !== y) applyActorEvent(world, a, 'leader_exit', rng); a.cur.leader_irregular_entry = 1; if (COUP_REGIME_STEP && a.cur.regime > 0 && rng() < 0.6) a.cur.regime -= 1; } break;
    case 'autocratization_onset': case 'autocratize_step': if (a.cur.regime > 0) a.cur.regime -= 1; a.cur.polyarchy = Math.max(0, (a.cur.polyarchy ?? 0.5) - 0.1); a.cur.regime_down = 1; break;
    case 'democratization_onset': case 'democratize_step': if (a.cur.regime < 3) a.cur.regime += 1; a.cur.polyarchy = Math.min(1, (a.cur.polyarchy ?? 0.5) + 0.1); a.cur.regime_up = 1; break;
    case 'autocratic_closure': if (a.cur.regime > 0) a.cur.regime -= 1; a.cur.polyarchy = Math.max(0, (a.cur.polyarchy ?? 0.5) - 0.1); a.cur.regime_down = 1; break;
    case 'liberal_erosion': a.cur.regime = 2; a.cur.polyarchy = Math.max(0, (a.cur.polyarchy ?? 0.5) - 0.1); a.cur.regime_down = 1; break;
    case 'democratic_deepening': a.cur.regime = 3; a.cur.polyarchy = Math.min(1, (a.cur.polyarchy ?? 0.5) + 0.1); a.cur.regime_up = 1; break;
    // operator/termination: the length is no longer typed here. The fitted `intrastate_end` hazard draws it year by
    // year (stepYear, after the actor hazards), so a fresh onset only records the year it started. With the mechanism
    // ablated off the old uniform 1..6-year draw is restored, and it consumes the same one random number it always did.
    case 'intrastate_onset': a.cur.intrastate = 1; a.conflictStart = y; a.cur.conflict_duration = 0; if (NO_TERM.intrastate) a.conflictLeft = 1 + Math.floor(rng() * 6); a.cur.gdp_pc *= 0.97; break;
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
      // seed from the predecessor before the world median: a state that succeeds another inherits its capability
      // scaled by the population share it takes with it, and its income and regime outright. Both the successor map
      // and the predecessor's own state are as-of knowledge, so this adds nothing the forecaster does not hold — where
      // there is no predecessor the world median (and, for cinc, its 25th percentile) still stands in.
      const preds = (lc.predecessors?.[id] ?? []).map(pid => world.actors[pid] ?? lc.retiredState?.get(pid)).filter(Boolean);
      const pred = preds.sort((p, q) => (q.cur.cinc ?? 0) - (p.cur.cinc ?? 0))[0] ?? null;
      if (pred) {
        const share = a.cur.population != null && pred.cur.population ? Math.min(1, a.cur.population / pred.cur.population) : null;
        for (const v of ['cinc', 'gdp_pc', 'log_gdp_pc', 'regime', 'polyarchy', 'gdp_growth']) {
          if (a.cur[v] != null || pred.cur[v] == null) continue;
          a.cur[v] = v === 'cinc' ? pred.cur[v] * (share ?? 0.5) : pred.cur[v];
          a.prev[v] = a.cur[v]; a.imputed.push(`${v}<-${pred.id}`);
        }
      }
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
    lc.retiredState?.set(id, a);
    const succ = successors[id] && world.actors[successors[id]];
    if (succ) {   // the successor inherits the rivalry memory: the dispute history is the state's, not the name's
      // and the border graph: the frozen as-of snapshot has no edge for a state that did not exist at as-of, so
      // without this a successor is non-contiguous with everyone and every non-major pair it is in sits at hazard 0
      // (era-1870-1914-r2/statistics-8). Edges are only ever added, so the at-risk set cannot silently shrink.
      for (const k of [...world.contiguous]) { const [p, q] = k.split('|'); if (p !== id && q !== id) continue; const other = p === id ? q : p; if (other === succ.id) continue; world.contiguous.add(pairKey(succ.id, other)); }
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
    a.cur.sp_client_any = (a.cur.pact_usa || a.cur.pact_rus) ? 1 : 0;
    a.cur.sp_client_one = ((a.cur.pact_usa ? 1 : 0) + (a.cur.pact_rus ? 1 : 0)) === 1 ? 1 : 0;
    // major-power status is frozen at as-of, like the alliance and border graphs and like world.nukes: who stops being a
    // great power in 1917, 1918, 1943 and 1945 is an outcome of the horizon, not a fact the forecaster holds. Reading the
    // panel forward was worth ~0.03 of the pre-1946 dyad AUC (it gates the politically-relevant filter and carries
    // major_power_any). Great-power entry/exit as a modelled hazard is an escalation (docs/escalations.md).
    // information access diffuses toward the frontier the panel's own series traces — a logistic fitted in
    // scripts/build-panel.mjs and carried in panel.meta.info_wave, of which the actor closes a fitted fraction of its
    // remaining gap each year. This replaces a rate switched by hand at 1985; before 1950 the frontier is ~0, so a
    // 19th-century run holds at the panel's floor instead of drifting up at a typed 0.03/yr.
    if (a.cur.info_access != null) a.cur.info_access = infoDiffuse(Math.max(0.02, a.cur.info_access), y, world.pol?.infoWave ?? INFO_WAVE);
    // clear annual flags; decay conflicts
    a.cur.coup_attempt = 0; a.cur.coup_success = 0; a.cur.at_war = 0; a.cur.mid_force = 0; a.cur.mid_war = 0; a.cur.regime_up = 0; a.cur.regime_down = 0;
    // internal conflict: the spell ends at the START of the year after the one its termination hazard fired in, so the
    // year it ended still reads as a conflict year — which is what the panel's own `intrastate` column does and what
    // the fit's label means. With the mechanism ablated off this is the old countdown from a typed uniform draw.
    if (a.cur.intrastate) {
      if (NO_TERM.intrastate) { a.conflictLeft = (a.conflictLeft ?? 1) - 1; if (a.conflictLeft <= 0) a.cur.intrastate = 0; }
      else if (a.conflictOver) { a.cur.intrastate = 0; a.conflictOver = false; a.conflictStart = null; }
    }
    a.cur.conflict_duration = a.cur.intrastate && a.conflictStart != null ? y - a.conflictStart : (a.cur.intrastate ? 0 : null);
    for (const v of Object.keys(a.recent)) { a.recent[v].unshift(0); a.recent[v].length = 5; }
    if (a.prev.coup_attempt) a.recent.coup_attempt[0] = 1; if (a.prev.intrastate) a.recent.intrastate[0] = 1; if (a.prev.mid_force) a.recent.mid_force[0] = 1; if (a.prev.at_war) a.recent.at_war[0] = 1;
  }
  // the derived world state, after the drift (it reads this year's growth) and before any hazard reads an era term
  stepPolarity(world);
  for (const id of ids) { applyWorldState(world, id, world.actors[id]); applyPresence(world, world.actors[id]); }
  // interstate war duration (era-1914-1945/engine-5, refitted by operator/termination): at_war is a spell, not a
  // one-year flag. The drift loop above cleared it; every war still running re-sets it on both belligerents, so
  // lag1(at_war) and the war shock mean in simulation what they mean in the panel. Whether the spell stops this year
  // is the fitted `war_end` hazard, drawn once per running spell with the spell's own duration-so-far in it — a
  // resampled length, which is what this replaces, could not depend on the state of the war.
  for (const [k, sp] of [...world.warSpells]) {
    const i = k.indexOf('|'); const A = world.actors[k.slice(0, i)], B = world.actors[k.slice(i + 1)];
    if (!A || !B) { world.warSpells.delete(k); continue; }
    A.cur.at_war = 1; B.cur.at_war = 1;
    const p = warEndHazard(world, A.id, B.id, y - sp.y0, sp.coalition);
    const u = rng();
    if (p == null || u < p) { world.warSpells.delete(k); fired.push({ kind: 'war_end', a: A.id, b: B.id, year: y, start: sp.y0, duration: y - sp.y0 + 1 }); }
  }
  // actor hazards. A template whose labels are a subset of another's is drawn INSIDE its parent, not beside it
  // (era-1945-1991-r2/engine-4): the parent is drawn first, and the child at P(child | parent) = p_child / max(p_parent,
  // p_child) only in the years the parent fired — the same construction, and the same cap, as the war-inside-dispute
  // nesting below. One random number per template per actor-year either way, so ENGINE_ABLATE=exit_nesting differs by
  // mechanism only.
  const nest = world.subsetNesting ??= subsetNesting(world.templates);
  for (const id of ids) {
    const a = world.actors[id]; const hz = actorHazards(world, a);
    const order = Object.entries(hz).sort((x, z) => (nest.has(x[0]) ? 1 : 0) - (nest.has(z[0]) ? 1 : 0));
    const firedHere = new Set();
    for (const [kind, p] of order) {
      const parent = NO_EXIT_NESTING ? null : nest.get(kind);
      const pDraw = parent == null ? p : (firedHere.has(parent) ? Math.min(1, p / Math.max(hz[parent] ?? 0, p)) : 0);
      if (rng() < pDraw) {
        firedHere.add(kind);
        const t = world.templates.find(t => t.id === kind); const ev = { kind: t.event, template: kind, actor: id, year: y };
        const rewrite = ev.kind === 'coup' ? 'coup' : (t.event_filter ? kind : ev.kind);
        if (!HANDLED.has(rewrite)) throw new Error(`stepYear: template '${kind}' fires but applyActorEvent has no rewrite for '${rewrite}'`);
        fired.push(ev); applyActorEvent(world, a, rewrite, rng);
      }
    }
  }
  // internal-conflict termination (operator/termination). Drawn after the onsets so a conflict that starts this year
  // can also end this year — which is what the fit's first spell-year row means (age 0, label "ends during y") and
  // what 33 of the panel's 305 observed runs did. The flag itself is cleared at the start of the next step.
  if (!NO_TERM.intrastate) {
    const tEnd = spellTemplate(world.templates, 'actor-year', 'intrastate');
    if (tEnd && world.fits[tEnd.id]?.status === 'fitted') for (const id of ids) {
      const a = world.actors[id]; if (!a || !a.cur.intrastate || a.conflictOver) continue;
      if (a.conflictStart == null) a.conflictStart = y;
      a.cur.conflict_duration = y - a.conflictStart;
      const feats = {}; let ok = true;
      for (const c of tEnd.covariates) { const x = featureActor(world, a, c); if (x == null) { ok = false; break; } feats[c.var] = x; }
      if (!ok) continue;
      const eta = linearPredictor(world.fits[tEnd.id], tEnd, feats); if (eta == null) continue;
      if (rng() < sigmoid(eta)) { a.conflictOver = true; fired.push({ kind: 'intrastate_end', template: tEnd.id, actor: id, year: y, duration: y - a.conflictStart + 1 }); }
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
      // the war's first year is also a chance for it to be its only year: the fitted hazard is drawn at age 0, exactly
      // as the fit's first spell-year row is labelled. One random number per fired war, as the resampled length was.
      if (world.warDuration) openWarSpell(world, k, a.id, b.id, y, rng, fired);
    }
  }
  if (world.coalition && !opts.skipDyads) fired.push(...coalitionJoin(world, rng, warPairs, y));
  // the corridor / chokepoint layer (era-1914-1945/corridors-7), drawn last in the step so that a transit state that
  // went to war this year is visible to the corridor hazard — the fit reads the same contemporaneous at_war. A fired
  // transition rewrites the record's status from the observed outcome mix; control transfer is not simulated (the
  // competing-risks control model over claimants in docs/schema.md is still an escalation), so a simulated record
  // moves only through status while the label counts control changes too.
  // An IMPAIRED record draws the fitted `record_reopen` hazard INSTEAD of the generic status hazard, not as well as
  // it: the status template is fitted on every record-year including the impaired ones, so a second independent draw
  // would count the same transition twice. What the substitution costs is stated rather than hidden — an impaired
  // record can now only return to service, where the status hazard's outcome mix also let it move contested -> closed.
  // A fired reopening is logged twice, once under the status template (so its probability mass and its truth stay the
  // record layer's) and once under the reopen template, which is the unit this package scores.
  for (const entry of world.corridors ?? []) {
    const impaired = entry.state != null && IMPAIRED.has(entry.state.status);
    const reopen = impaired && !NO_TERM.record ? reopenHazard(world, entry) : null;
    // ... and the substitution is conditional on the reopen hazard EXISTING (era-1914-1945-r2/corridors-1). The
    // template has no fit at every as-of year — at 1890/1900/1910/1920 it reports `n=0, no fit at as-of` — and the
    // impaired branch used to `continue` on a null hazard, so the record fell through the reopen draw AND never
    // reached the generic status draw below it: the impaired state was absorbing and the record carried zero mass for
    // the whole horizon. At as-of 1920 that was 4 of 27 corridor units and 2 of the 5 observed changes
    // (chinese_eastern_railway -> built 1924.41, berlin_baghdad -> built 1940.5), reported as n_structural_miss.
    // With no fitted reopen hazard the record falls back to the generic status hazard, which is what the engine did
    // before the termination package and is fitted at every as-of year in this window.
    if (impaired && !NO_TERM.record && reopen != null) {
      entry.impairAge = (entry.impairAge ?? 0) + 1;
      if (rng() < reopen) {
        const to = BASE_STATUS[entry.rec.kind] ?? 'open';
        const t = world.templates.find(x => x.unit === CORRIDOR_UNIT[entry.rec.kind] && !x.spell);
        fired.push({ kind: t?.event ?? entry.rec.kind, template: t?.id, record: entry.rec.id, year: y, from: entry.state.status, status: to, via: 'reopen' });
        fired.push({ kind: 'record_reopen', template: spellTemplate(world.templates, SPELL_UNITS.record)?.id, record: entry.rec.id, year: y, from: entry.state.status, duration: entry.impairAge });
        entry.state = { status: to, controller: entry.state.controller }; entry.impairAge = 0;
      }
      continue;
    }
    if (impaired) entry.impairAge = (entry.impairAge ?? 0) + 1;   // the age is state, not a by-product of the reopen draw
    const hz = corridorHazards(world, entry); if (!hz) continue;
    if (rng() < hz.p) {
      const to = drawCorridorStatus(world, entry, rng);
      fired.push({ kind: hz.event, template: hz.template, record: entry.rec.id, year: y, from: entry.state.status, status: to });
      entry.state = { status: to, controller: entry.state.controller };
      if (IMPAIRED.has(to)) entry.impairAge = 0;
    }
  }
  // the territory layer (operator/termination): one hazard per unsettled record per year, the contest ending when it
  // fires. There is no onset half — nothing in this model turns a settled territory back into a contested one — so a
  // record that settles leaves the draw for good, and that asymmetry is the escalation this package does not close.
  if (!NO_TERM.territory) for (const entry of world.territories ?? []) {
    if (!entry.state || RESOLVED.has(entry.state.status)) continue;
    const p = contestHazard(world, entry); if (p == null) { entry.age = (entry.age ?? 0) + 1; continue; }
    if (rng() < p) {
      fired.push({ kind: 'territory_settle', template: spellTemplate(world.templates, SPELL_UNITS.territory)?.id, record: entry.rec.id, year: y, from: entry.state.status, duration: (entry.age ?? 0) + 1 });
      entry.state = { ...entry.state, status: 'settled' };
    }
    entry.age = (entry.age ?? 0) + 1;
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
 * A war that has just fired: draw its termination at age 0. If it does not fire the pair enters a spell whose start
 * year is this one; if it does, the war is a one-year war and the ending is logged in the same step. `coalition` is 2
 * for a fresh dyadic war — the joiners a coalition rule adds open their own pairs and carry the wider count.
 */
function openWarSpell(world, k, a, b, y, rng, log, coalition = 2) {
  const p = warEndHazard(world, a, b, 0, coalition);
  const u = rng();
  if (p != null && u >= p) world.warSpells.set(k, { y0: y, coalition });
  else log.push({ kind: 'war_end', a, b, year: y, start: y, duration: 1 });
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
    // the size of the war component after this round's draws: the two initiators plus everyone who joined either side,
    // minus anyone allied to both (who stays out). That count is `war_coalition`'s own definition and the covariate
    // war_end is fitted on — openWarSpell defaulted it to 2, so every pair a coalition draw created entered its spell
    // as a two-state war and its termination hazard was evaluated at war_coalition = 2 for ever, and the initiating
    // pair kept the 2 it was opened with even when its war became a world war (era-1914-1945-r2/engine-8).
    const both = joined[0].filter(c => joined[1].includes(c));
    const size = 2 + joined[0].filter(c => !both.includes(c)).length + joined[1].filter(c => !both.includes(c)).length;
    for (let s = 0; s < 2; s++) for (const c of joined[s]) {
      if (joined[1 - s].includes(c)) continue;   // an ally of both sides stays out
      const j = world.actors[c]; j.cur.at_war = 1; j.cur.mid_war = 1; j.cur.mid_force = 1;
      for (const o of [...sides[1 - s], ...joined[1 - s]]) {
        const k = pairKey(c, o); if (world.warSpells.has(k) || c === o) continue;
        // a coalition pair is a dispute as well as a war: the labels nest (mid_war ⊂ mid_force) and so does the engine
        out.push({ kind: 'mid_force', a: c, b: o, year: y, via: 'coalition' });
        out.push({ kind: 'mid_war', a: c, b: o, year: y, via: 'coalition' });
        world.dyadRecent.set(k, y); warPairs.push([c, o]);
        if (world.warDuration) openWarSpell(world, k, c, o, y, rng, out, size);
      }
    }
    // ... and the pair that started it is inside the same component, so its spell carries the same count
    if (size > 2 && world.warDuration) { const sp = world.warSpells.get(pairKey(ida, idb)); if (sp && sp.coalition < size) sp.coalition = size; }
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
  // era-1991-2026-r2/engine-1: the COUNT truncated to the same number of years the indicator is truncated to. The
  // backtest already compares P(any event within covYears) when the ground truth ends inside the horizon, but it was
  // summing `expected` over the FULL horizon against an observed count truncated at the source's last year, so
  // count_ratio was inflated by horizon/covYears — 1.811 on leader_exit at as-of 2010, where 20/11 = 1.818 is the
  // whole of it. yearHist already carries the per-year-offset counts; this is the sum over the first `years` of them.
  const expectedWithin = (k, years) => (yearHist[k] ?? []).slice(0, years).reduce((a, b) => a + b, 0) / runs;
  const cumulative = (k) => { let c = 0; return (firstBy[k] ?? new Array(horizon).fill(0)).map(x => (c += x) / runs); };
  const quantiles = (arr) => { const out = []; for (let h = 0; h < horizon; h++) { const col = []; for (let r = 0; r < runs; r++) { const v = arr[r * horizon + h]; if (v > 0) col.push(v); } col.sort((a, b) => a - b); out.push(col.length ? [col[Math.floor(col.length * 0.1)], col[Math.floor(col.length * 0.5)], col[Math.floor(col.length * 0.9)]] : null); } return out; };
  const tracks = track ? {
    regime: Object.fromEntries(Object.entries(regimeHist).map(([id, hh]) => [id, Array.from({ length: horizon }, (_, h) => { const row = [0, 1, 2, 3].map(l => hh[h * 4 + l]); const n = row.reduce((a, b) => a + b, 0) || 1; return row.map(x => +(x / n).toFixed(3)); })])),
    gdp_pc: Object.fromEntries(Object.entries(gdpRuns).map(([id, arr]) => [id, quantiles(arr)])),
    info_access: Object.fromEntries(Object.entries(infoRuns).map(([id, arr]) => [id, quantiles(arr)])),
  } : null;
  return { runs, horizon, pAny: norm(anyBy), expected: norm(countBy), pAnyDyad: norm(dyadAny), yearHist, pAnyWithin, expectedWithin, cumulative, firstBy, tracks };
}
