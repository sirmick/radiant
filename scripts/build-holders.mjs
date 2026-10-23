// Who holds each map territory, by year -> data/holders.json (docs/plan-structure.md, C5 breakup).
//
// Source: CShapes 2.0 (Schvitz et al. 2022), GW-coded, read from the copy the CRAN `cshapes` package ships
// (inst/extdata/cshapes_2_gw.topojson.xz; `git clone https://github.com/cran/cshapes` — icr.ethz.ch is not reachable
// from the build environment), unpacked to data/raw/hist/cshapes_2_gw.topojson. Every feature is one state or one
// dependency over a dated period, with `status` (independent, colony, protectorate, mandate, occupied) and `owner`
// (the GW code of the state that holds it; an independent state owns itself).
//
// Method: each territory of the map the engine draws births over (public/geo.topo.json, today's admin-0) is sampled
// at up to 15 interior points (a seeded grid over its parts, area-weighted; one point on the largest part for the
// smallest territories), and for every year 1886-2019 the holder is the majority over the points of the CShapes
// feature in force on 1 July that contains each. One point near a coast falls outside CShapes' simplified coastline
// (Sweden's did), so a vote over interior points is what makes the lookup robust. The holder is mapped to a model id through the year-aware GW
// code map (scripts/lib/hist.mjs). A territory whose point falls in no feature that year has no holder (open sea
// stands in for most of these: small islands the 30 km generalisation of CShapes drops).
//
// Output: { meta, holders: { <territory>: [[from, to, holder | null, status], ...] } } — spans of constant holder and
// status. A territory held by the state that draws on it (its own core) is `self`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as turf from '@turf/turf';
import { feature } from 'topojson-client';
import { loadActors, makeCodeMap } from './lib/hist.mjs';
import { loadPolygons } from './lib/inputs.mjs';
import { polygonKey } from '../src/engine/membership.js';

const SRC = 'data/raw/hist/cshapes_2_gw.topojson';
if (!existsSync(SRC)) { console.error(`${SRC} missing: git clone https://github.com/cran/cshapes, then xz -dk inst/extdata/cshapes_2_gw.topojson.xz into data/raw/hist/`); process.exit(1); }
const Y0 = 1886, Y1 = 2019;
const actors = loadActors(); const gw = makeCodeMap(actors, 'gw');
const { polygonOf } = loadPolygons(actors);
const topoMap = JSON.parse(readFileSync('public/geo.topo.json', 'utf8'));
const territories = feature(topoMap, topoMap.objects.countries).features;
const cs = JSON.parse(readFileSync(SRC, 'utf8'));
const csf = feature(cs, cs.objects[Object.keys(cs.objects)[0]]).features.map(f => ({ f, p: f.properties, bbox: turf.bbox(f), s: Date.parse(f.properties.start), e: Date.parse(f.properties.end) }));

const N_PTS = 15;
const points = (f) => {
  const parts = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map(c => turf.polygon(c)) : [turf.polygon(f.geometry.coordinates)]).sort((a, b) => turf.area(b) - turf.area(a));
  const pts = []; let s = 11; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const big = parts[0]; const b = turf.bbox(big);
  for (let k = 0; k < 400 && pts.length < N_PTS; k++) { const p = [b[0] + rnd() * (b[2] - b[0]), b[1] + rnd() * (b[3] - b[1])]; if (turf.booleanPointInPolygon(p, big)) pts.push(p); }
  if (!pts.length) pts.push(turf.pointOnFeature(big).geometry.coordinates);
  return pts;
};
const inBox = ([x, y], b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const idOf = (code, y) => { const a = gw(code, y); return a?.id ?? (typeof a === 'string' ? a : null); };

const holders = {}; let unheld = 0, unmapped = new Map();
for (const t of territories) {
  const pts = points(t); const spans = [];
  for (let y = Y0; y <= Y1; y++) {
    const d = Date.UTC(y, 6, 1); const live = csf.filter(c => d >= c.s && d <= c.e);
    const votes = new Map();
    for (const pt of pts) { const c = live.find(c => inBox(pt, c.bbox) && turf.booleanPointInPolygon(pt, c.f)); if (c) votes.set(c, (votes.get(c) ?? 0) + 1); }
    const hit = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    let h = null, st = null;
    if (hit) {
      st = hit.p.status; const own = +(hit.p.owner ?? hit.p.gwcode);
      h = idOf(own, y); if (!h) { unmapped.set(own, (unmapped.get(own) ?? 0) + 1); }
      if (h && polygonKey(h, polygonOf) === t.id) h = 'self';
    } else unheld++;
    const last = spans[spans.length - 1];
    if (last && last[2] === h && last[3] === st && last[1] === y - 1) last[1] = y; else spans.push([y, y, h, st]);
  }
  holders[t.id] = spans;
}
const meta = { built: new Date().toISOString(), source: 'CShapes 2.0 (GW), via the CRAN cshapes package copy', years: [Y0, Y1], rule: 'feature in force on 1 July containing a point on the territory\'s largest part; holder = feature owner mapped to a model id; self = the territory the holder itself draws on', territories: territories.length, unheld_territory_years: unheld, unmapped_owner_codes: Object.fromEntries(unmapped) };
writeFileSync('data/holders.json', JSON.stringify({ meta, holders }));
console.log(`data/holders.json: ${territories.length} territories, ${unheld} unheld territory-years, unmapped owner codes ${JSON.stringify(meta.unmapped_owner_codes)}`);
