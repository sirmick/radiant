// Forward run: fitted generic templates on every state's 2025 state, 2026→2065 -> public/forecast.json
// Run: node scripts/run-forward.mjs [--runs 500] [--horizon 40] [--paths 12] [--universe all|modeled] [--as-of 1955] [--out public/forecast-1955.json]
// With --as-of before the panel's last year the coefficients are refit on labels <= as-of (scripts/lib/fit.mjs), so a past
// forecast knows nothing after its own date. Every run also updates public/forecasts.json, the index the UI reads.
import { readFileSync, writeFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, loadPacts } from './lib/hist.mjs';
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
const make = () => createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe: UNIVERSE, presence, corridors, territories, successors, contiguityFrom, waves });
const t0 = Date.now();
const ens = runEnsemble(make, { runs: RUNS, horizon: H, seed: 2026, track: true, state: true, paths: Math.min(PATHS, RUNS) });
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
// operator/occupancy (package 11): what state the world is IN each year, beside the first-occurrence curves above.
// The event block answers "when does this first fire within the horizon"; it cannot say whether the simulated war
// process is still running twenty years later, which is what the map after the seam has to paint and what the
// backtest's occupancy score grades. `state.actors[id][var][k]`, `state.dyads[pair][k]`, `state.records[id][k]`,
// k = 0-based year offset from `meta.from`.
// The dyad block is thresholded: at 300 runs x 100 years every pair that ever fires a war in any run would carry a
// 100-number array, and the file is loaded by a browser. The rule: every pair whose peak year reaches DYAD_MIN, topped up to at least DYAD_FLOOR pairs by peak so the block
// is never empty at high run counts (at 200 runs a pair at war in 3 of them peaks at 0.015 and would vanish), and
// capped at DYAD_CAP so a 300 x 100 run cannot run away. All three numbers and both counts go into meta.state.
const DYAD_MIN = 0.02, DYAD_FLOOR = 500, DYAD_CAP = 2000;
const occ = ens.occupancy;
const ranked = Object.entries(occ.dyads).map(([k, curve]) => [k, curve, Math.max(...curve)]).sort((a, b) => b[2] - a[2]);
const nKeep = Math.min(DYAD_CAP, Math.max(DYAD_FLOOR, ranked.filter(x => x[2] >= DYAD_MIN).length));
const stateDyads = {};
for (const [k, curve] of ranked.slice(0, nKeep)) stateDyads[k] = curve;
const dyadKept = Object.keys(stateDyads).length, dyadDropped = ranked.length - dyadKept;
const dyadFloorP = ranked[dyadKept - 1]?.[2] ?? null;
out.state = { actors: occ.actors, dyads: stateDyads, records: occ.records };
out.meta.state = {
  vars: [
    { id: 'at_war', unit: 'actor-year', label: 'P(at war during the year)', simulated: true },
    { id: 'intrastate', unit: 'actor-year', label: 'P(internal armed conflict, level ≥ 1)', simulated: true },
    { id: 'intrastate_war', unit: 'actor-year', label: 'P(internal conflict at war intensity, level ≥ 2)', simulated: false, note: 'the onset template has no intensity: the engine only ever writes level 1, so every year of this is a spell carried in from the as-of state. Reported so the zero is visible rather than implied.' },
    { id: 'occupied', unit: 'actor-year', label: 'P(occupied)', simulated: false, note: 'carried from the panel at as-of — occupation is data in this model, not a hazard (docs/system.md), so this is the as-of value held still, not a forecast' },
    { id: 'cinc', unit: 'actor-year', label: 'CoW capability share, p10 / p50 / p90 over runs', simulated: false, note: 'nothing in the engine rewrites cinc: this is the as-of value held still for the whole horizon, so the band is degenerate and the series is the as-of ranking, not a forecast' },
    { id: 'pol_share', unit: 'actor-year', label: 'Projection-weighted capability share, p10 / p50 / p90 over runs', simulated: true, note: 'src/engine/polarity.js — the share stepPolarity advances by each actor’s own simulated output and population growth, and the one the derived era flags read' },
    { id: 'wave_share', unit: 'actor-year', label: 'Wave-weighted capability share, p10 / p50 / p90 over runs', simulated: true, note: 'operator/capability-waves (package 12) — capability as a portfolio of dated technology waves rather than CoW\u2019s steel-energy-soldiers index (src/engine/waves.js). Two things move it forward and both are simulated: the fitted wave_attain hazard, which is why the p10-p90 band is wide where cinc\u2019s is degenerate, and each actor\u2019s own industrial mass carried by its simulated output and population growth. Whether this share REPLACES cinc in the dyadic capability ratio is a separate switch (WAVE_CAPABILITY) and is reported in meta.waves' },
    { id: 'wave_attained', unit: 'actor-year', label: 'Displacement-weighted share of live waves the actor is sovereign in, p10 / p50 / p90', simulated: true, note: 'the attainment half of wave_share on its own, before any mass discount — 1.0 means sovereign in every wave alive that year' },
    { id: 'industry_share', unit: 'actor-year', label: 'Share of world industrial output, p10 / p50 / p90 over runs', simulated: true, note: 'carried forward by each actor\u2019s own simulated output and population growth, the same two terms the projection-weighted share uses — an assumption, not a measurement, and the one the wave index\u2019s mass coefficients are an exponent on' },
    { id: 'dyad_at_war', unit: 'dyad-year', label: 'P(the pair is at war during the year)', simulated: true, threshold: DYAD_MIN, floor: DYAD_FLOOR, cap: DYAD_CAP, kept: dyadKept, lowest_kept_peak: dyadFloorP, dropped: dyadDropped, note: 'the pairs kept are the ones whose peak year reaches the threshold, topped up to `floor` by peak and capped at `cap`; every other pair had a lower peak than `lowest_kept_peak` and is omitted, not zero' },
    { id: 'record_status', unit: 'record-year', label: 'status distribution of each corridor / chokepoint / territory record', simulated: true },
  ],
  actors: Object.keys(occ.actors).length, dyads: dyadKept, records: Object.keys(occ.records).length,
};
// operator/capability-waves: what the wave layer was doing in this run, so a reader of the file never has to guess
// whether the capability substitution was on when it was produced.
out.meta.waves = {
  n: waves.length,
  capability: waveCapabilityOn(templates),
  template: templates.find(t => t.id === 'wave_attain') ? 'wave_attain' : null,
  note: 'wave_share and wave_attained in state.actors are forecasts of the wave layer. `capability` says whether the dyadic capability ratio read the wave share (WAVE_CAPABILITY=1 / capability.status: active on the template) or CINC',
};
// sample worlds: the first PATHS runs kept whole (see runEnsemble). A marginal map is a map of no run — twenty states
// at 30% each show zero coups where the ensemble expects six — so the viewer's 'sample world' mode paints one run's
// categorical states and lists that run's events, and flips between runs. `paths.runs[r].actors[id][k]` is the packed
// byte documented in the engine; `dyads[k]` the pairs at war; `records[id][k]` the status word; `events[k]` the fired
// events as { t: template or kind, u: actor | record | 'A|B' }.
// They go in their own file, loaded only when the viewer is asked for a sample world: templates and status words are
// indexed through a vocabulary so twelve 100-year worlds stay a few MB.
const PATHS_OUT = OUT.replace(/\.json$/, '-paths.json');
{
  const tv = [], ti = new Map(), sv = [], si = new Map();
  const T = (t) => { if (!ti.has(t)) { ti.set(t, tv.length); tv.push(t); } return ti.get(t); };
  const S = (w) => { if (!si.has(w)) { si.set(w, sv.length); sv.push(w); } return si.get(w); };
  const runsOut = ens.paths.map(P => ({
    actors: P.actors,
    dyads: P.dyads,
    records: Object.fromEntries(Object.entries(P.records).map(([id, arr]) => [id, arr.map(w => (w == null ? -1 : S(w)))])),
    events: P.events.map(evs => evs.map(e => [T(e.t), e.u])),
  }));
  writeFileSync(PATHS_OUT, JSON.stringify({ meta: { asOf, from: asOf + 1, horizon: H, n: runsOut.length, seed: 2026, packing: 'actors[id][k]: regime bits 0-3 (15 = unknown) | intrastate << 4 | at_war << 6 | occupied << 7; records[id][k]: index into vocab.s (-1 = no state); events[k]: [index into vocab.t, unit]', built: out.meta.built }, vocab: { t: tv, s: sv }, runs: runsOut }));
  out.paths = { n: runsOut.length, file: PATHS_OUT.replace(/^public\//, '') };
}
writeFileSync(OUT, JSON.stringify(out));
// index of available ensembles for the UI
const idxPath = 'public/forecasts.json'; const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : { ensembles: [] };
idx.ensembles = idx.ensembles.filter(e => e.asOf !== asOf); idx.ensembles.push({ asOf, file: OUT.replace(/^public\//, ''), from: asOf + 1, to: asOf + H, runs: RUNS, horizon: H, fit_source: fitSource, built: out.meta.built }); idx.ensembles.sort((a, b) => a.asOf - b.asOf);
writeFileSync(idxPath, JSON.stringify(idx));
console.log(`${OUT}: ${ids.length} actors, ${Object.keys(out.dyads).length} dyads ≥5%, ${RUNS} runs × ${H}y in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
console.log(`   state: ${out.meta.state.actors} actors, ${dyadKept} dyads kept (lowest peak ${dyadFloorP == null ? '—' : dyadFloorP.toFixed(3)}, ${dyadDropped} dropped), ${out.meta.state.records} records`);
// headline table
const row = (id) => { const a = out.actors[id]; const at = (t, k) => a.p[t] ? (a.p[t][k - 1] * 100).toFixed(0) + '%' : '—'; return `${id.padEnd(5)} regime ${a.regime0}  coup10y ${at('coup_attempt', 10).padStart(4)}  irregular10y ${at('irregular_exit', 10).padStart(4)}  civilwar10y ${at('intrastate_onset', 10).padStart(4)}  democratize10y ${at('democratize_step', 10).padStart(4)}  close10y ${at('autocratic_closure', 10).padStart(4)}  regime2045 [${(a.regime?.[19] ?? []).map(x => (x * 100).toFixed(0)).join(' ')}]`; };
for (const id of ['USA', 'CHN', 'RUS', 'IRN', 'ISR', 'TUR', 'SAU', 'IND', 'PAK', 'NGA', 'EGY', 'UKR', 'DEU', 'HUN', 'BRA', 'MLI']) if (out.actors[id]) console.log(row(id));
