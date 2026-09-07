// Year-indexed event feed for the UI: data/events.json -> public/news.json (kind, year, actors, one-line text, links).
// Drops the ~3k dyadic mid_force duplicates below use-of-force? No — keeps them but merges by dispute number.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors } from './lib/hist.mjs';
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
const actors = loadActors(); const name = (id) => actors.get(id)?.name ?? id;
const byYear = {};
const push = (y, e) => ((byYear[y] ??= []).push(e));
const REG = ['closed autocracy', 'electoral autocracy', 'electoral democracy', 'liberal democracy'];
const disputes = new Map();   // dispnum -> { year, a: Set, b: Set, war }
for (const e of events) {
  const y = Math.floor(e.year ?? e.start); if (!Number.isFinite(y)) continue;
  switch (e.kind) {
    case 'leader_exit': push(y, { k: 'leader', y: e.year, a: [e.actor], t: `${name(e.actor)}: leader leaves office${e.irregular ? ' (irregular)' : ''}${e.tenure_years ? ` after ${e.tenure_years}y` : ''}`, s: e.source }); break;
    case 'coup': push(y, { k: 'coup', y: e.year, a: [e.actor], t: `${name(e.actor)}: coup ${e.success ? 'succeeds' : 'attempt fails'}`, s: e.source }); break;
    case 'regime_change': push(y, { k: 'regime', y: e.year, a: [e.actor], t: `${name(e.actor)}: ${REG[e.from]} → ${REG[e.to]}`, s: e.source }); break;
    case 'autocratization_onset': push(y, { k: 'regime', y: e.year, a: [e.actor], t: `${name(e.actor)}: autocratization episode begins`, s: e.source }); break;
    case 'democratization_onset': push(y, { k: 'regime', y: e.year, a: [e.actor], t: `${name(e.actor)}: democratization episode begins`, s: e.source }); break;
    case 'intrastate_onset': push(y, { k: 'conflict', y: e.year, a: [e.actor], t: `${name(e.actor)}: internal armed conflict${e.territory ? ` over ${e.territory}` : ''}${e.intensity === 2 ? ' (war)' : ''}`, s: e.source }); break;
    case 'interstate_onset': push(y, { k: 'conflict', y: e.year, a: [e.a, e.b], sides: [[e.a], [e.b]], t: `${name(e.a)} – ${name(e.b)}: interstate conflict${e.intensity === 2 ? ' (war)' : ''}`, s: e.source }); break;
    case 'mid_force': case 'mid_war': { const d = disputes.get(e.dispnum) ?? disputes.set(e.dispnum, { year: e.year, a: new Set(), b: new Set(), war: false }).get(e.dispnum); d.a.add(e.a); d.b.add(e.b); if (e.kind === 'mid_war') d.war = true; break; }
    case 'war': push(y, { k: 'war', y: e.start, a: e.sides.flat(), sides: e.sides, end: e.end ?? null, t: `War: ${e.id.replace(/_/g, ' ')} — ${e.sides[0].map(name).join(', ')} vs ${e.sides[1].map(name).join(', ')}${e.end ? ` (to ${Math.floor(e.end)})` : ''}`, s: e.source, n: e.notes }); break;
    case 'chokepoint': push(y, { k: 'corridor', y: e.year, c: e.id, t: `${e.id.replace(/_/g, ' ')}: ${e.status}${e.controller ? ` (${name(e.controller)})` : ''}`, s: e.source, n: e.notes }); break;
    case 'corridor': push(y, { k: 'corridor', y: e.year, c: e.id, t: `${e.id.replace(/_/g, ' ')}: ${e.status}${e.controller ? ` (${name(e.controller)})` : ''}`, s: e.source, n: e.notes }); break;
    case 'territory': push(y, { k: 'territory', y: e.year, tr: e.id, a: e.controller ? [e.controller] : [], t: `${e.id.replace(/_/g, ' ')}: ${e.status ?? ''}${e.controller ? ` → ${name(e.controller)}` : ''}`, s: e.source, n: e.notes }); break;
    case 'nuclear': push(y, { k: 'nuclear', y: e.year, a: [e.actor], t: `${name(e.actor)}: nuclear status → ${e.status}`, s: e.source, n: e.notes }); break;
    case 'capability': push(y, { k: 'capability', y: e.year, a: [e.actor, e.target].filter(Boolean), t: `${name(e.actor)} ${e.event}${e.target ? ` ${name(e.target)}` : ''} in ${e.wave}`, s: e.source, n: e.notes }); break;
    case 'alliance': push(y, { k: 'alliance', y: e.year, a: e.members ?? [], t: `Alliance: ${e.id.replace(/_/g, ' ')}${e.members ? ` — ${e.members.map(name).join(', ')}` : ''}`, s: e.source, n: e.notes }); break;
    case 'economic': push(y, { k: 'economic', y: e.year, a: [], t: e.id.replace(/_/g, ' '), s: e.source, n: e.notes }); break;
    case 'regime': push(y, { k: 'regime', y: e.year, a: [e.actor], t: `${name(e.actor)}: ${e.event.replace(/_/g, ' ')}`, s: e.source, n: e.notes }); break;
    case 'leader': push(y, { k: 'leader', y: e.year, a: [e.actor], t: `${name(e.actor)}: ${e.event.replace(/_/g, ' ')}`, s: e.source, n: e.notes }); break;
  }
}
for (const e of events) if (e.kind === 'war' && e.end != null) { for (let y = Math.floor(e.start) + 1; y <= Math.floor(e.end); y++) push(y, { k: 'war', y, a: e.sides.flat(), sides: e.sides, ongoing: true, t: `War continues: ${e.id.replace(/_/g, ' ')}`, s: e.source }); }
for (const [num, d] of disputes) { const y = Math.floor(d.year); push(y, { k: d.war ? 'war' : 'dispute', y: d.year, a: [...d.a, ...d.b], sides: [[...d.a], [...d.b]], t: `${d.war ? 'Militarized dispute (war level)' : 'Militarized dispute, use of force'}: ${[...d.a].map(name).join(', ')} vs ${[...d.b].map(name).join(', ')}`, s: 'CoW MID 3.02' }); }
const ORDER = { war: 0, nuclear: 1, territory: 2, corridor: 3, alliance: 4, coup: 5, regime: 6, conflict: 7, dispute: 8, leader: 9, capability: 10, economic: 11 };
for (const y of Object.keys(byYear)) byYear[y].sort((p, q) => (ORDER[p.k] - ORDER[q.k]) || (p.y - q.y));
const out = { meta: { built: new Date().toISOString(), kinds: Object.keys(ORDER) }, years: byYear };
writeFileSync('public/news.json', JSON.stringify(out));
const n = Object.values(byYear).reduce((s, a) => s + a.length, 0);
console.log(`news.json: ${n} items over ${Object.keys(byYear).length} years, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB; 1905: ${byYear[1905]?.length ?? 0} items, 1956: ${byYear[1956]?.length ?? 0}, 2022: ${byYear[2022]?.length ?? 0}`);
