// V-Dem indicators the panel did not carry -> merged into data/panel.json (idempotent: re-running replaces them).
//
// Source: V-Dem v16 country-year, from the `vdemdata` R package (https://github.com/vdeminstitute/vdemdata,
// data/vdem.RData — v-dem.net is not reachable from the build environment), subset to the columns below by
//   python3 -c "import pyreadr; ..."   (scripts/README note in the commit; the CSV is data/raw/hist/vdem_v16_subset.csv)
// Rows are matched to model ids through the year-aware CoW code map (scripts/lib/hist.mjs).
//
// Columns written (0-1 unless noted, higher = more of the named thing):
//   freexp   v2x_freexp_altinf   freedom of expression and alternative sources of information — glasnost is here:
//                                the USSR reads 0.04 in 1985, 0.29 in 1987, 0.56 in 1990
//   corr     v2x_corr            political corruption
//   civlib   v2x_civlib          civil liberties
//   rule     v2x_rule            rule of law
//   repress  -v2csreprss         civil-society repression (sign flipped: higher = more repression; a latent scale, ~-4..4)
//
// Also writes two derived event kinds into data/events.json (replacing any earlier copies of them):
//   opening   freexp rises by >= OPEN_STEP in one year while the regime is an autocracy (RoW 0-1) — liberalisation from
//             above: Khrushchev's thaw, the Prague Spring, Spain 1976, glasnost 1986-87, Taiwan 1987
//   closing   freexp falls by >= OPEN_STEP in one year (a crackdown: Czechoslovakia 1969, Poland 1981, China 1989)
// The event carries `size` (the step), so the engine can move the state by the size actually observed.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, makeCodeMap } from './lib/hist.mjs';

const OPEN_STEP = 0.05;
const COLS = { freexp: 'v2x_freexp_altinf', corr: 'v2x_corr', civlib: 'v2x_civlib', rule: 'v2x_rule', repress: 'v2csreprss' };
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = panel.meta.y0, N = panel.years.length;
const cow = makeCodeMap(loadActors(), 'cow');
const lines = readFileSync('data/raw/hist/vdem_v16_subset.csv', 'utf8').trim().split('\n');
const head = lines[0].split(','); const ix = Object.fromEntries(head.map((h, i) => [h, i]));
// country names carry commas inside quotes: parse the quoted field out
const parse = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };

for (const a of Object.values(panel.actors)) for (const c of Object.keys(COLS)) delete a[c];
let rows = 0, hit = 0; const miss = new Map();
for (const l of lines.slice(1)) {
  const r = parse(l); rows++;
  const y = +r[ix.year], code = r[ix.COWcode]; if (!code || y < Y0 || y >= Y0 + N) continue;
  const m = cow(+code, y); const id = typeof m === 'string' ? m : m?.id; if (!id || !panel.actors[id]) { miss.set(r[ix.country_name], (miss.get(r[ix.country_name]) ?? 0) + 1); continue; }
  if (!panel.actors[id].live?.[y - Y0]) continue;
  const A = panel.actors[id]; hit++;
  for (const [c, src] of Object.entries(COLS)) { const v = r[ix[src]]; if (v === '' || v == null) continue; (A[c] ??= new Array(N).fill(null))[y - Y0] = c === 'repress' ? -(+v) : +v; }
}
for (const c of Object.keys(COLS)) panel.meta.sources[c] = `V-Dem v16 ${COLS[c]}${c === 'repress' ? ' (sign flipped)' : ''} via the vdemdata package; scripts/build-vdem-extra.mjs`;
writeFileSync('data/panel.json', JSON.stringify(panel));

// derived events
const ev = JSON.parse(readFileSync('data/events.json', 'utf8'));
ev.events = ev.events.filter(e => e.kind !== 'opening' && e.kind !== 'closing');
let nO = 0, nC = 0;
for (const [id, a] of Object.entries(panel.actors)) {
  if (!a.freexp) continue;
  for (let i = 1; i < N; i++) {
    const x0 = a.freexp[i - 1], x1 = a.freexp[i]; if (x0 == null || x1 == null) continue;
    const d = x1 - x0; const reg = a.regime?.[i - 1];
    if (d >= OPEN_STEP && reg != null && reg <= 1) { ev.events.push({ kind: 'opening', actor: id, year: Y0 + i, size: +d.toFixed(3), from: +x0.toFixed(3), source: 'V-Dem v16 v2x_freexp_altinf' }); nO++; }
    else if (d <= -OPEN_STEP) { ev.events.push({ kind: 'closing', actor: id, year: Y0 + i, size: +(-d).toFixed(3), from: +x0.toFixed(3), source: 'V-Dem v16 v2x_freexp_altinf' }); nC++; }
  }
}
writeFileSync('data/events.json', JSON.stringify(ev));
console.log(`vdem rows ${rows}, matched live actor-years ${hit}; unmatched countries ${miss.size} (${[...miss.keys()].slice(0, 12).join(', ')}); events: ${nO} opening, ${nC} closing`);
