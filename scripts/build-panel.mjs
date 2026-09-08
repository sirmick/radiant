// Build the historical actor-year panel 1816–2025 -> data/panel.json
// Sources: CoW NMC 3.02 (1816–2001), Maddison (OWID), OWID population, OWID regime (V-Dem RoW), V-Dem ERT (polyarchy),
// OWID energy by source (1800+), OWID coal/oil production, REIGN (leader age/tenure 1950–2021), CoW alliances 3.03,
// CoW MID 3.02 (1816–2001), UCDP/PRIO 25.1 (1946–2024), hand events (wars with participants).
// Plus the modern layer (operator / modern-fold): UN WPP, World Bank WDI, OWID energy, IEA EV 2000-2025 and the
// modern actor snapshot (data/actors.yaml capability levels, regime type, nuclear status, chokepoint exposure) at 2025.
// Output: { meta: { y0, y1, sources, vars: { <col>: { source, introduced, last, actor_years, actors } } },
//           years: [...], vars: [...], actors: { id: { var: [per-year value|null] } }, sources: {...} }
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, makeOwidMap, isLive, loadPacts } from './lib/hist.mjs';
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
// era-modern-2000-2025/data-5: V-Dem's RoW CATEGORY is undefined in an interregnum year, and the hole therefore lands
// exactly where the transition is. Of the 32 interior single-year regime holes since 1900 (a null with an observed
// year on either side), 18 carry an event in data/events.json in that same year — 15 leader exits, 7 democratization
// onsets, 3 intrastate onsets, 2 coups, 1 intrastate end — including GIN 2010, whose transition year is one of this
// turn's own as-of origins. scripts/lib/fit.mjs drops any row with a null covariate, so those are the highest-signal
// rows in each template's sample and they are missing NOT at random but on the outcome. The hole is filled with the
// value the year opened in — a carry, never an extrapolation past the ends of the actor's own observed run, and never
// across a gap longer than one year — and every filled cell is flagged in `regime_imputed` so it is visible in the
// panel and in public/history.json. `polyarchy`, the continuous series over the same V-Dem data, has exactly one such
// hole (DOM 1905), which is what says this is a property of the category and not a join failure.
{
  let filled = 0; const cases = [];
  for (const [id, vars] of Object.entries(panel)) {
    const r = vars.regime; if (!r) continue;
    for (let i = 1; i < r.length - 1; i++) {
      if (r[i] != null || r[i - 1] == null || r[i + 1] == null) continue;
      r[i] = r[i - 1]; (vars.regime_imputed ??= new Array(YEARS.length).fill(null))[i] = 1; filled++;
      if (cases.length < 40) cases.push(`${id}:${Y0 + i}`);
    }
  }
  sources.regime += `; ${filled} interior single-year holes carried from the year before (era-modern-2000-2025/data-5), flagged in regime_imputed`;
  sources.regime_imputed = 'derived: 1 where the V-Dem RoW category was missing for a single year inside the actor\'s own observed run and was carried from the previous year. Imputation, not an observation';
  console.log(`regime: ${filled} interior single-year holes carried forward (${cases.join(' ')})`);
}
for (const r of readCsv(H + 'ert.csv')) { const y = +r.year, id = owid(r.country_text_id, y); if (id && r.v2x_polyarchy !== 'NA') put(id, 'polyarchy', y, +r.v2x_polyarchy); }
sources.polyarchy = 'V-Dem v2x_polyarchy via ERT';
for (const r of readCsv(H + 'libdem.csv')) { const y = +r.year, id = owid(r.code, y); if (id && r.libdem_vdem__estimate_best !== '') put(id, 'libdem', y, +r.libdem_vdem__estimate_best); }
sources.libdem = 'V-Dem v2x_libdem via OWID (liberal-democracy-index)';

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
// era-modern-2000-2025/data-3, engine-5: the 2022-2025 coup tail. REIGN's Powell-Thyne columns stop in 2021, so the
// panel's coup_attempt / coup_success ended there and `buildActorState` then read the carried FLAG zero as "no coup"
// for every state at a 2026 origin — win5(coup_attempt) = 1 for 4 actors of 195, against 16 at as-of 2000 and 9 at
// 2010. data/history/events.yaml now carries a hand-coded 2022-2025 attempt list on Powell-Thyne's own definition;
// COUP_LAST moves the FLAGS window with it, so the zeros the fill writes for 2022-2025 are a claim the list backs.
let COUP_LAST = 2021;
{
  let n = 0;
  for (const e of Y('data/history/events.yaml')) {
    if (e.kind !== 'coup' || !e.actor) continue;
    const y = Math.floor(e.year); add(e.actor, 'coup_attempt', y, 1); if (e.success) add(e.actor, 'coup_success', y, 1);
    n++; COUP_LAST = Math.max(COUP_LAST, y);
  }
  sources.coup_attempt += `; extended past REIGN's 2021 end by ${n} hand-coded attempts through ${COUP_LAST} (data/history/events.yaml, era-modern-2000-2025/data-3)`;
  sources.coup_success = sources.coup_attempt;
  console.log(`coups: ${n} hand-coded 2022-${COUP_LAST} attempts merged onto REIGN`);
}

// ---- alliances: defence-pact partner count per actor-year; superpower client ties (a defence pact with USA / RUS)
// era-1991-2026-r2/data-7: the graph is CoW 3.03 to 2000, ATOP 5.1 to 2018 and dated accession rows past it
// (scripts/lib/hist.mjs:loadPacts — one construction, also read by the fitter, the backtest and run-forward). It
// used to be CoW alone, and the carry rule below turned "no observation past 2000" into a measured 0 for every
// state that had no alliance in 2000: the seven 2004 NATO entrants, the two of 2009, MNE, MKD, FIN and SWE were
// coded as clients of nobody for 208 actor-years, inside exactly the horizons this era scores.
const { pacts: PACTS, meta: pactMeta } = loadPacts(code);
for (const k of PACTS) {
  const i = k.lastIndexOf('|'); const y = +k.slice(i + 1); const [a, b] = k.slice(0, i).split('|');
  add(a, 'defence_pacts', y, 1); add(b, 'defence_pacts', y, 1);
  for (const [x, other] of [[a, b], [b, a]]) { if (other === 'USA' && x !== 'USA') put(x, 'pact_usa', y, 1); if (other === 'RUS' && x !== 'RUS') put(x, 'pact_rus', y, 1); }
}
sources.defence_pacts = `count of DISTINCT defence-pact partners per actor-year. ${pactMeta.source}. Values from ${pactMeta.stale_from} are the ${pactMeta.atop_last} edge set carried forward plus the dated accessions, not a measurement of those years. NOTE the level halved on 2026-09-07 (era-1991-2026-r2/data-7): both CoW 3.03 and ATOP ship DIRECTED dyad-years, so the previous construction counted every partner twice and the column was 2x the partner count its own label claimed. It feeds no template`;
sources.pact_usa = sources.pact_rus = `a defence pact with USA / USSR-Russia in the dated alliance graph: ${pactMeta.source}`;

// ---- MIDs: per actor-year, use of force (hostlev>=4) and war (5)
for (const r of readCsv(H + 'midb_3.02.csv')) {
  const y = +r.styear, id = code(r.ccode, y); if (!id) continue;
  if (+r.hostlev >= 4) add(id, 'mid_force', y, 1);
  if (+r.hostlev >= 5) add(id, 'mid_war', y, 1);
}
// era-1991-2026-r2/data-1: midb 3.02's disputes stop in 2001 and the FLAGS block below was writing a measured 0 for
// every live actor-year from 2002 to 2025 under a source line that said the source ends in 2001. GML MID 2.2.1
// (scripts/fetch-mid.mjs) carries the same hostlev variable to 2010, so 2002-2010 is read from it — a participant's
// first year in a dispute, the same stamp midb's `styear` gives — and 2011-2026 is left null rather than zero.
{
  const first = new Map();   // `${dispnum}|${ccode}` -> { y, hl }
  for (const r of readCsv(H + 'gml_dirdisp_2.2.1.csv')) {
    const y = +r.year, k = `${r.dispnum}|${r.ccode1}`, hl = +r.hostlev1;
    const p = first.get(k) ?? first.set(k, { y, hl, ccode: r.ccode1 }).get(k);
    p.y = Math.min(p.y, y); p.hl = Math.max(p.hl, hl);
  }
  let n = 0;
  for (const p of first.values()) {
    if (p.y < 2002) continue;                       // already carried by midb 3.02 above
    const id = code(p.ccode, p.y); if (!id) continue;
    if (p.hl >= 4) { add(id, 'mid_force', p.y, 1); n++; }
    if (p.hl >= 5) add(id, 'mid_war', p.y, 1);
  }
  console.log(`mid_force: ${n} participant-dispute entries spliced from GML MID 2.2.1 for 2002-2010`);
}
sources.mid_force = sources.mid_war = 'CoW MID 3.02 participant-level (1816–2001) spliced with GML MID 2.2.1 directed dyad-years (2002–2010, scripts/fetch-mid.mjs); hostility level ≥ 4 (mid_force) / ≥ 5 (mid_war). 2011–2026 has no MID source and is null, not 0';

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
// era-1991-2026-r2/data-2: the hand list alone is empty for most of 1992-2024 — 14 actor-years against 90 in the
// panel's own `interstate_ucdp` column, and 0 for every live actor in 1992-1998, 2000-2002, 2004-2007 and 2009-2021,
// which asserts that nobody on earth was in an interstate war through Bosnia, Nagorno-Karabakh, Eritrea-Ethiopia,
// Kargil and Congo. `lag1(at_war)` is a covariate on eight actor-year templates and `at_war_any` on both dyad
// templates, so that is a wrong covariate VALUE over exactly the horizons this era scores, not a coverage note.
// The union is with UCDP/PRIO ACD type-2 (interstate) conflict-years, already parsed above for `interstate_ucdp`:
// the hand list keeps its per-participant entry/exit dates where it has them, and UCDP supplies the actor-years it
// does not name. UCDP's threshold (25 battle deaths) is lower than a CoW inter-state war's (1,000), so the union is
// broader than the hand list intends to be; it is the honest floor until CoW Inter-State War v4.0 participant dates
// are ingested (docs/escalations.md), and the source line says which of the two any 1 came from via at_war_ucdp.
{
  let n = 0;
  for (const [id, vars] of Object.entries(panel)) {
    const act = actors.get(id);
    vars.at_war_ucdp ??= new Array(YEARS.length).fill(null);
    YEARS.forEach((y, i) => {
      if (act && !isLive(act, y)) return;
      if (y < 1946 || y > 2024) return;
      const u = (vars.interstate_ucdp?.[i] ?? 0) > 0 ? 1 : 0;
      vars.at_war_ucdp[i] = u && (vars.at_war?.[i] ?? 0) < 1 ? 1 : 0;
      if (u && (vars.at_war?.[i] ?? 0) < 1) { put(id, 'at_war', y, 1); n++; }
    });
  }
  console.log(`at_war: ${n} actor-years added from UCDP interstate (type 2) that the hand war list does not name`);
}
sources.at_war = 'union of two sources: data/history/events.yaml, a HAND LIST of interstate wars with per-participant entry/exit dates where declared (complete only where the refine loop has been), and UCDP/PRIO ACD 25.1 type-2 (interstate) conflict-years 1946-2024 for every actor-year the hand list does not name (era-1991-2026-r2/data-2). Outside 1946-2024 the hand list is the only source and absence is still not evidence of peace; ingesting CoW Inter-State War v4.0 participant-level dates the way NMC 7.0 was ingested is what would close the pre-1946 half (docs/escalations.md)';
sources.at_war_ucdp = 'derived: 1 where the at_war year came from UCDP/PRIO type-2 rather than the hand war list, 0 where the hand list carries it (or where neither does), null outside UCDP 1946-2024';

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
const FLAGS = { at_war: [1816, 2026], intrastate: [1946, 2024], interstate_ucdp: [1946, 2024], mid_force: [1816, 2010], mid_war: [1816, 2010], coup_attempt: [1950, COUP_LAST], coup_success: [1950, COUP_LAST], defence_pacts: [1816, 2026] };
// era-1991-2026-r2/engine-4: and null OUTSIDE it. Several of these columns are accumulated with `add`, whose array
// defaults to 0 rather than null, so every year past the source's last one read as a measured "no dispute" — the
// panel asserted mid_force = 0 for every actor from 2002 to 2025 under a source line that said the source stops in
// 2001, and win5(mid_force) carried that assertion into the dyadic hazards. The templates that read a flag outside
// its window declare a `default_outside` for exactly this case, so the null is the value the fitter expects.
for (const [id, vars] of Object.entries(panel)) {
  const a = actors.get(id); if (!a) continue;
  for (const [v, [c0, c1]] of Object.entries(FLAGS)) {
    vars[v] ??= new Array(YEARS.length).fill(null);
    YEARS.forEach((y, i) => {
      if (y < c0 || y > c1) { vars[v][i] = null; return; }
      if (vars[v][i] == null && isLive(a, y)) vars[v][i] = 0;
    });
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
  // The modern snapshot is dated to the panel's last year. data/actors.yaml's own header says it describes
  // 2026-09-06 and it carries fields that are 2026 judgements (a `leader_since: 2026`), so placing it at Y1 is a
  // declared ONE-YEAR LOOKAHEAD over the panel's last measured year, not a measurement of Y1 (era-1991-2026-r2/
  // data-8 (b)). It is harmless only because no template may name a snapshot column — enforced by the single-year
  // covariate guard at the end of this file — and because the columns are display and engine state, not covariates.
  // Extending the panel's year axis to the snapshot's own year is the fix and it moves every horizon; it is
  // recorded in docs/escalations.md rather than done here.
  const SNAP = Y1, SNAP_SOURCE_YEAR = 2026;   // data/actors.yaml header: "Snapshot date: 2026-09-06"
  const clash = (col) => Object.values(panel).some(vars => vars[col]?.some(x => x != null));
  const wrote = [];

  // era-1991-2026-r2/data-8 (d): the clash guard is value-based as well as name-based. A new column under a new NAME
  // can still be an existing column's series — `oil_production` (owid:oil_production) was an exact duplicate of
  // `oil_prod` (OWID fossil production, the same Energy Institute numbers), median ratio 1.0000002 over 2,013
  // overlapping actor-years, sitting in the panel as a second entity. A name check cannot see that; comparing the
  // values can. Two conditions, both required, because the fold's legitimate use of a second measurement is to
  // REACH FURTHER than the historical column: the values must match over the overlap (median |log ratio| below
  // 1e-5), AND the new column must add essentially nothing the old one does not already cover (`population_wpp`
  // matches `population` exactly over 2000-2023 and then supplies 2024-25, which `population` does not have, so it
  // is a genuine extension and passes). oil_production adds 6 of its 3,541 cells and fails.
  // The threshold is 1e-6, the finding's own. Pairs that agree to within 1e-4 but not to 1e-6 are REPORTED rather
  // than refused — `oil_demand` (OWID country file) against `oil_twh` (OWID by-source file) sits at 9.9e-6, which is
  // two roundings of the same Energy Institute series and is the reconciliation docs/refine-log.md already lists as
  // outstanding, not a duplicate this build can adjudicate.
  const existingCols = [...new Set(Object.values(panel).flatMap(v => Object.keys(v)))];
  const near = [];
  const duplicateOf = (col) => {
    let cells = 0; for (const vars of Object.values(panel)) { const a = vars[col]; if (!a) continue; for (let i = 0; i < YEARS.length; i++) if (a[i] != null) cells++; }
    if (!cells) return null;
    for (const other of existingCols) {
      if (other === col) continue;
      const rs = []; let addsCells = 0;
      for (const vars of Object.values(panel)) {
        const a = vars[col], b = vars[other]; if (!a) continue;
        for (let i = 0; i < YEARS.length; i++) {
          if (a[i] == null) continue;
          if (b?.[i] == null) { addsCells++; continue; }
          if (Math.abs(b[i]) > 0) rs.push(Math.abs(Math.log(Math.abs(a[i]) / Math.abs(b[i]))));
        }
      }
      if (rs.length < 200) continue;
      rs.sort((p_, q_) => p_ - q_);
      const med = rs[Math.floor(rs.length / 2)];
      if (med < 1e-4 && addsCells / cells < 0.01) near.push({ col, other, n: rs.length, med, adds: addsCells, cells });
      if (med < 1e-6 && addsCells / cells < 0.01) return { other, n: rs.length, med, adds: addsCells, cells };
    }
    return null;
  };
  for (const v of registry.variables) {
    if (v.scope !== 'actor' || !v.source?.fetch) continue;
    if (v.retired) continue;                       // a retired variable keeps its record and stops being folded
    const col = v.panel ?? v.id;
    if (clash(col)) throw new Error(`modern fold: ${v.id} would write into the existing panel column '${col}' — the fold adds columns only. Declare 'panel: <new column>' on the variable in data/variables.yaml.`);
    let n = 0, y0 = Infinity, y1 = -Infinity;
    for (const [code, years] of Object.entries(resolveFetch(v.source, { from: MODERN_FROM, to: Y1 }))) {
      for (const [y, val] of Object.entries(years)) {
        const id = owid(code, +y); if (!id) continue;
        put(id, col, +y, val); n++; y0 = Math.min(y0, +y); y1 = Math.max(y1, +y);
      }
    }
    const dup = duplicateOf(col);
    if (dup) throw new Error(`modern fold: ${v.id} writes '${col}', whose values match the existing panel column '${dup.other}' (median |log ratio| ${dup.med.toExponential(1)} over ${dup.n} overlapping actor-years, and it adds only ${dup.adds} of its ${dup.cells} cells) — it is the same series under a second name. Retire one of them in data/variables.yaml with a 'retired:' date and reason.`);
    // era-1991-2026-r2/statistics-6: the range in the source line is the column's OBSERVED range, not the fold's
    // window constant — half of these columns used to declare "modern fold 2000-2025" over data starting in 1960.
    sources[col] = `${v.label ?? v.id} — ${describeSource(v.source)}${v.unit ? ` (${v.unit})` : ''}; modern fold, observed ${n ? `${y0}-${y1}` : 'nothing'} (fold window ${MODERN_FROM}-${Y1}), not carried forward`;
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
    const dated = `modern snapshot valued at ${SNAP}${SNAP_SOURCE_YEAR > SNAP ? ` — data/actors.yaml describes ${SNAP_SOURCE_YEAR}, so this column is a declared ${SNAP_SOURCE_YEAR - SNAP}-year lookahead over the panel's last measured year and no template may read it (era-1991-2026-r2/data-8)` : ''}`;
    sources[col] = rec.srcLine ? `${rec.srcLine}, ${dated}` : `${rec.v.label ?? rec.v.id} — ${src.hand ? `data/actors.yaml ${src.field}` : 'hand estimate in data/variables.yaml'}, ${dated}${rec.note ? `; ${rec.note}` : ''}`;
  }
  // era-1991-2026-r2/corridors-8: the chokepoint exposure columns come from data/corridors.yaml, not from a second
  // hand map in data/actors.yaml. The two disagreed on four of the five records they shared and neither carried a
  // source; the corridor layer's `load_bearing_for` has a `load_bearing_source` on every record and a dated history
  // behind it, so it is the one that survives. Still valued at SNAP alone, because 61 of the 84 records with a
  // load_bearing_for still carry no `load_bearing_from` — the year their weights become a claim rather than a
  // back-projection — which is the open half of era-1870-1914-r2/corridors-6 and is recorded in docs/refine-log.md.
  {
    let n = 0;
    for (const rec of Y('data/corridors.yaml')) {
      if (rec.kind !== 'chokepoint' || !rec.load_bearing_for) continue;
      const col = `chokepoint_${rec.id}`;
      for (const [id, v] of Object.entries(rec.load_bearing_for)) { if (!panel[id]) continue; put(id, col, SNAP, +v); n++; }
      sources[col] = `share of external trade transiting ${rec.name ?? rec.id} — data/corridors.yaml load_bearing_for (${rec.load_bearing_source ?? 'estimate'}), modern snapshot valued at ${SNAP}. Display only: the fold's single-year covariate guard refuses any template that names it, and the record's own weights are undated (no load_bearing_from) so they are the 2026 estimate placed at ${SNAP}`;
    }
    console.log(`chokepoint exposure: ${n} actor-years from data/corridors.yaml load_bearing_for at ${SNAP}`);
  }

  // era-1991-2026-r2/data-8 (c): `regime_type` declares the V-Dem RoW scale, "as the panel's `regime`". Report how
  // often the two disagree, every build — an ordinal that departs from its declared scale for a quarter of the
  // actors it covers is a separate hand estimate and has to say so rather than be discovered.
  {
    const dis = [];
    for (const [id, vars] of Object.entries(panel)) {
      const a = vars.regime_type?.[SNAP - Y0], b = vars.regime?.[SNAP - Y0];
      if (a == null || b == null) continue;
      if (a !== b) dis.push(`${id} ${a}/${b}`);
    }
    const nHave = Object.values(panel).filter(v => v.regime_type?.[SNAP - Y0] != null).length;
    sources.regime_type = `${sources.regime_type ?? 'regime type'}. NOT the same measurement as the panel's \`regime\` despite sharing the V-Dem RoW scale: a hand transcription in data/actors.yaml against V-Dem RoW via OWID, disagreeing for ${dis.length} of the ${nHave} actors it covers at ${SNAP} (${dis.join(' ')}) — era-1991-2026-r2/data-8 (c). Read it as a separate hand estimate on the RoW scale, not as the panel's series`;
    if (dis.length) console.log(`modern fold: regime_type disagrees with the panel's regime for ${dis.length}/${nHave} actors at ${SNAP} — ${dis.join(' ')}`);
  }
  console.log(`modern fold: ${wrote.length} series columns (${wrote.join(' ')}); ${[...snapCols].filter(([, r]) => r).length} snapshot columns at ${SNAP}${skipped.length ? `; skipped ${skipped.join(' ')} (already measured in the panel)` : ''}`);
  if (near.length) console.log(`modern fold: ${near.length} near-duplicate column pair(s), reported not refused — ${near.map(d => `${d.col}~${d.other} (median |log ratio| ${d.med.toExponential(1)} over ${d.n} cells, adds ${d.adds}/${d.cells})`).join('; ')}`);
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
// era-1991-2026-r2/engine-3: the splice used ONE geometric-mean ratio computed over the actor's whole overlap, and
// gdp_pc_ppp is NY.GDP.PCAP.PP.CD — PPP in CURRENT international dollars — while Maddison is constant 2011
// international dollars. The ratio therefore drifts with the PPP price level, and a whole-overlap average lands in
// the middle of the period, so joining it onto Maddison's last year (2022) injected a level jump that the derived
// gdp_growth read as real growth: USA 58,487 -> 91,286, CHN 19,238 -> 34,048, median live-actor gdp_growth 0.030 in
// 2022, 0.426 in 2023, 0.046 in 2024, with 75% of actors over +0.20. Downstream that inflated the fitted sd of
// gdp_growth by a third, put ~+4.3pp/yr on every actor's structural growth at any as-of >= 2023, and drove
// stepPolarity's mass projection off a price index.
// Two changes. (a) Where the gap is a FORWARD extension past the actor's own last Maddison year, chain: carry
// Maddison's last level and move it by the World Bank series' own year-on-year growth rate. A growth rate in current
// PPP dollars still carries the price drift, but it carries one year of it rather than a decade of it, and it is
// the construction that cannot produce a level jump at the join. (b) Where the gap is interior or whole-life (an
// actor Maddison never covers), the ratio splice stays, but the ratio is the geometric mean over the LAST
// SPLICE_YEARS overlap years rather than over the whole overlap — which is what scripts/lib/capability.mjs already
// does for the CINC splice; the two splices in this repo disagreed about their own method.
{
  const R = [];                                        // pooled log ratio, over the recent overlap of every actor that has both
  const perActor = new Map();
  const lastOverlap = new Map();
  for (const [id, vars] of Object.entries(panel)) {
    if (!vars.gdp_pc || !vars.gdp_pc_ppp) continue;
    const ov = [];
    for (let i = 0; i < YEARS.length; i++) { const m = vars.gdp_pc[i], w = vars.gdp_pc_ppp[i]; if (m > 0 && w > 0) ov.push([i, Math.log(m / w)]); }
    if (!ov.length) continue;
    lastOverlap.set(id, ov[ov.length - 1][0]);
    const recent = ov.slice(-SPLICE_YEARS);
    const r = recent.reduce((a, b) => a + b[1], 0) / recent.length;
    perActor.set(id, { r, n: recent.length });
    for (const [, x] of recent) R.push(x);
  }
  const pooled = R.length ? R.reduce((a, b) => a + b, 0) / R.length : null;
  // held-out check on the splice itself: for the actors that HAVE both series, how well does the pooled ratio alone
  // reproduce the Maddison value? Printed, not asserted — an actor with its own overlap never uses the pooled number.
  let within = 0, tot = 0;
  for (const [, v] of perActor) { tot++; if (pooled != null && Math.abs(v.r - pooled) < Math.log(1.10)) within++; }
  let filled = 0, chained = 0; const actorsFilled = new Set();
  if (pooled != null) for (const [id, vars] of Object.entries(panel)) {
    if (!vars.gdp_pc_ppp) continue;
    vars.gdp_pc ??= new Array(YEARS.length).fill(null);
    vars.gdp_pc_wb ??= new Array(YEARS.length).fill(null);
    // (a) forward extension past the actor's own last Maddison observation: chain on the World Bank growth rate
    let lastM = -1; for (let i = 0; i < YEARS.length; i++) if (vars.gdp_pc[i] != null) lastM = i;
    if (lastM >= 0) for (let i = lastM + 1; i < YEARS.length; i++) {
      const w = vars.gdp_pc_ppp[i], wPrev = vars.gdp_pc_ppp[i - 1], prev = vars.gdp_pc[i - 1];
      if (!(w > 0) || !(wPrev > 0) || !(prev > 0)) break;
      vars.gdp_pc[i] = prev * (w / wPrev); vars.gdp_pc_wb[i] = 1; filled++; chained++; actorsFilled.add(id);
    }
    // (b) interior and whole-life gaps: the level-matched ratio splice, on the recent overlap
    const r = perActor.get(id)?.r ?? pooled;
    for (let i = 0; i < YEARS.length; i++) { const w = vars.gdp_pc_ppp[i]; if (vars.gdp_pc[i] != null || !(w > 0)) continue; vars.gdp_pc[i] = Math.exp(r) * w; vars.gdp_pc_wb[i] = 1; filled++; actorsFilled.add(id); }
  }
  sources.gdp_pc += `; past the actor's own last Maddison year gdp_pc is chained on the World Bank PPP series' year-on-year growth rate (no level join, so no jump at the seam), and where Maddison has no row at all it is that series level-matched to Maddison (geometric-mean ratio on the actor's last ${SPLICE_YEARS} overlap years, else the pooled ratio exp(${pooled?.toFixed(3)}) over ${R.length} actor-years). Every filled year is flagged in gdp_pc_wb`;
  sources.gdp_pc_wb = 'derived: 1 where gdp_pc was spliced from the World Bank PPP series (data/variables.yaml gdp_pc_ppp) because Maddison has no row for that actor-year';
  console.log(`gdp_pc World Bank splice: ${filled} actor-years across ${actorsFilled.size} actors (${chained} chained past the actor's last Maddison year, ${filled - chained} level-matched); pooled log ratio ${pooled?.toFixed(3)} over ${R.length} recent-overlap actor-years; ${within}/${tot} actors with an overlap sit within 10% of the pooled ratio`);
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
  // era-1991-2026-r2/data-7: the graph now reaches 2026 (loadPacts carries ATOP's last edge set forward itself and
  // adds the dated accessions), so a null here is a genuine non-pact for every year and the old `carry the last
  // value past 2000` rule — which carried a ZERO for any state that had no alliance in 2000 — is gone.
  for (const v of ['pact_usa', 'pact_rus']) { vars[v] ??= new Array(YEARS.length).fill(null); YEARS.forEach((y, i) => { if (!a || !isLive(a, y)) return; if (vars[v][i] == null) vars[v][i] = 0; }); }
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

// ---- build guard on gdp_growth (era-1991-2026-r2/engine-3). A splice that joins two series at different price
// levels shows up here and nowhere else: the median live actor's log growth in 2023 was 0.426 under the old
// whole-overlap ratio join, i.e. a 53% one-year jump in world income that nothing in the sources says happened.
// The guard is on the MEDIAN, not on a tail: a real year of world crisis or recovery moves the median by a few
// points, a splice artefact moves it by tens. Threshold 0.15 = a 16% median one-year move, four times the largest
// median in the whole 1816-2022 measured record.
{
  const MAX_MEDIAN_GROWTH = 0.15;
  const bad = [];
  for (let i = 1; i < YEARS.length; i++) {
    const g = [];
    for (const [id, vars] of Object.entries(panel)) { const a = actors.get(id); if (!a || !isLive(a, YEARS[i])) continue; const x = vars.gdp_growth?.[i]; if (x != null && Number.isFinite(x)) g.push(x); }
    if (g.length < 20) continue;
    g.sort((p, q) => p - q);
    const med = g[Math.floor(g.length / 2)];
    if (Math.abs(med) > MAX_MEDIAN_GROWTH) bad.push(`${YEARS[i]} median ${med.toFixed(3)} over ${g.length} live actors`);
  }
  if (bad.length) throw new Error(`build guard: median live-actor gdp_growth exceeds ${MAX_MEDIAN_GROWTH} in ${bad.length} year(s) — a level jump between two spliced income series, not growth:\n  ${bad.join('\n  ')}`);
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
  const { values, carried, extended, refused, factor } = spliceComposite({ composite, cincOf, liveAt, lastCinc: nmcLast, extendTo: Y1, ids: Object.keys(panel) });
  for (const [id, vars] of Object.entries(panel)) if (vars.cinc) YEARS.forEach((y, i) => { if (vars.cinc[i] != null && y <= nmcLast) { put(id, 'cinc_spliced', y, 0); put(id, 'cinc_carried', y, 0); } });
  const ext = [];
  for (const y of Object.keys(values).map(Number).sort((a, b) => a - b)) {
    for (const [id, v] of Object.entries(values[y])) { put(id, 'cinc', y, v); put(id, 'cinc_spliced', y, 1); put(id, 'cinc_carried', y, carried[y]?.[id] ?? 0); }
    ext.push(`${y}:${extended[y]}+${Object.keys(carried[y] ?? {}).length}c`);
  }
  const parts = COMPONENTS.map(c => `${c.stands_for}<-${c.id}`).join(' ');
  const extLast = Object.keys(values).map(Number).sort((a, b) => a - b).pop() ?? nmcLast;
  sources.cinc += `; ${nmcLast + 1}-${extLast} is the modern capability composite (${parts}; ${MISSING_COMPONENTS.map(m => m.stands_for).join(', ')} not represented) spliced onto CINC over the ${SPLICE_YEARS} overlap years to ${nmcLast}, scripts/lib/capability.mjs; ${extLast < Y1 ? `${extLast + 1}-${Y1} has no source and is left null — the engine carries the last value forward and records the staleness` : 'no year is carried'}`;
  sources.cinc_spliced = `0 where cinc is CoW NMC's own measurement, 1 where it is the modern composite spliced onto it (scripts/lib/capability.mjs); composite vs CINC 1990-${nmcLast} r=${check.r?.toFixed(3)} (n=${check.n}), log r=${check.r_log?.toFixed(3)}. The extension is used for RANKS and RATIOS, so the acceptance test is not the pooled level correlation alone (era-1991-2026-r2/statistics-7): worst-year Spearman ${check.rho_min?.toFixed(3)} (${check.rho_min_year}), and the largest displacement of a CINC top-20 actor in the composite's own ranking is ${check.rank_shift_top20} places (${check.rank_shift_actor}, ${check.rank_shift_year}) — the composite drops CINC's military-personnel indicator and stands GDP at PPP in for iron and steel, which moves conscript-heavy poor states down and small rich states up`;
  sources.cinc_carried = `derived: years since the actor's cinc was last measured. 0 for a CoW NMC value and for a composite-extended one; > 0 where the actor is live past ${nmcLast} but the composite cannot reach it (fewer than the required components in the World Bank / OWID series, which are not published for sanctioned or unrecognised states) or its splice factor is too far from 1 to be a level correction, so its last CINC-scale value is carried instead of the actor vanishing from the column (era-1991-2026-r2/data-3, statistics-7). Actors whose factor was refused: ${refused.join(', ') || 'none'}`;
  console.log(`capability composite: r=${check.r?.toFixed(4)} log r=${check.r_log?.toFixed(4)} rho_min=${check.rho_min?.toFixed(4)} (${check.rho_min_year}) top20 rank shift ${check.rank_shift_top20} (${check.rank_shift_actor} ${check.rank_shift_year}) against CINC 1990-${nmcLast} (n=${check.n} actor-years); ${Object.keys(factor).length} actors spliced, ${refused.length} refused for |log factor| > ln2 (${refused.join(',') || 'none'}); extended ${ext.join(' ') || 'nothing'} (n extended + n carried)`);
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
  // and whether the actor is in the recipient series at all (era-1991-2026-r2/data-6): the World Bank publishes
  // ODA/GNI only for recipients, so an actor with no row in any year is a non-recipient and its conditionality
  // exposure is a structural zero, not an unobserved value. One with rows in some years and not others is the
  // second case and keeps its null.
  for (const [id, vars] of Object.entries(panel)) {
    const any = (vars.aid_gni ?? []).some(x => x != null);
    vars.aid_recipient = YEARS.map((y) => (y >= aidFrom ? (any ? 1 : 0) : null));
  }
  sources.aid_recipient = 'derived from World Bank WDI DT.ODA.ODAT.GN.ZS: 1 where the actor appears in the ODA/GNI recipient series in any year, 0 where it never does (a donor or graduated high-income state), null before the series starts';
  let sm = null, lastRaw = null, lastRawYear = null;
  // era-1991-2026-r2/engine-7 and data-8: a year with no capability observation used to return null for the WHOLE
  // derived block, so at the panel's last year — the origin the live forecast runs from — bipolar, unipolar,
  // multipolar, cold_war, promotion_era, anticoup_norm, n_poles, hegemon_share, hegemon_regime, dem_share,
  // is_hegemon, pol_mass, pol_share, great_game and aid_conditionality were all null for all 195 live actors, and
  // every 2025 row was dropped from every template reading one of them. Two of those (dem_share, aid_conditionality)
  // need no capability at all and were collateral damage of one `return null`. The capability distribution is now
  // carried forward from the last year that has one, restricted to the actors alive in the year it is carried into
  // and renormalised — the same last-observation carry the engine already applies to a stale `cinc` — and the
  // staleness is recorded per year in `capability_carried` so a carried classification is never read as a measured
  // one. Nothing before the carry moves: for every year with its own shares this is the previous construction.
  const W = YEARS.map(y => {
    let raw = projectionShares(cincShare(y), milexShare(y));
    let carried = 0;
    if (!raw.size) {
      if (!lastRaw) return null;
      const alive0 = new Set(Object.keys(panel).filter(id => liveAt(id, y)));
      raw = normalise(new Map([...lastRaw].filter(([id]) => alive0.has(id))));
      if (!raw.size) return null;
      carried = y - lastRawYear;
    } else { lastRaw = raw; lastRawYear = y; }
    const alive = new Set(Object.keys(panel).filter(id => liveAt(id, y)));
    sm = smoothShares(sm, raw, POLARITY.lambda, alive);
    const st = classify(sm); if (!st) return null;
    let n = 0, d = 0, live = 0;
    for (const id of Object.keys(panel)) { if (!liveAt(id, y)) continue; live++; const r = panel[id].regime?.[at(y)]; if (r == null) continue; n++; if (r >= POLARITY.hegemon_regime_min) d++; }
    const demShare = n ? d / n : null;
    const hegRegime = panel[st.hegemon]?.regime?.[at(y)] ?? null;
    return { y, raw, sm: new Map(sm), st, demShare, demN: n, demLive: live, carried, hegRegime, flags: eraFlags({ polarity: st.polarity, hegemonRegime: hegRegime, demShare }) };
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
    hegemon_regime: w.hegRegime, dem_share: r9(w.demShare), dem_share_n: w.demN, dem_share_live: w.demLive,
    capability_carried: w.carried || 0, promotion_era: w.flags.promotion_era, anticoup_norm: w.flags.anticoup_norm }));

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
  sources.dem_share = `share of live actors WITH A REGIME SCORE scoring >= ${POLARITY.hegemon_regime_min} (V-Dem RoW). The denominator is the observed set, not the live set — era-1991-2026-r2/data-4 and statistics-5: 22 live states (the Caribbean and Pacific parliamentary democracies and the four European microstates) have no V-Dem row in any year, so at 2024 the share is 85/173 = 0.491 over observed actors against 195 live, and the anticoup_norm flag that reads it switches off on the boundary of V-Dem's country list rather than on a fall in the democratic share. panel.meta.polarity carries dem_share_n (the denominator) and dem_share_live beside it every year so the coverage is visible; filling the 22 from a sourced series that has them is docs/escalations.md era-1991-2026-r2/data-4`;
  sources.capability_carried = 'panel.meta.polarity only: years since the capability distribution the polarity classification was computed from was last measured (0 = measured in that year)';
  sources.hegemon_regime = 'derived: the regime score of the top actor by pol_share (replaces the typed largest-power-by-date rule; hegemon_regime_dates keeps it for one run)';
  sources.great_game = 'derived: superpower client x bipolar world (bipolar is now derived; great_game_dates keeps the typed-era version for one run)';
  sources.aid_conditionality = `derived: ODA/GNI capped at ${POLARITY.aid_cap}% in tens during the derived promotion era, a structural zero outside it. Inside the era a missing ODA/GNI row is a structural zero too — the World Bank series covers recipients only, so its silence about a donor or a graduated state is "receives no measurable aid" and not a missing observation (era-1991-2026-r2/statistics-4, data-6). The aid_recipient column keeps "never in the series" separable from "in it in some years"`;
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
// era-1991-2026-r2/statistics-6 (d) and data-8: a template may not name a column that exists in ONE year. The
// snapshot columns (data/actors.yaml at SNAP: cap_*, nuclear_status, regime_type, personalism, succession, the
// chokepoint exposures) are single-year by construction — introduced == last, <= 44 actors, and chokepoint_suez has
// exactly one actor-year — so a covariate over one could never be estimated at any as-of and would silently delete
// every row of the template. No template names one today; nothing in the build stopped one from doing so.
{
  const bad = [];
  for (const t of Y('data/templates.yaml').templates) for (const c of [...(t.covariates ?? []), ...(t.candidates ?? [])]) {
    const m = meta.vars[c.var];
    if (m && m.introduced != null && m.introduced === m.last) bad.push(`${t.id}.${c.var} (${c.var} exists only at ${m.introduced}, ${m.actors} actors)`);
  }
  if (bad.length) throw new Error(`template covariate over a single-year column — it cannot be estimated at any as-of and drops every row:\n  ${bad.join('\n  ')}`);
}
const out = { meta, years: YEARS, vars, sources, actors: panel };
writeFileSync('data/panel.json', JSON.stringify(out));
const cov = (v) => Object.values(panel).reduce((n, a) => n + (a[v] ? a[v].filter(x => x != null).length : 0), 0);
console.log(`panel.json: ${Object.keys(panel).length} actors × ${YEARS.length} years, ${vars.length} vars, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
console.log('coverage (actor-years):', vars.map(v => `${v}=${cov(v)}`).join('  '));
