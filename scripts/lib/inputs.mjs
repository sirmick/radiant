// Every input the engine reads, loaded once. scripts/run-forward.mjs, scripts/backtest.mjs and the frame pipeline
// (scripts/export-frames.mjs, scripts/analysis/replay-diff.mjs) all build worlds from the same object, so a replayed
// world and a forecast world can never be built from two different copies of the data.
import { readFileSync } from 'node:fs';
import { Y, loadActors, makeCodeMap, loadPacts } from './hist.mjs';
import { loadWaves } from '../../src/engine/waves.js';
import { feature } from 'topojson-client';
import { geoArea } from 'd3';

export function loadEngineInputs() {
  const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
  const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
  const { fits } = JSON.parse(readFileSync('data/fits.json', 'utf8'));
  const templates = Y('data/templates.yaml').templates;
  const contiguityFile = JSON.parse(readFileSync('data/contiguity.json', 'utf8'));
  const corridors = Y('data/corridors.yaml');
  const territories = Y('data/territories.yaml');
  const presence = Y('data/presence.yaml');
  const waves = loadWaves(Y('data/waves.yaml')).waves;
  const actors = loadActors(); const code = makeCodeMap(actors);
  const successors = Object.fromEntries([...actors.values()].filter(a => a.successor).map(a => [a.id, a.successor]));
  const { pacts, meta: pactMeta } = loadPacts(code);
  // No year-agnostic `*` edges: loadPacts already carries the last measured graph to 2026, so every as-of year reads
  // the graph in force at that year. The `*` entries scripts/run-forward.mjs used to add were merged into EVERY as-of
  // year by alliedAt, so a forecast from 1955 started with the 2018 pact graph (1,816 pairs against the record's 402).
  const { polygons, polygonOf } = loadPolygons(actors);
  const holders = loadHolders();
  const warOutcomes = loadWarOutcomes(); const igo = loadIgo(); const trade = loadTrade(); const unions = loadUnions(); const capitals = loadCapitals();
  return { capitals, unions, trade, igo, warOutcomes, holders, polygons, polygonOf, panel, events, fits, templates, contiguity: contiguityFile.pairs, contiguityFrom: contiguityFile.meta?.years?.[0] ?? null, corridors, territories, presence, waves, successors, pacts, pactMeta, actors };
}

/** C5: the map's territories (today's admin-0 polygons, with their area) and the polygon each historical entity draws on. */
export function loadPolygons(actors) {
  const topo = JSON.parse(readFileSync('public/geo.topo.json', 'utf8'));
  // a territory with no permanent population, or under 10,000 people by the World Bank's latest count, is not at risk
  // of statehood: Antarctica becoming a state was 35% by 2050 in the first 50-year run (data/uninhabited.yaml)
  const empty = new Set((() => { try { return Y('data/uninhabited.yaml').map(x => x.id); } catch { return []; } })());
  const pop = (() => { try { const m = {}; for (const l of readFileSync('data/raw/hist/wb_population.csv', 'utf8').trim().split('\n').slice(1)) { const f = l.split(','); const n = f.length; const c = f[n - 3], y = +f[n - 2], v = +f[n - 1]; if (!m[c] || y > m[c][0]) m[c] = [y, v]; } return m; } catch { return {}; } })();
  const polygons = feature(topo, topo.objects.countries).features.filter(f => !empty.has(f.id) && !(pop[f.id] && pop[f.id][1] < 10000)).map(f => ({ id: f.id, area: geoArea(f), name: (f.properties?.name ?? '').replace(/\u0000/g, '') }));
  const polygonOf = Object.fromEntries([...actors.values()].filter(a => a.owid && a.owid !== a.id).map(a => [a.id, a.owid]));
  return { polygons, polygonOf };
}

/** C5 breakup: which state holds each map territory, by year (data/holders.json, scripts/build-holders.mjs). */
/** War outcomes per belligerent (data/war_outcomes.json, scripts/build-war-outcomes.mjs). */
/** Shared IGO memberships per dyad-year (data/igo.json, scripts/build-igo.mjs). */
/** Bilateral trade dependence per dyad-year (data/trade.json, scripts/build-trade.mjs). */
/** Supranational unions, dated membership (data/unions.yaml). */
/** Capital coordinates (data/capitals.json, scripts/build-capitals.mjs). */
export function loadCapitals() { try { return JSON.parse(readFileSync('data/capitals.json', 'utf8')); } catch { return null; } }
export function loadUnions() { try { return Y('data/unions.yaml').unions; } catch { return null; } }
export function loadTrade() { try { return JSON.parse(readFileSync('data/trade.json', 'utf8')); } catch { return null; } }
export function loadIgo() { try { return JSON.parse(readFileSync('data/igo.json', 'utf8')); } catch { return null; } }
export function loadWarOutcomes() { try { return JSON.parse(readFileSync('data/war_outcomes.json', 'utf8')).wars; } catch { return null; } }
export function loadHolders() { try { return JSON.parse(readFileSync('data/holders.json', 'utf8')).holders; } catch { return null; } }

/** The createWorld argument object for an as-of year, from loadEngineInputs() and an optional fits override. */
export function worldArgs(inp, asOf, { fits = inp.fits, universe = 'all' } = {}) {
  const { panel, events, templates, pacts, contiguity, contiguityFrom, presence, corridors, territories, successors, waves, polygons, polygonOf, holders, warOutcomes, igo, trade, unions, capitals } = inp;
  return { panel, events, fits, templates, asOf, pacts, contiguity, universe, presence, corridors, territories, successors, contiguityFrom, waves, polygons, polygonOf, holders, warOutcomes, igo, trade, unions, capitals };
}
