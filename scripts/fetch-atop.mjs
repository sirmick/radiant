// Fetch ATOP 5.1 alliance dyad-years (1815-2018) -> data/raw/hist/atop_alliance_5.1.csv
//
// Why: data/raw/hist/alliance_v303_dyadic.csv is CoW Formal Alliances 3.03 and ENDS IN 2000. The build carried the
// last value past it, and for a state that had no alliance by 2000 the carried value is a zero — so BGR EST LVA LTU
// ROU SVK SVN (NATO 2004), ALB HRV (2009), MNE (2017) and MKD (2020) were coded as non-allies of the United States
// for every year to 2025, and the dyadic `allied` feature was the year-2000 edge set at as-of 2000, 2010 and 2025
// alike (era-1991-2026-r2/data-7, engine-6). ATOP is the standard successor and reaches 2018.
//
// Citation: Leeds, Brett Ashley, Jeffrey M. Ritter, Sara McLaughlin Mitchell and Andrew G. Long (2002), "Alliance
// Treaty Obligations and Provisions, 1815-1944", International Interactions 28: 237-260 (ATOP 5.1 release).
// Distribution: Miller, Steven V. (2022), "peacesciencer: An R Package for Quantitative Peace Science Research",
// Conflict Management and Peace Science 39(6): 755-779.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readRda } from './lib/rdata.mjs';

const URL = 'https://raw.githubusercontent.com/svmiller/peacesciencer/master/data/atop_alliance.rda';
const OUT = 'data/raw/hist/atop_alliance_5.1.csv';

const r = await fetch(URL);
if (!r.ok) throw new Error(`fetch-atop: ${URL} -> ${r.status}`);
const tables = readRda(Buffer.from(await r.arrayBuffer()));
const t = tables.atop_alliance;
if (!t) throw new Error(`fetch-atop: no atop_alliance table in the archive (${Object.keys(tables).join(', ')})`);
const want = ['ccode1', 'ccode2', 'year', 'atop_defense', 'atop_offense', 'atop_neutral', 'atop_nonagg', 'atop_consul'];
for (const c of want) if (!t.columns.includes(c)) throw new Error(`fetch-atop: atop_alliance is missing column ${c} (has ${t.columns.join(', ')})`);

const lines = [want.join(',')];
for (let i = 0; i < t.rows; i++) lines.push(want.map(c => { const v = t.cols[c][i]; return v == null ? '' : String(v); }).join(','));
mkdirSync('data/raw/hist', { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');

let mn = Infinity, mx = -Infinity; for (const y of t.cols.year) { if (y < mn) mn = y; if (y > mx) mx = y; }
console.log(`${OUT}: ${t.rows} directed dyad-years, ${mn}-${mx}`);
