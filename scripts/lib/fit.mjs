// Hazard-template fitting, factored out of scripts/fit-hazards.mjs so the backtest can refit at each as-of year.
//
// One fitter holds the design matrices (they are expensive: the dyad sample is every politically relevant pair-year
// 1816–2001, since data/contiguity.json carries CoW Direct Contiguity back to 1816) and fits them as many times as asked. `maxYear` is the forecaster's information set: a row is kept only
// if the year its *label* is read from is at or before that year, so a fit at maxYear = asOf sees no outcome the
// forecaster standing at asOf could not have seen. Standardisation means/sds are recomputed on each training subset —
// a z-score whose mean came from the full sample is the same leak in a smaller coat.
//
// Nothing here knows about country names; it reads data/panel.json, data/events.json and data/templates.yaml only.
import { readFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, loadPacts } from './hist.mjs';
import { rivalryScore, rivalryDecay, coalitionRule, warDyadSpans, warPartnersAt, warLinked,
  CORRIDOR_UNIT, DYADIC_DISPUTE, corridorFirstYear, corridorLastYear, corridorStateAt, corridorTransitionYears, corridorFeatures, corridorIndex, corridorStake, outsideDefault } from '../../src/engine/core.js';
import { PRESENCE, presenceIndex, patronMap, patronFeatures, guarantorLevel, guarantorFall, hostLevel } from '../../src/engine/presence.js';
import { IMPAIRED, RESOLVED, SPELL_UNITS, warSpells, territoryFirstYear, territoryStateAt, endYears, spellAge,
  warEndFeatures, contestFeatures, reopenFeatures } from '../../src/engine/termination.js';
import { loadWaves, attainRows, WAVE_UNIT } from '../../src/engine/waves.js';

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs, m) => Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));

/** Read every input a fitter needs (used by scripts/fit-hazards.mjs; the backtest passes its own already-loaded copies). */
export function loadFitInputs() {
  const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
  const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
  const templates = Y('data/templates.yaml').templates;
  const contiguityFile = JSON.parse(readFileSync('data/contiguity.json', 'utf8'));
  const contiguity = contiguityFile.pairs, contiguityFrom = contiguityFile.meta?.years?.[0] ?? null;
  const corridors = Y('data/corridors.yaml');
  const territories = Y('data/territories.yaml');
  const presence = Y('data/presence.yaml');
  const waves = loadWaves(Y('data/waves.yaml')).waves;   // operator/capability-waves: the attainment template's own data layer
  const actors = loadActors(); const code = makeCodeMap(actors);
  const successors = Object.fromEntries([...actors.values()].filter(a => a.successor).map(a => [a.id, a.successor]));
  const { pacts } = loadPacts(code);   // era-1991-2026-r2/data-7: CoW 3.03 + ATOP 5.1 + the dated accessions past it
  return { panel, events, templates, contiguity, contiguityFrom, pacts, corridors, territories, successors, presence, waves };
}

export function createFitter({ panel, events, templates, contiguity, contiguityFrom = null, pacts, corridors = [], territories = [], successors = {}, presence = null, waves = [] }) {
  const YEARS = panel.years, Y0 = panel.meta.y0;
  // the rivalry trace's decay, declared on the templates and shared with src/engine/core.js (one process, one δ)
  const DECAY = rivalryDecay(templates);
  // coalition relevance (era-1914-1945/engine-1): the same rule the engine gates its dyad draw with, read from the same
  // declaration in data/templates.yaml, so the sample the coefficients are estimated on and the sample they are drawn
  // over are one set. Here the war graph is the observed one — the cross-side pairs the hand-coded `sides:` lists imply,
  // lagged a year like at_war_any — and the alliance graph is dated rather than frozen.
  const COALITION = coalitionRule(templates);
  const warSpans = COALITION?.relevance ? warDyadSpans(events) : null;
  const warPartnersCache = new Map();
  const warPartners = (y) => { if (!warPartnersCache.has(y)) warPartnersCache.set(y, warPartnersAt(warSpans, y)); return warPartnersCache.get(y); };
  const isContiguous = (a, b, y) => (contiguity[a < b ? `${a}|${b}` : `${b}|${a}`] ?? []).some?.(([f, t]) => y >= f && y <= t) ?? false;
  // the first year the contiguity source covers, read from its own meta rather than hard-coded: a dyad-year before it
  // has no border value at all and is dropped from the design matrix. With CoW Direct Contiguity 3.2 merged in this is
  // 1816, so nothing in the modelled window is dropped any more; the guard stays because the floor is a property of
  // the data file, not of the code.
  const CONTIG_FROM = contiguityFrom ?? -Infinity;
  // the military-presence layer (operator/presence), indexed once and read through src/engine/presence.js — the same
  // module the engine reads, so the patron and guarantor terms are one construction on both sides. Here it is dated
  // (the value at row-year y), where the engine freezes it at as-of.
  const PRES = presence ? presenceIndex(presence, { y0: Y0, y1: Math.max(panel.meta.y1, PRESENCE.covers[1]) }) : null;
  const patronCache = new Map();
  const patronsAtYear = (y) => { if (!patronCache.has(y)) patronCache.set(y, PRES ? patronMap(PRES, y) : new Map()); return patronCache.get(y); };

  // ---------------------------------------------------------------- event index
  const evByActorYear = new Map();   // `${kind}|${actor}|${year}` -> [events]
  const evByDyadYear = new Map();    // `${kind}|${a}|${b}|${year}` (unordered pair)
  for (const e of events) {
    const y = Math.floor(e.year ?? e.start);
    if (e.actor) { const k = `${e.kind}|${e.actor}|${y}`; (evByActorYear.get(k) ?? evByActorYear.set(k, []).get(k)).push(e); }
    if (e.a && e.b) { const k = `${e.kind}|${pairKey(e.a, e.b)}|${y}`; (evByDyadYear.get(k) ?? evByDyadYear.set(k, []).get(k)).push(e); }
  }
  const hasEvent = (kind, actor, y, filter) => (evByActorYear.get(`${kind}|${actor}|${y}`) ?? []).some(e => !filter || Object.entries(filter).every(([k, v]) => e[k] === v));
  const hasDyadEvent = (kind, a, b, y) => evByDyadYear.has(`${kind}|${pairKey(a, b)}|${y}`);
  // every militarized dispute year per pair, sorted — the rivalry trace reads the last one strictly before the row's
  // year, so it is a lagged covariate however far back it reaches and cannot see the row's own label.
  const disputeYears = new Map();
  // the same union src/engine/core.js:createWorld seeds `dyadRecent` from (era-1991-2026-r2/engine-4): the MID
  // kinds plus UCDP's interstate onsets, so the trace means one thing in the fit and one thing in the simulation.
  for (const e of events) if (DYADIC_DISPUTE.has(e.kind) && e.a && e.b) { const k = pairKey(e.a, e.b); (disputeYears.get(k) ?? disputeYears.set(k, []).get(k)).push(Math.floor(e.year)); }
  for (const ys of disputeYears.values()) ys.sort((a, b) => a - b);
  const lastDisputeBefore = (k, y) => { const ys = disputeYears.get(k); if (!ys) return null; let lo = 0, hi = ys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] < y) lo = m + 1; else hi = m; } return lo ? ys[lo - 1] : null; };

  // nuclear weapon status by actor-year (hand events)
  const nukeYear = {}; for (const e of events) if (e.kind === 'nuclear' && e.status === 'weapon') nukeYear[e.actor] = Math.min(nukeYear[e.actor] ?? 9999, e.year);
  const hasNukes = (a, y) => nukeYear[a] != null && y >= nukeYear[a];

  // ---------------------------------------------------------------- covariate access
  const pv = (actor, v, y) => { const arr = panel.actors[actor]?.[v]; const i = y - Y0; return arr && i >= 0 && i < arr.length ? arr[i] : null; };
  const win5 = (actor, v, y) => { let s = 0; for (let k = 1; k <= 5; k++) { const x = pv(actor, v, y - k); if (x != null && x > 0) s = 1; } return s; };
  const win5ev = (kind, actor, y) => { for (let k = 1; k <= 5; k++) if (hasEvent(kind, actor, y - k)) return 1; return 0; };
  const derived = {
    milper_share: (a, y) => { const m = pv(a, 'milper', y), p = pv(a, 'tpop', y); return m != null && p ? (m * 1e3) / p : null; },
    leader_exit_recent: (a, y) => win5ev('leader_exit', a, y),
    regime_change: (a, y) => (hasEvent('regime_change', a, y) ? 1 : 0),
    // operator/termination: years the actor's internal-conflict spell has already run when year y opens. Counted back
    // over the panel's own `intrastate` column, which is the flag the engine sets and clears, so the duration fitted
    // and the duration simulated are the same quantity. Past years only — it cannot see the row's label.
    conflict_duration: (a, y) => spellAge((yy) => (pv(a, 'intrastate', yy) ?? 0) > 0, y),
  };
  function rawValue(actor, c, y) {
    const v = c.var;
    if (c.transform === 'win5') return derived[v] ? (derived[v](actor, y) ?? 0) : win5(actor, v, y);
    const yy = y - (c.lag ?? (c.transform === 'lag1' ? 1 : 0));
    const x = derived[v] ? derived[v](actor, yy) : pv(actor, v, yy);
    // outside its source's coverage a covariate may carry a declared structural default instead of killing the row
    if (x == null && c.default_outside) { const [w0, w1] = c.default_outside.window; if (yy < w0 || yy > w1) return c.default_outside.value; }
    if (x == null) return null;
    return x;
  }

  // ---------------------------------------------------------------- design matrix builders
  function buildActorRows(t) {
    const rows = [];
    const [w0, w1] = t.window;
    for (const [id, vars] of Object.entries(panel.actors)) {
      for (let y = Math.max(w0, Y0 + 5); y <= Math.min(w1, panel.meta.y1); y++) {
        if (!vars.live?.[y - Y0]) continue;
        if (t.sample?.regime_max != null && !(pv(id, 'regime', y) <= t.sample.regime_max)) continue;
        if (t.sample?.regime_min != null && !(pv(id, 'regime', y) >= t.sample.regime_min)) continue;
        // a spell template's sample is the years the spell is running (operator/termination): `sample.flag` names the
        // panel column that IS the state, and the row exists only while it is on.
        if (t.sample?.flag != null && !((pv(id, t.sample.flag, y) ?? 0) > 0)) continue;
        // ... and the last year the flag's own source covers is right-censored: a run still on when the dataset stops
        // may or may not have ended there, and keeping it as a non-ending would make every long conflict look finished.
        if (t.sample?.flag != null && y >= (panel.meta.vars?.[t.sample.flag]?.last ?? Infinity)) continue;
        // era-1914-1945-r2/statistics-3: a state under foreign occupation is not at risk of a domestic transition, and
        // its label is forced to 0 by the template's own `event_filter: { cause: null }`. Censor the row out of the
        // denominator instead of scoring it as an observed non-event.
        if (t.sample?.exclude_flag != null && (pv(id, t.sample.exclude_flag, y) ?? 0) > 0) continue;
        const feats = {}; let ok = true;
        for (const c of t.covariates) { const x = rawValue(id, c, y); if (x == null) { ok = false; break; } feats[c.var] = x; }
        if (!ok) continue;
        rows.push({ unit: id, year: y, feats, y: hasEvent(t.event, id, y + (t.lead ?? 0), t.event_filter) ? 1 : 0 });
      }
    }
    return rows;
  }
  // ---------------------------------------------------------------- the corridor / chokepoint layer
  // The record layer reads the panel through the same `look` interface src/engine/core.js reads the simulated world
  // through, so corridorFeatures() is one construction with two data sources (agent/implementer.md: fit and simulation
  // are the same model). Covariates are contemporaneous: the engine draws corridor transitions last in the step, after
  // the war draws, so a transit state that goes to war this year is visible on both sides.
  const panelLook = (y) => ({
    year: y,
    guarantor: PRES ? (rec, T) => ({ level: guarantorLevel(PRES, rec, T, y), fall: guarantorFall(PRES, rec, T, y) }) : null,
    live: (id) => panel.actors[id]?.live?.[y - Y0] === 1,
    atWar: (id) => pv(id, 'at_war', y),
    intrastate: (id) => pv(id, 'intrastate', y),
    gdpGrowth: (id) => pv(id, 'gdp_growth', y),
    greatPower: (id) => pv(id, 'great_power', y),
    successor: (id) => successors[id] ?? null,
  });
  /** The records that exist in year y, with the status/controller in force at the end of it (for the dampener). */
  const entriesCache = new Map();
  const corridorEntriesAt = (y) => {
    if (entriesCache.has(y)) return entriesCache.get(y);
    const out = corridors.filter(rec => { const f = corridorFirstYear(rec, Y0); return f != null && y >= f && y <= corridorLastYear(rec, Infinity); }).map(rec => ({ rec, state: corridorStateAt(rec, y) }));
    entriesCache.set(y, out); return out;
  };
  const idxCache = new Map();
  const corridorIndexAt = (y) => { if (!idxCache.has(y)) idxCache.set(y, corridorIndex(corridorEntriesAt(y), panelLook(y))); return idxCache.get(y); };

  function buildRecordRows(t) {
    const rows = []; const [w0, w1] = t.window; const yEnd = Math.min(w1, panel.meta.y1);
    for (const rec of corridors) {
      if (CORRIDOR_UNIT[rec.kind] !== t.unit) continue;
      const first = corridorFirstYear(rec, w0); if (first == null) continue;
      const last = corridorLastYear(rec, yEnd);   // era-1991-2026-r2/corridors-6: a retired record contributes no rows past its end
      const trans = corridorTransitionYears(rec, first, last);
      for (let y = first; y <= last; y++) {
        // the state the year opens in (the year's own transition is the label, so it cannot be a covariate)
        const state = corridorStateAt(rec, y - 1) ?? corridorStateAt(rec, y);
        const f = corridorFeatures(rec, state, panelLook(y));
        const feats = {}; let ok = true;
        for (const c of t.covariates) { let x = f[c.var]; if (x == null) x = outsideDefault(c, y); if (x == null) { ok = false; break; } feats[c.var] = x; }
        if (!ok) continue;
        rows.push({ unit: rec.id, year: y, feats, y: trans.has(y + (t.lead ?? 0)) ? 1 : 0 });
      }
    }
    return rows;
  }

  // ---------------------------------------------------------------- the termination layer (operator/termination)
  // Three spell-year samples, all built through src/engine/termination.js so the engine draws from the same code.
  // The convention is the record layer's: the covariates are the state the year OPENS in, the label is "the spell ends
  // during the year", and a spell whose end is not observed (the source stops while it is still running) contributes
  // its years as non-endings except the last, which is dropped rather than scored.
  const WAR_SPELLS = warSpells(events, { kind: 'mid_war' });

  /** The look the termination blocks read the panel through — the fitter's twin of src/engine/core.js:worldLook. */
  const termLook = (y) => ({
    year: y,
    live: (id) => panel.actors[id]?.live?.[y - Y0] === 1,
    cinc: (id) => pv(id, 'cinc', y),
    regime: (id) => pv(id, 'regime', y),
    logGdpPc: (id) => pv(id, 'log_gdp_pc', y),
    gdpGrowth: (id) => pv(id, 'gdp_growth', y),
    gdpGrowthPrev: (id) => pv(id, 'gdp_growth', y - 1),
    greatPower: (id) => pv(id, 'great_power', y),
    atWar: (id) => pv(id, 'at_war', y),
    allied: (a, b) => pacts.has(`${pairKey(a, b)}|${y}`),
    hostPresence: (id) => (PRES ? hostLevel(PRES, id, y) : null),
    contiguous: (a, b) => (y >= CONTIG_FROM ? isContiguous(a, b, y) : null),
    patron: (a, b) => patronFeatures({ patrons: patronsAtYear(y), allied: (p, h) => pacts.has(`${pairKey(p, h)}|${y}`), major: (id) => (pv(id, 'great_power', y) ?? 0) > 0, a, b }),
  });

  function buildWarSpellRows(t) {
    const rows = []; const [w0, w1] = t.window; const yEnd = Math.min(w1, panel.meta.y1);
    for (const [k, spells] of WAR_SPELLS) {
      const i = k.indexOf('|'); const a = k.slice(0, i), b = k.slice(i + 1);
      for (const s of spells) {
        const last = s.censored ? s.y1 - 1 : s.y1;   // a censored spell's final year has no observed answer
        for (let y = Math.max(w0, s.y0); y <= Math.min(yEnd, last); y++) {
          const f = warEndFeatures({ a, b, age: y - s.y0, coalition: s.n_participants, look: termLook(y) });
          const feats = {}; let ok = true;
          for (const c of t.covariates) { let x = f[c.var]; if (x == null) x = outsideDefault(c, y); if (x == null) { ok = false; break; } feats[c.var] = x; }
          if (!ok) continue;
          rows.push({ unit: k, a, b, year: y, feats, y: y === s.y1 && !s.censored ? 1 : 0 });
        }
      }
    }
    return rows;
  }

  /**
   * Impaired record-years: the sample `record_reopen` terminates. `t.kinds` selects which record kinds are in it —
   * both, because a strait and a rail line that have been cut are the same process returning to service, and because
   * chokepoints alone give 31 spell-years inside the window where the hand record layer is complete.
   */
  function buildReopenRows(t) {
    const rows = []; const [w0, w1] = t.window; const yEnd = Math.min(w1, panel.meta.y1);
    const kinds = new Set(t.kinds ?? Object.keys(CORRIDOR_UNIT).filter(k => CORRIDOR_UNIT[k] === t.unit));
    for (const rec of corridors) {
      if (!kinds.has(rec.kind)) continue;
      const first = corridorFirstYear(rec, w0); if (first == null) continue;
      // right-censoring, the rule buildActorRows already applies to a dataset that stops (era-1870-1914-r2/engine-5):
      // a record's history stops at its last status change, and the years after it are not observed non-endings — they
      // are years nobody coded. 113 of the 185 rows in this sample were such a tail, and they put the reopen base rate
      // at 8.6% where the coded sample says 22%. Rows stop at `covered_through` where the record declares one (with a
      // source saying the impairment is permanent through it) and otherwise at the last dated history year; that final
      // year is itself dropped unless the spell is observed to end in it, since whether it ended is unknown.
      const h = [...(rec.history ?? [])].sort((a, b) => a.year - b.year);
      const covered = rec.covered_through != null ? Math.floor(rec.covered_through) : Math.floor(h[h.length - 1].year);
      const yStop = Math.min(yEnd, covered, corridorLastYear(rec, Infinity));   // era-1991-2026-r2/corridors-6
      const open = (y) => (y <= first ? corridorStateAt(rec, y) : corridorStateAt(rec, y - 1));
      const close = (y) => corridorStateAt(rec, y);
      const ends = endYears({ open: (y) => open(y)?.status ?? null, close: (y) => close(y)?.status ?? null, inSpell: (s) => IMPAIRED.has(s), from: first, to: yStop });
      let age = 0;
      for (let y = first; y <= yStop; y++) {
        if (y === yStop && !ends.has(y)) continue;
        const state = open(y);
        if (!state || !IMPAIRED.has(state.status)) { age = 0; continue; }
        const f = { ...reopenFeatures({ age, corridor: corridorFeatures(rec, state, panelLook(y)) }) };
        age++;
        const feats = {}; let ok = true;
        for (const c of t.covariates) { let x = f[c.var]; if (x == null) x = outsideDefault(c, y); if (x == null) { ok = false; break; } feats[c.var] = x; }
        if (!ok) continue;
        rows.push({ unit: rec.id, year: y, feats, y: ends.has(y) ? 1 : 0 });
      }
    }
    return rows;
  }

  /** Unsettled territory-years: the sample `contest_settle` terminates (data/territories.yaml dated histories). */
  function buildTerritoryRows(t) {
    const rows = []; const [w0, w1] = t.window; const yEnd = Math.min(w1, panel.meta.y1);
    for (const rec of territories) {
      const first = territoryFirstYear(rec); if (first == null) continue;
      const start = Math.max(first, w0);
      const open = (y) => (y <= first ? territoryStateAt(rec, y) : territoryStateAt(rec, y - 1));
      const ends = endYears({ open: (y) => open(y)?.status ?? null, close: (y) => territoryStateAt(rec, y)?.status ?? null, inSpell: (s) => !RESOLVED.has(s), from: start, to: yEnd });
      let age = 0;
      for (let y = start; y <= yEnd; y++) {
        const state = open(y);
        if (!state || RESOLVED.has(state.status)) { age = 0; continue; }
        const f = contestFeatures({ rec, state, age, look: termLook(y) });
        age++;
        const feats = {}; let ok = true;
        for (const c of t.covariates) { let x = f[c.var]; if (x == null) x = outsideDefault(c, y); if (x == null) { ok = false; break; } feats[c.var] = x; }
        if (!ok) continue;
        rows.push({ unit: rec.id, year: y, feats, y: ends.has(y) ? 1 : 0 });
      }
    }
    return rows;
  }

  // the dyad feature block does not depend on which dyadic template asks for it, so it is built once per window and
  // relabelled per template (mid_force and mid_war share 69k rows).
  const dyadCache = new Map();
  function dyadFeatureRows(w0, w1) {
    const key = `${w0}|${w1}|${DECAY}|${COALITION?.relevance || 'base'}`; if (dyadCache.has(key)) return dyadCache.get(key);
    const rows = []; const ids = Object.keys(panel.actors);
    for (let y = Math.max(w0, Y0 + 5); y <= Math.min(w1, panel.meta.y1); y++) {
      const live = ids.filter(id => panel.actors[id].live?.[y - Y0] && pv(id, 'cinc', y) != null && pv(id, 'regime', y) != null);
      const wp = warSpans ? warPartners(y - 1) : null;
      const alliedY = { has: (k) => pacts.has(`${k}|${y}`) };
      const cIdx = corridorIndexAt(y);
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j]; const ca = pv(a, 'cinc', y), cb = pv(b, 'cinc', y);
        const contiguous = y >= CONTIG_FROM ? (isContiguous(a, b, y) ? 1 : 0) : null;
        const major = (pv(a, 'great_power', y) || pv(b, 'great_power', y)) ? 1 : 0;
        // politically relevant dyads only (Lemke & Reed 2001), plus — where the coalition rule is on — the pairs a
        // running war makes relevant: at war with each other, or at war with a state allied to the other.
        if (contiguous == null) continue;
        if (!contiguous && !major && !(wp && warLinked(wp, alliedY, a, b, COALITION.relevance))) continue;
        const feats = {
          contiguous,
          allied: pacts.has(`${pairKey(a, b)}|${y}`) ? 1 : 0,
          joint_democracy: pv(a, 'regime', y) >= 2 && pv(b, 'regime', y) >= 2 ? 1 : 0,
          cap_ratio: Math.max(ca, cb) / Math.max(1e-6, Math.min(ca, cb)),
          major_power_any: (pv(a, 'great_power', y) || pv(b, 'great_power', y)) ? 1 : 0,
          mid_force: (() => { for (let k = 1; k <= 5; k++) if (hasDyadEvent('mid_force', a, b, y - k) || hasDyadEvent('mid_war', a, b, y - k)) return 1; return 0; })(),
          rivalry: rivalryScore(lastDisputeBefore(pairKey(a, b), y), y, DECAY),
          at_war_any: ((pv(a, 'at_war', y - 1) ?? 0) || (pv(b, 'at_war', y - 1) ?? 0)) ? 1 : 0,
          // the era interaction on the contagion term (era-1914-1945-r2/engine-1): a DELTA on at_war_any above for
          // y >= 1946, crossed with the same `pre_1946` constant this block already carries. Mirrored in
          // src/engine/core.js:dyadHazards so the fit and the draw are one construction.
          at_war_any_post46: (((pv(a, 'at_war', y - 1) ?? 0) || (pv(b, 'at_war', y - 1) ?? 0)) && y >= 1946) ? 1 : 0,
          nuclear_both: hasNukes(a, y) && hasNukes(b, y) ? 1 : 0,
          pre_1946: y < 1946 ? 1 : 0,   // era-1870-1914/statistics-6, a derived constant; candidate only
          // era-1914-1945/corridors-7, the dampener docs/schema.md specifies; built by src/engine/core.js so the
          // engine's dyad block and this one are one construction. Candidate only.
          corridor_stake: corridorStake(cIdx, a, b, alliedY, y),
          // the patron term (operator/presence), built by src/engine/presence.js so this block and the engine's dyad
          // block are one construction. Candidate only.
          ...patronFeatures({ patrons: patronsAtYear(y), allied: (p, h) => pacts.has(`${pairKey(p, h)}|${y}`), major: (id) => (pv(id, 'great_power', y) ?? 0) > 0, a, b }),
        };
        rows.push({ unit: pairKey(a, b), a, b, year: y, feats });
      }
    }
    dyadCache.set(key, rows); return rows;
  }
  function buildDyadRows(t) {
    const [w0, w1] = t.window;
    return dyadFeatureRows(w0, w1).map(r => ({ unit: r.unit, year: r.year, feats: r.feats, y: hasDyadEvent(t.event, r.a, r.b, r.year) ? 1 : 0 }));
  }
  const RECORD_UNITS = new Set(Object.values(CORRIDOR_UNIT));
  // operator/capability-waves: the attainment sample is built by src/engine/waves.js, the same call the engine's
  // forward step makes, so the design matrix here and the hazard drawn there are one construction. The label is the
  // dated sovereign_by history in data/waves.yaml rather than a row of data/events.json — the only template whose
  // ground truth lives in the infrastructure layer rather than the event log.
  function buildWaveRows(t) {
    if (!waves.length) return [];
    return attainRows({
      waves, panel, window: t.window, lead: t.lead ?? 1,
      allied: (a, b, y) => pacts.has(`${pairKey(a, b)}|${y}`),
      ...(t.sample?.min_industry != null ? { minIndustry: t.sample.min_industry } : {}),
    });
  }
  const rowsOf = (t) =>
    t.unit === WAVE_UNIT ? buildWaveRows(t)
    : t.unit === SPELL_UNITS.war ? buildWarSpellRows(t)
      : t.unit === SPELL_UNITS.territory ? buildTerritoryRows(t)
        : t.unit === SPELL_UNITS.record ? buildReopenRows(t)
          : t.unit === 'dyad-year' ? buildDyadRows(t)
            : RECORD_UNITS.has(t.unit) ? buildRecordRows(t)
              : buildActorRows(t);
  const rowCache = new Map();
  function rowsFor(t) {
    if (rowCache.has(t.id)) return rowCache.get(t.id);
    const rows = rowsOf(t);
    rowCache.set(t.id, rows); return rows;
  }

  // ---------------------------------------------------------------- encode: transforms -> columns
  function encode(t, rows, stats) {
    const cols = []; // { name, prior, get(row) }
    for (const c of t.covariates) {
      const v = c.var;
      if (c.transform === 'cat') {
        const levels = Object.keys(c.prior).map(Number).sort();
        for (const L of levels.slice(1)) cols.push({ name: `${v}=${L}`, prior: c.prior[L] - c.prior[levels[0]], get: r => (r.feats[v] === L ? 1 : 0) });
      } else if (c.transform === 'z') {
        const xs = rows.map(r => r.feats[v]); const m = stats[v]?.mean ?? mean(xs), s = stats[v]?.sd ?? sd(xs, m); stats[v] = { mean: m, sd: s };
        cols.push({ name: `z(${v})`, prior: c.prior, get: r => (r.feats[v] - m) / (s || 1) });
      } else if (c.transform === 'log') {
        const xs = rows.map(r => Math.log(r.feats[v] + 1e-3)); const m = stats[`log_${v}`]?.mean ?? mean(xs); stats[`log_${v}`] = { mean: m };
        cols.push({ name: `log(${v})`, prior: c.prior, get: r => Math.log(r.feats[v] + 1e-3) - m });
      } else cols.push({ name: c.transform === 'win5' ? `win5(${v})` : c.transform === 'lag1' ? `lag1(${v})` : v, prior: c.prior, get: r => (r.feats[v] > 0 ? 1 : 0) });
    }
    return cols;
  }

  /** The year a row's label is read from — a fit at maxYear may only use rows whose outcome is already observed. */
  const labelYear = (t, r) => r.year + (t.lead ?? 0);

  // ---------------------------------------------------------------- one template
  function fitTemplate(t, { maxYear = null, splitOverride = null, holdout = true, ablation = true } = {}) {
    if (t.status === 'candidate' || t.sample === 'latent_only')
      return { fit: { status: 'unfitted', reason: 'no panel sample yet; using literature prior' }, line: `${t.id.padEnd(24)} unfitted (prior only)` };
    let rows = rowsFor(t);
    if (maxYear != null) rows = rows.filter(r => labelYear(t, r) <= maxYear);
    const nev = rows.filter(r => r.y).length;
    if (rows.length < 50 || nev < 5) {
      const reason = maxYear != null ? `n=${rows.length}, events=${nev} in years ≤ ${maxYear}` : `n=${rows.length}, events=${nev}`;
      return { fit: { status: 'unfitted', reason, trained_through: maxYear }, line: `${t.id.padEnd(24)} unfitted (${reason})` };
    }
    const stats = {}; const cols = encode(t, rows, stats);
    const design = (rs) => rs.map(r => [1, ...cols.map(c => c.get(r))]);
    const X = design(rows), yv = rows.map(r => r.y), prior = [0, ...cols.map(c => c.prior)];
    const beta = fitLogistic(X, yv, prior);
    const pIn = predict(X, beta);
    // era holdout: split at the window midpoint (or 1946 if inside the window)
    const [w0, w1] = t.window; const split = splitOverride ?? t.holdout_split ?? (w0 < 1946 && w1 > 1960 ? 1946 : Math.round((w0 + w1) / 2));
    let hold = null;
    if (holdout) {
      const trainR = rows.filter(r => r.year < split), testR = rows.filter(r => r.year >= split);
      if (trainR.filter(r => r.y).length >= 5 && testR.filter(r => r.y).length >= 5) {
        const bH = fitLogistic(design(trainR), trainR.map(r => r.y), prior); const pH = predict(design(testR), bH); const yH = testR.map(r => r.y);
        hold = { split, n_train: trainR.length, n_test: testR.length, auc: auc(pH, yH), brier: brier(pH, yH), base_rate_test: mean(yH) };
      }
    }
    const evn = yv.reduce((a, b) => a + b, 0);
    // ---- ablation: candidates fitted one at a time and all together, scored on the same era holdout
    let ablationOut = null;
    if (ablation && t.candidates?.length) {
      ablationOut = [];
      const variants = [['base', []], ...t.candidates.map(c => [c.id, [c]]), ['all', t.candidates]];
      // A candidate may declare its own holdout_split, and then the whole ablation (base included) is scored at it, so
      // the variants stay comparable. An era dummy needs one: with the template's own split every training row is on
      // one side of the era and the coefficient never leaves its prior — the identification rule docs/system.md states.
      const splitA = t.candidates.find(c => c.holdout_split)?.holdout_split ?? split;
      for (const [name, extra] of variants) {
        const tv = { ...t, covariates: [...t.covariates, ...extra] };
        let rowsV = rowsOf(tv);
        if (maxYear != null) rowsV = rowsV.filter(r => labelYear(tv, r) <= maxYear);
        const trainV = rowsV.filter(r => r.year < splitA), testV = rowsV.filter(r => r.year >= splitA);
        if (trainV.filter(r => r.y).length < 5 || testV.filter(r => r.y).length < 5) { ablationOut.push({ variant: name, n: rowsV.length, note: 'insufficient events' }); continue; }
        const statsV = {}; const colsV = encode(tv, rowsV, statsV); const dV = (rs) => rs.map(r => [1, ...colsV.map(c => c.get(r))]);
        const bV = fitLogistic(dV(trainV), trainV.map(r => r.y), [0, ...colsV.map(c => c.prior)]);
        const pH = predict(dV(testV), bV), yH = testV.map(r => r.y);
        const bAll = fitLogistic(dV(rowsV), rowsV.map(r => r.y), [0, ...colsV.map(c => c.prior)]);
        const predH = pH.reduce((a, b) => a + b, 0), obsH = yH.reduce((a, b) => a + b, 0);
        // era-1991-2026-r2/statistics-1. Two things this block used to get wrong, both of which put a number into a
        // promotion record that the holdout never produced:
        // (a) the reported coefficient came from `bAll` — the fit on ALL rows, the holdout included — while the
        //     AUC/Brier/exp-obs beside it came from `bV`, the train-only fit. Every "coef +0.57" copied into a
        //     `lifecycle.reason` was therefore an in-sample number printed beside out-of-sample scores. Both are
        //     reported now, and `coefs` is the train-only one: the coefficient that produced the scores.
        // (b) `degenerate` was computed over the FULL sample, so a candidate that is CONSTANT IN TRAINING passed
        //     silently — the MAP prior was applied to the test rows and moved the holdout score, and the "gain" was
        //     the hand-typed prior rather than anything the data estimated. Measured on irregular_exit at split
        //     1986: anticoup_norm (1 only from 1999) scored 0.743/0.0098/1.22 against base 0.749/0.0099/1.43, and
        //     with its prior set to 0 it scored identically to base to four decimals. A variant with a term that
        //     cannot be identified in its own training half is reported as unidentified and carries no score.
        const deadV = colsV.filter(c => extra.some(e => c.name.includes(e.var))).filter(c => { const xs = trainV.map(r => c.get(r)); return xs.every(x => x === xs[0]); }).map(c => c.name);
        const coefOf = (b) => Object.fromEntries(extra.map(c => { const nm = colsV.find(x => x.name.includes(c.var))?.name; const j = colsV.findIndex(x => x.name === nm); return [nm, b[j + 1]]; }));
        if (deadV.length) { ablationOut.push({ variant: name, split: splitA, n: rowsV.length, events: rowsV.filter(r => r.y).length, degenerate_in_train: deadV, note: `unidentified at this split: ${deadV.join(', ')} ${deadV.length > 1 ? 'are' : 'is'} constant over the training rows (< ${splitA}), so the coefficient cannot leave its prior and any movement in the holdout score is the prior applied to the test rows` }); continue; }
        ablationOut.push({ variant: name, split: splitA, n: rowsV.length, events: rowsV.filter(r => r.y).length, auc_holdout: auc(pH, yH), brier_holdout: brier(pH, yH), exp_obs_holdout: predH / Math.max(1, obsH), coefs: coefOf(bV), coefs_insample: coefOf(bAll) });
      }
    }
    const years = rows.map(r => labelYear(t, r));
    // identification, reported so a scorer can refuse a fit rather than dress one up (era-1870-1914-r2/statistics-6):
    // `degenerate` names the encoded columns with no within-training variation — their coefficient cannot leave its
    // prior and the term is not estimated — and `epv` is events per column actually estimated. mid_war at as-of 1900
    // was 8 events over 9 covariates, two of them constants, and the row carried the same fields as one fitted on 227.
    const degenerate = cols.filter(c => { const xs = rows.map(r => c.get(r)); return xs.every(x => x === xs[0]); }).map(c => c.name);
    // era-1914-1945-r2/statistics-6: rows are not independent observations when a template declares `cluster:`.
    // war_end's 421 dyadic spells are ~65 connected war components — spells that share a belligerent in a shared year,
    // i.e. the pairs inside one war — and every dyad inside a coalition war ends on the same date, so its 362
    // "endings" are about 65 independent terminations and `war_coalition` is constant WITHIN a component by
    // construction. epv over rows said 135.7 where epv over clusters says about 65/4. Reported, not yet used to
    // widen a confidence interval: a cluster bootstrap on the holdout AUC is the escalated half.
    let clusters = null;
    if (t.cluster === 'war_component' && rows.length && rows[0].a) {
      const parent = new Map(); const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
      const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
      const byActorYear = new Map();
      for (const r of rows) { add(r.unit); for (const id of [r.a, r.b]) { const k = `${id}|${r.year}`; (byActorYear.get(k) ?? byActorYear.set(k, []).get(k)).push(r.unit); } }
      for (const list of byActorYear.values()) { for (const u of list) add(u); for (let i = 1; i < list.length; i++) { const x = find(list[0]), y = find(list[i]); if (x !== y) parent.set(y, x); } }
      clusters = new Set([...parent.keys()].map(find)).size;
    }
    const fit = {
      ablation: ablationOut,
      status: 'fitted', unit: t.unit, event: t.event, n: rows.length, events: evn, base_rate: evn / rows.length, window: t.window,
      degenerate, epv: evn / Math.max(1, cols.length - degenerate.length),
      ...(clusters != null ? { cluster: t.cluster, n_clusters: clusters, epv_clusters: clusters / Math.max(1, cols.length - degenerate.length) } : {}),
      trained_through: maxYear ?? Math.max(...years), train_years: [Math.min(...years), Math.max(...years)],
      intercept: beta[0], coefs: Object.fromEntries(cols.map((c, j) => [c.name, { value: beta[j + 1], prior: c.prior }])), stats,
      auc_in: auc(pIn, yv), brier_in: brier(pIn, yv), calibration: calibration(pIn, yv), holdout: hold,
      fitted: new Date().toISOString().slice(0, 10), source: `fit on data/panel.json + data/events.json, MAP logistic, prior sd ${Math.sqrt(1 / 2).toFixed(2)}`,
    };
    const top = cols.map((c, j) => `${c.name} ${beta[j + 1] >= 0 ? '+' : ''}${beta[j + 1].toFixed(2)}`).join('  ');
    let line = `${t.id.padEnd(24)} n=${rows.length}${clusters != null ? ` clusters=${clusters}` : ''} ev=${evn} rate=${(evn / rows.length * 100).toFixed(2)}%  AUC in=${fit.auc_in?.toFixed(3)} hold=${hold?.auc?.toFixed(3) ?? '—'}(≥${split})\n${''.padEnd(24)} ${top}`;
    if (ablationOut) for (const a of ablationOut) line += `\n${''.padEnd(24)} ablation ${a.variant.padEnd(16)} ${a.note ?? `n=${a.n} ev=${a.events}  hold AUC ${a.auc_holdout?.toFixed(3)}  brier ${a.brier_holdout?.toFixed(4)}  exp/obs ${a.exp_obs_holdout?.toFixed(2)}  ${Object.entries(a.coefs).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`).join(' ')}`}`;
    return { fit, line };
  }

  /** Fit every template (or the ones in `only`). `maxYear` restricts the sample to labels observed by that year. */
  function fitAll({ only = null, maxYear = null, splitOverride = null, holdout = true, ablation = true } = {}) {
    const fits = {}; const lines = [];
    for (const t of templates) {
      if (only && only.size && !only.has(t.id)) continue;
      const { fit, line } = fitTemplate(t, { maxYear, splitOverride, holdout, ablation });
      fits[t.id] = fit; lines.push(line);
    }
    return { fits, lines };
  }

  return { fitAll, fitTemplate, rowsFor, encode, templates };
}

// ---------------------------------------------------------------- MAP logistic regression (IRLS), Gaussian prior on slopes
export function fitLogistic(X, y, prior, lambda = 2.0, iters = 50) {
  const n = X.length, p = X[0].length; let beta = new Array(p).fill(0);
  const base = Math.min(0.999, Math.max(0.001, y.reduce((a, b) => a + b, 0) / n)); beta[0] = Math.log(base / (1 - base));
  const obj = (b) => { let ll = 0; for (let i = 0; i < n; i++) { let eta = 0; for (let j = 0; j < p; j++) eta += X[i][j] * b[j]; ll += y[i] * eta - Math.log1p(Math.exp(eta)); } for (let j = 1; j < p; j++) ll -= lambda / 2 * (b[j] - prior[j]) ** 2; return ll; };
  let cur = obj(beta);
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const xi = X[i]; let eta = 0; for (let j = 0; j < p; j++) eta += xi[j] * beta[j];
      const mu = 1 / (1 + Math.exp(-eta)), w = Math.max(1e-6, mu * (1 - mu));
      for (let j = 0; j < p; j++) { g[j] += xi[j] * (y[i] - mu); for (let k = 0; k <= j; k++) H[j][k] += w * xi[j] * xi[k]; }
    }
    for (let j = 1; j < p; j++) { g[j] -= lambda * (beta[j] - prior[j]); H[j][j] += lambda; }
    H[0][0] += 1e-6;
    for (let j = 0; j < p; j++) for (let k = j + 1; k < p; k++) H[j][k] = H[k][j];
    const step = solve(H, g);
    let t = 1, next = null, val = -Infinity;
    for (let bt = 0; bt < 20; bt++) { next = beta.map((b, j) => b + t * step[j]); val = obj(next); if (val >= cur - 1e-9) break; t /= 2; }
    if (val < cur) break;
    const maxs = Math.max(...step.map(s => Math.abs(s * t)));
    beta = next; cur = val;
    if (maxs < 1e-7) break;
  }
  return beta;
}
export function solve(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export const predict = (X, beta) => X.map(xi => 1 / (1 + Math.exp(-xi.reduce((s, x, j) => s + x * beta[j], 0))));
export function auc(p, y) {
  const pos = [], neg = []; p.forEach((v, i) => (y[i] ? pos : neg).push(v));
  if (!pos.length || !neg.length) return null;
  const all = p.map((v, i) => [v, y[i]]).sort((a, b) => a[0] - b[0]); let rank = 0, sumPos = 0;
  for (let i = 0; i < all.length;) { let j = i; while (j < all.length && all[j][0] === all[i][0]) j++; const r = (i + j + 1) / 2; for (let k = i; k < j; k++) if (all[k][1]) sumPos += r; i = j; rank = j; }
  return (sumPos - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length);
}
export const brier = (p, y) => mean(p.map((v, i) => (v - y[i]) ** 2));
export function calibration(p, y, bins = 10) {
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]); const out = [];
  for (let b = 0; b < bins; b++) { const sl = idx.slice(Math.floor(b * idx.length / bins), Math.floor((b + 1) * idx.length / bins)); if (!sl.length) continue; out.push({ pred: mean(sl.map(i => p[i])), obs: mean(sl.map(i => y[i])), n: sl.length }); }
  return out;
}
