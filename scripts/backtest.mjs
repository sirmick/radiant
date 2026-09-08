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
import { readCsv, Y, loadActors, makeCodeMap, loadPacts } from './lib/hist.mjs';
import { createFitter } from './lib/fit.mjs';
import { createWorld, runEnsemble, CORRIDOR_UNIT, corridorFirstYear, corridorLastYear, corridorTransitionYears, corridorStateAt } from '../src/engine/core.js';
import { IMPAIRED, RESOLVED, SPELL_UNITS, territoryFirstYear, territoryStateAt, endYears, warSpells } from '../src/engine/termination.js';

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
// chokepoint/corridor/record_reopen: the hand-coded record layer (data/corridors.yaml) is complete only where the
// refine loop has been, so these windows are a claim about the DATA and not about the calendar and move one era at a
// time. era-1945-1991-r2/corridors-1 landed the 1946-1991 entries (the Berlin access corridors, the Straits of Tiran,
// the Florida Straits, Tazara and the southern-African set, the Soviet energy set, and the dated decolonisation
// control transfers on eight records that still named a departed colonial power in 1980) and then measured whether
// they were enough BEFORE moving anything, which is the test era-1914-1945-r2/statistics-5 wrote after the last
// premature reopening. On the label rate the fitter itself sees: chokepoints 4.73% over 825 post-1945 record-years
// against 5.19% over the 1,080 coded ones — inside the factor of 1.5, so `chokepoint` moves to 1991. `corridor` and
// `record_reopen` do NOT move: 1.63% against 4.32%, and 7.44% against 27.33%. 29 of the 46 corridor records still have
// no post-1945 transition and about a dozen of those stopped being corridors decades ago and are not retired, so the
// gap is a missing `retired:` field rather than missing history rows. The templates' own window comments in
// data/templates.yaml carry the numbers.
// era-1991-2026-r2/corridors-1: `corridor` MOVES to 2025 and the other two do not, on the same measurement rerun
// after that turn coded the 1992-2025 layer and retired twenty records whose thing had ended (`exists_until`).
// corridor 3.52% over 1,107 modern record-years against 4.77% over the 1,529 coded ones — ratio 0.74, inside the
// band, against 0.20 before the turn. chokepoint 3.27% against 5.11% — ratio 0.64, just under the 0.67 floor, so it
// stays at 1991, and the nine records with no modern transition are quiet straits rather than missing history.
// record_reopen 6.87% over 131 modern impaired record-years against 27.52% coded — ratio 0.25, and that one is real:
// Benguela 1975-2014, Kerch and Yamal closed since 2022 and the Ukrainian transit lines since 2025 are long modern
// closures that have not ended, i.e. right-censored spells, not uncoded years.
// regime_change opens at 1816, not 1900 (era-1870-1914-r2/data-3): its source is V-Dem Regimes of the World via OWID,
// which runs 1789-2025, and data/events.json carries 179 regime_change events dated before 1900. The ERT-derived
// onset kinds keep their own 1900 start — that is where the Episodes of Regime Transformation data begins.
// era-1991-2026-r2/data-1: mid_force, mid_war and war_end move from [1816, 2001] to [1816, 2010]. The window was
// CoW MID 3.02's last dispute year, and it made the modern dyadic layer unscorable — as-of 2000 graded a 20-year
// horizon on 2001 alone and as-of 2010 reported n: 0. GML MID 2.2.1 (scripts/fetch-mid.mjs, spliced in
// scripts/build-events.mjs) carries the same hostlev variable to 2010. The two sources agree on the decade they
// share: 14.0 pair-onsets a year at hostlev >= 4 over 1992-2001 against midb's 14.5, inside the factor of 1.5 the
// corridor windows are held to. Past 2010 there is still no source and the window does not move.
// era-modern-2000-2025/corridors-1, corridors-2, engine-3, engine-6: `chokepoint` and `record_reopen` MOVE to 2025,
// on the same gate, re-measured after this turn's rows landed. chokepoint: 4.13% over 581 modern chokepoint-years
// against 5.11% over the 1,859 coded ones — ratio 0.81 against 0.64 before the corinth_canal 2021/2023, kiel 2013
// and bosphorus 1994/1998 entries. Per decade the modern rate is 1.92% / 1.76% / 7.06% (1992-2000, 2001-2010,
// 2011-2025), so the 1990s and 2000s are still under-coded and the as-of-2000 row is scored on a measured deficit;
// the alternative was a seventh consecutive as-of year reporting n=0 on the layer the modern era is about.
// record_reopen: the raw modern rate (6.08% over 148 impaired record-years against 27.15% pre-1946) is right-
// censoring, not a coding hole — 113 of the 148 rows are six spells still impaired at 2025 and incapable of carrying
// a reopening. Drop those and the modern rate is 25.71% over 35 rows against 28.47%, a ratio of 0.90. The censored
// rows stay in the fit as observed non-endings, which is the correct exposure and is what tells the hazard that
// modern closures are long: the fit moves from n=148 / 40 events / 27.0% a year / holdout AUC 0.500 to n=395 / 68 /
// 17.2% / 0.546.
// era-modern-2000-2025/data-3, engine-5: `coup` moves to 2025 and `leader_exit` does NOT. The coup tail is a
// complete hand list on Powell-Thyne's own definition (12 attempts 2022-2025, data/history/events.yaml), so a zero
// past 2021 is now a claim the list backs; a complete 2022-2025 LEADER roster is a dataset, not a hand list, and the
// tail there is the irregular half only — so leader_exit keeps REIGN's 2021 end and its horizon stays truncated.
// era-modern-2000-2025/data-1, engine-4, statistics-3: `interstate_onset` is the modern dyad's ground truth, covered
// 1946-2024 (UCDP/PRIO ACD 25.1). mid_force / mid_war / war_end still stop at GML MID 2.2.1's 2010 and still report
// n=0 at as-of 2010; what changes is that the dyadic layer is no longer graded by nothing there.
// operator/termination adds four ending kinds. Their windows are their sources': CoW MID endyear stops in 2001,
// UCDP in 2024, and the two record layers are complete only where the refine loop has been — the reopen window is the
// same 1869-1945 corridor_status is scored in (chokepoint_status now reaches 1991; the reopen sample is the two kinds
// pooled, so it moves with the corridor half), and the territory histories run 1871-2025.
const COVERAGE = { leader_exit: [1950, 2021], coup: [1950, 2025], autocratization_onset: [1900, 2024], democratization_onset: [1900, 2024], regime_change: [1816, 2025], intrastate_onset: [1946, 2024], interstate_onset: [1946, 2024], mid_force: [1816, 2010], mid_war: [1816, 2010], chokepoint: [1869, 2025], corridor: [1869, 2025], war_end: [1816, 2010], intrastate_end: [1946, 2024], record_reopen: [1869, 2025], territory_settle: [1871, 2025] };
const RECORD_UNITS = new Set(Object.values(CORRIDOR_UNIT));
// the structural zeros src/engine/core.js:stepLifecycle gives an actor introduced inside the horizon (see missingVars)
const ENTRY_ZEROS = ['at_war', 'intrastate', 'mid_force', 'mid_war', 'coup_attempt', 'coup_success', 'interstate_ucdp', 'pact_usa', 'pact_rus', 'defence_pacts', 'sp_client_any', 'sp_client_one', 'great_game', 'aid_conditionality'];

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
// era-1991-2026-r2/data-7, engine-6: the dyadic `allied` feature is built from the same dated graph the panel and the
// fitter read — CoW 3.03 to 2000, ATOP 5.1 to 2018, dated accessions past it, then carried. It used to be CoW alone,
// which ends in 2000, so `world.allied` was the year-2000 edge set at as-of 2000, 2010 and 2025 alike (1,010 edges at
// all three, byte-identical) and USA-EST, USA-FIN and twelve other pairs read NO PACT EVER.
const { pacts, meta: pactMeta } = loadPacts(code);

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
  const any = new Set(); const dy = new Set(); const anyCount = new Map(); const anyCountRaw = new Map();
  // era-modern-2000-2025/engine-7: the observed COUNT is counted in the unit the engine can produce — one event per
  // actor per year. UCDP codes one intrastate_onset per conflict-dyad, so 2011-2024 carries 149 onset events on 131
  // distinct actor-years, while `firedHere` lets each template fire at most once per actor per year: the simulated
  // ceiling was 131 and count_ratio was being read against 149. The raw multiplicity is kept and reported
  // (observed_count_raw) rather than silently dropped.
  const seenYear = new Set();
  for (const e of events) {
    const y = Math.floor(e.year ?? e.start); if (y <= asOf || y > asOf + horizon) continue;
    const cov = COVERAGE[e.kind]; if (cov && (y < cov[0] || y > cov[1])) continue;
    if (e.actor) for (const t of templates) if (t.event === e.kind && (!t.event_filter || Object.entries(t.event_filter).every(([k, v]) => e[k] === v))) {
      const k = `${t.id}|${e.actor}`; any.add(k);
      anyCountRaw.set(k, (anyCountRaw.get(k) ?? 0) + 1);
      const ky = `${k}|${y}`; if (seenYear.has(ky)) continue; seenYear.add(ky);
      anyCount.set(k, (anyCount.get(k) ?? 0) + 1);
    }
    if (e.a && e.b) dy.add(`${e.kind}|${pairKey(e.a, e.b)}`);
  }
  return { any, dy, anyCount, anyCountRaw };
}
const auc = (pairs) => { // [[p, y]]
  const pos = pairs.filter(x => x[1]).length, neg = pairs.length - pos; if (!pos || !neg) return null;
  const s = [...pairs].sort((a, b) => a[0] - b[0]); let sumPos = 0;
  for (let i = 0; i < s.length;) { let j = i; while (j < s.length && s[j][0] === s[i][0]) j++; const r = (i + j + 1) / 2; for (let k = i; k < j; k++) if (s[k][1]) sumPos += r; i = j; }
  return (sumPos - pos * (pos + 1) / 2) / (pos * neg);
};
const fmt = (x, d = 2) => (x == null ? '   —' : x.toFixed(d).padStart(5));

// ---- occupancy scoring (operator/occupancy, package 11) -------------------------------------------------------
// The event score above asks "does this fire at least once inside the horizon". It cannot see whether the simulated
// process is STILL RUNNING in year 20, which is exactly the standing supercritical-war question (`war_end` is off on
// its own guard). The occupancy score asks the other question: at each lead year k, what state does the ensemble say
// the world is in, and what state was it actually in.
//
// Every scored variable is a Brier score against the panel's own column (or the record layer's dated history), per
// lead year and pooled, with the same base-rate skill the event scores use — 1 - brier / (p(1-p)) at the base rate of
// the scored rows themselves. Two of the variables are not forecasts and say so in their row: the engine's internal
// conflict has no intensity (it only ever writes level 1) and occupation is data rather than a hazard, so their
// simulated mass is zero by construction and their rows report a floor, not a model.
//
// Coverage is per variable, on the same rule COVERAGE states for events: score only where the source can see. The
// at_war window opens at 1816 because that is where the panel's flag opens, but pre-1946 it rests on the hand war
// list (data/history/events.yaml) alone — `sources.at_war` in scripts/build-panel.mjs says so — and a pre-1946 zero
// is therefore weaker evidence of peace than a post-1946 one. Reported in meta rather than assumed.
const OCC_COVERAGE = {
  at_war: [1816, 2024], intrastate: [1946, 2024], intrastate_war: [1946, 2024], occupied: [1816, 2025],
  dyad_at_war: [1816, 2010], record_impaired: [1869, 2025], record_status: [1869, 2025], territory_unsettled: [1871, 2025],
};
const OCC_NOTE = {
  at_war: 'panel at_war: the hand war list (complete only where the refine loop has been) union UCDP/PRIO type-2 1946-2024. A pre-1946 zero is the hand list\'s silence, not a measured peace.',
  intrastate_war: 'the engine writes intrastate = 1 and never 2 (intrastate_onset has no intensity), so the only mass here is a level-2 spell carried in from the as-of state and running until its termination hazard fires: this row is the cost of the missing intensity, not a forecast of it.',
  occupied: 'occupation is data in this model, not a hazard (docs/system.md): the engine carries the as-of value and never changes it, so this row scores a frozen number.',
  dyad_at_war: 'truth is the merged dyadic war spells src/engine/termination.js:warSpells builds from data/events.json, the same construction the war_end fit labels rows with.',
  record_status: 'multi-class Brier over the record\'s status words: sum_c (p_c - 1{c = actual})^2, against the marginal status distribution of the scored rows as the reference forecast.',
};
/** Running Brier accumulator: one bucket per (variable, lead year) plus the pooled bucket. */
function occAcc() { return { n: 0, brier: 0, p: 0, obs: 0 }; }
function occAdd(a, p, y) { a.n++; a.brier += (p - y) ** 2; a.p += p; a.obs += y; }
function occStat(a, extra = {}) {
  if (!a.n) return { n: 0, ...extra };
  const brier = a.brier / a.n, base = a.obs / a.n, bb = base * (1 - base);
  return { n: a.n, expected: +a.p.toFixed(2), observed: a.obs, exp_obs: a.obs ? +(a.p / a.obs).toFixed(3) : null, brier: +brier.toFixed(5), base_rate: +base.toFixed(5), brier_base: +bb.toFixed(5), skill: bb > 0 ? +(1 - brier / bb).toFixed(4) : null, ...extra };
}
/**
 * Multi-class Brier over record-status rows: sum_c (p_c - 1{c = actual})^2 averaged over rows, against the marginal
 * status distribution of those same rows as the reference forecast (its expected score is sum_c q_c (1 - q_c)).
 */
function mcBrier(rows, horizon) {
  if (!rows.length) return { n: 0 };
  const cnt = {}; for (const r of rows) cnt[r.actual] = (cnt[r.actual] ?? 0) + 1;
  const q = Object.fromEntries(Object.entries(cnt).map(([c, n]) => [c, n / rows.length]));
  const cats = new Set(Object.keys(q)); for (const r of rows) for (const c of Object.keys(r.dist)) cats.add(c);
  let s = 0; for (const r of rows) for (const c of cats) s += ((r.dist[c] ?? 0) - (c === r.actual ? 1 : 0)) ** 2;
  const brier = s / rows.length, base = [...cats].reduce((t, c) => t + (q[c] ?? 0) * (1 - (q[c] ?? 0)), 0);
  const byLead = []; for (let k = 1; k <= horizon; k++) { const rs = rows.filter(r => r.k === k); if (!rs.length) continue; let ss = 0; for (const r of rs) for (const c of cats) ss += ((r.dist[c] ?? 0) - (c === r.actual ? 1 : 0)) ** 2; byLead.push({ k, n: rs.length, brier: +(ss / rs.length).toFixed(5) }); }
  return { n: rows.length, brier: +brier.toFixed(5), brier_base: +base.toFixed(5), skill: base > 0 ? +(1 - brier / base).toFixed(4) : null, classes: cats.size, marginal: Object.fromEntries(Object.entries(q).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => [c, +v.toFixed(3)])), by_lead: byLead, note: OCC_NOTE.record_status };
}
/** Spearman rank correlation over [[x, y]] pairs; null under 5 pairs. */
function spearman(pairs) {
  if (pairs.length < 5) return null;
  const rank = (get) => { const idx = pairs.map((_, i) => i).sort((a, b) => get(pairs[a]) - get(pairs[b])); const r = new Array(pairs.length); for (let i = 0; i < idx.length;) { let j = i; while (j < idx.length && get(pairs[idx[j]]) === get(pairs[idx[i]])) j++; const avg = (i + j - 1) / 2; for (let k = i; k < j; k++) r[idx[k]] = avg; i = j; } return r; };
  const rx = rank(p => p[0]), ry = rank(p => p[1]); const n = pairs.length;
  const mx = rx.reduce((s, x) => s + x, 0) / n, my = ry.reduce((s, x) => s + x, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : null;
}
// the dyadic war spells the occupancy score grades against: pair -> set of years the pair was at war
const warYears = new Map();
for (const [k, spans] of warSpells(events)) { const s = new Set(); for (const sp of spans) for (let y = sp.y0; y <= sp.y1; y++) s.add(y); warYears.set(k, s); }

const results = []; const pooled = {}; const occPooled = {}; const occRank = { cinc: {}, pol_share: {} };
const occMcRows = { record_status_multiclass: [], territory_status_multiclass: [] };   // pooled multi-class rows across as-of years
console.log(`backtest: as-of ${FROM}..${TO} step ${STEP}, horizon ${H}y, ${RUNS} runs, universe=${UNIVERSE}${skipDyads ? ', dyads off' : ''}, coefficients=${REFIT ? 'refit per as-of year' : 'full-sample (leaky)'}`);
console.log(`alliance graph: ${pactMeta.source}; measured through ${pactMeta.atop_last}, carried from ${pactMeta.stale_from}\n`);
for (let asOf = FROM; asOf <= TO; asOf += STEP) {
  const horizon = Math.min(H, panel.meta.y1 - asOf);
  const F = fitsAt(asOf);
  const make = () => createWorld({ panel, events, fits: F, templates, asOf, pacts, contiguity, universe: UNIVERSE, successors, contiguityFrom, corridors, territories, presence });
  const t0 = Date.now();
  // `state: true` adds the occupancy tracking. It reads the world after each step and consumes no random numbers, so
  // every event number below is bit-identical to a run without it (docs/escalations.md package 11, test (d)).
  const ens = runEnsemble(make, { runs: RUNS, horizon, seed: asOf, skipDyads, state: true });
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
    const cov = COVERAGE[kind];
    // era-1945-1991-r2/data-8, statistics-7, engine-7: a template whose horizon opens outside its ground-truth window
    // used to be dropped with a bare `continue` — no row, no reason — which contradicts the rule this file states
    // twice and docs/system.md states once ("a template that never fires is reported, not dropped: silence about a
    // dead template reads as a clean score"). It hid the entire corridor layer from every as-of row after 1945: at
    // 1950, 1960, 1970 and 1980 chokepoint_status, corridor_status and record_reopen were simply absent, and a reader
    // could not tell that from a layer that was scored and found perfect. Reported with n: 0 and the window, and kept
    // out of `pooled` exactly as the other n: 0 rows are.
    if (cov && (asOf + 1 < cov[0] || asOf + 1 > cov[1])) {
      row.templates[t.id] = { n: 0, reason: `ground truth for '${kind}' is covered only ${cov[0]}-${cov[1]}; the horizon opening at ${asOf + 1} is entirely outside it, so nothing in it is observable and absence is not a non-event`, coverage: cov, scored_years: 0 };
      continue;
    }
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
    let expCount = 0, obsCount = 0, obsCountRaw = 0;   // the count scale, for the saturated actor-year templates (era-1945-1991-r2/statistics-6)
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
          for (const v of missingVars(w0, t, id, firstLive[id])) excludedVars[v] = (excludedVars[v] ?? 0) + 1;
        }
        pairs.push([covYears < horizon ? ens.pAnyWithin(key, covYears) : (p ?? 0), y, id]);
        // era-1945-1991-r2/statistics-6: the COUNT alongside the indicator. Every actor-year template is scored as
        // P(any event within the horizon), and for leader_exit the observed horizon rate is 0.84, so the reference
        // forecaster is nearly perfect by saying "yes" and no calibrated model can earn skill against it — while a
        // doubling of the underlying RATE is invisible to the statistic. At as-of 1980 the pAny row read predicted
        // 136 against observed 170 (a mild under-prediction) while the same ensemble fired ~1300 leader exits against
        // 654 observed. Reported, not pooled: the pooled score stays the Brier so the comparison against every
        // previous run is unchanged, and the two numbers below are what a 2x over-firing can no longer hide behind.
        // era-1991-2026-r2/engine-1: the two sides of count_ratio measured over the same number of years. realized()
        // drops observed events outside COVERAGE, so where the ground truth ends inside the horizon the expected
        // count must be truncated to match — it was not, and count_ratio was inflated by horizon/scored_years.
        expCount += covYears < horizon ? ens.expectedWithin(key, covYears) : (ens.expected[key] ?? 0);
        obsCount += real.anyCount.get(key) ?? 0;
        obsCountRaw += real.anyCountRaw.get(key) ?? 0;
      }
    } else if (RECORD_UNITS.has(t.unit)) {
      // one unit per corridor/chokepoint record that exists at as-of. A record whose dated history opens INSIDE the
      // horizon is not a unit the forecaster holds — a corridor is announced by an actor decision this model does not
      // model — so it is counted and reported (n_unborn_records / n_unborn_events) rather than scored at p=0.
      const truthEnd = Math.min(asOf + horizon, cov ? cov[1] : asOf + horizon);
      for (const r of corridors) {
        if (CORRIDOR_UNIT[r.kind] !== t.unit) continue;
        if (asOf > corridorLastYear(r, Infinity)) continue;   // era-1991-2026-r2/corridors-6: a retired record is not a unit
        const first = corridorFirstYear(r, t.window[0]);
        const y = corridorTransitionYears(r, asOf + 1, Math.min(truthEnd, corridorLastYear(r, Infinity))).size ? 1 : 0;
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
        if (asOf > corridorLastYear(r, Infinity)) continue;   // era-1991-2026-r2/corridors-6
        const first = corridorFirstYear(r, t.window[0]);
        const st = (yy) => corridorStateAt(r, yy)?.status ?? null;
        const y = endYears({ open: (yy) => st(yy - 1), close: st, inSpell: (x) => IMPAIRED.has(x), from: asOf + 1, to: Math.min(truthEnd, corridorLastYear(r, Infinity)) }).size ? 1 : 0;
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
    if (t.unit === 'actor-year') {
      rec.expected_count = expCount; rec.observed_count = obsCount;
      if (obsCountRaw !== obsCount) rec.observed_count_raw = obsCountRaw;   // era-modern-2000-2025/engine-7: events dropped by the one-per-actor-year cap, reported rather than hidden
      rec.count_ratio = obsCount ? expCount / obsCount : null;
      // a template whose horizon base rate is past this line cannot be discriminated by the indicator score at all:
      // brier_base = p(1-p) collapses and every unreachable unit costs the full 1.0. Flagged so the count pair above
      // is read as the primary calibration statistic for it rather than as a footnote.
      if (rec.observed / rec.n > 0.5) rec.saturated = { horizon_base_rate: rec.observed / rec.n, note: 'the any-event indicator is saturated at this horizon; read expected_count / observed_count for calibration' };
    }
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
  // ---- occupancy: what state the world is in each year, scored against the panel and the record layer.
  {
    const occ = ens.occupancy; const acc = {};
    const bump = (v, k, p, y) => { const a = acc[v] ??= { lead: Array.from({ length: horizon }, occAcc), all: occAcc() }; occAdd(a.lead[k - 1], p, y); occAdd(a.all, p, y); const g = occPooled[v] ??= { lead: Array.from({ length: H }, occAcc), all: occAcc() }; occAdd(g.lead[k - 1], p, y); occAdd(g.all, p, y); };
    const inWin = (v, y) => { const w = OCC_COVERAGE[v]; return !w || (y >= w[0] && y <= w[1]); };
    // actor state. The truth column is the panel's own; a year the panel does not observe for that actor is not scored
    // (absence is not a non-event), and an actor the ensemble never instantiated is scored at p = 0 rather than dropped.
    const ACTOR_VARS = { at_war: [(x) => (x > 0 ? 1 : 0), 'at_war'], intrastate: [(x) => (x >= 1 ? 1 : 0), 'intrastate'], intrastate_war: [(x) => (x >= 2 ? 1 : 0), 'intrastate'], occupied: [(x) => (x > 0 ? 1 : 0), 'occupied'] };
    for (const [v, [truth, col]] of Object.entries(ACTOR_VARS)) for (let k = 1; k <= horizon; k++) {
      const y = asOf + k; if (!inWin(v, y)) continue;
      for (const id of windowIds) {
        if (!liveAt(id, y)) continue;
        const raw = panel.actors[id]?.[col]?.[y - Y0]; if (raw == null) continue;
        bump(v, k, occ.actors[id]?.[v]?.[k - 1] ?? 0, truth(raw));
      }
    }
    // dyadic war-years, over the same pair set the event score uses
    if (!skipDyads) for (let k = 1; k <= horizon; k++) {
      const y = asOf + k; if (!inWin('dyad_at_war', y)) continue;
      for (let i = 0; i < dyadIds.length; i++) { if (!liveAt(dyadIds[i], y)) continue; for (let j = i + 1; j < dyadIds.length; j++) { if (!liveAt(dyadIds[j], y)) continue; const pk = pairKey(dyadIds[i], dyadIds[j]); bump('dyad_at_war', k, occ.dyads[pk]?.[k - 1] ?? 0, warYears.get(pk)?.has(y) ? 1 : 0); } }
    }
    // record status. Corridors and chokepoints are scored twice: as a binary "impaired" (the quantity a reader of the
    // map cares about) and as the full multi-class distribution. Territories the same way with `settled` as the
    // resolved class. A record whose own history has ended (retired) stops being a unit, as in the event score.
    const terrIds = new Set(territories.map(r => r.id));
    const truthOf = new Map();
    for (const r of corridors) truthOf.set(r.id, (y) => (y > corridorLastYear(r, Infinity) ? null : corridorStateAt(r, y)?.status ?? null));
    for (const r of territories) truthOf.set(r.id, (y) => territoryStateAt(r, y)?.status ?? null);
    const recRows = [], terrRows = [];
    for (const [rid, rec] of Object.entries(occ.records)) {
      const t = truthOf.get(rid); if (!t) continue;
      const isTerr = terrIds.has(rid); const wv = isTerr ? 'territory_unsettled' : 'record_status';
      for (let k = 1; k <= horizon; k++) {
        const y = asOf + k; if (!inWin(wv, y)) continue;
        const dist = rec.status[k - 1]; if (!dist) continue;
        const actual = t(y); if (actual == null) continue;
        (isTerr ? terrRows : recRows).push({ k, dist, actual });
        occMcRows[isTerr ? 'territory_status_multiclass' : 'record_status_multiclass'].push({ k, dist, actual });
        if (isTerr) bump('territory_unsettled', k, 1 - (dist.settled ?? 0), RESOLVED.has(actual) ? 0 : 1);
        else bump('record_impaired', k, [...IMPAIRED].reduce((s, c) => s + (dist[c] ?? 0), 0), IMPAIRED.has(actual) ? 1 : 0);
      }
    }
    const mc = (rows) => mcBrier(rows, horizon);
    // capability: does the ensemble's median share rank the world the way CoW does ten and twenty years out
    const capRank = {};
    for (const v of ['cinc', 'pol_share']) for (const k of [10, 20]) {
      if (k > horizon) continue; const y = asOf + k;
      const ps = [];
      for (const id of windowIds) { if (!liveAt(id, y)) continue; const truth = panel.actors[id]?.cinc?.[y - Y0]; const q = occ.actors[id]?.[v]?.[k - 1]; if (truth == null || !q) continue; ps.push([q[1], truth]); }
      const rho = spearman(ps); (capRank[v] ??= {})[`k${k}`] = { n: ps.length, spearman: rho };
      if (rho != null) ((occRank[v][`k${k}`] ??= [])).push(rho);
    }
    const vars = {};
    for (const [v, a] of Object.entries(acc)) vars[v] = { ...occStat(a.all, { coverage: OCC_COVERAGE[v] ?? null, note: OCC_NOTE[v] }), by_lead: a.lead.map((x, i) => occStat(x, { k: i + 1 })).filter(x => x.n) };
    vars.record_status_multiclass = mc(recRows); vars.territory_status_multiclass = mc(terrRows);
    // the hot-process diagnosis the package asks for by name: the lead years where the simulated war occupancy exceeds
    // the panel's, stated rather than left to be read out of the table.
    const hot = {};
    for (const v of ['at_war', 'dyad_at_war']) {
      const a = acc[v]; if (!a) continue;
      const leads = a.lead.map((x, i) => ({ k: i + 1, exp: x.n ? x.p / x.n : null, obs: x.n ? x.obs / x.n : null })).filter(x => x.exp != null);
      const over = leads.filter(x => x.exp > x.obs);
      hot[v] = { leads_over: over.map(x => x.k), first_lead_over: over[0]?.k ?? null, worst: over.length ? over.reduce((b, x) => ((x.exp - x.obs) > (b.exp - b.obs) ? x : b)) : null, ratio_by_lead: leads.map(x => ({ k: x.k, exp_rate: +x.exp.toFixed(5), obs_rate: +x.obs.toFixed(5), ratio: x.obs ? +(x.exp / x.obs).toFixed(2) : null })) };
    }
    row.occupancy = { vars, capability_rank: capRank, hot };
  }
  results.push(row);
  console.log(`as-of ${asOf} (+${horizon}y, ${ids.length} actors, ${(row.ms / 1000).toFixed(1)}s)`);
  for (const [id, s] of Object.entries(row.templates)) {
    if (!s.n) { console.log(`   ${id.padEnd(22)}      ${s.reason}`); continue; }
    console.log(`   ${id.padEnd(22)}${s.scored_years < horizon ? `[${s.scored_years}y]` : '     '} n=${String(s.n).padStart(5)}  atrisk=${String(s.n_at_risk).padStart(5)}  exp=${s.predicted.toFixed(1).padStart(6)}  obs=${String(s.observed).padStart(4)}  miss0=${String(s.n_structural_miss).padStart(3)}${s.n_excluded_no_covariate ? `  nocov=${String(s.n_excluded_no_covariate).padStart(3)}` : ''}${s.n_unborn_records ? `  unborn=${s.n_unborn_records}/${s.n_unborn_events}` : ''}  ratio=${fmt(s.observed ? s.predicted / s.observed : null)}  brier=${fmt(s.brier, 3)}  auc=${fmt(s.auc)}  auc@risk=${fmt(s.auc_at_risk)}  fit≤${s.fit_split}${s.leaky ? ' LEAKY' : ''}${s.underpowered ? '  [underpowered, out of pooled]' : ''}`);
  }
  console.log('   occupancy (state each year, not first occurrence):');
  for (const [v, s] of Object.entries(row.occupancy.vars)) {
    if (!s.n) { console.log(`     ${v.padEnd(26)} n=0`); continue; }
    console.log(`     ${v.padEnd(26)} n=${String(s.n).padStart(7)}  exp/obs=${fmt(s.exp_obs)}  brier=${fmt(s.brier, 4)} (base ${s.brier_base == null ? '  —' : s.brier_base.toFixed(4)}, skill ${fmt(s.skill)})${s.base_rate != null ? `  rate=${s.base_rate.toFixed(4)}` : ''}`);
  }
  for (const [v, h] of Object.entries(row.occupancy.hot)) {
    if (!h.leads_over.length) { console.log(`     hot-process: ${v} never exceeds the panel's occupancy at any lead year`); continue; }
    console.log(`     hot-process: ${v} SIMULATED OCCUPANCY EXCEEDS THE PANEL at lead ${h.leads_over.join(',')} (first ${h.first_lead_over}, worst k=${h.worst.k}: ${(h.worst.exp * 100).toFixed(2)}% simulated against ${(h.worst.obs * 100).toFixed(2)}% observed)`);
  }
  for (const [v, ks] of Object.entries(row.occupancy.capability_rank)) console.log(`     capability rank (${v}): ${Object.entries(ks).map(([k, x]) => `${k} rho=${x.spearman == null ? '—' : x.spearman.toFixed(3)} (n=${x.n})`).join('  ')}`);
}
/**
 * Which of a template's covariates the world cannot supply for this actor (empty = fully covered).
 *
 * era-1945-1991-r2/data-1: an actor the engine instantiates INSIDE the horizon is not in the as-of world, and this
 * collapsed every one of them to the single label `not_live_at_as_of` — 47 of the 56 exclusions on leader_exit at
 * as-of 1960 — which hid which variable actually did the damage (it was the leader block, absent from entryPrior).
 * The entrant's state is now reconstructed the way src/engine/core.js:stepLifecycle builds it (the panel row at
 * min(first live year, asOf), then the world's dated entry prior over the nulls, then the structural zeros a state
 * that does not yet exist cannot have) and the covariates that are STILL null are named, prefixed `entrant:` so the
 * two cases stay distinguishable in `excluded_vars`.
 */
function entrantState(world, id, firstYear) {
  const vars = panel.actors[id]; if (!vars || firstYear == null) return null;
  const at = Math.min(firstYear, world.asOf);
  const read = (y) => { const o = {}; for (const v of Object.keys(vars)) o[v] = vars[v]?.[y - Y0] ?? null; return o; };
  const cur = read(at), prev = read(at - 1);
  for (const [v, x] of Object.entries(world.entryPrior ?? {})) if (x != null) { cur[v] ??= x; prev[v] ??= x; }
  if (cur.gdp_pc != null && cur.log_gdp_pc == null) cur.log_gdp_pc = Math.log(cur.gdp_pc);
  for (const v of ENTRY_ZEROS) { cur[v] ??= 0; prev[v] ??= 0; }
  return { id, cur, prev, recent: { coup_attempt: [0, 0, 0, 0, 0], intrastate: [0, 0, 0, 0, 0], mid_force: [0, 0, 0, 0, 0], at_war: [0, 0, 0, 0, 0], leader_exit: [0, 0, 0, 0, 0] }, fired: {} };
}
function missingVars(world, t, id, firstYear) {
  const a = world.actors[id];
  if (!a) {
    const e = entrantState(world, id, firstYear);
    if (!e) return ['not_live_at_as_of'];
    const miss = t.covariates.filter(c => !hasVar(world, e, c)).map(c => `entrant:${c.var}`);
    return miss.length ? miss : ['entrant:not_live_at_as_of'];
  }
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
// ---- pooled occupancy across as-of years
console.log('\npooled occupancy (state each year, all as-of rows):');
const occSummary = { vars: {}, capability_rank: {}, coverage: OCC_COVERAGE, notes: OCC_NOTE };
for (const [v, g] of Object.entries(occPooled)) {
  occSummary.vars[v] = { ...occStat(g.all, { coverage: OCC_COVERAGE[v] ?? null, note: OCC_NOTE[v] }), by_lead: g.lead.map((x, i) => occStat(x, { k: i + 1 })).filter(x => x.n) };
  const s = occSummary.vars[v];
  console.log(`   ${v.padEnd(24)} n=${String(s.n).padStart(8)}  exp/obs=${fmt(s.exp_obs)}  brier=${fmt(s.brier, 4)} (base ${s.brier_base.toFixed(4)}, skill ${fmt(s.skill)})  rate=${s.base_rate.toFixed(4)}`);
}
for (const [v, rows] of Object.entries(occMcRows)) {
  occSummary.vars[v] = mcBrier(rows, H);
  const s = occSummary.vars[v]; if (!s.n) continue;
  console.log(`   ${v.padEnd(24)} n=${String(s.n).padStart(8)}  ${' '.repeat(14)}brier=${fmt(s.brier, 4)} (base ${s.brier_base.toFixed(4)}, skill ${fmt(s.skill)})  ${s.classes} classes`);
}
for (const [v, ks] of Object.entries(occRank)) for (const [k, rs] of Object.entries(ks)) {
  occSummary.capability_rank[`${v}_${k}`] = { as_of_rows: rs.length, mean_spearman: +(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(3), min: Math.min(...rs), max: Math.max(...rs) };
  const x = occSummary.capability_rank[`${v}_${k}`];
  console.log(`   capability rank ${v} ${k}: mean rho ${x.mean_spearman.toFixed(3)} over ${x.as_of_rows} as-of rows (${x.min.toFixed(2)}…${x.max.toFixed(2)})`);
}
// the standing diagnosis, in one line: the lead years where the simulated war process runs hotter than the world did
for (const v of ['at_war', 'dyad_at_war']) {
  const g = occSummary.vars[v]; if (!g?.by_lead?.length) continue;
  const over = g.by_lead.filter(x => x.expected / x.n > x.observed / x.n);
  console.log(`   hot-process (pooled): ${v} exp/obs ${g.exp_obs} overall; simulated occupancy exceeds the panel's at ${over.length} of ${g.by_lead.length} lead years${over.length ? ` (from k=${over[0].k})` : ''}`);
}

mkdirSync('scores', { recursive: true });
// An ablation run is not the published run: the engine switches go into meta and into the filename, so a sweep can
// never overwrite scores/backtest-<window>.json with a number that was produced under a different engine.
const ENGINE_ENV = ['ENGINE_ABLATE', 'RIVALRY_DECAY', 'COALITION_ON', 'COALITION_P_JOIN', 'COALITION_RELEVANCE', 'CORRIDOR_DAMPENER', 'INFO_DIFFUSION', 'WAR_DURATION_ON']
  .filter(k => process.env[k] != null && process.env[k] !== '').map(k => `${k}=${process.env[k]}`);
const slug = ENGINE_ENV.length ? '-abl-' + ENGINE_ENV.join(',').replace(/[^A-Za-z0-9.=,_-]/g, '').toLowerCase().replace(/[=,]/g, '_') : '';
const out = { meta: { run: new Date().toISOString(), from: FROM, to: TO, step: STEP, horizon: H, runs: RUNS, skipDyads, refit: REFIT, fit_source: REFIT ? 'rolling-origin: refit per as-of year on labels ≤ as-of' : 'full-sample data/fits.json (leaks past the as-of date)', engine: { env: ENGINE_ENV, mechanisms: Object.fromEntries(templates.filter(t => t.unit === 'dyad-year').flatMap(t => [['duration', t.duration?.status], ['coalition', t.coalition?.status]].filter(([, v]) => v))) } }, byAsOf: results, pooled: summary, occupancy: occSummary };
const file = `scores/backtest-${FROM}-${TO}-h${H}-${UNIVERSE}${REFIT ? '' : '-norefit'}${slug}.json`;
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\nwrote ${file}`);
