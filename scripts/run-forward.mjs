// Forward run: fitted generic templates on every state's as-of state -> public/frames/fc-<asOf>.json (+ -paths.json)
// Run: node scripts/run-forward.mjs [--runs 500] [--horizon 40] [--paths 12] [--universe all|modeled] [--as-of 1955] [--out public/forecast-1955.json]
// With --as-of before the panel's last year the coefficients are refit on labels <= as-of (scripts/lib/fit.mjs), so a past
// forecast knows nothing after its own date. Every run also updates public/frames/index.json, the index the UI reads.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ENSEMBLE_VARS } from '../src/contract/vars.js';
import { updateIndex } from './lib/frames-index.mjs';
import { readCsv, Y, loadActors, makeCodeMap, loadPacts } from './lib/hist.mjs';
import { loadPolygons } from './lib/inputs.mjs';
import { createWorld, runEnsemble, waveCapabilityOn } from '../src/engine/core.js';
import { createFitter, loadFitInputs } from './lib/fit.mjs';
import { loadWaves } from '../src/engine/waves.js';
import { existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('runs', 500), H = +arg('horizon', 40), UNIVERSE = arg('universe', 'all'), PATHS = +arg('paths', 12);
const AS_OF = arg('as-of', null) != null ? +arg('as-of') : null;
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
let { fits } = JSON.parse(readFileSync('data/fits.json', 'utf8'));
const templates = Y('data/templates.yaml').templates;
const contiguityFile = JSON.parse(readFileSync('data/contiguity.json', 'utf8'));
const contiguity = contiguityFile.pairs; const contiguityFrom = contiguityFile.meta?.years?.[0] ?? null;
const presence = Y('data/presence.yaml');   // operator/presence: the dyadic patron term needs the layer here too
// era-modern-2000-2025/data-2: the record layers and the successor map. scripts/backtest.mjs passed all four to
// createWorld and this file passed none, so every published forecast was built with an empty corridor layer, an empty
// territory layer and no successor chain: 0 corridors and 0 territories against the backtest's 61 and 96 at the same
// as-of year. The corridor, chokepoint, reopen and contest hazards iterated over empty arrays, corridorStakeFor
// returned 0 for every dyad, and meta.templates still advertised all four record templates as simulated.
const corridors = Y('data/corridors.yaml');
const territories = Y('data/territories.yaml');
const waves = loadWaves(Y('data/waves.yaml')).waves;   // operator/capability-waves (package 12)
const actors = loadActors(); const code = makeCodeMap(actors);
const { polygons, polygonOf } = loadPolygons(actors);   // C5: the territory pool births are drawn over
const successors = Object.fromEntries([...actors.values()].filter(a => a.successor).map(a => [a.id, a.successor]));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
// alliances: the dated graph (scripts/lib/hist.mjs:loadPacts — CoW 3.03 to 2000, ATOP 5.1 to 2018, dated accessions
// past it, carried to 2026). No year-agnostic `*` entries: createWorld merged them into every as-of year, so a past
// forecast started with the 2018 graph (see scripts/lib/inputs.mjs).
const { pacts, meta: pactMeta } = loadPacts(code);

const asOf = AS_OF ?? panel.meta.y1;   // default: the last panel year (2025)
let fitSource = 'data/fits.json (full sample)';
if (asOf < panel.meta.y1) {   // honest past forecast: coefficients from labels <= as-of only
  const fitter = createFitter(loadFitInputs());
  fits = fitter.fitAll({ maxYear: asOf, holdout: false, ablation: false }).fits;
  fitSource = `refit on labels ≤ ${asOf}`;
}
const make = () => createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe: UNIVERSE, presence, corridors, territories, successors, contiguityFrom, waves, polygons, polygonOf });
const t0 = Date.now();
const PATH_VARS = ['actor:live', 'actor:regime', 'actor:at_war', 'actor:intrastate', 'actor:occupied', 'actor:great_power', 'dyad:at_war', 'record:status', 'world:polarity', 'world:hegemon'];
const ens = runEnsemble(make, { runs: RUNS, horizon: H, seed: 2026, frames: { from: asOf + 1, pathVars: PATH_VARS, meta: { source: `fc-${asOf}`, kind: 'ensemble', asOf } }, framePaths: Math.min(PATHS, RUNS), frameVars: ENSEMBLE_VARS() });
const w0 = make(); const ids = Object.keys(w0.actors);
const simulated = templates.filter(t => fits[t.id]?.status === 'fitted' && t.status !== 'monitored');
// era-modern-2000-2025/data-2: what the run actually produced, not what was fitted. A template with no unit in the
// built world (or one whose engine mechanism is a candidate) fires nothing, and listing it in meta.templates told a
// reader it had been simulated.
const producedIds = new Set([...Object.keys(ens.pAny), ...Object.keys(ens.pAnyDyad)].map(k => k.slice(0, k.indexOf('|'))));
// The published ensemble is the frame contract (src/contract/frames.js) — the same encoding the record is written in
// (scripts/export-frames.mjs) — plus the one thing only an ensemble has: `hazards`, the first-occurrence curves
// P(first event within k years) per template and unit, which the viewer's forecast variables and hazard field read.
const out = ens.frames.ensemble;
Object.assign(out.meta, { built: new Date().toISOString(), asOf, runs: RUNS, horizon: H, universe: UNIVERSE, engine: 'generic templates only', fit_source: fitSource, templates: simulated.map(t => ({ id: t.id, label: t.label, unit: t.unit, event: t.event, produced: producedIds.has(t.id) || producedIds.has(t.event) })) });
const r3 = (x) => +x.toFixed(3);
out.hazards = { actor: {}, dyad: {}, record: {} };
for (const id of ids) for (const t of simulated) if (t.unit === 'actor-year') { const c = ens.cumulative(`${t.id}|${id}`); if (c.some(x => x > 0)) (out.hazards.actor[id] ??= {})[t.id] = c.map(r3); }
for (const t of simulated) {
  if (!['chokepoint-year', 'corridor-year', 'record-year', 'territory-year'].includes(t.unit)) continue;
  const units = t.unit === 'territory-year' ? territories.map(r => r.id) : corridors.map(r => r.id);
  for (const id of units) { const c = ens.cumulative(`${t.id}|${id}`); if (c.some(x => x > 0)) (out.hazards.record[t.id] ??= {})[id] = c.map(r3); }
}
// dyad hazards for the dyad TEMPLATES only: the structural events (pact_form, pact_end) are state changes the frames
// already carry, and as hazards they would list every pair that formed a pact in any run
const DYAD_KINDS = new Set(simulated.filter(t => t.unit === 'dyad-year').map(t => t.event));
for (const [k, v] of Object.entries(ens.pAnyDyad)) { const kind = k.slice(0, k.indexOf('|')); if (!DYAD_KINDS.has(kind)) continue; const pair = k.slice(kind.length + 1); if (v >= 0.05) (out.hazards.dyad[pair] ??= {})[kind] = { pAny: r3(v), curve: ens.cumulative(k).map(r3) }; }
// The dyadic at-war block is thresholded: at 300 runs x 100 years every pair that ever fires a war in any run would
// carry a 100-number array, and the file is loaded by a browser. Every pair whose peak year reaches DYAD_MIN, topped up
// to at least DYAD_FLOOR pairs by peak so the block is never empty at high run counts, capped at DYAD_CAP. A pair left
// out had a lower peak than `lowest_kept_peak` and is omitted, not zero; meta.dyads says so.
const DYAD_MIN = 0.02, DYAD_FLOOR = 500, DYAD_CAP = 2000;
const ranked = Object.entries(out.dyads.at_war ?? {}).map(([k, c]) => [k, c, typeof c === 'number' ? c : Math.max(...c)]).sort((a, b) => b[2] - a[2]);
const nKeep = Math.min(DYAD_CAP, Math.max(DYAD_FLOOR, ranked.filter(x => x[2] >= DYAD_MIN).length));
out.dyads.at_war = Object.fromEntries(ranked.slice(0, nKeep).map(([k, c]) => [k, c]));
out.meta.dyads = { at_war: { threshold: DYAD_MIN, floor: DYAD_FLOOR, cap: DYAD_CAP, kept: Math.min(nKeep, ranked.length), dropped: Math.max(0, ranked.length - nKeep), lowest_kept_peak: ranked[Math.min(nKeep, ranked.length) - 1]?.[2] ?? null } };
// the pact graph moves (C3), so every pair allied in any run of any year carries a series. Kept: pairs at or above
// ALLY_MIN in some year — the viewer draws a pact at P >= 0.5, so a pair that never reaches it carries nothing it reads
// — and their count goes into meta.dyads
const ALLY_MIN = 0.5;
{ const all = Object.entries(out.dyads.allied ?? {}); const keep = all.filter(([, c]) => (typeof c === 'number' ? c : Math.max(...c)) >= ALLY_MIN); out.dyads.allied = Object.fromEntries(keep); out.meta.dyads.allied = { threshold: ALLY_MIN, kept: keep.length, dropped: all.length - keep.length }; }
out.meta.waves = { n: waves.length, capability: waveCapabilityOn(templates), template: templates.find(t => t.id === 'wave_attain') ? 'wave_attain' : null };
mkdirSync('public/frames', { recursive: true });
const OUT = arg('out', `public/frames/fc-${asOf}.json`);
const PATHS_OUT = OUT.replace(/\.json$/, '-paths.json');
// sample worlds: the first PATHS runs kept whole, each a frame set in the record's own shape (runs = 1), so a viewer
// reads one world exactly the way it reads history. Their own file, loaded only when a sample world is asked for.
// a world's pact formations and dissolutions are left out of its event list: the graph is state the frames carry, and as
// events they are hundreds a year once decolonisation multiplies the candidate pairs
for (const P of ens.frames.paths) P.events = P.events.map(evs => evs.filter(e => e.k !== 'pact_form' && e.k !== 'pact_end'));
writeFileSync(PATHS_OUT, JSON.stringify({ meta: { asOf, from: asOf + 1, years: H, n: ens.frames.paths.length, seed: 2026, built: out.meta.built, events_omitted: ['pact_form', 'pact_end'] }, runs: ens.frames.paths }));
out.meta.paths = { n: ens.frames.paths.length, file: PATHS_OUT.replace(/^public\//, '') };
const json = JSON.stringify(out);
writeFileSync(OUT, json);
// only a published ensemble is registered: a test run written elsewhere with --out must not replace the origin's entry
if (OUT.startsWith('public/frames/')) updateIndex({ ensemble: { asOf, file: OUT.replace(/^public\//, ''), paths: out.meta.paths.file, from: asOf + 1, to: asOf + H, runs: RUNS, horizon: H, fit_source: fitSource, built: out.meta.built } });
console.log(`${OUT}: ${ids.length} actors, ${Object.keys(out.hazards.dyad).length} dyads ≥5%, ${RUNS} runs × ${H}y in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(json.length / 1024).toFixed(0)} KB; ${out.meta.dyads.at_war.kept} war pairs kept`);
// headline table
const row = (id) => { const p = out.hazards.actor[id] ?? {}; const at = (t, k) => p[t] ? (p[t][k - 1] * 100).toFixed(0) + '%' : '—'; const rg = out.actors[id]?.regime?.[19]; return `${id.padEnd(5)} regime ${w0.actors[id].cur.regime}  coup10y ${at('coup_attempt', 10).padStart(4)}  irregular10y ${at('irregular_exit', 10).padStart(4)}  civilwar10y ${at('intrastate_onset', 10).padStart(4)}  democratize10y ${at('democratize_step', 10).padStart(4)}  close10y ${at('autocratic_closure', 10).padStart(4)}  regime+20 [${(rg ?? []).map(x => (x * 100).toFixed(0)).join(' ')}]`; };
for (const id of ['USA', 'CHN', 'RUS', 'IRN', 'ISR', 'TUR', 'SAU', 'IND', 'PAK', 'NGA', 'EGY', 'UKR', 'DEU', 'HUN', 'BRA', 'MLI']) if (out.actors[id] && w0.actors[id]) console.log(row(id));
