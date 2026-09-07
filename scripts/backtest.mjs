// Rolling-origin backtest of the dynamic engine.
// For each as-of year: build the world from the panel as it stood, run an ensemble H years forward, and score
// P(event within H) per actor/template against what actually happened (data/events.json).
//
// Rolling-origin applies to the coefficients too (default; --no-refit for the old behaviour): each as-of year gets its
// own fit, estimated only on rows whose *label year* is at or before the as-of date, so no forecast is made with
// coefficients estimated on the events it is scored against. Every scored row carries fit_split / fit_source / leaky.
// A template with too little training data at an as-of year is reported with n=0 and a reason and is kept out of the
// pooled summary — an unfitted model is a miss, not a clean score.
// Run: node scripts/backtest.mjs --from 1870 --to 2000 --step 10 --horizon 20 --runs 200 [--no-dyads] [--no-refit]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap } from './lib/hist.mjs';
import { createFitter } from './lib/fit.mjs';
import { createWorld, runEnsemble, CORRIDOR_UNIT, corridorFirstYear, corridorTransitionYears } from '../src/engine/core.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = +arg('from', 1870), TO = +arg('to', 2000), STEP = +arg('step', 10), H = +arg('horizon', 20), RUNS = +arg('runs', 200);
const skipDyads = process.argv.includes('--no-dyads');
const REFIT = !process.argv.includes('--no-refit');
const UNIVERSE = arg('universe', 'modeled');   // modeled (67 simulated actors) | all (every state)
const contiguityFile = JSON.parse(readFileSync('data/contiguity.json', 'utf8'));
const contiguity = contiguityFile.pairs; const contiguityFrom = contiguityFile.meta?.years?.[0] ?? null;
const MIN_AT_RISK = 10;   // a template scored on fewer at-risk units than this is reported but kept out of the pooled summary
// ground-truth coverage per event kind: score only inside these windows (the datasets end; absence past the end is not a non-event)
// chokepoint/corridor: the hand-coded record layer (data/corridors.yaml) is complete only where the refine loop has
// been. Two demonstrations that it is not complete after 1945: the Bosphorus record ends at `closed` in 1939 and never
// reopens, and the Kiel record ends at `open/GBR` in 1945 and never returns to German control. Scoring a 1950-2000 row
// against that would count missing transitions as non-events. The templates are still FITTED on 1869-2026 (that is all
// the record there is, and the test in docs/escalations.md asks for >= 30 events), so the published full-sample fit
// carries a post-1945 base rate biased low — the backtest rows at as-of <= 1940 are refit on labels <= as-of and do not.
const COVERAGE = { leader_exit: [1950, 2021], coup: [1950, 2021], autocratization_onset: [1900, 2024], democratization_onset: [1900, 2024], regime_change: [1900, 2025], intrastate_onset: [1946, 2024], mid_force: [1816, 2001], mid_war: [1816, 2001], chokepoint: [1869, 1945], corridor: [1869, 1945] };
const RECORD_UNITS = new Set(Object.values(CORRIDOR_UNIT));

const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
const { fits } = JSON.parse(readFileSync('data/fits.json', 'utf8'));
const templates = Y('data/templates.yaml').templates;
const corridors = Y('data/corridors.yaml');
// era-1914-1945/corridors-7: CORRIDOR_DAMPENER=1 promotes the `corridor_stake` candidate on every template that
// declares it, for one run, without editing the data — the fitter and the engine read the same templates array, so the
// covariate is estimated and drawn on the same sample. Refit-only (the default): the published data/fits.json has no
// coefficient for it, so --no-refit with this switch is not a defined run. Stamped into meta.engine and the filename.
if (process.env.CORRIDOR_DAMPENER) for (const t of templates) { const c = (t.candidates ?? []).find(c => c.id === 'corridor_stake'); if (c) t.covariates = [...t.covariates, c]; }
const actors = loadActors(); const code = makeCodeMap(actors);
const successors = Object.fromEntries([...actors.values()].filter(a => a.successor).map(a => [a.id, a.successor]));
const Y0 = panel.meta.y0;
const liveAt = (id, y) => panel.actors[id]?.live?.[y - Y0] === 1;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pacts = new Set();
for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) { if (r.sstype !== '1') continue; const y = +r.year, a = code(r.ccode1, y), b = code(r.ccode2, y); if (a && b) pacts.add(`${pairKey(a, b)}|${y}`); }

// ---- rolling-origin coefficients: one fits object per as-of year, cached (the design matrices are built once).
const fitter = REFIT ? createFitter({ panel, events, templates, contiguity, pacts, corridors, successors }) : null;
const fitCache = new Map();
function fitsAt(asOf) {
  if (!REFIT) return fits;
  if (!fitCache.has(asOf)) fitCache.set(asOf, fitter.fitAll({ maxYear: asOf, holdout: false, ablation: false }).fits);
  return fitCache.get(asOf);
}

// events actually observed in (asOf, asOf+H] per key
function realized(asOf, horizon) {
  const any = new Set(); const dy = new Set();
  for (const e of events) {
    const y = Math.floor(e.year ?? e.start); if (y <= asOf || y > asOf + horizon) continue;
    const cov = COVERAGE[e.kind]; if (cov && (y < cov[0] || y > cov[1])) continue;
    if (e.actor) for (const t of templates) if (t.event === e.kind && (!t.event_filter || Object.entries(t.event_filter).every(([k, v]) => e[k] === v))) any.add(`${t.id}|${e.actor}`);
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
console.log(`backtest: as-of ${FROM}..${TO} step ${STEP}, horizon ${H}y, ${RUNS} runs, universe=${UNIVERSE}${skipDyads ? ', dyads off' : ''}, coefficients=${REFIT ? 'refit per as-of year' : 'full-sample (leaky)'}\n`);
for (let asOf = FROM; asOf <= TO; asOf += STEP) {
  const horizon = Math.min(H, panel.meta.y1 - asOf);
  const F = fitsAt(asOf);
  const make = () => createWorld({ panel, events, fits: F, templates, asOf, pacts, contiguity, universe: UNIVERSE, successors, contiguityFrom, corridors });
  const t0 = Date.now();
  const ens = runEnsemble(make, { runs: RUNS, horizon, seed: asOf, skipDyads });
  const real = realized(asOf, horizon);
  const w0 = make(); const ids = Object.keys(w0.actors);
  // every actor the engine can hold during the horizon, including ones born inside it (the engine introduces and retires
  // actors from the same dated system membership the panel carries). Actor-year templates were scored over the as-of
  // snapshot alone until 2026-09-06, which silently dropped every state created inside the window and its events —
  // 44 actors and 38 democratization onsets at as-of 1940, against a scored row of n=44.
  const firstLive = {};
  const windowIds = Object.keys(panel.actors).filter(id => (UNIVERSE !== 'modeled' || panel.actors[id].modeled?.[asOf - Y0]) && (() => { for (let y = asOf; y <= asOf + horizon; y++) if (liveAt(id, y)) { firstLive[id] = y; return true; } return false; })());
  const dyadIds = windowIds;
  const row = { asOf, horizon, actors: ids.length, window_actors: windowIds.length, dyad_actors: dyadIds.length, ms: Date.now() - t0, templates: {} };
  for (const t of templates) {
    if (fits[t.id]?.status !== 'fitted') continue;   // never fitted on the full sample: out of scope for scoring entirely
    const kind = t.event; const pairs = [];
    const cov = COVERAGE[kind]; if (cov && (asOf + 1 < cov[0] || asOf + 1 > cov[1])) continue;
    const covYears = cov ? Math.max(0, Math.min(asOf + horizon, cov[1]) - Math.max(asOf, cov[0] - 1)) : horizon;
    if (covYears < horizon) { /* truth truncated: compare against the ensemble's P(event within covYears) instead */ }
    // a forecaster standing at asOf may hold no fitted model for this template at all (no training year before the
    // as-of date). That is reported as a row with n=0 and a reason, and kept out of pooled — not silently dropped.
    const f = F[t.id];
    if (f?.status !== 'fitted') { row.templates[t.id] = { n: 0, reason: `no fit at as-of: ${f?.reason ?? 'unfitted'}`, fit_source: 'none (no training data at as-of)', fit_split: null, leaky: false, scored_years: covYears }; continue; }
    let excluded = 0, excludedWithEvent = 0; const excludedVars = {};
    let unborn = 0, unbornEvents = 0;   // corridor/chokepoint records whose dated history opens inside the horizon
    if (t.unit === 'actor-year') {
      if (t.status === 'monitored') continue;
      // the at-risk set is every actor live at any point in the window that passes the template's sample filter, read
      // from the panel at the first year it is live (the as-of state for actors already alive). A unit the model cannot
      // reach — no covariates, or never instantiated — is scored at p=0 and counted, not dropped: silence about the
      // units a coverage gap removed reads as a clean score.
      for (const id of windowIds) {
        const a0 = w0.actors[id];
        const regime = a0 ? a0.cur.regime : panel.actors[id].regime?.[firstLive[id] - Y0];
        if (t.sample?.regime_max != null && !(regime <= t.sample.regime_max)) continue;
        if (t.sample?.regime_min != null && !(regime >= t.sample.regime_min)) continue;
        const key = `${t.id}|${id}`; const p = ens.pAny[key];
        const y = real.any.has(key) ? 1 : 0;
        if (p == null && !(key in ens.expected)) {
          excluded++; if (y) excludedWithEvent++;
          for (const v of missingVars(w0, t, id)) excludedVars[v] = (excludedVars[v] ?? 0) + 1;
        }
        pairs.push([covYears < horizon ? ens.pAnyWithin(key, covYears) : (p ?? 0), y, id]);
      }
    } else if (RECORD_UNITS.has(t.unit)) {
      // one unit per corridor/chokepoint record that exists at as-of. A record whose dated history opens INSIDE the
      // horizon is not a unit the forecaster holds — a corridor is announced by an actor decision this model does not
      // model — so it is counted and reported (n_unborn_records / n_unborn_events) rather than scored at p=0.
      const truthEnd = Math.min(asOf + horizon, cov ? cov[1] : asOf + horizon);
      for (const r of corridors) {
        if (CORRIDOR_UNIT[r.kind] !== t.unit) continue;
        const first = corridorFirstYear(r, t.window[0]);
        const y = corridorTransitionYears(r, asOf + 1, truthEnd).size ? 1 : 0;
        if (first == null || first > asOf) { unborn++; unbornEvents += y; continue; }
        const key = `${t.id}|${r.id}`;
        pairs.push([covYears < horizon ? ens.pAnyWithin(key, covYears) : (ens.pAny[key] ?? 0), y, r.id]);
      }
    } else if (!skipDyads) {
      for (let i = 0; i < dyadIds.length; i++) for (let j = i + 1; j < dyadIds.length; j++) { const k = `${kind}|${pairKey(dyadIds[i], dyadIds[j])}`; pairs.push([covYears < horizon ? ens.pAnyWithin(k, covYears) : (ens.pAnyDyad[k] ?? 0), real.dy.has(k) ? 1 : 0, k]); }
    }
    // a template that never fires is reported, not dropped: silence about a dead template reads as a clean score
    if (!pairs.length) { row.templates[t.id] = { n: 0, reason: 'no at-risk unit with complete covariates', scored_years: covYears }; continue; }
    const brier = pairs.reduce((s, [p, y]) => s + (p - y) ** 2, 0) / pairs.length;
    const predicted = pairs.reduce((s, [p]) => s + p, 0), observed = pairs.reduce((s, [, y]) => s + y, 0);
    // the at-risk split: units the model can ever put mass on (p>0) versus the ones its relevance filter zeroes out.
    // AUC over all units mostly measures that filter; auc_at_risk is what the fitted coefficients actually do.
    const at = pairs.filter(x => x[0] > 0);
    const structuralMiss = pairs.filter(x => x[0] === 0 && x[1] === 1).length;
    const rec = { n: pairs.length, n_at_risk: at.length, n_structural_miss: structuralMiss, predicted, observed, observed_at_risk: at.reduce((s, [, y]) => s + y, 0), brier, auc: auc(pairs), auc_at_risk: auc(at), scored_years: covYears };
    // provenance of the coefficients this row was forecast with: the last label year in their training sample, where
    // they came from, and whether that sample reaches past the as-of date (leaky = the fit saw what it is scored on).
    rec.fit_split = f.trained_through ?? null; rec.fit_n = f.n; rec.fit_events = f.events;
    rec.fit_source = REFIT ? `refit on labels ≤ ${f.trained_through} (n=${f.n}, events=${f.events})` : 'full-sample fit (data/fits.json)';
    rec.leaky = rec.fit_split == null ? null : rec.fit_split > asOf;
    if (t.unit === 'actor-year') { rec.n_excluded_no_covariate = excluded; rec.n_excluded_with_event = excludedWithEvent; rec.excluded_vars = excludedVars; }
    if (RECORD_UNITS.has(t.unit)) { rec.n_unborn_records = unborn; rec.n_unborn_events = unbornEvents; }
    if (t.unit === 'actor-year' && at.length < MIN_AT_RISK) rec.underpowered = true;
    row.templates[t.id] = rec;
    if (!rec.underpowered) (pooled[t.id] ??= []).push(...pairs.map(([p, y]) => [p, y]));
  }
  results.push(row);
  console.log(`as-of ${asOf} (+${horizon}y, ${ids.length} actors, ${(row.ms / 1000).toFixed(1)}s)`);
  for (const [id, s] of Object.entries(row.templates)) {
    if (!s.n) { console.log(`   ${id.padEnd(22)}      ${s.reason}`); continue; }
    console.log(`   ${id.padEnd(22)}${s.scored_years < horizon ? `[${s.scored_years}y]` : '     '} n=${String(s.n).padStart(5)}  atrisk=${String(s.n_at_risk).padStart(5)}  exp=${s.predicted.toFixed(1).padStart(6)}  obs=${String(s.observed).padStart(4)}  miss0=${String(s.n_structural_miss).padStart(3)}${s.n_excluded_no_covariate ? `  nocov=${String(s.n_excluded_no_covariate).padStart(3)}` : ''}${s.n_unborn_records ? `  unborn=${s.n_unborn_records}/${s.n_unborn_events}` : ''}  ratio=${fmt(s.observed ? s.predicted / s.observed : null)}  brier=${fmt(s.brier, 3)}  auc=${fmt(s.auc)}  auc@risk=${fmt(s.auc_at_risk)}  fit≤${s.fit_split}${s.leaky ? ' LEAKY' : ''}${s.underpowered ? '  [underpowered, out of pooled]' : ''}`);
  }
}
/** Which of a template's covariates the world cannot supply for this actor (empty = fully covered). */
function missingVars(world, t, id) {
  const a = world.actors[id]; if (!a) return ['not_live_at_as_of'];
  return t.covariates.filter(c => !hasVar(world, a, c)).map(c => c.var);
}
function hasVar(world, a, c) {
  const v = c.var;
  if (c.transform === 'win5') return true;
  const lag = c.lag ?? (c.transform === 'lag1' ? 1 : 0); const src = lag ? a.prev : a.cur;
  if (v === 'milper_share') return src.milper != null && !!src.tpop;
  if (v === 'leader_exit_recent' || v === 'regime_change') return true;
  if (src[v] == null && c.default_outside) { const [w0, w1] = c.default_outside.window; const yy = world.year - lag; if (yy < w0 || yy > w1) return true; }
  return src[v] != null;
}
function hasCoverage(world, t, id) {
  const a = world.actors[id]; if (!a) return false;
  return t.covariates.every(c => {
    const v = c.var; if (c.transform === 'win5') return true;
    const lag = c.lag ?? (c.transform === 'lag1' ? 1 : 0); const src = lag ? a.prev : a.cur;
    if (v === 'milper_share') return src.milper != null && src.tpop;
    if (v === 'leader_exit_recent' || v === 'regime_change') return true;
    if (src[v] == null && c.default_outside) { const [w0, w1] = c.default_outside.window; const yy = world.year - lag; if (yy < w0 || yy > w1) return true; }
    return src[v] != null;
  });
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
// An ablation run is not the published run: the engine switches go into meta and into the filename, so a sweep can
// never overwrite scores/backtest-<window>.json with a number that was produced under a different engine.
const ENGINE_ENV = ['ENGINE_ABLATE', 'RIVALRY_DECAY', 'COALITION_ON', 'COALITION_P_JOIN', 'COALITION_RELEVANCE', 'CORRIDOR_DAMPENER']
  .filter(k => process.env[k] != null && process.env[k] !== '').map(k => `${k}=${process.env[k]}`);
const slug = ENGINE_ENV.length ? '-abl-' + ENGINE_ENV.join(',').replace(/[^A-Za-z0-9.=,_-]/g, '').toLowerCase().replace(/[=,]/g, '_') : '';
const out = { meta: { run: new Date().toISOString(), from: FROM, to: TO, step: STEP, horizon: H, runs: RUNS, skipDyads, refit: REFIT, fit_source: REFIT ? 'rolling-origin: refit per as-of year on labels ≤ as-of' : 'full-sample data/fits.json (leaks past the as-of date)', engine: { env: ENGINE_ENV, mechanisms: Object.fromEntries(templates.filter(t => t.unit === 'dyad-year').flatMap(t => [['duration', t.duration?.status], ['coalition', t.coalition?.status]].filter(([, v]) => v))) } }, byAsOf: results, pooled: summary };
const file = `scores/backtest-${FROM}-${TO}-h${H}-${UNIVERSE}${REFIT ? '' : '-norefit'}${slug}.json`;
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\nwrote ${file}`);
