// Engine replay (docs/plan-structure.md, A2): the record as an engine run.
//
// The world the record is in at year y is the world a forecaster standing at y would build — `createWorld({asOf: y})`,
// the same constructor every forecast starts from — plus the two things a forecaster's world leaves to the run because
// they are outcomes of the year itself: the pairs at war during y (the merged dyadic war spells) and the status of
// every corridor, chokepoint and territory record in force at the end of y. Observed through src/contract/frames.js
// in `strict` mode, it is the record provider: an ensemble of one.
//
// Because the forecast's start state IS the replayed state at the origin, a fork (docs/plan-structure.md A4) needs no
// second construction: replay to the origin, then one branch keeps replaying and the other draws.
//
// The transition half (`transitionDiff`) steps the record one year through the engine's own rewrites — the recorded
// events of year y applied to the replayed state of y-1 with src/engine/core.js:applyRecordedEvent — and lists every
// place the result disagrees with the replayed state of y. Each disagreement is a transition the engine cannot
// represent or a record that contradicts itself; scripts/analysis/replay-diff.mjs prints them.
import { createWorld, applyRecordedEvent, mulberry32, corridorStateAt, corridorLastYear } from './core.js';
import { warSpells, territoryStateAt } from './termination.js';
import { observe, FrameBuilder } from '../contract/frames.js';

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** pair -> Set(years at war), from the merged dyadic war spells. Memoised on the events array. */
export function warYearsOf(events) {
  if (events.__warYears) return events.__warYears;
  const m = new Map();
  for (const [k, spans] of warSpells(events)) { const s = new Set(); for (const sp of spans) for (let y = sp.y0; y <= sp.y1; y++) s.add(y); m.set(k, s); }
  Object.defineProperty(events, '__warYears', { value: m, enumerable: false });
  return m;
}
/** year -> [pairs at war]. */
function warPairsByYear(events) {
  if (events.__warByYear) return events.__warByYear;
  const by = new Map();
  for (const [k, ys] of warYearsOf(events)) for (const y of ys) (by.get(y) ?? by.set(y, []).get(y)).push(k);
  Object.defineProperty(events, '__warByYear', { value: by, enumerable: false });
  return by;
}
/** year -> [events that year]. */
export function eventsByYear(events) {
  if (events.__byYear) return events.__byYear;
  const by = new Map();
  for (const e of events) { const y = Math.floor(e.year ?? e.start); if (!Number.isFinite(y)) continue; (by.get(y) ?? by.set(y, []).get(y)).push(e); }
  Object.defineProperty(events, '__byYear', { value: by, enumerable: false });
  return by;
}

/**
 * The record's world at year `y`. `args` is the createWorld argument object (scripts/lib/inputs.mjs:worldArgs) — any
 * `asOf` in it is replaced by `y`.
 */
export function recordWorld(args, y) {
  const w = createWorld({ ...args, asOf: y });
  w.atWarPairs = new Set((warPairsByYear(args.events).get(y) ?? []).filter(k => { const i = k.indexOf('|'); return w.actors[k.slice(0, i)] && w.actors[k.slice(i + 1)]; }));
  // every record in force at the end of y — not only the ones a forecaster's world carries as at-risk units
  w.corridors = (args.corridors ?? []).filter(r => y <= corridorLastYear(r, Infinity)).map(rec => ({ rec, state: corridorStateAt(rec, y) })).filter(e => e.state);
  w.territories = (args.territories ?? []).map(rec => ({ rec, state: territoryStateAt(rec, y) })).filter(e => e.state);
  return w;
}

/**
 * The record as a frame set over [from, to]: one replayed world per year, observed strictly, with the year's recorded
 * events. `onYear(y, world)` is called with each world (the transition diff and the scorer reuse them).
 */
export function recordFrames(args, { from, to, vars = null, onYear = null, meta = {} }) {
  const fb = new FrameBuilder({ from, years: to - from + 1, runs: 1, vars });
  const byYear = eventsByYear(args.events);
  for (let y = from; y <= to; y++) {
    const w = recordWorld(args, y);
    fb.add(0, y - from, observe(w, { strict: true }), byYear.get(y) ?? []);
    if (onYear) onYear(y, w);
  }
  return fb.build({ source: 'record', kind: 'record', built: new Date().toISOString(), ...meta });
}

/**
 * One year of the record through the engine's rewrites: the replayed state of y-1, year y's recorded actor events
 * applied in time order, compared with the replayed state of y. Returns the disagreements.
 *   regime      the engine moves one level per step; the record may jump two, or change with no recorded step
 *   intrastate  an onset sets it, a recorded end clears it the year after; otherwise it persists
 * Only actors live in both years, and only where the panel observes the variable in both (strict observation).
 */
export function transitionDiff(prevWorld, world, yearEvents) {
  const y = world.year, out = [];
  const rng = mulberry32(y);
  const prevObs = observe(prevWorld, { strict: true }).actors, obs = observe(world, { strict: true }).actors;
  const byActor = new Map();
  for (const e of [...yearEvents].sort((p, q) => (p.year ?? 0) - (q.year ?? 0))) if (e.actor) (byActor.get(e.actor) ?? byActor.set(e.actor, []).get(e.actor)).push(e);
  for (const [id, a0] of Object.entries(prevWorld.actors)) {
    const now = obs[id], before = prevObs[id]; if (!now || !before) continue;
    const a = structuredClone({ id, cur: a0.cur, prev: a0.prev, recent: a0.recent, fired: {}, conflictStart: a0.conflictStart });
    const evs = byActor.get(id) ?? [];
    const applied = [];
    for (const e of evs) { if (e.kind === 'regime_change' && e.cause) continue; const r = applyRecordedEvent(prevWorld, a, e, rng); if (r) applied.push(r); }
    const ended = evs.some(e => e.kind === 'intrastate_end');
    if (before.regime != null && now.regime != null) {
      const pred = Math.max(0, Math.min(3, Math.round(a.cur.regime)));
      if (pred !== now.regime) {
        const steps = evs.filter(e => e.kind === 'regime_change');
        const cause = steps.some(e => e.cause) ? 'occupation_or_imposed' : !steps.length ? 'change_without_event' : Math.abs(now.regime - before.regime) > 1 ? 'multi_level_jump' : 'event_without_change';
        out.push({ year: y, actor: id, var: 'regime', from: before.regime, predicted: pred, observed: now.regime, cause, events: steps.map(e => `${e.from}->${e.to}`) });
      }
    }
    if (before.intrastate != null && now.intrastate != null) {
      const was = before.intrastate >= 1, is = now.intrastate >= 1, onset = applied.includes('intrastate_onset');
      const pred = onset ? true : was && !prevEnded(prevWorld, id) ? true : false;
      if (pred !== is) out.push({ year: y, actor: id, var: 'intrastate', from: before.intrastate, predicted: pred ? 1 : 0, observed: now.intrastate, cause: is ? (was ? 'restart_without_onset' : 'onset_missing') : (ended ? 'end_same_year' : 'end_missing') });
    }
  }
  return out;
}
/** Did the record end this actor's internal conflict in the year `world` is at (so it is off from the next year)? */
function prevEnded(world, id) { return (eventsByYear(world.lifecycle.events).get(world.year) ?? []).some(e => e.kind === 'intrastate_end' && e.actor === id); }
