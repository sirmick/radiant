// operator/termination (package 8) — the diagnostic the package's deciding test is read off.
//
// 1. the four samples and their fits: n, endings, holdout AUC, the empirical hazard by spell age
// 2. the simulated spell-length distributions against the panel's own (war and internal conflict)
// 3. the four named cases, as-of runs: is the observed termination decade the modal one?
// 4. the 2026 direction check: what the live impaired records and live contests do forward
//
// Run: node scripts/analysis/termination.mjs [--runs 200]
import { readFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap } from '../lib/hist.mjs';
import { createFitter, loadFitInputs } from '../lib/fit.mjs';
import { createWorld, stepYear, mulberry32 } from '../../src/engine/core.js';
import { warSpells, IMPAIRED, RESOLVED, territoryStateAt } from '../../src/engine/termination.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? +process.argv[i + 1] : d; };
const RUNS = arg('runs', 200);

const inputs = loadFitInputs();
const { panel, events, templates, contiguity, pacts, corridors, territories, successors, presence } = inputs;
const Y0 = panel.meta.y0;
const fitter = createFitter(inputs);
const fitCache = new Map();
const fitsAt = (asOf) => { if (!fitCache.has(asOf)) fitCache.set(asOf, fitter.fitAll({ maxYear: asOf, holdout: false, ablation: false }).fits); return fitCache.get(asOf); };
const world = (asOf, fits) => createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe: 'all', successors, contiguityFrom: 1886, corridors, territories, presence });
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pct = (x) => `${(x * 100).toFixed(0)}%`;

// ---------------------------------------------------------------- 1. the samples and the fits
console.log('=== 1. the four termination samples ===\n');
{
  const { fits, lines } = fitter.fitAll({ only: new Set(['war_end', 'intrastate_end', 'record_reopen', 'contest_settle']), ablation: false });
  for (const t of templates) {
    const f = fits[t.id]; if (!f || f.status !== 'fitted') continue;
    console.log(`${t.id.padEnd(18)} n=${String(f.n).padStart(5)}  endings=${String(f.events).padStart(4)}  rate=${(f.base_rate * 100).toFixed(1)}%  holdout AUC ${f.holdout ? `${f.holdout.auc.toFixed(3)} (>= ${f.holdout.split}, n_test=${f.holdout.n_test}, events=${Math.round(f.holdout.base_rate_test * f.holdout.n_test)})` : '— (insufficient events in the test half)'}`);
    console.log(`${''.padEnd(18)} ${Object.entries(f.coefs).map(([k, v]) => `${k} ${v.value >= 0 ? '+' : ''}${v.value.toFixed(2)}`).join('  ')}`);
  }
  // the empirical hazard by age, which is the shape the engine draws a spell length from
  const byAge = (rows, ageVar) => {
    const m = {};
    for (const r of rows) { const a = Math.min(9, Math.round(r.feats[ageVar])); (m[a] ??= [0, 0]); m[a][0]++; m[a][1] += r.y; }
    return Object.entries(m).map(([a, [n, e]]) => `${a}:${(e / n).toFixed(2)}(${n})`).join(' ');
  };
  for (const [id, v] of [['war_end', 'war_duration'], ['intrastate_end', 'conflict_duration'], ['record_reopen', 'impair_duration'], ['contest_settle', 'contest_duration']]) {
    const t = templates.find(x => x.id === id);
    console.log(`${id.padEnd(18)} observed hazard by age (age:P(end)(n)):  ${byAge(fitter.rowsFor(t), v)}`);
  }
}

// ---------------------------------------------------------------- 2. simulated spell lengths
// Sections 2 and the war case in 3 need the war-spell mechanism, which the published engine leaves OFF (it is a
// candidate: data/templates.yaml `duration.status`, and it fails the package's own 1950-2000 guard). They are run
// here with WAR_DURATION_ON=1, which is what src/engine/core.js:warDurationOn reads, and section 4 turns it back off
// so the 2026 view is the published engine's.
process.env.WAR_DURATION_ON = '1';
console.log('\n=== 2. simulated spell lengths against the panel (WAR_DURATION_ON=1: the candidate war spell) ===\n');
const hist = (runs) => { const n = runs.length || 1; const h = {}; for (const r of runs) h[Math.min(20, r)] = (h[Math.min(20, r)] ?? 0) + 1; return { n: runs.length, mean: runs.reduce((a, b) => a + b, 0) / n, one: runs.filter(r => r === 1).length / n, h }; };
const show = (label, s) => console.log(`${label.padEnd(34)} spells=${String(s.n).padStart(6)}  mean=${s.mean.toFixed(2)}  one-year=${pct(s.one)}`);
{
  // observed: at_war runs (the panel's own interstate-war spells) and intrastate runs
  const runsOf = (v, from, to) => { const out = []; for (const vars of Object.values(panel.actors)) { const arr = vars[v]; if (!arr) continue; let n = 0; for (let y = from; y <= to; y++) { const x = arr[y - Y0]; if (x != null && x > 0) n++; else { if (n) out.push(n); n = 0; } } } return out; };
  show('panel at_war runs (actor)', hist(runsOf('at_war', 1816, 2025)));
  show('CoW MID dyadic war spells', hist([...warSpells(events).values()].flat().filter(s => !s.censored).map(s => s.y1 - s.y0 + 1)));
  show('panel intrastate runs (actor)', hist(runsOf('intrastate', 1946, 2023)));
  // the engine's runs are measured inside a 20-year horizon, so a long spell can never complete there. The same
  // truncation applied to the panel is the apples-to-apples number: runs that start AND end inside a 20-year window.
  const trunc = []; for (let w = 1946; w <= 2004; w += 20) for (const r of runsOf('intrastate', w, w + 19)) if (r < 20) trunc.push(r);
  show('panel intrastate, 20y windows', hist(trunc));
  const truncW = []; for (let w = 1816; w <= 2005; w += 20) for (const r of runsOf('at_war', w, w + 19)) if (r < 20) truncW.push(r);
  show('panel at_war, 20y windows', hist(truncW));

  for (const asOf of [1920, 1970]) {
    const fits = fitsAt(asOf);
    const warRuns = [], conflictRuns = [];
    for (let r = 0; r < Math.min(RUNS, 100); r++) {
      const rng = mulberry32(asOf * 7919 + r); const w = world(asOf, fits);
      const openWar = new Map(), openCon = new Map();
      const seenWar = new Set(Object.keys(w.actors).filter(id => w.actors[id].cur.at_war > 0));
      const seenCon = new Set(Object.keys(w.actors).filter(id => w.actors[id].cur.intrastate > 0));
      for (let h = 1; h <= 20; h++) {
        stepYear(w, rng);
        for (const [id, a] of Object.entries(w.actors)) {
          if (a.cur.at_war > 0) { if (!seenWar.has(id)) openWar.set(id, (openWar.get(id) ?? 0) + 1); }
          else { if (openWar.has(id)) { warRuns.push(openWar.get(id)); openWar.delete(id); } seenWar.delete(id); }
          if (a.cur.intrastate > 0) { if (!seenCon.has(id)) openCon.set(id, (openCon.get(id) ?? 0) + 1); }
          else { if (openCon.has(id)) { conflictRuns.push(openCon.get(id)); openCon.delete(id); } seenCon.delete(id); }
        }
      }
    }
    show(`engine at_war runs, as-of ${asOf}`, hist(warRuns));
    show(`engine intrastate runs, as-of ${asOf}`, hist(conflictRuns));
  }
}

// ---------------------------------------------------------------- 3. the four named cases
console.log('\n=== 3. the four cases the package names (modal termination decade) ===\n');
const decade = (y) => `${Math.floor(y / 10) * 10}s`;
function caseRecord(asOf, id, observedYear) {
  const fits = fitsAt(asOf); const years = []; let never = 0;
  for (let r = 0; r < RUNS; r++) {
    const rng = mulberry32(asOf * 104729 + r); const w = world(asOf, fits);
    const entry = w.corridors.find(e => e.rec.id === id);
    if (!entry) { console.log(`  ${id}: not a record at as-of ${asOf}`); return; }
    if (!IMPAIRED.has(entry.state?.status)) { console.log(`  ${id} @${asOf}: the record is '${entry.state?.status}' at as-of — not impaired, nothing to reopen`); return; }
    let hit = null;
    for (let h = 1; h <= 40 && hit == null; h++) for (const e of stepYear(w, rng)) if (e.kind === 'record_reopen' && e.record === id) hit = e.year;
    if (hit == null) never++; else years.push(hit);
  }
  report(`${id} reopen, as-of ${asOf}`, years, never, observedYear);
}
function caseWar(asOf, a, b, observedYear) {
  const fits = fitsAt(asOf); const years = []; let never = 0;
  for (let r = 0; r < RUNS; r++) {
    const rng = mulberry32(asOf * 104729 + r); const w = world(asOf, fits);
    if (!w.warSpells.has(pairKey(a, b))) { console.log(`  ${a}|${b} @${asOf}: no war spell running at as-of`); return; }
    let hit = null;
    for (let h = 1; h <= 40 && hit == null; h++) for (const e of stepYear(w, rng)) if (e.kind === 'war_end' && pairKey(e.a, e.b) === pairKey(a, b)) hit = e.year;
    if (hit == null) never++; else years.push(hit);
  }
  report(`${a}|${b} war ends, as-of ${asOf}`, years, never, observedYear);
}
function report(label, years, never, observed) {
  const counts = {}; for (const y of years) counts[decade(y)] = (counts[decade(y)] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((p, q) => q[1] - p[1]);
  const modal = ranked[0]?.[0] ?? '—';
  const obsD = decade(observed);
  const rank = ranked.findIndex(([d]) => d === obsD) + 1;
  const ok = modal === obsD;
  // the modal decade alone hides a tie: two of these four cases are separated by a few runs, so the observed decade's
  // own share and rank are printed next to the verdict rather than a bare PASS.
  console.log(`  ${label.padEnd(34)} observed ${observed} (${obsD})  modal ${modal} ${ok ? 'PASS' : 'MISS'}  observed decade ranked ${rank || '—'} at ${pct((counts[obsD] ?? 0) / RUNS)}  [${ranked.slice(0, 4).map(([d, n]) => `${d} ${pct(n / RUNS)}`).join(', ')}${never ? `, never ${pct(never / RUNS)}` : ''}]  median ${years.length ? years.sort((p, q) => p - q)[Math.floor(years.length / 2)] : '—'}`);
}
caseRecord(1956, 'suez', 1957);
caseRecord(1968, 'suez', 1975);
caseRecord(1985, 'hormuz', 1988);
caseWar(1982, 'IRN', 'IRQ', 1988);

// ---------------------------------------------------------------- 4. the 2026 direction check
console.log('\n=== 4. the 2026 world: what the live spells do forward (published engine: war spells off) ===\n');
{
  delete process.env.WAR_DURATION_ON;
  const asOf = panel.meta.y1;
  const fits = JSON.parse(readFileSync('data/fits.json', 'utf8')).fits;
  const w0 = world(asOf, fits);
  const impaired = w0.corridors.filter(e => e.state && IMPAIRED.has(e.state.status));
  const contests = w0.territories.filter(e => e.state && !RESOLVED.has(e.state.status));
  console.log(`${impaired.length} impaired records and ${contests.length} live contests at as-of ${asOf}`);
  const reopen = {}, settle = {};
  for (let r = 0; r < RUNS; r++) {
    const rng = mulberry32(20260907 + r); const w = world(asOf, fits);
    const seen = new Set();   // first occurrence per record per run: a record can close and reopen twice in 40 years
    for (let h = 1; h <= 40; h++) for (const e of stepYear(w, rng)) {
      const m = e.kind === 'record_reopen' ? reopen : e.kind === 'territory_settle' ? settle : null;
      if (!m || seen.has(e.kind + e.record)) continue;
      seen.add(e.kind + e.record); (m[e.record] ??= []).push(e.year);
    }
  }
  const line = (m, ids, what) => { for (const id of ids) { const ys = (m[id] ?? []).sort((a, b) => a - b); console.log(`  ${id.padEnd(26)} P(${what} within 40y) ${pct(ys.length / RUNS).padStart(5)}   median year ${ys.length ? ys[Math.floor(ys.length / 2)] : '—'}`); } };
  line(reopen, impaired.map(e => e.rec.id), 'reopens');
  line(settle, contests.map(e => e.rec.id).slice(0, 12), 'settles');
  const nSettle = contests.map(e => (settle[e.rec.id] ?? []).length / RUNS);
  console.log(`  (${contests.length} contests, mean P(settle within 40y) ${pct(nSettle.reduce((a, b) => a + b, 0) / Math.max(1, nSettle.length))})`);
}
