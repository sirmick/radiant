// Defence-pact edges per year for the map: CoW Formal Alliances 3.03 dyadic (1816–2000) -> public/alliances.json
// { meta, years: { "1905": [["GBR","JPN"], ...] } } keyed by model actor ids; 2001+ carries the 2000 graph forward, flagged.
import { writeFileSync } from 'node:fs';
import { readCsv, loadActors, makeCodeMap } from './lib/hist.mjs';
const actors = loadActors(); const code = makeCodeMap(actors);
// years: { y: { pacts: { allynum: [members...] } } } — multilateral pacts are kept as member sets so the map can draw them hub-and-spoke
const byYear = {};
for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) {
  if (r.sstype !== '1') continue;
  const y = +r.year; const a = code(r.ccode1, y), b = code(r.ccode2, y); if (!a || !b || a === b) continue;
  const p = ((byYear[y] ??= {})[r.allynum] ??= new Set()); p.add(a); p.add(b);
}
const years = {}; for (const [y, pacts] of Object.entries(byYear)) years[y] = Object.fromEntries(Object.entries(pacts).map(([id, s]) => [id, [...s]]));
const out = { meta: { built: new Date().toISOString(), source: 'CoW Formal Alliances 3.03, defence pacts (sstype 1), grouped by alliance id', coverage: [1816, 2000], carry_forward_from: 2000 }, years };
writeFileSync('public/alliances.json', JSON.stringify(out));
const n = (y) => Object.keys(years[y] ?? {}).length; console.log(`alliances.json: ${Object.keys(years).length} years; pacts 1905: ${n(1905)}, 1955: ${n(1955)}, 2000: ${n(2000)}; largest 2000: ${Math.max(...Object.values(years[2000]).map(m => m.length))} members; ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
