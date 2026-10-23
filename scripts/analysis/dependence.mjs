// D3 (docs/plan-structure.md): are a state's events in one year dependent beyond what the fitted hazards already say?
// The engine draws each actor-year template independently given the state. For each pair of templates, over the
// actor-years both are fitted on: observed same-year co-occurrences against the expectation under conditional
// independence, sum_i p_a(i) * p_b(i), with each template's in-sample fitted probability. A ratio well above 1 is
// dependence the engine does not carry (a coup and a civil war that come together); ~1 means the state variables
// already carry it. Nested templates (irregular_exit inside leader_exit) are skipped: the engine draws those jointly.
// Run: node scripts/analysis/dependence.mjs
import { createFitter, loadFitInputs, fitLogistic, predict } from '../lib/fit.mjs';
const fitter = createFitter(loadFitInputs());
const IDS = ['coup_attempt', 'irregular_exit', 'intrastate_onset', 'autocratic_closure', 'democratize_step', 'leader_exit'];
const NESTED = new Set(['irregular_exit|leader_exit', 'leader_exit|irregular_exit']);
const P = {};
for (const id of IDS) {
  const t = fitter.templates.find(x => x.id === id); const rows = fitter.rowsFor(t);
  const stats = {}; const cols = fitter.encode(t, rows, stats); const X = rows.map(r => [1, ...cols.map(c => c.get(r))]);
  const p = predict(X, fitLogistic(X, rows.map(r => r.y), [0, ...cols.map(c => c.prior)], 2));
  P[id] = new Map(rows.map((r, i) => [`${r.unit}|${r.year}`, [p[i], r.y]]));
}
console.log('pair'.padEnd(42), 'n'.padStart(6), 'observed'.padStart(9), 'expected'.padStart(9), 'ratio');
const out = [];
for (let i = 0; i < IDS.length; i++) for (let j = i + 1; j < IDS.length; j++) {
  const a = IDS[i], b = IDS[j]; if (NESTED.has(`${a}|${b}`)) continue;
  let n = 0, obs = 0, exp = 0;
  for (const [k, [pa, ya]] of P[a]) { const B = P[b].get(k); if (!B) continue; n++; exp += pa * B[0]; if (ya && B[1]) obs++; }
  out.push({ a, b, n, obs, exp }); console.log(`${a} + ${b}`.padEnd(42), String(n).padStart(6), String(obs).padStart(9), exp.toFixed(1).padStart(9), (obs / Math.max(1e-9, exp)).toFixed(2));
}

// ---- the question that matters: does the SIMULATION co-occur as the record does? Same windows, same kinds, per 1000
// actor-years, from whole simulated runs (the frame contract's sample worlds) and from the record's own event log.
const { loadEngineInputs, worldArgs } = await import('../lib/inputs.mjs');
const { createWorld, runEnsemble } = await import('../../src/engine/core.js');
const inp = loadEngineInputs();
const KIND = (e) => (e.k === 'coup' ? 'coup' : e.k === 'leader_exit' ? (e.irregular ? 'irregular_exit' : 'leader_exit') : e.k === 'intrastate_onset' ? 'intrastate_onset' : e.k === 'regime_change' ? (e.to > e.from ? 'regime_up' : 'regime_down') : null);
const PAIRS = [['coup', 'irregular_exit'], ['coup', 'intrastate_onset'], ['coup', 'regime_down'], ['irregular_exit', 'intrastate_onset'], ['intrastate_onset', 'regime_down'], ['regime_up', 'leader_exit']];
const tally = (evsByYear, liveYears) => { const c = Object.fromEntries(PAIRS.map(p => [p.join('+'), 0])); for (const evs of evsByYear) { const by = new Map(); for (const e of evs) { const k = KIND(e); if (!k || !e.actor) continue; (by.get(e.actor) ?? by.set(e.actor, new Set()).get(e.actor)).add(k); if (k === 'irregular_exit') by.get(e.actor).add('leader_exit'); } for (const ks of by.values()) for (const [a, b] of PAIRS) if (ks.has(a) && ks.has(b)) c[`${a}+${b}`]++; } return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, (1000 * v) / liveYears])); };
const sim = {}, rec = {}; let simAY = 0, recAY = 0;
const byYear = new Map(); for (const e of inp.events) { const y = Math.floor(e.year ?? e.start); (byYear.get(y) ?? byYear.set(y, []).get(y)).push({ ...e, k: e.kind }); }
for (const asOf of [1950, 1970, 1990]) {
  const H = 20; const make = () => createWorld(worldArgs(inp, asOf));
  const ens = runEnsemble(make, { runs: 20, horizon: H, seed: asOf, frames: { from: asOf + 1, pathVars: ['actor:live'] }, framePaths: 20, frameVars: ['actor:live'] });
  for (const P of ens.frames.paths) { const ay = Object.values(P.actors).reduce((s, a) => s + (a.live ? a.live.reduce((t, x) => t + x, 0) : H), 0); simAY += ay; const t = tally(P.events, 1); for (const [k, v] of Object.entries(t)) sim[k] = (sim[k] ?? 0) + v / 1000; }
  const evs = []; let ay = 0; for (let y = asOf + 1; y <= asOf + H; y++) { evs.push(byYear.get(y) ?? []); ay += Object.values(inp.panel.actors).filter(a => a.live?.[y - inp.panel.meta.y0]).length; } recAY += ay;
  const t = tally(evs, 1); for (const [k, v] of Object.entries(t)) rec[k] = (rec[k] ?? 0) + v / 1000;
}
console.log('\nsame-year co-occurrence per 1000 actor-years, 1951-2010 (3 origins x 20 y; simulation 20 runs each):');
for (const k of Object.keys(sim)) console.log(`   ${k.padEnd(32)} simulated ${(1000 * sim[k] / simAY).toFixed(2).padStart(6)}   record ${(1000 * rec[k] / recAY).toFixed(2).padStart(6)}   ratio ${((sim[k] / simAY) / Math.max(1e-12, rec[k] / recAY)).toFixed(2)}`);
