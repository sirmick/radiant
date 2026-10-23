// Engine replay, transition half (docs/plan-structure.md A2): step the record one year at a time through the engine's
// own state rewrites and list every place the result disagrees with the record's next year.
// Run: node scripts/analysis/replay-diff.mjs [--from 1816] [--to 2025] [--json scores/replay-diff.json] [--show 20]
import { writeFileSync } from 'node:fs';
import { loadEngineInputs, worldArgs } from '../lib/inputs.mjs';
import { recordWorld, transitionDiff, eventsByYear } from '../../src/engine/replay.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const inp = loadEngineInputs();
const FROM = +arg('from', inp.panel.meta.y0), TO = +arg('to', inp.panel.meta.y1), SHOW = +arg('show', 12);
const args = worldArgs(inp, FROM);
const byYear = eventsByYear(inp.events);
const diffs = [];
let prev = recordWorld(args, FROM);
for (let y = FROM + 1; y <= TO; y++) { const w = recordWorld(args, y); diffs.push(...transitionDiff(prev, w, byYear.get(y) ?? [])); prev = w; }
const tally = {};
for (const d of diffs) { const k = `${d.var}:${d.cause}`; tally[k] = (tally[k] ?? 0) + 1; }
console.log(`replay-diff ${FROM}-${TO}: ${diffs.length} transitions the engine's rewrites do not reproduce`);
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(40)} ${String(n).padStart(5)}`);
  for (const d of diffs.filter(x => `${x.var}:${x.cause}` === k).slice(0, SHOW)) console.log(`      ${d.year} ${d.actor.padEnd(4)} ${d.from} -> predicted ${d.predicted}, observed ${d.observed}${d.events?.length ? `  events ${d.events.join(',')}` : ''}`);
}
const out = arg('json', null);
if (out) writeFileSync(out, JSON.stringify({ meta: { built: new Date().toISOString(), from: FROM, to: TO, n: diffs.length, tally }, diffs }, null, 1));
