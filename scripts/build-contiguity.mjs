// Derive direct contiguity per year -> data/contiguity.json, from two sources merged.
//
//  * CShapes 2.0 (1886-2019) — one polygon per state per period (gwcode, gwsyear..gweyear); pairs whose periods and
//    bounding boxes overlap are tested with a ~30 km buffer (15 km a side), so "contiguous" is a shared land border
//    or a narrow water gap.
//  * CoW Direct Contiguity 3.2 (1816-2016, data/raw/hist/cow_contdir.csv) — conttype 1 (land border), 2 (<= 12
//    miles of water) and 3 (<= 24 miles). The CShapes test is a 30 km gap, which falls between type 2 (19 km) and
//    type 3 (39 km), so 1-3 makes the merge a superset of the buffer rather than a subset; type 3 is 50 of the
//    source's 1,874 rows and is what codes the era's narrow-water neighbours (Gulf of Fonseca, the Strait of
//    Gibraltar). This is the only source with any coverage before 1886, and it sees the water and colonial-frontier
//    pairs a metropolitan polygon cannot. A row still running at the source's last date (2016) is carried forward.
//
// Merge policy: a pair is contiguous in a year if EITHER source says so. Where they disagree the count is printed,
// not silently resolved — a polygon source cannot veto a coded land border and vice versa.
//
// Antimeridian: a CShapes polygon that touches ±180 buffers into a band around the whole planet (Fiji's buffered
// area was 178x its real area, which put Fiji on the borders of Peru, Angola and Madagascar). Every polygon is split
// into its parts, and a part that reaches the antimeridian is buffered in a continuous eastern frame and then kept
// in BOTH frames (lon and lon-360) so it can still meet its real neighbours on either side. A build-time guard
// fails on any buffered part whose bbox is more than 5 degrees wider than its own raw bbox.
//
// Output: { meta, pairs: { "A|B": [[from,to],...] } } keyed by model actor ids (GW/CoW code -> id, year-aware).
import { readFileSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import { loadActors, makeCodeMap, readCsv } from './lib/hist.mjs';

const Y_FROM = 1816, Y_TO = 2030, COW_LAST = 2016;
const actors = loadActors(); const gw = makeCodeMap(actors, 'gw'); const cowMap = makeCodeMap(actors, 'cow');
const BUF_KM = 30;

// ---------------------------------------------------------------------------- CShapes polygons
const fc = JSON.parse(readFileSync('data/raw/hist/cshapes.geojson', 'utf8'));
const polysOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates.map(c => ({ type: 'Polygon', coordinates: c })) : [g]);
const shiftLon = (g, d) => { const c = JSON.parse(JSON.stringify(g)); turf.coordEach({ type: 'Feature', geometry: c }, (p) => { p[0] += d; }); return c; };
const prepPart = (poly) => {                       // -> [{ geom, bbox }, ...] (two frames for an antimeridian part)
  const raw = turf.bbox({ type: 'Feature', geometry: poly });
  const wraps = raw[0] <= -179 || raw[2] >= 179;
  // turf.buffer round-trips through Mercator and wraps any longitude past ±180 back around the globe, so a part that
  // reaches the antimeridian is first unwrapped (lon < 0 -> lon + 360) and then translated to sit over the meridian.
  let g = poly, c = 0;
  if (wraps) {
    g = shiftLon(poly, 0); turf.coordEach({ type: 'Feature', geometry: g }, (p) => { if (p[0] < 0) p[0] += 360; });
    const ub = turf.bbox({ type: 'Feature', geometry: g }); c = (ub[0] + ub[2]) / 2; g = shiftLon(g, -c);
  }
  let f = { type: 'Feature', geometry: g };
  try { f = turf.simplify(f, { tolerance: 0.05, highQuality: false }); } catch { }
  let b = null; try { b = turf.buffer(f, BUF_KM / 2, { units: 'kilometers' }); } catch { }
  const geom = b?.geometry ?? f.geometry;
  const wb = turf.bbox({ type: 'Feature', geometry: geom });
  const rawW = wraps ? turf.bbox({ type: 'Feature', geometry: g })[2] - turf.bbox({ type: 'Feature', geometry: g })[0] : raw[2] - raw[0];
  if ((wb[2] - wb[0]) - rawW > 5) throw new Error(`build-contiguity: buffered part spans ${(wb[2] - wb[0]).toFixed(1)}° against a raw ${rawW.toFixed(1)}° — antimeridian wrap`);
  const mk = (d) => { const gg = d === 0 ? geom : shiftLon(geom, d); return { geom: gg, bbox: turf.bbox({ type: 'Feature', geometry: gg }) }; };
  return wraps ? [mk(c), mk(c - 360)] : [mk(0)];
};
const feats = fc.features.map(f => {
  const p = f.properties; const y0 = +p.gwsyear, y1 = +p.gweyear;
  return { gw: +p.gwcode, name: p.cntry_name, y0, y1: y1 >= 2019 ? Y_TO : y1, shapes: polysOf(f.geometry).flatMap(prepPart) };
});
const bboxOverlap = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const cshapes = new Map();   // "A|B" -> Set(year)
const addYears = (m, k, from, to) => { const s = m.get(k) ?? m.set(k, new Set()).get(k); for (let y = Math.max(from, Y_FROM); y <= Math.min(to, Y_TO); y++) s.add(y); };
let tests = 0, hits = 0;
for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) {
  const A = feats[i], B = feats[j]; if (A.gw === B.gw) continue;
  const from = Math.max(A.y0, B.y0), to = Math.min(A.y1, B.y1); if (from > to) continue;
  let touch = false;
  outer: for (const sa of A.shapes) for (const sb of B.shapes) {
    if (!bboxOverlap(sa.bbox, sb.bbox)) continue;
    tests++;
    try { if (turf.booleanIntersects(sa.geom, sb.geom)) { touch = true; break outer; } } catch { }
  }
  if (!touch) continue; hits++;
  const mid = Math.floor((from + to) / 2); const a = gw(A.gw, mid), b = gw(B.gw, mid); if (!a || !b || a === b) continue;
  addYears(cshapes, pairKey(a, b), from, to);
}

// ---------------------------------------------------------------------------- CoW Direct Contiguity 3.2
const cow = new Map();
let cowRows = 0;
for (const r of readCsv('data/raw/hist/cow_contdir.csv')) {
  const ct = +r.conttype; if (!(ct >= 1 && ct <= 3)) continue;   // land border, <= 12 or <= 24 miles of water
  cowRows++;
  const end = +r.endyear >= COW_LAST ? Y_TO : +r.endyear;        // still contiguous when the source stops
  for (let y = +r.styear; y <= end; y++) {
    const a = cowMap(+r.ccode1, y), b = cowMap(+r.ccode2, y); if (!a || !b || a === b) continue;
    addYears(cow, pairKey(a, b), y, y);
  }
}

// ---------------------------------------------------------------------------- merge (either source)
const pairs = {}; let both = 0, csOnly = 0, cowOnly = 0;
const keys = new Set([...cshapes.keys(), ...cow.keys()]);
for (const k of keys) {
  const A = cshapes.get(k), B = cow.get(k);
  const ys = [...new Set([...(A ?? []), ...(B ?? [])])].sort((x, y) => x - y);
  for (const y of ys) { const inA = A?.has(y), inB = B?.has(y); if (inA && inB) both++; else if (inA) csOnly++; else cowOnly++; }
  const out = []; for (const y of ys) { const last = out[out.length - 1]; if (last && y === last[1] + 1) last[1] = y; else out.push([y, y]); }
  pairs[k] = out;
}
writeFileSync('data/contiguity.json', JSON.stringify({
  meta: {
    built: new Date().toISOString(),
    source: `CShapes 2.0 buffered ${BUF_KM} km (1886-2019) merged with CoW Direct Contiguity 3.2 conttype 1-3 (1816-2016); a pair is contiguous where either source says so`,
    sources: [
      { name: 'CShapes 2.0', file: 'data/raw/hist/cshapes.geojson', years: [1886, Y_TO], note: `polygons buffered ${BUF_KM / 2} km a side` },
      { name: 'CoW Direct Contiguity 3.2', file: 'data/raw/hist/cow_contdir.csv', years: [1816, 2016], note: 'conttype 1 (land), 2 (<= 12 miles of water) and 3 (<= 24 miles); rows open at 2016 carried forward' },
    ],
    years: [Y_FROM, Y_TO],
  }, pairs,
}));
console.log(`contiguity.json: ${feats.length} polygons, ${tests} part-pair tests, ${hits} intersecting; CoW ${cowRows} rows type 1-3`);
console.log(`  pair-years: ${both} both sources, ${csOnly} CShapes only, ${cowOnly} CoW only; ${Object.keys(pairs).length} contiguous actor pairs`);
