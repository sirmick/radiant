// Build the historical actor-year panel 1816–2025 -> data/panel.json
// Sources: CoW NMC 3.02 (1816–2001), Maddison (OWID), OWID population, OWID regime (V-Dem RoW), V-Dem ERT (polyarchy),
// OWID energy by source (1800+), OWID coal/oil production, REIGN (leader age/tenure 1950–2021), CoW alliances 3.03,
// CoW MID 3.02 (1816–2001), UCDP/PRIO 25.1 (1946–2024), hand events (wars with participants).
// Plus the modern layer (operator / modern-fold): UN WPP, World Bank WDI, OWID energy, IEA EV 2000-2025 and the
// modern actor snapshot (data/actors.yaml capability levels, regime type, nuclear status, chokepoint exposure) at 2025.
// Output: { meta: { y0, y1, sources, vars: { <col>: { source, introduced, last, actor_years, actors } } },
//           years: [...], vars: [...], actors: { id: { var: [per-year value|null] } }, sources: {...} }
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, makeOwidMap, isLive } from './lib/hist.mjs';
import { MODERN_FROM, resolveFetch, describeSource, snapshotColumns, snapshotExtras } from './lib/modern.mjs';
import { COMPONENTS, MISSING_COMPONENTS, SPLICE_YEARS, compositeShares, componentLevels, spliceComposite, validate } from './lib/capability.mjs';
import { POLARITY, normalise, projectionShares, smoothShares, classify, eraFlags, conditionality, greatGame, fitLogistic, fitDiffusionRate } from '../src/engine/polarity.js';
import { PRESENCE, presenceIndex, covered, powerLevel, hostLevel, lastFall } from '../src/engine/presence.js';

const Y0 = 1816, Y1 = 2025, YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const actors = loadActors(); const code = makeCodeMap(actors); const gw = makeCodeMap(actors, 'gw'); const owid = makeOwidMap(actors);
// Maddison gdp_pc and OWID population are modern-borders series; where an actor declares `owid_alt` (USSR, Yugoslavia,
// Czechoslovakia) the entity-wide series owns those years and the modern-borders one is suppressed.
const owidEntity = makeOwidMap(actors, { preferAlt: true });
const H = 'data/raw/hist/';
const panel = {}; const put = (id, v, y, val) => { if (!id || y < Y0 || y > Y1 || val == null || Number.isNaN(val)) return; ((panel[id] ??= {})[v] ??= new Array(YEARS.length).fill(null))[y - Y0] = val; };
const add = (id, v, y, n = 1) => { if (!id || y < Y0 || y > Y1) return; const arr = ((panel[id] ??= {})[v] ??= new Array(YEARS.length).fill(0)); arr[y - Y0] += n; };
const sources = {};
let meta_polarity = null, meta_info_wave = null;   // the derived world-state series and the fitted information wave (package 9)

// ---- NMC. v7.0 (1816–2022, energy column `pec`) where the fetch has run, else the bundled 3.02 (1816–2001).
// operator / modern-capability: 3.02 stopped in 2001, so every modern dyad was scored on 2001 strengths.
const NMC = existsSync(H + 'nmc_7.0.csv')
  ? { file: 'nmc_7.0.csv', energy: 'pec', label: 'CoW NMC 7.0 (1816–2022; peacesciencer distribution, scripts/fetch-nmc.mjs)' }
  : { file: 'nmc_3.02.csv', energy: 'energy', label: 'CoW NMC 3.02 (1816–2001)' };
let nmcLast = 0;
for (const r of readCsv(H + NMC.file)) {
  const y = +r.year, id = code(r.ccode, y); if (!id) continue;
  const num = (x) => (x === '-9' || x === '' || x == null || x === 'NA' ? null : +x);
  const c = num(r.cinc);
  put(id, 'cinc', y, c); put(id, 'irst', y, num(r.irst)); put(id, 'milex', y, num(r.milex));
  put(id, 'milper', y, num(r.milper)); put(id, 'energy_nmc', y, num(r[NMC.energy])); put(id, 'tpop', y, num(r.tpop) && num(r.tpop) * 1e3); put(id, 'upop', y, num(r.upop) && num(r.upop) * 1e3);
  if (c != null && y > nmcLast && y <= Y1) nmcLast = y;
}
sources.cinc = sources.irst = sources.milex = sources.milper = sources.energy_nmc = sources.tpop = sources.upop = NMC.label;
console.log(`NMC: ${NMC.file}, cinc through ${nmcLast}`);

// ---- Maddison GDP pc, population
for (const r of readCsv(H + 'maddison.csv')) { const y = +r.year, id = owidEntity(r.code, y); if (id && r.gdp_per_capita) put(id, 'gdp_pc', y, +r.gdp_per_capita); }
sources.gdp_pc = 'Maddison Project 2023 via OWID (2011 intl $); entity-wide series (OWID_USS/OWID_YGS/OWID_CZS) inside the owid_alt windows declared in data/history/actors.yaml';
for (const r of readCsv(H + 'population.csv')) { const y = +r.year, id = owidEntity(r.code, y); if (id && r.population_historical) put(id, 'population', y, +r.population_historical); }
sources.population = 'OWID population (HYDE/Gapminder/UN)';

// ---- regime (RoW 0..3), polyarchy
for (const r of readCsv(H + 'regime.csv')) { const y = +r.year, id = owid(r.code, y); if (id && r.regime_row_owid !== '') put(id, 'regime', y, +r.regime_row_owid); }
sources.regime = 'V-Dem Regimes of the World via OWID (0 closed aut, 1 electoral aut, 2 electoral dem, 3 liberal dem)';
for (const r of readCsv(H + 'ert.csv')) { const y = +r.year, id = owid(r.country_text_id, y); if (id && r.v2x_polyarchy !== 'NA') put(id, 'polyarchy', y, +r.v2x_polyarchy); }
sources.polyarchy = 'V-Dem v2x_polyarchy via ERT';

// ---- energy by source (TWh), coal/oil production
for (const r of readCsv(H + 'energy_hist.csv')) {
  const y = +r.year, id = owid(r.code, y); if (!id) continue;
  const f = (k) => (r[k] === '' ? null : +r[k]);
  const coal = f('coal_twh'), oil = f('oil_twh'), gas = f('gas_twh'), nuc = f('nuclear_twh'), hyd = f('hydro_twh'), sol = f('solar_twh'), wnd = f('wind_twh');
  const tot = [coal, oil, gas, nuc, hyd, sol, wnd].reduce((a, b) => a + (b ?? 0), 0);
  if (tot > 0) { put(id, 'energy_twh', y, tot); put(id, 'oil_twh', y, oil); put(id, 'coal_twh', y, coal); put(id, 'lowcarbon_share', y, ((nuc ?? 0) + (hyd ?? 0) + (sol ?? 0) + (wnd ?? 0)) / tot); }
}
sources.energy_twh = 'OWID energy by source (Energy Institute + Smil)';
for (const r of readCsv(H + 'coal_hist.csv')) { const y = +r.year, id = owid(r.code, y); if (id && r.coal_production_twh) put(id, 'coal_prod', y, +r.coal_production_twh); }
for (const r of readCsv(H + 'oil_hist.csv')) { const y = +r.year, id = owid(r.code, y); if (id && r.oil_production_twh) put(id, 'oil_prod', y, +r.oil_production_twh); }
sources.coal_prod = sources.oil_prod = 'OWID fossil production (Energy Institute, Etemad & Luciani)';

// ---- REIGN: leader age, tenure, coups (December row of each year)
// era-1945-1991-r2/data-2, statistics-5, engine-3: REIGN's `irregular` column is NOT a 0/1 "the incumbent took power
// irregularly" flag. It has 4,332 distinct values over the file's 138,600 rows and its four commonest are log 2, log 3,
// log 4 and log 5: it is log(months since the state's last irregular leader change). Read as a flag it was 1 in 99.3%
// of actor-years, it was 0 exactly in the month an irregular change HAD just happened (the inverse of its name), and
// data/fits.json duly fitted it at -0.69 on irregular_exit against a +0.5 literature prior (Svolik 2012, Powell 2012).
// It is now used as the recency it is: a leader entered irregularly iff the last irregular change is no older than the
// leader's own tenure, i.e. exp(irregular) <= tenure_months (+1.5 months of slack for the month-granularity of both
// columns). The flag is decided once per (ccode, leader) spell at the spell's first observed row and carried across
// the spell, so a single noisy month cannot flip it mid-tenure. Measured on REIGN: 427 of 2,197 leader spells (19.4%)
// and 34.4% of actor-years, against the 0.71% of zeros the raw column gave. build-events.mjs never trusted this column
// (it derives irregular exits from Powell-Thyne coup months instead) and it was right not to.
{
  const last = new Map();
  const spell = new Map();          // ccode|leader -> { at, irregular } at the earliest observed month of the spell
  for (const r of readCsv(H + 'reign.csv')) {
    const y = +r.year, m = +r.month, id = code(r.ccode, y); if (!id) continue;
    if (+r.pt_attempt > 0) add(id, 'coup_attempt', y, 1);
    if (+r.pt_suc > 0) add(id, 'coup_success', y, 1);
    const sk = `${r.ccode}|${r.leader}`; const at = y * 12 + m; const sp = spell.get(sk);
    if (!sp || at < sp.at) spell.set(sk, { at, irregular: Math.exp(+r.irregular) <= +r.tenure_months + 1.5 ? 1 : 0 });
    const k = `${id}:${y}`; const prev = last.get(k);
    if (!prev || m > prev.month) last.set(k, { month: m, age: +r.age, tenure: +r.tenure_months / 12, mil: +r.militarycareer, spellKey: sk, irregular_recency: Math.exp(+r.irregular) });
  }
  for (const [k, v] of last) {
    const [id, y] = k.split(':');
    put(id, 'leader_age', +y, v.age); put(id, 'leader_tenure', +y, v.tenure); put(id, 'leader_military', +y, v.mil);
    put(id, 'leader_irregular_entry', +y, spell.get(v.spellKey)?.irregular ?? 0);
    put(id, 'irregular_recency_months', +y, v.irregular_recency);
  }
  sources.leader_age = sources.leader_tenure = sources.coup_attempt = 'REIGN 2021.8 (1950–2021), Powell–Thyne coups';
  sources.leader_irregular_entry = 'REIGN 2021.8, derived: the sitting leader\'s entry is irregular iff exp(irregular) ≤ tenure_months at the first month of the spell (the raw `irregular` column is log months since the last irregular change, not a flag)';
  sources.irregular_recency_months = 'REIGN 2021.8 `irregular`, exponentiated: months since the state\'s last irregular leader change (display only)';
}

// ---- alliances: defence-pact partner count per actor-year (sstype 1 = defense); superpower client ties (any pact type with USA / RUS)
for (const r of readCsv(H + 'alliance_v303_dyadic.csv')) {
  const y = +r.year; const a = code(r.ccode1, y), b = code(r.ccode2, y); if (!a || !b) continue;
  if (r.sstype === '1') { add(a, 'defence_pacts', y, 1); add(b, 'defence_pacts', y, 1); }
  for (const [x, other] of [[a, b], [b, a]]) { if (other === 'USA' && x !== 'USA') put(x, 'pact_usa', y, 1); if (other === 'RUS' && x !== 'RUS') put(x, 'pact_rus', y, 1); }
}
sources.defence_pacts = 'CoW Formal Alliances 3.03 dyadic (1816–2000)';
sources.pact_usa = sources.pact_rus = 'CoW Formal Alliances 3.03: any alliance type with USA / USSR-Russia; carried forward 2001–2021';

// ---- MIDs: per actor-year, use of force (hostlev>=4) and war (5)
for (const r of readCsv(H + 'midb_3.02.csv')) {
  const y = +r.styear, id = code(r.ccode, y); if (!id) continue;
  if (+r.hostlev >= 4) add(id, 'mid_force', y, 1);
  if (+r.hostlev >= 5) add(id, 'mid_war', y, 1);
}
sources.mid_force = 'CoW MID 3.02 participant-level (1816–2001), hostility level ≥ 4';

// ---- UCDP: intrastate conflict years (type 3/4), interstate (type 2), 1946–2024
for (const r of readCsv(H + 'UcdpPrioConflict_v25_1.csv')) {
  const y = +r.year, t = +r.type_of_conflict;
  const as = r.gwno_a.split(',').map(s => gw(s.trim(), y)), bs = r.gwno_b.split(',').map(s => gw(s.trim(), y));
  if (t === 3 || t === 4) for (const a of as) if (a) put(a, 'intrastate', y, +r.intensity_level);
  if (t === 2) for (const a of [...as, ...bs]) if (a) add(a, 'interstate_ucdp', y, 1);
}
sources.intrastate = 'UCDP/PRIO ACD 25.1 (1946–2024), intensity 1 = 25–999 deaths, 2 = war';

// ---- hand wars -> at_war flag per participant-year (covers 1816–2026 incl. pre-1946 gaps)
// A war record may carry per-participant `entries:` / `exits:` maps; without them the war-level span applies. The
// war-level span alone put the USA at war from 1914 and from 1939, Italy from 1914, Brazil from 1939 — a covariate
// fitted at +0.63 on mid_force, pre-seeded with the thing it is supposed to predict.
const handEvents = Y('data/history/events.yaml');
for (const e of handEvents) {
  if (e.kind !== 'war') continue;
  const end = e.end ?? Y1;
  for (const side of e.sides) for (const a of side) {
    const y0 = Math.floor(e.entries?.[a] ?? e.start), y1 = Math.floor(e.exits?.[a] ?? end);
    const act = actors.get(a);
    for (let y = y0; y <= y1; y++) if (!act || isLive(act, y)) put(a, 'at_war', y, 1);
  }
}
sources.at_war = 'data/history/events.yaml — a HAND LIST of interstate wars with per-participant entry/exit dates where declared, not a dataset. Absence is not evidence of peace: the list is complete only where the refine loop has been, and a war it does not name enters the panel as a 0. Ingesting CoW Inter-State War v4.0 participant-level dates the way NMC 7.0 was ingested is the fix (docs/escalations.md)';

// ---- World Bank WDI 1960+ (fetched by scripts/fetch-wb.mjs): information access, infant mortality, urbanisation
{
  const wb = (name) => JSON.parse(readFileSync(`data/raw/wb/${name}.json`, 'utf8')).data;
  for (const [name, v] of [['internet_users', 'internet_users'], ['mobile_subs', 'mobile_subs'], ['fixed_lines', 'fixed_lines'], ['infant_mortality', 'infant_mortality'], ['urban_share', 'urban_share'], ['aid_gni', 'aid_gni']]) {
    const d = wb(name);
    for (const [iso, years] of Object.entries(d)) for (const [y, val] of Object.entries(years)) { const id = owid(iso, +y); if (id) put(id, v, +y, +val); }
    sources[v] = `World Bank WDI (${name})`;
  }
  // info_access: share of population with ready access to independent information; internet users, else mobile penetration, else fixed lines (scaled)
  for (const [id, vars] of Object.entries(panel)) {
    vars.info_access = YEARS.map((y, i) => {
      const net = vars.internet_users?.[i], mob = vars.mobile_subs?.[i], fix = vars.fixed_lines?.[i];
      const parts = [net != null ? net / 100 : null, mob != null ? Math.min(1, mob / 100) : null, fix != null ? Math.min(1, fix / 40) : null].filter(x => x != null);
      if (!parts.length) return y < 1960 ? 0.02 : null;   // pre-1960: radio era, near-zero two-way information access
      return Math.max(...parts);
    });
  }
  sources.info_access = 'derived: max(internet users/100, mobile subs/100, fixed lines/40); 0.02 before 1960';
}

// ---- flag variables: null means "no event" inside the source's coverage window, so fill 0 for live years
const FLAGS = { at_war: [1816, 2026], intrastate: [1946, 2024], interstate_ucdp: [1946, 2024], mid_force: [1816, 2001], mid_war: [1816, 2001], coup_attempt: [1950, 2021], coup_success: [1950, 2021], defence_pacts: [1816, 2000] };
for (const [id, vars] of Object.entries(panel)) {
  const a = actors.get(id); if (!a) continue;
  for (const [v, [c0, c1]] of Object.entries(FLAGS)) {
    vars[v] ??= new Array(YEARS.length).fill(null);
    YEARS.forEach((y, i) => { if (vars[v][i] == null && y >= c0 && y <= c1 && isLive(a, y)) vars[v][i] = 0; });
  }
}

// ---- occupation: a state under foreign occupation is not producing capability figures or dispute non-events.
// CoW NMC codes the rump regimes without a flag (France tpop 41.9M in 1939 -> 8.0M in 1941-42, a round Vichy placeholder,
// cinc 0.0396 -> 0.0758 -> 0.0158), and the FLAGS fill above writes a 0 dispute-year for every occupied year.
// Both are nulled for the fully occupied years (ceil(start)..floor(end)); the invasion year keeps its war.
// One null was doing two different jobs, and it did the second one wrong (era-1914-1945-r2/statistics-3, data/4):
//   (a) CoW's rump-regime capability figures are not the state's capability — but nulling them dropped the actor from
//       EVERY dyad that year (scripts/lib/fit.mjs requires non-null cinc on both sides), and with it 24% of the
//       1930-1960 dyadic war record: 60 of 250 mid_war events had no row. The last PRE-occupation observation is
//       carried forward instead, which is what a forecaster in 1941 would use for France, and the row survives.
//   (b) the FLAGS fill writing a 0 dispute-year for an occupied year IS the defect the null was reaching for, so the
//       dispute/alliance flags stay null. `at_war` keeps its 1 where the war list says the actor is a belligerent:
//       a state under occupation by a power it is at war with is not at peace, and `?? 0` downstream read the null as
//       peace for FRA/NLD/BEL/NOR/DNK/SRB/GRC through the whole 1941-45 core of the era.
// `occupied` is the marker column: 1 for every fully occupied actor-year, so the sample of a template that should not
// score domestic politics under occupation can be defined on it (data/templates.yaml `sample: { exclude_flag: ... }`).
// An occupation declared `partial: true` (part of the territory, the state's own government still fielding an army on
// its own soil) marks the years and stamps the regime cause but does not touch the series.
{
  const OCC_CARRY = ['cinc', 'irst', 'milex', 'milper', 'energy_nmc', 'tpop', 'upop'];
  const OCC_NULL = ['mid_force', 'mid_war', 'defence_pacts'];
  let nCarry = 0, nNull = 0, nMark = 0, nWarKept = 0;
  for (const [id, vars] of Object.entries(panel)) vars.occupied ??= new Array(YEARS.length).fill(null);
  for (const o of handEvents) {
    if (o.kind !== 'occupation') continue;
    const vars = panel[o.actor]; if (!vars) continue;
    for (let y = Math.ceil(o.start); y <= Math.floor(o.end); y++) {
      const i = y - Y0; if (i < 0 || i >= YEARS.length) continue;
      vars.occupied[i] = 1; nMark++;
      if (o.partial) continue;
      for (const v of OCC_CARRY) {
        const col = vars[v]; if (!col || col[i] == null) continue;
        let last = null; for (let k = i - 1; k >= 0; k--) if (col[k] != null) { last = col[k]; break; }
        col[i] = last; nCarry++;
      }
      for (const v of OCC_NULL) { const col = vars[v]; if (col && col[i] != null) { col[i] = null; nNull++; } }
      const w = vars.at_war; if (w && w[i] != null) { if (w[i] > 0) nWarKept++; else { w[i] = null; nNull++; } }
    }
  }
  for (const [id, vars] of Object.entries(panel)) { const a = actors.get(id); YEARS.forEach((y, i) => { if (a && isLive(a, y) && vars.occupied[i] == null) vars.occupied[i] = 0; }); }
  console.log(`occupation: ${nMark} occupied actor-years marked; ${nCarry} capability values carried forward from the last pre-occupation observation, ${nNull} dispute/alliance flags nulled, ${nWarKept} at_war=1 kept`);
  sources.occupied = 'data/history/events.yaml kind: occupation — 1 for the fully occupied years (ceil(start)..floor(end)) of every dated occupation span; the invasion year keeps its war';
  sources.at_war += '; in an occupied year at_war keeps the 1 the war list gives it and is null otherwise (an occupied year is not a peaceful one)';
  sources.cinc += '; occupied years carry the last pre-occupation observation forward rather than CoW\'s rump-regime figure (data/history/events.yaml kind: occupation, `occupied` = 1)';
}

// ---- empire-wide series: gdp_pc and population as a successor-state sum (data/history/actors.yaml `derived_series`)
// A multinational empire has no series of its own in Maddison/OWID: joining it to one modern successor gives that
// successor's borders (Austria-Hungary = Austria, 4.5M against an NMC tpop of 35.7M in 1870) and, for the Ottoman
// Empire, a gdp_pc that is null in 43 of the 45 years 1870-1914. An actor may instead declare the constituent set
// that made it up — modern successor codes with an optional population `share` of the successor that was inside the
// empire, and dated `from`/`to` for territory gained or lost. Population is the share-weighted sum of the parts,
// gdp_pc the population-weighted mean over the parts that have a series (emitted only where those parts cover
// `min_gdp_coverage` of the derived population). Maddison is benchmark years before 1950, so a part's series is
// log-linearly interpolated between its own observed years (never extrapolated, never across a gap > MAXGAP);
// `gdp_pc_derived` / `population_derived` flag the actor-years this block wrote, and `gdp_pc_interp` the share of
// the gdp weight that came from an interpolated year — a year with gdp_pc_interp = 1 has no annual observation
// behind it and its gdp_growth is a smooth fill, not a measurement.
{
  const MAXGAP = 60;
  const byCode = (file, col) => {
    const m = new Map();
    for (const r of readCsv(H + file)) { if (!r[col]) continue; const y = +r.year; if (!Number.isFinite(y)) continue; (m.get(r.code) ?? m.set(r.code, new Map()).get(r.code)).set(y, +r[col]); }
    for (const s of m.values()) { const ks = [...s.keys()].sort((a, b) => a - b); s.keys_sorted = ks; }
    return m;
  };
  const mad = byCode('maddison.csv', 'gdp_per_capita'), pops = byCode('population.csv', 'population_historical');
  /** Value of `code` in `year`: observed, else log-linear between the nearest observed years on either side. */
  const at = (m, code, y) => {
    const s = m.get(code); if (!s) return null;
    if (s.has(y)) return { v: s.get(y), interp: 0 };
    const ks = s.keys_sorted; let lo = null, hi = null;
    for (const k of ks) { if (k < y) lo = k; else { hi = k; break; } }
    if (lo == null || hi == null || hi - lo > MAXGAP) return null;
    const a = s.get(lo), b = s.get(hi); if (!(a > 0) || !(b > 0)) return null;
    return { v: Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * (y - lo) / (hi - lo)), interp: 1 };
  };
  const rep = [];
  for (const a of actors.values()) {
    const d = a.derived_series; if (!d) continue;
    const [w0, w1] = d.window ?? [Y0, Y1 + 1];
    const minCov = d.min_gdp_coverage ?? 0.5;
    const vars = (panel[a.id] ??= {});
    for (const v of ['gdp_pc', 'population', 'gdp_pc_derived', 'population_derived', 'gdp_pc_interp']) vars[v] ??= new Array(YEARS.length).fill(null);
    let ny = 0, ng = 0;
    for (let y = Math.max(w0, Y0); y < Math.min(w1, Y1 + 1); y++) {
      const i = y - Y0;
      vars.gdp_pc[i] = null; vars.population[i] = null;   // the modern-successor join does not own these years
      if (!isLive(a, y)) continue;
      let pop = 0, gsum = 0, gw = 0, gi = 0;
      for (const p of d.parts) {
        if (p.from != null && y < p.from) continue;
        if (p.to != null && y >= p.to) continue;
        const pv = at(pops, p.pop, y); if (!pv) continue;
        const w = pv.v * (p.share ?? 1); pop += w;
        const g = at(mad, p.gdp ?? p.pop, y); if (!g) continue;
        gsum += w * g.v; gw += w; gi += w * g.interp;
      }
      if (!(pop > 0)) continue;
      vars.population[i] = pop; vars.population_derived[i] = 1; ny++;
      if (gw / pop >= minCov) { vars.gdp_pc[i] = gsum / gw; vars.gdp_pc_derived[i] = 1; vars.gdp_pc_interp[i] = gi / gw; ng++; }
    }
    rep.push(`${a.id} ${ny}y population, ${ng}y gdp_pc`);
  }
  sources.gdp_pc += '; empire-wide actors (data/history/actors.yaml `derived_series`) are the population-weighted mean of their constituent successor-state series, log-linearly interpolated between Maddison benchmark years';
  sources.population += '; empire-wide actors are the share-weighted sum of their constituent successor-state series';
  sources.gdp_pc_derived = sources.population_derived = 'derived (successor-state sum), see data/history/actors.yaml `derived_series`';
  sources.gdp_pc_interp = 'share of the derived gdp_pc weight that came from a log-linear interpolation between Maddison benchmark years (1 = no annual observation behind the value)';
  console.log(`derived empire series: ${rep.join('; ')}`);
}

// ---- Maddison is benchmark years before 1950, so a series with holes loses log_gdp_pc on the hole AND gdp_growth on
// the year after it. 31% of live actor-years in 1911-1930 had no log_gdp_pc, and the actor list was the interwar
// breakdown cohort itself (POL, EST, LVA, ALB, THA, CHN, EGY, IRQ, TUR...): 30 interwar regime steps sat on rows the
// fit could not see, Pilsudski's 1926 coup and the Baltic coups among them. The same log-linear benchmark
// interpolation the `derived_series` block already applies to empire-wide actors is extended here to every actor.
// Rules: inside each actor's OWN observed range only (never extrapolated), never across a gap wider than MAXGAP_ALL,
// and never on a `derived_series` actor — that block owns its window and deliberately nulls territory-change years.
// `gdp_pc_interp` = 1 marks every filled year, so an imputed value is visible in the panel and in public/history.json.
{
  const MAXGAP_ALL = 40;
  let nFill = 0, nActors = 0;
  for (const [id, vars] of Object.entries(panel)) {
    const a = actors.get(id); if (!a || a.derived_series) continue;
    const g = vars.gdp_pc; if (!g) continue;
    const obs = []; for (let i = 0; i < g.length; i++) if (g[i] != null && g[i] > 0) obs.push(i);
    if (obs.length < 2) continue;
    vars.gdp_pc_interp ??= new Array(YEARS.length).fill(null);
    let filled = 0;
    for (let k = 0; k + 1 < obs.length; k++) {
      const lo = obs[k], hi = obs[k + 1];
      if (hi - lo < 2 || hi - lo > MAXGAP_ALL) continue;
      const va = g[lo], vb = g[hi];
      for (let i = lo + 1; i < hi; i++) {
        g[i] = Math.exp(Math.log(va) + (Math.log(vb) - Math.log(va)) * (i - lo) / (hi - lo));
        vars.gdp_pc_interp[i] = 1; filled++;
      }
    }
    if (filled) { nFill += filled; nActors++; }
  }
  sources.gdp_pc += `; a gap inside an actor's own observed Maddison range is filled by log-linear interpolation (never extrapolated, never across a gap > ${MAXGAP_ALL}y) and flagged in gdp_pc_interp`;
  sources.gdp_pc_interp = (sources.gdp_pc_interp ?? '') + (sources.gdp_pc_interp ? '; ' : '') + 'derived: 1 where gdp_pc was log-linearly interpolated between the actor\'s own observed Maddison years (no annual observation behind the value, and its gdp_growth is a smooth fill)';
  console.log(`gdp_pc interpolation: ${nFill} actor-years filled across ${nActors} actors (inside each actor's own observed range)`);
}

// ---- the modern fold: the 2000-2025 measured layer and the 2026 actor snapshot, on the panel clock
// (operator / modern-fold, 2026-09-07). Until now the modern layer lived only in public/world.json, a second
// artefact the engine and the refine loop never see. It is registry-driven: every data/variables.yaml variable with
// `source: { fetch: ... }` and scope `actor` becomes a panel column over [MODERN_FROM, Y1], and every `state`
// variable sourced from the modern actor snapshot becomes a column valued at SNAP alone. The fetchers live in
// scripts/lib/modern.mjs and are read by scripts/build-world.mjs too, so the viewer and the panel cannot drift.
//
// ADDS COLUMNS ONLY. A variable whose id already names a panel column is a collision, not a merge: the build FAILS
// and the registry entry must declare `panel: <column>` (that is why UN WPP population is `population_wpp` and the
// panel's OWID/Maddison `population` is untouched — `population` is a fitted covariate on intrastate_onset).
// Nothing here is carried forward: a source that ends in 2023 leaves 2024-25 null. The engine's own
// last-observation carry-forward (src/engine/core.js buildActorState, with the staleness recorded) is what makes
// createWorld(2025) see them, and that is a stated approximation rather than a fabricated measurement.
{
  const registry = Y('data/variables.yaml');
  const SNAP = Y1;   // the modern snapshot is dated to the panel's last year
  const clash = (col) => Object.values(panel).some(vars => vars[col]?.some(x => x != null));
  const wrote = [];

  for (const v of registry.variables) {
    if (v.scope !== 'actor' || !v.source?.fetch) continue;
    const col = v.panel ?? v.id;
    if (clash(col)) throw new Error(`modern fold: ${v.id} would write into the existing panel column '${col}' — the fold adds columns only. Declare 'panel: <new column>' on the variable in data/variables.yaml.`);
    let n = 0, y0 = Infinity, y1 = -Infinity;
    for (const [code, years] of Object.entries(resolveFetch(v.source, { from: MODERN_FROM, to: Y1 }))) {
      for (const [y, val] of Object.entries(years)) {
        const id = owid(code, +y); if (!id) continue;
        put(id, col, +y, val); n++; y0 = Math.min(y0, +y); y1 = Math.max(y1, +y);
      }
    }
    sources[col] = `${v.label ?? v.id} — ${describeSource(v.source)}${v.unit ? ` (${v.unit})` : ''}; modern fold ${MODERN_FROM}-${Y1}, observed ${n ? `${y0}-${y1}` : 'nothing'}, not carried forward`;
    wrote.push(`${col}=${n}`);
  }

  // the modern actor snapshot (data/actors.yaml capability levels, regime type, nuclear status, chokepoint exposure,
  // and the hand estimates declared in the registry) as columns valued at SNAP alone. Categorical levels are encoded
  // as ordinals; the mapping is written into `sources` so the panel is readable without the registry.
  const snapCols = new Map();
  for (const v of registry.variables) {
    if (v.scope !== 'actor' || v.kind !== 'state' || v.source?.fetch) continue;
    for (const a of actors.values()) {
      if (!a.modern) continue;
      for (const [col, val, note, srcLine] of [...snapshotColumns(v, { ...a.modern, id: a.id }), ...snapshotExtras(v, a.modern)]) {
        if (!Number.isFinite(val)) continue;
        if (!snapCols.has(col)) {
          if (clash(col)) { snapCols.set(col, null); break; }   // the panel already measures this (leader_age/leader_tenure from REIGN): the snapshot does not overwrite it
          snapCols.set(col, { v, note, srcLine, n: 0 });
        }
        const rec = snapCols.get(col); if (!rec) continue;
        put(a.id, col, SNAP, val); rec.n++;
      }
    }
  }
  const skipped = [...snapCols].filter(([, r]) => !r).map(([c]) => c);
  for (const [col, rec] of snapCols) {
    if (!rec) continue;
    const src = rec.v.source ?? {};
    sources[col] = rec.srcLine ? `${rec.srcLine}, modern snapshot valued at ${SNAP}` : `${rec.v.label ?? rec.v.id} — ${src.hand ? `data/actors.yaml ${src.field}` : 'hand estimate in data/variables.yaml'}, modern snapshot valued at ${SNAP}${rec.note ? `; ${rec.note}` : ''}`;
  }
  console.log(`modern fold: ${wrote.length} series columns (${wrote.join(' ')}); ${[...snapCols].filter(([, r]) => r).length} snapshot columns at ${SNAP}${skipped.length ? `; skipped ${skipped.join(' ')} (already measured in the panel)` : ''}`);
}

// ---- era-1945-1991-r2/data-5: splice the World Bank PPP series onto gdp_pc where Maddison has nothing.
// gdp_pc comes from Maddison via OWID and gdp_growth / log_gdp_pc are derived from it, so one null kills three
// covariates and drops the actor from leader_exit, irregular_exit and coup_attempt — from the FITTING sample as well
// as from scoring, so the coefficients were estimated on a systematically richer subset of the system. Measured over
// live actor-years 1950-2020 before this block: 827 had gdp_pc null while gdp_pc_ppp (World Bank, already folded into
// the panel above) was non-null, concentrated in whole-life gaps (BHS GRD VCT ATG KNA BLZ GUY SUR SOM SDN BTN MDV BRN
// PNG VUT SLB FJI WSM all 31 of 31 years). The backtest's exclusion count GREW over time: leader_exit lost 5 actors to
// a null gdp_growth at as-of 1960 and 33 at as-of 2010, where it was the largest single exclusion reason of any kind.
// Construction is the ratio splice scripts/lib/capability.mjs already uses for CINC 2023-24: the two series measure
// the same quantity in different base years and different price concepts, so the level is matched on the actor's own
// overlap (geometric mean of gdp_pc / gdp_pc_ppp) where it has one and on the pooled cross-actor ratio where it does
// not, and only NULL years are written. Every filled year is flagged in gdp_pc_wb.
{
  const R = [];                                        // pooled log ratio, over every actor-year that has both
  const perActor = new Map();
  for (const [id, vars] of Object.entries(panel)) {
    if (!vars.gdp_pc || !vars.gdp_pc_ppp) continue;
    const rs = [];
    for (let i = 0; i < YEARS.length; i++) { const m = vars.gdp_pc[i], w = vars.gdp_pc_ppp[i]; if (m > 0 && w > 0) { rs.push(Math.log(m / w)); R.push(Math.log(m / w)); } }
    if (rs.length) perActor.set(id, { r: rs.reduce((a, b) => a + b, 0) / rs.length, n: rs.length });
  }
  const pooled = R.length ? R.reduce((a, b) => a + b, 0) / R.length : null;
  // held-out check on the splice itself: for the actors that HAVE both series, how well does the pooled ratio alone
  // reproduce the Maddison value? Printed, not asserted — an actor with its own overlap never uses the pooled number.
  let within = 0, tot = 0;
  for (const [, v] of perActor) { tot++; if (pooled != null && Math.abs(v.r - pooled) < Math.log(1.10)) within++; }
  let filled = 0; const actorsFilled = new Set();
  if (pooled != null) for (const [id, vars] of Object.entries(panel)) {
    if (!vars.gdp_pc_ppp) continue;
    vars.gdp_pc ??= new Array(YEARS.length).fill(null);
    vars.gdp_pc_wb ??= new Array(YEARS.length).fill(null);
    const r = perActor.get(id)?.r ?? pooled;
    for (let i = 0; i < YEARS.length; i++) { const w = vars.gdp_pc_ppp[i]; if (vars.gdp_pc[i] != null || !(w > 0)) continue; vars.gdp_pc[i] = Math.exp(r) * w; vars.gdp_pc_wb[i] = 1; filled++; actorsFilled.add(id); }
  }
  sources.gdp_pc += `; where Maddison has no row and the World Bank PPP series does, gdp_pc is that series level-matched to Maddison (geometric-mean ratio on the actor's own overlap, else the pooled ratio exp(${pooled?.toFixed(3)}) over ${R.length} actor-years) and flagged in gdp_pc_wb`;
  sources.gdp_pc_wb = 'derived: 1 where gdp_pc was spliced from the World Bank PPP series (data/variables.yaml gdp_pc_ppp) because Maddison has no row for that actor-year';
  console.log(`gdp_pc World Bank splice: ${filled} actor-years across ${actorsFilled.size} actors; pooled log ratio ${pooled?.toFixed(3)} over ${R.length} overlap actor-years; ${within}/${tot} actors with an overlap sit within 10% of the pooled ratio`);
}

// ---- derived: gdp growth, log gdp pc, milex share proxy, great power flag
for (const [id, vars] of Object.entries(panel)) {
  const a = actors.get(id);
  if (vars.gdp_pc) {
    vars.gdp_growth = vars.gdp_pc.map((v, i) => (v != null && i > 0 && vars.gdp_pc[i - 1] != null ? Math.log(v / vars.gdp_pc[i - 1]) : null));
    vars.log_gdp_pc = vars.gdp_pc.map(v => (v != null ? Math.log(v) : null));
  }
  vars.great_power = YEARS.map(y => { const gp = a?.great_power; if (!gp) return 0; for (let i = 0; i < gp.length; i += 2) if (y >= gp[i] && (gp[i + 1] == null || y < gp[i + 1])) return 1; return 0; });
  vars.live = YEARS.map(y => (a && isLive(a, y) ? 1 : 0));
  vars.modeled = YEARS.map(() => (a?.modeled ? 1 : 0));
  vars.year = YEARS.map(y => y);
  // superpower client ties: 0 inside coverage when absent, carried forward after the alliance data ends (2000)
  for (const v of ['pact_usa', 'pact_rus']) { vars[v] ??= new Array(YEARS.length).fill(null); let last = null; YEARS.forEach((y, i) => { if (!a || !isLive(a, y)) return; if (vars[v][i] == null) vars[v][i] = y <= 2000 ? 0 : last; last = vars[v][i]; }); }
  vars.sp_client_any = YEARS.map((y, i) => ((vars.pact_usa[i] || vars.pact_rus[i]) ? 1 : 0));
  vars.sp_client_one = YEARS.map((y, i) => ((vars.pact_usa[i] ? 1 : 0) + (vars.pact_rus[i] ? 1 : 0) === 1 ? 1 : 0));
  vars.patron_regime = YEARS.map((y, i) => { const usa = panel.USA?.regime?.[i], rus = panel.RUS?.regime?.[i]; if (vars.pact_usa?.[i] && !vars.pact_rus?.[i]) return usa ?? null; if (vars.pact_rus?.[i] && !vars.pact_usa?.[i]) return rus ?? null; if (vars.pact_usa?.[i] && vars.pact_rus?.[i]) return ((usa ?? 0) + (rus ?? 0)) / 2; return 0; });
  vars.hegemon_x_client = YEARS.map((y, i) => (vars.pact_usa?.[i] ? (panel.USA?.regime?.[i] ?? 3) : 0));   // US clients see the hegemon's own regime score; others 0
  // the era flags these used to carry (bipolar, unipolar_us, cold_war, anticoup_norm, great_game, aid_conditionality,
  // hegemon_regime) are now derived from world state further down — operator / derived-polarity, package 9. The typed
  // calendar versions are kept for one run as `*_dates` so the checker can diff them.
  vars.bipolar_dates = YEARS.map(y => (y >= 1947 && y <= 1991 ? 1 : 0));
  vars.unipolar_us_dates = YEARS.map(y => (y >= 1992 && y <= 2016 ? 1 : 0));
  vars.great_game_dates = YEARS.map((y, i) => (vars.bipolar_dates[i] && vars.sp_client_any[i] ? 1 : 0));
  vars.aid_conditionality_dates = YEARS.map((y, i) => (vars.unipolar_us_dates[i] ? (vars.aid_gni?.[i] != null ? Math.min(vars.aid_gni[i], 30) / 10 : null) : 0));
  vars.hegemon_regime_dates = YEARS.map((y, i) => (y >= 1946 ? (panel.USA?.regime?.[i] ?? null) : (panel.GBR?.regime?.[i] ?? null)));
  vars.cold_war_dates = YEARS.map(y => (y <= 1991 ? 1 : 0));
  vars.anticoup_norm_dates = YEARS.map(y => (y >= 2000 ? 1 : 0));   // AU Lomé 2000 / OAS 1991-2001: coups cost recognition and aid
}

// ---- modern capability: extend `cinc` past NMC's last year (operator / modern-capability, package 10).
// NMC stops; the forecast horizon does not. Rather than carry the last CINC forward for the rest of the run, the
// years after it are the five-indicator composite of scripts/lib/capability.mjs, spliced onto CINC per actor over
// their overlap. `cinc_spliced` says which of the two a value is; the correlation of the composite with CINC over
// 1990-<NMC's last year> is printed and is the package's r >= 0.95 test.
{
  const liveAt = (id, y) => !!panel[id]?.live?.[y - Y0];
  const cincOf = (id, y) => panel[id]?.cinc?.[y - Y0] ?? null;
  const { composite } = compositeShares({ from: 1960, to: Y1, idOf: owid, liveAt });
  const check = validate({ composite, cincOf, liveAt, from: 1990, to: nmcLast });
  const { values, factor } = spliceComposite({ composite, cincOf, liveAt, lastCinc: nmcLast, extendTo: Y1 });
  for (const [id, vars] of Object.entries(panel)) if (vars.cinc) YEARS.forEach((y, i) => { if (vars.cinc[i] != null && y <= nmcLast) put(id, 'cinc_spliced', y, 0); });
  const ext = [];
  for (const y of Object.keys(values).map(Number).sort((a, b) => a - b)) {
    let k = 0;
    for (const [id, v] of Object.entries(values[y])) { put(id, 'cinc', y, v); put(id, 'cinc_spliced', y, 1); k++; }
    ext.push(`${y}:${k}`);
  }
  const parts = COMPONENTS.map(c => `${c.stands_for}<-${c.id}`).join(' ');
  const extLast = Object.keys(values).map(Number).sort((a, b) => a - b).pop() ?? nmcLast;
  sources.cinc += `; ${nmcLast + 1}-${extLast} is the modern capability composite (${parts}; ${MISSING_COMPONENTS.map(m => m.stands_for).join(', ')} not represented) spliced onto CINC over the ${SPLICE_YEARS} overlap years to ${nmcLast}, scripts/lib/capability.mjs; ${extLast < Y1 ? `${extLast + 1}-${Y1} has no source and is left null — the engine carries the last value forward and records the staleness` : 'no year is carried'}`;
  sources.cinc_spliced = `0 where cinc is CoW NMC's own measurement, 1 where it is the modern composite spliced onto it (scripts/lib/capability.mjs); composite vs CINC 1990-${nmcLast} r=${check.r?.toFixed(3)} (n=${check.n}), log r=${check.r_log?.toFixed(3)}`;
  console.log(`capability composite: r=${check.r?.toFixed(4)} log r=${check.r_log?.toFixed(4)} against CINC 1990-${nmcLast} (n=${check.n} actor-years); ${Object.keys(factor).length} actors spliced; extended ${ext.join(' ') || 'nothing'}`);
}

// ---- derived world state: polarity, the hegemon and the eras (operator / derived-polarity, package 9).
// `bipolar`, `unipolar`, `cold_war`, `anticoup_norm`, `great_game`, `aid_conditionality` and `hegemon_regime` were
// typed calendar years (1947-1991, 1992-2016, >=2000). They are now functions of the capability distribution, the
// hegemon's own regime and the democratic share of the system, computed by src/engine/polarity.js — the same module
// src/engine/core.js runs forward, so a fitted era term means the same thing in the fit and in the simulation.
// The typed versions survive one run as `*_dates` (written above) for the checker to diff.
{
  const at = (y) => y - Y0;
  const liveAt = (id, y) => panel[id]?.live?.[at(y)] === 1;
  // Military expenditure shares. CoW NMC carries milex to its own last year; past it the levels come from the same
  // World Bank series the capability composite's milex component uses. Only the *shares* enter the construction, so
  // the two need not be on one scale, but the join is stated in the column's source line rather than left implicit.
  const wbMilex = componentLevels({ from: nmcLast + 1, to: Y1, idOf: owid }).milex ?? {};
  const shareOf = (get) => (y) => { const m = new Map(); for (const id of Object.keys(panel)) { if (!liveAt(id, y)) continue; const v = get(id, y); if (v == null || !(v > 0)) continue; m.set(id, v); } return normalise(m); };
  const cincShare = shareOf((id, y) => panel[id].cinc?.[at(y)]);
  const milexShare = shareOf((id, y) => (y <= nmcLast ? panel[id].milex?.[at(y)] : wbMilex[id]?.[y]));

  // the first year any actor has an ODA/GNI observation: before it, aid conditionality is a structural zero
  const aidFrom = Math.min(...Object.values(panel).map(v => { const i = v.aid_gni?.findIndex(x => x != null) ?? -1; return i < 0 ? Infinity : YEARS[i]; }));
  let sm = null;
  const W = YEARS.map(y => {
    const raw = projectionShares(cincShare(y), milexShare(y));
    if (!raw.size) return null;
    const alive = new Set(Object.keys(panel).filter(id => liveAt(id, y)));
    sm = smoothShares(sm, raw, POLARITY.lambda, alive);
    const st = classify(sm); if (!st) return null;
    let n = 0, d = 0;
    for (const id of Object.keys(panel)) { if (!liveAt(id, y)) continue; const r = panel[id].regime?.[at(y)]; if (r == null) continue; n++; if (r >= POLARITY.hegemon_regime_min) d++; }
    const demShare = n ? d / n : null;
    const hegRegime = panel[st.hegemon]?.regime?.[at(y)] ?? null;
    return { y, raw, sm: new Map(sm), st, demShare, hegRegime, flags: eraFlags({ polarity: st.polarity, hegemonRegime: hegRegime, demShare }) };
  });
  const r9 = (v) => (v == null ? null : Math.round(v * 1e9) / 1e9);
  for (const [id, vars] of Object.entries(panel)) {
    vars.pol_mass = W.map(w => r9(w?.raw.get(id) ?? null));
    vars.pol_share = W.map(w => r9(w?.sm.get(id) ?? null));
    vars.is_hegemon = W.map(w => (w ? (w.st.hegemon === id ? 1 : 0) : null));
    for (const f of ['bipolar', 'unipolar', 'multipolar', 'cold_war', 'anticoup_norm', 'promotion_era']) vars[f] = W.map(w => (w ? w.flags[f] : null));
    vars.n_poles = W.map(w => w?.st.n_poles ?? null);
    vars.hegemon_share = W.map(w => r9(w?.st.hegemon_share ?? null));
    vars.dem_share = W.map(w => r9(w?.demShare ?? null));
    vars.hegemon_regime = W.map(w => w?.hegRegime ?? null);
    vars.great_game = W.map((w, i) => (w ? greatGame(vars.sp_client_any[i], w.flags.bipolar) : null));
    vars.aid_conditionality = W.map((w, i) => (w ? conditionality(w.flags.promotion_era, vars.aid_gni?.[i] ?? null, YEARS[i] >= aidFrom) : null));
  }
  // the world-level series itself, for the diagnostic and for docs: one row per year, no actor lookup needed
  meta_polarity = W.filter(Boolean).map(w => ({ year: w.y, polarity: w.st.polarity, poles: w.st.poles, hegemon: w.st.hegemon,
    hegemon_share: r9(w.st.hegemon_share), gap1: w.st.gap1 == null ? null : +w.st.gap1.toFixed(3), gap2: w.st.gap2 == null ? null : +w.st.gap2.toFixed(3),
    hegemon_regime: w.hegRegime, dem_share: r9(w.demShare), promotion_era: w.flags.promotion_era, anticoup_norm: w.flags.anticoup_norm }));

  // the information wave: the logistic the panel's own info_access traces, fitted here and read by the engine, in
  // place of the hand-typed rate switch at 1985 (src/engine/polarity.js).
  const meanInfo = YEARS.map(y => { let s = 0, n = 0; for (const [id, v] of Object.entries(panel)) { if (!liveAt(id, y)) continue; const x = v.info_access?.[at(y)]; if (x == null) continue; s += x; n++; } return [y, n ? s / n : null]; });
  meta_info_wave = fitLogistic(meanInfo);
  // and the rate at which an actor closes its gap to that frontier, fitted against what the rule produces: the wave
  // is run forward from five starting years and scored on the live-actor mean it makes, not on one-year differences.
  if (meta_info_wave) {
    const series = Object.entries(panel).filter(([, v]) => v.info_access).map(([id, v]) => new Map(YEARS.map((y, i) => [y, liveAt(id, y) ? v.info_access[i] : null]).filter(([, x]) => x != null)));
    const infoLast = Math.max(...YEARS.filter(y => Object.values(panel).some(v => v.info_access?.[at(y)] != null)));
    Object.assign(meta_info_wave, fitDiffusionRate(series, meta_info_wave, [1965, 1975, 1985, 1995, 2005], infoLast) ?? {});
    meta_info_wave.source = `estimate: logistic least squares on the live-actor mean of info_access ${Y0}-${infoLast}; kappa minimises the error of the simulated mean against the observed one from 1965, 1975, 1985, 1995 and 2005 (src/engine/polarity.js)`;
  }

  const runs = []; for (const w of W) { if (!w) continue; const last = runs[runs.length - 1]; if (last && last.p === w.st.polarity) last.b = w.y; else runs.push({ p: w.st.polarity, a: w.y, b: w.y }); }
  const era = (p) => runs.filter(r => r.p === p).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
  const bi = era('bipolar'), uni = era('unipolar');
  sources.pol_mass = `projection-weighted capability share: geometric mean of the CINC share and the military-expenditure share over live actors (weight ${POLARITY.cinc_weight}); milex from ${NMC.label.split(' (')[0]} to ${nmcLast}, World Bank MS.MIL.XPND.GD.ZS x NY.GDP.MKTP.CD after (src/engine/polarity.js)`;
  sources.pol_share = `pol_mass smoothed with an EWMA, lambda=${POLARITY.lambda} (src/engine/polarity.js) — the state polarity is classified from`;
  sources.bipolar = sources.unipolar = sources.multipolar = sources.n_poles = sources.is_hegemon = sources.hegemon_share =
    `derived: poles are the actors above the first gap of ${POLARITY.gap}x in the ranked pol_share; 1 pole = unipolar, 2 = bipolar, else multipolar (src/engine/polarity.js). Longest derived eras: bipolar ${bi ? `${bi.a}-${bi.b}` : 'none'}, unipolar ${uni ? `${uni.a}-${uni.b}` : 'none'}`;
  sources.cold_war = 'derived: the world is bipolar (replaces the typed year <= 1991; cold_war_dates keeps it for one run)';
  sources.promotion_era = `derived: unipolar and the hegemon's own regime >= ${POLARITY.hegemon_regime_min} (replaces the typed 1992-2016)`;
  sources.anticoup_norm = `derived: at least ${POLARITY.dem_share} of live states score regime >= ${POLARITY.hegemon_regime_min} (replaces the typed year >= 2000; anticoup_norm_dates keeps it for one run)`;
  sources.dem_share = `share of live actors with a regime score, scoring >= ${POLARITY.hegemon_regime_min} (V-Dem RoW)`;
  sources.hegemon_regime = 'derived: the regime score of the top actor by pol_share (replaces the typed largest-power-by-date rule; hegemon_regime_dates keeps it for one run)';
  sources.great_game = 'derived: superpower client x bipolar world (bipolar is now derived; great_game_dates keeps the typed-era version for one run)';
  sources.aid_conditionality = `derived: ODA/GNI capped at ${POLARITY.aid_cap}% in tens during the derived promotion era, a structural zero outside it (aid_conditionality_dates keeps the typed-era version for one run)`;
  for (const v of ['bipolar', 'unipolar_us', 'cold_war', 'anticoup_norm', 'great_game', 'aid_conditionality', 'hegemon_regime']) sources[`${v}_dates`] = 'the typed calendar-year era flag this build replaced with derived world state, kept one run for the checker to diff (operator / derived-polarity)';
  console.log(`derived polarity: ${runs.length} states 1816-${Y1}; bipolar ${bi ? `${bi.a}-${bi.b}` : 'none'} (typed 1947-1991), unipolar ${uni ? `${uni.a}-${uni.b}` : 'none'} (typed 1992-2016); ${W.filter(w => w && w.st.polarity === 'multipolar' && w.y >= 1870 && w.y <= 1938).length}/69 of 1870-1938 multipolar; info wave L=${meta_info_wave?.L} r=${meta_info_wave?.r} t0=${meta_info_wave?.t0} rmse=${meta_info_wave?.rmse} (n=${meta_info_wave?.n}), diffusion kappa=${meta_info_wave?.kappa} rmse=${meta_info_wave?.kappa_rmse} (n=${meta_info_wave?.kappa_n})`);
}

// ---- military presence (operator / presence): bases, garrisons, fleet stations and advisor missions as a dated
// layer, from data/presence.yaml through src/engine/presence.js — the same module scripts/lib/fit.mjs and the engine
// read, so a presence covariate means one thing in the fit and in the simulation. Columns:
//   presence_<POWER>  the level of that power's station on this actor's territory (0 none, 1 outpost/advisors,
//                     2 base or brigade, 3 fleet HQ / corps / occupation), for every power with enough distinct land
//                     hosts to vary across actors (PRESENCE.min_hosts)
//   presence_any      the maximum over powers
//   presence_change   a withdrawal: some power's level on this actor FELL within the last PRESENCE.window years
//   troops_usa_host   US military personnel stationed in the country (Troopdata, 1950-2024) — the levels above are
//                     hand-coded ordinals and this is the measured series they are calibrated against
// Every column is null outside the layer's own coverage claim (1870-2026) and outside an actor's live years: the
// absence of a record before 1870 is not an observation that nothing was there.
{
  const recs = Y('data/presence.yaml');
  const index = presenceIndex(recs, { y0: Y0, y1: Math.max(Y1, PRESENCE.covers[1]) });
  const known = new Set(Object.keys(panel));
  const offMap = [...index.byHost.keys()].filter(h => !String(h).startsWith('sea:') && !known.has(h));
  for (const [id, vars] of Object.entries(panel)) {
    const fill = (name, f) => { vars[name] = YEARS.map((y, i) => (vars.live?.[i] && covered(y) ? f(y) : null)); };
    for (const p of index.columnPowers) fill(`presence_${p}`, (y) => powerLevel(index, id, p, y));
    fill('presence_any', (y) => hostLevel(index, id, y));
    fill('presence_change', (y) => (lastFall(index, id, y) != null ? 1 : 0));
  }
  // Troopdata (Allen, Flynn & Martinez Machain), US deployments by country-year 1950-2024: the measured series the
  // hand-coded levels are checked against. Joined on ISO3, which is the panel's own actor id.
  let troopRows = 0; const unmatched = new Set();
  for (const r of readCsv(H + 'troopdata-rebuild-country-year.csv')) {
    const y = +r.year, iso = r.iso3c; if (!iso || iso === 'NA') continue;
    if (!panel[iso]) { unmatched.add(iso); continue; }
    const n = r.troops_ad === '' || r.troops_ad == null ? null : +r.troops_ad;
    if (n == null || Number.isNaN(n)) continue;
    if (panel[iso].live?.[y - Y0]) { put(iso, 'troops_usa_host', y, n); troopRows++; }
  }
  const usaCol = index.columnPowers.includes('USA') ? 'presence_USA' : null;
  // calibration of the ordinal against the measured series: mean log10 troops per declared level, on the actor-years
  // where both exist. Monotone in the level is the claim the levels make; the numbers are printed, not asserted.
  const buckets = new Map();
  if (usaCol) for (const [id, vars] of Object.entries(panel)) YEARS.forEach((y, i) => {
    const L = vars[usaCol]?.[i], t = vars.troops_usa_host?.[i];
    if (L == null || t == null) return;
    const b = buckets.get(L) ?? buckets.set(L, { n: 0, s: 0, pos: 0 }).get(L);
    b.n++; b.pos += t > 100 ? 1 : 0; b.s += Math.log10(Math.max(1, t));
  });
  const calib = [...buckets].sort((a, b) => a[0] - b[0]).map(([L, b]) => `L${L} n=${b.n} median-ish 10^${(b.s / b.n).toFixed(2)} (${(b.pos / b.n * 100).toFixed(0)}% >100 troops)`);
  const powersLine = index.powers.map(p => `${p}:${index.hostCount[p]}`).join(' ');
  for (const p of index.columnPowers) sources[`presence_${p}`] = `data/presence.yaml (hand-coded dated stations, mostly \`estimate\` dates, two 2026 operator entries unverified): level of this power's base/garrison/fleet/advisor presence on the actor's territory, 0-3, null outside ${PRESENCE.covers[0]}-${PRESENCE.covers[1]}`;
  sources.presence_any = 'data/presence.yaml: max presence level of any great power on the actor that year (src/engine/presence.js)';
  sources.presence_change = `data/presence.yaml: 1 where some power's level on this actor fell within the last ${PRESENCE.window} years, the fall year included — a withdrawal (src/engine/presence.js)`;
  sources.troops_usa_host = 'Troopdata (Allen, Flynn & Martinez Machain), troops_ad, US military personnel by country-year 1950-2024; data/raw/hist/troopdata-rebuild-country-year.csv';
  console.log(`presence: ${recs.length} records, powers by distinct land hosts ${powersLine}; columns for ${index.columnPowers.join(' ')}; ${offMap.length} hosts outside the actor universe (map only): ${offMap.join(' ')}`);
  console.log(`presence troops join: ${troopRows} actor-years, ${unmatched.size} ISO3 codes with no actor (${[...unmatched].slice(0, 8).join(' ')}${unmatched.size > 8 ? ' …' : ''}); level vs troops: ${calib.join('; ')}`);
}

// ---- empires on successor-state borders: drop the OWID/Maddison population series where it is a modern-borders series
// for a multinational empire (CoW NMC tpop is genuinely empire-wide and stays). Declared per actor in data/history/actors.yaml
// as `successor_borders_until: <year>`; where the actor also declares a `derived_series` the empire-wide sum built above
// owns those years and is kept.
{
  let dropped = 0;
  for (const [id, vars] of Object.entries(panel)) {
    const a = actors.get(id); const until = a?.successor_borders_until; if (!until || !vars.population) continue;
    YEARS.forEach((y, i) => { if (y < until && vars.population[i] != null && !vars.population_derived?.[i]) { vars.population[i] = null; dropped++; } });
  }

  // ---- hard guard: population (modern-successor borders) and tpop (CoW NMC, contemporaneous borders) are two
  // measurements of one quantity. Where they disagree by more than 30% in logs for a live actor-year, one of them is
  // describing a different territory and the panel is joining two states in one row — the failure this whole block
  // exists to stop. The build FAILS on any such row that is not declared in data/history/population_guard.yaml
  // (`{ id, spans, prefer, reason, source }`):
  //   prefer: tpop        the OWID modern-borders value is dropped for those years (the actor is bigger than its successor)
  //   prefer: population  the NMC value is dropped (NMC is the one measuring something else)
  //   prefer: none        a declared, unresolved disagreement — two independent estimates of the same territory, kept
  //                       and exempted with a reason. It is not a borders join and neither series is demonstrably wrong.
  const GUARD = 0.3;
  const decl = new Map();      // id -> every declared span, for the exemption test (prefer is irrelevant there)
  const rules = [];            // one entry per declaration, so an actor with two declarations keeps a `prefer` per span
  for (const g of Y('data/history/population_guard.yaml')) {
    const spans = g.spans ?? [[g.from ?? Y0, g.until ?? Y1 + 1]];
    const d = decl.get(g.id) ?? decl.set(g.id, { spans: [] }).get(g.id);
    d.spans.push(...spans);
    rules.push({ id: g.id, spans, prefer: g.prefer ?? 'none' });
    if (!g.reason) throw new Error(`population_guard ${g.id}: every declaration needs a reason`);
  }
  for (const { id, spans, prefer } of rules) {
    const vars = panel[id]; if (!vars) continue;
    if (prefer === 'none') continue;
    const v = prefer === 'tpop' ? 'population' : 'tpop';
    YEARS.forEach((y, i) => { if (spans.some(([f, t]) => y >= f && y < t) && vars[v]?.[i] != null && vars.population?.[i] != null && vars.tpop?.[i] != null && Math.abs(Math.log(vars.population[i] / vars.tpop[i])) > GUARD) { vars[v][i] = null; dropped++; } });
  }
  const bad = [], exempt = new Map();
  let rows = 0;
  for (const [id, vars] of Object.entries(panel)) {
    if (!vars.population || !vars.tpop) continue;
    const d = decl.get(id);
    YEARS.forEach((y, i) => {
      const a = vars.population[i], b = vars.tpop[i]; if (a == null || b == null || !vars.live?.[i]) return;
      rows++; const r = Math.abs(Math.log(a / b)); if (r <= GUARD) return;
      if (d && d.spans.some(([f, t]) => y >= f && y < t)) { const e = exempt.get(id) ?? exempt.set(id, { n: 0, worst: 0 }).get(id); e.n++; e.worst = Math.max(e.worst, r); return; }
      bad.push([id, y, r]);
    });
  }
  bad.sort((x, y) => y[2] - x[2]);
  console.log(`population/tpop guard: ${rows} rows compared, ${bad.length} undeclared violations, ${[...exempt.values()].reduce((n, e) => n + e.n, 0)} declared exemptions across ${exempt.size} actors (${[...exempt].map(([id, e]) => `${id} ${e.n}y up to ${(Math.exp(e.worst) * 100).toFixed(0)}%`).join(', ')}); ${dropped} actor-years dropped`);
  if (bad.length) {
    console.error(`population/tpop guard FAILED: ${bad.length} live actor-years where |log(population/tpop)| > ${GUARD} and no declaration in data/history/population_guard.yaml:`);
    const byActor = new Map();
    for (const [id, y, r] of bad) { const g = byActor.get(id) ?? byActor.set(id, { ys: [], worst: 0, wy: 0 }).get(id); g.ys.push(y); if (r > g.worst) { g.worst = r; g.wy = y; } }
    for (const [id, g] of [...byActor].sort((a, b) => b[1].ys.length - a[1].ys.length))
      console.error(`  ${id} ${g.ys.length}y ${Math.min(...g.ys)}-${Math.max(...g.ys)}: worst ${g.wy} population ${(panel[id].population[g.wy - Y0] / 1e6).toFixed(2)}M vs tpop ${(panel[id].tpop[g.wy - Y0] / 1e6).toFixed(2)}M (x${Math.exp(g.worst).toFixed(2)})`);
    process.exit(1);
  }
  sources.population += '; successor-borders series dropped before `successor_borders_until` (data/history/actors.yaml); build guard |log(population/tpop)| <= 0.3 on every live actor-year, exemptions declared in data/history/population_guard.yaml';
}

// ---- neighbourhood covariates from CShapes contiguity (1886+): who your neighbours are and what just happened to them
{
  const contig = JSON.parse(readFileSync('data/contiguity.json', 'utf8')).pairs;
  const nbrs = {};   // id -> [[other, from, to], ...]
  for (const [k, ivs] of Object.entries(contig)) { const [a, b] = k.split('|'); for (const [f, t] of ivs) { (nbrs[a] ??= []).push([b, f, t]); (nbrs[b] ??= []).push([a, f, t]); } }
  const g = (id, v, i) => panel[id]?.[v]?.[i];
  for (const [id, vars] of Object.entries(panel)) {
    if (vars.regime) { vars.regime_up = vars.regime.map((r, i) => (i > 0 && r != null && vars.regime[i - 1] != null && r > vars.regime[i - 1] ? 1 : 0)); vars.regime_down = vars.regime.map((r, i) => (i > 0 && r != null && vars.regime[i - 1] != null && r < vars.regime[i - 1] ? 1 : 0)); }
  }
  const win = (nid, v, i) => { for (let k = 1; k <= 5; k++) { const x = g(nid, v, i - k); if (x != null && x > 0) return 1; } return 0; };
  for (const [id, vars] of Object.entries(panel)) {
    const a = actors.get(id); if (!a) continue;
    const N = { nbr_count: [], nbr_democracy_share: [], nbr_conflict_count: [], bad_neighbourhood: [], nbr_coup_recent: [], nbr_regime_up_recent: [], nbr_regime_down_recent: [], nbr_at_war_share: [] };
    YEARS.forEach((y, i) => {
      if (y < 1886 || !isLive(a, y)) { for (const k of Object.keys(N)) N[k].push(null); return; }
      const ns = (nbrs[id] ?? []).filter(([, f, t]) => y >= f && y <= t).map(([o]) => o).filter(o => panel[o]?.live?.[i]);
      const withRegime = ns.filter(o => g(o, 'regime', i) != null);
      const dem = withRegime.filter(o => g(o, 'regime', i) >= 2).length;
      const conflict = ns.filter(o => (g(o, 'intrastate', i) ?? 0) > 0 || (g(o, 'at_war', i) ?? 0) > 0).length;
      N.nbr_count.push(ns.length);
      N.nbr_democracy_share.push(withRegime.length ? dem / withRegime.length : null);
      N.nbr_conflict_count.push(conflict);
      N.bad_neighbourhood.push(conflict >= 4 ? 1 : 0);
      N.nbr_coup_recent.push(ns.some(o => win(o, 'coup_attempt', i)) ? 1 : 0);
      N.nbr_regime_up_recent.push(ns.some(o => win(o, 'regime_up', i)) ? 1 : 0);
      N.nbr_regime_down_recent.push(ns.some(o => win(o, 'regime_down', i)) ? 1 : 0);
      N.nbr_at_war_share.push(ns.length ? ns.filter(o => (g(o, 'at_war', i) ?? 0) > 0).length / ns.length : null);
    });
    Object.assign(vars, N);
  }
  sources.nbr_democracy_share = 'derived from CShapes contiguity + V-Dem RoW (Gleditsch & Ward 2006)';
  sources.bad_neighbourhood = 'PITF: ≥4 contiguous neighbours in armed conflict (UCDP intrastate or hand wars)';
}

// ---- duplicate-entity check: two actors that share a CoW/GW code and are live in the same year are one state counted twice
{
  const byCode = new Map();
  for (const a of actors.values()) { const c = a.cow ?? a.gw; if (c == null) continue; (byCode.get(c) ?? byCode.set(c, []).get(c)).push(a); }
  const dup = [];
  for (const [c, list] of byCode) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const ys = YEARS.filter(y => isLive(list[i], y) && isLive(list[j], y));
    if (ys.length) dup.push(`code ${c}: ${list[i].id} and ${list[j].id} both live ${ys[0]}-${ys[ys.length - 1]} (${ys.length}y)`);
  }
  console.log(dup.length ? `duplicate entities: ${dup.length}\n  ${dup.join('\n  ')}` : 'duplicate entities: none (no two actors share a CoW/GW code in the same year)');
}

// ---- era-1914-1945-r2/data-7: actors that are LIVE before their capability source covers them. Those actor-years are
// silently absent from every dyadic template (scripts/lib/fit.mjs drops a dyad whose cinc is null on either side) and
// nothing reported them. Printed every build, with the actor's own declared `capability_from` where it has one.
{
  const holes = [];
  for (const [id, vars] of Object.entries(panel)) {
    const a = actors.get(id); if (!a || !vars.cinc) continue;
    let firstLive = null, firstCinc = null, gap = 0;
    YEARS.forEach((y, i) => {
      if (!isLive(a, y)) return;
      if (firstLive == null) firstLive = y;
      if (vars.cinc[i] != null) { if (firstCinc == null) firstCinc = y; } else gap++;
    });
    if (gap > 0 && (firstCinc == null || firstCinc > firstLive)) holes.push({ id, firstLive, firstCinc, gap, declared: a.capability_from ?? null });
  }
  holes.sort((x, y) => y.gap - x.gap);
  const undeclared = holes.filter(h => h.declared == null);
  console.log(`capability coverage: ${holes.length} actors live before CoW NMC covers them (${holes.reduce((n, h) => n + h.gap, 0)} actor-years outside every dyadic template); ${undeclared.length} without a capability_from declaration in data/history/actors.yaml`);
  console.log(`  ${holes.slice(0, 12).map(h => `${h.id} live ${h.firstLive} cinc ${h.firstCinc ?? 'never'} (${h.gap}y${h.declared ? ', declared' : ''})`).join('; ')}`);
}

// ---- write
// meta.vars is the panel's own registry: for every column, where it came from, the first and last year anything was
// measured, and how many actor-years it covers. `introduced` is what tells a reader (and src/engine/core.js, which
// skips the carry-forward scan below it) that a column simply does not exist before a year, rather than being a gap.
const vars = [...new Set(Object.values(panel).flatMap(v => Object.keys(v)))].sort();
const meta = { built: new Date().toISOString(), y0: Y0, y1: Y1, sources, vars: {}, introduced: {}, polarity: meta_polarity, info_wave: meta_info_wave };
for (const v of vars) {
  let first = null, last = null, n = 0, actorsWith = 0;
  for (const a of Object.values(panel)) {
    const col = a[v]; if (!col) continue;
    let has = false;
    for (let i = 0; i < col.length; i++) if (col[i] != null) { n++; has = true; if (first == null || i < first) first = i; if (last == null || i > last) last = i; }
    if (has) actorsWith++;
  }
  meta.vars[v] = { source: sources[v] ?? 'derived', introduced: first == null ? null : Y0 + first, last: last == null ? null : Y0 + last, actor_years: n, actors: actorsWith };
  meta.introduced[v] = first == null ? null : Y0 + first;
}
const out = { meta, years: YEARS, vars, sources, actors: panel };
writeFileSync('data/panel.json', JSON.stringify(out));
const cov = (v) => Object.values(panel).reduce((n, a) => n + (a[v] ? a[v].filter(x => x != null).length : 0), 0);
console.log(`panel.json: ${Object.keys(panel).length} actors × ${YEARS.length} years, ${vars.length} vars, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
console.log('coverage (actor-years):', vars.map(v => `${v}=${cov(v)}`).join('  '));
