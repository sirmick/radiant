// The three tests that decide operator / capability-waves (package 12), and the diagnostics beside them.
//
//   (a) ATTAINMENT TIMING, HELD-OUT WAVES. Fit the wave_attain hazard on the waves introduced before 1900 and predict
//       the order and decade of sovereign attainment for the 20th-century waves. Reported per wave: the Spearman rank
//       correlation of predicted against actual attainment year over the actors with a dated `sovereign_by`, and the
//       share whose decade is right. The bar the package set: rank r >= 0.6 on at least three of five.
//   (b) OUTCOMES. Does the wave-weighted share predict who prevails in a militarised dispute at least as well as CINC
//       (AUC of "the stronger side prevails"), and better by >= 0.02 after 1945? Ground truth is the GML MID 2.2.1
//       `outcome` codes — 1 victory for side A, 2 victory for side B, 3 yield by A, 4 yield by B — over the dyads whose
//       dispute ends decisively. Capability is read in the year BEFORE the dispute year, so nothing in the predictor
//       is measured after the thing it predicts.
//   (c) POLARITY. The derived era boundaries recomputed with the wave share in place of CINC inside
//       src/engine/polarity.js's projection-weighted capability, against the ones the panel carries.
//
// Usage: node scripts/analysis/waves.mjs
import { readFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, loadPacts } from '../lib/hist.mjs';
import { createFitter, loadFitInputs, fitLogistic, predict, auc } from '../lib/fit.mjs';
import { spearman } from '../lib/capability.mjs';
import { POLARITY, normalise, projectionShares, smoothShares, classify } from '../../src/engine/polarity.js';
import { WAVES, loadWaves, attainRows, waveWeight, DOCUMENTED_FROM } from '../../src/engine/waves.js';

const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = panel.meta.y0, Y1 = panel.meta.y1;
const pv = (id, v, y) => panel.actors[id]?.[v]?.[y - Y0] ?? null;
const inputs = loadFitInputs();
const waves = inputs.waves;
const templates = inputs.templates;
const T = templates.find(t => t.id === 'wave_attain');
const pacts = inputs.pacts;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const allied = (a, b, y) => pacts.has(`${pairKey(a, b)}|${y}`);
const fmt = (x, n = 3) => (x == null || Number.isNaN(x) ? '  —  ' : x.toFixed(n));

console.log(`waves: ${waves.length} in data/waves.yaml, ${waves.filter(w => w.introduced >= DOCUMENTED_FROM).length} of them documented per sovereign_by entry (DOCUMENTED_FROM ${DOCUMENTED_FROM})`);

// ---------------------------------------------------------------- the at-risk floor, and what it costs
{
  const all = attainRows({ waves, panel, allied, window: T.window, lead: T.lead ?? 1, minIndustry: 0 });
  console.log('\nat-risk floor sweep (WAVES.min_industry):');
  for (const th of [0, 1e-4, 3e-4, 1e-3, 3e-3]) {
    const keep = all.filter(r => (pv(r.actor, 'industry_share', r.year) ?? 0) >= th);
    const ev = keep.filter(r => r.y).length;
    console.log(`  ${String(th).padStart(7)}  rows ${String(keep.length).padStart(7)}  attainments ${String(ev).padStart(4)}  rate ${(ev / keep.length * 100).toFixed(3)}%${th === WAVES.min_industry ? '   <- in use' : ''}`);
  }
  const evAll = all.filter(r => r.y).length;
  const evKept = all.filter(r => r.y && (pv(r.actor, 'industry_share', r.year) ?? 0) >= WAVES.min_industry).length;
  console.log(`  structural misses at the floor in use: ${evAll - evKept} of ${evAll} observed attainments are below it and can never be predicted`);
}

// ---------------------------------------------------------------- (a) attainment timing on held-out waves
// The cohort split is by WAVE, not by year: train on everything introduced before 1900, predict the five 20th-century
// waves the package names. The diffusion covariate is the observed holder share of the wave being predicted; it is
// common to every actor in a given year, so it cannot move the within-wave RANKING that test (a) grades — and it is
// what a forecaster watching a wave spread would have.
const HELD = ['aviation', 'radio_radar', 'nuclear', 'space', 'semiconductors'];
const trainFilter = (w) => w.introduced < 1900;
const encodeRows = (rows) => {
  const cols = [];
  for (const c of T.covariates) {
    const v = c.var;
    if (c.transform === 'z') {
      const xs = rows.map(r => r.feats[v]); const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)) || 1;
      cols.push({ name: `z(${v})`, prior: c.prior, mean: m, sd, get: r => (r.feats[v] - m) / sd });
    } else cols.push({ name: v, prior: c.prior, get: r => r.feats[v] });
  }
  return cols;
};
{
  const train = attainRows({ waves, panel, allied, window: T.window, lead: T.lead ?? 1, waveFilter: trainFilter });
  const cols = encodeRows(train);
  const X = train.map(r => [1, ...cols.map(c => c.get(r))]);
  const yv = train.map(r => r.y);
  const beta = fitLogistic(X, yv, [0, ...cols.map(c => c.prior)]);
  const evTrain = yv.reduce((a, b) => a + b, 0);
  console.log(`\n(a) attainment timing, held-out waves`);
  console.log(`    train: waves introduced before 1900 (${waves.filter(trainFilter).map(w => w.id).join(', ')}) — ${train.length} rows, ${evTrain} attainments`);
  console.log(`    coefficients: ${cols.map((c, j) => `${c.name} ${beta[j + 1] >= 0 ? '+' : ''}${beta[j + 1].toFixed(2)}`).join('  ')}`);
  const eta = (r) => beta[0] + cols.reduce((s, c, j) => s + beta[j + 1] * c.get(r), 0);
  const rows = [];
  let pass = 0;
  for (const wid of HELD) {
    const w = waves.find(x => x.id === wid);
    const rs = attainRows({ waves, panel, allied, window: [w.introduced, T.window[1]], lead: T.lead ?? 1, waveFilter: (x) => x.id === wid, minIndustry: 0 });
    // one hazard path per actor: predicted time is E[min(T, window end)] = sum of survival, which is monotone in the
    // hazard and needs no threshold. An actor whose whole path is at risk to the end is right-censored at the end.
    const byActor = new Map();
    for (const r of rs) (byActor.get(r.actor) ?? byActor.set(r.actor, []).get(r.actor)).push(r);
    const pred = [], act = [], names = [];
    for (const [id, path] of byActor) {
      const truth = w.sovereign_by?.[id];
      if (truth == null) continue;                       // only actors with a dated attainment are graded
      path.sort((p, q) => p.year - q.year);
      let S = 1, E = 0;
      for (const r of path) { const p = 1 / (1 + Math.exp(-eta(r))); E += S; S *= (1 - p); }
      E += S * 5;                                        // the censored tail, five years past the last at-risk year
      pred.push(path[0].year + E); act.push(truth); names.push(id);
    }
    if (pred.length < 4) { console.log(`    ${wid.padEnd(15)} n=${pred.length} — too few dated actors to rank`); continue; }
    const rho = spearman(pred, act);
    const dec = pred.filter((p, i) => Math.floor(p / 10) === Math.floor(act[i] / 10)).length / pred.length;
    const ok = rho >= 0.6;
    if (ok) pass++;
    rows.push({ wid, n: pred.length, rho, dec });
    console.log(`    ${wid.padEnd(15)} n=${String(pred.length).padStart(3)}  spearman ${fmt(rho)}  decade right ${(dec * 100).toFixed(0)}%  ${ok ? 'PASS' : 'fail'}`);
  }
  console.log(`    (a) ${pass}/5 waves at rank r >= 0.6 — the bar is 3 of 5: ${pass >= 3 ? 'PASS' : 'FAIL'}`);
}

// ---------------------------------------------------------------- (b) dispute outcomes: wave share against CINC
{
  const actors = loadActors(); const code = makeCodeMap(actors);
  const rows = readCsv('data/raw/hist/gml_dirdisp_2.2.1.csv');
  // one undirected row per dispute-pair, at the dispute's first observed year
  const seen = new Map();
  for (const r of rows) {
    const y = +r.year, o = +r.outcome;
    if (!(o === 1 || o === 2 || o === 3 || o === 4)) continue;      // decisive outcomes only
    const a = code(r.ccode1, y), b = code(r.ccode2, y);
    if (!a || !b || a === b) continue;
    const k = `${r.dispnum}|${pairKey(a, b)}`;
    const prev = seen.get(k);
    if (prev && prev.year <= y) continue;
    // sidea1 = 1 when ccode1 is on side A. "state1 prevails" = (A wins and 1 is on A) or (B wins and 1 is on B).
    const oneOnA = +r.sidea1 === 1;
    const aWins = o === 1 || o === 4;
    seen.set(k, { year: y, one: a, two: b, win: (aWins === oneOnA) ? 1 : 0 });
  }
  const obs = [...seen.values()].sort((p, q) => p.year - q.year);
  const score = (v, from, to) => {
    const p = [], yv = [];
    for (const d of obs) {
      if (d.year < from || d.year > to) continue;
      const c1 = pv(d.one, v, d.year - 1), c2 = pv(d.two, v, d.year - 1);
      if (!(c1 > 0) || !(c2 > 0)) continue;
      p.push(Math.log(c1 / c2)); yv.push(d.win);
    }
    return { n: p.length, auc: p.length >= 20 ? auc(p, yv) : null, base: yv.reduce((a, b) => a + b, 0) / Math.max(1, yv.length) };
  };
  console.log('\n(b) MID outcomes — AUC of "the stronger side prevails", capability read at the year before the dispute');
  console.log(`    ${obs.length} decisive dispute-dyads (outcome 1-4) in the source; side 1 prevails in ${(obs.reduce((a, d) => a + d.win, 0) / obs.length * 100).toFixed(1)}% of them`);
  console.log('    window        n     CINC   wave_share   delta   | industry  milex  wave_attained');
  const wins = [];
  for (const [label, from, to] of [['1900-2001', 1900, 2001], ['1900-2010', 1900, 2010], ['1900-1945', 1900, 1945], ['1946-2001', 1946, 2001], ['1946-2010', 1946, 2010]]) {
    const c = score('cinc', from, to), w = score('wave_share', from, to);
    const d = c.auc != null && w.auc != null ? w.auc - c.auc : null;
    wins.push([label, d]);
    // the three decompositions: is the wave index doing anything its own industrial input does not already do, and is
    // the mobilised half (military expenditure) a better single answer than either?
    const i = score('industry_share', from, to), m = score('milex', from, to), at = score('wave_attained', from, to);
    console.log(`    ${label}  ${String(c.n).padStart(4)}   ${fmt(c.auc)}     ${fmt(w.auc)}     ${d == null ? '  —  ' : (d >= 0 ? '+' : '') + d.toFixed(3)}  |  ${fmt(i.auc)}  ${fmt(m.auc)}   ${fmt(at.auc)}`);
  }
  const overall = wins.find(x => x[0] === '1900-2001')[1];
  const modern = wins.find(x => x[0] === '1946-2001')[1];
  const pass = overall != null && modern != null && overall >= 0 && modern >= 0.02;
  console.log(`    (b) at least as good over 1900-2001 (delta ${overall == null ? '—' : overall.toFixed(3)}) and better by >= 0.02 after 1945 (delta ${modern == null ? '—' : modern.toFixed(3)}): ${pass ? 'PASS' : 'FAIL'}`);
}

// ---------------------------------------------------------------- (c) polarity from the wave share
{
  const liveAt = (id, y) => pv(id, 'live', y) === 1;
  const shares = (v, y) => {
    const m = new Map();
    for (const id of Object.keys(panel.actors)) { if (!liveAt(id, y)) continue; const x = pv(id, v, y); if (x > 0) m.set(id, x); }
    return normalise(m);
  };
  const run = (capVar) => {
    let sm = null; const out = [];
    for (let y = Y0; y <= Y1; y++) {
      const raw = projectionShares(shares(capVar, y), shares('milex', y));
      if (!raw.size) { out.push(null); continue; }
      sm = smoothShares(sm, raw, POLARITY.lambda, new Set(raw.keys()));
      const st = classify(sm);
      out.push(st ? st.polarity : null);
    }
    return out;
  };
  const runs = (series) => {
    const out = []; let cur = null;
    series.forEach((p, i) => { const y = Y0 + i; if (p !== cur) { if (cur) out[out.length - 1].b = y - 1; if (p) out.push({ p, a: y, b: Y1 }); cur = p; } });
    return out;
  };
  const base = runs(run('cinc')), wave = runs(run('wave_share'));
  const longest = (rs, p) => rs.filter(r => r.p === p).sort((a, b) => (b.b - b.a) - (a.b - a.a))[0] ?? null;
  console.log('\n(c) derived polarity with the wave share in place of CINC');
  let worst = 0;
  for (const p of ['bipolar', 'unipolar']) {
    const B = longest(base, p), W = longest(wave, p);
    const shift = B && W ? Math.max(Math.abs(B.a - W.a), Math.abs(B.b - W.b)) : null;
    if (shift != null) worst = Math.max(worst, shift);
    console.log(`    longest ${p.padEnd(10)} CINC ${B ? `${B.a}-${B.b}` : 'none'}   wave ${W ? `${W.a}-${W.b}` : 'none'}   boundary shift ${shift == null ? '—' : shift + 'y'}`);
  }
  console.log(`    (c) worst boundary shift ${worst}y — the bar is <= 5y: ${worst <= 5 ? 'PASS' : 'FAIL'}`);
}

// ---------------------------------------------------------------- displacement sensitivity
{
  console.log('\ndisplacement weights (WAVES.retire_half_life = ' + WAVES.retire_half_life + 'y):');
  for (const y of [1870, 1900, 1945, 1990, 2025]) {
    const on = waves.filter(w => w.introduced <= y).map(w => `${w.id} ${waveWeight(w, y).toFixed(2)}`).filter((_, i, arr) => arr.length);
    console.log(`  ${y}: ${on.join('  ')}`);
  }
}
