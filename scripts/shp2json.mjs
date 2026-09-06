// Convert a Natural Earth shapefile to GeoJSON: node scripts/shp2json.mjs in.shp out.json [prop,prop,...]
import * as shapefile from 'shapefile';
import { writeFileSync } from 'node:fs';
const [,, inp, out, keep] = process.argv;
const keepSet = keep ? new Set(keep.split(',')) : null;
const fc = await shapefile.read(inp, inp.replace(/\.shp$/, '.dbf'), { encoding: 'utf-8' });
if (keepSet) for (const f of fc.features) f.properties = Object.fromEntries(Object.entries(f.properties).filter(([k]) => keepSet.has(k)));
writeFileSync(out, JSON.stringify(fc));
console.log(inp, '->', out, fc.features.length, 'features');
