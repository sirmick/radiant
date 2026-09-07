// at_war run-length diagnostic: the panel's observed interstate-war spells against the engine's simulated ones.
// The engine used to clear at_war every step and only a fresh dyadic draw re-set it, so a simulated war lasted exactly
// one year whatever it was; era-1914-1945/engine-5 gives a fired mid_war a duration drawn from this same distribution.
// Run: node scripts/war-spells.mjs [--as-of 1920] [--runs 100] [--horizon 20]
import { readFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap } from './lib/hist.mjs';
import { createFitter } from './lib/fit.mjs';
import { createWorld, stepYear, mulberry32, warRunLengths } from '../src/engine/core.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? +process.argv[i + 1] : d; };
const AS_OF = arg('as-of', 1920), RUNS = arg('runs', 100), H = arg('horizon', 20);

const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
const templates = Y('data/templates.yaml').templates;
const contiguityFile = JSON.parse(readFileSync('data/contiguity.json', 'utf8'));
const contiguity = contiguityFile.pairs, contiguityFrom = contiguityFile.meta?.years?.[0] ?? null;
const actors = loadActors(); const code = makeCodeMap(actors);
const successors = Object.fromEntries([...actors.values()].filter(a => a.successor).map(a => [a.id, a.successor]));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const pacts = new Set();
for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) { if (r.sstype !== '1') continue; const y = +r.year, a = code(r.ccode1, y), b = code(r.ccode2, y); if (a && b) pacts.add(`${pairKey(a, b)}|${y}`); }

const histOf = (runs) => {
  const h = {}; for (const r of runs) h[r] = (h[r] ?? 0) + 1;
  const n = runs.length || 1, mean = runs.reduce((a, b) => a + b, 0) / n;
  return { n: runs.length, mean, share1: runs.filter(r => r === 1).length / n, hist: h };
};
const show = (label, s) => console.log(`${label.padEnd(28)} spells=${String(s.n).padStart(5)}  mean=${s.mean.toFixed(2)}  one-year=${(s.share1 * 100).toFixed(0)}%   ${Object.entries(s.hist).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);

// ---- observed: the panel's own at_war runs (all of history, and the part a forecaster at as-of has seen)
const allRuns = []; const Y0 = panel.meta.y0;
for (const vars of Object.values(panel.actors)) { const arr = vars.at_war; if (!arr) continue; let n = 0; for (let i = 0; i < arr.length; i++) { const x = arr[i]; if (x != null && x > 0) n++; else { if (n) allRuns.push(n); n = 0; } } if (n) allRuns.push(n); }
show('panel, all years', histOf(allRuns));
show(`panel, observed by ${AS_OF}`, histOf(warRunLengths(panel, AS_OF)));

// ---- simulated: run the ensemble and read at_war off the actor states each year
const fitter = createFitter({ panel, events, templates, contiguity, pacts });
const fits = fitter.fitAll({ maxYear: AS_OF, holdout: false, ablation: false }).fits;
const simRuns = []; let noNest = 0, wars = 0;
for (let r = 0; r < RUNS; r++) {
  const rng = mulberry32(AS_OF * 7919 + r);
  const w = createWorld({ panel, events, fits, templates, asOf: AS_OF, pacts, contiguity, universe: 'all', successors, contiguityFrom });
  const open = new Map();   // actor -> years of the spell so far (only spells that start inside the run are counted)
  const seen = new Set(Object.keys(w.actors).filter(id => w.actors[id].cur.at_war > 0));   // at war already at as-of: left-censored
  for (let h = 1; h <= H; h++) {
    const fired = stepYear(w, rng);
    const force = new Set(), war = [];
    for (const e of fired) { if (e.kind === 'mid_force') force.add(pairKey(e.a, e.b)); if (e.kind === 'mid_war') war.push(pairKey(e.a, e.b)); }
    wars += war.length; for (const k of war) if (!force.has(k)) noNest++;
    for (const [id, a] of Object.entries(w.actors)) {
      if (a.cur.at_war > 0) { if (!seen.has(id)) open.set(id, (open.get(id) ?? 0) + 1); }
      else { if (open.has(id)) { simRuns.push(open.get(id)); open.delete(id); } seen.delete(id); }
    }
  }
}
show(`engine, as-of ${AS_OF} (${RUNS} runs)`, histOf(simRuns));
console.log(`\nnesting check: ${wars} simulated dyadic wars, ${noNest} of them in a dyad-year with no mid_force in the same run-year`);
