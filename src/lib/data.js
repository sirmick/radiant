import { loadFrames } from './provider.js';
// Loading, value-at-year, and colour scales. Everything reads the registry; nothing hardcodes a variable id.
import * as d3 from 'd3';

export async function loadWorld() {
  const opt = (f) => fetch(`${import.meta.env.BASE_URL}${f}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const [world, geo, scores, presence, frames] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}world.json`).then(r => r.json()),
    fetch(`${import.meta.env.BASE_URL}geo.topo.json`).then(r => r.json()),
    opt('scores.json'), opt('presence.json'), loadFrames(),
  ]);
  return { world, geo, scores, presence, ...frames };
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
/** URL hash <-> view state: #y=1956&v=h_regime&a=EGY&l=territories,corridors */
export function readHash() {
  try { const h = new URLSearchParams(location.hash.slice(1)); const o = {}; if (h.get('y')) o.year = +h.get('y'); if (h.get('v')) o.varId = h.get('v'); if (h.get('a')) o.actor = h.get('a'); if (h.get('l') != null) o.layers = Object.fromEntries(h.get('l').split(',').filter(Boolean).map(x => { const [k, v] = x.split(':'); return [k, v ?? true]; })); if (h.get('t')) o.tab = h.get('t'); if (h.get('f')) o.asOf = +h.get('f'); if (h.get('h')) o.horizon = +h.get('h'); if (h.get('view')) o.view = h.get('view'); if (h.get('m')) o.mode = h.get('m'); if (h.get('to')) o.fcTo = +h.get('to'); if (h.get('fm')) o.fcMode = h.get('fm'); if (h.get('r')) o.run = +h.get('r'); return o; } catch { return {}; }
}
export function writeHash({ year, varId, selected, layers, tab, asOf, horizon, view, mode, fcTo, fcMode, run }) {
  try { const h = new URLSearchParams(); h.set('y', String(Math.round(year))); h.set('v', varId); if (asOf != null) h.set('f', String(asOf)); if (horizon) h.set('h', String(horizon)); if (view) h.set('view', view); if (mode && mode !== '2d') h.set('m', mode); if (fcTo && fcTo !== 40) h.set('to', String(fcTo)); if (fcMode && fcMode !== 'consensus') h.set('fm', fcMode); if (run) h.set('r', String(run)); if (selected?.kind === 'actor') h.set('a', selected.id); h.set('l', Object.entries(layers).filter(([, v]) => v).map(([k, v]) => (v === true ? k : `${k}:${v}`)).join(',')); if (tab) h.set('t', tab); history.replaceState(null, '', '#' + h.toString()); } catch { }
}
/** Regime on a continuous axis, and the industry composite: the two map variables that are not single registry columns. */
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
// Union membership, one map variable per union in the frame sets' meta.unions: 1 / 0 in the record, P(member) in a
// forecast (the registry's dyad:member, keyed "member>union")
export const unionVariables = (meta) => Object.entries(meta ?? {}).map(([u, m]) => ({ id: `h_union_${u}`, group: 'history', label: `Member: ${m.name}`, unit: `${m.depth} union · member in the record · P(member) in a forecast`, kind: 'history', scope: 'actor', var: `member:${u}`, display: { map: true, format: '.0%', domain: [0, 1] } }));
/** The map's history variables: every actor variable the record's registry carries, plus the two composites. */
export function historyVariables(record) {
  if (!record) return [];
  const vars = Object.entries(record.meta.vars).filter(([key, v]) => key.startsWith('actor:') && v.id !== 'live');
  return [GRADIENT_VAR, INDUSTRY_VAR, ...unionVariables(record.meta.unions), ...vars.map(([, v]) => {
    const categorical = v.kind === 'binary' ? [0, 1] : v.kind === 'categorical' ? v.levels : undefined;
    const categoricalLabels = v.kind === 'binary' ? ['no', 'yes'] : v.kind === 'categorical' ? v.labels : undefined;
    return { id: `h_${v.id}`, group: 'history', label: v.label, unit: v.display?.unit ?? v.unit ?? '', kind: 'history', scope: 'actor', var: v.id, forecast: v.forecast, note: v.note, display: { map: true, format: v.display?.format ?? (categorical ? '.0f' : undefined), log: v.display?.log ?? v.log, categorical, categoricalLabels } };
  })];
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
  let [lo, hi] = variable?.display?.domain ?? d3.extent(nums);
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
