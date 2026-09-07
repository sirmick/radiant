<script>
  import { loadWorld, loadEnsemble, forecastVariables, historyVariables, readHash, writeHash, forecastNews } from './lib/data.js';
  import Map from './lib/Map.svelte';
  import Panel from './lib/Panel.svelte';

  let data = $state(null), error = $state(null);
  let asOf = $state(null);           // null = the current (2025) ensemble; a year = a past forecast made as of that year
  let ensemble = $state(null);       // the active ensemble object
  $effect(() => { if (!data) return; if (asOf == null) { ensemble = data.forecast; return; } const e = data.forecastIndex?.ensembles.find(x => x.asOf === asOf); if (!e) { ensemble = data.forecast; return; } loadEnsemble(e.file).then(f => { if (asOf === e.asOf) ensemble = f; }); });
  let varId = $state('h_regime');
  // auto-switch the regime view across the history/forecast boundary
  const fcFrom = $derived(ensemble?.meta.from ?? 2026);
  $effect(() => { if (varId === 'h_regime' && year >= fcFrom) varId = 'fc_regime_mean'; else if (varId === 'fc_regime_mean' && year < fcFrom) varId = 'h_regime'; });
  let year = $state(2035);
  let playing = $state(false);
  const Y0 = 1870, Y1 = 2066;
  const ERAS = [{ y: 1870, label: '1870' }, { y: 1914, label: '1914' }, { y: 1945, label: '1945' }, { y: 1991, label: '1991' }, { y: 2026, label: 'now' }, { y: 2066, label: '2066' }];
  $effect(() => {
    if (!playing) return;
    const t = setInterval(() => { year = year >= Y1 ? Y0 : year + 1; }, 250);
    return () => clearInterval(t);
  });
  let layers = $state({ territories: true, corridors: true, alliances: 'major', conflicts: true, presence: true, labels: true, glyphs: false });
  let selected = $state(null);

  const applyHash = () => { const h = readHash(); if (h.year) year = h.year; if (h.varId) varId = h.varId; if (h.actor) selected = { kind: 'actor', id: h.actor }; if (h.layers) for (const k of Object.keys(layers)) layers[k] = h.layers[k] ?? false; if (h.tab) tab = h.tab; if (h.asOf != null) asOf = h.asOf; };
  loadWorld().then(d => { data = d; applyHash(); }).catch(e => { error = String(e); });
  let tab = $state('news');
  const HL_COL = { war: '#ef6a5a', nuclear: '#ff3b3b', territory: '#e8a04f', corridor: '#4fc27a', coup: '#d95c4f', alliance: '#6cb4ff', regime: '#7fc4f0', conflict: '#e8a04f', dispute: '#8b94a3', leader: '#8b94a3' };
  const headlines = $derived.by(() => {
    if (!data) return []; const y = Math.round(year);
    const fc = ensemble ?? data.forecast;
    if (fc && y >= fc.meta.from && y <= fc.meta.to) { const seen = new Set(); const out = []; for (const e of forecastNews(fc, y, 60)) { if (seen.has(e.tpl)) continue; seen.add(e.tpl); out.push({ t: `${(e.p * 100).toFixed(0)}% ${e.t}`, col: HL_COL[e.k] ?? '#8b94a3' }); if (out.length === 3) break; } return out; }
    const items = (data.news?.years?.[y] ?? []).filter(e => !e.ongoing && ['war', 'nuclear', 'territory', 'corridor', 'coup', 'alliance'].includes(e.k));
    return items.slice(0, 3).map(e => ({ t: e.t.length > 90 ? e.t.slice(0, 88) + '…' : e.t, col: HL_COL[e.k] ?? '#8b94a3' }));
  });
  $effect(() => { if (data) writeHash({ year, varId, selected, layers, tab, asOf }); });

  const mapVars = $derived(data ? [...historyVariables(data.history), ...forecastVariables(ensemble ?? data.forecast), ...data.world.registry.variables.filter(v => v.display?.map && v.scope === 'actor')] : []);
  const groups = $derived(data ? [['history', 'History (panel 1870–2025)'], ['forecast', 'Forecast (ensemble)'], ...Object.entries(data.world.registry.groups)] : []);
  const variable = $derived(mapVars.find(v => v.id === varId) ?? mapVars[0]);
  const actorList = $derived(data ? Object.values(data.world.actors).sort((a, b) => a.name.localeCompare(b.name)) : []);

  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') year = Math.min(Y1, year + 1);
    if (e.key === 'ArrowLeft') year = Math.max(Y0, year - 1);
    if (e.key === ' ') { e.preventDefault(); playing = !playing; }
  }
</script>

<svelte:window onkeydown={onKey} onhashchange={applyHash} />

{#if error}
  <div class="center bad">Failed to load world.json — run <code>node scripts/build-world.mjs</code>. {error}</div>
{:else if !data}
  <div class="center muted">loading world…</div>
{:else}
  <div class="app">
    <header>
      <h1>Radiant <span class="muted">· world model</span></h1>
      <label>variable
        <select bind:value={varId}>
          {#each groups as [gid, glabel]}
            {@const vs = mapVars.filter(v => v.group === gid)}
            {#if vs.length}<optgroup label={glabel}>{#each vs as v}<option value={v.id}>{v.label}</option>{/each}</optgroup>{/if}
          {/each}
        </select>
      </label>
      <span class="muted tiny">layers</span>
      {#each [['territories', 'territories'], ['corridors', 'corridors'], ['conflicts', 'conflicts'], ['presence', 'military presence'], ['labels', 'flags · regime'], ['glyphs', 'qualities']] as [k, label]}
        <button class:on={layers[k]} onclick={() => layers[k] = !layers[k]}>{label}</button>
      {/each}
      <button class:on={!!layers.alliances} onclick={() => layers.alliances = layers.alliances === 'major' ? 'all' : layers.alliances === 'all' ? false : 'major'} title="cycle: great-power pacts → all pacts → off">alliances{layers.alliances ? ` · ${layers.alliances}` : ''}</button>
      <label>actor
        <select onchange={(e) => { if (e.target.value) { selected = { kind: 'actor', id: e.target.value }; tab = 'detail'; } }} value={selected?.kind === 'actor' ? selected.id : ''}>
          <option value="">—</option>
          {#each actorList as a}<option value={a.id}>{a.name}</option>{/each}
        </select>
      </label>
      <span class="muted tiny right">built {data.world.meta.built.slice(0, 10)} · {Object.keys(data.world.actors).length} actors · {data.world.registry.variables.length} variables</span>
    </header>
    <div class="timeline">
      <button class="play" onclick={() => playing = !playing} title="play / pause (space)">{playing ? '❚❚' : '▶'}</button>
      <span class="mono yr">{year}</span>
      <div class="track">
        <input type="range" min={Y0} max={Y1} step="1" bind:value={year} />
        <div class="ticks">
          {#each ERAS as e}<span style="left:{(e.y - Y0) / (Y1 - Y0) * 100}%" class:now={e.y === 2026}>{e.label}</span>{/each}
        </div>
        <div class="fcband" style="left:{(fcFrom - Y0) / (Y1 - Y0) * 100}%; right:{asOf != null ? (Y1 - (ensemble?.meta.to ?? Y1)) / (Y1 - Y0) * 100 : 0}%" title="forecast window"></div>
      </div>
      <label class="asof" title="Run the forecast as of a past year: coefficients refit on data up to that year, then compared with what happened">forecast from
        <select value={asOf ?? ''} onchange={(e) => { asOf = e.target.value === '' ? null : +e.target.value; if (asOf != null) year = Math.max(year, asOf + 1); }}>
          <option value="">2025 (now)</option>
          {#each (data.forecastIndex?.ensembles ?? []).filter(e => e.asOf < 2025) as e}<option value={e.asOf}>{e.asOf}</option>{/each}
        </select>
      </label>
      <span class="muted tiny">{year < fcFrom ? 'history' : asOf != null ? `forecast made in ${asOf} vs what happened` : 'forecast ensemble'} · ← → step · space play</span>
    </div>
    <div class="headlines">
      {#each headlines as h}<span class="hl"><i style="background:{h.col}"></i>{h.t}</span>{/each}
      {#if !headlines.length}<span class="muted tiny">no recorded headline events for {Math.round(year)}</span>{/if}
    </div>
    <main>
      <Map world={data.world} geo={data.geo} forecast={ensemble ?? data.forecast} history={data.history} alliances={data.alliances} news={data.news} presence={data.presence} {variable} {year} {layers} {selected} onSelect={(s) => { selected = s; tab = 'detail'; }} />
      <Panel world={data.world} forecast={ensemble ?? data.forecast} history={data.history} news={data.news} scores={data.scores} bind:tab {selected} {year} onSelect={(s) => { selected = s; tab = 'detail'; }} onPickVariable={(id) => varId = id} />
    </main>
  </div>
{/if}

<style>
  .app { display: flex; flex-direction: column; height: 100%; }
  header { display: flex; align-items: center; gap: 14px; padding: 6px 12px; border-bottom: 1px solid var(--line); background: var(--bg2); flex-wrap: wrap; }
  h1 { font-size: 15px; margin-right: 6px; }
  label { display: inline-flex; align-items: center; gap: 6px; color: var(--fg2); font-size: 12px; }
  .headlines { display: flex; gap: 18px; padding: 3px 12px 5px; background: var(--bg2); border-bottom: 1px solid var(--line); font-size: 11.5px; overflow: hidden; white-space: nowrap; }
  .hl { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .hl i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .timeline { display: flex; align-items: center; gap: 12px; padding: 6px 12px 10px; background: var(--bg2); border-bottom: 1px solid var(--line); }
  .asof { font-size: 11.5px; }
  .timeline .yr { font-size: 15px; font-weight: 700; width: 44px; }
  .play { width: 30px; height: 26px; padding: 0; }
  .track { position: relative; flex: 1; height: 30px; }
  .track input { width: 100%; margin: 0; position: absolute; top: 0; }
  .ticks { position: absolute; top: 18px; left: 0; right: 0; height: 12px; font-size: 10px; color: var(--fg2); }
  .ticks span { position: absolute; transform: translateX(-50%); }
  .ticks span.now { color: var(--accent); font-weight: 600; }
  .fcband { position: absolute; top: 4px; right: 0; height: 8px; background: var(--accent); opacity: 0.12; pointer-events: none; border-radius: 3px; }
  .right { margin-left: auto; }
  .tiny { font-size: 10.5px; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 400px; grid-template-rows: minmax(0, 1fr); flex: 1; min-height: 0; }
  main > :global(*) { min-height: 0; min-width: 0; }
  .center { display: grid; place-items: center; height: 100%; }
  .bad { color: var(--bad); }
</style>
