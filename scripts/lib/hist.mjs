// Shared helpers for the historical pipeline: CSV parsing, the state universe, code maps, actor lifecycles.
import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export const splitCsv = (line) => parseCsv(line)[0] ?? [];
/** Full RFC-4180-ish parser: handles quoted commas, quoted newlines, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function* csvRows(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const head = rows[0].map(h => h.trim());
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]; if (cells.length === 1 && cells[0] === '') continue;
    const row = {}; head.forEach((h, j) => row[h] = cells[j] ?? ''); yield row;
  }
}
export const readCsv = (p) => [...csvRows(readFileSync(p, 'utf8'))];
export const Y = (p) => parseYaml(readFileSync(p, 'utf8'));

const slug = (name) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * The state universe: every state in the countrycode panel (CoW / GW system membership) 1816–2025,
 * merged with the hand-coded historical entities (data/history/actors.yaml) and the modern model actors (data/actors.yaml).
 * id -> { id, name, spans, introduced, retired, successor, gw, cow, owid, great_power, modeled }
 * `spans` = [[from, to|null], ...] system-membership intervals; the codelist's interior gaps are kept (a colonised
 * state is not an actor while it is a colony), so `isLive` is span membership, not [min, max].
 * `modeled` = simulated by the engine (hand/modern sets); everything else is fit-only.
 */
export function loadActors() {
  const hist = Y('data/history/actors.yaml');
  const modern = Y('data/actors.yaml');
  const byId = new Map(hist.map(a => [a.id, { ...a, modeled: a.modeled ?? true }]));
  for (const m of modern) {
    if (!byId.has(m.id)) byId.set(m.id, { id: m.id, name: m.name, introduced: 1991, gw: null, owid: m.id, modeled: true });
    byId.get(m.id).modern = m; byId.get(m.id).modeled = true;
  }
  // universe from the countrycode panel: iso3c when present, else a slug of the English name
  const panelPath = 'data/raw/hist/codelist_panel.csv';
  const span = new Map();   // id -> { years: Set, gw, cow, name, iso }
  const cowRows = [], gwRows = [];
  if (existsSync(panelPath)) for (const r of csvRows(readFileSync(panelPath, 'utf8'))) {
    const y = +r.year, cow = r.cown ? +r.cown : null, gw = r.gwn ? +r.gwn : null; if (cow == null && gw == null) continue;
    const iso = r.iso3c || null; const id = iso ?? slug(r['country.name.en']);
    const s = span.get(id) ?? span.set(id, { years: new Set(), gw, cow, name: r['country.name.en'], iso }).get(id);
    s.years.add(y); s.gw ??= gw; s.cow ??= cow;
    if (cow != null) cowRows.push([cow, y, id]); if (gw != null) gwRows.push([gw, y, id]);
  }
  const runs = (years) => { const ys = [...years].sort((a, b) => a - b); const out = []; for (const y of ys) { const last = out[out.length - 1]; if (last && y === last[1] + 1) last[1] = y; else out.push([y, y]); } return out; };
  for (const [id, s] of span) {
    if (byId.has(id)) { const a = byId.get(id); a.cow ??= s.cow; a.gw ??= s.gw; continue; }
    const iv = runs(s.years).map(([a, b]) => [a, b >= 2020 ? null : b + 1]);   // [from, to) — `to` null = still live
    byId.set(id, { id, name: s.name, spans: iv, introduced: iv[0][0], retired: iv[iv.length - 1][1], gw: s.gw, cow: s.cow, owid: s.iso ?? null, modeled: false, universe: true });
  }
  for (const a of byId.values()) {
    a.introduced ??= a.spans?.[0]?.[0] ?? 1816; a.retired ??= a.spans?.[a.spans.length - 1]?.[1] ?? null; a.owid ??= a.id; a.modeled ??= false;
    // hand entries may declare `spans: [[from, to|null], ...]` (to is exclusive) where the codelist's [min,max] would be wrong
    a.spans ??= [[a.introduced, a.retired]];
  }
  byId.cowRows = cowRows; byId.gwRows = gwRows;
  return byId;
}

/**
 * (ccode, year) -> actor id. Hand entities win (Prussia→DEU, Austria-Hungary→AUT, Ottoman→TUR, Korea→KOR), else the
 * countrycode panel.
 *
 * era-1945-1991-r2/data-6: the candidate set is every HAND-CODED actor (data/history/actors.yaml and data/actors.yaml),
 * not only the simulated ones. The `a.modeled` gate meant a hand entry that corrects a lifecycle could not also
 * redirect a code across the boundary it corrects: unified Yemen carries GW 678 from 1990, but with YEM outside the
 * candidate set every post-1990 UCDP row on 678 fell through to the countrycode panel, which maps 678 to the Yemen
 * Arab Republic through 2020 — five intrastate onsets, one ending and two interstate onsets landed on a state that
 * ceased to exist on 22 May 1990, while unified Yemen's own conflict row read a clean zero.
 * Selection is by LIVENESS at the queried year, which is what makes the redirection dated rather than global, and a
 * code no candidate is live for falls through to `extra` and then to the panel exactly as before — so the
 * `spans: []` codelist twins (YUGOSLAVIA, AUSTRIA_HUNGARY, GERMAN_DEMOCRATIC_REPUBLIC) can never win a lookup.
 */
export function makeCodeMap(actors, system = 'cow') {
  const byCode = new Map();
  for (const a of actors.values()) { const c = system === 'gw' ? (a.gw ?? a.cow) : (a.cow ?? a.gw); if (c != null && !a.universe) (byCode.get(c) ?? byCode.set(c, []).get(c)).push(a); }
  // era-1945-1991-r2/data-4: CoW 817 (Republic of Vietnam) is NOT VNM. It was mapped here to the same actor as CoW 816
  // (the DRV), which put Saigon's 20 disputes, 7 wars, 7 coups and 10 leader exits on Hanoi's actor-year row and left
  // the registry's own REPUBLIC_OF_VIETNAM with no panel row and no events. It now resolves through the hand entry.
  const extra = { 260: 'DEU', 265: 'DDR', 305: 'AUT', 300: 'AUT_HUN', 730: 'KOREA', 816: 'VNM' };
  const panelRows = system === 'gw' ? actors.gwRows : actors.cowRows;
  const panelByCode = new Map();
  for (const [c, y, id] of panelRows ?? []) (panelByCode.get(c) ?? panelByCode.set(c, []).get(c)).push([y, id]);
  const cache = new Map();
  return (code, year) => {
    const c = +code; const k = `${c}|${year}`; if (cache.has(k)) return cache.get(k);
    let out = null;
    const list = byCode.get(c);
    const live = list ? list.filter(a => isLive(a, year)) : [];
    if (live.length) out = live[0].id;
    else if (extra[c]) out = extra[c];
    else { const rows = panelByCode.get(c); if (rows) { let best = null, bd = Infinity; for (const [y, id] of rows) { const d = Math.abs(y - year); if (d < bd) { bd = d; best = id; } } out = best; } }
    if (out == null && list?.length) out = list[0].id;
    cache.set(k, out); return out;
  };
}

/**
 * OWID/ISO3 entity code -> actor id (modern successor series stand in for predecessors).
 * An actor may declare `owid_alt: [{ code, from, to }]` — an entity-wide series (OWID_USS, OWID_YGS, OWID_CZS)
 * that is the right series for that actor inside [from, to). With `preferAlt` (used for the borders-sensitive
 * series: Maddison gdp_pc and OWID population) the actor's primary code returns null inside an alt window, so the
 * modern-borders series does not overwrite the entity-wide one. Other files (V-Dem, WB, energy) keep the primary code.
 */
export function makeOwidMap(actors, { preferAlt = false } = {}) {
  const m = new Map();          // code -> [actor]
  const alt = new Map();        // code -> [{ actor, from, to }]
  const altWindows = new Map(); // actor id -> [[from, to], ...]
  for (const a of actors.values()) {
    if (a.owid) (m.get(a.owid) ?? m.set(a.owid, []).get(a.owid)).push(a);
    for (const x of a.owid_alt ?? []) {
      (alt.get(x.code) ?? alt.set(x.code, []).get(x.code)).push({ a, from: x.from ?? 1816, to: x.to ?? null });
      (altWindows.get(a.id) ?? altWindows.set(a.id, []).get(a.id)).push([x.from ?? 1816, x.to ?? null]);
    }
  }
  const inAltWindow = (id, year) => (altWindows.get(id) ?? []).some(([f, t]) => year >= f && (t == null || year < t));
  return (code, year) => {
    const av = alt.get(code);
    if (av) { const hit = av.find(x => year >= x.from && (x.to == null || year < x.to)); if (hit) return hit.a.id; }
    const list = m.get(code); if (!list) return null;
    const live = list.filter(a => isLive(a, year));
    const id = (live[0] ?? list[0]).id;
    if (preferAlt && inAltWindow(id, year)) return null;   // the entity-wide alt series owns this year
    return id;
  };
}

/** System membership: any span contains `year` ([from, to) with to null = open). */
export const isLive = (a, year) => (a.spans ?? [[a.introduced, a.retired]]).some(([f, t]) => year >= (f ?? 1816) && (t == null || year < t));

/**
 * The dated defence-pact graph, as one construction read by scripts/build-panel.mjs, scripts/lib/fit.mjs,
 * scripts/backtest.mjs and scripts/run-forward.mjs — era-1991-2026-r2/data-7 and engine-6.
 *
 * Three sources, spliced at their own boundaries so no year is taken from two of them:
 *   1816-2000  CoW Formal Alliances 3.03 dyadic, sstype 1 (defense). Unchanged: every pre-2001 row this repo has
 *              ever scored comes from here and still does.
 *   2001-2018  ATOP 5.1 (scripts/fetch-atop.mjs), atop_defense = 1. CoW 3.03 ENDS IN 2000, and the build used to
 *              carry the last value past it — which for a state that had no alliance in 2000 is a carried ZERO, so
 *              the seven 2004 NATO entrants, the two of 2009 and Montenegro in 2017 were coded as allies of nobody
 *              for the rest of the run, and the dyadic `allied` feature was the year-2000 edge set at as-of 2000,
 *              2010 and 2025 alike (1,010 edges at all three, byte-identical).
 *   2019-      dated hand rows in data/history/events.yaml (`kind: pact`), which is where the accessions past
 *              ATOP's own last year live. Each row names the acceding state, the members it thereby allies with,
 *              and its source.
 *
 * Returns a Set of `A|B|year` (ids ordered) plus `meta` describing the splice for a source line.
 */
export function loadPacts(codeMap = null) {
  const actors = loadActors();
  const code = codeMap ?? makeCodeMap(actors);
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pacts = new Set();
  const COW_LAST = 2000;
  let nCow = 0, nAtop = 0, nHand = 0, atopLast = COW_LAST;
  for (const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')) {
    if (r.sstype !== '1') continue;
    const y = +r.year; if (y > COW_LAST) continue;
    const a = code(r.ccode1, y), b = code(r.ccode2, y);
    if (a && b && a !== b) { pacts.add(`${pairKey(a, b)}|${y}`); nCow++; }
  }
  try {
    for (const r of readCsv('data/raw/hist/atop_alliance_5.1.csv')) {
      const y = +r.year; if (y <= COW_LAST) continue;
      if (+r.atop_defense !== 1) continue;
      atopLast = Math.max(atopLast, y);
      const a = code(r.ccode1, y), b = code(r.ccode2, y);
      if (a && b && a !== b) { pacts.add(`${pairKey(a, b)}|${y}`); nAtop++; }
    }
  } catch { /* ATOP not fetched: the graph stops at CoW's end and the source line says so */ }
  const lastYear = Math.max(atopLast, 2026);
  // past the last dataset year the graph is CARRIED, not empty — the same last-observation carry the panel applies
  // to every stale column, made explicit here rather than done per column downstream. `stale_from` says where it
  // starts so a reader can tell a measured edge from a carried one.
  let nCarried = 0;
  const lastEdges = [...pacts].filter(k => k.endsWith(`|${atopLast}`)).map(k => k.slice(0, k.lastIndexOf('|')));
  for (const k of lastEdges) for (let y = atopLast + 1; y <= lastYear; y++) { const key = `${k}|${y}`; if (!pacts.has(key)) { pacts.add(key); nCarried++; } }
  for (const e of Y('data/history/events.yaml')) {
    if (e.kind !== 'pact' || e.type !== 'defense') continue;
    const y0 = Math.floor(e.year);
    if (y0 <= atopLast) continue;                      // inside a dataset's own coverage: the dataset owns it
    for (const a of e.members ?? []) for (const b of e.with ?? []) {
      if (a === b) continue;
      for (let y = y0; y <= lastYear; y++) { pacts.add(`${pairKey(a, b)}|${y}`); nHand++; }
    }
  }
  return { pacts, meta: { cow_last: COW_LAST, atop_last: atopLast, stale_from: atopLast + 1, n_cow: nCow, n_atop: nAtop, n_hand: nHand, n_carried: nCarried,
    source: `CoW Formal Alliances 3.03 dyadic sstype 1 (1816-${COW_LAST}), ATOP 5.1 atop_defense (${COW_LAST + 1}-${atopLast}, scripts/fetch-atop.mjs), the ${atopLast} edge set carried forward past it, and dated \`kind: pact\` rows in data/history/events.yaml for the accessions after ${atopLast}` } };
}
