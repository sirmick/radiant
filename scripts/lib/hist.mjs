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

/** (ccode, year) -> actor id. Hand entities win (Prussia→DEU, Austria-Hungary→AUT, Ottoman→TUR, Korea→KOR), else the countrycode panel. */
export function makeCodeMap(actors, system = 'cow') {
  const byCode = new Map();
  for (const a of actors.values()) { const c = system === 'gw' ? (a.gw ?? a.cow) : (a.cow ?? a.gw); if (c != null && a.modeled) (byCode.get(c) ?? byCode.set(c, []).get(c)).push(a); }
  const extra = { 260: 'DEU', 265: 'DDR', 305: 'AUT', 300: 'AUT_HUN', 730: 'KOREA', 816: 'VNM', 817: 'VNM' };
  const panelRows = system === 'gw' ? actors.gwRows : actors.cowRows;
  const panelByCode = new Map();
  for (const [c, y, id] of panelRows ?? []) (panelByCode.get(c) ?? panelByCode.set(c, []).get(c)).push([y, id]);
  const cache = new Map();
  return (code, year) => {
    const c = +code; const k = `${c}|${year}`; if (cache.has(k)) return cache.get(k);
    let out = null;
    const list = byCode.get(c);
    if (list) { const live = list.filter(a => isLive(a, year)); out = (live[0] ?? list[0]).id; }
    else if (extra[c]) out = extra[c];
    else { const rows = panelByCode.get(c); if (rows) { let best = null, bd = Infinity; for (const [y, id] of rows) { const d = Math.abs(y - year); if (d < bd) { bd = d; best = id; } } out = best; } }
    cache.set(k, out); return out;
  };
}

/** OWID/ISO3 entity code -> actor id (modern successor series stand in for predecessors). */
export function makeOwidMap(actors) {
  const m = new Map();
  for (const a of actors.values()) if (a.owid) (m.get(a.owid) ?? m.set(a.owid, []).get(a.owid)).push(a);
  return (code, year) => {
    const list = m.get(code); if (!list) return null;
    const live = list.filter(a => isLive(a, year));
    return (live[0] ?? list[0]).id;
  };
}

/** System membership: any span contains `year` ([from, to) with to null = open). */
export const isLive = (a, year) => (a.spans ?? [[a.introduced, a.retired]]).some(([f, t]) => year >= (f ?? 1816) && (t == null || year < t));
