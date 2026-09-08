// Projection, hit-testing and geometry helpers for the canvas renderer. Both map modes go through one projection object,
// so every layer (fills, fields, arcs, marks) is drawn once and works on the flat map and the globe alike.
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

/** d3-geo wants clockwise exterior rings; GIS data and hand sketches are often the reverse (renders as the whole sphere). */
export function rewind(f) {
  const g = f.geometry; if (!g) return f;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polys) return f;
  for (const rings of polys) rings.forEach((ring, i) => { const area = d3.geoArea({ type: 'Polygon', coordinates: [ring] }); if ((i === 0) === (area > 2 * Math.PI)) ring.reverse(); });
  return f;
}

export function loadGeometry(geo) {
  const countries = topojson.feature(geo, geo.objects.countries).features.map(rewind);
  const disputed = topojson.feature(geo, geo.objects.disputed).features.map(rewind);
  const borders = topojson.mesh(geo, geo.objects.countries, (a, b) => a !== b);
  const centroid = new Map(); for (const f of countries) { try { centroid.set(f.id, d3.geoCentroid(f)); } catch { } }
  return { countries, disputed, borders, centroid };
}

/**
 * Rasterise country polygons once into a lon/lat owner grid (0.5°) for O(1) point-in-country lookups.
 * Same trick as the field grid: index colours on an equirectangular canvas.
 */
export function buildOwnerGrid(countries, step = 0.5) {
  const cols = Math.round(360 / step), rows = Math.round(180 / step);
  const canvas = document.createElement('canvas'); canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const proj = d3.geoEquirectangular().scale(cols / (2 * Math.PI)).translate([cols / 2, rows / 2]);
  const path = d3.geoPath(proj, ctx);
  countries.forEach((f, i) => { const n = i + 1; ctx.fillStyle = `rgb(${n & 255},${(n >> 8) & 255},${(n >> 16) & 255})`; ctx.beginPath(); path(f); ctx.fill(); });
  const px = ctx.getImageData(0, 0, cols, rows).data;
  const ids = countries.map(f => f.id);
  return {
    step, cols, rows,
    at(lon, lat) {
      if (lon == null || lat == null || Number.isNaN(lon)) return null;
      const c = Math.min(cols - 1, Math.max(0, Math.floor((lon + 180) / step))), r = Math.min(rows - 1, Math.max(0, Math.floor((90 - lat) / step)));
      const i = (r * cols + c) * 4; const n = px[i] | (px[i + 1] << 8) | (px[i + 2] << 16);
      return n > 0 && px[i + 3] > 0 ? ids[n - 1] : null;
    },
  };
}

/** A projection for the mode. `view` = { k (zoom), x, y (2D pan in px), rotate: [λ, φ] (3D) }. */
export function makeProjection(mode, width, height, view) {
  if (mode === '3d') {
    const r = Math.min(width, height) / 2 - 10;
    return d3.geoOrthographic().translate([width / 2, height / 2]).scale(r * view.k).rotate(view.rotate).clipAngle(90).precision(0.5);
  }
  const p = d3.geoNaturalEarth1().fitExtent([[8, 8], [width - 8, height - 8]], { type: 'Sphere' });
  const s = p.scale(), t = p.translate();
  return p.scale(s * view.k).translate([t[0] * view.k + view.x, t[1] * view.k + view.y]).precision(0.5);
}

/** Is a lon/lat point on the visible hemisphere (3D) / anywhere (2D)? */
export const visible = (mode, projection, lonlat) => {
  if (!lonlat) return false;
  if (mode !== '3d') return true;
  const [λ, φ] = projection.rotate();
  return d3.geoDistance(lonlat, [-λ, -φ]) < Math.PI / 2 - 0.02;
};

/** Screen -> lon/lat (null off the globe). */
export const unproject = (projection, xy) => { try { const ll = projection.invert(xy); return ll && !Number.isNaN(ll[0]) ? ll : null; } catch { return null; } };
