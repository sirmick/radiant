// operator / modern-capability (package 10): the test that decides it.
//   1. the composite tracks CINC with r >= 0.95 over 1990-2016 (and over the whole NMC overlap)
//   2. no `cinc` value older than 5 years in the 2025 world
//   3. the staleness field is present on every carried value
// Run: node scripts/analysis/capability-composite.mjs
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { loadActors, makeOwidMap } from '../lib/hist.mjs';
import { COMPONENTS, MISSING_COMPONENTS, SPLICE_YEARS, compositeShares, spliceComposite, validate } from '../lib/capability.mjs';
import { createWorld } from '../../src/engine/core.js';

const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = panel.meta.y0, Y1 = panel.meta.y1;
const owid = makeOwidMap(loadActors());
const liveAt = (id, y) => !!panel.actors[id]?.live?.[y - Y0];
const spliced = (id, y) => panel.actors[id]?.cinc_spliced?.[y - Y0];
// CINC as NMC measured it: the spliced years are excluded so the composite is never compared with itself
const cincOf = (id, y) => (spliced(id, y) === 1 ? null : panel.actors[id]?.cinc?.[y - Y0] ?? null);
let lastNmc = 0;
for (const v of Object.values(panel.actors)) v.cinc?.forEach((x, i) => { if (x != null && v.cinc_spliced?.[i] === 0 && Y0 + i > lastNmc) lastNmc = Y0 + i; });

console.log(`components: ${COMPONENTS.map(c => `${c.stands_for}<-${c.id}`).join(', ')}`);
console.log(`missing:    ${MISSING_COMPONENTS.map(m => m.stands_for).join(', ')}`);
const { composite } = compositeShares({ from: 1960, to: Y1, idOf: owid, liveAt });

console.log('\n1. composite vs CINC (level r / log r / n actor-years)');
for (const [from, to] of [[1990, 2001], [1990, 2016], [1990, lastNmc], [2000, lastNmc]]) {
  const v = validate({ composite, cincOf, liveAt, from, to });
  console.log(`   ${from}-${to}  r=${v.r?.toFixed(4)}  log r=${v.r_log?.toFixed(4)}  n=${v.n}`);
}
// rank agreement over the top of the distribution, where the dyadic templates actually read it
{
  const y = 2016, rows = Object.keys(composite).filter(id => liveAt(id, y) && cincOf(id, y) != null && composite[id][y] != null)
    .map(id => ({ id, k: composite[id][y], c: cincOf(id, y) })).sort((a, b) => b.c - a.c).slice(0, 20);
  const rk = [...rows].sort((a, b) => b.k - a.k);
  console.log(`   top-20 by CINC in ${y}: ${rows.filter((r, i) => rk[i].id === r.id).length}/20 in the same rank position; ` +
    `spearman-style mean |rank shift| ${(rows.reduce((s, r, i) => s + Math.abs(i - rk.findIndex(x => x.id === r.id)), 0) / rows.length).toFixed(2)}`);
}

console.log('\n2. staleness of cinc in the 2025 world');
const events = JSON.parse(readFileSync('data/events.json', 'utf8'));
const fits = JSON.parse(readFileSync('data/fits.json', 'utf8'));
const templates = parseYaml(readFileSync('data/templates.yaml', 'utf8')).templates;
const contiguity = JSON.parse(readFileSync('data/contiguity.json', 'utf8'));
const pacts = JSON.parse(readFileSync('data/panel.json', 'utf8')).pacts ?? [];
for (const universe of ['modeled', 'all']) {
  const w = createWorld({ panel, events: events.events ?? events, fits, templates, asOf: 2025, pacts, contiguity: contiguity.pairs ?? contiguity, universe, contiguityFrom: 1886 });
  const ids = Object.keys(w.actors);
  const st = ids.map(id => [id, w.actors[id].stale?.cinc ?? 0]);
  const worst = st.filter(([, s]) => s > 5).sort((a, b) => b[1] - a[1]);
  const carried = ids.filter(id => Object.keys(w.actors[id].stale ?? {}).length);
  const hist = {}; for (const [, s] of st) hist[s] = (hist[s] ?? 0) + 1;
  console.log(`   universe=${universe}: ${ids.length} actors; cinc staleness ${Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}y:${v}`).join(' ')}` +
    `; older than 5y: ${worst.length}${worst.length ? ` (${worst.slice(0, 8).map(([id, s]) => `${id} ${s}y`).join(', ')})` : ''}`);
  console.log(`   universe=${universe}: ${carried.length}/${ids.length} actors carry at least one stale value; staleness recorded for ${new Set(carried.flatMap(id => Object.keys(w.actors[id].stale))).size} distinct columns`);
  // 3. every carried value has a staleness entry
  let bad = 0;
  for (const id of ids) {
    const vars = panel.actors[id], a = w.actors[id];
    for (const [v, x] of Object.entries(a.cur)) {
      if (x == null) continue;
      const arr = vars[v]; if (!arr) continue;
      if (arr[2025 - Y0] != null) continue;                 // observed in 2025: not carried
      if (!(v in (a.stale ?? {}))) bad++;
    }
  }
  console.log(`   universe=${universe}: values at as-of that the panel does not observe there and that carry no staleness entry: ${bad}`);
  const kinds = {}; for (const id of ids) for (const k of Object.values(w.actors[id].carry ?? {})) kinds[k] = (kinds[k] ?? 0) + 1;
  console.log(`   universe=${universe}: carry kinds ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}
