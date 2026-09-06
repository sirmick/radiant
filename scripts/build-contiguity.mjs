// Derive direct contiguity (shared land border or ≤ ~30 km of water) per year from CShapes 2.0 -> data/contiguity.json
// CShapes gives one polygon per state per period (gwcode, gwsyear..gweyear). Pairs whose periods and bounding boxes overlap
// are tested with a small buffer; contiguity holds for the overlapping years. Output: { pairs: { "A|B": [[from,to],...] } }
// keyed by model actor ids (GW code -> id via the state universe, year-aware).
import { readFileSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import { loadActors, makeCodeMap } from './lib/hist.mjs';

const actors = loadActors(); const gw = makeCodeMap(actors, 'gw');
const fc = JSON.parse(readFileSync('data/raw/hist/cshapes.geojson', 'utf8'));
const BUF_KM = 30;
const feats = fc.features.map(f => {
  const p = f.properties; const y0 = +p.gwsyear, y1 = +p.gweyear;
  let g = f.geometry; try { g = turf.simplify(f, { tolerance: 0.05, highQuality: false }).geometry; } catch { }
  let buffered = null; try { buffered = turf.buffer({ type: 'Feature', geometry: g }, BUF_KM / 2, { units: 'kilometers' }); } catch { buffered = { type: 'Feature', geometry: g }; }
  return { gw: +p.gwcode, name: p.cntry_name, y0, y1: y1 >= 2019 ? 2030 : y1, bbox: turf.bbox(buffered), geom: buffered };
});
const bboxOverlap = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pairs = {}; let tests = 0, hits = 0;
for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) {
  const A = feats[i], B = feats[j]; if (A.gw === B.gw) continue;
  const from = Math.max(A.y0, B.y0), to = Math.min(A.y1, B.y1); if (from > to) continue;
  if (!bboxOverlap(A.bbox, B.bbox)) continue;
  tests++;
  let touch = false; try { touch = turf.booleanIntersects(A.geom, B.geom); } catch { touch = false; }
  if (!touch) continue; hits++;
  const mid = Math.floor((from + to) / 2); const a = gw(A.gw, mid), b = gw(B.gw, mid); if (!a || !b || a === b) continue;
  (pairs[pairKey(a, b)] ??= []).push([from, to]);
}
// merge overlapping intervals per pair
for (const k of Object.keys(pairs)) { const iv = pairs[k].sort((x, y) => x[0] - y[0]); const out = []; for (const [f, t] of iv) { const last = out[out.length - 1]; if (last && f <= last[1] + 1) last[1] = Math.max(last[1], t); else out.push([f, t]); } pairs[k] = out; }
writeFileSync('data/contiguity.json', JSON.stringify({ meta: { built: new Date().toISOString(), source: 'CShapes 2.0, buffered ' + BUF_KM + ' km', years: [1886, 2030] }, pairs }));
console.log(`contiguity.json: ${feats.length} polygons, ${tests} bbox pairs tested, ${hits} intersecting, ${Object.keys(pairs).length} contiguous actor pairs`);
