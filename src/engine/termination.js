// Endings as fitted processes (operator/termination, package 8).
//
// Every other template in this model predicts an ONSET. Nothing predicted a war ending, a strait reopening, a contest
// settling or an insurgency burning out, so the engine ended them with typed constants: a war lasted exactly one year,
// an internal conflict a uniform draw from 1..6 years, and a closed strait reopened only through the generic status
// hazard's outcome mix. This module is the shared construction of the four termination samples and their covariate
// blocks, imported by scripts/lib/fit.mjs (over the historical panel) and src/engine/core.js (over the simulated
// world) so the sample a coefficient is estimated on and the state its hazard is drawn from cannot drift apart.
//
// One convention, stated because everything below rests on it: a spell is [y0, y1] inclusive and its row for year y
// carries `age = y - y0`, the years already elapsed when the year OPENS. The label is "the spell ends during y", i.e.
// y === y1. So the first year of a spell has age 0 and can be its last, which is exactly what the engine does when a
// war fires: it draws the termination hazard at age 0 in the same step, and the war is a one-year war if it fires.
// This is the record templates' construction (covariates from the state the year opens in, label = the transition
// during the year) rather than `lead: 1`, and for the same reason: the transition IS the label, so it cannot also be
// a covariate.
//
// No country names anywhere: every id comes out of the data.

/** Statuses that make a corridor/chokepoint record impaired — the spell `chokepoint_reopen` terminates. */
export const IMPAIRED = new Set(['closed', 'contested']);
/** The status a territory record reaches when its contest is over. `annexed` is NOT one: it is a change of holder, and
 *  the records show it cycling (a territory annexed three times before it is settled once). */
export const RESOLVED = new Set(['settled']);
/**
 * Territory statuses whose own instrument carries an end: a lease has a term, a protectorate and a mandate are held
 * in trust for someone else, an occupation is by definition provisional. The rest — annexation, breakaway, frozen,
 * disputed, contested — claim permanence or claim nothing. Stated, not fitted: it is a reading of what the status
 * words mean, and `contest_reversible` is the covariate it produces.
 */
export const REVERSIBLE = new Set(['leased', 'protectorate', 'league_mandate', 'occupied']);
/** The unit names the four termination templates declare, so no other file has to spell them out. */
export const SPELL_UNITS = { war: 'war-year', territory: 'territory-year', record: 'record-year' };

/** Merge overlapping/adjacent closed intervals. [[1914,1918],[1917,1919]] -> [[1914,1919]]. */
export function mergeSpans(spans) {
  const s = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]); const out = [];
  for (const [y0, y1] of s) {
    const last = out[out.length - 1];
    if (last && y0 <= last[1] + 1) { if (y1 > last[1]) last[1] = y1; } else out.push([y0, y1]);
  }
  return out;
}

/**
 * Dyadic war spells from the event log: every `mid_war` event carries the year both sides entered (`year`) and the
 * year the less-committed of the two left (`end`, written by scripts/build-events.mjs from CoW MID endyear). Spells
 * of the same pair that overlap or abut are merged — the pair is at war or it is not, and two disputes running
 * together are one spell of that state.
 *
 * `censorAt` is the source's last year: a spell that reaches it has no observed end (the dataset stops, the war may
 * not have) and is marked censored, so the fitter can drop its final row instead of scoring it as a termination.
 * Left unset it is read off the data — the last year any spell reaches — so no file has to type CoW MID's end date.
 * Returns Map pairKey -> [{ y0, y1, censored }].
 */
export function warSpells(events, { kind = 'mid_war', censorAt = null } = {}) {
  const by = new Map();
  for (const e of events) {
    if (e.kind !== kind || !e.a || !e.b || e.end == null) continue;
    const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    const y0 = Math.floor(e.year), y1 = Math.max(y0, Math.floor(e.end));
    (by.get(k) ?? by.set(k, []).get(k)).push([y0, y1, e.n_participants ?? 2]);
  }
  const merged = new Map();
  for (const [k, spans] of by) {
    // the widest coalition any of the pair's overlapping disputes was part of, carried onto the merged spell: a war
    // fought inside a large coalition is a different object from a two-state war, and it is the one fact about the
    // war's shape that the dyadic row does not otherwise carry.
    merged.set(k, mergeSpans(spans.map(s => [s[0], s[1]])).map(([y0, y1]) => {
      let n = 2; for (const [a0, a1, np] of spans) if (a0 <= y1 && a1 >= y0 && np > n) n = np;
      return { y0, y1, n_participants: n };
    }));
  }
  let end = censorAt;
  if (end == null) { end = -Infinity; for (const spans of merged.values()) for (const s of spans) if (s.y1 > end) end = s.y1; }
  const out = new Map();
  for (const [k, spans] of merged) out.set(k, spans.map(s => ({ ...s, censored: s.y1 >= end })));
  return out;
}

// ---------------------------------------------------------------- territory records
// data/territories.yaml has the same shape as the corridor layer — a dated `history:` of { year, status, controller }
// rows — but no base status before its first row: a territory record begins when the contest does. The two accessors
// below are the territory twins of corridorStateAt / corridorFirstYear in src/engine/core.js.

const terrHist = (rec) => {
  if (!rec.__thist) Object.defineProperty(rec, '__thist', { value: [...(rec.history ?? [])].sort((a, b) => a.year - b.year), enumerable: false });
  return rec.__thist;
};
/** The first year the record is a unit — the year its dated history opens. */
export function territoryFirstYear(rec) { const h = terrHist(rec); return h.length ? Math.floor(h[0].year) : null; }
/** Status and controller in force at the END of `year`; both carry forward across rows that omit them. */
export function territoryStateAt(rec, year) {
  const h = terrHist(rec); if (!h.length || year < Math.floor(h[0].year)) return null;
  let s = null;
  for (const r of h) { if (Math.floor(r.year) > year) break; s = { status: r.status ?? s?.status ?? null, controller: r.controller ?? s?.controller ?? null }; }
  return s;
}
/**
 * Years a spell has already run when year `y` opens: count back while `isOn` says the spell was running. One
 * definition for both sides — scripts/lib/fit.mjs counts back over the panel column, src/engine/core.js over the
 * simulated actor — so the duration a coefficient was estimated on and the duration a hazard is drawn at are the
 * same quantity. Past years only: it can never see the row's own label.
 */
export function spellAge(isOn, y, back = 200) {
  let n = 0;
  while (n < back && isOn(y - n - 1)) n++;
  return n;
}

/**
 * The termination label, for any record layer: the years in [from, to] the unit OPENS inside the spell and CLOSES
 * outside it. `open(y)` is the status in force at the start of year y and `close(y)` the one at its end — the same
 * pair of states the row's covariates and its label are read from, which is what keeps the transition out of its own
 * covariate block. Used for the chokepoint reopen label, the territory settlement label and the backtest's truth.
 */
export function endYears({ open, close, inSpell, from, to }) {
  const out = new Set();
  for (let y = from; y <= to; y++) { const o = open(y), c = close(y); if (o != null && inSpell(o) && c != null && !inSpell(c)) out.add(y); }
  return out;
}

// ---------------------------------------------------------------- covariate blocks
// Each takes a `look` — the same interface src/engine/core.js's corridor layer uses — so the fitter can hand it the
// panel and the engine the simulated world. A null value means the source does not cover the year; the caller applies
// the covariate's declared `default_outside` or drops the row.

/**
 * `war_end`: what makes a running interstate war stop. The package's five — duration so far, capability ratio, a
 * great-power belligerent, third-party presence, the economic shock the war is imposing — plus two the measurement
 * added: whether the pair's war is part of a wider coalition, and whether they share a border.
 *
 * The GDP shock is read from the PREVIOUS year, and that is not a detail. Contemporaneous growth in the year a war
 * ends is partly the ending itself: the fitted coefficient on same-year growth is -0.66 against a prior of +0.3,
 * i.e. "wars end in good years", which is the recovery being dated to the year the fighting stopped. Lagging it makes
 * it a covariate rather than a shadow of the label.
 */
export function warEndFeatures({ a, b, age, coalition = 2, look }) {
  const ca = look.cinc(a), cb = look.cinc(b);
  const ga = look.gdpGrowthPrev(a), gb = look.gdpGrowthPrev(b);
  const growth = ga == null ? gb : gb == null ? ga : Math.min(ga, gb);
  return {
    war_duration: age,
    war_coalition: coalition > 2 ? 1 : 0,
    contiguous: (() => { const c = look.contiguous ? look.contiguous(a, b) : null; return c == null ? null : (c ? 1 : 0); })(),
    cap_ratio: ca == null || cb == null ? null : Math.max(ca, cb) / Math.max(1e-6, Math.min(ca, cb)),
    major_power_any: (look.greatPower(a) || look.greatPower(b)) ? 1 : 0,
    war_growth_min: growth ?? null,
    joint_democracy: look.regime(a) == null || look.regime(b) == null ? null : (look.regime(a) >= 2 && look.regime(b) >= 2 ? 1 : 0),
    // third-party presence (operator/presence): a great power's station on one side, allied to it and not to the other
    ...(look.patron ? look.patron(a, b) : { patron_presence: null, patron_presence_rival: null }),
  };
}

// `intrastate_end` has no block here: it is an actor-year template, so its covariates are ordinary panel columns
// read by the fitter's rawValue() and the engine's featureActor(). Only its duration is derived, and it is derived in
// both places from the same rule — count back while the panel's / the actor's `intrastate` is still on.

/**
 * `contest_settle`: what ends a territorial contest. The package's four — duration, the war status of controller and
 * claimant, a treaty/pact between them, and presence. `look.claimants` returns the record's live claimants and
 * `look.allied(x, y)` the defence-pact predicate; both are supplied by the caller.
 */
export function contestFeatures({ rec, state, age, look }) {
  const holder = state?.controller ?? null;
  // the parties to the contest: the record's declared claimants AND the states it prices a stake for. Half the records
  // carry an empty `claimants:` list and name both sides in `stakes:` instead (the field predates this template), and
  // a contest with no counterparty would drop every historical row.
  const parties = [...new Set([...(rec.claimants ?? []), ...Object.keys(rec.stakes ?? {})])].filter(c => c !== holder && look.live(c));
  const side = [holder, ...parties].filter(x => x && look.live(x));
  const anyOf = (f) => { let seen = false; for (const id of side) { const x = f(id); if (x == null) continue; seen = true; if (x > 0) return 1; } return seen ? 0 : null; };
  let pact = 0;
  for (const c of parties) if (holder && look.allied(holder, c)) pact = 1;
  return {
    contest_duration: age,
    contest_reversible: state?.status != null ? (REVERSIBLE.has(state.status) ? 1 : 0) : null,
    contest_at_war: anyOf(look.atWar),
    // a structural zero, not a missing value: a contest with no live counterparty has no pact between the two sides
    contest_allied: pact,
    holder_great_power: holder && look.live(holder) ? (look.greatPower(holder) > 0 ? 1 : 0) : 0,
    holder_presence: holder && look.hostPresence ? look.hostPresence(holder) : null,
  };
}

/**
 * `chokepoint_reopen`: what reopens an impaired strait. Duration of the impairment, whether a transit state is still
 * at war, the guarantor's weight around the record, and whether the controller is a great power. The last three are
 * exactly the record layer's own covariates, read through corridorFeatures by the caller and passed in here, so the
 * reopen template and the status template describe the same record-year with the same numbers.
 */
export function reopenFeatures({ age, corridor }) {
  return { impair_duration: age, adjacent_war: corridor.adjacent_war, guarantor_presence: corridor.guarantor_presence, sponsor_great_power: corridor.sponsor_great_power };
}
