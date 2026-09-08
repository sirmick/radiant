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
  vars.unshift({ id: 'fc_regime_mean', group: 'forecast', label: 'Expected regime level (0 closed … 3 liberal)', unit: 'ensemble mean', kind: 'forecast', scope: 'actor', display: { map: true, format: '.2f' } });
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
  try { const h = new URLSearchParams(location.hash.slice(1)); const o = {}; if (h.get('y')) o.year = +h.get('y'); if (h.get('v')) o.varId = h.get('v'); if (h.get('a')) o.actor = h.get('a'); if (h.get('l') != null) o.layers = Object.fromEntries(h.get('l').split(',').filter(Boolean).map(x => { const [k, v] = x.split(':'); return [k, v ?? true]; })); if (h.get('t')) o.tab = h.get('t'); if (h.get('f')) o.asOf = +h.get('f'); if (h.get('h')) o.horizon = +h.get('h'); if (h.get('view')) o.view = h.get('view'); if (h.get('m')) o.mode = h.get('m'); return o; } catch { return {}; }
}
export function writeHash({ year, varId, selected, layers, tab, asOf, horizon, view, mode }) {
  try { const h = new URLSearchParams(); h.set('y', String(Math.round(year))); h.set('v', varId); if (asOf != null) h.set('f', String(asOf)); if (horizon) h.set('h', String(horizon)); if (view) h.set('view', view); if (mode && mode !== '2d') h.set('m', mode); if (selected?.kind === 'actor') h.set('a', selected.id); h.set('l', Object.entries(layers).filter(([, v]) => v).map(([k, v]) => (v === true ? k : `${k}:${v}`)).join(',')); if (tab) h.set('t', tab); history.replaceState(null, '', '#' + h.toString()); } catch { }
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
export function historyVariables(h) {
  if (!h) return [];
  return Object.entries(h.vars).map(([id, spec]) => ({ id: `h_${id}`, group: 'history', label: spec.label, unit: spec.unit, kind: 'history', scope: 'actor', var: id, display: { map: true, format: spec.format, log: spec.log, categorical: spec.categorical, categoricalLabels: id === 'regime' ? REGIME_LABELS : id === 'intrastate' ? ['none', 'minor', 'war'] : spec.categorical ? ['no', 'yes'] : undefined } }));
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
