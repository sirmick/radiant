// The structural gate (docs/plan-structure.md, Gate): does the world's STRUCTURE change in simulation as often as it
// changed in the record? Event scores reward freezing — less variance, better Brier — so every phase-C step is judged
// on these rates beside them.
//
// For each origin: an ensemble whose every run is kept whole (frame-contract sample worlds), and the record's frames
// over the same years. Counted the same way on both, per 100 world-years (world-level) or per 100 actor-years:
//   polarity transitions · top-pole changes · great-power entries / exits · nuclear acquisitions · state births / deaths ·
//   defence-pact formations / dissolutions (pairs)
// Run: node scripts/analysis/structure.mjs [--from 1900 --to 1990 --step 30 --horizon 30 --runs 30] [--no-refit] [--json f]
import { writeFileSync } from 'node:fs';
import { loadEngineInputs, worldArgs } from '../lib/inputs.mjs';
import { createFitter } from '../lib/fit.mjs';
import { createWorld, runEnsemble } from '../../src/engine/core.js';
import { recordFrames } from '../../src/engine/replay.js';
import { rawAt, liveAt } from '../../src/contract/read.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = +arg('from', 1900), TO = +arg('to', 1990), STEP = +arg('step', 30), H = +arg('horizon', 30), RUNS = +arg('runs', 30);
const REFIT = !process.argv.includes('--no-refit');
const inp = loadEngineInputs();
const VARS = ['world:polarity', 'world:hegemon', 'actor:live', 'actor:great_power', 'actor:nuclear', 'dyad:allied'];
const fitter = REFIT ? createFitter({ ...inp }) : null;
const record = recordFrames(worldArgs(inp, FROM + 1), { from: FROM + 1, to: Math.min(TO + H, inp.panel.meta.y1), vars: VARS });

/** Structural change counts in one frame set over [y0, y1]. */
function counts(f, y0, y1) {
  const c = { world_years: 0, actor_years: 0, polarity: 0, hegemon: 0, gp_entry: 0, gp_exit: 0, nuclear: 0, birth: 0, death: 0, pact_form: 0, pact_end: 0, pairs_years: 0 };
  const ids = Object.keys(f.actors ?? {});
  const allied = f.dyads?.allied ?? {};
  for (let y = y0 + 1; y <= y1; y++) {
    c.world_years++;
    const p0 = rawAt(f, 'world', '_', 'polarity', y - 1), p1 = rawAt(f, 'world', '_', 'polarity', y);
    if (p0 != null && p1 != null && p0 !== p1) c.polarity++;
    const h0 = rawAt(f, 'world', '_', 'hegemon', y - 1), h1 = rawAt(f, 'world', '_', 'hegemon', y);
    if (h0 != null && h1 != null && h0 !== h1) c.hegemon++;
    for (const id of ids) {
      const l0 = liveAt(f, id, y - 1) > 0, l1 = liveAt(f, id, y) > 0;
      if (!l0 && l1) c.birth++; if (l0 && !l1) c.death++;
      if (!l0 || !l1) continue;
      c.actor_years++;
      const g0 = rawAt(f, 'actor', id, 'great_power', y - 1), g1 = rawAt(f, 'actor', id, 'great_power', y);
      if (g0 != null && g1 != null) { if (!g0 && g1) c.gp_entry++; if (g0 && !g1) c.gp_exit++; }
      if (!rawAt(f, 'actor', id, 'nuclear', y - 1) && rawAt(f, 'actor', id, 'nuclear', y)) c.nuclear++;
    }
    for (const arr of Object.values(allied)) { if (typeof arr === 'number') continue; const k = y - f.meta.from; const a0 = arr[k - 1], a1 = arr[k]; if (a0 == null || a1 == null) continue; if (!a0 && a1) c.pact_form++; if (a0 && !a1) c.pact_end++; }
  }
  return c;
}
const add = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v; return a; };
const sim = {}, obs = {};
for (let asOf = FROM; asOf <= TO; asOf += STEP) {
  const horizon = Math.min(H, inp.panel.meta.y1 - asOf);
  const fits = REFIT ? fitter.fitAll({ maxYear: asOf, holdout: false, ablation: false }).fits : inp.fits;
  const make = () => createWorld(worldArgs(inp, asOf, { fits }));
  const t0 = Date.now();
  // the as-of year itself is the first offset of each kept run, so a change in the first forecast year is counted
  const ens = runEnsemble(make, { runs: RUNS, horizon, seed: asOf, frames: { from: asOf + 1, pathVars: VARS }, framePaths: RUNS, frameVars: VARS });
  const s = {}; for (const P of ens.frames.paths) add(s, counts(P, asOf + 1, asOf + horizon));
  const o = counts(record, asOf + 1, asOf + horizon);
  add(sim, s); add(obs, o);
  console.log(`as-of ${asOf} +${horizon}y (${RUNS} runs, ${((Date.now() - t0) / 1000).toFixed(0)}s): sim per run polarity ${(s.polarity / RUNS).toFixed(2)} hegemon ${(s.hegemon / RUNS).toFixed(2)} gp ${(s.gp_entry / RUNS).toFixed(2)}/${(s.gp_exit / RUNS).toFixed(2)} pacts ${(s.pact_form / RUNS).toFixed(1)}/${(s.pact_end / RUNS).toFixed(1)} births ${(s.birth / RUNS).toFixed(1)}  |  record polarity ${o.polarity} hegemon ${o.hegemon} gp ${o.gp_entry}/${o.gp_exit} pacts ${o.pact_form}/${o.pact_end} births ${o.birth}`);
}
const per = (c, k, d) => (c[d] ? (100 * c[k]) / c[d] : null);
const rows = [['polarity', 'world_years'], ['hegemon', 'world_years'], ['gp_entry', 'world_years'], ['gp_exit', 'world_years'], ['nuclear', 'world_years'], ['birth', 'world_years'], ['death', 'world_years'], ['pact_form', 'world_years'], ['pact_end', 'world_years']];
const out = {};
console.log('\nper 100 world-years (simulated vs record, same origins and horizons):');
for (const [k, d] of rows) {
  const s = per(sim, k, d), o = per(obs, k, d); const ratio = o ? s / o : null;
  const pass = o ? ratio >= 0.5 && ratio <= 2 : s === 0;
  out[k] = { simulated: s == null ? null : +s.toFixed(3), record: o == null ? null : +o.toFixed(3), ratio: ratio == null ? null : +ratio.toFixed(2), within_factor_2: pass };
  console.log(`   ${k.padEnd(10)} sim ${s == null ? '—' : s.toFixed(2).padStart(7)}   record ${o == null ? '—' : o.toFixed(2).padStart(7)}   ratio ${ratio == null ? '—' : ratio.toFixed(2).padStart(5)}  ${pass ? 'ok' : 'OUT'}`);
}
const json = arg('json', null);
if (json) writeFileSync(json, JSON.stringify({ meta: { run: new Date().toISOString(), from: FROM, to: TO, step: STEP, horizon: H, runs: RUNS, refit: REFIT, env: process.env.ENGINE_ABLATE ?? null }, rates: out, simulated: sim, record: obs }, null, 1));
