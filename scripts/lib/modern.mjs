// The modern measured layer (2000–2025) and the modern actor snapshot — ONE definition, read by both sides:
//   scripts/build-panel.mjs  puts the series on the panel clock (data/panel.json columns, 2000–2025)
//   scripts/build-world.mjs  compiles the viewer's public/world.json — history FROM the panel, projections from here
// Operator decision 2026-09-07 ("get a faithful model first"): one panel, one clock. The 2000–2025 layer used to live
// only in world.json, where the engine and the refine loop could not see it.
//
// Everything here is registry-driven: a variable in data/variables.yaml declares `source: { fetch, field, transform }`
// and, where its panel column has to differ from the variable id, `panel: <column>`. Nothing is hardcoded per country
// except the IEA region→ISO3 name table below, which is a code list, not a model choice.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/**
 * First year of the modern layer. Before it the panel's historical sources (CoW, Maddison, OWID, V-Dem) own the row.
 *
 * era-1991-2026-r2/statistics-6: this was 2000, and it was doing two different things depending on the fetcher.
 * `wb()` ignored the window entirely and returned its whole file, so the fourteen World Bank columns held data back
 * to 1960-1996 under a source line that said "modern fold 2000-2025" — the line contradicted its own column. The
 * WPP and OWID fetchers DID apply it, and truncated real coverage: wpp_medium and wpp_age5_medium both run
 * 1950-2100 and were being written as 195 actors x 2000-2025 alone, so median_age, fertility, working_age_share,
 * old_age_share and net_migration could not be fitted on any template whose window opens before 2000 — only 40% of
 * intrastate_onset's at-risk actor-years are at 2000 or later, and coup_attempt's window opens in 1950. The
 * youth-bulge and age-structure terms both templates' own `sources:` imply (Goldstone et al. 2010 PITF; Urdal 2006)
 * were sitting in the raw file back to 1950 and unreachable.
 *
 * It is now 1950 and every fetcher applies it, so each column carries its source's own full range and the source
 * line states the OBSERVED first and last year rather than this constant.
 */
export const MODERN_FROM = 1950;

// ---------------------------------------------------------------- CSV (quoted commas: WPP location names carry them)
const splitCsv = (line) => {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
};
/** Line-by-line, so a 30M-row WPP file never materialises as parsed rows. */
const csvRows = function* (text) {
  const lines = text.split('\n'); const head = splitCsv(lines[0].replace(/^﻿/, '').trim());
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = splitCsv(lines[i].trim()); const row = {};
    head.forEach((h, j) => row[h] = cells[j]); yield row;
  }
};

// ---------------------------------------------------------------- fetchers: (field, window) -> { ISO3: { year: value } }
const cache = {};
/** Drop caches (the WPP files are ~1 GB parsed; a script that only needs the panel can free them). */
export const clearCache = () => { for (const k of Object.keys(cache)) delete cache[k]; };

const IEA_ISO = {
  Australia: 'AUS', Austria: 'AUT', Belgium: 'BEL', Brazil: 'BRA', Bulgaria: 'BGR', Cambodia: 'KHM', Canada: 'CAN',
  Chile: 'CHL', China: 'CHN', Colombia: 'COL', 'Costa Rica': 'CRI', Croatia: 'HRV', Cyprus: 'CYP',
  'Czech Republic': 'CZE', Denmark: 'DNK', Estonia: 'EST', Finland: 'FIN', France: 'FRA', Germany: 'DEU',
  Greece: 'GRC', Hungary: 'HUN', Iceland: 'ISL', India: 'IND', Indonesia: 'IDN', Ireland: 'IRL', Israel: 'ISR',
  Italy: 'ITA', Japan: 'JPN', Jordan: 'JOR', Korea: 'KOR', 'Lao PDR': 'LAO', Latvia: 'LVA', Lithuania: 'LTU',
  Luxembourg: 'LUX', Malaysia: 'MYS', Mexico: 'MEX', Nepal: 'NPL', Netherlands: 'NLD', 'New Zealand': 'NZL',
  Norway: 'NOR', Philippines: 'PHL', Poland: 'POL', Portugal: 'PRT', Romania: 'ROU', Russia: 'RUS',
  Seychelles: 'SYC', Singapore: 'SGP', Slovakia: 'SVK', Slovenia: 'SVN', 'South Africa': 'ZAF', Spain: 'ESP',
  Sweden: 'SWE', Switzerland: 'CHE', Thailand: 'THA', Turkiye: 'TUR', 'Türkiye': 'TUR',
  'United Arab Emirates': 'ARE', 'United Kingdom': 'GBR', Uruguay: 'URY', USA: 'USA', 'United States': 'USA',
  Uzbekistan: 'UZB', 'Viet Nam': 'VNM', Vietnam: 'VNM',
};   // the aggregates (World, Europe, EU, Advanced Economies, …) have no ISO3 and are dropped

const inWin = (y, { from, to }) => y >= from && y <= to;

const fetchers = {
  wb(field, win) {
    const raw = JSON.parse(readFileSync(`data/raw/wb/${field}.json`, 'utf8')).data;
    if (!win) return raw;
    const out = {};
    for (const [iso, years] of Object.entries(raw)) { const o = {}; for (const [y, v] of Object.entries(years)) if (inWin(+y, win)) o[y] = v; if (Object.keys(o).length) out[iso] = o; }
    return out;
  },
  wpp(field, win) {
    const key = `wpp:${win.from}:${win.to}`;
    cache[key] ??= (() => {
      const out = {};
      for (const r of csvRows(gunzipSync(readFileSync('data/raw/wpp/wpp_medium.csv.gz')).toString())) {
        if (!r.ISO3_code) continue;                       // aggregates and regions have no ISO3
        const y = +r.Time; if (!inWin(y, win)) continue;
        (out[r.ISO3_code] ??= {})[y] = r;
      }
      return out;
    })();
    const out = {};
    for (const [iso, years] of Object.entries(cache[key])) { const o = out[iso] = {}; for (const [y, r] of Object.entries(years)) { const v = +r[field]; if (Number.isFinite(v)) o[y] = v; } }
    return out;
  },
  wpp_age5(_field, win) {
    const key = `age5:${win.from}:${win.to}`;
    cache[key] ??= (() => {
      const out = {};   // iso -> year -> { total, wa, old }
      for (const r of csvRows(gunzipSync(readFileSync('data/raw/wpp/wpp_age5_medium.csv.gz')).toString())) {
        if (!r.ISO3_code) continue;
        const y = +r.Time; if (!inWin(y, win)) continue;
        const a = +r.AgeGrpStart, p = +r.PopTotal;
        const o = ((out[r.ISO3_code] ??= {})[y] ??= { total: 0, wa: 0, old: 0 });
        o.total += p; if (a >= 15 && a < 65) o.wa += p; if (a >= 65) o.old += p;
      }
      return out;
    })();
    return cache[key];
  },
  owid(field, win) {
    cache.owid ??= [...csvRows(readFileSync('data/raw/ei/owid-energy.csv', 'utf8'))].filter(r => r.iso_code && r.iso_code.length === 3);
    const out = {};
    for (const r of cache.owid) { const y = +r.year; if (!inWin(y, win)) continue; const v = r[field]; if (v !== '' && v != null && Number.isFinite(+v)) (out[r.iso_code] ??= {})[y] = +v; }
    return out;
  },
  iea_ev(field, win) {
    cache.iea ??= [...csvRows(readFileSync('data/raw/ei/iea-ev.csv', 'utf8'))];
    const out = {};
    for (const r of cache.iea) {
      if (r.parameter !== field || r.powertrain !== 'EV' || r.mode !== 'Cars') continue;
      const iso = IEA_ISO[r.region]; if (!iso) continue;
      const y = +r.year; if (!inWin(y, win)) continue;
      out[iso] ??= {}; out[iso][y] = +r.value;
    }
    return out;
  },
};

export const transforms = {
  thousands: v => v * 1e3,
  pct: v => v / 100,
  working_age_share: (o) => o.wa / o.total,
  old_age_share: (o) => o.old / o.total,
};

/**
 * One registry variable's series, transform applied: { ISO3: { year: value } } over [from, to].
 * `source` is the variable's `source: { fetch, field, transform }` block, unchanged.
 */
export function resolveFetch(source, { from = MODERN_FROM, to = 2100 } = {}) {
  const f = fetchers[source.fetch];
  if (!f) throw new Error(`modern: unknown fetcher ${source.fetch}`);
  const raw = f(source.field, { from, to });
  const tf = source.transform ? transforms[source.transform] : (x => x);
  if (source.transform && !tf) throw new Error(`modern: unknown transform ${source.transform}`);
  const out = {};
  for (const [code, years] of Object.entries(raw)) {
    const o = {};
    for (const [y, raw1] of Object.entries(years)) { const v = tf(raw1); if (v != null && Number.isFinite(v)) o[+y] = v; }
    if (Object.keys(o).length) out[code] = o;
  }
  return out;
}

/** How a variable's source reads in a `sources` line. */
export const describeSource = (source) => `${source.fetch}:${source.field ?? source.transform}${source.transform && source.field ? ` /${source.transform}` : ''}`;

// ---------------------------------------------------------------- the modern actor snapshot -> panel columns
// A `state` variable sourced from data/actors.yaml (or a hand estimate map in data/variables.yaml) is a dated
// observation of the snapshot year, not a series: it lands on ONE year of the panel and is null before it. Ordered
// categories are encoded as ordinals so the panel stays a numeric matrix; the mapping is written into meta.sources.
export const ORDINAL = {
  cap: { N: 0, I: 1, S: 2 },                                                        // none / import-dependent / sovereign
  nuclear_status: { none: 0, latent: 1, threshold: 2, weapon: 3 },
  regime_type: { closed_autocracy: 0, electoral_autocracy: 1, electoral_democracy: 2, liberal_democracy: 3 },   // V-Dem RoW, same scale as the panel's `regime`
};
export const ORDINAL_NOTE = {
  cap: 'levels N=0 (none) I=1 (import-dependent) S=2 (sovereign)',
  nuclear_status: 'none=0 latent=1 threshold=2 weapon=3',
  // era-1991-2026-r2/data-8 (c): the SCALE is V-Dem RoW; the MEASUREMENT is not the panel's. This is a hand
  // transcription in data/actors.yaml and it disagrees with the panel's `regime` for about a quarter of the actors
  // it covers (build-panel prints the list every build). "as the panel's `regime`" was a claim the numbers do not
  // support and it is withdrawn here.
  regime_type: 'V-Dem Regimes of the World scale (closed_autocracy=0 electoral_autocracy=1 electoral_democracy=2 liberal_democracy=3), hand-transcribed in data/actors.yaml — a separate estimate on that scale, NOT the panel\'s `regime` series, which it disagrees with for about a quarter of the actors it covers',
};
const ordinalFor = (id) => (id.startsWith('cap_') ? ORDINAL.cap : ORDINAL[id]);

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/**
 * The snapshot columns one actor contributes: [[column, value, note], ...].
 * `v` is a registry variable with kind `state` and scope `actor`; `modern` is its data/actors.yaml record.
 * A map-valued field (chokepoints) fans out to one column per key; an unmapped category throws rather than
 * writing a silent null — a new capability level has to be declared in ORDINAL before it can enter the panel.
 */
export function snapshotColumns(v, modern) {
  const src = v.source ?? {};
  let raw;
  if (src.hand) raw = getPath(modern, src.field);
  else if (src.estimate != null && typeof src.estimate === 'object') raw = src.estimate[modern?.id];
  else if (src.estimate != null) raw = src.estimate;
  if (raw == null) return [];
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    // an exposure map: chokepoint_exposure -> chokepoint_hormuz, chokepoint_malacca, …
    const base = v.id.replace(/_exposure$/, '');
    return Object.entries(raw).map(([k, x]) => [`${base}_${k}`, +x, null]);
  }
  if (typeof raw === 'number') return [[v.id, raw, null]];
  const map = ordinalFor(v.id);
  if (!map) throw new Error(`modern snapshot: ${v.id} is categorical (${raw}) and has no ordinal mapping in scripts/lib/modern.mjs`);
  if (!(raw in map)) throw new Error(`modern snapshot: ${v.id} value ${raw} is not in the declared ordinal mapping (${Object.keys(map).join(', ')})`);
  return [[v.id, map[raw], ORDINAL_NOTE[v.id.startsWith('cap_') ? 'cap' : v.id]]];
}

/** Extra columns a snapshot variable carries alongside its value (nuclear warheads travel with nuclear status).
 *  The 4th element is the column's own `sources` line: an extra is a different measurement from its carrier and must
 *  not inherit the carrier's source (a warhead count does not come from `nuclear.status`). */
export function snapshotExtras(v, modern) {
  if (v.id !== 'nuclear_status') return [];
  const n = modern?.nuclear?.warheads;
  return n == null ? [] : [['nuclear_warheads', +n, null, 'Nuclear warheads — data/actors.yaml nuclear.warheads']];
}
