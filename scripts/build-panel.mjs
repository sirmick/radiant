// Build the historical actor-year panel 1816–2025 -> data/panel.json
// Sources: CoW NMC 3.02 (1816–2001), Maddison (OWID), OWID population, OWID regime (V-Dem RoW), V-Dem ERT (polyarchy),
// OWID energy by source (1800+), OWID coal/oil production, REIGN (leader age/tenure 1950–2021), CoW alliances 3.03,
// CoW MID 3.02 (1816–2001), UCDP/PRIO 25.1 (1946–2024), hand events (wars with participants).
// Plus the modern layer (operator / modern-fold): UN WPP, World Bank WDI, OWID energy, IEA EV 2000-2025 and the
// modern actor snapshot (data/actors.yaml capability levels, regime type, nuclear status, chokepoint exposure) at 2025.
// Output: { meta: { y0, y1, sources, vars: { <col>: { source, introduced, last, actor_years, actors } } },
//           years: [...], vars: [...], actors: { id: { var: [per-year value|null] } }, sources: {...} }
import { writeFileSync, readFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, makeOwidMap, isLive } from './lib/hist.mjs';
import { MODERN_FROM, resolveFetch, describeSource, snapshotColumns, snapshotExtras } from './lib/modern.mjs';

const Y0 = 1816, Y1 = 2025, YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const actors = loadActors(); const code = makeCodeMap(actors); const gw = makeCodeMap(actors, 'gw'); const owid = makeOwidMap(actors);
// Maddison gdp_pc and OWID population are modern-borders series; where an actor declares `owid_alt` (USSR, Yugoslavia,
// Czechoslovakia) the entity-wide series owns those years and the modern-borders one is suppressed.
const owidEntity = makeOwidMap(actors, { preferAlt: true });
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
sources.at_war = 'data/history/events.yaml (hand-coded interstate wars, per-participant entry/exit dates where declared)';

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
{
  const OCC_NULL = ['cinc', 'irst', 'milex', 'milper', 'energy_nmc', 'tpop', 'upop', 'at_war', 'mid_force', 'mid_war', 'defence_pacts'];
  let n = 0;
  for (const o of handEvents) {
    if (o.kind !== 'occupation') continue;
    const vars = panel[o.actor]; if (!vars) continue;
    for (let y = Math.ceil(o.start); y <= Math.floor(o.end); y++) for (const v of OCC_NULL) { const i = y - Y0; if (vars[v] && i >= 0 && i < YEARS.length && vars[v][i] != null) { vars[v][i] = null; n++; } }
  }
  console.log(`occupation: nulled ${n} capability/flag values across ${handEvents.filter(e => e.kind === 'occupation').length} occupation spans`);
  sources.at_war += '; occupied years (data/history/events.yaml kind: occupation) are null, not 0';
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
      for (const [col, val, note] of [...snapshotColumns(v, { ...a.modern, id: a.id }), ...snapshotExtras(v, a.modern)]) {
        if (!Number.isFinite(val)) continue;
        if (!snapCols.has(col)) {
          if (clash(col)) { snapCols.set(col, null); break; }   // the panel already measures this (leader_age/leader_tenure from REIGN): the snapshot does not overwrite it
          snapCols.set(col, { v, note, n: 0 });
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
    sources[col] = `${rec.v.label ?? rec.v.id} — ${src.hand ? `data/actors.yaml ${src.field}` : 'hand estimate in data/variables.yaml'}, modern snapshot valued at ${SNAP}${rec.note ? `; ${rec.note}` : ''}`;
  }
  console.log(`modern fold: ${wrote.length} series columns (${wrote.join(' ')}); ${[...snapCols].filter(([, r]) => r).length} snapshot columns at ${SNAP}${skipped.length ? `; skipped ${skipped.join(' ')} (already measured in the panel)` : ''}`);
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
  // external-influence channels: patron regime, unipolar democracy-promotion era, aid conditionality
  vars.unipolar_us = YEARS.map(y => (y >= 1992 && y <= 2016 ? 1 : 0));
  // ODA/GNI (capped 30%) in tens, only during the promotion era. Outside 1992–2016 the variable is 0 by construction —
  // a structural zero, not a missing value: there was no ODA-conditionality regime, so a null there would silently drop
  // every pre-1960 actor-year from the regime templates (World Bank aid_gni starts 1960).
  vars.aid_conditionality = YEARS.map((y, i) => (vars.unipolar_us[i] ? (vars.aid_gni?.[i] != null ? Math.min(vars.aid_gni[i], 30) / 10 : null) : 0));
  vars.patron_regime = YEARS.map((y, i) => { const usa = panel.USA?.regime?.[i], rus = panel.RUS?.regime?.[i]; if (vars.pact_usa?.[i] && !vars.pact_rus?.[i]) return usa ?? null; if (vars.pact_rus?.[i] && !vars.pact_usa?.[i]) return rus ?? null; if (vars.pact_usa?.[i] && vars.pact_rus?.[i]) return ((usa ?? 0) + (rus ?? 0)) / 2; return 0; });
  vars.hegemon_x_client = YEARS.map((y, i) => (vars.pact_usa?.[i] ? (panel.USA?.regime?.[i] ?? 3) : 0));   // US clients see the hegemon's own regime score; others 0
  vars.hegemon_regime = YEARS.map((y, i) => (y >= 1946 ? (panel.USA?.regime?.[i] ?? null) : (panel.GBR?.regime?.[i] ?? null)));
  vars.cold_war = YEARS.map(y => (y <= 1991 ? 1 : 0));
  vars.anticoup_norm = YEARS.map(y => (y >= 2000 ? 1 : 0));   // AU Lomé 2000 / OAS 1991-2001: coups cost recognition and aid
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

// ---- write
// meta.vars is the panel's own registry: for every column, where it came from, the first and last year anything was
// measured, and how many actor-years it covers. `introduced` is what tells a reader (and src/engine/core.js, which
// skips the carry-forward scan below it) that a column simply does not exist before a year, rather than being a gap.
const vars = [...new Set(Object.values(panel).flatMap(v => Object.keys(v)))].sort();
const meta = { built: new Date().toISOString(), y0: Y0, y1: Y1, sources, vars: {}, introduced: {} };
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
