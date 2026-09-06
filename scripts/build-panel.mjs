// Build the historical actor-year panel 1816–2025 -> data/panel.json
// Sources: CoW NMC 3.02 (1816–2001), Maddison (OWID), OWID population, OWID regime (V-Dem RoW), V-Dem ERT (polyarchy),
// OWID energy by source (1800+), OWID coal/oil production, REIGN (leader age/tenure 1950–2021), CoW alliances 3.03,
// CoW MID 3.02 (1816–2001), UCDP/PRIO 25.1 (1946–2024), hand events (wars with participants).
// Output: { years: [...], vars: [...], actors: { id: { var: [per-year value|null] } }, sources: {...} }
import { writeFileSync, readFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, makeOwidMap, isLive } from './lib/hist.mjs';

const Y0 = 1816, Y1 = 2025, YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const actors = loadActors(); const code = makeCodeMap(actors); const gw = makeCodeMap(actors, 'gw'); const owid = makeOwidMap(actors);
const H = 'data/raw/hist/';
const panel = {}; const put = (id, v, y, val) => { if (!id || y < Y0 || y > Y1 || val == null || Number.isNaN(val)) return; ((panel[id] ??= {})[v] ??= new Array(YEARS.length).fill(null))[y - Y0] = val; };
const add = (id, v, y, n = 1) => { if (!id || y < Y0 || y > Y1) return; const arr = ((panel[id] ??= {})[v] ??= new Array(YEARS.length).fill(0)); arr[y - Y0] += n; };
const sources = {};

// ---- NMC
for (const r of readCsv(H + 'nmc_3.02.csv')) {
  const y = +r.year, id = code(r.ccode, y); if (!id) continue;
  const num = (x) => (x === '-9' || x === '' ? null : +x);
  put(id, 'cinc', y, num(r.cinc)); put(id, 'irst', y, num(r.irst)); put(id, 'milex', y, num(r.milex));
  put(id, 'milper', y, num(r.milper)); put(id, 'energy_nmc', y, num(r.energy)); put(id, 'tpop', y, num(r.tpop) && num(r.tpop) * 1e3); put(id, 'upop', y, num(r.upop) && num(r.upop) * 1e3);
}
sources.cinc = sources.irst = sources.milex = sources.milper = sources.energy_nmc = sources.tpop = sources.upop = 'CoW NMC 3.02 (1816–2001)';

// ---- Maddison GDP pc, population
for (const r of readCsv(H + 'maddison.csv')) { const y = +r.year, id = owid(r.code, y); if (id && r.gdp_per_capita) put(id, 'gdp_pc', y, +r.gdp_per_capita); }
sources.gdp_pc = 'Maddison Project 2023 via OWID (2011 intl $)';
for (const r of readCsv(H + 'population.csv')) { const y = +r.year, id = owid(r.code, y); if (id && r.population_historical) put(id, 'population', y, +r.population_historical); }
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
{
  const last = new Map();
  for (const r of readCsv(H + 'reign.csv')) {
    const y = +r.year, id = code(r.ccode, y); if (!id) continue;
    if (+r.pt_attempt > 0) add(id, 'coup_attempt', y, 1);
    if (+r.pt_suc > 0) add(id, 'coup_success', y, 1);
    const k = `${id}:${y}`; const prev = last.get(k);
    if (!prev || +r.month > prev.month) last.set(k, { month: +r.month, age: +r.age, tenure: +r.tenure_months / 12, mil: +r.militarycareer, irregular: +r.irregular });
  }
  for (const [k, v] of last) { const [id, y] = k.split(':'); put(id, 'leader_age', +y, v.age); put(id, 'leader_tenure', +y, v.tenure); put(id, 'leader_military', +y, v.mil); put(id, 'leader_irregular_entry', +y, v.irregular); }
  sources.leader_age = sources.leader_tenure = sources.coup_attempt = 'REIGN 2021.8 (1950–2021), Powell–Thyne coups';
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
for (const e of Y('data/history/events.yaml')) {
  if (e.kind !== 'war') continue;
  const end = e.end ?? Y1;
  for (let y = Math.floor(e.start); y <= Math.floor(end); y++) for (const side of e.sides) for (const a of side) put(a, 'at_war', y, 1);
}
sources.at_war = 'data/history/events.yaml (hand-coded interstate wars)';

// ---- World Bank WDI 1960+ (fetched by scripts/fetch-wb.mjs): information access, infant mortality, urbanisation
{
  const wb = (name) => JSON.parse(readFileSync(`data/raw/wb/${name}.json`, 'utf8')).data;
  for (const [name, v] of [['internet_users', 'internet_users'], ['mobile_subs', 'mobile_subs'], ['fixed_lines', 'fixed_lines'], ['infant_mortality', 'infant_mortality'], ['urban_share', 'urban_share']]) {
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
  vars.bipolar = YEARS.map(y => (y >= 1947 && y <= 1991 ? 1 : 0));
  vars.sp_client_any = YEARS.map((y, i) => ((vars.pact_usa[i] || vars.pact_rus[i]) ? 1 : 0));
  vars.sp_client_one = YEARS.map((y, i) => ((vars.pact_usa[i] ? 1 : 0) + (vars.pact_rus[i] ? 1 : 0) === 1 ? 1 : 0));
  vars.great_game = YEARS.map((y, i) => (vars.bipolar[i] && vars.sp_client_any[i] ? 1 : 0));
  vars.cold_war = YEARS.map(y => (y <= 1991 ? 1 : 0));
  vars.anticoup_norm = YEARS.map(y => (y >= 2000 ? 1 : 0));   // AU Lomé 2000 / OAS 1991-2001: coups cost recognition and aid
}

// ---- write
const vars = [...new Set(Object.values(panel).flatMap(v => Object.keys(v)))].sort();
const out = { meta: { built: new Date().toISOString(), y0: Y0, y1: Y1 }, years: YEARS, vars, sources, actors: panel };
writeFileSync('data/panel.json', JSON.stringify(out));
const cov = (v) => Object.values(panel).reduce((n, a) => n + (a[v] ? a[v].filter(x => x != null).length : 0), 0);
console.log(`panel.json: ${Object.keys(panel).length} actors × ${YEARS.length} years, ${vars.length} vars, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
console.log('coverage (actor-years):', vars.map(v => `${v}=${cov(v)}`).join('  '));
