// Loading, value-at-year, and colour scales. Everything reads the registry; nothing hardcodes a variable id.
import * as d3 from 'd3';

export async function loadWorld() {
  const opt = (f) => fetch(`${import.meta.env.BASE_URL}${f}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const [world, geo, forecast, history, news, alliances, scores, forecasts, presence] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}world.json`).then(r => r.json()),
    fetch(`${import.meta.env.BASE_URL}geo.topo.json`).then(r => r.json()),
    opt('forecast.json'), opt('history.json'), opt('news.json'), opt('alliances.json'), opt('scores.json'), opt('forecasts.json'), opt('presence.json'),
  ]);
  return { world, geo, forecast, history, news, alliances, scores, forecastIndex: forecasts, presence };
}

/** Forecast-year "news": the ensemble's highest single-year hazards for that year (difference of cumulative curves). */
export function forecastNews(fc, year, limit = 40) {
  if (!fc) return [];
  const k = Math.round(year) - fc.meta.from; if (k < 0 || k >= fc.meta.horizon) return [];
  const inc = (curve) => (curve ? (curve[k] ?? 0) - (k > 0 ? curve[k - 1] ?? 0 : 0) : 0);   // P(first occurrence in this year)
  const LABEL = Object.fromEntries(fc.meta.templates.map(t => [t.id, t.label]));
  // rank by surprise: this year's first-occurrence probability relative to the template's median across actors, so rare-but-elevated hazards outrank routine ones
  const items = []; const byT = {};
  for (const [id, a] of Object.entries(fc.actors)) for (const [t, curve] of Object.entries(a.p ?? {})) { const p = inc(curve); (byT[t] ??= []).push(p); if (p >= 0.02) items.push({ k: t === 'coup_attempt' || t === 'irregular_exit' ? 'coup' : t === 'intrastate_onset' ? 'conflict' : t === 'leader_exit' ? 'leader' : 'regime', y: year, a: [id], p, tpl: t, t: `${id}: ${LABEL[t] ?? t}` }); }
  for (const [pair, d] of Object.entries(fc.dyads)) for (const [t, v] of Object.entries(d)) { const p = inc(v.curve); (byT[t] ??= []).push(p); if (p >= 0.02) items.push({ k: t === 'mid_war' ? 'war' : 'dispute', y: year, a: pair.split('|'), p, tpl: t, t: `${pair.replace('|', ' – ')}: ${LABEL[t] ?? t}` }); }
  const med = {}; for (const [t, ps] of Object.entries(byT)) { const s = ps.sort((a, b) => a - b); med[t] = Math.max(0.005, s[Math.floor(s.length / 2)] ?? 0.005); }
  for (const it of items) it.surprise = it.p / med[it.tpl];
  items.sort((x, y) => y.surprise - x.surprise);
  return items.slice(0, limit);
}

/** Load one ensemble file from the index (cached). */
const ensCache = new Map();
export async function loadEnsemble(file) {
  if (!ensCache.has(file)) ensCache.set(file, fetch(`${import.meta.env.BASE_URL}${file}`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return ensCache.get(file);
}
/** For a past-as-of ensemble: did the template's event actually happen to `id` within k years of as-of? Reads the news feed. */
const TEMPLATE_NEWS = { coup_attempt: (e) => e.k === 'coup', irregular_exit: (e) => e.k === 'leader' && /irregular/.test(e.t), leader_exit: (e) => e.k === 'leader', intrastate_onset: (e) => e.k === 'conflict' && /internal/.test(e.t), democratize_step: (e) => e.k === 'regime' && /→ (electoral autocracy|electoral democracy|liberal democracy)/.test(e.t) && !/liberal democracy →|electoral democracy → electoral autocracy|electoral autocracy → closed/.test(e.t), democratic_deepening: (e) => e.k === 'regime' && /electoral democracy → liberal democracy/.test(e.t), liberal_erosion: (e) => e.k === 'regime' && /liberal democracy → electoral democracy/.test(e.t), autocratic_closure: (e) => e.k === 'regime' && /(electoral democracy → electoral autocracy|→ closed autocracy)/.test(e.t) };
export function actualWithin(news, id, template, asOf, years) {
  const test = TEMPLATE_NEWS[template]; if (!test || !news) return null;
  for (let y = asOf + 1; y <= asOf + years; y++) for (const e of news.years?.[y] ?? []) if (!e.ongoing && e.a?.includes(id) && test(e)) return y;
  return false;
}

/** Pseudo-variables exposed by the forecast ensemble: cumulative event probabilities and regime expectation. */
export function forecastVariables(fc) {
  if (!fc) return [];
  const vars = fc.meta.templates.filter(t => t.unit === 'actor-year').map(t => ({ id: `fc_${t.id}`, group: 'forecast', label: `P(${t.label})`, unit: 'within the horizon', kind: 'forecast', scope: 'actor', template: t.id, display: { map: true, format: '.0%' } }));
  vars.unshift({ id: 'fc_regime_mean', group: 'forecast', label: 'Regime level, ensemble mean (0 closed … 3 liberal)', unit: 'mean over runs; see Regime for the modal state', kind: 'forecast', scope: 'actor', display: { map: true, format: '.2f' } });
  vars.push({ id: 'fc_regime_uncertainty', group: 'forecast', label: 'Regime uncertainty (entropy)', unit: 'bits', kind: 'forecast', scope: 'actor', display: { map: true, format: '.2f' } });
  return vars;
}
export const REGIME_LABELS = ['closed autocracy', 'electoral autocracy', 'electoral democracy', 'liberal democracy'];
export const REGIME_GLYPH = ['◆', '▲', '●', '★'];
export const REGIME_COL4 = ['#d95c4f', '#e8a04f', '#7fc4f0', '#4f9be8'];
export const POWER_COLORS = { USA: '#4f9be8', GBR: '#1f4fa3', FRA: '#7fc4f0', RUS: '#ef6a5a', CHN: '#ffd166', JPN: '#f28cb1', DEU: '#9aa4b2', ITA: '#4fc27a', TUR: '#2ec4b6', IND: '#f4a261' };
/** Presence records active at a year (from <= y < to). */
export function presenceAt(pr, year) { if (!pr) return []; const y = Math.round(year); return pr.records.filter(r => r.from <= y && (r.to == null || y < r.to)); }
/** ISO2 -> emoji flag (regional indicator pairs); null for entities without a modern code. */
export const flagEmoji = (iso2) => (iso2 && /^[A-Z]{2}$/.test(iso2) ? String.fromCodePoint(...[...iso2].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : null);
/** Defence-pact edges at a year. Past the source's coverage the last graph is carried forward and flagged. */
export function alliancesAt(al, year, hubOf) {
  if (!al) return { edges: [], pacts: 0, carried: false, none: true };
  const y = Math.round(year); const [c0, c1] = al.meta.coverage;
  if (y < c0) return { edges: [], pacts: 0, carried: false, none: true };
  const yy = Math.min(y, c1); const pacts = al.years[yy] ?? {}; const edges = []; const seen = new Set();
  for (const [pid, members] of Object.entries(pacts)) {
    if (members.length <= 3) { for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) { const k = members[i] < members[j] ? `${members[i]}|${members[j]}` : `${members[j]}|${members[i]}`; if (!seen.has(k)) { seen.add(k); edges.push({ a: members[i], b: members[j], pact: pid, multilateral: false }); } } }
    else { const hub = hubOf ? hubOf(members) : members[0]; for (const m of members) if (m !== hub) { const k = m < hub ? `${m}|${hub}` : `${hub}|${m}`; if (!seen.has(k)) { seen.add(k); edges.push({ a: hub, b: m, pact: pid, multilateral: true, size: members.length }); } } }
  }
  return { edges, pacts: Object.keys(pacts).length, carried: y > c1, from: yy };
}
/** URL hash <-> view state: #y=1956&v=h_regime&a=EGY&l=territories,corridors */
export function readHash() {
  try { const h = new URLSearchParams(location.hash.slice(1)); const o = {}; if (h.get('y')) o.year = +h.get('y'); if (h.get('v')) o.varId = h.get('v'); if (h.get('a')) o.actor = h.get('a'); if (h.get('l') != null) o.layers = Object.fromEntries(h.get('l').split(',').filter(Boolean).map(x => { const [k, v] = x.split(':'); return [k, v ?? true]; })); if (h.get('t')) o.tab = h.get('t'); if (h.get('f')) o.asOf = +h.get('f'); if (h.get('h')) o.horizon = +h.get('h'); if (h.get('view')) o.view = h.get('view'); if (h.get('m')) o.mode = h.get('m'); if (h.get('to')) o.fcTo = +h.get('to'); return o; } catch { return {}; }
}
export function writeHash({ year, varId, selected, layers, tab, asOf, horizon, view, mode, fcTo }) {
  try { const h = new URLSearchParams(); h.set('y', String(Math.round(year))); h.set('v', varId); if (asOf != null) h.set('f', String(asOf)); if (horizon) h.set('h', String(horizon)); if (view) h.set('view', view); if (mode && mode !== '2d') h.set('m', mode); if (fcTo && fcTo !== 40) h.set('to', String(fcTo)); if (selected?.kind === 'actor') h.set('a', selected.id); h.set('l', Object.entries(layers).filter(([, v]) => v).map(([k, v]) => (v === true ? k : `${k}:${v}`)).join(',')); if (tab) h.set('t', tab); history.replaceState(null, '', '#' + h.toString()); } catch { }
}
/** Regime level for an actor at a year: history panel, else the forecast's modal regime. */
export function regimeAt(history, forecast, id, year) {
  const y = Math.round(year);
  if (history && y <= history.meta.y1) { const a = history.actors[id]; const i = y - history.meta.y0; const r = a?.regime?.[i]; return r == null ? null : r; }
  const a = forecast?.actors?.[id]; if (!a) return null;
  const i = Math.min(forecast.meta.horizon - 1, Math.max(0, y - forecast.meta.from)); const d = a.regime?.[i]; if (!d) return a.regime0 ?? null;
  return d.indexOf(Math.max(...d));
}

/** Pseudo-variables from the historical panel slice (public/history.json). */
// Regime as a gradient: V-Dem's polyarchy placed on the four-category axis by the panel's own category medians (estimate:
// polyarchy 0.085 / 0.281 / 0.649 / 0.843 at RoW 0 / 1 / 2 / 3, n = 9,018 / 4,751 / 2,707 / 2,508 actor-years), so 'position'
// 0..3 reads as the category axis; after the seam the ensemble mean of the level is the same quantity.
const GRADIENT_STOPS = [0.085, 0.281, 0.649, 0.843];
export const regimePosition = (poly) => { if (poly == null) return null; const S = GRADIENT_STOPS; if (poly <= S[0]) return 0; if (poly >= S[3]) return 3; for (let k = 0; k < 3; k++) if (poly <= S[k + 1]) return k + (poly - S[k]) / (S[k + 1] - S[k]); return 3; };
export const GRADIENT_VAR = { id: 'h_regime_gradient', group: 'history', label: 'Regime (gradient)', unit: 'V-Dem polyarchy on the 0 closed … 3 liberal axis; ensemble mean after the seam', kind: 'history', scope: 'actor', var: 'polyarchy', gradient: true, display: { map: true, format: '.2f' } };
// Industrial base as a share of the world: the series that best covers the year's states — manufacturing value added
// (WDI, from the late 1990s once the largest producers report), else electricity generation (from the 1960s), else iron
// and steel (CoW NMC, 1816-). A state's value is carried up to 3 years so a late reporter does not vanish from the total.
export const INDUSTRY_VAR = { id: 'h_industry', group: 'history', label: 'Industrial base', unit: 'share of world · steel → electricity → manufacturing value added', kind: 'history', scope: 'actor', var: 'irst', industry: true, display: { map: true, format: '.1%', log: true } };
const INDUSTRY_SERIES = [['manuf_va', 'manufacturing value added (WDI)', 100], ['electricity_generation', 'electricity generation (OWID)', 40], ['irst', 'iron and steel (CoW NMC)', 1]];
export function industryAt(h, year) {
  const out = {}; if (!h) return out;
  const y = Math.round(year); const i = Math.min(y, h.meta.y1) - h.meta.y0; if (i < 0) return out;
  const live = Object.entries(h.actors).filter(([, a]) => a.live[i]); const liveIds = new Set(live.map(([id]) => id));
  const lastAt = (arr, upto) => { for (let j = Math.min(upto, arr.length - 1); j >= Math.max(0, upto - 3); j--) if (arr[j] != null) return [arr[j], j]; return [null, -1]; };
  for (const [v, label, minN] of INDUSTRY_SERIES) {
    const rows = []; for (const [id, a] of live) { if (!a[v]) continue; const [val, j] = lastAt(a[v], i); if (val != null && val > 0) rows.push([id, a, val, j]); }
    if (rows.length < minN) continue;
    const total = rows.reduce((t, r) => t + r[2], 0);
    for (const [id, a, val, j] of rows) { const key = liveIds.has(a.map_to) ? null : (a.map_to ?? id); if (!key) continue; const stale = y - (h.meta.y0 + j); out[key] = { value: val / total, year, actor: id, name: a.name, history: y <= h.meta.y1, carried: y > h.meta.y1, observed: h.meta.y0 + j, stale, conf: stale <= 0 ? 1 : Math.max(0.3, 1 - 0.12 * stale), series: label, raw: val }; }
    break;
  }
  return out;
}
export function historyVariables(h) {
  if (!h) return [];
  return [GRADIENT_VAR, INDUSTRY_VAR, ...Object.entries(h.vars).map(([id, spec]) => ({ id: `h_${id}`, group: 'history', label: spec.label, unit: spec.unit, kind: 'history', scope: 'actor', var: id, display: { map: true, format: spec.format, log: spec.log, categorical: spec.categorical, categoricalLabels: id === 'regime' ? REGIME_LABELS : id === 'intrastate' ? ['none', 'minor', 'war'] : spec.categorical ? ['no', 'yes'] : undefined } }))];
}
/** Values per Natural-Earth id for a history variable at a year: live actors, historical entities mapped to their successor polygon when the successor is not itself live. */
export function historyAt(h, variable, year) {
  const out = {}; if (!h) return out;
  const i = Math.round(year) - h.meta.y0; if (i < 0 || i > h.meta.y1 - h.meta.y0) return out;
  const liveIds = new Set(Object.entries(h.actors).filter(([, a]) => a.live[i]).map(([id]) => id));
  for (const [id, a] of Object.entries(h.actors)) {
    if (!a.live[i]) continue;
    const key = liveIds.has(a.map_to) ? null : (a.map_to ?? id);   // e.g. PRUSSIA→DEU polygon before 1871; skip if DEU is live too
    if (!key) continue;
    const v = a[variable.var]?.[i];
    out[key] = { value: v ?? null, year, actor: id, name: a.name, history: true };
  }
  return out;
}
/**
 * One series across the seam. Before the panel ends: the observed value, carried forward where a source stopped early,
 * with `conf` fading by staleness. After it, with a forecast: the ensemble's modal category (regime) or median (continuous)
 * for that year, `conf` = the modal share for a category, a slow fade with lead for a median; series the ensemble does not
 * carry stay at their last observation and fade. Nothing switches palette at the forecast start — the colour only washes.
 */
export function seriesAt(h, fc, variable, year) {
  if (variable.industry) return industryAt(h, year);
  const out = {}; if (!h) return out;
  const y = Math.round(year); const i = y - h.meta.y0; if (i < 0) return out;
  const v = variable.var; const fade = (stale) => (stale <= 0 ? 1 : Math.max(0.3, 1 - 0.12 * stale));
  const lastAt = (arr, upto) => { for (let j = Math.min(upto, arr.length - 1); j >= 0; j--) if (arr[j] != null) return [arr[j], j]; return [null, -1]; };
  if (i <= h.meta.y1 - h.meta.y0) {
    const liveIds = new Set(Object.entries(h.actors).filter(([, a]) => a.live[i]).map(([id]) => id));
    for (const [id, a] of Object.entries(h.actors)) {
      if (!a.live[i]) continue;
      const key = liveIds.has(a.map_to) ? null : (a.map_to ?? id); if (!key || !a[v]) continue;
      const [val, j] = lastAt(a[v], i);
      if (variable.gradient) { if (val != null && i - j <= 2) { out[key] = { value: regimePosition(val), year, actor: id, name: a.name, history: true, observed: h.meta.y0 + j, stale: i - j, conf: fade(i - j), poly: val }; continue; } const [rg, jr] = a.regime ? lastAt(a.regime, i) : [null, -1]; if (rg != null) out[key] = { value: rg, year, actor: id, name: a.name, history: true, observed: h.meta.y0 + jr, stale: i - jr, conf: 0.85 * fade(i - jr), category: true }; continue; }
      if (val == null) { out[key] = { value: null, year, actor: id, name: a.name, history: true }; continue; }
      out[key] = { value: val, year, actor: id, name: a.name, history: true, observed: h.meta.y0 + j, stale: i - j, conf: fade(i - j) };
    }
    return out;
  }
  if (!fc) return out;
  const k = Math.min(fc.meta.horizon - 1, Math.max(0, y - fc.meta.from));
  // the union of the two blocks: `actors` holds the as-of world, `state` also holds every actor the run introduced
  // inside the horizon (a past-as-of ensemble from 1955 carries 193 of them against 86 at as-of), and dropping those
  // would leave a hole in the map exactly where decolonisation is.
  for (const id of new Set([...Object.keys(fc.actors), ...Object.keys(fc.state?.actors ?? {})])) {
    const a = fc.actors[id] ?? {};
    const ha = h.actors[id]; const name = ha?.name ?? id;
    if (variable.gradient && a.regime?.[k]) { const d = a.regime[k]; const mean = d.reduce((t, p, l) => t + p * l, 0); const H = -d.reduce((t, p) => t + (p > 0 ? p * Math.log2(p) : 0), 0); out[id] = { value: mean, year, actor: id, name, forecast: true, conf: Math.max(0.15, 1 - H / 2), dist: d, mean: true }; continue; }
    if (v === 'regime' && a.regime?.[k]) { const d = a.regime[k]; const m = d.indexOf(Math.max(...d)); out[id] = { value: m, year, actor: id, name, forecast: true, conf: d[m], dist: d }; continue; }
    // operator/occupancy: the state block carries the conflict and capability series across the seam, so Conflict and
    // Routes stop freezing at the last observation while Politics moves. The painted value is the MODAL state and the
    // wash is 1 − P(that state), which is what makes a 50/50 year read as grey rather than as a confident war.
    const st = fc.state?.actors?.[id];
    if (st && v === 'at_war') { const p = st.at_war?.[k] ?? 0; const m = p >= 0.5 ? 1 : 0; out[id] = { value: m, year, actor: id, name, forecast: true, state: true, p, conf: Math.max(p, 1 - p), dist: [1 - p, p] }; continue; }
    if (st && v === 'intrastate') { const p1 = st.intrastate?.[k] ?? 0, p2 = st.intrastate_war?.[k] ?? 0; const d = [Math.max(0, 1 - p1), Math.max(0, p1 - p2), p2]; const m = d.indexOf(Math.max(...d)); out[id] = { value: m, year, actor: id, name, forecast: true, state: true, p: d[m], conf: d[m], dist: d }; continue; }
    if (st && (v === 'cinc' || v === 'pol_share') && st[v]?.[k]) { const t = st[v][k]; const meta = stateVarMeta(fc, v); out[id] = { value: t[1], year, actor: id, name, forecast: true, state: true, lo: t[0], hi: t[2], simulated: meta?.simulated !== false, note: meta?.note ?? null, conf: meta?.simulated === false ? fade(y - fc.meta.from) : Math.max(0.5, 1 - 0.015 * (y - fc.meta.from)) }; continue; }
    const tri = a[v]?.[k];
    if (Array.isArray(tri)) { out[id] = { value: tri[1], year, actor: id, name, forecast: true, lo: tri[0], hi: tri[2], conf: Math.max(0.5, 1 - 0.015 * (y - fc.meta.from)) }; continue; }
    if (!ha?.[v]) continue;
    const [val, j] = lastAt(ha[v], ha[v].length - 1); if (val == null) continue;
    out[id] = { value: val, year, actor: id, name, carried: true, observed: h.meta.y0 + j, stale: y - (h.meta.y0 + j), conf: fade(y - (h.meta.y0 + j)) };
  }
  return out;
}
/**
 * operator/occupancy (package 11): the ensemble's OCCUPANCY block — what state the world is in each forecast year,
 * beside the `p` curves that say when an event first fires. `fc.state.actors[id][var][k]`, `fc.state.dyads[pair][k]`
 * and `fc.state.records[id][k]` with k the 0-based offset from `fc.meta.from`; `fc.meta.state.vars` says what is
 * carried and, for each, whether the engine actually simulates it (cinc and `occupied` are carried, not forecast).
 */
export const stateOffset = (fc, year) => { if (!fc?.state) return -1; const k = Math.round(year) - fc.meta.from; return k >= 0 && k < fc.meta.horizon ? k : -1; };
export const stateVarMeta = (fc, id) => fc?.meta?.state?.vars?.find(v => v.id === id) ?? null;
/** Actor state at a forecast year: { at_war, intrastate, intrastate_war, cinc, pol_share } as the block carries them. */
export function actorStateAt(fc, id, year) { const k = stateOffset(fc, year); if (k < 0) return null; const s = fc.state.actors?.[id]; return s ? { k, at_war: s.at_war?.[k] ?? 0, intrastate: s.intrastate?.[k] ?? 0, intrastate_war: s.intrastate_war?.[k] ?? 0, occupied: s.occupied?.[k] ?? 0, cinc: s.cinc?.[k] ?? null, pol_share: s.pol_share?.[k] ?? null } : null; }
/** P(this pair is at war) in a forecast year; 0 where the pair is below the file's threshold (meta.state.vars). */
export function dyadWarAt(fc, a, b, year) { const k = stateOffset(fc, year); if (k < 0) return 0; const key = a < b ? `${a}|${b}` : `${b}|${a}`; return fc.state.dyads?.[key]?.[k] ?? 0; }
/** A record's simulated status distribution at a forecast year: the modal word, its probability, and the whole mix. */
export function recordStateAt(fc, recId, year) {
  const k = stateOffset(fc, year); if (k < 0) return null;
  const d = fc.state.records?.[recId]?.status?.[k]; if (!d) return null;
  const entries = Object.entries(d).sort((a, b) => b[1] - a[1]);
  return entries.length ? { status: entries[0][0], p: entries[0][1], dist: d, entries } : null;
}
/** A colour washed toward the map's neutral by how little we know: conf 1 = the colour, 0 = mostly grey. */
export const washed = (color, conf) => (color == null ? null : conf == null || conf >= 1 ? color : d3.interpolateLab(color, '#3a4250')((1 - conf) * 0.8));
/** Latest history entry at or before `year` for a corridor/territory record; null if it does not exist yet. */
export function statusAt(rec, year) {
  const hist = rec.history; if (!hist?.length) return { status: rec.status, controller: rec.controller, exists: true };
  let cur = null; for (const e of hist) { if (e.year <= year + 0.99) cur = e; else break; }
  if (!cur) return { exists: false };
  return { exists: true, status: cur.status ?? rec.status, controller: cur.controller ?? rec.controller, since: cur.year, source: cur.source, capacity: cur.capacity };
}

/** Forecast value for an actor at a calendar year (years before the forecast start return the 2025 state). */
export function forecastAt(fc, variable, id, year, horizon = 0) {
  const a = fc?.actors?.[id]; if (!a) return { value: null };
  const k = Math.round(year) - fc.meta.from;          // 0-based year offset
  if (k < 0) return { value: variable.id === 'fc_regime_mean' ? a.regime0 : (variable.id === 'fc_regime_uncertainty' ? 0 : 0), year, forecast: false };
  const i = Math.min(k, fc.meta.horizon - 1);
  if (variable.id === 'fc_regime_mean') { const d = a.regime?.[i]; return { value: d ? d.reduce((s, p, l) => s + p * l, 0) : null, year, forecast: true, dist: d }; }
  if (variable.id === 'fc_regime_uncertainty') { const d = a.regime?.[i]; return { value: d ? -d.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0) : null, year, forecast: true, dist: d }; }
  const c = a.p?.[variable.template]; if (!c) return { value: null, year, forecast: true };
  if (!horizon) return { value: c[i], year, forecast: true };                       // cumulative since the forecast start
  // P(first occurrence within the next `horizon` years | none so far): (c[i+H] - c[i-1]) / (1 - c[i-1]); the year itself counts
  const before = i > 0 ? c[i - 1] : 0; const end = c[Math.min(c.length - 1, i - 1 + horizon)];
  return { value: before >= 1 ? 0 : (end - before) / (1 - before), year, forecast: true, horizon };
}

/** Value of a compiled variable record at a year. Returns { value, year, extrapolated, projected }. */
export function valueAt(rec, year) {
  if (!rec) return { value: null };
  const ys = [...(rec.hist?.years ?? []), ...(rec.proj?.years ?? [])];
  const vs = [...(rec.hist?.values ?? []), ...(rec.proj?.values ?? [])];
  if (!ys.length) return { value: rec.v0, year: rec.year0 ?? null, extrapolated: false, projected: false };
  let i = -1;
  for (let k = 0; k < ys.length; k++) if (ys[k] <= year) i = k;
  if (i < 0) i = 0;
  const last = ys[ys.length - 1];
  return { value: vs[i], year: ys[i], extrapolated: year > last + 0.5, projected: ys[i] > 2026 };
}

export const LEVEL_COLORS = { N: '#3a4050', I: '#d9a441', S: '#4fc27a' };
export const REGIME_COLORS = {
  liberal_democracy: '#4f9be8', electoral_democracy: '#7fc4f0', electoral_autocracy: '#e8a04f', closed_autocracy: '#d95c4f', state_failure: '#7a3030',
};
export const NUCLEAR_COLORS = { none: '#3a4050', latent: '#d9a441', weapon: '#ef6a5a' };
export const STATUS_COLORS = {
  // territories
  occupied: '#ef6a5a', disputed: '#e8a04f', breakaway: '#c07ae0', buffer: '#6cb4ff', contested_active: '#ff3b3b', frozen: '#8b94a3',
  annexed: '#ef6a5a', protectorate: '#c07ae0', leased: '#6cb4ff', settled: '#4fc27a',
  // corridors
  open: '#4fc27a', contested: '#e8a04f', closed: '#ef6a5a', planned: '#5a6270', building: '#d9a441', built: '#4fc27a', abandoned: '#5a6270',
};

/** Build a colour function for a variable given all actor values at the current year. */
export function colorScale(variable, values) {
  if (variable?.gradient) { const sc = d3.scaleLinear().domain([0, 1, 2, 3]).range(REGIME_COL4).interpolate(d3.interpolateLab).clamp(true); return { color: v => (Number.isFinite(v) ? sc(v) : null), kind: 'numeric', domain: [0, 3], log: false, ticks: [0, 1, 2, 3], scale: sc }; }
  const cat = variable?.display?.categorical;
  if (cat) {
    const REG4 = { 0: '#d95c4f', 1: '#e8a04f', 2: '#7fc4f0', 3: '#4f9be8' }, FLAG = { 0: '#2a3340', 1: '#ef6a5a', 2: '#b3261e' };
    const pal = variable.id.startsWith('cap_') ? LEVEL_COLORS : variable.id === 'regime_type' ? REGIME_COLORS : variable.id === 'nuclear_status' ? NUCLEAR_COLORS : variable.id === 'h_regime' ? REG4 : variable.kind === 'history' ? FLAG : null;
    const ord = d3.scaleOrdinal().domain(cat).range(cat.map((c, i) => pal?.[c] ?? d3.schemeTableau10[i % 10]));
    return { color: v => (v == null ? null : ord(v)), kind: 'categorical', domain: cat, swatch: c => ord(c) };
  }
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return { color: () => null, kind: 'empty' };
  let [lo, hi] = d3.extent(nums);
  const log = variable?.display?.log && lo > 0;
  const interp = d3.interpolateViridis;
  const sc = log ? d3.scaleSequentialLog(interp).domain([lo, hi]) : d3.scaleSequential(interp).domain([lo, hi]);
  return { color: v => (Number.isFinite(v) ? sc(v) : null), kind: 'numeric', domain: [lo, hi], log, ticks: log ? sc.ticks(4) : d3.ticks(lo, hi, 4), scale: sc };
}

export function fmt(variable, v) {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v);
  const f = variable?.display?.format;
  try { return f ? d3.format(f)(v) : d3.format('.3~s')(v); } catch { return String(v); }
}

export function sparkPath(rec, w = 120, h = 26) {
  if (!rec?.hist?.years?.length) return null;
  const ys = [...rec.hist.years, ...(rec.proj?.years ?? [])];
  const vs = [...rec.hist.values, ...(rec.proj?.values ?? [])];
  const x = d3.scaleLinear().domain([ys[0], ys[ys.length - 1]]).range([1, w - 1]);
  const [lo, hi] = d3.extent(vs);
  const y = d3.scaleLinear().domain(lo === hi ? [lo - 1, hi + 1] : [lo, hi]).range([h - 2, 2]);
  const line = d3.line().x((_, i) => x(ys[i])).y((_, i) => y(vs[i]));
  const nh = rec.hist.years.length;
  return { hist: line(vs.slice(0, nh)), proj: rec.proj ? line(vs.slice(nh - 1)) : null, x0: x(2026.5), w, h };
}
