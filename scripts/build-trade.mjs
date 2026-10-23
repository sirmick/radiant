// Bilateral trade dependence per dyad-year -> data/trade.json (the "interdependence" leg of the Kantian peace).
// Source: CoW Dyadic Trade v3.0 (Barbieri, Keshk & Pollins), 1870-2009, via the `dyadr` R package's bundled copy
// (https://github.com/RandiLGarcia/dyadr, data/dyadic_trade.rda — correlatesofwar.org is not reachable from the build
// environment; v4.0 to 2014 is the same series extended), exported to data/raw/hist/cow_dyadic_trade_v3.csv.
// Measure (scale-free, no GDP needed): s_ij = (imports + exports between i and j) / i's total recorded trade; the
// dyad's dependence is the weak link min(s_ij, s_ji) (Oneal & Russett: the less dependent side constrains). Output:
// { meta, pairs: { "A|B": { y0, v: [dependence per year from y0, 4 decimals] } } }, pairs with any year >= 0.001.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, makeCodeMap } from './lib/hist.mjs';
const cow = makeCodeMap(loadActors(), 'cow');
const idOf = (c, y) => { const m = cow(+c, y); return typeof m === 'string' ? m : m?.id ?? null; };
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const rows = readFileSync('data/raw/hist/cow_dyadic_trade_v3.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split(',').map(Number));
const tot = new Map(); const flow = [];
for (const [c1, c2, y, f1, f2] of rows) {
  const a = idOf(c1, y), b = idOf(c2, y); if (!a || !b || a === b) continue;
  const v = Math.max(0, f1 > 0 ? f1 : 0) + Math.max(0, f2 > 0 ? f2 : 0); if (!(v > 0)) continue;
  flow.push([a, b, y, v]); for (const x of [a, b]) tot.set(`${x}|${y}`, (tot.get(`${x}|${y}`) ?? 0) + v);
}
const per = new Map();
for (const [a, b, y, v] of flow) { const d = Math.min(v / tot.get(`${a}|${y}`), v / tot.get(`${b}|${y}`)); const k = pk(a, b); (per.get(k) ?? per.set(k, new Map()).get(k)).set(y, d); }
const pairs = {};
for (const [k, m] of per) { const ys = [...m.keys()]; if (Math.max(...m.values()) < 0.001) continue; const y0 = Math.min(...ys), y1 = Math.max(...ys); pairs[k] = { y0, v: Array.from({ length: y1 - y0 + 1 }, (_, i) => +(m.get(y0 + i) ?? 0).toFixed(4)) }; }
writeFileSync('data/trade.json', JSON.stringify({ meta: { source: 'CoW Dyadic Trade v3.0 via dyadr', years: [1870, 2009], measure: 'weak-link dependence min(s_ij, s_ji), s = dyad trade / own total trade' }, pairs }));
console.log(`data/trade.json: ${Object.keys(pairs).length} pairs`);
