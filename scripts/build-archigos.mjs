// Leader exits: the manner of exit from Archigos 4.1 (Goemans, Gleditsch & Chiozza), into data/events.json
// (idempotent). REIGN + Powell-Thyne, the build's source, codes an exit irregular only when a coup removed the
// leader, so Ben Ali's flight, Mubarak's fall to protest and Gaddafi's death in a rebel war are all "regular" there.
// Archigos codes the manner: Irregular (coup, protest, rebels, assassination...), Foreign (removed by another state),
// Regular, Natural Death, Retired Due to Ill Health.
//
// Source: the `peacesciencer` R package's archigos data (data/raw/hist/ps_archigos.csv, GW-coded, 1875-2015).
// Each REIGN exit in events.json up to 2015 is matched to the Archigos spell of the same state ending within 120 days;
// a match sets `irregular` (1 for Irregular or Foreign), `exit_manner` (the Archigos exit code) and `foreign_support`
// (1 where the code says "with Foreign Support" or the exit is Foreign). The REIGN flag is kept as `irregular_reign`.
// Unmatched exits keep their REIGN coding.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors, makeCodeMap } from './lib/hist.mjs';

const gw = makeCodeMap(loadActors(), 'gw');
const idOf = (c, y) => { const m = gw(+c, y); return typeof m === 'string' ? m : m?.id ?? null; };
const parse = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const [head, ...lines] = readFileSync('data/raw/hist/ps_archigos.csv', 'utf8').trim().split('\n');
const H = parse(head); const ix = Object.fromEntries(H.map((h, i) => [h, i]));
const spells = new Map();   // id -> [{ end (fractional year), exit, code }]
for (const l of lines) {
  const r = parse(l); const end = r[ix.enddate]; if (!end || r[ix.exit] === 'Still in Office') continue;
  const d = new Date(end); const y = d.getUTCFullYear() + (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / (365.25 * 864e5);
  const id = idOf(r[ix.gwcode], d.getUTCFullYear()); if (!id) continue;
  (spells.get(id) ?? spells.set(id, []).get(id)).push({ end: y, exit: r[ix.exit], code: r[ix.exitcode] });
}
const ev = JSON.parse(readFileSync('data/events.json', 'utf8'));
let n = 0, m = 0, up = 0, down = 0, foreign = 0;
for (const e of ev.events) {
  if (e.kind !== 'leader_exit') continue;
  if (e.irregular_reign != null) { e.irregular = e.irregular_reign; delete e.irregular_reign; delete e.exit_manner; delete e.foreign_support; }
  if (e.year > 2016) continue; n++;
  const c = (spells.get(e.actor) ?? []).filter(s => Math.abs(s.end - e.year) <= 120 / 365.25).sort((a, b) => Math.abs(a.end - e.year) - Math.abs(b.end - e.year))[0];
  if (!c) continue; m++;
  const irr = c.exit === 'Irregular' || c.exit === 'Foreign' ? 1 : 0;
  e.irregular_reign = e.irregular ?? 0; if (irr > e.irregular_reign) up++; if (irr < e.irregular_reign) down++;
  e.irregular = irr; e.exit_manner = c.code; e.foreign_support = /with Foreign Support/.test(c.code) || c.exit === 'Foreign' ? 1 : 0; if (e.foreign_support) foreign++;
  e.source = 'REIGN (+ Archigos 4.1 manner of exit)';
}
writeFileSync('data/events.json', JSON.stringify(ev));
console.log(`leader exits <= 2016: ${n}, matched to Archigos ${m}; irregular 0->1 ${up}, 1->0 ${down}; foreign-supported ${foreign}`);
