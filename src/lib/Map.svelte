<script>
  import * as d3 from 'd3';
  import * as topojson from 'topojson-client';
  import { valueAt, forecastAt, historyAt, statusAt, colorScale, STATUS_COLORS } from './data.js';

  let { world, geo, forecast, history, variable, year, layers, selected, onSelect } = $props();

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

<div class="map" bind:clientWidth={width} bind:clientHeight={height}>
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
          stroke={isSel('actor', f.id) ? '#fff' : 'none'}
          stroke-width={1.5 / transform.k}
          class:actor={selectable(f.id)}
          onclick={() => selectable(f.id) && onSelect({ kind: 'actor', id: f.id })}
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
    </g>
  </svg>

  <!-- legend -->
  <div class="legend">
    {#if variable}
      <div class="lt">{variable.label}{variable.unit ? ` · ${variable.unit}` : ''}</div>
      {#if scale.kind === 'categorical'}
        {#each scale.domain as c}<span class="sw"><i style="background:{scale.swatch(c)}"></i>{c}</span>{/each}
      {:else if scale.kind === 'numeric'}
        <div class="bar" style="background: linear-gradient(90deg, {d3.range(0, 1.01, 0.1).map(t => scale.scale(scale.log ? Math.exp(Math.log(scale.domain[0]) + t * (Math.log(scale.domain[1]) - Math.log(scale.domain[0]))) : scale.domain[0] + t * (scale.domain[1] - scale.domain[0]))).join(',')})"></div>
        <div class="ticks"><span>{d3.format('.3~s')(scale.domain[0])}</span><span>{d3.format('.3~s')(scale.domain[1])}</span></div>
      {/if}
      <div class="muted small">{variable.kind === 'forecast' ? (year >= (forecast?.meta.from ?? 2026) ? `ensemble of ${forecast?.meta.runs} runs · generic templates only` : 'before forecast start: 2025 state') : variable.kind === 'history' ? (year > (history?.meta.y1 ?? 2025) ? 'past the panel: nothing shown' : `historical panel · ${history?.meta.sources?.[variable.var] ?? ''}`) : year > 2026 ? 'projection / extrapolation' : 'historical'} · grey = no data</div>
    {/if}
    {#if layers.territories || layers.corridors}
      <div class="lt" style="margin-top:6px">Status</div>
      {#if layers.territories}{#each ['contested_active', 'occupied', 'annexed', 'disputed', 'breakaway', 'protectorate', 'leased', 'buffer', 'frozen'] as s}<span class="sw"><i style="background:{STATUS_COLORS[s]}"></i>{s.replace('_', ' ')}</span>{/each}{/if}
      {#if layers.corridors}{#each ['open', 'contested', 'closed', 'built', 'building', 'planned'] as s}<span class="sw"><i style="background:{STATUS_COLORS[s]}"></i>{s}</span>{/each}{/if}
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
  .legend { position: absolute; left: 10px; bottom: 10px; background: rgba(15,17,21,0.85); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; max-width: 320px; font-size: 11px; }
  .lt { font-weight: 600; margin-bottom: 4px; }
  .bar { height: 8px; border-radius: 2px; }
  .ticks { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--fg2); }
  .sw { display: inline-flex; align-items: center; gap: 4px; margin: 1px 8px 1px 0; }
  .sw i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .small { font-size: 10px; margin-top: 3px; }
</style>
