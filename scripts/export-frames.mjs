// The record as a frame set (docs/plan-structure.md A3): engine replay over the viewer's window, observed through the
// frame contract, written for the viewer -> public/frames/record.json, and registered in public/frames/index.json.
//
// The forecasts are written by scripts/run-forward.mjs through the same contract; the viewer reads both through
// src/contract/read.js and never branches on which one it has.
// Run: node scripts/export-frames.mjs [--from 1870] [--to 2025]
import { writeFileSync, mkdirSync } from 'node:fs';
import { readCsv } from './lib/hist.mjs';
import { loadEngineInputs, worldArgs } from './lib/inputs.mjs';
import { recordFrames } from '../src/engine/replay.js';
import { updateIndex } from './lib/frames-index.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const inp = loadEngineInputs();
const FROM = +arg('from', 1870), TO = +arg('to', inp.panel.meta.y1);
const t0 = Date.now();
// ISO2 (emoji flags) from the countrycode list; a historical entity draws on its modern successor's polygon (`map_to`)
const iso2 = {}; try { for (const r of readCsv('data/raw/hist/codelist.csv')) if (r.iso3c && r.iso2c) iso2[r.iso3c] = r.iso2c; } catch { }
const f = recordFrames(worldArgs(inp, FROM), { from: FROM, to: TO, meta: { sources: inp.panel.meta.sources, alliance_source: inp.pactMeta.source, unions: Object.fromEntries((inp.unions ?? []).map(u => [u.id, { name: u.name, depth: u.depth, founded: u.founded, dissolved: u.dissolved ?? null }])) } });
const entities = {};
for (const id of Object.keys(f.actors)) { const a = inp.actors.get(id); entities[id] = { name: a?.name ?? id, iso2: iso2[id] ?? null, map_to: a?.owid && a.owid !== id ? a.owid : undefined, spans: a?.spans }; }
f.meta.entities = entities;
mkdirSync('public/frames', { recursive: true });
const json = JSON.stringify(f);
writeFileSync('public/frames/record.json', json);
updateIndex({ record: { file: 'frames/record.json', from: FROM, to: TO, built: f.meta.built } });
const nEv = f.events.reduce((s, e) => s + e.length, 0);
console.log(`public/frames/record.json: ${Object.keys(f.actors).length} actors × ${TO - FROM + 1} years, ${Object.keys(f.records).length} records, ${Object.keys(f.dyads.allied ?? {}).length} pact pairs, ${Object.keys(f.dyads.at_war ?? {}).length} war pairs, ${nEv} events, ${(json.length / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
