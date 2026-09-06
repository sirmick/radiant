// Rolling-origin backtest of the dynamic engine.
// For each as-of year: build the world from the panel as it stood, run an ensemble H years forward, and score
// P(event within H) per actor/template against what actually happened (data/events.json).
// Run: node scripts/backtest.mjs --from 1870 --to 2000 --step 10 --horizon 20 --runs 200 [--no-dyads]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap } from './lib/hist.mjs';
import { createWorld, runEnsemble } from '../src/engine/core.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = +arg('from', 1870), TO = +arg('to', 2000), STEP = +arg('step', 10), H = +arg('horizon', 20), RUNS = +arg('runs', 200);
const skipDyads = process.argv.includes('--no-dyads');
const UNIVERSE = arg('universe', 'modeled');   // modeled (67 simulated actors) | all (every state)
const contiguity = JSON.parse(readFileSync('data/contiguity.json', 'utf8')).pairs;
// ground-truth coverage per event kind: score only inside these windows (the datasets end; absence past the end is not a non-event)
const COVERAGE = { leader_exit: [1950, 2021], coup: [1950, 2021], autocratization_onset: [1900, 2024], democratization_onset: [1900, 2024], intrastate_onset: [1946, 2024], mid_force: [1816, 2001], mid_war: [1816, 2001] };

const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
const { fits } = JSON.parse(readFileSync('data/fits.json', 'utf8'));
const templates = Y('data/templates.yaml').templates;
const actors = loadActors(); const code = makeCodeMap(actors);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pacts = new Set();
for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) { if (r.sstype !== '1') continue; const y = +r.year, a = code(r.ccode1, y), b = code(r.ccode2, y); if (a && b) pacts.add(`${pairKey(a, b)}|${y}`); }

// events actually observed in (asOf, asOf+H] per key
function realized(asOf, horizon) {
  const any = new Set(); const dy = new Set();
  for (const e of events) {
    const y = Math.floor(e.year ?? e.start); if (y <= asOf || y > asOf + horizon) continue;
    const cov = COVERAGE[e.kind]; if (cov && (y < cov[0] || y > cov[1])) continue;
    if (e.actor) any.add(`${e.kind}|${e.actor}`);
    if (e.a && e.b) dy.add(`${e.kind}|${pairKey(e.a, e.b)}`);
  }
  return { any, dy };
}
const auc = (pairs) => { // [[p, y]]
  const pos = pairs.filter(x => x[1]).length, neg = pairs.length - pos; if (!pos || !neg) return null;
  const s = [...pairs].sort((a, b) => a[0] - b[0]); let sumPos = 0;
  for (let i = 0; i < s.length;) { let j = i; while (j < s.length && s[j][0] === s[i][0]) j++; const r = (i + j + 1) / 2; for (let k = i; k < j; k++) if (s[k][1]) sumPos += r; i = j; }
  return (sumPos - pos * (pos + 1) / 2) / (pos * neg);
};
const fmt = (x, d = 2) => (x == null ? '   —' : x.toFixed(d).padStart(5));

const results = []; const pooled = {};
console.log(`backtest: as-of ${FROM}..${TO} step ${STEP}, horizon ${H}y, ${RUNS} runs, universe=${UNIVERSE}${skipDyads ? ', dyads off' : ''}\n`);
for (let asOf = FROM; asOf <= TO; asOf += STEP) {
  const horizon = Math.min(H, panel.meta.y1 - asOf);
  const make = () => createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe: UNIVERSE });
  const t0 = Date.now();
  const ens = runEnsemble(make, { runs: RUNS, horizon, seed: asOf, skipDyads });
  const real = realized(asOf, horizon);
  const w0 = make(); const ids = Object.keys(w0.actors);
  const row = { asOf, horizon, actors: ids.length, ms: Date.now() - t0, templates: {} };
  for (const t of templates) {
    if (fits[t.id]?.status !== 'fitted') continue;
    const kind = t.event; const pairs = [];
    const cov = COVERAGE[kind]; if (cov && (asOf + 1 < cov[0] || asOf + 1 > cov[1])) continue;
    const covYears = cov ? Math.max(0, Math.min(asOf + horizon, cov[1]) - Math.max(asOf, cov[0] - 1)) : horizon;
    if (covYears < horizon) { /* truth truncated: compare against the ensemble's P(event within covYears) instead */ }
    if (t.unit === 'actor-year') {
      if (t.event_filter) continue; // filtered events (irregular) share a kind; scored via leader_exit for now
      // only actors whose covariates the template can evaluate at asOf (hazard computed at least once)
      for (const id of ids) { const p = ens.pAny[`${kind}|${id}`]; if (p == null && !(`${kind}|${id}` in ens.expected)) { if (!hasCoverage(w0, t, id)) continue; } pairs.push([covYears < horizon ? ens.pAnyWithin(`${kind}|${id}`, covYears) : (p ?? 0), real.any.has(`${kind}|${id}`) ? 1 : 0, id]); }
    } else if (!skipDyads) {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = `${kind}|${pairKey(ids[i], ids[j])}`; pairs.push([covYears < horizon ? ens.pAnyWithin(k, covYears) : (ens.pAnyDyad[k] ?? 0), real.dy.has(k) ? 1 : 0, k]); }
    }
    if (!pairs.length) continue;
    const brier = pairs.reduce((s, [p, y]) => s + (p - y) ** 2, 0) / pairs.length;
    const predicted = pairs.reduce((s, [p]) => s + p, 0), observed = pairs.reduce((s, [, y]) => s + y, 0);
    row.templates[t.id] = { n: pairs.length, predicted, observed, brier, auc: auc(pairs), scored_years: covYears };
    (pooled[t.id] ??= []).push(...pairs.map(([p, y]) => [p, y]));
  }
  results.push(row);
  console.log(`as-of ${asOf} (+${horizon}y, ${ids.length} actors, ${(row.ms / 1000).toFixed(1)}s)`);
  for (const [id, s] of Object.entries(row.templates)) console.log(`   ${id.padEnd(22)}${s.scored_years < horizon ? `[${s.scored_years}y]` : '     '} n=${String(s.n).padStart(5)}  exp=${s.predicted.toFixed(1).padStart(6)}  obs=${String(s.observed).padStart(4)}  ratio=${fmt(s.observed ? s.predicted / s.observed : null)}  brier=${fmt(s.brier, 3)}  auc=${fmt(s.auc)}`);
}
function hasCoverage(world, t, id) {
  const a = world.actors[id]; return t.covariates.every(c => { const v = c.var; if (c.transform === 'win5') return true; const src = (c.lag ?? (c.transform === 'lag1' ? 1 : 0)) ? a.prev : a.cur; if (v === 'milper_share') return src.milper != null && src.tpop; if (v === 'leader_exit_recent' || v === 'regime_change') return true; return src[v] != null; });
}

console.log('\npooled across as-of years:');
const summary = {};
for (const [id, pairs] of Object.entries(pooled)) {
  const brier = pairs.reduce((s, [p, y]) => s + (p - y) ** 2, 0) / pairs.length;
  const base = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length; const brierBase = base * (1 - base);
  const predicted = pairs.reduce((s, [p]) => s + p, 0), observed = pairs.reduce((s, [, y]) => s + y, 0);
  // calibration deciles
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]); const cal = [];
  for (let b = 0; b < 5; b++) { const sl = sorted.slice(Math.floor(b * sorted.length / 5), Math.floor((b + 1) * sorted.length / 5)); if (sl.length) cal.push([sl.reduce((s, x) => s + x[0], 0) / sl.length, sl.reduce((s, x) => s + x[1], 0) / sl.length]); }
  summary[id] = { n: pairs.length, predicted, observed, brier, brier_base: brierBase, skill: 1 - brier / brierBase, auc: auc(pairs), calibration: cal };
  console.log(`   ${id.padEnd(22)} n=${String(pairs.length).padStart(6)}  exp/obs=${(predicted / Math.max(1, observed)).toFixed(2).padStart(5)}  brier=${brier.toFixed(3)} (base ${brierBase.toFixed(3)}, skill ${fmt(1 - brier / brierBase)})  auc=${fmt(auc(pairs))}  cal: ${cal.map(([p, o]) => `${(p * 100).toFixed(0)}→${(o * 100).toFixed(0)}`).join(' ')}`);
}
mkdirSync('scores', { recursive: true });
const out = { meta: { run: new Date().toISOString(), from: FROM, to: TO, step: STEP, horizon: H, runs: RUNS, skipDyads }, byAsOf: results, pooled: summary };
writeFileSync(`scores/backtest-${FROM}-${TO}-h${H}-${UNIVERSE}.json`, JSON.stringify(out, null, 1));
console.log(`\nwrote scores/backtest-${FROM}-${TO}-h${H}-${UNIVERSE}.json`);
