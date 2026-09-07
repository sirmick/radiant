// Defence-pact edges per year for the map: CoW Formal Alliances 3.03 dyadic (1816–2000) -> public/alliances.json
// { meta, years: { "1905": [["GBR","JPN"], ...] } } keyed by model actor ids; 2001+ carries the 2000 graph forward, flagged.
import { writeFileSync } from 'node:fs';
import { readCsv, loadActors, makeCodeMap } from './lib/hist.mjs';
const actors = loadActors(); const code = makeCodeMap(actors);
const byYear = {};
for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) {
  if (r.sstype !== '1') continue;
  const y = +r.year; const a = code(r.ccode1, y), b = code(r.ccode2, y); if (!a || !b || a === b) continue;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`; (byYear[y] ??= new Set()).add(k);
}
const years = {}; for (const [y, s] of Object.entries(byYear)) years[y] = [...s].map(k => k.split('|'));
const out = { meta: { built: new Date().toISOString(), source: 'CoW Formal Alliances 3.03, defence pacts (sstype 1)', coverage: [1816, 2000], carry_forward_from: 2000 }, years };
writeFileSync('public/alliances.json', JSON.stringify(out));
console.log(`alliances.json: ${Object.keys(years).length} years; 1905: ${years[1905]?.length} pacts, 1955: ${years[1955]?.length}, 2000: ${years[2000]?.length}, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
