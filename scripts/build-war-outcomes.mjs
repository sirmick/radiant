// Inter-state war outcomes per belligerent -> data/war_outcomes.json (the engine's war-outcome fit reads it).
// Source: CoW inter-state wars v4 via peacesciencer (data/raw/hist/ps_cow_war_inter.csv, state-dyad-year rows with the
// state's side and final outcome: 1 won, 2 lost, 3 compromise, 4 transformed, 6 stalemate, 8 changed sides).
// Output: { meta, wars: [{ war, actor, side, start, end, outcome }] }, one row per (war, state), model ids.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, makeCodeMap } from './lib/hist.mjs';
const cow = makeCodeMap(loadActors(), 'cow');
const idOf = (c, y) => { const m = cow(+c, y); return typeof m === 'string' ? m : m?.id ?? null; };
const [h, ...rows] = readFileSync('data/raw/hist/ps_cow_war_inter.csv', 'utf8').trim().split('\n'); const k = h.split(',');
const by = new Map();
for (const l of rows) { const r = Object.fromEntries(l.split(',').map((v, i) => [k[i], v])); const key = `${r.warnum}|${r.ccode1}`; const y = +r.year; const o = by.get(key) ?? by.set(key, { war: +r.warnum, c: r.ccode1, side: +r.sidea1, start: y, end: y, outcome: +r.outcome1 }).get(key); o.start = Math.min(o.start, y); o.end = Math.max(o.end, y); }
const wars = []; for (const o of by.values()) { const actor = idOf(o.c, o.start) ?? idOf(o.c, o.end); if (actor) wars.push({ war: o.war, actor, side: o.side, start: o.start, end: o.end, outcome: o.outcome }); }
writeFileSync('data/war_outcomes.json', JSON.stringify({ meta: { source: 'CoW inter-state wars v4 (peacesciencer cow_war_inter)', outcome: { 1: 'won', 2: 'lost', 3: 'compromise', 4: 'transformed', 6: 'stalemate', 8: 'changed sides' } }, wars }));
console.log(`data/war_outcomes.json: ${wars.length} belligerent-wars, ${new Set(wars.map(w => w.war)).size} wars`);
