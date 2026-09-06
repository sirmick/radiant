// Loading, value-at-year, and colour scales. Everything reads the registry; nothing hardcodes a variable id.
import * as d3 from 'd3';

export async function loadWorld() {
  const [world, geo] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}world.json`).then(r => r.json()),
    fetch(`${import.meta.env.BASE_URL}geo.topo.json`).then(r => r.json()),
  ]);
  return { world, geo };
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
  // corridors
  open: '#4fc27a', contested: '#e8a04f', closed: '#ef6a5a', planned: '#5a6270', building: '#d9a441', built: '#4fc27a',
};

/** Build a colour function for a variable given all actor values at the current year. */
export function colorScale(variable, values) {
  const cat = variable?.display?.categorical;
  if (cat) {
    const pal = variable.id.startsWith('cap_') ? LEVEL_COLORS : variable.id === 'regime_type' ? REGIME_COLORS : variable.id === 'nuclear_status' ? NUCLEAR_COLORS : null;
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
