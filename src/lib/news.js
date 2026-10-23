// News in the record's voice, from frame events (src/contract/frames.js) — one formatter for the record's events
// (data/events.json, through engine replay) and a sample world's (fired by the engine, in the same shape). What was
// scripts/build-news.mjs, moved to the reader so a forecast world and history are told by the same code.
const REG = ['closed autocracy', 'electoral autocracy', 'electoral democracy', 'liberal democracy'];
export const NEWS_ORDER = { war: 0, nuclear: 1, territory: 2, corridor: 3, alliance: 4, coup: 5, regime: 6, conflict: 7, dispute: 8, leader: 9, capability: 10, economic: 11 };
const slug = (s) => String(s ?? '').replace(/_/g, ' ');

/** One frame event as a news item (null for kinds the feed does not show on their own). */
export function newsItem(e, name, y) {
  const nm = (id) => name(id);
  const s = e.source;
  switch (e.k) {
    case 'leader_exit': return { k: 'leader', y: e.year, a: [e.actor], t: `${nm(e.actor)}: leader leaves office${e.irregular ? ' (irregular)' : ''}${e.tenure_years ? ` after ${e.tenure_years}y` : ''}`, s };
    case 'coup': return { k: 'coup', y: e.year, a: [e.actor], t: `${nm(e.actor)}: coup ${e.success ? 'succeeds' : 'attempt fails'}`, s };
    case 'regime_change': return { k: 'regime', y: e.year, a: [e.actor], t: e.from != null && e.to != null ? `${nm(e.actor)}: ${REG[e.from]} → ${REG[e.to]}` : `${nm(e.actor)}: regime ${slug(e.t ?? e.direction)}`, s };
    case 'autocratization_onset': return { k: 'regime', y: e.year, a: [e.actor], t: `${nm(e.actor)}: autocratization episode begins`, s };
    case 'democratization_onset': return { k: 'regime', y: e.year, a: [e.actor], t: `${nm(e.actor)}: democratization episode begins`, s };
    case 'intrastate_onset': return { k: 'conflict', y: e.year, a: [e.actor], t: `${nm(e.actor)}: internal armed conflict${e.territory ? ` over ${e.territory}` : ''}${e.intensity === 2 ? ' (war)' : ''}`, s };
    case 'intrastate_end': return { k: 'conflict', y: e.year, a: [e.actor], t: `${nm(e.actor)}: internal armed conflict ends${e.duration ? ` after ${e.duration}y` : ''}`, s };
    case 'interstate_onset': return { k: 'conflict', y: e.year, a: [e.a, e.b], sides: [[e.a], [e.b]], t: `${nm(e.a)} – ${nm(e.b)}: interstate conflict${e.intensity === 2 ? ' (war)' : ''}`, s };
    case 'war_end': return { k: 'war', y: e.year, a: [e.a, e.b], t: `${nm(e.a)} – ${nm(e.b)}: war ends${e.duration ? ` after ${e.duration}y` : ''}`, s };
    case 'war': return { k: 'war', y: e.start, a: e.sides.flat(), sides: e.sides, end: e.end ?? null, t: `War: ${slug(e.id)} — ${e.sides[0].map(nm).join(', ')} vs ${e.sides[1].map(nm).join(', ')}${e.end ? ` (to ${Math.floor(e.end)})` : ''}`, s, n: e.notes };
    case 'chokepoint': case 'corridor': { const id = e.id ?? e.record; return { k: 'corridor', y: e.year, c: id, t: `${slug(id)}: ${e.status}${e.controller ? ` (${nm(e.controller)})` : ''}`, s, n: e.notes }; }
    case 'record_reopen': return null;   // logged beside the status event it duplicates
    case 'territory': return { k: 'territory', y: e.year, tr: e.id, a: e.controller ? [e.controller] : [], t: `${slug(e.id)}: ${e.status ?? ''}${e.controller ? ` → ${nm(e.controller)}` : ''}`, s, n: e.notes };
    case 'territory_settle': return { k: 'territory', y: e.year, tr: e.record, a: [], t: `${slug(e.record)}: settled`, s };
    case 'nuclear': return { k: 'nuclear', y: e.year, a: [e.actor], t: `${nm(e.actor)}: nuclear status → ${e.status}`, s, n: e.notes };
    case 'capability': return { k: 'capability', y: e.year, a: [e.actor, e.target].filter(Boolean), t: `${nm(e.actor)} ${e.event}${e.target ? ` ${nm(e.target)}` : ''} in ${e.wave}`, s, n: e.notes };
    case 'wave_attain': return { k: 'capability', y: e.year, a: [e.actor], t: `${nm(e.actor)}: sovereign in ${slug(e.wave)}`, s };
    case 'alliance': return { k: 'alliance', y: e.year, a: e.members ?? [], t: `Alliance: ${slug(e.id)}${e.members ? ` — ${e.members.map(nm).join(', ')}` : ''}`, s, n: e.notes };
    case 'economic': return { k: 'economic', y: e.year, a: [], t: slug(e.id), s, n: e.notes };
    case 'regime': return { k: 'regime', y: e.year, a: [e.actor], t: `${nm(e.actor)}: ${slug(e.event)}`, s, n: e.notes };
    case 'leader': return { k: 'leader', y: e.year, a: [e.actor], t: `${nm(e.actor)}: ${slug(e.event)}`, s, n: e.notes };
    default: return null;
  }
}

/**
 * A year's news from its frame events. Dyadic dispute events are merged into one item per dispute (CoW's `dispnum`
 * for the record; one per pair for a simulated world). `ongoing` — the years after a recorded war's start — comes from
 * the caller, which has the whole record (warsOngoing).
 */
export function newsOf(events, name, y, ongoing = []) {
  const out = []; const disputes = new Map();
  for (const e of events) {
    if (e.k === 'mid_force' || e.k === 'mid_war') {
      const key = e.dispnum ?? `${e.u}`; const d = disputes.get(key) ?? disputes.set(key, { year: e.year, a: new Set(), b: new Set(), war: false, via: e.via }).get(key);
      d.a.add(e.a); d.b.add(e.b); if (e.k === 'mid_war') d.war = true; continue;
    }
    const it = newsItem(e, name, y); if (it) out.push(it);
  }
  for (const d of disputes.values()) out.push({ k: d.war ? 'war' : 'dispute', y: d.year, a: [...d.a, ...d.b], sides: [[...d.a], [...d.b]], t: `${d.war ? 'Militarized dispute (war level)' : 'Militarized dispute, use of force'}: ${[...d.a].map(name).join(', ')} vs ${[...d.b].map(name).join(', ')}${d.via === 'coalition' ? ' (coalition)' : ''}` });
  out.push(...ongoing);
  out.sort((p, q) => ((NEWS_ORDER[p.k] ?? 99) - (NEWS_ORDER[q.k] ?? 99)) || ((p.y ?? 0) - (q.y ?? 0)));
  return out;
}

/** Recorded wars still running in each year after the one they started in: year -> [items]. Memoised on the record. */
const ONGOING = new WeakMap();   // memo keyed by the record object (a reactive object cannot take a defined property)
export function warsOngoing(record, name) {
  if (ONGOING.has(record)) return ONGOING.get(record);
  const m = new Map();
  for (const evs of record.events ?? []) for (const e of evs) {
    if (e.k !== 'war' || e.end == null) continue;
    for (let y = Math.floor(e.start) + 1; y <= Math.floor(e.end); y++) (m.get(y) ?? m.set(y, []).get(y)).push({ k: 'war', y, a: e.sides.flat(), sides: e.sides, ongoing: true, t: `War continues: ${slug(e.id)}`, s: e.source });
  }
  ONGOING.set(record, m);
  return m;
}

/** The view's news for its year: the record's, one sample world's (with the ensemble's odds beside each), or null. */
export function viewNews(view) {
  const name = view.name, y = view.year;
  if (view.sample) {
    const items = newsOf(view.events(), name, y);
    const k = view.lead; const inc = (c) => (c ? (c[k] ?? 0) - (k > 0 ? c[k - 1] ?? 0 : 0) : null);
    const TPL = { coup: 'coup_attempt', leader_exit: 'leader_exit', intrastate_onset: 'intrastate_onset', mid_war: 'mid_war', mid_force: 'mid_force', interstate_onset: 'interstate_onset' };
    for (const it of items) {
      const hz = view.hazards; if (!hz) continue;
      if (it.a?.length === 1) { const evs = view.events().filter(e => e.actor === it.a[0]); const t = evs.find(e => e.t)?.t ?? TPL[evs[0]?.k]; it.p = inc(hz.actor?.[it.a[0]]?.[t]); it.tpl = t; }
      else if (it.sides) { const pk = [it.sides[0][0], it.sides[1][0]].sort().join('|'); it.p = inc(hz.dyad?.[pk]?.[it.k === 'war' ? 'mid_war' : 'mid_force']?.curve); }
      it.sample = true;
    }
    // a world's news leads with what changes the world, then by the ensemble's odds
    const SAMPLE_ORDER = { war: 0, coup: 1, conflict: 2, territory: 3, corridor: 4, regime: 5, dispute: 6, leader: 7, capability: 8 };
    items.sort((x, y) => (SAMPLE_ORDER[x.k] ?? 9) - (SAMPLE_ORDER[y.k] ?? 9) || (y.p ?? 0) - (x.p ?? 0));
    return { mode: 'sample', items };
  }
  if (view.isForecast) return { mode: 'forecast', items: forecastNews(view) };
  if (!view.inRec) return { mode: 'history', items: [] };
  return { mode: 'history', items: newsOf(view.events(), name, y, warsOngoing(view.record, name).get(y) ?? []) };
}

/** Forecast-year "news": the ensemble's highest single-year hazards, ranked by surprise over the typical unit. */
export function forecastNews(view, limit = 40) {
  const fc = view.ensemble, hz = view.hazards; if (!fc || !hz || !view.isForecast) return [];
  const k = view.lead; const inc = (c) => (c ? (c[k] ?? 0) - (k > 0 ? c[k - 1] ?? 0 : 0) : 0);
  const LABEL = Object.fromEntries(fc.meta.templates.map(t => [t.id, t.label]));
  const items = []; const byT = {};
  for (const [id, curves] of Object.entries(hz.actor ?? {})) for (const [t, c] of Object.entries(curves)) { const p = inc(c); (byT[t] ??= []).push(p); if (p >= 0.02) items.push({ k: t === 'coup_attempt' || t === 'irregular_exit' ? 'coup' : t === 'intrastate_onset' ? 'conflict' : t === 'leader_exit' ? 'leader' : 'regime', y: view.year, a: [id], p, tpl: t, t: `${view.name(id)}: ${LABEL[t] ?? t}` }); }
  for (const [pair, d] of Object.entries(hz.dyad ?? {})) for (const [t, v] of Object.entries(d)) { const p = inc(v.curve); (byT[t] ??= []).push(p); if (p >= 0.02) items.push({ k: t === 'mid_war' ? 'war' : 'dispute', y: view.year, a: pair.split('|'), p, tpl: t, t: `${pair.split('|').map(view.name).join(' – ')}: ${LABEL[t] ?? t}` }); }
  const med = {}; for (const [t, ps] of Object.entries(byT)) { const s = ps.sort((a, b) => a - b); med[t] = Math.max(0.005, s[Math.floor(s.length / 2)] ?? 0.005); }
  for (const it of items) it.surprise = it.p / med[it.tpl];
  items.sort((x, y) => y.surprise - x.surprise);
  return items.slice(0, limit);
}

/** For a past-origin forecast: the first year in (asOf, asOf + years] the record shows the template's event for `id`. */
const REGIME_TEST = { democratize_step: (e) => e.to > e.from, democratic_deepening: (e) => e.from === 2 && e.to === 3, liberal_erosion: (e) => e.from === 3 && e.to === 2, autocratic_closure: (e) => e.to < e.from && (e.to === 0 || (e.from === 2 && e.to === 1)), autocratize_step: (e) => e.to < e.from };
export function actualWithin(record, template, id, asOf, years) {
  const t = template; const T = { coup_attempt: (e) => e.k === 'coup', irregular_exit: (e) => e.k === 'leader_exit' && e.irregular, leader_exit: (e) => e.k === 'leader_exit', intrastate_onset: (e) => e.k === 'intrastate_onset' };
  const test = T[t] ?? (REGIME_TEST[t] ? (e) => e.k === 'regime_change' && REGIME_TEST[t](e) : null); if (!test) return null;
  for (let y = asOf + 1; y <= asOf + years; y++) { const k = y - record.meta.from; if (k < 0 || k >= record.meta.years) continue; for (const e of record.events[k] ?? []) if (e.actor === id && test(e)) return y; }
  return false;
}
