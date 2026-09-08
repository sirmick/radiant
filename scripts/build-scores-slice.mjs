// Backtest scores for the UI: the latest baseline file -> public/scores.json (pooled + per as-of rows, per template).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const files = readdirSync('scores').filter(f => /^backtest-1870-2010-h20-all/.test(f));
if (!files.length) { console.log('no baseline scores file'); process.exit(0); }
const f = files.sort().at(-1); const s = JSON.parse(readFileSync(`scores/${f}`, 'utf8'));
const pooled = Object.fromEntries(Object.entries(s.pooled).map(([k, v]) => [k, { n: v.n, exp_obs: v.observed ? v.predicted / v.observed : null, skill: v.skill, auc: v.auc, brier: v.brier, brier_base: v.brier_base, calibration: v.calibration }]));
const byAsOf = s.byAsOf.map(r => ({ asOf: r.asOf, horizon: r.horizon, actors: r.actors, templates: Object.fromEntries(Object.entries(r.templates).map(([k, v]) => [k, { n: v.n, exp: v.predicted, obs: v.observed, auc: v.auc, auc_at_risk: v.auc_at_risk, brier: v.brier, n_at_risk: v.n_at_risk, underpowered: v.underpowered, scored_years: v.scored_years }])) }));
// operator/occupancy (package 11): the state score beside the event score. Pooled rows plus the per-lead-year curve
// for the two conflict variables, which is where the hot-process diagnosis is visible, and the hot flags themselves.
const occ = s.occupancy ? {
  vars: Object.fromEntries(Object.entries(s.occupancy.vars).map(([k, v]) => [k, { n: v.n, exp_obs: v.exp_obs ?? null, brier: v.brier ?? null, brier_base: v.brier_base ?? null, skill: v.skill ?? null, base_rate: v.base_rate ?? null, coverage: v.coverage ?? null, note: v.note ?? null, by_lead: ['at_war', 'intrastate', 'dyad_at_war', 'record_impaired'].includes(k) ? (v.by_lead ?? []).map(x => ({ k: x.k, exp: x.expected, obs: x.observed, brier: x.brier })) : undefined }])),
  capability_rank: s.occupancy.capability_rank,
  hot: Object.fromEntries(s.byAsOf.filter(r => r.occupancy).map(r => [r.asOf, Object.fromEntries(Object.entries(r.occupancy.hot).map(([v, h]) => [v, { leads_over: h.leads_over, first: h.first_lead_over }]))])),
} : null;
writeFileSync('public/scores.json', JSON.stringify({ meta: { file: f, run: s.meta.run, runs: s.meta.runs, horizon: s.meta.horizon, universe: s.meta.universe, refit: s.meta.refit ?? null }, pooled, byAsOf, occupancy: occ }));
console.log(`scores.json from ${f}: ${Object.keys(pooled).length} templates, ${byAsOf.length} as-of rows, occupancy ${occ ? Object.keys(occ.vars).length + ' variables' : 'absent'}`);
