// Every input the engine reads, loaded once. scripts/run-forward.mjs, scripts/backtest.mjs and the frame pipeline
// (scripts/export-frames.mjs, scripts/analysis/replay-diff.mjs) all build worlds from the same object, so a replayed
// world and a forecast world can never be built from two different copies of the data.
import { readFileSync } from 'node:fs';
import { Y, loadActors, makeCodeMap, loadPacts } from './hist.mjs';
import { loadWaves } from '../../src/engine/waves.js';

export function loadEngineInputs({ carryPacts = true } = {}) {
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
  // a forecast past the graph's last measured year still sees the pacts live in that year (run-forward's `*` entries)
  if (carryPacts) { const last = new Map(); for (const k of pacts) { const i = k.lastIndexOf('|'); const y = +k.slice(i + 1), e = k.slice(0, i); if (y >= pactMeta.atop_last) last.set(e, y); } for (const k of last.keys()) pacts.add(`${k}|*`); }
  return { panel, events, fits, templates, contiguity: contiguityFile.pairs, contiguityFrom: contiguityFile.meta?.years?.[0] ?? null, corridors, territories, presence, waves, successors, pacts, pactMeta, actors };
}

/** The createWorld argument object for an as-of year, from loadEngineInputs() and an optional fits override. */
export function worldArgs(inp, asOf, { fits = inp.fits, universe = 'all' } = {}) {
  const { panel, events, templates, pacts, contiguity, contiguityFrom, presence, corridors, territories, successors, waves } = inp;
  return { panel, events, fits, templates, asOf, pacts, contiguity, universe, presence, corridors, territories, successors, contiguityFrom, waves };
}
