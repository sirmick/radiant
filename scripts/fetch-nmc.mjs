// Fetch CoW National Material Capabilities v7.0 (1816-2022) -> data/raw/hist/nmc_7.0.csv
//
// correlatesofwar.org serves 403 to scripted fetches and Harvard Dataverse only carries v3.02 (1816-2001), so the
// offline-reproducible copy is the `cow_nmc` data.frame shipped inside the R package `peacesciencer` (Miller 2022),
// documented there as "version 7.0 of the Correlates of War National Military Capabilities data". Same six
// indicators and the same CINC, extended from 2001 to 2022. Decoded without R by scripts/lib/rdata.mjs.
//
// Citation: Singer, J. David, Stuart Bremer and John Stuckey (1972), "Capability Distribution, Uncertainty, and
// Major Power War, 1820-1965", in Bruce Russett (ed.) Peace, War, and Numbers, Beverly Hills: Sage, 19-48.
// Distribution: Miller, Steven V. (2022), "peacesciencer: An R Package for Quantitative Peace Science Research",
// Conflict Management and Peace Science 39(6): 755-779.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readRda } from './lib/rdata.mjs';

const URL = 'https://raw.githubusercontent.com/svmiller/peacesciencer/master/data/cow_nmc.rda';
const OUT = 'data/raw/hist/nmc_7.0.csv';

const r = await fetch(URL);
if (!r.ok) throw new Error(`fetch-nmc: ${URL} -> ${r.status}`);
const tables = readRda(Buffer.from(await r.arrayBuffer()));
const t = tables.cow_nmc;
if (!t) throw new Error(`fetch-nmc: no cow_nmc table in the archive (${Object.keys(tables).join(', ')})`);
const want = ['ccode', 'year', 'milex', 'milper', 'irst', 'pec', 'tpop', 'upop', 'cinc'];
for (const c of want) if (!t.columns.includes(c)) throw new Error(`fetch-nmc: cow_nmc is missing column ${c} (has ${t.columns.join(', ')})`);

const lines = [want.join(',')];
for (let i = 0; i < t.rows; i++) lines.push(want.map(c => { const v = t.cols[c][i]; return v == null ? '' : String(v); }).join(','));
mkdirSync('data/raw/hist', { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');

const years = t.cols.year.filter((_, i) => t.cols.cinc[i] != null);
console.log(`${OUT}: ${t.rows} rows, cinc ${Math.min(...years)}-${Math.max(...years)}, ${new Set(t.cols.ccode).size} state codes`);
