// Capital coordinates per state -> data/capitals.json, for proximity tests that contiguity misses (an island member,
// a state across a narrow sea). Source: CoW capitals via peacesciencer (data/raw/hist/ps_cow_capitals.csv; dated, a
// state that moved its capital has several rows). Output: { meta, capitals: { id: [[from, to, lat, lng], ...] } }.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, makeCodeMap } from './lib/hist.mjs';
const cow = makeCodeMap(loadActors(), 'cow');
const idOf = (c, y) => { const m = cow(+c, y); return typeof m === 'string' ? m : m?.id ?? null; };
const parse = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const [h, ...rows] = readFileSync('data/raw/hist/ps_cow_capitals.csv', 'utf8').trim().split('\n'); const k = parse(h);
const caps = {};
for (const l of rows) { const r = Object.fromEntries(parse(l).map((v, i) => [k[i], v])); const from = +r.stdate.slice(0, 4), to = +r.enddate.slice(0, 4); const id = idOf(r.ccode, Math.round((from + to) / 2)) ?? idOf(r.ccode, to); if (!id) continue; (caps[id] ??= []).push([from, to, +(+r.lat).toFixed(3), +(+r.lng).toFixed(3)]); }
writeFileSync('data/capitals.json', JSON.stringify({ meta: { source: 'CoW capitals via peacesciencer cow_capitals' }, capitals: caps }));
console.log(`data/capitals.json: ${Object.keys(caps).length} states`);
