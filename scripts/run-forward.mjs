// Forward run: fitted generic templates on every state's 2025 state, 2026→2065 -> public/forecast.json
// Run: node scripts/run-forward.mjs [--runs 500] [--horizon 40] [--universe all|modeled] [--as-of 1955] [--out public/forecast-1955.json]
// With --as-of before the panel's last year the coefficients are refit on labels <= as-of (scripts/lib/fit.mjs), so a past
// forecast knows nothing after its own date. Every run also updates public/forecasts.json, the index the UI reads.
import { readFileSync, writeFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap } from './lib/hist.mjs';
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
const contiguity = JSON.parse(readFileSync('data/contiguity.json', 'utf8')).pairs;
const actors = loadActors(); const code = makeCodeMap(actors);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
// alliances: carry the last observed (2000) pacts forward as `*` (year-agnostic) entries
const pacts = new Set();
{ const last = new Map(); for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) { if (r.sstype !== '1') continue; const y = +r.year, a = code(r.ccode1, y), b = code(r.ccode2, y); if (!a || !b) continue; const k = pairKey(a, b); pacts.add(`${k}|${y}`); if (y >= 2000) last.set(k, y); } for (const k of last.keys()) pacts.add(`${k}|*`); }

const asOf = AS_OF ?? panel.meta.y1;   // default: the last panel year (2025)
let fitSource = 'data/fits.json (full sample)';
if (asOf < panel.meta.y1) {   // honest past forecast: coefficients from labels <= as-of only
  const fitter = createFitter(loadFitInputs());
  fits = fitter.fitAll({ maxYear: asOf, holdout: false, ablation: false }).fits;
  fitSource = `refit on labels ≤ ${asOf}`;
}
const OUT = arg('out', asOf === panel.meta.y1 ? 'public/forecast.json' : `public/forecast-${asOf}.json`);
const make = () => createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe: UNIVERSE });
const t0 = Date.now();
const ens = runEnsemble(make, { runs: RUNS, horizon: H, seed: 2026, track: true });
const w0 = make(); const ids = Object.keys(w0.actors);
const simulated = templates.filter(t => fits[t.id]?.status === 'fitted' && t.status !== 'monitored');
const out = { meta: { built: new Date().toISOString(), asOf, from: asOf + 1, to: asOf + H, runs: RUNS, horizon: H, universe: UNIVERSE, engine: 'generic templates only', fit_source: fitSource, templates: simulated.map(t => ({ id: t.id, label: t.label, unit: t.unit })) }, actors: {}, dyads: {} };
for (const id of ids) {
  const p = {};
  for (const t of simulated) if (t.unit === 'actor-year') { const c = ens.cumulative(`${t.id}|${id}`); if (c.some(x => x > 0)) p[t.id] = c.map(x => +x.toFixed(3)); }
  out.actors[id] = { regime0: w0.actors[id].cur.regime, p, regime: ens.tracks.regime[id] ?? null, gdp_pc: ens.tracks.gdp_pc[id] ?? null, info_access: ens.tracks.info_access[id] ?? null };
}
for (const [k, v] of Object.entries(ens.pAnyDyad)) { const [kind, pair] = k.split('|', 2); const rest = k.slice(kind.length + 1); if (v >= 0.05) (out.dyads[rest] ??= {})[kind] = { pAny: +v.toFixed(3), curve: ens.cumulative(k).map(x => +x.toFixed(3)) }; }
writeFileSync(OUT, JSON.stringify(out));
// index of available ensembles for the UI
const idxPath = 'public/forecasts.json'; const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : { ensembles: [] };
idx.ensembles = idx.ensembles.filter(e => e.asOf !== asOf); idx.ensembles.push({ asOf, file: OUT.replace(/^public\//, ''), from: asOf + 1, to: asOf + H, runs: RUNS, horizon: H, fit_source: fitSource, built: out.meta.built }); idx.ensembles.sort((a, b) => a.asOf - b.asOf);
writeFileSync(idxPath, JSON.stringify(idx));
console.log(`${OUT}: ${ids.length} actors, ${Object.keys(out.dyads).length} dyads ≥5%, ${RUNS} runs × ${H}y in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
// headline table
const row = (id) => { const a = out.actors[id]; const at = (t, k) => a.p[t] ? (a.p[t][k - 1] * 100).toFixed(0) + '%' : '—'; return `${id.padEnd(5)} regime ${a.regime0}  coup10y ${at('coup_attempt', 10).padStart(4)}  irregular10y ${at('irregular_exit', 10).padStart(4)}  civilwar10y ${at('intrastate_onset', 10).padStart(4)}  democratize10y ${at('democratize_step', 10).padStart(4)}  close10y ${at('autocratic_closure', 10).padStart(4)}  erode10y ${at('liberal_erosion', 10).padStart(4)}  regime2045 [${(a.regime?.[19] ?? []).map(x => (x * 100).toFixed(0)).join(' ')}]`; };
for (const id of ['USA', 'CHN', 'RUS', 'IRN', 'ISR', 'TUR', 'SAU', 'IND', 'PAK', 'NGA', 'EGY', 'UKR', 'DEU', 'HUN', 'BRA', 'MLI']) if (out.actors[id]) console.log(row(id));
