// data/presence.yaml -> public/presence.json for the map (records with geometry; the UI filters by year).
import { writeFileSync } from 'node:fs';
import { Y, loadActors } from './lib/hist.mjs';
const recs = Y('data/presence.yaml'); const actors = loadActors();
const POWERS = ['USA', 'GBR', 'FRA', 'RUS', 'CHN', 'JPN', 'DEU', 'ITA', 'TUR', 'IND'];
const out = { meta: { built: new Date().toISOString(), powers: POWERS, source: 'data/presence.yaml (hand-coded, mostly estimate dates; operator entries unverified)' }, records: recs.map((r, i) => ({ id: i, actor: r.actor, host: r.host, name: r.name, kind: r.kind, level: r.level, from: r.from, to: r.to ?? null, geometry: r.geometry, source: r.source, operator: /operator/.test(r.source ?? '') })) };
writeFileSync('public/presence.json', JSON.stringify(out));
const byPower = {}; for (const r of recs) byPower[r.actor] = (byPower[r.actor] ?? 0) + 1;
const missingHost = [...new Set(recs.map(r => r.host).filter(h => !h.startsWith('sea:') && !actors.has(h)))];
console.log(`presence.json: ${recs.length} records; by power ${JSON.stringify(byPower)}; hosts not in the actor universe (map-only): ${missingHost.join(' ')}`);
