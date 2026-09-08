// Fetch CoW Direct Contiguity v3.2 (1816-2016) -> data/raw/hist/cow_contdir.csv
//
// Why this file exists: CShapes 2.0, the polygon source behind data/contiguity.json, has no polygon before 1886, so
// every dyad-year in 1816-1885 was dropped from the dyadic design matrix (scripts/lib/fit.mjs) — 3 of the 5 as-of
// years in the 1870-1914 turn scored nothing at all. CoW Direct Contiguity codes state-to-state contiguity from 1816
// and codes the water classes a 30 km land buffer cannot see.
//
// correlatesofwar.org serves 403 to scripted fetches, so the offline-reproducible copy is the `cow_contdir` data.frame
// shipped inside the R package `peacesciencer` (Miller 2022), documented there as version 3.2 of the Correlates of War
// Direct Contiguity data. Unlike cow_nmc.rda this object is bzip2-wrapped rather than gzip-wrapped, so it is piped
// through the system `bzip2 -dc` before scripts/lib/rdata.mjs decodes the XDR stream.
//
// conttype: 1 = land border, 2 = <= 12 miles of water, 3 = 24 miles, 4 = 150 miles, 5 = 400 miles. 0 rows are the
// source's own "not contiguous during this span" records and are written out as such (the build filters them).
//
// Citation: Stinnett, Douglas M., Jaroslav Tir, Philip Schafer, Paul F. Diehl and Charles Gochman (2002), "The
// Correlates of War Project Direct Contiguity Data, Version 3", Conflict Management and Peace Science 19(2): 58-66.
// Distribution: Miller, Steven V. (2022), "peacesciencer: An R Package for Quantitative Peace Science Research",
// Conflict Management and Peace Science 39(6): 755-779.
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readRda } from './lib/rdata.mjs';

const URL = 'https://raw.githubusercontent.com/svmiller/peacesciencer/master/data/cow_contdir.rda';
const OUT = 'data/raw/hist/cow_contdir.csv';

const r = await fetch(URL);
if (!r.ok) throw new Error(`fetch-contdir: ${URL} -> ${r.status}`);
let buf = Buffer.from(await r.arrayBuffer());
if (buf.subarray(0, 3).toString('latin1') === 'BZh') {
  const z = spawnSync('bzip2', ['-dc'], { input: buf, maxBuffer: 1 << 28 });
  if (z.status !== 0) throw new Error(`fetch-contdir: bzip2 -dc failed (${z.status}) ${z.stderr}`);
  buf = z.stdout;
}
const tables = readRda(buf);
const t = tables.cow_contdir;
if (!t) throw new Error(`fetch-contdir: no cow_contdir table in the archive (${Object.keys(tables).join(', ')})`);
for (const c of ['ccode1', 'ccode2', 'conttype', 'stdate', 'enddate']) if (!t.columns.includes(c)) throw new Error(`fetch-contdir: cow_contdir is missing column ${c} (has ${t.columns.join(', ')})`);

// R Date -> calendar year (days since 1970-01-01)
const yearOf = (d) => new Date(d * 86400000).getUTCFullYear();
const lines = ['ccode1,ccode2,conttype,styear,endyear'];
for (let i = 0; i < t.rows; i++) {
  const s = t.cols.stdate[i], e = t.cols.enddate[i];
  if (s == null || e == null) continue;
  lines.push([t.cols.ccode1[i], t.cols.ccode2[i], t.cols.conttype[i], yearOf(s), yearOf(e)].join(','));
}
mkdirSync('data/raw/hist', { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');
const ys = t.cols.stdate.filter(x => x != null).map(yearOf);
console.log(`${OUT}: ${lines.length - 1} rows, ${ys.length ? Math.min(...ys) : '-'}-${Math.max(...t.cols.enddate.filter(x => x != null).map(yearOf))}, ${new Set([...t.cols.ccode1, ...t.cols.ccode2]).size} state codes`);
