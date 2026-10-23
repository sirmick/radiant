// The viewer's one data source (docs/plan-structure.md B). Everything the map and the panel paint comes through a
// View: the frame set that answers for the slider year — the record, a forecast ensemble, or one sample world of it —
// read through src/contract/read.js. No component knows which provider it is reading; a forecast year and a history
// year differ only in what the value object says about itself (a distribution, a sample, a carried observation).
import { rawAt, distAt, liveAt, offset, dyadsAt, eventsAt, varMeta } from '../contract/read.js';
import { regimePosition } from './data.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const getJSON = (f) => fetch(`${BASE}${f}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
const cache = new Map();
const cached = (f) => { if (!f) return Promise.resolve(null); if (!cache.has(f)) cache.set(f, getJSON(f)); return cache.get(f); };

/** The index, the record, and the default (latest-origin) ensemble. */
export async function loadFrames() {
  const index = await getJSON('frames/index.json'); if (!index) throw new Error('frames/index.json missing — run scripts/export-frames.mjs and scripts/run-forward.mjs');
  const latest = [...index.ensembles].sort((a, b) => b.asOf - a.asOf)[0] ?? null;
  const [record, ensemble] = await Promise.all([cached(index.record.file), latest ? cached(latest.file) : null]);
  return { index, record, ensemble, latest };
}
export const loadEnsemble = (entry) => cached(entry?.file);
export const loadPaths = (fc) => cached(fc?.meta?.paths?.file);

const fade = (stale) => (stale <= 0 ? 1 : Math.max(0.3, 1 - 0.12 * stale));
const entropy = (d) => -d.reduce((t, p) => t + (p > 0 ? p * Math.log2(p) : 0), 0);
const argmax = (d) => { let b = 0; for (let i = 1; i < d.length; i++) if (d[i] > d[b]) b = i; return b; };
/** The modal category with hysteresis over a categorical array up to offset k: keep the state until another clears
 *  `enter`, leave only once its own share drops under `leave` — a state near 50/50 does not flicker year to year. */
export function modalHysteresis(arr, k, enter = 0.55, leave = 0.45) {
  let cur = null;
  for (let i = 0; i <= k; i++) { const d = arr[i]; if (!d) continue; const m = argmax(d); if (cur == null) { cur = m; continue; } if (m !== cur && d[m] >= enter) cur = m; else if (d[cur] < leave && d[m] > d[cur]) cur = m; }
  return cur;
}

/**
 * A view of the world at one year. `record` is the record frame set, `ensemble` the selected forecast (or null),
 * `paths` its sample worlds (or null), `mode` consensus | sample | odds, `run` the sample world shown.
 */
export function makeView({ record, ensemble = null, paths = null, mode = 'consensus', run = 0, year }) {
  const y = Math.round(year);
  const inFc = !!ensemble && y >= ensemble.meta.from && y <= ensemble.meta.to;
  const model = inFc ? ensemble : null;
  const sample = model && mode === 'sample' && paths?.runs?.length && paths.meta.from === ensemble.meta.from ? paths.runs[run % paths.runs.length] : null;
  const recY = Math.min(y, record.meta.to);
  const inRec = !model && y >= record.meta.from && y <= record.meta.to;
  const ent = record.meta.entities ?? {};
  const lead = model ? y - model.meta.from : 0;   // 0 = the first forecast year
  const asOf = ensemble?.meta.asOf ?? null;

  // the last record observation at or before `upto` — the record carries nothing forward itself (strict observation)
  const carry = (v, id, upto = recY) => { for (let yy = Math.min(upto, record.meta.to); yy >= record.meta.from; yy--) { const x = rawAt(record, 'actor', id, v, yy); if (x != null) return [x, yy]; } return [null, null]; };
  const liveIds = (() => { const src = sample ?? model ?? (inRec ? record : null); if (!src) return []; return Object.keys(src.actors ?? {}).filter(id => liveAt(src, id, y) > 0); })();
  const liveSet = new Set(liveIds);
  const neKey = (id) => { const m = ent[id]?.map_to; return m && !liveSet.has(m) ? m : id; };
  const name = (id) => ent[id]?.name ?? id;

  /** One actor variable as a paintable cell — the same object shape for every provider and every mode. */
  function cell(v, id) {
    const key = `actor:${v}`; const vm = varMeta(record, key) ?? varMeta(ensemble ?? {}, key); if (!vm) return null;
    const base = { year: y, actor: id, name: name(id) };
    if (!model) {
      if (!inRec) return null;
      const x = rawAt(record, 'actor', id, v, y);
      if (x != null) return { ...base, value: x, history: true, observed: y, stale: 0, conf: 1 };
      const [c, cy] = carry(v, id); if (c == null) return { ...base, value: null, history: true };
      return { ...base, value: c, history: true, observed: cy, stale: y - cy, conf: fade(y - cy) };
    }
    const d = distAt(model, 'actor', id, v, y);
    if (sample && vm.kind !== 'continuous' && varMeta(sample, key)) {
      const x = rawAt(sample, 'actor', id, v, y);
      if (x != null) {
        if (vm.kind === 'binary') { const p = d?.p ?? 0; return { ...base, value: x, forecast: true, state: true, sample: true, p, conf: 1, agree: x ? p : 1 - p, dist: [1 - p, p] }; }
        return { ...base, value: x, forecast: true, sample: true, state: v !== 'regime', conf: 1, agree: d?.dist?.[x] ?? null, dist: d?.dist ?? null };
      }
    }
    if (!d) {   // the ensemble does not carry it: the record's last observation, carried and washed by its age
      const [c, cy] = carry(v, id); if (c == null) return null;
      return { ...base, value: c, carried: true, observed: cy, stale: y - cy, conf: fade(y - cy) };
    }
    if (vm.kind === 'binary') {
      const p = d.p; if (mode === 'odds') return { ...base, value: p, forecast: true, state: true, odds: true, conf: 1, dist: [1 - p, p] };
      return { ...base, value: p >= 0.5 ? 1 : 0, forecast: true, state: true, p, conf: Math.max(p, 1 - p), dist: [1 - p, p] };
    }
    if (vm.kind === 'categorical') {
      const dist = d.dist;
      if (mode === 'odds') {
        if (v === 'regime') { const [r0] = carry('regime', id, asOf); return { ...base, value: r0 == null ? null : 1 - (dist[r0] ?? 0), forecast: true, odds: true, conf: 1, dist }; }
        return { ...base, value: 1 - dist[0], forecast: true, state: true, odds: true, conf: 1, dist };
      }
      const arr = model.actors[id]?.[v] ?? []; const m = modalHysteresis(arr, offset(model, y));
      return { ...base, value: m, forecast: true, state: v !== 'regime', p: dist[m], conf: dist[m], dist };
    }
    const q = d.q; const frozen = vm.forecast === 'frozen';
    return { ...base, value: q[1], lo: q[0], hi: q[2], forecast: true, state: true, simulated: !frozen, note: vm.note ?? null, conf: frozen ? fade(lead + 1) : Math.max(0.5, 1 - 0.015 * lead) };
  }
  /** Regime on the continuous axis: V-Dem polyarchy placed on the category scale; past the seam the ensemble mean. */
  function gradient(id) {
    const base = { year: y, actor: id, name: name(id) };
    if (model) { const d = distAt(model, 'actor', id, 'regime', y); if (!d) return null; const mean = d.dist.reduce((t, p, l) => t + p * l, 0); return { ...base, value: mean, forecast: true, conf: Math.max(0.15, 1 - entropy(d.dist) / 2), dist: d.dist, mean: true }; }
    if (!inRec) return null;
    const [pv, py] = carry('polyarchy', id);
    if (pv != null && y - py <= 2) return { ...base, value: regimePosition(pv), history: true, observed: py, stale: y - py, conf: fade(y - py), poly: pv };
    const [rg, ry] = carry('regime', id); if (rg == null) return null;
    return { ...base, value: rg, history: true, observed: ry, stale: y - ry, conf: 0.85 * fade(y - ry), category: true };
  }
  /** Values keyed by map polygon for a whole variable: historical entities draw on their successor's polygon. */
  function cells(v, { gradient: grad = false } = {}) {
    const out = {};
    for (const id of liveIds) { const key = neKey(id); if (key !== id && liveSet.has(key)) continue; const c = grad ? gradient(id) : cell(v, id); if (c) out[key] = c; }
    return out;
  }
  // Industrial base as a share of the world: the series that best covers the year's states, carried up to 3 years
  const INDUSTRY_SERIES = [['manuf_va', 'manufacturing value added (WDI)', 100], ['electricity_generation', 'electricity generation (OWID)', 40], ['irst', 'iron and steel (CoW NMC)', 1]];
  function industry() {
    const out = {}; const ids = Object.keys(record.actors).filter(id => liveAt(record, id, recY) > 0); const recSet = new Set(ids);
    for (const [v, label, minN] of INDUSTRY_SERIES) {
      const rows = []; for (const id of ids) { const [x, xy] = carry(v, id); if (x != null && x > 0 && recY - xy <= 3) rows.push([id, x, xy]); }
      if (rows.length < minN) continue;
      const total = rows.reduce((t, r) => t + r[1], 0);
      for (const [id, x, xy] of rows) { const m = ent[id]?.map_to; const key = m && !recSet.has(m) ? m : id; if (key !== id && recSet.has(key)) continue; const stale = y - xy; out[key] = { value: x / total, year: y, actor: id, name: name(id), history: y <= record.meta.to, carried: y > record.meta.to, observed: xy, stale, conf: fade(stale), series: label, raw: x }; }
      break;
    }
    return out;
  }
  /** P(at war) — 0/1 in the record and a sample world, a probability in an ensemble. */
  const atWarP = (id) => { if (!model) return inRec ? (rawAt(record, 'actor', id, 'at_war', y) ? 1 : 0) : 0; if (sample) { const x = rawAt(sample, 'actor', id, 'at_war', y); if (x != null) return x; } return distAt(model, 'actor', id, 'at_war', y)?.p ?? 0; };
  /** The belligerents field's weight for internal conflict: 0.6 at level 1, 1.0 at level 2, in expectation for an ensemble. */
  const intrastateW = (id) => {
    const lvl = (f) => rawAt(f, 'actor', id, 'intrastate', y);
    if (!model) { const l = inRec ? lvl(record) ?? 0 : 0; return l >= 2 ? 1 : l > 0 ? 0.6 : 0; }
    if (sample) { const l = lvl(sample); if (l != null) return l >= 2 ? 1 : l > 0 ? 0.6 : 0; }
    const d = distAt(model, 'actor', id, 'intrastate', y)?.dist; return d ? 0.6 * (d[1] ?? 0) + (d[2] ?? 0) : 0;
  };
  const intrastateLevel = (id) => { if (model) { const f = sample ?? model; const d = distAt(f, 'actor', id, 'intrastate', y); return d ? (d.level ?? argmax(d.dist)) : 0; } return inRec ? rawAt(record, 'actor', id, 'intrastate', y) ?? 0 : 0; };
  /** The regime level a label shows: the record's (carried), one sample world's, or the ensemble's most likely. */
  const regime = (id) => { if (!model) { const [r] = carry('regime', id); return r; } if (sample) { const x = rawAt(sample, 'actor', id, 'regime', y); if (x != null) return x; } const d = distAt(model, 'actor', id, 'regime', y); return d ? argmax(d.dist) : carry('regime', id)[0]; };
  const number = (v, id) => { const c = cell(v, id); return c?.value ?? 0; };
  const great = (id) => { const f = sample ?? model ?? record; const x = rawAt(f, 'actor', id, 'great_power', model ? y : recY); return x == null ? (model ? (carry('great_power', id)[0] ?? 0) > 0 : false) : x >= 0.5; };
  /** Pairs at war in the year with P (1 in the record and a sample world). */
  const dyadWar = (min = 0) => (model ? dyadsAt(sample ?? model, 'at_war', y, min) : inRec ? dyadsAt(record, 'at_war', y, min) : []);
  /** Defence-pact pairs in force (the pact graph is frozen at the origin inside a forecast). */
  const allied = () => (model ? dyadsAt(model, 'allied', y, 0.5) : dyadsAt(record, 'allied', recY, 0.5)).map(([pk]) => pk.split('|'));
  /** A record's status at the year: the record's word, or the ensemble's distribution / one world's word. */
  function recordStatus(id) {
    if (model) {
      const d = distAt(model, 'record', id, 'status', y);
      if (sample) { const w = rawAt(sample, 'record', id, 'status', y); if (w != null) return { exists: true, status: w, p: d?.dist?.[w] ?? null, dist: d?.dist ?? null, forecast: true, sample: true }; }
      if (d) { const entries = Object.entries(d.dist).sort((a, b) => b[1] - a[1]); return { exists: true, status: entries[0][0], p: entries[0][1], dist: d.dist, entries, forecast: true }; }
    }
    const w = rawAt(record, 'record', id, 'status', recY);
    return w == null ? { exists: false } : { exists: true, status: w };
  }
  /** Events of the year: the record's, or one sample world's. An ensemble in consensus has odds, not events. */
  const events = () => (sample ? eventsAt(sample, y) : !model && inRec ? eventsAt(record, y) : []);
  // ---- the hazards an ensemble carries: P(first occurrence within k years of the origin)
  const hz = ensemble?.hazards ?? null;
  /** P(first occurrence within the next `horizon` years from the slider year | not yet), or the cumulative if 0. */
  function hazard(id, tpl, horizon = 0) {
    const c = hz?.actor?.[id]?.[tpl]; if (!c || !model) return null;
    const i = Math.min(lead, c.length - 1);
    if (!horizon) return c[i];
    const before = i > 0 ? c[i - 1] : 0; const end = c[Math.min(c.length - 1, i - 1 + horizon)];
    return before >= 1 ? 0 : (end - before) / (1 - before);
  }
  return {
    year: y, record, ensemble, model, sample, inRec, isForecast: !!model, lead, asOf, mode, run,
    liveIds, live: (id) => liveSet.has(id), neKey, name, entity: (id) => ent[id] ?? null,
    cell, cells, gradient, industry, carry, atWarP, intrastateW, intrastateLevel, regime, number, great, dyadWar, allied, recordStatus, events, hazard, hazards: hz,
    regime0: (id) => (asOf == null ? null : carry('regime', id, asOf)[0]),
    pop: (id) => number('population', id), cap: (id) => number('cinc', id),
    varMeta: (key) => varMeta(record, key) ?? varMeta(ensemble ?? {}, key),
  };
}
