// Compact historical slice of data/panel.json for the map: a few variables, all actors, 1870–2025, rounded.
// Actor ids are model ids; the map matches them to Natural Earth ISO3 directly, and via `map_to` for historical
// entities that draw on a modern successor's polygon (PRUSSIA→DEU etc.) when the successor is not itself live.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, readCsv } from './lib/hist.mjs';
const p = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = 1870, y0i = Y0 - p.meta.y0;
const VARS = {
  regime: { label: 'Regime (V-Dem RoW)', unit: '0 closed … 3 liberal', format: '.0f', categorical: [0, 1, 2, 3], dp: 0 },
  polyarchy: { label: 'Electoral democracy index', unit: 'V-Dem', format: '.2f', dp: 3 },
  libdem: { label: 'Liberal democracy index', unit: 'V-Dem', format: '.2f', dp: 3 },
  gdp_pc: { label: 'GDP per capita (Maddison)', unit: '2011 intl $', format: '.3s', log: true, dp: 0 },
  population: { label: 'Population', unit: 'persons', format: '.3s', log: true, dp: 0 },
  cinc: { label: 'Capability share (CINC)', unit: 'share of world', format: '.2%', log: true, dp: 5 },
  irst: { label: 'Iron & steel production', unit: 'kt', format: '.3s', log: true, dp: 0 },
  energy_twh: { label: 'Primary energy', unit: 'TWh', format: '.3s', log: true, dp: 1 },
  info_access: { label: 'Information access', unit: '0–1', format: '.0%', dp: 3 },
  at_war: { label: 'At war (interstate)', unit: 'flag', format: '.0f', categorical: [0, 1], dp: 0 },
  intrastate: { label: 'Internal armed conflict', unit: 'UCDP intensity', format: '.0f', categorical: [0, 1, 2], dp: 0 },
  great_power: { label: 'Major power (CoW)', unit: 'flag', format: '.0f', categorical: [0, 1], dp: 0 },
  leader_age: { label: 'Leader age', unit: 'years', format: '.0f', dp: 0 },
  leader_tenure: { label: 'Leader tenure', unit: 'years', format: '.1f', dp: 1 },
  infant_mortality: { label: 'Infant mortality', unit: 'per 1000', format: '.0f', dp: 1 },
  urban_share: { label: 'Urban share', unit: '%', format: '.0f', dp: 1 },
};
const actors = loadActors();
// ISO2 (for emoji flags) from the countrycode list; historical entities map to the successor's flag or none
const iso2 = {}; try { for (const r of readCsv('data/raw/hist/codelist.csv')) if (r.iso3c && r.iso2c) iso2[r.iso3c] = r.iso2c; } catch { }
const out = { meta: { built: new Date().toISOString(), y0: Y0, y1: p.meta.y1, sources: Object.fromEntries(Object.keys(VARS).map(v => [v, p.sources[v] ?? 'derived'])) }, vars: VARS, actors: {} };
for (const [id, vars] of Object.entries(p.actors)) {
  const a = actors.get(id); const live = vars.live?.slice(y0i);
  if (!live?.some(x => x)) continue;
  const rec = { live: live.map(x => (x ? 1 : 0)), map_to: a?.owid && a.owid !== id ? a.owid : undefined, name: a?.name ?? id, spans: a?.spans, iso2: iso2[id] ?? null };
  for (const [v, spec] of Object.entries(VARS)) { const arr = vars[v]; if (!arr) continue; rec[v] = arr.slice(y0i).map(x => (x == null ? null : +(+x).toFixed(spec.dp))); }
  // last year each variable was actually observed for this actor: the map paints carried-forward values (capability
  // after the source ends, above all) and has to be able to say "as of <year>" rather than show them as current.
  rec.last_observed = {};
  for (const v of Object.keys(VARS)) { const arr = vars[v]; if (!arr) continue; for (let i = arr.length - 1; i >= y0i; i--) if (arr[i] != null) { rec.last_observed[v] = p.meta.y0 + i; break; } }
  out.actors[id] = rec;
}
writeFileSync('public/history.json', JSON.stringify(out));
console.log(`history.json: ${Object.keys(out.actors).length} actors × ${p.meta.y1 - Y0 + 1} years × ${Object.keys(VARS).length} vars, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
