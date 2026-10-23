// Outlook from a forward run (docs/plan-structure.md, "outlook"): reads the ensemble (`fc.json`, marginals) and its
// sample paths (`fc-paths.json`, every run kept whole) and answers three questions with joint, per-run counts.
//   EU   the 27 members as of the origin (ids from the record; the model has no EU entity). Cohesion is read from
//        what the model does simulate: members turning autocratic (RoW 0-1; membership requires democracy), a war
//        between two members, a member ceasing to exist, internal war in a member, and the defence-pact graph among
//        members (ensemble marginal; pacts are not kept in the paths).
//   US   the model has no sub-national units, so a secession of US states is not representable. What is: internal war
//        (UCDP intensity 2 = war), an autocratic regime, the state ceasing to exist, Puerto Rico's independence, losing
//        great-power status, losing the top pole.
//   MENA V-Dem region 3: leader exits, civil-war onsets, regime moves, another regional wave of openings, wars between
//        regional pairs, state births in the region.
// Run: node scripts/analysis/outlook.mjs <fc.json> [--years 2035,2050,2075]
import { readFileSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const fcFile = process.argv[2]; const fc = JSON.parse(readFileSync(fcFile, 'utf8'));
const runs = JSON.parse(readFileSync(fcFile.replace(/\.json$/, '-paths.json'), 'utf8')).runs;
const F0 = fc.meta.from, H = fc.meta.years; const YEARS = arg('years', '2035,2050,2075').split(',').map(Number).filter(y => y < F0 + H);
const N = runs.length; const pct = (x) => `${(100 * x).toFixed(1)}%`.padStart(6);
const K = (y) => y - F0;
const at = (arr, k) => (Array.isArray(arr) ? arr[k] : arr);
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const EU = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'];
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8')); const Y0 = panel.meta.y0;
const MENA = Object.keys(panel.actors).filter(id => panel.actors[id].region_pol?.[F0 - 1 - Y0] === 3 && panel.actors[id].live?.[F0 - 1 - Y0] === 1);
const live = (r, id, k) => { const l = r.actors[id]?.live; return l ? !!l[k] : !!r.actors[id]; };
const reg = (r, id, k) => at(r.actors[id]?.regime, k);
const evs = (r, upto) => r.events.slice(0, K(upto) + 1).flat();
const anyBy = (f) => (y) => runs.filter(r => f(r, y)).length / N;
const kindOf = (e) => e.t ?? e.k;
const line = (label, f) => console.log(`  ${label.padEnd(58)} ${YEARS.map(y => `${y}: ${pct(anyBy(f)(y))}`).join('   ')}`);

console.log(`${fcFile.split('/').pop()}: ${N} sample worlds from ${F0 - 1}, ${H} years, ${fc.meta.fit_source}`);
console.log(`\nEU (${EU.length} members as of ${F0 - 1}): P(by year)`);
// members already autocratic at the origin are not counted: the question is who turns
const EU0 = EU.filter(id => (panel.actors[id].regime?.[F0 - 1 - Y0] ?? 9) > 1);
const euAut = (r, y) => { let m = 0; for (let k = 0; k <= K(y); k++) m = Math.max(m, EU0.filter(id => live(r, id, k) && reg(r, id, k) != null && reg(r, id, k) <= 1).length); return m; };
const euWar = (r, y) => { for (const [p, a] of Object.entries(r.dyads?.at_war ?? {})) { const [x, z] = p.split('|'); if (EU.includes(x) && EU.includes(z)) for (let k = 0; k <= K(y); k++) if (at(a, k)) return true; } return false; };
const euGone = (r, y) => EU.some(id => !live(r, id, K(y)));
const euIntraWar = (r, y) => EU.some(id => { const a = r.actors[id]?.intrastate; if (!a) return false; for (let k = 0; k <= K(y); k++) if ((at(a, k) ?? 0) >= 2) return true; return false; });
const euBirth = (r, y) => evs(r, y).some(e => e.k === 'state_birth' && (fc.meta.holders_of?.[e.actor] ?? null) != null);
line('>= 1 democratic member turns autocratic (RoW 0-1)', (r, y) => euAut(r, y) >= 1);
line('>= 3 democratic members autocratic at the same time', (r, y) => euAut(r, y) >= 3);
line('a war between two members', euWar);
line('  ... a war between two members, neither the one autocratic at origin', (r, y) => { const aut0 = EU.filter(id => !EU0.includes(id)); for (const [p, a] of Object.entries(r.dyads?.at_war ?? {})) { const [x, z] = p.split('|'); if (EU0.includes(x) && EU0.includes(z)) for (let k = 0; k <= K(y); k++) if (at(a, k)) return true; } return false; });
line('a member ceases to exist as a state', euGone);
{ const m = new Map(); for (const r of runs) for (const e of evs(r, YEARS[1] ?? YEARS[0])) if (e.k === 'state_death' && EU.includes(e.actor)) { const k = `${e.actor}>${e.absorbed_by ?? '-'}`; m.set(k, (m.get(k) ?? 0) + 1); } console.log(`  ... who, absorbed by whom, by ${YEARS[1] ?? YEARS[0]} (runs): ${[...m].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k} ${n}`).join('  ')}`); }
line('internal war (intensity 2) in a member', euIntraWar);
line('FRACTURE: >= 3 turn autocratic, or a war between members, or one gone', (r, y) => euAut(r, y) >= 3 || euWar(r, y) || euGone(r, y));
const allied = fc.dyads?.allied ?? {}; const pairs = []; for (let i = 0; i < EU.length; i++) for (let j = i + 1; j < EU.length; j++) pairs.push(pk(EU[i], EU[j]));
console.log(`  defence-pact graph among members, expected share of the ${pairs.length} pairs allied: ${YEARS.map(y => `${y}: ${pct(pairs.reduce((s, p) => s + (at(allied[p], K(y)) ?? 0), 0) / pairs.length)}`).join('   ')}`);
const euAutCount = (y) => { const c = runs.map(r => EU.filter(id => live(r, id, K(y)) && (reg(r, id, K(y)) ?? 9) <= 1).length); return (c.reduce((a, b) => a + b, 0) / N).toFixed(2); };
console.log(`  members autocratic at the year, mean over runs: ${YEARS.map(y => `${y}: ${euAutCount(y)}`).join('   ')}   (at ${F0 - 1}: ${EU.filter(id => (panel.actors[id].regime?.[F0 - 1 - Y0] ?? 9) <= 1).join(' ') || 'none'})`);
const autoTop = (y) => EU.map(id => [id, runs.filter(r => { for (let k = 0; k <= K(y); k++) if ((reg(r, id, k) ?? 9) <= 1) return true; return false; }).length / N]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, p]) => `${id} ${pct(p).trim()}`).join('  ');
console.log(`  most likely to turn autocratic by ${YEARS[YEARS.length - 1]}: ${autoTop(YEARS[YEARS.length - 1])}`);

// the union itself (src/engine/unions.js simulates membership: exits at the run's drawn rate, enlargement rounds)
{
  const exits = (r, y) => evs(r, y).filter(e => e.k === 'union_exit' && e.union === 'eu');
  const joins = (r, y) => evs(r, y).filter(e => e.k === 'union_join' && e.union === 'eu');
  const size = (r, y) => EU.filter(id => live(r, id, K(y))).length - new Set(exits(r, y).map(e => e.actor)).size + new Set(joins(r, y).map(e => e.actor)).size;
  if (runs.some(r => r.events.flat().some(e => e.union === 'eu'))) {
    console.log(`  -- the union (simulated membership) --`);
    line('>= 1 member leaves', (r, y) => exits(r, y).length >= 1);
    line('>= 3 members leave', (r, y) => new Set(exits(r, y).map(e => e.actor)).size >= 3);
    line('a founding member leaves (BEL FRA DEU ITA LUX NLD)', (r, y) => exits(r, y).some(e => ['BEL', 'FRA', 'DEU', 'ITA', 'LUX', 'NLD'].includes(e.actor)));
    line('fewer than 20 members', (r, y) => size(r, y) < 20);
    line('UNION BREAKUP: half the 2025 members gone (left or ceased)', (r, y) => size(r, y) - new Set(joins(r, y).map(e => e.actor)).size <= 13);
    console.log(`  members, mean over runs: ${YEARS.map(y => `${y}: ${(runs.reduce((a, r) => a + size(r, y), 0) / N).toFixed(1)}`).join('   ')}`);
    const jm = new Map(); for (const r of runs) for (const e of joins(r, YEARS[YEARS.length - 1])) jm.set(e.actor, (jm.get(e.actor) ?? 0) + 1);
    console.log(`  most likely joiners by ${YEARS[YEARS.length - 1]}: ${[...jm].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => `${id} ${pct(n / N).trim()}`).join('  ')}`);
    const xm = new Map(); for (const r of runs) for (const e of exits(r, YEARS[YEARS.length - 1])) xm.set(e.actor, (xm.get(e.actor) ?? 0) + 1);
    console.log(`  exits by member (any, by ${YEARS[YEARS.length - 1]}): ${[...xm].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `${id} ${pct(n / N).trim()}`).join('  ')}   (n = 1 recorded exit: who leaves is not identified, only how often)`);
  }
}

console.log(`\nUS: P(by year)`);
const usIntra = (lvl) => (r, y) => { const a = r.actors.USA?.intrastate; if (!a) return false; for (let k = 0; k <= K(y); k++) if ((at(a, k) ?? 0) >= lvl) return true; return false; };
line('internal armed conflict (any intensity)', usIntra(1));
line('internal war (intensity 2)', usIntra(2));
line('autocratic regime (RoW 0-1) at some point', (r, y) => { for (let k = 0; k <= K(y); k++) if ((reg(r, 'USA', k) ?? 9) <= 1) return true; return false; });
line('ceases to exist as a state', (r, y) => !live(r, 'USA', K(y)));
line('Puerto Rico becomes a state', (r, y) => evs(r, y).some(e => e.k === 'state_birth' && e.actor === 'PRI'));
line('irregular leader exit', (r, y) => evs(r, y).some(e => e.actor === 'USA' && (kindOf(e) === 'irregular_exit' || (e.k === 'coup' && e.success))));
line('no longer a great power', (r, y) => !(at(r.actors.USA?.great_power, K(y)) ?? 0));
line('no longer the top pole (world hegemon)', (r, y) => at(r.world?.hegemon, K(y)) !== 'USA');
{ const dist = (v, y) => { const m = new Map(); for (const r of runs) { const h = at(r.world?.[v], K(y)); m.set(h, (m.get(h) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} ${pct(n / N).trim()}`).join(' '); };
  console.log(`  top pole (world hegemon): ${YEARS.map(y => `${y}: ${dist('hegemon', y)}`).join('   ')}`); }
line('FRACTURE: internal war, or ceases to exist', (r, y) => usIntra(2)(r, y) || !live(r, 'USA', K(y)));

const Y1 = YEARS[0], Y2 = YEARS[Math.min(1, YEARS.length - 1)];
console.log(`\nMiddle East (V-Dem region 3, ${MENA.length} states): ${MENA.join(' ')}`);
const perCountry = (f) => MENA.map(id => [id, runs.filter(r => f(r, id)).length / N]);
const show = (label, f, n = 8) => console.log(`  ${label.padEnd(40)} ` + perCountry(f).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, p]) => `${id} ${pct(p).trim()}`).join('  '));
show(`leader exit by ${Y1}`, (r, id) => evs(r, Y1).some(e => e.k === 'leader_exit' && e.actor === id));
show(`irregular leader exit by ${Y1}`, (r, id) => evs(r, Y1).some(e => e.actor === id && (kindOf(e) === 'irregular_exit' || (e.k === 'coup' && e.success))));
show(`new civil conflict by ${Y1}`, (r, id) => evs(r, Y1).some(e => e.k === 'intrastate_onset' && e.actor === id));
show(`democratises (a RoW step up) by ${Y2}`, (r, id) => evs(r, Y2).some(e => e.k === 'regime_change' && e.direction === 'democratize' && e.actor === id));
show(`autocratises (a RoW step down) by ${Y2}`, (r, id) => evs(r, Y2).some(e => e.k === 'regime_change' && e.direction === 'autocratize' && e.actor === id));
show(`becomes a great power by ${Y2}`, (r, id) => !!at(r.actors[id]?.great_power, K(Y2)));
const nuc = fc.actors ?? {}; console.log(`  ${'nuclear weapons at ' + Y2 + ' (ensemble)'.padEnd(29)} ` + MENA.map(id => [id, at(nuc[id]?.nuclear, K(Y2)) ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, p]) => `${id} ${pct(p).trim()}`).join('  '));
const wave = (y) => runs.filter(r => { for (let k = 0; k + 1 <= K(y); k++) { const s = new Set([...r.events[k], ...r.events[k + 1]].filter(e => e.k === 'opening' && MENA.includes(e.actor)).map(e => e.actor)); if (s.size >= 4) return true; } return false; }).length / N;
console.log(`  another regional wave (>= 4 states opening within two years): ${YEARS.map(y => `by ${y}: ${pct(wave(y)).trim()}`).join('  ')}`);
const warPairs = new Map(); for (const r of runs) for (const [p, a] of Object.entries(r.dyads?.at_war ?? {})) { const [x, z] = p.split('|'); if (!MENA.includes(x) && !MENA.includes(z)) continue; let hit = false; for (let k = 0; k <= K(Y2); k++) if (at(a, k)) { hit = true; break; } if (hit) warPairs.set(p, (warPairs.get(p) ?? 0) + 1); }
console.log(`  wars involving the region by ${Y2}, by pair: ` + [...warPairs].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, n]) => `${p} ${pct(n / N).trim()}`).join('  '));
console.log(`  any war between two regional states by ${Y2}: ${pct(runs.filter(r => Object.entries(r.dyads?.at_war ?? {}).some(([p, a]) => { const [x, z] = p.split('|'); if (!MENA.includes(x) || !MENA.includes(z)) return false; for (let k = 0; k <= K(Y2); k++) if (at(a, k)) return true; return false; })).length / N).trim()}`);
const births = new Map(); for (const r of runs) for (const e of evs(r, Y2)) if (e.k === 'state_birth') births.set(e.actor, (births.get(e.actor) ?? 0) + 1);
console.log(`  new states anywhere by ${Y2} (top): ` + [...births].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => `${id} ${pct(n / N).trim()}`).join('  '));
const regMix = (y) => { const c = [0, 0, 0, 0]; let n = 0; for (const r of runs) for (const id of MENA) { const v = reg(r, id, K(y)); if (v != null && live(r, id, K(y))) { c[v]++; n++; } } return c.map(x => (x / N).toFixed(1)).join(' / '); };
const now = [0, 0, 0, 0]; for (const id of MENA) { const v = panel.actors[id].regime?.[F0 - 1 - Y0]; if (v != null) now[v]++; }
console.log(`  regime mix, mean states closed / electoral autocracy / electoral democracy / liberal: ${F0 - 1}: ${now.join(' / ')}   ${YEARS.map(y => `${y}: ${regMix(y)}`).join('   ')}`);
