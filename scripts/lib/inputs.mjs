// Every input the engine reads, loaded once. scripts/run-forward.mjs, scripts/backtest.mjs and the frame pipeline
// (scripts/export-frames.mjs, scripts/analysis/replay-diff.mjs) all build worlds from the same object, so a replayed
// world and a forecast world can never be built from two different copies of the data.
import { readFileSync } from 'node:fs';
import { Y, loadActors, makeCodeMap, loadPacts } from './hist.mjs';
import { loadWaves } from '../../src/engine/waves.js';

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
  return { panel, events, fits, templates, contiguity: contiguityFile.pairs, contiguityFrom: contiguityFile.meta?.years?.[0] ?? null, corridors, territories, presence, waves, successors, pacts, pactMeta, actors };
}

/** The createWorld argument object for an as-of year, from loadEngineInputs() and an optional fits override. */
export function worldArgs(inp, asOf, { fits = inp.fits, universe = 'all' } = {}) {
  const { panel, events, templates, pacts, contiguity, contiguityFrom, presence, corridors, territories, successors, waves } = inp;
  return { panel, events, fits, templates, asOf, pacts, contiguity, universe, presence, corridors, territories, successors, contiguityFrom, waves };
}
