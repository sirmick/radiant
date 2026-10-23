// Breakup scoring (docs/plan-structure.md): for every origin year T and every state holding territories at T, the
// forecast P(at least one of them becomes a state within W years), with the hazards fitted on labels <= T and the
// holder's covariates read at T and held there (a forecaster at T knows nothing later). Scored against what happened,
// against climatology (the pooled rate over earlier origins), and printed as a watchlist at chosen origins — the false
// positives (China, India, Indonesia...) matter as much as the hits.
// Run: node scripts/analysis/breakup.mjs [--x held,colonial,...] [--from 1900] [--to 2014] [--w 5] [--json f]
import { readFileSync, writeFileSync } from 'node:fs';
import { loadActors } from '../lib/hist.mjs';
import { loadPolygons, loadHolders } from '../lib/inputs.mjs';
import { fitMembership, holderAt, isColonial, breakupHazard, polygonKey, holderStatePanel, contiguityIndex, firstLiveIndex, setBreakupFeatures, BREAKUP_ON, MEMBERSHIP, unitKey, unitHolder } from '../../src/engine/membership.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
if (arg('x', null)) setBreakupFeatures(arg('x').split(','));
const FROM = +arg('from', 1900), TO = +arg('to', 2014), W = +arg('w', 5), STEP = +arg('step', 1);
const WATCH = (arg('watch', '1912,1955,1970,1980,1985,1987,1990,2005')).split(',').map(Number);
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8')); const Y0 = panel.meta.y0;
const holders = loadHolders(); const { polygons, polygonOf } = loadPolygons(loadActors());
const contiguity = JSON.parse(readFileSync('data/contiguity.json', 'utf8')).pairs;
const areaMap = new Map(polygons.map(p => [p.id, p.area])); const firstLive = firstLiveIndex(panel, polygonOf);
const live = (id, y) => panel.actors[id]?.live?.[y - Y0] === 1;
const occupiedAt = (y) => new Set(Object.keys(panel.actors).filter(id => live(id, y)).map(id => polygonKey(id, polygonOf)));
const bornIn = (poly, y) => Object.keys(panel.actors).some(id => polygonKey(id, polygonOf) === poly && live(id, y) && !live(id, y - 1));
// the record's breakups (holder -> years) and world births, for the memory terms
const breakYears = new Map(); const births = [];
for (let y = Y0 + 1; y <= panel.meta.y1; y++) {
  for (const id of Object.keys(panel.actors)) if (live(id, y) && !live(id, y - 1)) births.push(y);
  for (const p of polygons) { const o = holderAt(holders, p.id, y - 1); if (o?.h && o.h !== 'self' && bornIn(p.id, y)) { const l = breakYears.get(o.h) ?? breakYears.set(o.h, []).get(o.h); if (!l.includes(y)) l.push(y); } }
}
const nbOf = contiguityIndex(contiguity);

const rows = [];
for (let T = FROM; T <= TO; T += STEP) {
  const fit = fitMembership({ panel, polygons, polygonOf, contiguity, holders }, T);
  const occ = occupiedAt(T); const t = T + 1, i = t - Y0;
  const held = new Map();
  for (const p of polygons) { if (occ.has(p.id)) continue; const o = holderAt(holders, p.id, T); if (o?.h && o.h !== 'self' && live(o.h, T)) { const u = unitKey(o.h, isColonial(o.status)); (held.get(u) ?? held.set(u, []).get(u)).push({ poly: p, colony: isColonial(o.status), prior: (firstLive.get(p.id) ?? Infinity) < T }); } }
  const recent = births.filter(y => y >= t - MEMBERSHIP.wave_years && y < t).length;
  let dem = null; for (const a of Object.values(panel.actors)) { const d = a.dem_share?.[i - 1]; if (d != null) { dem = d; break; } }
  for (const [u, list] of held) {
    const h = u; const s = holderStatePanel(unitHolder(u), i, list, { panel, breakYears, nbOf, recent, dem, areaOf: (p) => areaMap.get(p), own: (x) => polygonKey(x, polygonOf) });
    const hz = breakupHazard(fit, s); if (hz == null) continue;
    let out = 0; for (let y = t; y <= Math.min(T + W, panel.meta.y1); y++) if (list.some(x => bornIn(x.poly.id, y))) { out = 1; break; }
    if (T + W > panel.meta.y1) continue;
    rows.push({ T, h, n: list.length, p: 1 - (1 - hz) ** W, y: out, s });
  }
}
// scores
const brier = (r, f) => r.reduce((a, x) => a + (f(x) - x.y) ** 2, 0) / r.length;
const ll = (r, f) => -r.reduce((a, x) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, f(x))); return a + (x.y ? Math.log(q) : Math.log(1 - q)); }, 0) / r.length;
const auc = (r) => { const pos = r.filter(x => x.y).map(x => x.p), neg = r.filter(x => !x.y).map(x => x.p); let s = 0; for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0; return pos.length && neg.length ? s / (pos.length * neg.length) : null; };
// climatology: the outcome rate over origins whose window closed by T (honest: known at T)
const clim = (x) => { const past = rows.filter(r => r.T + W <= x.T); return past.length ? Math.min(0.99, Math.max(0.01, past.reduce((a, r) => a + r.y, 0) / past.length)) : 0.2; };
const report = (label, r) => { if (!r.length) return null; const b = brier(r, x => x.p), bc = brier(r, clim); const o = { n: r.length, events: r.reduce((a, x) => a + x.y, 0), brier: +b.toFixed(4), brier_clim: +bc.toFixed(4), skill: +(1 - b / bc).toFixed(3), logloss: +ll(r, x => x.p).toFixed(4), auc: auc(r) == null ? null : +auc(r).toFixed(3), exp_obs: +(r.reduce((a, x) => a + x.p, 0) / Math.max(1, r.reduce((a, x) => a + x.y, 0))).toFixed(2) }; console.log(`${label.padEnd(12)} n=${String(o.n).padStart(5)} ev=${String(o.events).padStart(4)}  skill ${o.skill.toFixed(3).padStart(7)}  AUC ${o.auc}  logloss ${o.logloss}  exp/obs ${o.exp_obs}`); return o; };
console.log(`breakup within ${W}y, origins ${FROM}-${TO}, features: ${BREAKUP_ON.join(',')}`);
const out = { all: report('all', rows) };
for (const [lab, a, b] of [['1900-1944', 1900, 1944], ['1945-1979', 1945, 1979], ['1980-2014', 1980, 2014]]) out[lab] = report(lab, rows.filter(r => r.T >= a && r.T <= b));
for (const T of WATCH) {
  const r = rows.filter(x => x.T === T).sort((a, b) => b.p - a.p); if (!r.length) continue;
  console.log(`  ${T}: ` + r.slice(0, 9).map(x => `${x.h}${x.y ? '*' : ''} ${(100 * x.p).toFixed(0)}%`).join('  ') + `   (* = broke up by ${T + W})`);
}
const keys = ['RUS', 'SRB', 'CZECHOSLOVAKIA', 'CHN', 'IND', 'IDN', 'ETH', 'SDN', 'PAK', 'NGA', 'ESP', 'GBR'].flatMap(k => [k, `${k}|i`, `${k}|c`]);
for (const T of [1980, 1985, 1987, 1990]) { const r = rows.filter(x => x.T === T && keys.includes(x.h)); if (r.length) console.log(`  ${T} watch: ` + r.map(x => `${x.h}${x.y ? '*' : ''} ${(100 * x.p).toFixed(1)}%`).join('  ')); }
const json = arg('json', null); if (json) writeFileSync(json, JSON.stringify({ meta: { W, FROM, TO, features: BREAKUP_ON }, scores: out }, null, 1));
if (process.argv.includes('--diag')) {
  const r = rows.filter(x => x.T >= 1980); const ev = r.filter(x => x.y), ne = r.filter(x => !x.y);
  const agg = (xs) => { const m = new Map(); for (const x of xs) { const o = m.get(x.h) ?? m.set(x.h, { n: 0, p: 0, T: [] }).get(x.h); o.n++; o.p += x.p; o.T.push(x.T); } return [...m].map(([h, o]) => `${h} ${(100 * o.p / o.n).toFixed(1)}% (${o.T[0]}-${o.T[o.T.length - 1]}, n${o.n})`); };
  console.log('events >=1980 (mean P):', agg(ev).join('; '));
  console.log('non-events >=1980, highest mean P:', agg(ne).sort((a, b) => parseFloat(b.split(' ')[1]) - parseFloat(a.split(' ')[1])).slice(0, 12).join('; '));
}
if (arg('trace', null)) {
  const u = arg('trace');
  for (const x of rows.filter(r => r.h === u)) { const f = fitMembership({ panel, polygons, polygonOf, contiguity, holders }, x.T).breakup; console.log(x.T, `P${W}=${(100 * x.p).toFixed(1)}%`, x.y ? '*' : ' ', BREAKUP_ON.map((k, j) => { const v = (k.endsWith(':i') ? 1 : 1); return `${k}=${(x.s[k.replace(':i', '')] ?? 'na').toString().slice(0, 5)}(β${f.beta[j + 1].toFixed(2)})`; }).join(' ')); }
}
