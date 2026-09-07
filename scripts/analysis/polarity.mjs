// operator / derived-polarity (package 9): the test that decides it.
//   1. the derived flags rediscover the historical eras without being told them
//        bipolar ≈ 1947–1991 ± 3, unipolar ≈ 1992–2016 ± 5, promotion era ≈ 1992–2016
//   2. the thresholds are estimates, so the sensitivity of those spans to each of them is reported here
//   3. the derived flags are diffed year by year against the typed ones they replace (`*_dates`)
//   4. the 2025 forward run reports polarity per year, rather than assuming it
// Run: node scripts/analysis/polarity.mjs [--runs 40] [--horizon 40]
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { readCsv, loadActors, makeCodeMap, makeOwidMap } from '../lib/hist.mjs';
import { componentLevels } from '../lib/capability.mjs';
import { POLARITY, normalise, projectionShares, smoothShares, classify, eraFlags, infoFrontier, infoStep, INFO_WAVE } from '../../src/engine/polarity.js';
import { createWorld, stepYear, mulberry32 } from '../../src/engine/core.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('runs', 40), H = +arg('horizon', 40);
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = panel.meta.y0, Y1 = panel.meta.y1, A = panel.actors;
const at = (y) => y - Y0;
const runsOf = (era) => { const out = []; for (const [y, p] of era) { const last = out[out.length - 1]; if (last && last.p === p && last.b === y - 1) last.b = y; else out.push({ p, a: y, b: y }); } return out; };
const longest = (rs, p, containing) => rs.filter(r => r.p === p && (containing == null || (r.a <= containing && r.b >= containing))).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0] ?? null;
const span = (r) => (r ? `${r.a}-${r.b}` : 'none');

// ---- 1. the derived eras, as the build wrote them ---------------------------------------------------------------
const P = panel.meta.polarity;
if (!P) { console.error('panel.meta.polarity is missing — run node scripts/build-panel.mjs'); process.exit(1); }
const era = new Map(P.map(w => [w.year, w.polarity]));
const rs = runsOf(era);
console.log('1. the derived polarity series (from the panel)\n');
for (const r of rs) {
  const w = P.find(x => x.year === r.a);
  console.log(`   ${String(r.a)}-${String(r.b).padEnd(5)} ${r.p.padEnd(10)} ${String(r.b - r.a + 1).padStart(3)}y   poles at ${r.a}: ${w.poles.join(', ')} (top ${(w.hegemon_share * 100).toFixed(1)}%, gap1 ${w.gap1?.toFixed(2)}, gap2 ${w.gap2?.toFixed(2)})`);
}
const bi = longest(rs, 'bipolar', 1970), uni = longest(rs, 'unipolar', 2000);
const promo = runsOf(new Map(P.map(w => [w.year, w.promotion_era ? 'on' : 'off'])));
const promoRun = longest(promo, 'on', 2000);
const anti = runsOf(new Map(P.map(w => [w.year, w.anticoup_norm ? 'on' : 'off'])));
const antiRun = longest(anti, 'on', 2010);
let multi = 0; for (let y = 1870; y <= 1938; y++) if (era.get(y) === 'multipolar') multi++;
const test = (label, got, want, tol) => {
  const [a, b] = want, e = got ? Math.max(Math.abs(got.a - a), Math.abs(got.b - b)) : Infinity;
  console.log(`   ${label.padEnd(28)} derived ${span(got).padEnd(10)} vs ${a}-${b} (±${tol})  worst end off by ${e === Infinity ? '—' : e}  ${e <= tol ? 'PASS' : 'FAIL'}`);
  return e <= tol;
};
console.log('\n   the test that decides the package\n');
const t1 = test('bipolar era', bi, [1947, 1991], 3);
const t2 = test('unipolar era', uni, [1992, 2016], 5);
const t3 = test('promotion era', promoRun, [1992, 2016], 5);
console.log(`   ${'multipolar 1870-1938'.padEnd(28)} ${multi}/69 years  ${multi === 69 ? 'PASS' : 'FAIL'}`);
console.log(`   ${'anti-coup norm'.padEnd(28)} derived ${span(antiRun)} vs the typed 2000-2025 (it can also switch off, and does)`);
console.log(`   states in the whole series      ${rs.length} (${rs.filter(r => r.b - r.a < 2).length} shorter than three years)`);

// ---- 2. sensitivity of those spans to every calibrated threshold -------------------------------------------------
// The construction is rebuilt here from the panel's own columns, so the grid is the real thing and not a summary of it.
const owid = makeOwidMap(loadActors());
let nmcLast = 0; for (const v of Object.values(A)) v.cinc?.forEach((x, i) => { if (x != null && v.cinc_spliced?.[i] === 0 && Y0 + i > nmcLast) nmcLast = Y0 + i; });
const wbMilex = componentLevels({ from: nmcLast + 1, to: Y1, idOf: owid }).milex ?? {};
const liveAt = (id, y) => A[id]?.live?.[at(y)] === 1;
const shareOf = (get) => (y) => { const m = new Map(); for (const id of Object.keys(A)) { if (!liveAt(id, y)) continue; const v = get(id, y); if (v == null || !(v > 0)) continue; m.set(id, v); } return normalise(m); };
const cincShare = shareOf((id, y) => A[id].cinc?.[at(y)]);
const milexShare = shareOf((id, y) => (y <= nmcLast ? A[id].milex?.[at(y)] : wbMilex[id]?.[y]));
const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const cache = new Map();
function build(w, lam, gap) {
  const key = `${w}|${lam}`;
  if (!cache.has(key)) {
    let sm = null; const out = [];
    for (const y of YEARS) {
      const raw = projectionShares(cincShare(y), milexShare(y), w);
      if (!raw.size) { out.push(null); continue; }
      sm = smoothShares(sm, raw, lam, new Set(Object.keys(A).filter(id => liveAt(id, y))));
      out.push(new Map(sm));
    }
    cache.set(key, out);
  }
  const e = new Map();
  cache.get(key).forEach((sm, i) => { if (!sm) return; const st = classify(sm, gap); if (st) e.set(YEARS[i], st.polarity); });
  const r = runsOf(e);
  let m = 0; for (let y = 1870; y <= 1938; y++) if (e.get(y) === 'multipolar') m++;
  return { bi: longest(r, 'bipolar', 1970), uni: longest(r, 'unipolar', 2000), multi: m, states: r.length, blips: r.filter(x => x.b - x.a < 2).length, end: r[r.length - 1] };
}
console.log('\n2. sensitivity of the eras to the three calibrated thresholds (the value in use is marked *)\n');
console.log('   ' + 'weight  λ     gap'.padEnd(24) + 'bipolar      unipolar     multi 1870-1938  states  <3y  last state');
const show = (w, lam, g) => {
  const r = build(w, lam, g);
  const mark = (w === POLARITY.cinc_weight && lam === POLARITY.lambda && g === POLARITY.gap) ? '*' : ' ';
  console.log(`  ${mark}${`${w.toFixed(2)}    ${lam.toFixed(2)}  ${g.toFixed(2)}`.padEnd(24)}${span(r.bi).padEnd(13)}${span(r.uni).padEnd(13)}${String(r.multi).padStart(9)}/69  ${String(r.states).padStart(6)} ${String(r.blips).padStart(4)}  ${r.end ? `${r.end.p} ${span(r.end)}` : '—'}`);
};
for (const w of [0.35, 0.4, 0.5, 0.6, 0.65]) show(w, POLARITY.lambda, POLARITY.gap);
for (const lam of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85]) show(POLARITY.cinc_weight, lam, POLARITY.gap);
for (const g of [1.8, 1.9, 2.0, 2.1, 2.2]) show(POLARITY.cinc_weight, POLARITY.lambda, g);
console.log('\n   and the two constructions the package considered and this one rejects, at the same λ and gap:');
{
  // CINC alone: the share the package's own text proposes, and what it says about the modern world
  let sm = null; const e = new Map();
  for (const y of YEARS) { const raw = cincShare(y); if (!raw.size) continue; sm = smoothShares(sm, raw, POLARITY.lambda, new Set(Object.keys(A).filter(id => liveAt(id, y)))); const st = classify(sm, POLARITY.gap); if (st) e.set(y, `${st.polarity}/${st.hegemon}`); }
  const r = runsOf(e);
  console.log(`   cinc alone:  ${r.slice(-4).map(x => `${span(x)} ${x.p}`).join('   ')}`);
}
{
  let sm = null; const e = new Map();
  for (const y of YEARS) { const raw = milexShare(y); if (!raw.size) continue; sm = smoothShares(sm, raw, POLARITY.lambda, new Set(Object.keys(A).filter(id => liveAt(id, y)))); const st = classify(sm, POLARITY.gap); if (st) e.set(y, `${st.polarity}/${st.hegemon}`); }
  const r = runsOf(e);
  console.log(`   milex alone: ${r.slice(-4).map(x => `${span(x)} ${x.p}`).join('   ')}`);
}

// ---- 3. the derived flags against the typed ones they replace ----------------------------------------------------
console.log('\n3. derived vs typed, year by year (the `*_dates` columns kept for this diff)\n');
const anyActor = Object.values(A).find(v => v.bipolar);
for (const [d, t] of [['bipolar', 'bipolar_dates'], ['unipolar', 'unipolar_us_dates'], ['cold_war', 'cold_war_dates'], ['anticoup_norm', 'anticoup_norm_dates']]) {
  let same = 0, n = 0, onD = 0, onT = 0, dis = [];
  for (let y = Y0; y <= Y1; y++) { const a = anyActor[d]?.[at(y)], b = anyActor[t]?.[at(y)]; if (a == null || b == null) continue; n++; if (a === b) same++; else dis.push(y); if (a) onD++; if (b) onT++; }
  const grp = []; for (const y of dis) { const l = grp[grp.length - 1]; if (l && l[1] === y - 1) l[1] = y; else grp.push([y, y]); }
  console.log(`   ${d.padEnd(15)} agrees ${same}/${n} (${(100 * same / n).toFixed(1)}%)  on: derived ${onD}y, typed ${onT}y  differs: ${grp.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(' ') || 'nowhere'}`);
}
for (const [d, t] of [['great_game', 'great_game_dates'], ['aid_conditionality', 'aid_conditionality_dates'], ['hegemon_regime', 'hegemon_regime_dates']]) {
  let same = 0, n = 0, nzD = 0, nzT = 0;
  for (const v of Object.values(A)) for (let y = Y0; y <= Y1; y++) { const a = v[d]?.[at(y)], b = v[t]?.[at(y)]; if (v.live?.[at(y)] !== 1) continue; if (a == null && b == null) continue; n++; if (a === b) same++; if (a) nzD++; if (b) nzT++; }
  console.log(`   ${d.padEnd(15)} agrees on ${same}/${n} live actor-years (${(100 * same / n).toFixed(1)}%); non-zero: derived ${nzD}, typed ${nzT}`);
}

// ---- 4. the information wave ------------------------------------------------------------------------------------
const W = panel.meta.info_wave ?? INFO_WAVE;
console.log(`\n4. the information wave (replaces the diffusion rate switched by hand at 1985)\n`);
console.log(`   frontier  L=${W.L} r=${W.r} t0=${W.t0} rmse=${W.rmse} on ${W.n} years of the live-actor mean of info_access`);
console.log(`   diffusion kappa=${W.kappa} (an actor closes this much of its gap to the frontier each year), rmse=${W.kappa_rmse} on ${W.kappa_n} simulated year-points`);
{
  const obs = (y) => { let s = 0, n = 0; for (const v of Object.values(A)) { if (v.live?.[at(y)] !== 1) continue; const x = v.info_access?.[at(y)]; if (x == null) continue; s += x; n++; } return n ? s / n : null; };
  console.log('   year   frontier  observed mean');
  for (const y of [1870, 1900, 1950, 1970, 1990, 2000, 2010, 2020, 2024, 2030, 2040]) {
    const o = obs(y);
    console.log(`   ${y}   ${infoFrontier(y, W).toFixed(4)}    ${o == null ? '    —   ' : o.toFixed(4).padStart(8)}`);
  }
  // the rule run forward from three starting years against what the panel then observed, beside the typed switch
  const infoLast = 2024;
  const play = (start, step) => {
    const xs = new Map();
    for (const [id, v] of Object.entries(A)) { const x = v.info_access?.[at(start)]; if (x != null && v.live?.[at(start)] === 1) xs.set(id, x); }
    const path = new Map();
    for (let y = start + 1; y <= infoLast; y++) { for (const [id, x] of xs) xs.set(id, step(x, y)); let s = 0; for (const v of xs.values()) s += v; path.set(y, s / xs.size); }
    const obsOf = (y) => { let s = 0, n = 0; for (const id of xs.keys()) { const x = A[id].info_access?.[at(y)]; if (x == null) continue; s += x; n++; } return n ? s / n : null; };
    return { path, obsOf, n: xs.size };
  };
  const typed = (x, y) => { const r = y >= 1985 ? 0.15 : 0.03; const z = Math.max(0.02, x); return Math.min(1, z + r * z * (1 - z)); };
  for (const start of [1970, 1990, 2000]) {
    const a = play(start, (x, y) => infoStep(x, y, W)), b = play(start, typed);
    console.log(`   from ${start} (n=${a.n}): ` + [1990, 2000, 2010, 2020, 2024].filter(y => y > start)
      .map(y => `${y} fitted ${a.path.get(y).toFixed(3)} typed ${b.path.get(y).toFixed(3)} obs ${a.obsOf(y)?.toFixed(3)}`).join('   '));
  }
  // and what each does to a 19th-century run, where the typed rate is a hand-set 0.03 and the frontier is ~0
  let xa = 0.02, xb = 0.02;
  for (let y = 1871; y <= 1890; y++) { xa = infoStep(xa, y, W); xb = typed(xb, y); }
  console.log(`   a 1870 run, 20 years from the panel floor 0.02: fitted ${xa.toFixed(4)}, typed ${xb.toFixed(4)} (the panel observes 0.02 throughout)`);
}

// ---- 5. polarity in the forward run, reported per year -----------------------------------------------------------
console.log(`\n5. polarity in the ${Y1} forward run, per year (${RUNS} runs × ${H} years)\n`);
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
const { fits } = JSON.parse(readFileSync('data/fits.json', 'utf8'));
const templates = parseYaml(readFileSync('data/templates.yaml', 'utf8')).templates;
const contiguity = JSON.parse(readFileSync('data/contiguity.json', 'utf8')).pairs;
const code = makeCodeMap(loadActors());
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pacts = new Set();
{ const last = new Map(); for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) { if (r.sstype !== '1') continue; const y = +r.year, a = code(r.ccode1, y), b = code(r.ccode2, y); if (!a || !b) continue; const k = pairKey(a, b); pacts.add(`${k}|${y}`); if (y >= 2000) last.set(k, y); } for (const k of last.keys()) pacts.add(`${k}|*`); }
const counts = new Map();   // year -> { polarity: n }
const hegCount = new Map(); // year -> { hegemon: n }
const flips = [];
for (let r = 0; r < RUNS; r++) {
  const w = createWorld({ panel, events, fits, templates, asOf: Y1, pacts, contiguity, universe: 'all', contiguityFrom: 1886 });
  const rng = mulberry32(9000 + r);
  let start = w.pol.state.polarity, flipped = null;
  for (let h = 1; h <= H; h++) {
    stepYear(w, rng);
    const y = w.year, st = w.pol.state;
    const c = counts.get(y) ?? counts.set(y, {}).get(y); c[st.polarity] = (c[st.polarity] ?? 0) + 1;
    const g = hegCount.get(y) ?? hegCount.set(y, {}).get(y); g[st.hegemon] = (g[st.hegemon] ?? 0) + 1;
    if (flipped == null && st.polarity !== start) flipped = y;
  }
  flips.push(flipped);
}
const w0 = createWorld({ panel, events, fits, templates, asOf: Y1, pacts, contiguity, universe: 'all', contiguityFrom: 1886 });
console.log(`   at ${Y1} the world starts ${w0.pol.state.polarity}: poles ${w0.pol.state.poles.join(', ')} (top ${(w0.pol.state.hegemon_share * 100).toFixed(1)}%, gap1 ${w0.pol.state.gap1?.toFixed(2)}, gap2 ${w0.pol.state.gap2?.toFixed(2)}); ` +
  `hegemon regime ${w0.pol.hegemonRegime}, democratic share ${w0.pol.demShare?.toFixed(3)}; era flags ${Object.entries(w0.pol.flags).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
console.log('   year   share of runs by polarity                       leading pole');
for (let y = Y1 + 1; y <= Y1 + H; y++) {
  if ((y - Y1) % 5 && y !== Y1 + H) continue;
  const c = counts.get(y) ?? {}, tot = Object.values(c).reduce((a, b) => a + b, 0) || 1;
  const g = hegCount.get(y) ?? {};
  console.log(`   ${y}   ` + ['unipolar', 'bipolar', 'multipolar'].map(k => `${k} ${((100 * (c[k] ?? 0)) / tot).toFixed(0).padStart(3)}%`).join('  ') +
    '   ' + Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${id} ${((100 * n) / tot).toFixed(0)}%`).join(' '));
}
const f = flips.filter(x => x != null).sort((a, b) => a - b);
console.log(`   ${f.length}/${RUNS} runs leave the ${w0.pol.state.polarity} state inside ${H} years` + (f.length ? `; median first change ${f[Math.floor(f.length / 2)]}` : ''));
