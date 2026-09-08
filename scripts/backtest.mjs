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
import { createWorld, runEnsemble, CORRIDOR_UNIT, corridorFirstYear, corridorTransitionYears, corridorStateAt } from '../src/engine/core.js';
import { IMPAIRED, RESOLVED, SPELL_UNITS, territoryFirstYear, territoryStateAt, endYears } from '../src/engine/termination.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = +arg('from', 1870), TO = +arg('to', 2000), STEP = +arg('step', 10), H = +arg('horizon', 20), RUNS = +arg('runs', 200);
const skipDyads = process.argv.includes('--no-dyads');
const REFIT = !process.argv.includes('--no-refit');
const UNIVERSE = arg('universe', 'modeled');   // modeled (67 simulated actors) | all (every state)
const contiguityFile = JSON.parse(readFileSync('data/contiguity.json', 'utf8'));
const contiguity = contiguityFile.pairs; const contiguityFrom = contiguityFile.meta?.years?.[0] ?? null;
const MIN_AT_RISK = 10;   // a template scored on fewer at-risk units than this is reported but kept out of the pooled summary
const MIN_EPV = 3;        // events per estimated covariate: below it the fit cannot identify its own terms and the row is reported, not pooled
// ground-truth coverage per event kind: score only inside these windows (the datasets end; absence past the end is not a non-event)
// chokepoint/corridor: the hand-coded record layer (data/corridors.yaml) is complete only where the refine loop has
// been. Two demonstrations that it is not complete after 1945: the Bosphorus record ends at `closed` in 1939 and never
// reopens, and the Kiel record ends at `open/GBR` in 1945 and never returns to German control. Scoring a 1950-2000 row
// against that would count missing transitions as non-events. The templates are still FITTED on 1869-2026 (that is all
// the record there is, and the test in docs/escalations.md asks for >= 30 events), so the published full-sample fit
// carries a post-1945 base rate biased low — the backtest rows at as-of <= 1940 are refit on labels <= as-of and do not.
// regime_change opens at 1816, not 1900 (era-1870-1914-r2/data-3): its source is V-Dem Regimes of the World via OWID,
// which runs 1789-2025, and data/events.json carries 179 regime_change events dated before 1900. The ERT-derived
// onset kinds keep their own 1900 start — that is where the Episodes of Regime Transformation data begins.
// operator/termination adds four ending kinds. Their windows are their sources': CoW MID endyear stops in 2001,
// UCDP in 2024, and the two record layers are complete only where the refine loop has been — the reopen window is the
// same 1869-1945 the status templates are scored in, and the territory histories run 1871-2025.
const COVERAGE = { leader_exit: [1950, 2021], coup: [1950, 2021], autocratization_onset: [1900, 2024], democratization_onset: [1900, 2024], regime_change: [1816, 2025], intrastate_onset: [1946, 2024], mid_force: [1816, 2001], mid_war: [1816, 2001], chokepoint: [1869, 1945], corridor: [1869, 1945], war_end: [1816, 2001], intrastate_end: [1946, 2024], record_reopen: [1869, 1945], territory_settle: [1871, 2025] };
const RECORD_UNITS = new Set(Object.values(CORRIDOR_UNIT));

const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
const { fits } = JSON.parse(readFileSync('data/fits.json', 'utf8'));
const templates = Y('data/templates.yaml').templates;
const corridors = Y('data/corridors.yaml');
const territories = Y('data/territories.yaml');
const presence = Y('data/presence.yaml');
// era-1914-1945/corridors-7: CORRIDOR_DAMPENER=1 promotes the `corridor_stake` candidate on every template that
// declares it, for one run, without editing the data — the fitter and the engine read the same templates array, so the
// covariate is estimated and drawn on the same sample. Refit-only (the default): the published data/fits.json has no
// coefficient for it, so --no-refit with this switch is not a defined run. Stamped into meta.engine and the filename.
// whether the engine will run war spells this run — the same two conditions src/engine/core.js:warDurationOn reads
const warSpellsOn = !(process.env.ENGINE_ABLATE ?? '').includes('war_duration')
  && (!!process.env.WAR_DURATION_ON || templates.some(t => t.unit === 'dyad-year' && t.duration?.status === 'active'));
if (process.env.CORRIDOR_DAMPENER) for (const t of templates) { const c = (t.candidates ?? []).find(c => c.id === 'corridor_stake'); if (c) t.covariates = [...t.covariates, c]; }
const actors = loadActors(); const code = makeCodeMap(actors);
const successors = Object.fromEntries([...actors.values()].filter(a => a.successor).map(a => [a.id, a.successor]));
const Y0 = panel.meta.y0;
const liveAt = (id, y) => panel.actors[id]?.live?.[y - Y0] === 1;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pacts = new Set();
for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) { if (r.sstype !== '1') continue; const y = +r.year, a = code(r.ccode1, y), b = code(r.ccode2, y); if (a && b) pacts.add(`${pairKey(a, b)}|${y}`); }

// ---- rolling-origin coefficients: one fits object per as-of year, cached (the design matrices are built once).
const fitter = REFIT ? createFitter({ panel, events, templates, contiguity, contiguityFrom, pacts, corridors, territories, successors, presence }) : null;
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
  const make = () => createWorld({ panel, events, fits: F, templates, asOf, pacts, contiguity, universe: UNIVERSE, successors, contiguityFrom, corridors, territories, presence });
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
    // operator/termination: a spell template whose engine mechanism is a candidate fires nothing, so scoring it would
    // report a dead template as a perfectly calibrated zero. Reported with n=0 and the reason instead.
    if (t.spell === 'war' && !warSpellsOn) { row.templates[t.id] = { n: 0, reason: 'the war-spell mechanism is a candidate (data/templates.yaml, dyadic war template `duration.status`); the engine fires no war_end. Run with WAR_DURATION_ON=1 to score it', scored_years: covYears }; continue; }
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
    } else if (t.unit === SPELL_UNITS.record) {
      // operator/termination: one unit per corridor/chokepoint record of the kinds this template covers that exists at
      // as-of. Truth is the record's own reopen label — it opens a year impaired and closes it in service — read from
      // the same endYears() the fitter labels rows with, not from corridorTransitionYears (a record that changes hands
      // while it stays closed is a transition and is not a reopening).
      const truthEnd = Math.min(asOf + horizon, cov ? cov[1] : asOf + horizon);
      const kinds = new Set(t.kinds ?? []);
      for (const r of corridors) {
        if (!kinds.has(r.kind)) continue;
        const first = corridorFirstYear(r, t.window[0]);
        const st = (yy) => corridorStateAt(r, yy)?.status ?? null;
        const y = endYears({ open: (yy) => st(yy - 1), close: st, inSpell: (x) => IMPAIRED.has(x), from: asOf + 1, to: truthEnd }).size ? 1 : 0;
        if (first == null || first > asOf) { unborn++; unbornEvents += y; continue; }
        const key = `${t.id}|${r.id}`;
        pairs.push([covYears < horizon ? ens.pAnyWithin(key, covYears) : (ens.pAny[key] ?? 0), y, r.id]);
      }
    } else if (t.unit === SPELL_UNITS.territory) {
      const truthEnd = Math.min(asOf + horizon, cov ? cov[1] : asOf + horizon);
      for (const r of territories) {
        const first = territoryFirstYear(r);
        const st = (yy) => territoryStateAt(r, yy)?.status ?? null;
        const y = endYears({ open: (yy) => st(yy - 1), close: st, inSpell: (x) => !RESOLVED.has(x), from: asOf + 1, to: truthEnd }).size ? 1 : 0;
        if (first == null || first > asOf) { unborn++; unbornEvents += y; continue; }
        const key = `${t.id}|${r.id}`;
        pairs.push([covYears < horizon ? ens.pAnyWithin(key, covYears) : (ens.pAny[key] ?? 0), y, r.id]);
      }
    } else if (!skipDyads) {
      for (let i = 0; i < dyadIds.length; i++) for (let j = i + 1; j < dyadIds.length; j++) { const k = `${kind}|${pairKey(dyadIds[i], dyadIds[j])}`; pairs.push([covYears < horizon ? ens.pAnyWithin(k, covYears) : (ens.pAnyDyad[k] ?? 0), real.dy.has(k) ? 1 : 0, k]); }
      // era-1914-1945-r2/data-4 (b): the dyad sample drops an actor entirely for a null covariate, and until now
      // nothing reported it — unlike the actor-year templates, which carry n_excluded_no_covariate, the dyad rows
      // simply did not exist, so "unreachable because a covariate is null" was counted as "unreachable because of the
      // relevance gate" inside n_structural_miss. Counted here over the actors live at any point in the window whose
      // cinc or regime is null at the year they are first live: the same filter scripts/lib/fit.mjs:dyadFeatureRows
      // and src/engine/core.js:dyadHazards apply.
      for (const id of windowIds) {
        const a0 = w0.actors[id]; const y0 = firstLive[id];
        const cinc = a0 ? a0.cur.cinc : panel.actors[id].cinc?.[y0 - Y0];
        const regime = a0 ? a0.cur.regime : panel.actors[id].regime?.[y0 - Y0];
        if (cinc != null && regime != null) continue;
        excluded++;
        if (cinc == null) excludedVars.cinc = (excludedVars.cinc ?? 0) + 1;
        if (regime == null) excludedVars.regime = (excludedVars.regime ?? 0) + 1;
        for (const k of real.dy) if (k.startsWith(`${kind}|`) && k.slice(kind.length + 1).split('|').includes(id)) { excludedWithEvent++; break; }
      }
    }
    // a template that never fires is reported, not dropped: silence about a dead template reads as a clean score
    if (!pairs.length) { row.templates[t.id] = { n: 0, reason: 'no at-risk unit with complete covariates', scored_years: covYears }; continue; }
    // era-1870-1914-r2/engine-8: a spell template's units are the spells its ONSET template opens, so when the onset
    // has no fit at this as-of year the spell row is a forecast of nothing dressed as a calibrated zero (war_end read
    // n_at_risk 0, predicted 0.00, auc 0.5 against 14 observed endings). Report the upstream reason instead.
    if (t.spell && pairs.every(x => x[0] === 0)) {
      const up = templates.find(x => x.unit === 'dyad-year' && x.event === `mid_${t.spell}`) ?? templates.find(x => x.event === `${t.spell}_onset`);
      if (up && F[up.id]?.status !== 'fitted') { row.templates[t.id] = { n: 0, reason: `no unit at risk: the upstream onset template \`${up.id}\` has no fit at as-of (${F[up.id]?.reason ?? 'unfitted'}), so the engine opens no spell for this template to end`, upstream: up.id, observed: pairs.reduce((s, x) => s + x[1], 0), scored_years: covYears }; continue; }
    }
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
    if (t.unit === 'actor-year' || t.unit === 'dyad-year') { rec.n_excluded_no_covariate = excluded; rec.n_excluded_with_event = excludedWithEvent; rec.excluded_vars = excludedVars; }
    if (RECORD_UNITS.has(t.unit) || t.unit === SPELL_UNITS.record || t.unit === SPELL_UNITS.territory) { rec.n_unborn_records = unborn; rec.n_unborn_events = unbornEvents; }
    // the pooled guard applies to EVERY unit type (era-1870-1914-r2/statistics-5). It used to test `t.unit ===
    // 'actor-year'`, so half the record rows entered pooled at n_at_risk < 10 — chokepoint_status was pooled at 7
    // at-risk units in four separate as-of years and the headline read n=36.
    rec.epv = f.epv ?? null; rec.n_degenerate = f.degenerate?.length ?? 0; rec.degenerate = f.degenerate ?? [];
    if (at.length < MIN_AT_RISK) rec.underpowered = true;
    // and to a fit that cannot identify its own coefficients (era-1870-1914-r2/statistics-6): a row scored off 8
    // events over 9 covariates is a miss, not a clean score, which is the rule already applied to `n: 0` rows.
    if (rec.epv != null && rec.epv < MIN_EPV) { rec.underpowered = true; rec.underpowered_reason = `events per estimated covariate ${rec.epv.toFixed(2)} < ${MIN_EPV}`; }
    row.templates[t.id] = rec;
    if (!rec.underpowered) (pooled[t.id] ??= []).push(...pairs.map(([p, y, u]) => [p, y, u, asOf]));
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
  // repeated measures (era-1870-1914-r2/statistics-5): with a 20-year horizon at a 10-year step every scored unit-year
  // falls inside two horizons, so `n` counts each unit once per as-of row it appears in. For the dyad templates that
  // only overstates precision; for the record templates it is the whole sample — chokepoint_status' n=36 was 9 records
  // measured four times. `n_distinct_units` and `n_as_of_rows` say so, and the AUC and skill CIs are bootstrapped by
  // resampling UNIT IDS rather than rows, which prices the repetition in.
  const units = [...new Set(pairs.map(x => x[2]))];
  const byUnit = new Map(); for (const x of pairs) { const k = x[2]; (byUnit.get(k) ?? byUnit.set(k, []).get(k)).push(x); }
  const asOfRows = new Set(pairs.map(x => x[3])).size;
  const boot = { auc: [], skill: [] };
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let b = 0; b < 400; b++) {
    const sample = []; for (let i = 0; i < units.length; i++) sample.push(...byUnit.get(units[Math.floor(rnd() * units.length)]));
    const obs = sample.reduce((s, x) => s + x[1], 0); if (obs === 0 || obs === sample.length) continue;
    const bb = sample.reduce((s, x) => s + (x[0] - x[1]) ** 2, 0) / sample.length;
    const bs = (obs / sample.length) * (1 - obs / sample.length);
    boot.auc.push(auc(sample)); boot.skill.push(1 - bb / bs);
  }
  const ci = (xs) => { if (xs.length < 20) return null; const v = [...xs].sort((a, b) => a - b); return [v[Math.floor(v.length * 0.025)], v[Math.floor(v.length * 0.975)]]; };
  summary[id] = { n: pairs.length, n_distinct_units: units.length, n_as_of_rows: asOfRows, predicted, observed, brier, brier_base: brierBase, skill: 1 - brier / brierBase, auc: auc(pairs), auc_ci95_by_unit: ci(boot.auc), skill_ci95_by_unit: ci(boot.skill), calibration: cal };
  const a95 = summary[id].auc_ci95_by_unit;
  console.log(`   ${id.padEnd(22)} n=${String(pairs.length).padStart(6)} (${String(units.length).padStart(5)} units × ${asOfRows} as-of)  exp/obs=${(predicted / Math.max(1, observed)).toFixed(2).padStart(5)}  brier=${brier.toFixed(3)} (base ${brierBase.toFixed(3)}, skill ${fmt(1 - brier / brierBase)})  auc=${fmt(auc(pairs))}${a95 ? ` [${fmt(a95[0])}, ${fmt(a95[1])}]` : ''}  cal: ${cal.map(([p, o]) => `${(p * 100).toFixed(0)}→${(o * 100).toFixed(0)}`).join(' ')}`);
}
mkdirSync('scores', { recursive: true });
// An ablation run is not the published run: the engine switches go into meta and into the filename, so a sweep can
// never overwrite scores/backtest-<window>.json with a number that was produced under a different engine.
const ENGINE_ENV = ['ENGINE_ABLATE', 'RIVALRY_DECAY', 'COALITION_ON', 'COALITION_P_JOIN', 'COALITION_RELEVANCE', 'CORRIDOR_DAMPENER', 'INFO_DIFFUSION', 'WAR_DURATION_ON']
  .filter(k => process.env[k] != null && process.env[k] !== '').map(k => `${k}=${process.env[k]}`);
const slug = ENGINE_ENV.length ? '-abl-' + ENGINE_ENV.join(',').replace(/[^A-Za-z0-9.=,_-]/g, '').toLowerCase().replace(/[=,]/g, '_') : '';
const out = { meta: { run: new Date().toISOString(), from: FROM, to: TO, step: STEP, horizon: H, runs: RUNS, skipDyads, refit: REFIT, fit_source: REFIT ? 'rolling-origin: refit per as-of year on labels ≤ as-of' : 'full-sample data/fits.json (leaks past the as-of date)', engine: { env: ENGINE_ENV, mechanisms: Object.fromEntries(templates.filter(t => t.unit === 'dyad-year').flatMap(t => [['duration', t.duration?.status], ['coalition', t.coalition?.status]].filter(([, v]) => v))) } }, byAsOf: results, pooled: summary };
const file = `scores/backtest-${FROM}-${TO}-h${H}-${UNIVERSE}${REFIT ? '' : '-norefit'}${slug}.json`;
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\nwrote ${file}`);
