// Shared helpers for the historical pipeline: CSV parsing, code maps, actor lifecycles.
import { readFileSync } from 'node:fs';
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
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  const head = rows[0].map(h => h.trim());
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]; if (cells.length === 1 && cells[0] === '') continue;
    const row = {}; head.forEach((h, j) => row[h] = cells[j] ?? ''); yield row;
  }
}
export const readCsv = (p) => [...csvRows(readFileSync(p, 'utf8'))];
export const Y = (p) => parseYaml(readFileSync(p, 'utf8'));

/** Historical actor set merged with modern actors: id -> { id, introduced, retired, successor, gw, owid, great_power } */
export function loadActors() {
  const hist = Y('data/history/actors.yaml');
  const modern = Y('data/actors.yaml');
  const byId = new Map(hist.map(a => [a.id, { ...a }]));
  for (const m of modern) {
    if (!byId.has(m.id)) byId.set(m.id, { id: m.id, name: m.name, introduced: 1991, gw: null, owid: m.id });
    byId.get(m.id).modern = m;
  }
  for (const a of byId.values()) { a.introduced ??= 1816; a.retired ??= null; a.owid ??= a.id; }
  return byId;
}

/** (CoW/GW ccode, year) -> model actor id, honouring lifecycles (Prussia→DEU, Austria-Hungary→AUT, Ottoman→TUR, Korea→KOR). */
export function makeCodeMap(actors) {
  const byGw = new Map();
  for (const a of actors.values()) if (a.gw != null) (byGw.get(a.gw) ?? byGw.set(a.gw, []).get(a.gw)).push(a);
  const extra = { 260: 'DEU', 265: 'DDR', 305: 'AUT', 300: 'AUT_HUN', 730: 'KOREA', 816: 'VNM', 817: 'VNM' };
  return (code, year) => {
    const c = +code;
    const list = byGw.get(c);
    if (list) {
      const live = list.filter(a => year >= a.introduced && (a.retired == null || year < a.retired));
      if (live.length) return live[0].id;
      return list[0].id;
    }
    if (extra[c]) return extra[c];
    return null;
  };
}

/** OWID/ISO3 entity code -> actor id (modern successor series stand in for predecessors). */
export function makeOwidMap(actors) {
  const m = new Map();
  for (const a of actors.values()) if (a.owid) (m.get(a.owid) ?? m.set(a.owid, []).get(a.owid)).push(a);
  return (code, year) => {
    const list = m.get(code); if (!list) return null;
    const live = list.filter(a => year >= a.introduced && (a.retired == null || year < a.retired));
    return (live[0] ?? list[0]).id;
  };
}

export const isLive = (a, year) => year >= a.introduced && (a.retired == null || year < a.retired);
