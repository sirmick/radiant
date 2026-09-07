// Compile dated events 1816–2026 -> data/events.json
// Machine-derived: leader exits (REIGN), coups (Powell–Thyne via REIGN), regime-type changes (OWID/V-Dem RoW),
// autocratization/democratization episode onsets (V-Dem ERT), militarized disputes (CoW MID 3.02 dyads),
// interstate/intrastate onsets (UCDP). Hand-coded: data/history/events.yaml (wars, chokepoints, corridors, nuclear...).
// Output: { events: [ {kind, year, actor|a,b, ...} ], counts: {kind: n} }
import { writeFileSync } from 'node:fs';
import { readCsv, Y, loadActors, makeCodeMap, makeOwidMap } from './lib/hist.mjs';

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

// ---- regime-type changes (RoW 0..3)
{
  const by = new Map();
  for (const r of readCsv(H + 'regime.csv')) { const y = +r.year, id = owid(r.code, y); if (!id || r.regime_row_owid === '') continue; (by.get(id) ?? by.set(id, []).get(id)).push([y, +r.regime_row_owid]); }
  for (const [id, arr] of by) { arr.sort((a, b) => a[0] - b[0]); for (let i = 1; i < arr.length; i++) if (arr[i][1] !== arr[i - 1][1] && arr[i][0] === arr[i - 1][0] + 1) events.push({ kind: 'regime_change', actor: id, year: arr[i][0], from: arr[i - 1][1], to: arr[i][1], direction: arr[i][1] > arr[i - 1][1] ? 'democratize' : 'autocratize', source: 'V-Dem RoW via OWID' }); }
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

// ---- MIDs as dyads: participants on opposite sides of the same dispute, hostlev >= 4 (use of force) / 5 (war)
{
  const disp = new Map();
  for (const r of readCsv(H + 'midb_3.02.csv')) { const y = +r.styear, id = code(r.ccode, y); if (!id) continue; (disp.get(r.dispnum) ?? disp.set(r.dispnum, []).get(r.dispnum)).push({ id, side: r.sidea, y, hl: +r.hostlev }); }
  for (const [num, ps] of disp) {
    const A = ps.filter(p => p.side === '1'), B = ps.filter(p => p.side === '0');
    const hl = Math.max(...ps.map(p => p.hl)); if (hl < 4) continue;
    const y = Math.min(...ps.map(p => p.y));
    for (const a of A) for (const b of B) if (a.id !== b.id) events.push({ kind: hl >= 5 ? 'mid_war' : 'mid_force', a: a.id, b: b.id, year: y, dispnum: num, source: 'CoW MID 3.02' });
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

// ---- hand events pass through, after checking every corridor/chokepoint/territory id resolves to a record
{
  const hand = Y('data/history/events.yaml');
  const corrIds = new Set(Y('data/corridors.yaml').map(c => c.id));
  const terrIds = new Set(Y('data/territories.yaml').map(t => t.id));
  const bad = [];
  for (const e of hand) {
    if ((e.kind === 'corridor' || e.kind === 'chokepoint') && !corrIds.has(e.id)) bad.push(`${e.kind} ${e.id} @${e.year} — no record in data/corridors.yaml`);
    if (e.kind === 'territory' && !terrIds.has(e.id)) bad.push(`territory ${e.id} @${e.year} — no record in data/territories.yaml`);
  }
  if (bad.length) { console.error(`build-events: ${bad.length} unresolvable event ids\n  ${[...new Set(bad)].join('\n  ')}`); process.exit(1); }
  for (const e of hand) events.push({ ...e, source: e.source ?? 'data/history/events.yaml' });
}

events.sort((a, b) => (a.year ?? a.start) - (b.year ?? b.start));
const counts = {}; for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
writeFileSync('data/events.json', JSON.stringify({ meta: { built: new Date().toISOString() }, counts, events }));
console.log(`events.json: ${events.length} events`); console.log(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
