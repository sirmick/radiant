// Decoding a frame set (src/contract/frames.js) — the one reader the viewer and the scorer share. Every accessor
// takes a frame set and a calendar year and returns the same shape whether the frame set is the record (runs = 1), a
// sample world (runs = 1) or an ensemble (runs = N): the caller never branches on which provider it is reading.

/** Year offset into a frame set, or -1 outside it. */
export const offset = (f, year) => { const k = Math.round(year) - f.meta.from; return k >= 0 && k < f.meta.years ? k : -1; };
export const isPoint = (f) => f.meta.runs === 1;
export const varMeta = (f, key) => f.meta.vars?.[key] ?? null;

/** P(actor live at year): 1/0 for the record, a share of runs for an ensemble, 0 if the actor is absent. */
export function liveAt(f, id, year) {
  const k = offset(f, year); if (k < 0) return 0;
  const a = f.actors?.[id]; if (!a) return 0;
  if (!a.live) return 1;
  return a.live[k] ?? 0;
}

/** True when the variable's coverage window includes the year (outside it the frame says nothing). */
export function covered(f, key, year) { const c = varMeta(f, key)?.coverage; return !c || (year >= c[0] && year <= c[1]); }

/**
 * The raw encoded value of an actor / record / world variable at a year (see the encoding in src/contract/frames.js),
 * with the "absent binary = 0" rule applied for live actors inside coverage. null = not observed / not carried.
 */
export function rawAt(f, entity, id, v, year) {
  const k = offset(f, year); if (k < 0) return null;
  const key = `${entity}:${v}`; const vm = varMeta(f, key); if (!vm) return null;
  if (entity === 'dyad') { const arr = f.dyads?.[v]?.[id]; return arr ? (arr[k] ?? 0) : (covered(f, key, year) ? 0 : null); }
  const src = entity === 'actor' ? f.actors?.[id] : entity === 'record' ? f.records?.[id] : f.world;
  const arr = src?.[v];
  if (arr) return arr[k] ?? null;
  if (vm.kind === 'binary' && entity === 'actor' && liveAt(f, id, year) > 0 && covered(f, key, year)) return 0;
  return null;
}

/**
 * The value as a distribution, whatever the provider:
 *   binary       { p }                                  P(1)
 *   categorical  { dist: [p_l] } over meta levels, or { dist: {word: p} } for an open vocabulary
 *   continuous   { q: [p10, p50, p90] }                 the record's point is [x, x, x]
 * plus `point: true` when the frame set is a single run. null when the frame says nothing.
 */
export function distAt(f, entity, id, v, year) {
  const x = rawAt(f, entity, id, v, year); if (x == null) return null;
  const vm = varMeta(f, `${entity}:${v}`); const point = isPoint(f);
  if (vm.kind === 'binary') return { p: x, point };
  if (vm.kind === 'categorical') {
    if (vm.levels) { if (point) { const d = vm.levels.map(() => 0); d[x] = 1; return { dist: d, point, level: x }; } return { dist: x, point }; }
    return point ? { dist: { [x]: 1 }, point, level: x } : { dist: x, point };
  }
  return { q: point ? [x, x, x] : x, point };
}

/** The modal level of a categorical distribution (index for ordered levels, word for an open vocabulary). */
export function modal(d) {
  if (Array.isArray(d)) { let b = 0; for (let i = 1; i < d.length; i++) if (d[i] > d[b]) b = i; return b; }
  let bw = null, bp = -1; for (const [w, p] of Object.entries(d)) if (p > bp) { bp = p; bw = w; } return bw;
}

/** The ids an entity has in a frame set. */
export function idsOf(f, entity, v = null) {
  if (entity === 'actor') return Object.keys(f.actors ?? {});
  if (entity === 'record') return Object.keys(f.records ?? {});
  if (entity === 'dyad') return Object.keys(f.dyads?.[v] ?? {});
  return ['_'];
}

/** The events of a year (record and sample worlds; an ensemble carries none). */
export const eventsAt = (f, year) => { const k = offset(f, year); return k < 0 ? [] : (f.events?.[k] ?? []); };
