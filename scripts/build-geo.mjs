// Build data/geo/world.topo.json from Natural Earth: countries (50m) + disputed areas (10m).
import * as shapefile from 'shapefile';
import * as topojson from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { writeFileSync } from 'node:fs';

const read = async (p) => shapefile.read(p, p.replace(/\.shp$/, '.dbf'), { encoding: 'utf-8' });

const countries = await read('data/raw/ne/ne_50m_admin_0_countries.shp');
const seen = new Map();
countries.features = countries.features.map(f => ({
  type: 'Feature',
  id: (() => { const base = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ADM0_A3; const n = (seen.get(base) ?? 0) + 1; seen.set(base, n); return n === 1 ? base : `${base}-${n}`; })(),
  properties: { name: f.properties.NAME, adm0: f.properties.ADM0_A3, sov: f.properties.SOV_A3, ne_id: f.properties.NE_ID },
  geometry: f.geometry,
}));

const disputed = await read('data/raw/ne/ne_10m_admin_0_disputed_areas.shp');
disputed.features = disputed.features.map(f => ({
  type: 'Feature',
  id: `ne-${f.properties.NE_ID}`,
  properties: { name: f.properties.NAME, brk: f.properties.BRK_NAME, admin: f.properties.ADMIN, sov: f.properties.SOV_A3, note: f.properties.NOTE_BRK, type: f.properties.TYPE, ne_id: f.properties.NE_ID },
  geometry: f.geometry,
}));

let topo = topojson.topology({ countries, disputed }, 1e5);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.15));   // keep ~85% of points' detail
writeFileSync('data/geo/world.topo.json', JSON.stringify(topo));
const kb = Math.round(JSON.stringify(topo).length / 1024);
console.log(`world.topo.json: ${countries.features.length} countries, ${disputed.features.length} disputed, ${kb} KB`);
