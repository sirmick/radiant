<script>
  // Canvas map: one scene description, one renderer, two projections (2D Natural Earth, 3D orthographic).
  import * as d3 from 'd3';
  import { loadGeometry, buildOwnerGrid, makeProjection, unproject, visible } from './geo.js';
  import { drawScene } from './render.js';
  import { buildGrid, FIELDS, evaluateField } from './influence.js';
  import { valueAt, washed, statusAt, colorScale, flagEmoji, presenceAt, POWER_COLORS, STATUS_COLORS, REGIME_GLYPH, REGIME_COL4, REGIME_LABELS } from './data.js';
  import { viewNews } from './news.js';

  // `view` (src/lib/provider.js) is the only data source: the record, a forecast ensemble or one sample world of it,
  // whichever answers for the slider year. Nothing below asks which.
  let { world, geo, view, presence, variable, year, horizon = 10, layers, mode = '2d', selected, onSelect } = $props();

  let width = $state(800), height = $state(600);
  let canvasEl = $state(null), mapEl = $state(null);
  let hover = $state(null);
  let view2d = $state({ k: 1, x: 0, y: 0 });
  let rotate = $state([-20, -20]);
  let k3d = $state(1);
  const fieldCanvas = document.createElement('canvas');

  // ---- geometry (once)
  const geom = $derived(loadGeometry(geo));
  const owner = $derived(buildOwnerGrid(geom.countries, 0.5));
  const grid = $derived(buildGrid(geom.countries, 2));
  const projection = $derived(makeProjection(mode, width, height, mode === '3d' ? { k: k3d, rotate } : view2d));
  const zoomK = $derived(mode === '3d' ? k3d : view2d.k);
  const terrByNe = $derived.by(() => { const m = new Map(); for (const t of world.territories) for (const id of t.geometry?.ne_ids ?? []) if (!m.has(`ne-${id}`)) m.set(`ne-${id}`, t); return m; });

  // ---- year context
  const neKey = (id) => view.neKey(id);
  const lonlat = (id) => geom.centroid.get(neKey(id)) ?? null;
  const neToActor = $derived.by(() => { const m = new Map(); for (const id of view.liveIds) m.set(neKey(id), id); return m; });
  const actorOfNe = (neId) => neToActor.get(neId) ?? neId;
  const popAt = (id) => view.pop(id);
  const capOf = (id) => view.cap(id);
  const isGreat = (id) => view.great(id);
  const yearItems = $derived(viewNews(view).items);
  const isForecastYear = $derived(view.isForecast);
  const forecast = $derived(view.ensemble);
  const sampleOn = $derived(!!view.sample);
  // P(at war) and the internal-conflict weight: 0/1 in the record and in a sample world, a probability in an ensemble —
  // the outlines and the belligerents field carry the ensemble's uncertainty rather than a threshold nobody can see.
  const atWarP = (id) => view.atWarP(id);
  const atWar = (id) => atWarP(id) >= 0.5;
  const intrastateW = (id) => view.intrastateW(id);
  const intrastateOf = (id) => view.intrastateLevel(id);
  // a corridor / chokepoint / territory record's status, from whichever frame set answers, with the controller from the
  // record's dated history (control transfer is not simulated) and the modal probability carried so the paint can wash
  const recStatus = (rec) => { const st = view.recordStatus(rec.id); if (!st.exists) { const h = statusAt(rec, year); return h.exists && !view.isForecast ? h : st; } const h = statusAt(rec, view.isForecast ? (view.ensemble.meta.from - 1) : year); return { ...h, ...st, controller: h.controller, exists: true }; };
  const recColor = (st) => { const c = STATUS_COLORS[st.status] ?? '#8b94a3'; return st.forecast && !st.sample ? washed(c, st.p) : c; };

  // ---- fills
  const values = $derived.by(() => {
    const out = {}; if (!variable) return out;
    if (variable.kind === 'forecast') { for (const id of Object.keys(view.hazards?.actor ?? {})) out[neKey(id)] = forecastCell(id); return out; }
    if (variable.kind === 'history') return variable.industry ? view.industry() : view.cells(variable.var, { gradient: !!variable.gradient });
    for (const [id, a] of Object.entries(world.actors)) out[id] = valueAt(a.vars[variable.id], year);
    return out;
  });
  // odds mode paints a probability on a heat ramp instead of the variable's own palette
  const oddsOn = $derived(Object.values(values).some(c => c?.odds));
  const oddsScale = (() => { const sc = d3.scaleLinear().domain([0, 0.5, 1]).range(['#2b313b', '#e8734f', '#ffd166']).clamp(true); return { color: v => (Number.isFinite(v) ? sc(v) : null), kind: 'numeric', domain: [0, 1], log: false, ticks: [0, 0.5, 1], scale: sc }; })();
  const scale = $derived(oddsOn ? oddsScale : colorScale(variable, Object.values(values).map(v => v.value)));
  const fills = $derived.by(() => { const o = {}; for (const f of geom.countries) { const v = values[f.id]; if (v) { const c = washed(scale.color(v.value), v.conf); if (c) o[f.id] = c; } } return o; });
  // the forecast pseudo-variables: P(event within the horizon) from the ensemble's hazard curves, or the regime mean /
  // entropy; before the forecast starts, the record's state at the origin
  const forecastCell = (id) => {
    if (variable.template) { const v = view.hazard(id, variable.template, horizon); return { value: v ?? (view.isForecast ? null : 0), year, forecast: view.isForecast }; }
    if (!view.isForecast) return { value: variable.id === 'fc_regime_mean' ? view.regime0(id) : 0, year, forecast: false };
    const c = view.cell('regime', id); const d = c?.dist; if (!d) return { value: null };
    return { value: variable.id === 'fc_regime_mean' ? d.reduce((s, p, l) => s + p * l, 0) : -d.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0), year, forecast: true, dist: d };
  };
  const selectable = (id) => !!world.actors[id] || !!view.entity(id) || view.live(id);

  // ---- featured actors (labels / roses)
  const featured = $derived.by(() => {
    const ids = [];
    for (const id of view.liveIds) ids.push([id, popAt(id)]);
    ids.sort((a, b) => b[1] - a[1]);
    const n = zoomK >= 3 ? 200 : zoomK >= 1.8 ? 90 : 45;
    const set = new Set(ids.slice(0, n).map(x => x[0])); if (selected?.kind === 'actor') set.add(selected.id);
    return [...set];
  });

  // ---- alliances: the pact graph in force (frozen at the origin inside a forecast — docs/plan-structure.md C3).
  // A pair involving a great power is drawn to the stronger great power only when the member is allied to several, so
  // NATO reads hub-and-spoke rather than as a complete graph.
  const pactPairs = $derived(view.allied());
  const pactsOf = $derived.by(() => { const m = new Map(); for (const [a, b] of pactPairs) { (m.get(a) ?? m.set(a, []).get(a)).push(b); (m.get(b) ?? m.set(b, []).get(b)).push(a); } return m; });
  const allianceView = $derived.by(() => {
    const edges = []; const seen = new Set();
    for (const [a, b] of pactPairs) {
      const ga = isGreat(a), gb = isGreat(b);
      if (ga !== gb) { const member = ga ? b : a; const hubs = (pactsOf.get(member) ?? []).filter(isGreat); const hub = hubs.reduce((h, x) => (capOf(x) > capOf(h) ? x : h), hubs[0]); if (hub !== (ga ? a : b)) continue; }
      const k = a < b ? `${a}|${b}` : `${b}|${a}`; if (seen.has(k)) continue; seen.add(k);
      edges.push({ a, b, multilateral: (pactsOf.get(a)?.length ?? 0) > 3 && (pactsOf.get(b)?.length ?? 0) > 3 });
    }
    return { edges, pairs: pactPairs.length, carried: view.isForecast || year > (view.record.meta.to), from: view.isForecast ? view.ensemble.meta.from - 1 : Math.min(Math.round(year), view.record.meta.to) };
  });

  // ---- presence, powers, fields
  // military presence: the dated stations in the record; after the seam the frame set's patron-host pairs (C6) — a
  // station active at the origin is drawn while its pair is still present in at least half the runs, and a pair the
  // runs opened is drawn at the host as a simulated station
  const presenceNow = $derived.by(() => {
    if (!isForecastYear) return presenceAt(presence, year);
    const origin = view.ensemble.meta.from - 1; const pairs = new Map(view.presencePairs());
    const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const kept = presenceAt(presence, origin).filter(r => String(r.host).startsWith('sea:') || pairs.has(key(r.actor, r.host)));
    const shown = new Set(kept.map(r => key(r.actor, r.host)));
    const fresh = [];
    for (const [pk, p] of pairs) { if (shown.has(pk)) continue; const [a, b] = pk.split('|'); const patron = isGreat(a) && !isGreat(b) ? a : isGreat(b) && !isGreat(a) ? b : (capOf(a) >= capOf(b) ? a : b); const host = patron === a ? b : a; const ll = lonlat(host); if (!ll) continue; fresh.push({ actor: patron, host, kind: 'base', level: 1, from: null, name: `simulated station (${(p * 100).toFixed(0)}% of runs)`, geometry: ll, operator: false, simulated: true }); }
    return [...kept, ...fresh];
  });
  const powersNow = $derived.by(() => {
    const cands = Object.keys(POWER_COLORS).filter(id => view.live(id));
    return cands.filter(id => isGreat(id) || presenceNow.some(r => r.actor === id)).map(id => ({
      id, cap: capOf(id), polygonKey: neKey(id), centroid: lonlat(id),
      partners: (pactsOf.get(id) ?? []).map(m => ({ key: neKey(m), centroid: lonlat(m), w: (pactsOf.get(m)?.length ?? 0) <= 2 ? 0.6 : 0.35 })),
      stations: presenceNow.filter(r => r.actor === id).map(r => ({ lonlat: r.geometry, w: (r.kind === 'fleet' ? 0.3 : r.kind === 'advisors' ? 0.12 : 0.25) * r.level, lambda: r.kind === 'fleet' ? 1500 : 1000 })),
    }));
  });
  const fieldSpec = $derived(layers.field && FIELDS[layers.field] ? FIELDS[layers.field] : null);
  const fieldCtx = $derived.by(() => {
    if (!fieldSpec) return null;
    const live = view.liveIds;
    const ctx = { powers: powersNow, colors: POWER_COLORS, lonlat, neKey, atWar: live.map(id => [id, atWarP(id)]).filter(([, w]) => w > 0.05), intrastate: live.map(id => [id, intrastateW(id)]).filter(([, w]) => w > 0.05), disputes: [...new Set(yearItems.filter(it => it.k === 'dispute' && it.a).flatMap(it => it.a))], actorHazards: [], dyadHazards: [], routes: [], industry: [] };
    if (layers.field === 'industry') { const cells = variable?.industry ? values : view.industry(); const mx = Math.max(1e-9, ...Object.values(cells).map(c => c.value ?? 0)); for (const [key, c] of Object.entries(cells)) if (c.value > 0) ctx.industry.push({ key, lonlat: geom.centroid.get(key) ?? null, w: c.value / mx }); }
    if (layers.field === 'hazard' && forecast) {
      const tpls = forecast.meta.templates.filter(t => t.unit === 'actor-year' && !/leader_exit/.test(t.id));
      for (const id of Object.keys(view.hazards?.actor ?? {})) { let w = 0; for (const t of tpls) { const v = view.hazard(id, t.id, horizon); if (v != null) w = 1 - (1 - w) * (1 - v); } ctx.actorHazards.push({ key: neKey(id), lonlat: lonlat(id), w }); }
      // paint the excess over the typical actor, so the field shows where risk concentrates rather than that every state has some
      const ws = ctx.actorHazards.map(h => h.w).sort((p, q) => p - q); const med = ws[Math.floor(ws.length / 2)] ?? 0; ctx.actorHazards = ctx.actorHazards.map(h => ({ ...h, w: Math.max(0, h.w - med) / Math.max(0.05, 1 - med) })).filter(h => h.w > 0.03);
      const k = Math.max(0, Math.round(year) - forecast.meta.from);
      for (const [pair, d] of Object.entries(view.hazards?.dyad ?? {})) { const [a, b] = pair.split('|'); const A = lonlat(a), B = lonlat(b); if (!A || !B) continue; let w = 0; for (const v of Object.values(d)) { const c = v.curve; if (!c) continue; const before = k > 0 ? c[k - 1] ?? 0 : 0; const end = c[Math.min(c.length - 1, k - 1 + horizon)] ?? 0; const p = before >= 1 ? 0 : (end - before) / (1 - before); w = 1 - (1 - w) * (1 - p); } if (w < 0.05) continue; const mid = d3.geoInterpolate(A, B)(0.5); const dist = d3.geoDistance(A, B) * 6371; ctx.dyadHazards.push({ a: A, b: B, mid, w, lambda: Math.max(300, Math.min(1500, dist / 2.5)) }); }
      ctx.dyadHazards.sort((p, q) => q.w - p.w); ctx.dyadHazards.length = Math.min(ctx.dyadHazards.length, 150);   // the pairs that matter; the rest would only add cost
    }
    if (layers.field === 'routes') for (const c of world.corridors) { const st = recStatus(c); if (!st.exists || st.status === 'abandoned' || st.status === 'planned') continue; const w = Object.values(c.load_bearing_for ?? {}).reduce((s, x) => s + x, 0) * (st.status === 'building' ? 0.4 : 1); const contested = st.status === 'closed' || st.status === 'contested'; if (c.geometry.point) ctx.routes.push({ lonlat: c.geometry.point, w, lambda: 700, contested }); else if (c.geometry.line) for (const p of c.geometry.line) ctx.routes.push({ lonlat: p, w: w / Math.max(1, c.geometry.line.length / 2), lambda: 500, contested }); }
    return ctx;
  });
  const field = $derived(fieldSpec && grid && fieldCtx ? evaluateField(grid, fieldSpec, fieldCtx) : null);
  const fieldBlur = $derived.by(() => { if (!fieldSpec) return 0; if (layers.field !== 'hazard' || !forecast) return 7; const ahead = Math.max(0, Math.round(year) - forecast.meta.from); return Math.min(28, 5 + 0.5 * ahead + 0.4 * horizon); });

  // ---- vector marks (thin at world zoom; full on selection or zoom)
  const zoomedIn = $derived(zoomK >= 2.2);
  const arcs = $derived.by(() => {
    const out = []; const sel = selected?.kind === 'actor' ? selected.id : null;
    if (layers.alliances) for (const e of allianceView.edges) { const mine = sel && (e.a === sel || e.b === sel); if (layers.alliances === 'major' && !mine && !(isGreat(e.a) || isGreat(e.b))) continue; if (!mine && !zoomedIn && layers.alliances !== 'all' && !isGreat(e.a) && !isGreat(e.b)) continue; const p = lonlat(e.a), q = lonlat(e.b); if (!p || !q) continue; out.push({ coords: [p, q], color: e.multilateral ? '#8ab4e8' : '#6cb4ff', alpha: mine ? 0.95 : e.multilateral ? 0.22 : 0.45, width: mine ? 1.6 : e.multilateral ? 0.6 : 0.9, dash: e.multilateral ? [3, 2] : null }); }
    // after the seam the arcs are the frame set's dyadic war occupancy — P(this pair is at war in this year), 1 in a sample
    // world. The floor is 0.01, not 0.05: the engine spreads its war mass thinly over pairs, so a 5% floor would draw
    // nothing at all. Alpha is the probability itself and is deliberately not rescaled.
    // trade: the pairs whose weaker side sends >= 2% of its trade to the other; width by dependence. A forecast year
    // shows the as-of graph (trade is held, not simulated). The selected actor's links are always drawn, the rest above 8%.
    if (layers.trade) for (const [pk, d] of view.tradePairs(0.02)) { const [a, b] = pk.split('|'); const mine = sel && (a === sel || b === sel); if (!mine && d < 0.08) continue; const p = lonlat(a), q = lonlat(b); if (!p || !q) continue; out.push({ coords: [p, q], color: '#4fc27a', alpha: mine ? 0.9 : Math.min(0.7, 0.2 + 2 * d), width: 0.4 + 6 * d, dash: null }); }
    // holdings: holder -> territory (CShapes); solid = integral territory, dashed = a dependency; P(held) in a forecast
    if (layers.holdings) for (const h of view.holdings(0.05)) { const p = lonlat(h.holder), q = geom.centroid.get(h.territory) ?? null; if (!p || !q) continue; const mine = sel && (h.holder === sel || h.territory === sel); out.push({ coords: [p, q], color: h.colony ? '#c07ae0' : '#d9a441', alpha: (mine ? 0.95 : 0.55) * h.p, width: mine ? 1.4 : 0.8, dash: h.colony ? [3, 3] : null }); }
    if (layers.conflicts && isForecastYear) {
      const rows = view.dyadWar(0.01).map(([pair, p]) => { const [a, b] = pair.split('|'); return { p, coords: [lonlat(a), lonlat(b)] }; }).filter(r => r.coords[0] && r.coords[1]);
      rows.sort((x, z) => z.p - x.p);
      for (const r of rows.slice(0, 120)) out.push({ coords: r.coords, color: '#ef6a5a', alpha: sampleOn ? 0.85 : Math.min(0.9, 0.15 + 0.85 * r.p), width: sampleOn ? 1.4 : 0.4 + 1.5 * r.p, dash: null });
    }
    if (layers.conflicts) { const seen = new Set(); for (const it of yearItems) { if (!it.sides || it.sides.length < 2) continue; const hub = (side) => side.reduce((b, m) => (popAt(m) > popAt(b) ? m : b), side[0]); const a = hub(it.sides[0]), b = hub(it.sides[1]); const key = a < b ? `${a}|${b}` : `${b}|${a}`; if (seen.has(key)) continue; seen.add(key); const p = lonlat(a), q = lonlat(b); if (!p || !q) continue; out.push({ coords: [p, q], color: it.k === 'war' ? '#ef6a5a' : '#e8a04f', alpha: it.ongoing ? 0.45 : 0.85, width: it.k === 'war' ? 1.4 : 0.8, dash: it.ongoing ? [4, 3] : null }); } }
    return out;
  });
  // conflict outlines: the panel's flag in history, P(at war) / P(internal conflict) from the ensemble after the seam,
  // with the probability as saturation and as line weight so a 20%-likely war does not read like a war.
  const conflictStroke = $derived.by(() => {
    const o = {}; if (!layers.conflicts) return o;
    for (const f of geom.countries) {
      const id = actorOfNe(f.id);
      if (!isForecastYear) { if (atWar(id)) o[f.id] = { c: '#ef6a5a', w: 1.4 }; else { const it = intrastateOf(id); if (it > 0) o[f.id] = { c: '#e8a04f', w: it >= 2 ? 1.2 : 0.8, d: true }; } continue; }
      const pw = atWarP(id), pi = intrastateW(id);
      if (sampleOn) { if (pw >= 1) o[f.id] = { c: '#ef6a5a', w: 1.4 }; else if (pi > 0) o[f.id] = { c: '#e8a04f', w: pi >= 1 ? 1.2 : 0.8, d: true }; continue; }
      if (pw >= 0.05) o[f.id] = { c: washed('#ef6a5a', pw), w: 0.6 + 0.8 * pw };
      else if (pi >= 0.05) o[f.id] = { c: washed('#e8a04f', pi), w: 0.5 + 0.7 * pi, d: true };
    }
    return o;
  });
  const territoriesScene = $derived.by(() => { if (!layers.territories) return []; const out = []; for (const f of geom.disputed) { const t = terrByNe.get(f.id); if (!t) continue; const st = recStatus(t); if (!st.exists || st.status === 'settled') continue; out.push({ feature: f, color: recColor(st), selected: selected?.kind === 'territory' && selected.id === t.id, id: t.id }); } for (const t of world.territories) { if (t.geometry?.sketch) { const st = recStatus(t); if (!st.exists) continue; out.push({ feature: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...t.geometry.sketch, t.geometry.sketch[0]]] } }, color: recColor(st), sketch: true, selected: selected?.kind === 'territory' && selected.id === t.id, id: t.id }); } else if (t.geometry?.point && !t.geometry.ne_ids) { const st = recStatus(t); if (!st.exists || st.status === 'settled') continue; out.push({ point: t.geometry.point, color: recColor(st), id: t.id }); } } return out; });
  const corridorsScene = $derived.by(() => { if (!layers.corridors) return []; const out = []; for (const c of world.corridors) { const st = recStatus(c); if (!st.exists || st.status === 'abandoned') continue; const dash = st.status === 'planned' ? [2, 4] : st.status === 'building' ? [6, 3] : c.mode === 'cable' ? [1, 3] : []; out.push({ id: c.id, line: c.geometry.line, point: c.geometry.point, color: recColor(st), dash, mode: c.mode, selected: selected?.kind === 'corridor' && selected.id === c.id }); } return out; });
  const AXES_Q = [['regime', 'regime'], ['gdp_pc', 'GDP/cap'], ['cinc', 'capability'], ['info_access', 'info access'], ['urban_share', 'urban']];
  const AXES_I = [['irst', 'steel'], ['electricity_generation', 'electricity'], ['rd_gdp', 'R&D share'], ['manuf_va', 'manufacturing'], ['hitech_exports', 'high-tech exports']];
  const AXES = $derived(layers.glyphs === 'industry' ? AXES_I : AXES_Q);
  const ranks = $derived.by(() => { const out = {}; if (isForecastYear) return out; for (const [v] of AXES) { const vals = []; for (const id of view.liveIds) { const x = view.cell(v, id); if (x?.value != null && !x.stale) vals.push([id, x.value]); } vals.sort((p, q) => p[1] - q[1]); const n = vals.length; vals.forEach(([id, x], i) => { (out[id] ??= {})[v] = v === 'regime' ? x / 3 : n > 1 ? i / (n - 1) : 0.5; }); } return out; });
  const marks = $derived.by(() => {
    const out = [];
    if (layers.presence) for (const r of presenceNow) { if (!zoomedIn && r.level < 2 && !(selected?.kind === 'actor' && (r.actor === selected.id || r.host === selected.id))) continue; out.push({ lonlat: r.geometry, kind: r.kind, color: POWER_COLORS[r.actor] ?? '#8b94a3', size: r.kind === 'fleet' ? (r.level === 3 ? 26 : r.level === 2 ? 18 : 12) / Math.sqrt(zoomK) : (r.level === 3 ? 7 : r.level === 2 ? 5 : 3.5), emphasis: r.operator, title: `${r.actor} ${r.kind}: ${r.name}${r.from ? ` · since ${r.from}` : ''}` }); }
    if (layers.waves && waveNow) for (const [id, yr] of Object.entries(waveNow.sovereign_by ?? {})) { if (yr > Math.round(year)) continue; const ll = lonlat(id); if (!ll) continue; out.push({ lonlat: ll, kind: 'wave', size: 5, color: '#ffd166', dx: 9, dy: -9, recent: Math.round(year) - yr <= 5, title: `${view.name(id)}: sovereign in ${waveNow.label} since ${yr}${waveNow.sovereign_source?.[id] ? ` — ${waveNow.sovereign_source[id]}` : ''}` }); }
    if (layers.glyphs) for (const id of featured) { const ll = lonlat(id), q = ranks[id]; if (!ll || !q) continue; const r = 8; const pts = AXES.map(([v], i) => { const ang = -Math.PI / 2 + (i / AXES.length) * 2 * Math.PI; const rr = r * (0.15 + 0.85 * (q[v] ?? 0)); return [Math.cos(ang) * rr, Math.sin(ang) * rr]; }); out.push({ lonlat: ll, kind: 'rose', size: r, stroke: atWar(id) ? '#ef6a5a' : '#3a4250', strokeWidth: atWar(id) ? 1.4 : 0.5, pathD: 'M' + pts.map(p => p.join(',')).join('L') + 'Z' }); }
    return out;
  });
  // the newest capability wave that still discriminates: introduced by the year, not yet saturated (data/waves.yaml)
  const waveNow = $derived.by(() => { const y = Math.round(year); const c = (world.waves ?? []).filter(w => w.introduced <= y && (w.saturates == null || y < w.saturates)); c.sort((a, b) => b.introduced - a.introduced); return c[0] ?? null; });
  const wavesHeld = (id, y) => (world.waves ?? []).filter(w => w.sovereign_by?.[id] != null && w.sovereign_by[id] <= y).map(w => ({ label: w.label, year: w.sovereign_by[id] }));
  const labels = $derived.by(() => { if (!layers.labels) return []; const out = []; for (const id of featured) { const ll = lonlat(id); if (!ll) continue; const rg = view.regime(id); const pop = popAt(id); out.push({ lonlat: ll, flag: flagEmoji(view.entity(id)?.iso2), glyph: rg != null ? REGIME_GLYPH[rg] : null, glyphColor: rg != null ? REGIME_COL4[rg] : '#fff', size: 11, dy: layers.glyphs ? 16 : 0, popR: layers.field ? 0 : Math.min(26, 2 + Math.sqrt(Math.max(0, pop) / 1e6) * 1.4) / Math.sqrt(zoomK) }); } return out; });
  const selectedFeature = $derived(selected?.kind === 'actor' ? geom.countries.find(f => f.id === neKey(selected.id)) ?? null : null);

  // ---- draw (coalesced)
  let raf = 0;
  $effect(() => {
    const S = { mode, width, height, projection, k: zoomK, geom, fills, field: field ? { grid, dominant: field.dominant, alpha: field.alpha, colorOf: (p) => fieldSpec.color(fieldCtx, field.groups[p]), blur: fieldBlur } : null, fieldCanvas, territories: territoriesScene, corridors: corridorsScene, arcs, marks, labels, selectedFeature, conflictStroke };
    if (!canvasEl) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { const dpr = window.devicePixelRatio || 1; canvasEl.width = width * dpr; canvasEl.height = height * dpr; const ctx = canvasEl.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawScene(ctx, S); });
  });

  // ---- interaction: drag (pan 2D / rotate 3D), wheel zoom, hover, click
  let drag = null;
  const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, moved: false, v: { ...view2d }, r: [...rotate] }; };
  const onMove = (e) => {
    const r = mapEl.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag && (e.buttons & 1)) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true; if (mode === '3d') rotate = [drag.r[0] + dx * 0.35 / k3d, Math.max(-90, Math.min(90, drag.r[1] - dy * 0.35 / k3d))]; else view2d = { k: drag.v.k, x: drag.v.x + dx, y: drag.v.y + dy }; hover = null; return; }
    const ll = unproject(projection, [x, y]); const neId = ll ? owner.at(ll[0], ll[1]) : null;
    const pt = ll ? hitPoint(x, y) : null;
    hover = pt ?? (neId && selectable(actorOfNe(neId)) ? { neId, x, y } : null);
  };
  const hitPoint = (x, y) => { let best = null, bd = 9; const test = (lonlat, hit) => { if (!lonlat || !visible(mode, projection, lonlat)) return; const p = projection(lonlat); if (!p) return; const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = hit; } }; for (const c of corridorsScene) if (c.point) test(c.point, { corridor: c.id, x, y }); for (const t of territoriesScene) if (t.point) test(t.point, { territory: t.id, x, y }); for (const m of marks) if (m.title) test(m.lonlat, { mark: m.title, x, y }); return best; };
  const onUp = (e) => { if (drag && !drag.moved) { const r = mapEl.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const ll = unproject(projection, [x, y]); const neId = ll ? owner.at(ll[0], ll[1]) : null; const pt = hitPoint(x, y); if (pt?.corridor) onSelect({ kind: 'corridor', id: pt.corridor }); else if (pt?.territory) onSelect({ kind: 'territory', id: pt.territory }); else if (neId && selectable(actorOfNe(neId))) onSelect({ kind: 'actor', id: actorOfNe(neId) }); } drag = null; };
  const onWheel = (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015); if (mode === '3d') k3d = Math.max(0.6, Math.min(12, k3d * f)); else { const r = mapEl.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const nk = Math.max(1, Math.min(12, view2d.k * f)); const s = nk / view2d.k; view2d = { k: nk, x: mx - (mx - view2d.x) * s, y: my - (my - view2d.y) * s }; } };
  export function resetZoom() { view2d = { k: 1, x: 0, y: 0 }; k3d = 1; rotate = [-20, -20]; }
  let spinning = $state(false);
  $effect(() => { if (mode !== '3d' || !spinning) return; const t = setInterval(() => { rotate = [rotate[0] + 0.25, rotate[1]]; }, 40); return () => clearInterval(t); });

  // ---- hover card
  const hoverInfo = $derived.by(() => {
    if (!hover) return null;
    if (hover.mark) return { title: hover.mark };
    // operator/occupancy: past the seam the record's card carries the whole simulated status distribution, not a
    // single word — "open 71% · contested 22% · closed 7%" is the forecast; one word would hide the other 29%.
    const distNote = (st) => (st.forecast ? ` — ${st.entries.slice(0, 4).map(([w, p]) => `${w} ${(p * 100).toFixed(0)}%`).join(' · ')}` : ` — ${st.status}${st.controller ? ` (${st.controller})` : ''}`);
    if (hover.corridor) { const c = world.corridors.find(x => x.id === hover.corridor); const st = recStatus(c); return { title: `${c.name}${distNote(st)}` }; }
    if (hover.territory) { const t = world.territories.find(x => x.id === hover.territory); const st = recStatus(t); return { title: `${t.name}${distNote(st)}` }; }
    const id = actorOfNe(hover.neId); const ent = view.entity(id); const wa = world.actors[id];
    const name = wa?.name ?? ent?.name ?? geom.countries.find(f => f.id === hover.neId)?.properties.name ?? id;
    const rg = view.regime(id); const pop = popAt(id);
    const partners = pactsOf.get(id) ?? [];
    const pacts = partners.length ? [{ partners, greats: partners.filter(isGreat) }] : [];
    const items = yearItems.filter(it => it.a?.includes(id) && !it.ongoing).slice(0, 4);
    // the same three facts in every frame set: 0/1 in the record and a sample world, a probability in an ensemble
    const pw = atWarP(id), occ = view.cell('occupied', id), ic = view.cell('intrastate', id);
    const point = !isForecastYear || sampleOn;
    const conflicts = point
      ? [pw >= 0.5 ? 'at war' : null, intrastateOf(id) >= 2 ? 'civil war' : intrastateOf(id) > 0 ? 'internal armed conflict' : null].filter(Boolean)
      : [pw >= 0.02 ? `${(pw * 100).toFixed(0)}% at war` : null, ic?.dist && 1 - ic.dist[0] >= 0.02 ? `${((1 - ic.dist[0]) * 100).toFixed(0)}% internal armed conflict` : null, occ?.p >= 0.02 ? `${(occ.p * 100).toFixed(0)}% occupied (carried, not simulated)` : null].filter(Boolean);
    const hosted = presenceNow.filter(r => r.host === id).map(r => `${r.actor} ${r.kind}${r.level >= 3 ? ' (major)' : ''}`);
    // a value painted past its last observation says so: the record carries nothing forward itself
    const staleNote = ['cinc', 'regime', 'gdp_pc', 'population'].map(v => [v, view.cell(v, id)]).filter(([, c]) => (c?.carried || c?.stale > 1) && c.observed != null).map(([v, c]) => `${v} as of ${c.observed}`).join(' · ');
    let hz = null; if (isForecastYear && view.hazards?.actor?.[id]) { const tp = forecast.meta.templates.filter(t => t.unit === 'actor-year').map(t => [t.label ?? t.id, view.hazard(id, t.id, horizon)]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]).slice(0, 3); hz = tp.map(([l, v]) => `${(v * 100).toFixed(0)}% ${l}`).join(' · '); }
    const cell = values[hover.neId]; const rgNote = cell?.sample ? `in this world · ${(cell.agree * 100).toFixed(0)}% of runs agree` : cell?.odds ? `P(changed since ${forecast?.meta.from - 1}) ${(cell.value * 100).toFixed(0)}%` : cell?.dist ? `in ${(Math.max(...cell.dist) * 100).toFixed(0)}% of runs` : cell?.stale > 0 && variable?.var === 'regime' ? `as of ${cell.observed}` : '';
    const held = layers.waves ? wavesHeld(id, Math.round(year)) : []; const waveNote = held.length ? `${held.length} wave${held.length > 1 ? 's' : ''}: ${held.slice(-3).map(w => `${w.label} ${w.year}`).join(' · ')}` : '';
    const stateNote = cell?.state ? (cell.dist && variable?.display?.categorical
      ? `${variable.label}: ${cell.dist.map((p, i) => `${variable.display.categoricalLabels?.[i] ?? i} ${(p * 100).toFixed(0)}%`).filter((_, i) => cell.dist[i] >= 0.005).join(' · ')} over ${forecast?.meta.runs} runs`
      : `${variable.label}: ${d3.format(variable.display?.format ?? '.3~s')(cell.value)} median (${d3.format(variable.display?.format ?? '.3~s')(cell.lo)}–${d3.format(variable.display?.format ?? '.3~s')(cell.hi)})${cell.simulated === false ? ' · carried from the as-of year, not simulated' : ''}`) : null;
    const cellNote = stateNote ?? (cell && variable?.industry ? `${(cell.value * 100).toFixed(1)}% of world ${cell.series}${cell.stale > 0 ? ` (as of ${cell.observed})` : ''}` : cell && variable?.gradient ? (cell.mean ? `regime axis: ${cell.value.toFixed(2)} of 3, mean over runs` : cell.category ? `regime axis: category only (no polyarchy score${cell.stale > 0 ? `, as of ${cell.observed}` : ''})` : `polyarchy ${cell.poly.toFixed(2)} → ${cell.value.toFixed(2)} on the regime axis${cell.stale > 0 ? ` (as of ${cell.observed})` : ''}`) : cell && variable?.var !== 'regime' && variable?.kind === 'history' ? (cell.forecast ? `${variable.label}: ${d3.format(variable.display?.format ?? '.3~s')(cell.value)} median (${d3.format('.3~s')(cell.lo)}–${d3.format('.3~s')(cell.hi)})` : cell.stale > 0 ? `${variable.label}: ${d3.format(variable.display?.format ?? '.3~s')(cell.value)} as of ${cell.observed}` : '') : '');
    return { id, name, flag: flagEmoji(ent?.iso2), rg, rgNote, cellNote, waveNote, pop, pacts, items, conflicts, hosted, staleNote, hz, live: view.live(id) || (!ent && !!wa) };
  });
  const fmtPop = (n) => (n == null || !n ? '—' : n >= 1e9 ? (n / 1e9).toFixed(2) + ' bn' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' k' : String(Math.round(n)));

  // ---- legend
  const presentStatuses = $derived.by(() => { const t = new Set(), c = new Set(); for (const x of territoriesScene) { const r = world.territories.find(w => w.id === x.id); if (r) t.add(recStatus(r).status); } for (const x of corridorsScene) { const r = world.corridors.find(w => w.id === x.id); if (r) c.add(recStatus(r).status); } return { t: [...t], c: [...c] }; });
  const presenceCounts = $derived.by(() => { if (!layers.presence) return []; const m = {}; for (const r of presenceNow) m[r.actor] = (m[r.actor] ?? 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); });
  const modeNote = $derived(!isForecastYear ? '' : sampleOn ? `world ${view.run + 1} of ${view.ensemble.meta.paths?.n ?? '?'}: one run of the ensemble, painted flat like the record · hover for how many runs agree · ` : view.mode === 'sample' ? 'loading sample worlds… · ' : view.mode === 'odds' ? 'odds: the probability on a heat ramp · ' : 'consensus: the most likely state, held until another clears 55%, washed to grey by disagreement · ');
  const catLabel = (c, i) => variable?.display?.categoricalLabels?.[i] ?? c;
  // what the colour means at this year — one sentence per kind of frame set, never per file
  const legendNote = $derived.by(() => {
    if (!variable) return '';
    const recTo = view.record.meta.to, runs = forecast?.meta.runs;
    if (variable.kind === 'forecast') return isForecastYear ? `${variable.template ? `P(within the next ${horizon} y from ${Math.round(year)}, given not yet) · ` : ''}ensemble of ${runs} runs` : 'before the forecast start: last observed state';
    if (variable.kind !== 'history') return 'modern snapshot';
    if (!isForecastYear) return variable.industry ? `${Object.values(values).find(c => c.series)?.series ?? 'no series covers this year'} · share of the total over the states reporting that year, each carried up to 3 y`
      : variable.gradient ? 'V-Dem polyarchy placed on the category axis by the panel\'s category medians (estimate) · where only the category is known it is painted flat and washed'
      : `the record · ${view.record.meta.sources?.[variable.var] ?? ''} · a series that stopped early is carried forward and washes to grey`;
    if (variable.industry) return `${modeNote}after ${recTo}: the last reported shares held still (no industrial model yet) · ${Object.values(values).find(c => c.series)?.series ?? ''}`;
    if (variable.gradient) return `${modeNote}the ensemble mean on the same axis · colour washes to grey as the runs spread out`;
    if (sampleOn || oddsOn) return modeNote;
    const anyCell = Object.values(values).find(c => c);
    if (anyCell?.carried) return `${modeNote}not carried by the ensemble: the record's last observation, washed to grey with its age`;
    if (variable.var === 'regime') return `${modeNote}the most likely state in each of ${runs} runs · colour washes to grey where the runs disagree`;
    return `${modeNote}${variable.display?.categorical ? 'the modal state, washed by 1 − P' : 'the median with the p10–p90 band on the hover card'}${variable.forecast === 'frozen' ? ' · carried from the as-of year, not simulated' : ''}`;
  });
</script>

<div class="map" bind:this={mapEl} bind:clientWidth={width} bind:clientHeight={height} role="application"
  onmousedown={onDown} onmousemove={onMove} onmouseup={onUp} onmouseleave={() => { hover = null; drag = null; }} onwheel={onWheel}>
  <canvas bind:this={canvasEl} style="width:{width}px;height:{height}px"></canvas>

  <div class="ctl">
    <button onclick={resetZoom} title="reset view">⤢</button>
    {#if mode === '3d'}<button class:on={spinning} onclick={() => spinning = !spinning} title="auto-rotate">↻</button>{/if}
  </div>

  {#if hoverInfo}
    <div class="card" style="left:{Math.min(hover.x + 14, width - 300)}px; top:{Math.min(hover.y + 14, height - 200)}px">
      {#if hoverInfo.title}<div class="ch">{hoverInfo.title}</div>{:else}
        <div class="ch">{hoverInfo.flag ?? ''} <b>{hoverInfo.name}</b> <span class="mono muted">{hoverInfo.id}</span>{#if !hoverInfo.live}<span class="muted"> · not a state in {Math.round(year)}</span>{/if}</div>
        <div class="cr">{#if hoverInfo.rg != null}<span style="color:{REGIME_COL4[hoverInfo.rg]}">{REGIME_GLYPH[hoverInfo.rg]} {REGIME_LABELS[hoverInfo.rg]}</span>{#if hoverInfo.rgNote}&nbsp;<span class="muted">{hoverInfo.rgNote}</span>{/if}{/if} · pop {fmtPop(hoverInfo.pop)}</div>
        {#if hoverInfo.cellNote}<div class="cr muted">{hoverInfo.cellNote}</div>{/if}
        {#if hoverInfo.waveNote}<div class="cr" style="color:#ffd166">{hoverInfo.waveNote}</div>{/if}
        {#if hoverInfo.conflicts.length}<div class="cr" style="color:#ef6a5a">{hoverInfo.conflicts.join(' · ')}</div>{/if}
        {#if hoverInfo.pacts.length}<div class="cr muted">pacts: {#each hoverInfo.pacts.slice(0, 4) as p, i}{i ? '; ' : ''}{#if p.greats.length}<span style="color:#6cb4ff">with {p.greats.join(', ')}</span>{#if p.partners.length > p.greats.length} +{p.partners.length - p.greats.length}{/if}{:else}{p.partners.length <= 2 ? p.partners.join(', ') : p.partners.length + ' partners'}{/if}{/each}</div>{/if}
        {#if hoverInfo.hosted.length}<div class="cr" style="color:#ffd166">foreign forces: {hoverInfo.hosted.join(' · ')}</div>{/if}
        {#if hoverInfo.hz}<div class="cr" style="color:#ff7a45">next {horizon} y: {hoverInfo.hz}</div>{/if}
        {#if hoverInfo.staleNote}<div class="cr muted">stale: {hoverInfo.staleNote}</div>{/if}
        {#if hoverInfo.items.length}<div class="cr ev">{Math.round(year)}: {hoverInfo.items.map(it => it.t.replace(/^[^:]+: /, '')).join(' · ')}</div>{/if}
      {/if}
    </div>
  {/if}

  <div class="legend">
    {#if variable}
      <div class="lt">{variable.label}{oddsOn ? (variable.var === 'regime' ? ' · P(regime changed since the seam)' : ' · P(this state)') : variable.unit ? ` · ${variable.unit}` : ''}</div>
      {#if scale.kind === 'categorical'}{#each scale.domain as c, i}<span class="sw"><i style="background:{scale.swatch(c)}"></i>{catLabel(c, i)}</span>{/each}
      {:else if scale.kind === 'numeric'}
        <div class="bar" style="background: linear-gradient(90deg, {d3.range(0, 1.01, 0.1).map(t => scale.scale(scale.log ? Math.exp(Math.log(scale.domain[0]) + t * (Math.log(scale.domain[1]) - Math.log(scale.domain[0]))) : scale.domain[0] + t * (scale.domain[1] - scale.domain[0]))).join(',')})"></div>
        <div class="ticks"><span>{d3.format('.3~s')(scale.domain[0])}</span><span>{d3.format('.3~s')(scale.domain[1])}</span></div>
      {/if}
      <div class="muted small">{legendNote}</div>
    {/if}
    {#if fieldSpec}<div class="lt" style="margin-top:6px">{fieldSpec.label} <span class="muted">{fieldSpec.note}{layers.field === 'hazard' ? ` · blur ${fieldBlur.toFixed(0)} px` : ''}</span></div>
      {#if fieldSpec.paint === 'dominant'}{#each field?.groups ?? [] as g}<span class="sw"><i style="background:{fieldSpec.color(fieldCtx, g)}"></i>{g}</span>{/each}{:else}<span class="sw"><i style="background:{fieldSpec.color(fieldCtx)}"></i>intensity</span>{/if}{/if}
    {#if presentStatuses.t.length}<div class="lt" style="margin-top:6px">Territories <span class="muted">hatched · ◇ point</span></div>{#each presentStatuses.t as s}<span class="sw"><i style="background:{STATUS_COLORS[s] ?? '#8b94a3'}"></i>{s.replace('_', ' ')}</span>{/each}{/if}
    {#if presentStatuses.c.length}<div class="lt" style="margin-top:6px">Corridors <span class="muted">line · ○ chokepoint · ┄ cable</span></div>{#each presentStatuses.c as s}<span class="sw"><i style="background:{STATUS_COLORS[s] ?? '#8b94a3'}"></i>{s}</span>{/each}{/if}
    {#if layers.conflicts}<div class="lt" style="margin-top:6px">Conflicts <span class="muted">red outline at war · orange dashed internal · arcs join principal belligerents{isForecastYear ? ` · after ${forecast.meta.from - 1}: the ensemble's occupancy — outline and arc saturation are P(at war in this year) over ${forecast?.meta.runs} runs, not a record` : ''}</span></div>{/if}
    {#if presenceCounts.length}<div class="lt" style="margin-top:6px">Military presence <span class="muted">■ base · ◆ garrison · ⚓ fleet · • advisors{zoomedIn ? '' : ' · minor stations at zoom'}</span></div>{#each presenceCounts as [p, n]}<span class="sw"><i style="background:{POWER_COLORS[p] ?? '#8b94a3'}"></i>{p} {n}</span>{/each}{/if}
    {#if layers.trade}<div class="lt" style="margin-top:6px">Trade <span class="muted">green: the weaker side sends ≥ 8% of its trade to the other (≥ 2% for the selected state) · width by dependence{isForecastYear ? ` · held at ${forecast.meta.from - 1}: trade is not simulated` : ''} · CoW dyadic trade, to 2009</span></div>{/if}
    {#if layers.holdings}<div class="lt" style="margin-top:6px">Holdings <span class="muted">gold: integral territory · violet dashed: a dependency (colony, protectorate, mandate, occupation){isForecastYear ? ' · fades with P(still held)' : ''} · CShapes 2.0</span></div>{/if}
    {#if layers.alliances}<div class="lt" style="margin-top:6px">Alliances{layers.alliances === 'major' ? ' (great-power pacts)' : ''} <span class="muted">{allianceView.pairs} pact pairs{isForecastYear ? (sampleOn ? ' · the ensemble\'s pairs at P ≥ 0.5 (a sample world does not carry its own graph)' : ' · the simulated graph: pairs allied in at least half the runs') : year > view.record.meta.to ? ` · the graph as of ${view.record.meta.to}` : ''}</span></div>{/if}
    {#if layers.labels}<div class="lt" style="margin-top:6px">Regime</div>{#each REGIME_LABELS as l, i}<span class="sw" style="color:{REGIME_COL4[i]}"><b>{REGIME_GLYPH[i]}</b> <span style="color:var(--fg)">{l}</span></span>{/each}{/if}
    {#if layers.glyphs}<div class="lt" style="margin-top:6px">{layers.glyphs === 'industry' ? 'Industrial qualities' : 'Qualities'} <span class="muted">percentile that year, clockwise from top: {AXES.map(a => a[1]).join(' · ')}</span></div>{/if}
    {#if layers.waves && waveNow}<div class="lt" style="margin-top:6px">Capability wave <span class="muted">⬢ sovereign producers of <b>{waveNow.label}</b> (introduced {waveNow.introduced}{waveNow.saturates ? `, saturates ${waveNow.saturates}` : ''}) · {Object.values(waveNow.sovereign_by ?? {}).filter(y => y <= Math.round(year)).length} by {Math.round(year)} · bright = last 5 y</span></div>{/if}
  </div>
</div>

<style>
  .map { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0b0e13; cursor: grab; user-select: none; }
  canvas { display: block; }
  .ctl { position: absolute; right: 10px; top: 10px; display: flex; gap: 4px; }
  .card { position: absolute; pointer-events: none; background: rgba(15,17,21,0.94); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; max-width: 300px; font-size: 11.5px; z-index: 5; }
  .card .ch { font-size: 13px; margin-bottom: 2px; } .card .cr { margin-top: 2px; } .card .ev { color: var(--fg); border-top: 1px solid var(--line); margin-top: 4px; padding-top: 4px; }
  .legend { position: absolute; left: 10px; bottom: 10px; background: rgba(15,17,21,0.85); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; max-width: 340px; font-size: 11px; max-height: 60%; overflow: auto; }
  .lt { font-weight: 600; margin-bottom: 4px; } .lt .muted { font-weight: 400; }
  .bar { height: 8px; border-radius: 2px; } .ticks { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--fg2); }
  .sw { display: inline-flex; align-items: center; gap: 4px; margin: 1px 8px 1px 0; } .sw i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .small { font-size: 10px; margin-top: 3px; }
</style>
