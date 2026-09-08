// Forward run: fitted generic templates on every state's 2025 state, 2026→2065 -> public/forecast.json
// Run: node scripts/run-forward.mjs [--runs 500] [--horizon 40] [--universe all|modeled] [--as-of 1955] [--out public/forecast-1955.json]
// With --as-of before the panel's last year the coefficients are refit on labels <= as-of (scripts/lib/fit.mjs), so a past
// forecast knows nothing after its own date. Every run also updates public/forecasts.json, the index the UI reads.
import { readFileSync, writeFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, loadPacts } from './lib/hist.mjs';
import { createWorld, runEnsemble } from '../src/engine/core.js';
import { createFitter, loadFitInputs } from './lib/fit.mjs';
import { existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('runs', 500), H = +arg('horizon', 40), UNIVERSE = arg('universe', 'all');
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
const actors = loadActors(); const code = makeCodeMap(actors);
const successors = Object.fromEntries([...actors.values()].filter(a => a.successor).map(a => [a.id, a.successor]));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
// alliances: the dated graph (scripts/lib/hist.mjs:loadPacts — CoW 3.03 to 2000, ATOP 5.1 to 2018, dated accessions
// past it, then carried), plus a year-agnostic `*` entry per edge live in its last year so a forecast past the
// graph's end still sees the pact.
const { pacts, meta: pactMeta } = loadPacts(code);
{ const last = new Map(); for (const k of pacts) { const i = k.lastIndexOf('|'); const y = +k.slice(i + 1), e = k.slice(0, i); if (y >= pactMeta.atop_last) last.set(e, y); } for (const k of last.keys()) pacts.add(`${k}|*`); }

const asOf = AS_OF ?? panel.meta.y1;   // default: the last panel year (2025)
let fitSource = 'data/fits.json (full sample)';
if (asOf < panel.meta.y1) {   // honest past forecast: coefficients from labels <= as-of only
  const fitter = createFitter(loadFitInputs());
  fits = fitter.fitAll({ maxYear: asOf, holdout: false, ablation: false }).fits;
  fitSource = `refit on labels ≤ ${asOf}`;
}
const OUT = arg('out', asOf === panel.meta.y1 ? 'public/forecast.json' : `public/forecast-${asOf}.json`);
const make = () => createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe: UNIVERSE, presence, corridors, territories, successors, contiguityFrom });
const t0 = Date.now();
const ens = runEnsemble(make, { runs: RUNS, horizon: H, seed: 2026, track: true });
const w0 = make(); const ids = Object.keys(w0.actors);
const simulated = templates.filter(t => fits[t.id]?.status === 'fitted' && t.status !== 'monitored');
// era-modern-2000-2025/data-2: what the run actually produced, not what was fitted. A template with no unit in the
// built world (or one whose engine mechanism is a candidate) fires nothing, and listing it in meta.templates told a
// reader it had been simulated.
const producedIds = new Set([...Object.keys(ens.pAny), ...Object.keys(ens.pAnyDyad)].map(k => k.slice(0, k.indexOf('|'))));
const out = { meta: { built: new Date().toISOString(), asOf, from: asOf + 1, to: asOf + H, runs: RUNS, horizon: H, universe: UNIVERSE, engine: 'generic templates only', fit_source: fitSource, templates: simulated.map(t => ({ id: t.id, label: t.label, unit: t.unit, produced: producedIds.has(t.id) || producedIds.has(t.event) })) }, actors: {}, dyads: {} };
for (const id of ids) {
  const p = {};
  for (const t of simulated) if (t.unit === 'actor-year') { const c = ens.cumulative(`${t.id}|${id}`); if (c.some(x => x > 0)) p[t.id] = c.map(x => +x.toFixed(3)); }
  out.actors[id] = { regime0: w0.actors[id].cur.regime, p, regime: ens.tracks.regime[id] ?? null, gdp_pc: ens.tracks.gdp_pc[id] ?? null, info_access: ens.tracks.info_access[id] ?? null };
}
// era-modern-2000-2025/data-2: the record layers' own probability curves, so the four record templates produce output
// a reader can check instead of a meta line claiming they ran. Keyed `${template}|${record id}`, like the actor block.
out.records = {};
for (const t of simulated) {
  if (!['chokepoint-year', 'corridor-year', 'record-year', 'territory-year'].includes(t.unit)) continue;
  const units = t.unit === 'territory-year' ? territories.map(r => r.id) : corridors.map(r => r.id);
  for (const id of units) { const c = ens.cumulative(`${t.id}|${id}`); if (c.some(x => x > 0)) (out.records[t.id] ??= {})[id] = c.map(x => +x.toFixed(3)); }
}
for (const [k, v] of Object.entries(ens.pAnyDyad)) { const [kind, pair] = k.split('|', 2); const rest = k.slice(kind.length + 1); if (v >= 0.05) (out.dyads[rest] ??= {})[kind] = { pAny: +v.toFixed(3), curve: ens.cumulative(k).map(x => +x.toFixed(3)) }; }
writeFileSync(OUT, JSON.stringify(out));
// index of available ensembles for the UI
const idxPath = 'public/forecasts.json'; const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : { ensembles: [] };
idx.ensembles = idx.ensembles.filter(e => e.asOf !== asOf); idx.ensembles.push({ asOf, file: OUT.replace(/^public\//, ''), from: asOf + 1, to: asOf + H, runs: RUNS, horizon: H, fit_source: fitSource, built: out.meta.built }); idx.ensembles.sort((a, b) => a.asOf - b.asOf);
writeFileSync(idxPath, JSON.stringify(idx));
console.log(`${OUT}: ${ids.length} actors, ${Object.keys(out.dyads).length} dyads ≥5%, ${RUNS} runs × ${H}y in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
// headline table
const row = (id) => { const a = out.actors[id]; const at = (t, k) => a.p[t] ? (a.p[t][k - 1] * 100).toFixed(0) + '%' : '—'; return `${id.padEnd(5)} regime ${a.regime0}  coup10y ${at('coup_attempt', 10).padStart(4)}  irregular10y ${at('irregular_exit', 10).padStart(4)}  civilwar10y ${at('intrastate_onset', 10).padStart(4)}  democratize10y ${at('democratize_step', 10).padStart(4)}  close10y ${at('autocratic_closure', 10).padStart(4)}  regime2045 [${(a.regime?.[19] ?? []).map(x => (x * 100).toFixed(0)).join(' ')}]`; };
for (const id of ['USA', 'CHN', 'RUS', 'IRN', 'ISR', 'TUR', 'SAU', 'IND', 'PAK', 'NGA', 'EGY', 'UKR', 'DEU', 'HUN', 'BRA', 'MLI']) if (out.actors[id]) console.log(row(id));
