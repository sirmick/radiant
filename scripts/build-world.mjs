// Compile data/*.yaml + data/panel.json -> public/world.json (+ public/geo.topo.json).
// Registry-driven: every variable in data/variables.yaml is resolved for every actor via its `source`.
//
// This script owns no series (operator / modern-fold, 2026-09-07). A series variable's HISTORY is read from
// data/panel.json — the one clock the engine and the refine loop also read — and only the years past the panel's
// last year are resolved from the raw projection files, through the same scripts/lib/modern.mjs fetchers the panel
// was built with. Statics (hand snapshots, estimate maps, region-median fallbacks) are still compiled here: they are
// viewer defaults, not measurements.
// Run: node scripts/build-panel.mjs && node scripts/build-world.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { resolveFetch, describeSource } from './lib/modern.mjs';

const T0_YEAR = 2026.5, STEPS = 160, HIST_FROM = 2000, PROJ_TO = 2066;
const Y = (f) => parseYaml(readFileSync(`data/${f}.yaml`, 'utf8'));
const registry = Y('variables'), actors = Y('actors'), territories = Y('territories'),
      corridors = Y('corridors');
// The 2026 conversation-era hazards/claims were retired to docs/origin/ (2026-09-07): the engine runs fitted templates only.
// They load if present so the origin layer can still be compiled for reference, otherwise compile as empty.
const hazards = existsSync('data/hazards.yaml') ? Y('hazards') : [];
const claims = existsSync('data/claims.yaml') ? Y('claims') : [];
const ACTORS = new Set(actors.map(a => a.id));
const overrides = existsSync('data/overrides.yaml') ? Y('overrides') : {};
const warn = [], errors = [];

// ---------------------------------------------------------------- the panel is the history
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8'));
const PY0 = panel.meta.y0, PY1 = panel.meta.y1;
const panelCol = (v) => v.panel ?? v.id;

// ---------------------------------------------------------------- resolve one variable for all actors
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };

function resolveSeries(v) {
  const col = panelCol(v);
  // projections only: the panel stops at its last year, and WPP's medium variant is the only source that runs past it
  let proj = {};
  try { proj = resolveFetch(v.source, { from: PY1 + 1, to: PROJ_TO }); } catch (e) { warn.push(`${v.id}: no projection (${e.message})`); }
  const out = {};
  for (const a of actors) {
    const row = panel.actors[a.id]?.[col];
    if (!row && !proj[a.id]) continue;
    const hist = [], values = [];
    if (row) for (let y = HIST_FROM; y <= Math.min(PY1, 2026); y++) { const x = row[y - PY0]; if (x != null) { hist.push(y); values.push(x); } }
    if (!row) warn.push(`${v.id}: no panel column ${col} for ${a.id}`);
    // the viewer's t0 is 2026Q3, one year past the panel: a projection year at or before t0 is history to it
    const ys = Object.keys(proj[a.id] ?? {}).map(Number).sort((x, y) => x - y);
    for (const y of ys) if (y > PY1 && y <= 2026) { hist.push(y); values.push(proj[a.id][y]); }
    const py = ys.filter(y => y > 2026);
    const last = hist.length ? hist[hist.length - 1] : null;
    out[a.id] = {
      v0: last != null ? values[values.length - 1] : null, year0: last,
      // years between the last observation and the viewer's t0 — 0 for a current series, >0 for a value the viewer
      // would otherwise read as current (operator / modern-capability, package 10). The engine records the same
      // quantity per actor-year in `stale` / `carry` (src/engine/core.js buildActorState).
      stale: last != null ? Math.max(0, Math.floor(T0_YEAR) - last) : null,
      hist: { years: hist, values },
      proj: py.length ? { years: py, values: py.map(y => proj[a.id][y]) } : null,
      source: `panel:${col} (${describeSource(v.source)})`,
    };
  }
  return out;
}

function resolveStatic(v) {
  const src = v.source, out = {};
  for (const a of actors) {
    let val, source;
    if (src.hand) { val = getPath(a, src.field); source = `hand:${src.hand}`; }
    else if (src.estimate != null && typeof src.estimate === 'object') { val = src.estimate[a.id]; source = 'estimate'; }
    else if (src.estimate != null) { val = src.estimate; source = 'estimate'; }
    if (val !== undefined) out[a.id] = { v0: val, source };
  }
  return out;
}

function applyFallback(v, out) {
  const fb = v.fallback; if (!fb) return;
  for (const a of actors) {
    if (out[a.id]?.v0 != null) continue;
    let val;
    if (fb.estimate === 'region_median') val = median(actors.filter(b => b.region === a.region && out[b.id]?.v0 != null).map(b => out[b.id].v0)) ?? median(actors.map(b => out[b.id]?.v0));
    else if (typeof fb.estimate === 'number') val = fb.estimate;
    if (val != null) out[a.id] = { ...(out[a.id] ?? {}), v0: val, year0: out[a.id]?.year0 ?? null, source: `fallback:${fb.estimate}` };
  }
}

const compiledVars = {};   // var_id -> { ISO: {...} }
const worldVars = {};      // world-scope v0
for (const v of registry.variables) {
  if (v.scope === 'world') {
    if (v.source?.estimate != null) worldVars[v.id] = { v0: v.source.estimate, source: 'estimate' };
    continue;
  }
  if (v.scope === 'dyad') { warn.push(`dyad variable ${v.id} skipped (M2)`); continue; }
  let out;
  if (v.source.fetch) out = resolveSeries(v);
  else if (v.source.hand || v.source.estimate != null) out = resolveStatic(v);
  else if (v.source.compute) continue;
  else { errors.push(`variable ${v.id}: unknown source`); continue; }
  applyFallback(v, out);
  for (const [iso, val] of Object.entries(overrides[v.id] ?? {})) if (ACTORS.has(iso)) out[iso] = { ...(out[iso] ?? {}), v0: val, year0: out[iso]?.year0 ?? 2025, source: 'override:data/overrides.yaml' };
  // capability defaults: missing key -> N
  if (v.id.startsWith('cap_')) for (const a of actors) out[a.id] ??= { v0: 'N', source: 'default:N' };
  const missing = actors.filter(a => out[a.id]?.v0 == null).map(a => a.id);
  if (missing.length && v.kind === 'series') warn.push(`${v.id}: no data for ${missing.join(' ')}`);
  compiledVars[v.id] = out;
}

// ---------------------------------------------------------------- assemble actors
const compiledActors = {};
for (const a of actors) {
  const vars = {};
  for (const [vid, byActor] of Object.entries(compiledVars)) if (byActor[a.id]) vars[vid] = byActor[a.id];
  const tech = {};
  for (const v of registry.variables) if (v.id.startsWith('cap_')) tech[v.id.slice(4)] = vars[v.id]?.v0 ?? 'N';
  compiledActors[a.id] = { id: a.id, name: a.name, region: a.region, regime: a.regime, nuclear: a.nuclear, tech, chokepoints: a.chokepoints ?? {}, notes: a.notes ?? '', vars };
}

// ---------------------------------------------------------------- validation
const varIds = new Set(registry.variables.map(v => v.id));
const hazardIds = new Set(hazards.map(h => h.id));
const terrIds = new Set(territories.map(t => t.id)), corrIds = new Set(corridors.map(c => c.id));
const latentIds = new Set((registry.latents ?? []).map(l => l.id));
function checkPath(p, ctx) {
  const [root, id, ...rest] = p.split('.');
  const ok =
    (root === 'actors' && ACTORS.has(id) && (rest.length === 0 || varIds.has(rest[0]) || ['regime', 'nuclear', 'tech'].includes(rest[0]))) ||
    (root === 'latent' && latentIds.has(id)) ||
    (root === 'world' && varIds.has(id)) ||
    (root === 'territories' && terrIds.has(id)) ||
    (root === 'corridors' && corrIds.has(id));
  if (!ok) errors.push(`${ctx}: unresolvable path ${p}`);
}
for (const h of hazards) {
  for (const c of h.covariates ?? []) checkPath(c.var, `hazard ${h.id}`);
  for (const [oc, f] of Object.entries(h.fires ?? {})) {
    if (!h.outcomes.includes(oc)) errors.push(`hazard ${h.id}: fires.${oc} not in outcomes`);
    for (const p of Object.keys(f.set ?? {})) checkPath(p, `hazard ${h.id}.fires.${oc}.set`);
    for (const p of Object.keys(f.add ?? {})) checkPath(p, `hazard ${h.id}.fires.${oc}.add`);
    for (const m of Object.keys(f.mult ?? {})) if (!hazardIds.has(m)) errors.push(`hazard ${h.id}: mult target ${m} unknown`);
  }
  h.p10 = 1 - Math.exp(-h.base_q * 40);
}
for (const t of territories) if (t.hazard && hazards.length && !hazardIds.has(t.hazard)) errors.push(`territory ${t.id}: hazard ${t.hazard} unknown`);
for (const c of corridors) if (c.hazard && hazards.length && !hazardIds.has(c.hazard)) errors.push(`corridor ${c.id}: hazard ${c.hazard} unknown`);
// referential integrity: every dated corridor/chokepoint/territory event must resolve to a record
for (const e of Y('history/events')) {
  if ((e.kind === 'corridor' || e.kind === 'chokepoint') && !corrIds.has(e.id)) errors.push(`events.yaml ${e.kind} ${e.id} @${e.year}: no record in data/corridors.yaml`);
  if (e.kind === 'territory' && !terrIds.has(e.id)) errors.push(`events.yaml territory ${e.id} @${e.year}: no record in data/territories.yaml`);
}
for (const c of corridors) if (!c.history?.length) errors.push(`corridor ${c.id}: no dated history (a 2026 snapshot alone cannot be read as-of a historical year)`);
for (const t of territories) if (!t.history?.length) errors.push(`territory ${t.id}: no dated history`);
const claimIds = new Set(claims.map(c => c.id));
for (const c of claims) {
  for (const m of c.query.matchAll(/fired\((\w+)/g)) if (!hazardIds.has(m[1])) errors.push(`claim ${c.id}: hazard ${m[1]} unknown`);
  for (const m of c.query.matchAll(/state0?\(([\w.]+)\)/g)) checkPath(m[1], `claim ${c.id}`);
  for (const d of [...(c.depends_on ?? []), ...(c.antagonists ?? [])]) if (!claimIds.has(d)) errors.push(`claim ${c.id}: ref ${d} unknown`);
}
// display-only variables (model: false) must not be read by any template covariate
{ const displayOnly = new Set(registry.variables.filter(v => v.model === false).map(v => v.id)); const tpl = parseYaml(readFileSync('data/templates.yaml', 'utf8')); for (const t of tpl.templates ?? []) for (const c of [...(t.covariates ?? []), ...(t.candidates ?? [])]) if (displayOnly.has(c.var)) errors.push(`template ${t.id} reads display-only variable ${c.var}`); }
if (existsSync('src/engine/equations.js')) {
  const eq = readFileSync('src/engine/equations.js', 'utf8');
  for (const v of registry.variables) if (v.equation && !new RegExp(`export function ${v.equation}\\b|${v.equation}\\s*[:(]`).test(eq)) warn.push(`equation ${v.equation} (for ${v.id}) not found in equations.js`);
}

// ---------------------------------------------------------------- write
mkdirSync('public', { recursive: true });
const world = {
  meta: { built: new Date().toISOString(), t0: '2026Q3', t0_year: T0_YEAR, steps: STEPS },
  registry: { groups: registry.groups, variables: registry.variables, latents: registry.latents ?? [] },
  actors: compiledActors, world: worldVars, territories, corridors, hazards, claims,
};
writeFileSync('public/world.json', JSON.stringify(world));
copyFileSync('data/geo/world.topo.json', 'public/geo.topo.json');

console.log(`actors ${actors.length}  variables ${Object.keys(compiledVars).length}  territories ${territories.length}  corridors ${corridors.length}  hazards ${hazards.length}  claims ${claims.length}`);
console.log(`world.json ${(JSON.stringify(world).length / 1024).toFixed(0)} KB`);
if (hazards.length) console.log('\nhazard baseline 10-yr cumulative P (no covariates, no multipliers):');
for (const h of hazards) console.log(`  ${h.id.padEnd(30)} base_q ${h.base_q.toFixed(4)}  ->  ${(h.p10 * 100).toFixed(0)}%`);
if (warn.length) console.log('\nwarnings:\n  ' + warn.join('\n  '));
if (errors.length) { console.error('\nERRORS:\n  ' + errors.join('\n  ')); process.exit(1); }
