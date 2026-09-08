// Fetch Gibler–Miller–Little MID 2.2.1 directed dyad-years (1816-2010) -> data/raw/hist/gml_dirdisp_2.2.1.csv
//
// Why: the only MID copy in data/raw/hist is CoW MID 3.02, whose disputes stop in 2001, so mid_force / mid_war /
// war_end had no ground truth for the whole modern era — as-of 2000 scored one year of a twenty-year horizon and
// as-of 2010 scored none (era-1991-2026-r2/data-1). correlatesofwar.org serves 403 to scripted fetches; the
// offline-reproducible copy is the `gml_dirdisp` data.frame inside the R package `peacesciencer`, the same route
// scripts/fetch-nmc.mjs already uses for NMC 7.0. It carries the identical `hostlev` variable, dyadic and directed,
// to 2010.
//
// Citation: Gibler, Douglas M., Steven V. Miller and Erin K. Little (2016), "An Analysis of the Militarized
// Interstate Dispute (MID) Dataset, 1816-2001", International Studies Quarterly 60(4): 719-730.
// Distribution: Miller, Steven V. (2022), "peacesciencer: An R Package for Quantitative Peace Science Research",
// Conflict Management and Peace Science 39(6): 755-779.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readRda } from './lib/rdata.mjs';

const URL = 'https://raw.githubusercontent.com/svmiller/peacesciencer/master/data/gml_dirdisp.rda';
const OUT = 'data/raw/hist/gml_dirdisp_2.2.1.csv';

const r = await fetch(URL);
if (!r.ok) throw new Error(`fetch-mid: ${URL} -> ${r.status}`);
const tables = readRda(Buffer.from(await r.arrayBuffer()));
const t = tables.gml_dirdisp;
if (!t) throw new Error(`fetch-mid: no gml_dirdisp table in the archive (${Object.keys(tables).join(', ')})`);
const want = ['dispnum', 'ccode1', 'ccode2', 'year', 'midonset', 'midongoing', 'sidea1', 'sidea2', 'hostlev1', 'hostlev2', 'hostlev', 'fatality', 'outcome', 'settle', 'recip', 'numa', 'numb', 'stmon', 'endmon', 'ongo2010', 'version'];
for (const c of want) if (!t.columns.includes(c)) throw new Error(`fetch-mid: gml_dirdisp is missing column ${c} (has ${t.columns.join(', ')})`);

const lines = [want.join(',')];
for (let i = 0; i < t.rows; i++) lines.push(want.map(c => { const v = t.cols[c][i]; return v == null ? '' : String(v); }).join(','));
mkdirSync('data/raw/hist', { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');

const ys = t.cols.year;
console.log(`${OUT}: ${t.rows} directed dyad-years, ${Math.min(...ys)}-${Math.max(...ys)}, version ${[...new Set(t.cols.version)].join('/')}`);
