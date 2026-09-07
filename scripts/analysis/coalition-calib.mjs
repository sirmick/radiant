// Calibrate p_join, the coalition-joining probability (era-1914-1945/engine-1), from the one place country names are
// allowed: the `sides:` lists of the hand-coded wars in data/history/events.yaml, against CoW alliance v3.03 defence
// pacts (sstype 1) in the war's start year.
//
// Two rates, because the engine can apply the rule at two granularities:
//   --per war        for each war, take the pair that starts it (earliest entrant on each side by `entries:`, the
//                    listed order otherwise); the states at risk are every live state holding a defence pact with
//                    either of the two in that year; a joiner is one of those that appears in the war's sides.
//   --per draw       the same numerator over the denominator the engine actually samples: allies-at-risk summed over
//                    dyadic war-years (every cross-side pair, every year it is at war), which is one joining draw per
//                    ally per dyadic war-year. Printed twice: over every ally of the pair (the engine's own
//                    denominator — it redraws allies that are already belligerents) and over the allies still out of
//                    the war that year (the historical rate a joining rule is trying to reproduce).
// Run: node scripts/coalition-calib.mjs [--verbose]
import { readFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap } from '../lib/hist.mjs';
import { warDyadSpans } from '../../src/engine/core.js';

const VERBOSE = process.argv.includes('--verbose');
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = panel.meta.y0;
const live = (id, y) => panel.actors[id]?.live?.[y - Y0] === 1;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const actors = loadActors(); const code = makeCodeMap(actors);
const pacts = new Set();
for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) {
  if (r.sstype !== '1') continue; const y = +r.year, a = code(r.ccode1, y), b = code(r.ccode2, y);
  if (a && b) pacts.add(`${pairKey(a, b)}|${y}`);
}
const allyOf = (id, y) => {
  const out = [];
  for (const other of Object.keys(panel.actors)) if (other !== id && pacts.has(`${pairKey(id, other)}|${y}`)) out.push(other);
  return out;
};

const wars = Y('data/history/events.yaml').filter(e => e.kind === 'war' && Array.isArray(e.sides) && e.sides.length >= 2);

// ---------------------------------------------------------------- per war: the starting pair's allies
let atRisk = 0, joiners = 0; const perWar = [];
for (const w of wars) {
  const y = Math.floor(w.start);
  const first = (side) => side.slice().sort((a, b) => (w.entries?.[a] ?? w.start) - (w.entries?.[b] ?? w.start))[0];
  const [a, b] = [first(w.sides[0]), first(w.sides[1])];
  const inWar = new Set([...w.sides[0], ...w.sides[1]]);
  const cands = new Set();
  for (const m of [a, b]) for (const c of allyOf(m, y)) if (c !== a && c !== b && live(c, y)) cands.add(c);
  const joined = [...cands].filter(c => inWar.has(c));
  atRisk += cands.size; joiners += joined.length;
  perWar.push({ id: w.id, year: y, start: `${a}|${b}`, at_risk: cands.size, joined: joined.length });
}
perWar.sort((p, q) => q.joined - p.joined || q.at_risk - p.at_risk);
console.log(`per war:  ${joiners} joiners / ${atRisk} allies at risk over ${wars.length} wars = ${(joiners / atRisk).toFixed(4)}`);
for (const r of perWar) if (VERBOSE || r.joined) console.log(`  ${r.id.padEnd(22)} ${r.year}  ${String(r.joined).padStart(3)} / ${String(r.at_risk).padStart(3)}   (${r.start})`);

// ---------------------------------------------------------------- per dyadic war-year: the draws the engine makes
let dyadYears = 0, draws = 0, drawsOut = 0;
for (const w of wars) {
  const end = w.end ?? 2026;
  const span = (a) => [Math.floor(w.entries?.[a] ?? w.start), Math.floor(w.exits?.[a] ?? end)];
  for (const a of w.sides[0]) for (const b of w.sides[1]) {
    const [a0, a1] = span(a), [b0, b1] = span(b);
    for (let y = Math.max(a0, b0); y <= Math.min(a1, b1); y++) {
      dyadYears++;
      const inWarNow = new Set([...w.sides[0], ...w.sides[1]].filter(m => { const [s, e] = span(m); return y >= s && y <= e; }));
      const cands = new Set();
      for (const m of [a, b]) for (const c of allyOf(m, y)) if (c !== a && c !== b && live(c, y)) cands.add(c);
      draws += cands.size; drawsOut += [...cands].filter(c => !inWarNow.has(c)).length;
    }
  }
}
console.log(`per draw: ${joiners} joiners / ${draws} ally-draws over ${dyadYears} dyadic war-years = ${(joiners / draws).toFixed(4)}  (${(draws / dyadYears).toFixed(2)} allies per dyadic war-year)`);
console.log(`          allies still out of the war: ${drawsOut} draws = ${(joiners / drawsOut).toFixed(4)}  (${(drawsOut / dyadYears).toFixed(2)} per dyadic war-year)`);
