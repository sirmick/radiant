// Sphere-of-influence field: a continuous geographic estimate, not a national attribute.
// For each great power p at year y, I_p(cell) = Σ sources w_s · exp(−d / λ_s), where the sources are:
//   home territory   (cells inside p's own polygon: w 1.0; plus its centroid with w ∝ √capability, λ 2500 km)
//   pact partners    (cells inside a partner's polygon: w 0.6 bilateral / 0.35 multilateral; partner centroid, λ 1200 km)
//   bases/garrisons  (w 0.25·level, λ 1000 km) and fleet areas (w 0.3·level, λ 1500 km) from presence.yaml
// Dominance per cell: the power with the largest I; opacity = margin over the runner-up, scaled by total intensity so
// empty ocean fades out. All weights are `estimate` — this is a picture of the data layers, not a fitted quantity.
import * as d3 from 'd3';

const R = 6371;
const km = (a, b) => d3.geoDistance(a, b) * R;
const K = (d, lambda) => Math.exp(-d / lambda);

/** Build a lon/lat grid and a cell -> country-id map by rasterising the country polygons once. */
export function buildGrid(countries, step = 2) {
  const cols = Math.round(360 / step), rows = Math.round(180 / step);
  const cells = new Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells[r * cols + c] = [-180 + (c + 0.5) * step, 90 - (r + 0.5) * step];
  // rasterise: equirectangular at one pixel per cell, index colour per country
  const canvas = document.createElement('canvas'); canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const proj = d3.geoEquirectangular().scale(cols / (2 * Math.PI)).translate([cols / 2, rows / 2]);
  const path = d3.geoPath(proj, ctx);
  const ids = countries.map(f => f.id);
  countries.forEach((f, i) => { const n = i + 1; ctx.fillStyle = `rgb(${n & 255},${(n >> 8) & 255},${(n >> 16) & 255})`; ctx.beginPath(); path(f); ctx.fill(); });
  const px = ctx.getImageData(0, 0, cols, rows).data; const owner = new Array(cols * rows).fill(null);
  for (let i = 0; i < cols * rows; i++) { const n = px[i * 4] | (px[i * 4 + 1] << 8) | (px[i * 4 + 2] << 16); if (n > 0 && px[i * 4 + 3] > 0) owner[i] = ids[n - 1]; }
  return { step, cols, rows, cells, owner };
}

/**
 * Compute the field. `powers`: [{ id, cap, polygonKey, centroid, partners: [{ key, centroid, w }], stations: [{ lonlat, w, lambda }] }]
 * Returns { dominant: Int16Array(index into powers or -1), alpha: Float32Array, total: Float32Array }.
 */
export function influenceField(grid, powers) {
  const n = grid.cells.length; const P = powers.length;
  const I = new Float32Array(n * P);
  for (let p = 0; p < P; p++) {
    const pw = powers[p];
    const homeW = 1.0, homeLambda = 2500, capW = 0.6 * Math.sqrt(Math.max(0, pw.cap ?? 0) / 0.2);   // 20% of world capability -> weight 0.6
    for (let i = 0; i < n; i++) {
      const cell = grid.cells[i]; let v = 0;
      if (grid.owner[i] === pw.polygonKey) v += homeW;
      if (pw.centroid) v += capW * K(km(cell, pw.centroid), homeLambda);
      for (const a of pw.partners) { if (grid.owner[i] === a.key) v += a.w; if (a.centroid) v += a.w * 0.5 * K(km(cell, a.centroid), 1200); }
      for (const s of pw.stations) v += s.w * K(km(cell, s.lonlat), s.lambda);
      I[i * P + p] = v;
    }
  }
  const dominant = new Int16Array(n).fill(-1), alpha = new Float32Array(n), total = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = -1, b1 = 0, b2 = 0, sum = 0;
    for (let p = 0; p < P; p++) { const v = I[i * P + p]; sum += v; if (v > b1) { b2 = b1; b1 = v; best = p; } else if (v > b2) b2 = v; }
    total[i] = sum; dominant[i] = best;
    const margin = b1 > 0 ? (b1 - b2) / b1 : 0;                      // 0 = tie, 1 = uncontested
    alpha[i] = Math.min(0.75, margin * Math.min(1, b1 / 0.35));       // fade where nobody reaches ~0.35
  }
  return { dominant, alpha, total, I };
}


// ---------------------------------------------------------------------------------------------------------------
// Field registry. A field is: id, label, `sources(ctx)` -> [{ lonlat | polygonKey, w, lambda, group }], and a `paint`
// mode: 'dominant' (colour = group with the largest intensity, opacity = margin) or 'heat' (single hue, opacity = intensity).
// ctx gives the Map's per-year accessors so new fields are data + a kernel, not new rendering code.
export const FIELDS = {
  influence: {
    label: 'Spheres of influence',
    note: 'estimate: home + pacts + bases/fleets, distance-decayed · colour = dominant power · opacity = margin',
    paint: 'dominant',
    groups: (ctx) => ctx.powers.map(p => p.id),
    sources: (ctx) => ctx.powers.flatMap(pw => [
      { group: pw.id, polygonKey: pw.polygonKey, w: 1.0 },
      pw.centroid ? { group: pw.id, lonlat: pw.centroid, w: 0.6 * Math.sqrt(Math.max(0, pw.cap ?? 0) / 0.2), lambda: 2500 } : null,
      ...pw.partners.flatMap(a => [{ group: pw.id, polygonKey: a.key, w: a.w }, a.centroid ? { group: pw.id, lonlat: a.centroid, w: a.w * 0.5, lambda: 1200 } : null]),
      ...pw.stations.map(s => ({ group: pw.id, lonlat: s.lonlat, w: s.w, lambda: s.lambda })),
    ].filter(Boolean)),
    color: (ctx, group) => ctx.colors[group] ?? '#8b94a3',
    threshold: 0.35,
  },
  hazard: {
    label: 'Forecast hazard',
    note: 'P(any modelled event within the horizon | not yet) from the ensemble, painted as the excess over the median actor; dyad hazards sit between the pair · blur grows with the horizon',
    paint: 'heat',
    groups: () => ['hazard'],
    sources: (ctx) => [
      ...ctx.actorHazards.map(h => ({ group: 'hazard', polygonKey: h.key, lonlat: h.lonlat, w: h.w, lambda: 400 })),
      ...ctx.dyadHazards.map(h => ({ group: 'hazard', lonlat: h.mid, w: h.w, lambda: h.lambda })),
    ].filter(s => s.lonlat || s.polygonKey),
    color: () => '#ff7a45',
    threshold: 0.35,
  },
  conflict: {
    label: 'Belligerents',
    note: 'who is at war, not where the fighting is: interstate war (w 1.0, λ 900 km), disputes (0.4, 600), internal armed conflict (0.6 / 1.0 by intensity, 500). Battle locations need UCDP GED (1989→)',
    paint: 'heat',
    groups: () => ['conflict'],
    sources: (ctx) => [
      ...ctx.atWar.map(id => ({ group: 'conflict', lonlat: ctx.lonlat(id), polygonKey: ctx.neKey(id), w: 1.0, lambda: 900 })),
      ...ctx.disputes.map(id => ({ group: 'conflict', lonlat: ctx.lonlat(id), w: 0.4, lambda: 600 })),
      ...ctx.intrastate.map(([id, level]) => ({ group: 'conflict', lonlat: ctx.lonlat(id), polygonKey: ctx.neKey(id), w: level >= 2 ? 1.0 : 0.6, lambda: 500 })),
    ].filter(s => s.lonlat || s.polygonKey),
    color: () => '#ef6a5a',
    threshold: 0.3,
  },
};

FIELDS.industry = {
  label: 'Industrial mass',
  note: 'estimate: each state\'s share of world industrial output (steel, then electricity, then manufacturing value added) spread from its territory, so industrial regions read across borders',
  paint: 'heat',
  groups: () => ['industry'],
  sources: (ctx) => ctx.industry.map(a => ({ group: 'industry', polygonKey: a.key, lonlat: a.lonlat, w: Math.sqrt(a.w), lambda: 600 })),   // sqrt: mid-sized producers stay visible next to the largest
  color: () => '#ffd166',
  threshold: 0.3,
};
FIELDS.routes = {
  label: 'Routes',
  note: 'estimate: corridors and chokepoints in service, weighted by how many states they are load-bearing for; contested/closed routes in red',
  paint: 'dominant',
  groups: () => ['open', 'contested'],
  sources: (ctx) => ctx.routes.map(r => ({ group: r.contested ? 'contested' : 'open', lonlat: r.lonlat, w: r.w, lambda: r.lambda })),
  color: (ctx, g) => (g === 'contested' ? '#ef6a5a' : '#4fc27a'),
  threshold: 0.3,
};

/** Generic evaluation: intensity per group per cell from a source list. */
export function evaluateField(grid, spec, ctx) {
  const groups = spec.groups(ctx); const G = groups.length; const gi = Object.fromEntries(groups.map((g, i) => [g, i]));
  const n = grid.cells.length; const I = new Float32Array(n * G);
  const srcs = spec.sources(ctx);
  for (const s of srcs) {
    const g = gi[s.group]; if (g == null) continue;
    if (s.polygonKey) for (let i = 0; i < n; i++) if (grid.owner[i] === s.polygonKey) I[i * G + g] += s.w;
    if (s.lonlat) { const reach = s.lambda * 5, dlat = reach / 111 + grid.step; const [slon, slat] = s.lonlat; for (let i = 0; i < n; i++) { const c = grid.cells[i]; if (Math.abs(c[1] - slat) > dlat) continue; let dl = Math.abs(c[0] - slon); if (dl > 180) dl = 360 - dl; if (dl * 111 * Math.cos(slat * Math.PI / 180) > reach + 111 * grid.step) continue; const d = km(c, s.lonlat); if (d < reach) I[i * G + g] += s.w * K(d, s.lambda); } }
  }
  const dominant = new Int16Array(n).fill(-1), alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = -1, b1 = 0, b2 = 0;
    for (let g = 0; g < G; g++) { const v = I[i * G + g]; if (v > b1) { b2 = b1; b1 = v; best = g; } else if (v > b2) b2 = v; }
    dominant[i] = best;
    alpha[i] = spec.paint === 'heat' ? Math.min(0.8, b1 / (spec.threshold * 3)) : (b1 > 0 ? Math.min(0.75, ((b1 - b2) / b1) * Math.min(1, b1 / spec.threshold)) : 0);
  }
  return { dominant, alpha, groups, I };
}
