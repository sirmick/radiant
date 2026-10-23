// The frame contract (docs/plan-structure.md, A1/A3): one way to observe a world, one way to aggregate observations.
//
//   observe(world)      reads any engine world — a replayed one (the record) or a simulated one — through the registry's
//                       readers. It consumes no random numbers, so observing a run cannot move it.
//   FrameBuilder        accumulates observations over runs × year offsets and publishes a frame set. The record is a
//                       FrameBuilder with runs = 1; a sample world is a FrameBuilder with runs = 1 fed from one run of
//                       an ensemble, so the viewer reads history, a sample world and a consensus through the same
//                       decoder (src/contract/read.js).
//
// Encoding of one entity-variable over the frame set's years — an array indexed by year offset k:
//   runs = 1   binary 0/1 · categorical level index (or level word for an open vocabulary) · continuous number · null
//   runs > 1   binary P(1) · categorical probability vector (or {word: p}) · continuous [p10, p50, p90] · null
// A binary array that is zero everywhere is omitted: absent = 0 wherever the entity is live and the variable covered.
// A dyad value that is the same in every year may be stored as one number instead of an array.
import { VARS, varKey, varsOf, publishVars } from './vars.js';

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const r3 = (x) => +x.toFixed(3);
const sig4 = (x) => (x == null ? null : +x.toPrecision(4));

/**
 * One world, observed. `strict` is the record's mode: a variable whose truth is a panel column is emitted only where the
 * panel measures it that year (a value the engine carried forward to fill a gap is not a measurement), and nothing is
 * emitted outside the variable's coverage window.
 */
export function observe(world, { strict = false } = {}) {
  const y = world.year;
  const inCov = (v) => !strict || !v.coverage || (y >= v.coverage[0] && y <= v.coverage[1]);
  const actors = {};
  for (const [id, a] of Object.entries(world.actors)) {
    const o = {};
    for (const v of varsOf('actor')) {
      if (!inCov(v)) { o[v.id] = null; continue; }
      if (strict && v.truth?.startsWith('panel:')) { const col = v.truth.slice(6); if (a.carry?.[col] || a.cur[col] == null) { o[v.id] = null; continue; } }
      o[v.id] = v.read(world, a);
    }
    actors[id] = o;
  }
  const dyads = { at_war: new Set(world.atWarPairs ?? []), allied: new Set(world.allied ?? []) };
  const records = {};
  const recordKinds = {};
  for (const e of [...(world.corridors ?? []), ...(world.territories ?? [])]) if (e.state?.status != null) { records[e.rec.id] = e.state.status; recordKinds[e.rec.id] = e.rec.kind ?? 'territory'; }
  const w = {}; for (const v of varsOf('world')) w[v.id] = inCov(v) ? v.read(world) : null;
  return { year: y, actors, dyads, records, recordKinds, world: w };
}

/** A fired engine event (or a recorded one) as a frame event: template-or-kind, unit. */
// A frame event is the event itself — a recorded one from data/events.json or one the engine fired, which carries the
// same fields (src/engine/core.js:stepYear) — with two keys every reader can rely on: `k` the kind (coup,
// regime_change, mid_war…) and `u` the unit (an actor id, a record id or a sorted pair `A|B`). `t` is the template that
// produced it where a model did; a recorded event has none.
export const frameEvent = (e) => { const { kind, template, ...rest } = e; const o = { k: kind, u: e.actor ?? e.record ?? e.id ?? (e.a && e.b ? pairKey(e.a, e.b) : null), ...rest }; if (template && template !== kind) o.t = template; return o; };

export class FrameBuilder {
  /**
   * from   the calendar year of offset k = 0
   * years  number of offsets
   * runs   1 for the record or a sample world, N for an ensemble
   * vars   registry keys to carry (default: all)
   */
  constructor({ from, years, runs = 1, vars = null, events = true }) {
    this.from = from; this.H = years; this.runs = runs; this.keepEvents = events;
    this.vars = (vars ? VARS.filter(v => vars.includes(varKey(v))) : VARS);
    this.actorLive = new Map();          // id -> Uint32Array(H)
    this.bin = new Map();                // `${var}|${id}` -> Uint32Array(H)
    this.cat = new Map();                // `${var}|${id}` -> Uint32Array(H * L)
    this.word = new Map();               // `${var}|${id}` -> Map(word -> Uint32Array(H))
    this.cont = new Map();               // `${var}|${id}` -> Float32Array(runs * H), NaN = absent
    this.seen = new Map();               // `${var}|${id}` -> Uint32Array(H): runs in which a non-null value was seen
    this.dyad = { at_war: new Map(), allied: new Map() };
    this.events = Array.from({ length: years }, () => []);
    this.recordKinds = {};
  }
  has(entity, id) { return this.vars.some(v => v.entity === entity && v.id === id); }
  /** Add run r's observation at offset k, with the events that fired in that year. */
  add(r, k, snap, fired = []) {
    const H = this.H;
    for (const [id, o] of Object.entries(snap.actors)) {
      (this.actorLive.get(id) ?? this.actorLive.set(id, new Uint32Array(H)).get(id))[k]++;
      for (const v of this.vars) if (v.entity === 'actor') this.#put(v, id, r, k, o[v.id]);
    }
    for (const name of ['at_war', 'allied']) {
      if (!this.has('dyad', name)) continue;
      const m = this.dyad[name];
      for (const pk of snap.dyads[name] ?? []) (m.get(pk) ?? m.set(pk, new Uint32Array(H)).get(pk))[k]++;
    }
    if (this.has('record', 'status')) { const v = this.vars.find(x => x.entity === 'record'); for (const [id, s] of Object.entries(snap.records)) { this.#put(v, id, r, k, s); this.recordKinds[id] ??= snap.recordKinds?.[id] ?? null; } }
    for (const v of this.vars) if (v.entity === 'world') this.#put(v, '_', r, k, snap.world[v.id]);
    if (this.keepEvents && this.runs === 1) for (const e of fired) this.events[k].push(frameEvent(e));
  }
  #put(v, id, r, k, x) {
    if (x == null) return;
    const key = `${v.id}|${id}`, H = this.H;
    (this.seen.get(key) ?? this.seen.set(key, new Uint32Array(H)).get(key))[k]++;
    if (v.kind === 'binary') { if (x) (this.bin.get(key) ?? this.bin.set(key, new Uint32Array(H)).get(key))[k]++; return; }
    if (v.kind === 'categorical' && v.levels) { const L = v.levels.length; (this.cat.get(key) ?? this.cat.set(key, new Uint32Array(H * L)).get(key))[k * L + x]++; return; }
    if (v.kind === 'categorical') { const m = this.word.get(key) ?? this.word.set(key, new Map()).get(key); (m.get(x) ?? m.set(x, new Uint32Array(H)).get(x))[k]++; return; }
    if (v.positive && !(x > 0)) return;
    (this.cont.get(key) ?? this.cont.set(key, new Float32Array(this.runs * H).fill(NaN)).get(key))[r * H + k] = x;
  }
  /** The published frame set. `meta` is merged into the frame's own meta. */
  build(meta = {}) {
    const H = this.H, R = this.runs, one = R === 1;
    const out = { meta: { contract: 1, from: this.from, to: this.from + H - 1, years: H, runs: R, vars: Object.fromEntries(Object.entries(publishVars()).filter(([k]) => this.vars.some(v => varKey(v) === k))), ...meta }, actors: {}, dyads: {}, records: {}, world: {}, events: one && this.keepEvents ? this.events : undefined };
    const dest = (v, id) => (v.entity === 'actor' ? (out.actors[id] ??= {}) : v.entity === 'record' ? (out.records[id] ??= {}) : out.world);
    const seenAt = (key, k) => this.seen.get(key)?.[k] ?? 0;
    for (const [id, live] of this.actorLive) { const o = (out.actors[id] ??= {}); if (!one || live.some(x => !x)) o.live = Array.from(live, x => (one ? (x ? 1 : 0) : r3(x / R))); }
    for (const v of this.vars) {
      if (v.entity === 'dyad') continue;
      // a binary actor variable is published for every actor that was live, so that "absent" can safely mean 0: an
      // actor never observed on it gets an explicit array of nulls rather than disappearing into the default
      const ids = v.entity === 'world' ? ['_'] : v.entity === 'actor' && v.kind === 'binary' ? [...this.actorLive.keys()] : [...new Set([...this.seen.keys()].filter(k => k.startsWith(`${v.id}|`)).map(k => k.slice(v.id.length + 1)))];
      for (const id of ids) {
        const key = `${v.id}|${id}`; let arr;
        if (v.kind === 'binary') {
          const c = this.bin.get(key);
          arr = Array.from({ length: H }, (_, k) => { const n = seenAt(key, k); if (!n) return null; const x = c?.[k] ?? 0; return one ? x : r3(x / n); });
          if (arr.every(x => x === 0)) continue;   // absent = 0 (see the encoding note above); a null is kept: it is "not observed"
        } else if (v.kind === 'categorical' && v.levels) {
          const c = this.cat.get(key); const L = v.levels.length;
          arr = Array.from({ length: H }, (_, k) => { const n = seenAt(key, k); if (!n) return null; const row = Array.from({ length: L }, (_, l) => c[k * L + l]); return one ? row.findIndex(x => x > 0) : row.map(x => r3(x / n)); });
        } else if (v.kind === 'categorical') {
          const m = this.word.get(key);
          arr = Array.from({ length: H }, (_, k) => { const n = seenAt(key, k); if (!n) return null; if (one) { for (const [w, a] of m) if (a[k]) return w; return null; } const d = {}; for (const [w, a] of m) if (a[k]) d[w] = r3(a[k] / n); return d; });
        } else {
          const src = this.cont.get(key); if (!src) continue;
          arr = Array.from({ length: H }, (_, k) => {
            if (one) { const x = src[k]; return Number.isNaN(x) ? null : sig4(x); }
            const col = []; for (let r = 0; r < R; r++) { const x = src[r * H + k]; if (!Number.isNaN(x)) col.push(x); }
            if (!col.length) return null; col.sort((a, b) => a - b);
            return [col[Math.floor(col.length * 0.1)], col[Math.floor(col.length * 0.5)], col[Math.floor(col.length * 0.9)]].map(sig4);
          });
        }
        if (arr.every(x => x == null) && !(v.entity === 'actor' && v.kind === 'binary')) continue;
        dest(v, id)[v.id] = arr;
      }
    }
    for (const [id, kind] of Object.entries(this.recordKinds)) if (out.records[id]) out.records[id].kind = kind;
    for (const [name, m] of Object.entries(this.dyad)) {
      if (!this.has('dyad', name)) continue;
      const o = (out.dyads[name] = {});
      // a pair whose value is the same in every year is stored as that single number (a frozen pact graph is 1 everywhere)
      for (const [pk, c] of m) { const arr = Array.from(c, x => (one ? (x ? 1 : 0) : r3(x / R))); o[pk] = arr.every(x => x === arr[0]) ? arr[0] : arr; }
    }
    return out;
  }
}

/** The years a frame set covers, as calendar years. */
export const frameYears = (f) => Array.from({ length: f.meta.years }, (_, k) => f.meta.from + k);
