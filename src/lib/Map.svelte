<script>
  import * as d3 from 'd3';
  import * as topojson from 'topojson-client';
  import { valueAt, forecastAt, historyAt, statusAt, colorScale, alliancesAt, regimeAt, flagEmoji, STATUS_COLORS, REGIME_GLYPH, REGIME_COL4, REGIME_LABELS } from './data.js';

  let { world, geo, forecast, history, alliances, news, variable, year, layers, selected, onSelect } = $props();
  let hover = $state(null); let mapEl = $state(null);

  let width = $state(800), height = $state(600);
  let gEl = $state(null), svgEl = $state(null);
  let transform = $state(d3.zoomIdentity);

  // d3-geo wants clockwise exterior rings; GIS data and hand sketches are often the reverse, which renders as the whole sphere.
  const rewind = (f) => {
    const g = f.geometry; if (!g) return f;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
    if (!polys) return f;
    for (const rings of polys) rings.forEach((ring, i) => {
      const area = d3.geoArea({ type: 'Polygon', coordinates: [ring] });
      if ((i === 0) === (area > 2 * Math.PI)) ring.reverse();
    });
    return f;
  };
  const countries = $derived(topojson.feature(geo, geo.objects.countries).features.map(rewind));
  const disputed = $derived(topojson.feature(geo, geo.objects.disputed).features.map(rewind));
  const borders = $derived(topojson.mesh(geo, geo.objects.countries, (a, b) => a !== b));

  const projection = $derived(d3.geoNaturalEarth1().fitExtent([[8, 8], [width - 8, height - 8]], { type: 'Sphere' }));
  const path = $derived(d3.geoPath(projection));

  // NE disputed feature -> territory (first wins)
  const terrByNe = $derived.by(() => {
    const m = new Map();
    for (const t of world.territories) for (const id of t.geometry?.ne_ids ?? []) if (!m.has(`ne-${id}`)) m.set(`ne-${id}`, t);
    return m;
  });
  const sketches = $derived(world.territories.filter(t => t.geometry?.sketch).map(t => ({ t, feature: rewind({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...t.geometry.sketch, t.geometry.sketch[0]]] } }) })));

  // actor values at year -> colour
  const values = $derived.by(() => {
    const out = {};
    if (!variable) return out;
    if (variable.kind === 'forecast') { for (const id of Object.keys(forecast?.actors ?? {})) out[id] = forecastAt(forecast, variable, id, year); return out; }
    if (variable.kind === 'history') return historyAt(history, variable, year);
    for (const [id, a] of Object.entries(world.actors)) out[id] = valueAt(a.vars[variable.id], year);
    return out;
  });
  const selectable = (id) => !!world.actors[id] || !!forecast?.actors?.[id] || !!history?.actors?.[id];

  // ---- per-actor geometry: NE polygon centroid (lon/lat), keyed by NE id; historical entities resolve to a successor polygon
  const centroidByNe = $derived.by(() => { const m = new Map(); for (const f of countries) { try { m.set(f.id, d3.geoCentroid(f)); } catch { } } return m; });
  const yi = $derived(history ? Math.round(year) - history.meta.y0 : -1);
  const liveNow = $derived.by(() => { const s = new Set(); if (!history || yi < 0) return s; for (const [id, a] of Object.entries(history.actors)) if (a.live[yi]) s.add(id); return s; });
  const neKey = (id) => { const a = history?.actors?.[id]; if (!a) return id; if (a.map_to && !liveNow.has(a.map_to)) return a.map_to; return id; };
  const lonlat = (id) => centroidByNe.get(neKey(id)) ?? null;

  // ---- which actors get labels / glyphs: the selected one, plus the largest by population at the year (or by forecast presence)
  const featured = $derived.by(() => {
    const ids = [];
    if (history && yi >= 0 && yi <= history.meta.y1 - history.meta.y0) {
      for (const [id, a] of Object.entries(history.actors)) if (a.live[yi]) ids.push([id, a.population?.[yi] ?? 0]);
    } else if (forecast) for (const id of Object.keys(forecast.actors)) ids.push([id, history?.actors?.[id]?.population?.at(-1) ?? 0]);
    ids.sort((a, b) => b[1] - a[1]);
    const n = transform.k >= 3 ? 200 : transform.k >= 1.8 ? 90 : 45;
    const set = new Set(ids.slice(0, n).map(x => x[0])); if (selected?.kind === 'actor') set.add(selected.id);
    return [...set];
  });
  const regimeOf = (id) => regimeAt(history, forecast, id, year);
  const flagOf = (id) => { const a = history?.actors?.[id]; return flagEmoji(a?.iso2 ?? (id.length === 3 ? null : null)); };

  // ---- qualities glyph: percentile ranks among live actors at the year, five axes
  const AXES = [['regime', 'regime'], ['gdp_pc', 'GDP/cap'], ['cinc', 'capability'], ['info_access', 'info access'], ['urban_share', 'urban']];
  const ranks = $derived.by(() => {
    const out = {}; if (!history || yi < 0 || yi > history.meta.y1 - history.meta.y0) return out;
    for (const [v] of AXES) {
      const vals = []; for (const [id, a] of Object.entries(history.actors)) { const x = a[v]?.[yi]; if (a.live[yi] && x != null) vals.push([id, x]); }
      vals.sort((p, q) => p[1] - q[1]); const n = vals.length;
      vals.forEach(([id, x], i) => { (out[id] ??= {})[v] = v === 'regime' ? x / 3 : n > 1 ? i / (n - 1) : 0.5; });
    }
    return out;
  });
  const glyphPath = (id, r) => { const q = ranks[id]; if (!q) return null; const pts = AXES.map(([v], i) => { const ang = -Math.PI / 2 + (i / AXES.length) * 2 * Math.PI; const rr = r * (0.15 + 0.85 * (q[v] ?? 0)); return [Math.cos(ang) * rr, Math.sin(ang) * rr]; }); return 'M' + pts.map(p => p.join(',')).join('L') + 'Z'; };
  const atWar = (id) => { const a = history?.actors?.[id]; return a && yi >= 0 ? (a.at_war?.[yi] ?? 0) > 0 : false; };

  // ---- alliance edges at the year (great-circle arcs between centroids)
  const lastNonNull = (arr, upto) => { if (!arr) return null; for (let i = Math.min(arr.length - 1, upto ?? arr.length - 1); i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
  const popAt = (id) => { const a = history?.actors?.[id]; if (!a) return 0; return (yi >= 0 ? lastNonNull(a.population, yi) : lastNonNull(a.population)) ?? 0; };
  const isGreat = (id) => { const a = history?.actors?.[id]; return a && yi >= 0 ? (a.great_power?.[yi] ?? 0) > 0 : false; };
  const allianceView = $derived(alliancesAt(alliances, year, (members) => { const gp = members.filter(isGreat); const pool = gp.length ? gp : members; return pool.reduce((best, m) => (popAt(m) > popAt(best) ? m : best), pool[0]); }));
  // pact membership per actor (for the hover card)
  const pactsOf = $derived.by(() => { const m = new Map(); if (!alliances) return m; const yy = Math.min(Math.round(year), alliances.meta.coverage[1]); for (const [pid, members] of Object.entries(alliances.years[yy] ?? {})) for (const x of members) (m.get(x) ?? m.set(x, []).get(x)).push({ pid, members }); return m; });
  const allianceArcs = $derived.by(() => {
    const out = []; const sel = selected?.kind === 'actor' ? selected.id : null;
    for (const e of allianceView.edges) {
      const mine = sel && (e.a === sel || e.b === sel);
      if (layers.alliances === 'major' && !mine && !(isGreat(e.a) || isGreat(e.b))) continue;
      const p = lonlat(e.a), q = lonlat(e.b); if (!p || !q) continue; out.push({ ...e, d: path({ type: 'LineString', coordinates: [p, q] }) });
    }
    return out;
  });
  // ---- conflicts: NE id -> actor id at the year; war arcs between the principal belligerents of each war/dispute this year
  const neToActor = $derived.by(() => { const m = new Map(); if (!history || yi < 0) return m; for (const id of liveNow) m.set(neKey(id), id); return m; });
  const actorOfNe = (neId) => neToActor.get(neId) ?? neId;
  const intrastateOf = (id) => { const a = history?.actors?.[id]; return a && yi >= 0 ? (a.intrastate?.[yi] ?? 0) : 0; };
  const conflictStroke = (neId) => { const id = actorOfNe(neId); if (!layers.conflicts) return null; if (atWar(id)) return { c: '#ef6a5a', w: 1.4, d: null }; const it = intrastateOf(id); if (it > 0) return { c: '#e8a04f', w: it >= 2 ? 1.2 : 0.8, d: '2 2' }; return null; };
  const yearItems = $derived(news?.years?.[Math.round(year)] ?? []);
  const warArcs = $derived.by(() => {
    if (!layers.conflicts) return []; const out = []; const seen = new Set();
    for (const it of yearItems) {
      if (!it.sides || it.sides.length < 2) continue;
      const hub = (side) => side.reduce((b, m) => (popAt(m) > popAt(b) ? m : b), side[0]);
      const a = hub(it.sides[0]), b = hub(it.sides[1]); const k = a < b ? `${a}|${b}` : `${b}|${a}`; if (seen.has(k)) continue; seen.add(k);
      const p = lonlat(a), q = lonlat(b); if (!p || !q) continue;
      out.push({ a, b, war: it.k === 'war', ongoing: !!it.ongoing, t: it.t, d: path({ type: 'LineString', coordinates: [p, q] }) });
    }
    return out;
  });
  // ---- hover card
  const hoverInfo = $derived.by(() => {
    if (!hover) return null; const id = actorOfNe(hover.id); const ha = history?.actors?.[id]; const wa = world.actors[id];
    const name = wa?.name ?? ha?.name ?? countries.find(f => f.id === hover.id)?.properties.name ?? id;
    const rg = regimeAt(history, forecast, id, year); const lastPop = (arr) => { if (!arr) return null; for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
    const pop = ha && yi >= 0 && yi <= history.meta.y1 - history.meta.y0 ? (ha.population?.[yi] ?? lastPop(ha.population?.slice(0, yi + 1))) : lastPop(ha?.population);
    const pacts = (pactsOf.get(id) ?? []).map(p => ({ pid: p.pid, partners: p.members.filter(m => m !== id), greats: p.members.filter(m => m !== id && isGreat(m)) }));
    const items = yearItems.filter(it => it.a?.includes(id) && !it.ongoing).slice(0, 4);
    const conflicts = [atWar(id) ? 'at war' : null, intrastateOf(id) >= 2 ? 'civil war' : intrastateOf(id) > 0 ? 'internal armed conflict' : null].filter(Boolean);
    return { id, name, flag: flagEmoji(ha?.iso2), rg, pop, pacts, items, conflicts, live: ha ? (yi >= 0 && yi <= history.meta.y1 - history.meta.y0 ? !!ha.live[yi] : true) : !!wa };
  });
  const fmtPop = (n) => (n == null ? '—' : n >= 1e9 ? (n / 1e9).toFixed(2) + ' bn' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' k' : String(Math.round(n)));
  const popR = (id) => { const p = popAt(id); return Math.min(26, 2 + Math.sqrt(Math.max(0, p) / 1e6) * 1.4); };
  export function resetZoom() { if (svgEl) d3.select(svgEl).transition().duration(300).call(d3.zoom().transform, d3.zoomIdentity); transform = d3.zoomIdentity; }

  // ---- legend: only what is on the map right now
  const presentStatuses = $derived.by(() => {
    const t = new Set(), c = new Set();
    if (layers.territories) for (const x of world.territories) { const st = statusAt(x, year); if (st.exists && st.status !== 'settled') t.add(st.status); }
    if (layers.corridors) for (const x of world.corridors) { const st = statusAt(x, year); if (st.exists && st.status !== 'abandoned') c.add(st.status); }
    return { t: [...t], c: [...c] };
  });
  const catLabel = (c, i) => variable?.display?.categoricalLabels?.[i] ?? c;
  const terrState = (t) => statusAt(t, year);
  const corrState = (c) => statusAt(c, year);
  const pointTerritories = $derived(world.territories.filter(t => t.geometry?.point && !t.geometry.ne_ids && !t.geometry.sketch));
  const scale = $derived(colorScale(variable, Object.values(values).map(v => v.value)));
  const fillFor = (id) => {
    const v = values[id]; if (!v) return '#1c2129';
    const c = scale.color(v.value);
    return c ?? '#242a34';
  };

  const corridorPath = (c) => c.geometry.line ? path({ type: 'LineString', coordinates: c.geometry.line }) : null;
  const pointXY = (c) => projection(c.geometry.point);

  $effect(() => {
    if (!svgEl) return;
    const zoom = d3.zoom().scaleExtent([1, 12]).on('zoom', (e) => { transform = e.transform; });
    d3.select(svgEl).call(zoom);
    return () => d3.select(svgEl).on('.zoom', null);
  });

  const isSel = (kind, id) => selected?.kind === kind && selected?.id === id;
</script>

<div class="map" bind:this={mapEl} bind:clientWidth={width} bind:clientHeight={height}>
  <svg bind:this={svgEl} {width} {height}>
    <defs>
      {#each Object.entries(STATUS_COLORS) as [s, c]}
        <pattern id="hatch-{s}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={c} fill-opacity="0.18" />
          <line x1="0" y1="0" x2="0" y2="5" stroke={c} stroke-width="1.4" stroke-opacity="0.9" />
        </pattern>
      {/each}
    </defs>
    <rect {width} {height} fill="#0b0e13" />
    <g bind:this={gEl} transform={transform.toString()}>
      <path d={path({ type: 'Sphere' })} fill="#0e131b" stroke="#2a303a" stroke-width={0.6 / transform.k} />
      <path d={path(d3.geoGraticule10())} fill="none" stroke="#1a2029" stroke-width={0.4 / transform.k} />

      <!-- countries -->
      {#each countries as f (f.id)}
        <path
          d={path(f)}
          fill={fillFor(f.id)}
          stroke={isSel('actor', f.id) ? '#fff' : (conflictStroke(f.id)?.c ?? 'none')}
          stroke-width={(isSel('actor', f.id) ? 1.5 : (conflictStroke(f.id)?.w ?? 0)) / transform.k}
          stroke-dasharray={isSel('actor', f.id) ? null : conflictStroke(f.id)?.d}
          class:actor={selectable(f.id)}
          onclick={() => selectable(f.id) && onSelect({ kind: 'actor', id: f.id })}
          onmousemove={(e) => { if (selectable(f.id)) { const r = mapEl.getBoundingClientRect(); hover = { id: f.id, x: e.clientX - r.left, y: e.clientY - r.top }; } }}
          onmouseleave={() => { hover = null; }}
          role="button" tabindex="-1"
        ><title>{f.properties.name}</title></path>
      {/each}
      <path d={path(borders)} fill="none" stroke="#0b0e13" stroke-width={0.5 / transform.k} pointer-events="none" />

      <!-- territories: NE polygons -->
      {#if layers.territories}
        {#each disputed as f (f.id)}
          {@const t = terrByNe.get(f.id)}
          {@const st = t ? terrState(t) : null}
          {#if t && st.exists}
            <path d={path(f)} fill="url(#hatch-{st.status})" stroke={STATUS_COLORS[st.status] ?? '#8b94a3'} stroke-width={(isSel('territory', t.id) ? 1.8 : 0.7) / transform.k}
              onclick={() => onSelect({ kind: 'territory', id: t.id })} role="button" tabindex="-1"><title>{t.name} — {st.status}{st.controller ? ` (${st.controller})` : ''}</title></path>
          {/if}
        {/each}
        {#each sketches as { t, feature } (t.id)}
          {@const st = terrState(t)}
          {#if st.exists}
            <path d={path(feature)} fill="url(#hatch-{st.status})" stroke={STATUS_COLORS[st.status] ?? '#8b94a3'} stroke-dasharray="3 2" stroke-width={(isSel('territory', t.id) ? 1.8 : 0.8) / transform.k}
              onclick={() => onSelect({ kind: 'territory', id: t.id })} role="button" tabindex="-1"><title>{t.name} (sketch) — {st.status}</title></path>
          {/if}
        {/each}
        {#each pointTerritories as t (t.id)}
          {@const st = terrState(t)}
          {#if st.exists && st.status !== 'settled'}
            {@const [x, y] = projection(t.geometry.point)}
            <rect x={x - 4 / transform.k} y={y - 4 / transform.k} width={8 / transform.k} height={8 / transform.k} transform="rotate(45 {x} {y})" fill={STATUS_COLORS[st.status] ?? '#8b94a3'} fill-opacity="0.6" stroke={STATUS_COLORS[st.status] ?? '#8b94a3'} stroke-width={1 / transform.k}
              onclick={() => onSelect({ kind: 'territory', id: t.id })} role="button" tabindex="-1"><title>{t.name} — {st.status}{st.controller ? ` (${st.controller})` : ''}</title></rect>
          {/if}
        {/each}
      {/if}

      <!-- corridors and chokepoints -->
      {#if layers.corridors}
        {#each world.corridors as c (c.id)}
          {@const st = corrState(c)}
          {#if st.exists && st.status !== 'abandoned'}
            {@const col = STATUS_COLORS[st.status] ?? '#8b94a3'}
            {#if c.geometry.line}
              <path d={corridorPath(c)} fill="none" stroke={col} stroke-linecap="round"
                stroke-width={(isSel('corridor', c.id) ? 3 : c.mode === 'cable' ? 0.9 : 1.6) / transform.k}
                stroke-dasharray={st.status === 'planned' ? '2 4' : st.status === 'building' ? '6 3' : c.mode === 'cable' ? '1 3' : null}
                onclick={() => onSelect({ kind: 'corridor', id: c.id })} role="button" tabindex="-1"><title>{c.name} — {st.status}{st.controller ? ` (${st.controller})` : ''}</title></path>
            {:else if c.geometry.point}
              {@const [x, y] = pointXY(c)}
              <circle cx={x} cy={y} r={(isSel('corridor', c.id) ? 7 : 5) / transform.k} fill={col} fill-opacity="0.35" stroke={col} stroke-width={1.2 / transform.k}
                onclick={() => onSelect({ kind: 'corridor', id: c.id })} role="button" tabindex="-1"><title>{c.name} — {st.status}{st.controller ? ` (${st.controller})` : ''}</title></circle>
            {/if}
          {/if}
        {/each}
      {/if}
      <!-- alliances: defence pacts as great-circle arcs -->
      {#if layers.alliances}
        {#each allianceArcs as e (e.a + e.b)}
          {@const hot = selected?.kind === 'actor' && (e.a === selected.id || e.b === selected.id)}
          <path d={e.d} fill="none" stroke={e.multilateral ? '#8ab4e8' : '#6cb4ff'} stroke-opacity={hot ? 0.95 : e.multilateral ? 0.22 : 0.45} stroke-width={(hot ? 1.6 : e.multilateral ? 0.6 : 0.9) / transform.k} stroke-dasharray={e.multilateral ? '3 2' : null} pointer-events="none" />
        {/each}
      {/if}

      <!-- conflicts: belligerent arcs -->
      {#if layers.conflicts}
        {#each warArcs as e (e.a + e.b)}
          <path d={e.d} fill="none" stroke={e.war ? '#ef6a5a' : '#e8a04f'} stroke-opacity={e.ongoing ? 0.45 : 0.85} stroke-width={(e.war ? 1.4 : 0.8) / transform.k} stroke-dasharray={e.ongoing ? '4 3' : null} pointer-events="none"><title>{e.t}</title></path>
        {/each}
      {/if}

      <!-- population bubbles -->
      {#if layers.labels}
        {#each featured as id (id)}
          {@const ll = lonlat(id)}
          {#if ll}
            {@const [x, y] = projection(ll)}
            <circle cx={x} cy={y} r={popR(id) / Math.sqrt(transform.k)} fill="#6cb4ff" fill-opacity="0.08" stroke="#6cb4ff" stroke-opacity="0.25" stroke-width={0.6 / transform.k} pointer-events="none" />
          {/if}
        {/each}
      {/if}

      <!-- qualities glyphs -->
      {#if layers.glyphs}
        {#each featured as id (id)}
          {@const ll = lonlat(id)}
          {#if ll && ranks[id]}
            {@const [x, y] = projection(ll)}
            {@const r = (transform.k >= 3 ? 7 : 8) / transform.k}
            <g transform="translate({x},{y})" pointer-events="none">
              <circle r={r} fill="#0b0e13" fill-opacity="0.35" stroke={atWar(id) ? '#ef6a5a' : '#3a4250'} stroke-width={(atWar(id) ? 1.4 : 0.5) / transform.k} />
              <path d={glyphPath(id, r)} fill="#ffd166" fill-opacity="0.55" stroke="#ffd166" stroke-width={0.7 / transform.k} />
            </g>
          {/if}
        {/each}
      {/if}

      <!-- labels: flag + regime glyph -->
      {#if layers.labels}
        {#each featured as id (id)}
          {@const ll = lonlat(id)}
          {#if ll}
            {@const [x, y] = projection(ll)}
            {@const rg = regimeOf(id)}
            {@const fl = flagOf(id)}
            {@const dy = layers.glyphs ? (transform.k >= 3 ? 7 : 8) / transform.k + 9 / transform.k : 0}
            <g transform="translate({x},{y + dy})" pointer-events="none" font-size={11 / transform.k}>
              {#if fl}<text x={-2 / transform.k} y={4 / transform.k} text-anchor="end">{fl}</text>{/if}
              {#if rg != null}<text x={2 / transform.k} y={4 / transform.k} fill={REGIME_COL4[rg]} font-weight="700" style="paint-order:stroke" stroke="#0b0e13" stroke-width={2 / transform.k}>{REGIME_GLYPH[rg]}</text>{/if}
            </g>
          {/if}
        {/each}
      {/if}
    </g>
  </svg>

  <button class="reset" onclick={resetZoom} title="reset zoom">⤢</button>
  {#if hoverInfo}
    <div class="card" style="left:{Math.min(hover.x + 14, width - 300)}px; top:{Math.min(hover.y + 14, height - 200)}px">
      <div class="ch">{hoverInfo.flag ?? ''} <b>{hoverInfo.name}</b> <span class="mono muted">{hoverInfo.id}</span>{#if !hoverInfo.live}<span class="muted"> · not a state in {Math.round(year)}</span>{/if}</div>
      <div class="cr">{#if hoverInfo.rg != null}<span style="color:{REGIME_COL4[hoverInfo.rg]}">{REGIME_GLYPH[hoverInfo.rg]} {REGIME_LABELS[hoverInfo.rg]}</span>{/if} · pop {fmtPop(hoverInfo.pop)}</div>
      {#if hoverInfo.conflicts.length}<div class="cr" style="color:#ef6a5a">{hoverInfo.conflicts.join(' · ')}</div>{/if}
      {#if hoverInfo.pacts.length}
        <div class="cr muted">pacts: {#each hoverInfo.pacts.slice(0, 4) as p, i}{i ? '; ' : ''}{#if p.greats.length}<span style="color:#6cb4ff">with {p.greats.join(', ')}</span>{#if p.partners.length > p.greats.length} +{p.partners.length - p.greats.length}{/if}{:else}{p.partners.length <= 2 ? p.partners.join(', ') : p.partners.length + ' partners'}{/if}{/each}{hoverInfo.pacts.length > 4 ? ` (+${hoverInfo.pacts.length - 4})` : ''}</div>
      {:else if allianceView.pacts}<div class="cr muted">no defence pact{allianceView.carried ? ' (as of ' + allianceView.from + ')' : ''}</div>{/if}
      {#if hoverInfo.items.length}<div class="cr ev">{Math.round(year)}: {hoverInfo.items.map(it => it.t.replace(/^[^:]+: /, '')).join(' · ')}</div>{/if}
    </div>
  {/if}
  <!-- legend -->
  <div class="legend">
    {#if variable}
      <div class="lt">{variable.label}{variable.unit ? ` · ${variable.unit}` : ''}</div>
      {#if scale.kind === 'categorical'}
        {#each scale.domain as c, i}<span class="sw"><i style="background:{scale.swatch(c)}"></i>{catLabel(c, i)}</span>{/each}
      {:else if scale.kind === 'numeric'}
        <div class="bar" style="background: linear-gradient(90deg, {d3.range(0, 1.01, 0.1).map(t => scale.scale(scale.log ? Math.exp(Math.log(scale.domain[0]) + t * (Math.log(scale.domain[1]) - Math.log(scale.domain[0]))) : scale.domain[0] + t * (scale.domain[1] - scale.domain[0]))).join(',')})"></div>
        <div class="ticks"><span>{d3.format('.3~s')(scale.domain[0])}</span><span>{d3.format('.3~s')(scale.domain[1])}</span></div>
      {/if}
      <div class="muted small">{variable.kind === 'forecast' ? (year >= (forecast?.meta.from ?? 2026) ? `ensemble of ${forecast?.meta.runs} runs · generic templates only` : 'before forecast start: 2025 state') : variable.kind === 'history' ? (year > (history?.meta.y1 ?? 2025) ? 'past the panel: nothing shown' : `historical panel · ${history?.meta.sources?.[variable.var] ?? ''}`) : year > 2026 ? 'projection / extrapolation' : 'historical'} · grey = no data</div>
    {/if}
    {#if presentStatuses.t.length}
      <div class="lt" style="margin-top:6px">Territories <span class="muted">hatched · ◇ point</span></div>
      {#each presentStatuses.t as s}<span class="sw"><i style="background:{STATUS_COLORS[s] ?? '#8b94a3'}"></i>{s.replace('_', ' ')}</span>{/each}
    {/if}
    {#if presentStatuses.c.length}
      <div class="lt" style="margin-top:6px">Corridors <span class="muted">line · ○ chokepoint · ┄ cable</span></div>
      {#each presentStatuses.c as s}<span class="sw"><i style="background:{STATUS_COLORS[s] ?? '#8b94a3'}"></i>{s}</span>{/each}
    {/if}
    {#if layers.conflicts}
      <div class="lt" style="margin-top:6px">Conflicts <span class="muted">red outline at war · orange dashed internal · arcs join principal belligerents (dashed = ongoing)</span></div>
    {/if}
    {#if layers.alliances}
      <div class="lt" style="margin-top:6px">Alliances{layers.alliances === 'major' ? ' (great-power pacts)' : ''} <span class="muted">{allianceView.pacts} defence pacts (CoW) · solid bilateral · dashed multilateral, hub = largest member{allianceView.carried ? ` · carried forward from ${allianceView.from}` : ''}{allianceView.none ? ' · none in source' : ''}</span></div>
    {/if}
    {#if layers.labels}
      <div class="lt" style="margin-top:6px">Regime <span class="muted">· bubble = population</span></div>
      {#each REGIME_LABELS as l, i}<span class="sw" style="color:{REGIME_COL4[i]}"><b>{REGIME_GLYPH[i]}</b> <span style="color:var(--fg)">{l}</span></span>{/each}
    {/if}
    {#if layers.glyphs}
      <div class="lt" style="margin-top:6px">Qualities <span class="muted">percentile among states that year, clockwise from top</span></div>
      {#each AXES as [v, l], i}<span class="sw"><span class="mono muted">{i + 1}</span> {l}</span>{/each}<span class="sw"><i style="background:#ef6a5a"></i>at war</span>
    {/if}
  </div>
</div>

<style>
  .map { position: relative; width: 100%; height: 100%; overflow: hidden; }
  svg { display: block; cursor: grab; }
  path.actor { cursor: pointer; }
  svg path, svg circle { outline: none; }
  path[role=button], circle[role=button] { cursor: pointer; }
  path.actor:hover { filter: brightness(1.25); }
  .reset { position: absolute; right: 10px; top: 10px; }
  .card { position: absolute; pointer-events: none; background: rgba(15,17,21,0.94); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; max-width: 300px; font-size: 11.5px; z-index: 5; }
  .card .ch { font-size: 13px; margin-bottom: 2px; }
  .card .cr { margin-top: 2px; }
  .card .ev { color: var(--fg); border-top: 1px solid var(--line); margin-top: 4px; padding-top: 4px; }
  .legend { position: absolute; left: 10px; bottom: 10px; background: rgba(15,17,21,0.85); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; max-width: 320px; font-size: 11px; }
  .lt { font-weight: 600; margin-bottom: 4px; }
  .lt .muted { font-weight: 400; }
  .bar { height: 8px; border-radius: 2px; }
  .ticks { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--fg2); }
  .sw { display: inline-flex; align-items: center; gap: 4px; margin: 1px 8px 1px 0; }
  .sw i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .small { font-size: 10px; margin-top: 3px; }
</style>
