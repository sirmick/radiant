// Compile dated events 1816–2026 -> data/events.json
// Machine-derived: leader exits (REIGN), coups (Powell–Thyne via REIGN), regime-type changes (OWID/V-Dem RoW),
// autocratization/democratization episode onsets (V-Dem ERT), militarized disputes (CoW MID 3.02 dyads),
// interstate/intrastate onsets (UCDP). Hand-coded: data/history/events.yaml (wars, chokepoints, corridors, nuclear...).
// Output: { events: [ {kind, year, actor|a,b, ...} ], counts: {kind: n} }
import { writeFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, makeOwidMap } from './lib/hist.mjs';
import { warSpells } from '../src/engine/termination.js';

const actors = loadActors(); const code = makeCodeMap(actors); const gw = makeCodeMap(actors, 'gw'); const owid = makeOwidMap(actors);
const H = 'data/raw/hist/'; const events = [];

// ---- leader exits: consecutive REIGN months with a different leader for the same ccode
{
  const rows = readCsv(H + 'reign.csv').map(r => ({ ccode: r.ccode, y: +r.year, m: +r.month, leader: r.leader, irregular: +r.irregular, tenure: +r.tenure_months }));
  rows.sort((a, b) => (a.ccode - b.ccode) || (a.y - b.y) || (a.m - b.m));
  // REIGN 2021.8 ships `irregular` all-zero; derive irregular exits from a successful coup in the same or previous 2 months
  const coupMonths = new Set(readCsv(H + 'reign.csv').filter(r => +r.pt_suc > 0).map(r => `${r.ccode}:${+r.year * 12 + (+r.month - 1)}`));
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i - 1], r = rows[i];
    if (p.ccode !== r.ccode || p.leader === r.leader) continue;
    const id = code(r.ccode, r.y); if (!id) continue;
    const mi = r.y * 12 + (r.m - 1);
    const irregular = [0, 1, 2].some(k => coupMonths.has(`${r.ccode}:${mi - k}`)) ? 1 : 0;
    events.push({ kind: 'leader_exit', actor: id, year: r.y + (r.m - 1) / 12, irregular, tenure_years: +(p.tenure / 12).toFixed(1), source: 'REIGN (+Powell–Thyne for irregular)' });
  }
  for (const r of readCsv(H + 'reign.csv')) {
    const y = +r.year, id = code(r.ccode, y); if (!id) continue;
    if (+r.pt_attempt > 0) events.push({ kind: 'coup', actor: id, year: y + (+r.month - 1) / 12, success: +r.pt_suc > 0 ? 1 : 0, source: 'Powell–Thyne via REIGN' });
  }
}

// ---- occupation spans (hand-coded, data/history/events.yaml): a regime step under or immediately after foreign
// occupation is not a domestic transition. `cause` is stamped on the event; the domestic regime templates filter it out
// (data/templates.yaml event_filter: { cause: null }) and the conquest steps stay in the file under their own cause.
const occupations = Y('data/history/events.yaml').filter(e => e.kind === 'occupation');
function occupationCause(actor, year) {
  for (const o of occupations) {
    if (o.actor !== actor) continue;
    if (year >= Math.floor(o.start) && year <= Math.floor(o.end)) return "occupation";
    if (year > Math.floor(o.end) && year <= (o.imposed_until ?? o.end + 2)) return "imposed";
  }
  return null;
}

// ---- regime-type changes (RoW 0..3)
{
  const by = new Map();
  for (const r of readCsv(H + 'regime.csv')) { const y = +r.year, id = owid(r.code, y); if (!id || r.regime_row_owid === '') continue; (by.get(id) ?? by.set(id, []).get(id)).push([y, +r.regime_row_owid]); }
  for (const [id, arr] of by) {
    arr.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < arr.length; i++) if (arr[i][1] !== arr[i - 1][1] && arr[i][0] === arr[i - 1][0] + 1) {
      const cause = occupationCause(id, arr[i][0]);
      events.push({ kind: 'regime_change', actor: id, year: arr[i][0], from: arr[i - 1][1], to: arr[i][1], direction: arr[i][1] > arr[i - 1][1] ? 'democratize' : 'autocratize', cause, source: 'V-Dem RoW via OWID' + (cause ? `; cause=${cause} from data/history/events.yaml occupation spans` : '') });
    }
  }
}

// ---- ERT episode onsets
{
  const seen = new Set();
  for (const r of readCsv(H + 'ert.csv')) {
    const id = owid(r.country_text_id, +r.year); if (!id) continue;
    if (r.aut_ep === '1' && r.aut_ep_start_year !== 'NA' && !seen.has(`a${id}${r.aut_ep_id}`)) { seen.add(`a${id}${r.aut_ep_id}`); events.push({ kind: 'autocratization_onset', actor: id, year: +r.aut_ep_start_year, outcome: r.aut_ep_outcome, source: 'V-Dem ERT' }); }
    if (r.dem_ep === '1' && r.dem_ep_start_year !== 'NA' && !seen.has(`d${id}${r.dem_ep_id}`)) { seen.add(`d${id}${r.dem_ep_id}`); events.push({ kind: 'democratization_onset', actor: id, year: +r.dem_ep_start_year, outcome: r.dem_ep_outcome, source: 'V-Dem ERT' }); }
  }
}

// ---- MIDs as dyads: participants on opposite sides of the same dispute.
// Hostility and onset are taken PER PAIR, not per dispute: a pair's hostility is min(hostlev_a, hostlev_b) — neither
// side can be more engaged than the less engaged of the two — and its onset is max(styear_a, styear_b), the year both
// are in. The dispute-level max/min used before stamped WWII's 33 participants as 223 dyadic wars all dated 1939
// (Spain-China among them). hostlev is ordinal, so a war dyad (>=5) is also a use-of-force dyad (>=4): mid_war nests
// inside mid_force instead of being disjoint from it.
{
  const disp = new Map();
  for (const r of readCsv(H + 'midb_3.02.csv')) { const y = +r.styear, id = code(r.ccode, y); if (!id) continue; (disp.get(r.dispnum) ?? disp.set(r.dispnum, []).get(r.dispnum)).push({ id, side: r.sidea, y, ey: +r.endyear, hl: +r.hostlev }); }
  for (const [num, ps] of disp) {
    const A = ps.filter(p => p.side === '1'), B = ps.filter(p => p.side === '0');
    const multilateral = ps.length > 2;
    for (const a of A) for (const b of B) {
      if (a.id === b.id) continue;
      const hl = Math.min(a.hl, b.hl); if (hl < 4) continue;
      const y = Math.max(a.y, b.y);
      // the year the pair's dispute stops being a pair dispute: the EARLIER of the two exits, by the same argument
      // that makes the onset the later of the two entries — neither side can be engaged after the less engaged of the
      // two has gone. Two rows in midb 3.02 carry an endyear before their own styear (dispnum 2004, hostlev 1 and 2,
      // outside this sample anyway); the max() clamps them rather than emitting a negative spell.
      // This is what the termination templates read (operator/termination, package 8): src/engine/termination.js
      // merges a pair's overlapping spans into the spell the engine carries as `at_war`.
      const end = Math.max(y, Math.min(a.ey, b.ey));
      const base = { a: a.id, b: b.id, year: y, end, dispnum: num, hostlev: hl, n_participants: ps.length, multilateral, source: 'CoW MID 3.02 (dyad hostility = min of the pair, onset = max of the pair, end = min of the pair)' };
      events.push({ kind: 'mid_force', ...base });
      if (hl >= 5) events.push({ kind: 'mid_war', ...base });
    }
  }
}

// ---- UCDP onsets (first year of each conflict episode)
{
  const seen = new Set();
  for (const r of readCsv(H + 'UcdpPrioConflict_v25_1.csv')) {
    const y = +r.year, t = +r.type_of_conflict, ep = `${r.conflict_id}:${r.start_date2}`;
    if (seen.has(ep)) continue; seen.add(ep);
    const as = r.gwno_a.split(',').map(s => gw(s.trim(), y)).filter(Boolean), bs = r.gwno_b.split(',').map(s => gw(s.trim(), y)).filter(Boolean);
    if (t === 2) for (const a of as) for (const b of bs) events.push({ kind: 'interstate_onset', a, b, year: y, intensity: +r.intensity_level, source: 'UCDP/PRIO 25.1' });
    if (t === 3 || t === 4) for (const a of as) events.push({ kind: 'intrastate_onset', actor: a, year: y, intensity: +r.intensity_level, territory: r.territory_name || null, source: 'UCDP/PRIO 25.1' });
  }
}

// ---- terminations (operator/termination, package 8): the dated END of a spell the engine carries as state.
// These are derived from the same rows the onsets are derived from — a spell's last year is an observation, and until
// this package nothing in the event log recorded one, so no template could be scored on an ending.
{
  // internal conflict: the last year of each run of UCDP-active years per actor. The run, not the conflict episode:
  // the panel's `intrastate` is an actor-year flag over every type-3/4 conflict the actor is in, and it is that flag
  // the engine sets and clears, so the spell it ends must be the same union.
  const active = new Map();   // actor -> Set(year)
  let last = 0;
  for (const r of readCsv(H + 'UcdpPrioConflict_v25_1.csv')) {
    const y = +r.year, t = +r.type_of_conflict; last = Math.max(last, y);
    if (t !== 3 && t !== 4) continue;
    for (const a of r.gwno_a.split(',').map(s => gw(s.trim(), y)).filter(Boolean)) (active.get(a) ?? active.set(a, new Set()).get(a)).add(y);
  }
  let nEnd = 0;
  for (const [a, ys] of active) {
    const sorted = [...ys].sort((p, q) => p - q);
    for (let i = 0; i < sorted.length; i++) {
      const y = sorted[i];
      if (ys.has(y + 1)) continue;                 // the run continues
      if (y >= last) continue;                     // still running when the source stops: right-censored, not an ending
      events.push({ kind: 'intrastate_end', actor: a, year: y, source: `UCDP/PRIO 25.1 (last year of the actor's run of active type-3/4 conflict years; runs open at ${last} are censored)` });
      nEnd++;
    }
  }
  // interstate war: the last year of each merged dyadic war spell (CoW MID hostlev 5). A spell reaching the source's
  // own last year has no observed end and is not emitted.
  let nWar = 0;
  for (const [k, spells] of warSpells(events, { kind: 'mid_war' })) {
    const i = k.indexOf('|'); const a = k.slice(0, i), b = k.slice(i + 1);
    for (const s of spells) { if (s.censored) continue; events.push({ kind: 'war_end', a, b, year: s.y1, start: s.y0, duration: s.y1 - s.y0 + 1, source: "CoW MID 3.02 (merged dyadic hostlev-5 spells; a spell reaching the source's own last year has no observed end and is not emitted)" }); nWar++; }
  }
  console.log(`terminations: ${nEnd} intrastate_end, ${nWar} war_end`);
}

// ---- hand events pass through, after checking every corridor/chokepoint/territory id resolves to a record
{
  const hand = Y('data/history/events.yaml');
  const corridors = Y('data/corridors.yaml'), territories = Y('data/territories.yaml');
  const corrIds = new Set(corridors.map(c => c.id));
  const terrIds = new Set(territories.map(t => t.id));
  const bad = [];
  for (const e of hand) {
    if ((e.kind === 'corridor' || e.kind === 'chokepoint') && !corrIds.has(e.id)) bad.push(`${e.kind} ${e.id} @${e.year} — no record in data/corridors.yaml`);
    if (e.kind === 'territory' && !terrIds.has(e.id)) bad.push(`territory ${e.id} @${e.year} — no record in data/territories.yaml`);
  }
  if (bad.length) { console.error(`build-events: ${bad.length} unresolvable event ids\n  ${[...new Set(bad)].join('\n  ')}`); process.exit(1); }
  for (const e of hand) events.push({ ...e, source: e.source ?? 'data/history/events.yaml' });

  // the records' own `history:` rows ARE observations: emit any dated row that has no hand event within 0.1y,
  // so a control change recorded in data/corridors.yaml / data/territories.yaml cannot sit unscored (the build used to
  // validate events -> records but never records -> events; 12 dated interwar territory changes were invisible).
  const seen = new Set(hand.filter(e => ['corridor', 'chokepoint', 'territory'].includes(e.kind)).map(e => `${e.kind}|${e.id}|${Math.round(e.year * 10)}`));
  let derived = 0;
  for (const c of corridors) for (const h of c.history ?? []) {
    const k = `${c.kind}|${c.id}|${Math.round(h.year * 10)}`; if (seen.has(k)) continue; seen.add(k);
    events.push({ kind: c.kind, id: c.id, year: h.year, status: h.status, controller: h.controller ?? null, capacity: h.capacity ?? null, transits: c.transits ?? null, source: h.source ?? 'data/corridors.yaml history' }); derived++;
  }
  for (const t of territories) for (const h of t.history ?? []) {
    const k = `territory|${t.id}|${Math.round(h.year * 10)}`; if (seen.has(k)) continue; seen.add(k);
    events.push({ kind: 'territory', id: t.id, year: h.year, controller: h.controller ?? null, status: h.status ?? null, claimants: t.claimants ?? null, source: h.source ?? 'data/territories.yaml history' }); derived++;
  }
  console.log(`derived ${derived} corridor/chokepoint/territory events from record histories`);
}

events.sort((a, b) => (a.year ?? a.start) - (b.year ?? b.start));
const counts = {}; for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
writeFileSync('data/events.json', JSON.stringify({ meta: { built: new Date().toISOString() }, counts, events }));
console.log(`events.json: ${events.length} events`); console.log(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
