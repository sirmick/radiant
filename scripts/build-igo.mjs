// Joint IGO memberships per dyad-year -> data/igo.json (the "shared institutions" leg of the Kantian peace; the EU's
// members share 60-100 IGOs, a Cold-War rival pair a handful). Source: CoW IGO v3 non-directed dyad-year counts via
// peacesciencer (data/raw/hist/ps_cow_igo_ndy.csv, 1816-2014). Output: { meta, pairs: { "A|B": [[from, to, n], ...] } }
// in model ids, spans of constant count; a pair absent from the file shares none.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, makeCodeMap } from './lib/hist.mjs';
const cow = makeCodeMap(loadActors(), 'cow');
const idOf = (c, y) => { const m = cow(+c, y); return typeof m === 'string' ? m : m?.id ?? null; };
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pairs = {}; let n = 0;
const lines = readFileSync('data/raw/hist/ps_cow_igo_ndy.csv', 'utf8').trim().split('\n').slice(1);
for (const l of lines) {
  const [c1, c2, ys, vs] = l.split(','); const y = +ys, v = +vs; if (!(v > 0)) continue;
  const a = idOf(c1, y), b = idOf(c2, y); if (!a || !b || a === b) continue; n++;
  const k = pk(a, b); const sp = (pairs[k] ??= []); const last = sp[sp.length - 1];
  if (last && last[2] === v && last[1] === y - 1) last[1] = y; else sp.push([y, y, v]);
}
for (const sp of Object.values(pairs)) sp.sort((p, q) => p[0] - q[0]);
writeFileSync('data/igo.json', JSON.stringify({ meta: { source: 'CoW IGO v3 dyadic (peacesciencer cow_igo_ndy)', years: [1816, 2014] }, pairs }));
console.log(`data/igo.json: ${Object.keys(pairs).length} pairs, ${n} dyad-years with >= 1 shared IGO`);
