// War outcomes, group composition and strategic rivalries -> merged into data/panel.json (idempotent).
//
// Source: the `peacesciencer` R package's bundled data (https://github.com/svmiller/peacesciencer, data/*.rda — the
// original hosts are not reachable from the build environment), exported to data/raw/hist/ps_*.csv with pyreadr.
//   cow_war_inter   CoW inter-state wars v4, state-year with outcome (1 won, 2 lost, 3 compromise, 4 transformed,
//                   6 stalemate, 8 changed sides)
//   creg            Composition of Religious and Ethnic Groups (Nardulli et al.), 1945+
//   hief            Historical Index of Ethnic Fractionalization (Drazanova), 1945-2013
//   tss_rivalries   Thompson, Sullivan & Dreyer strategic rivalries, with start / end years
// Columns written (CoW-coded, matched through the year-aware code map):
//   war_defeat     1 in the last year of an inter-state war the state lost (outcome 2)
//   ethfrac, relfrac   CREG ethnic / religious fractionalisation;  efindex   HIEF ethnic fractionalisation
//   rivals         strategic rivalries in force;  rival_gp   1 if one of them is with a great power that year
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, makeCodeMap } from './lib/hist.mjs';

const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const Y0 = panel.meta.y0, N = panel.years.length;
const cow = makeCodeMap(loadActors(), 'cow');
const idOf = (c, y) => { const m = cow(+c, y); return typeof m === 'string' ? m : m?.id ?? null; };
const csv = (f) => { const [h, ...rows] = readFileSync(`data/raw/hist/${f}`, 'utf8').trim().split('\n'); const k = h.split(','); return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [k[i], v]))); };
const COLS = ['war_defeat', 'ethfrac', 'relfrac', 'efindex', 'rivals', 'rival_gp'];
for (const a of Object.values(panel.actors)) for (const c of COLS) delete a[c];
const put = (id, y, c, v) => { const A = panel.actors[id]; if (!A || y < Y0 || y >= Y0 + N) return; (A[c] ??= new Array(N).fill(null))[y - Y0] = v; };

// war defeat: the last year of each (war, state) with outcome 2
const last = new Map();
for (const r of csv('ps_cow_war_inter.csv')) { const k = `${r.warnum}|${r.ccode1}`; const y = +r.year; const o = last.get(k); if (!o || y > o.y) last.set(k, { y, out: +r.outcome1, c: r.ccode1 }); }
let nd = 0; for (const { y, out, c } of last.values()) if (out === 2) { const id = idOf(c, y); if (id) { put(id, y, 'war_defeat', 1); nd++; } }
// zero-fill war_defeat over live years (inside the source's window)
for (const a of Object.values(panel.actors)) { a.war_defeat ??= new Array(N).fill(null); for (let i = 0; i < N; i++) if (a.live?.[i] && a.war_defeat[i] == null && Y0 + i <= 2007) a.war_defeat[i] = 0; }
for (const r of csv('ps_creg.csv')) { const id = idOf(r.ccode, +r.year); if (!id) continue; if (r.ethfrac !== 'NA' && r.ethfrac !== '') put(id, +r.year, 'ethfrac', +r.ethfrac); if (r.relfrac !== 'NA' && r.relfrac !== '') put(id, +r.year, 'relfrac', +r.relfrac); }
for (const r of csv('ps_hief.csv')) { const id = idOf(r.ccode, +r.year); if (id && r.efindex !== 'NA' && r.efindex !== '') put(id, +r.year, 'efindex', +r.efindex); }
// rivalries: the TSS table has names with commas in a few rows, so read the numeric fields from the right-hand end
const tss = readFileSync('data/raw/hist/ps_tss_rivalries.csv', 'utf8').trim().split('\n').slice(1).map(l => { const f = l.split(','); const n = f.length; return { c1: f[n - 10], c2: f[n - 9], start: +f[n - 8], end: f[n - 7] === 'NA' || f[n - 7] === '' ? 2020 : +f[n - 7] }; });
let nr = 0;
for (const { c1, c2, start, end } of tss) for (let y = Math.max(start, Y0); y <= Math.min(end, Y0 + N - 1); y++) {
  const a = idOf(c1, y), b = idOf(c2, y); if (!a || !b) continue; nr++;
  for (const [x, o] of [[a, b], [b, a]]) { const i = y - Y0; put(x, y, 'rivals', ((panel.actors[x]?.rivals?.[i]) ?? 0) + 1); if ((panel.actors[o]?.great_power?.[i] ?? 0) > 0) put(x, y, 'rival_gp', 1); }
}
for (const a of Object.values(panel.actors)) for (const c of ['rivals', 'rival_gp']) { a[c] ??= new Array(N).fill(null); for (let i = 0; i < N; i++) if (a.live?.[i] && a[c][i] == null && Y0 + i <= 2020) a[c][i] = 0; }
panel.meta.sources.war_defeat = 'CoW inter-state wars v4 outcome 2, last war year (peacesciencer cow_war_inter); scripts/build-ps-extra.mjs';
panel.meta.sources.ethfrac = panel.meta.sources.relfrac = 'CREG (peacesciencer creg); scripts/build-ps-extra.mjs';
panel.meta.sources.efindex = 'HIEF (peacesciencer hief); scripts/build-ps-extra.mjs';
panel.meta.sources.rivals = panel.meta.sources.rival_gp = 'Thompson-Sullivan-Dreyer strategic rivalries (peacesciencer tss_rivalries); scripts/build-ps-extra.mjs';
writeFileSync('data/panel.json', JSON.stringify(panel));
console.log(`war defeats ${nd}, rivalry dyad-years ${nr}`);
