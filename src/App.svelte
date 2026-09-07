<script>
  import { loadWorld, forecastVariables } from './lib/data.js';
  import Map from './lib/Map.svelte';
  import Panel from './lib/Panel.svelte';

  let data = $state(null), error = $state(null);
  let varId = $state('fc_regime_mean');
  let year = $state(2035);
  let layers = $state({ territories: true, corridors: true });
  let selected = $state(null);

  loadWorld().then(d => { data = d; }).catch(e => { error = String(e); });

  const mapVars = $derived(data ? [...forecastVariables(data.forecast), ...data.world.registry.variables.filter(v => v.display?.map && v.scope === 'actor')] : []);
  const groups = $derived(data ? [['forecast', 'Forecast (ensemble)'], ...Object.entries(data.world.registry.groups)] : []);
  const variable = $derived(mapVars.find(v => v.id === varId) ?? mapVars[0]);
  const actorList = $derived(data ? Object.values(data.world.actors).sort((a, b) => a.name.localeCompare(b.name)) : []);

  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') year = Math.min(2066, year + 1);
    if (e.key === 'ArrowLeft') year = Math.max(2000, year - 1);
  }
</script>

<svelte:window onkeydown={onKey} />

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
      <label class="year">
        <span class="mono">{year}</span>
        <input type="range" min="2000" max="2066" step="1" bind:value={year} />
        <span class="muted tiny">← → keys</span>
      </label>
      <button class:on={layers.territories} onclick={() => layers.territories = !layers.territories}>territories</button>
      <button class:on={layers.corridors} onclick={() => layers.corridors = !layers.corridors}>corridors</button>
      <label>actor
        <select onchange={(e) => { if (e.target.value) selected = { kind: 'actor', id: e.target.value }; }} value={selected?.kind === 'actor' ? selected.id : ''}>
          <option value="">—</option>
          {#each actorList as a}<option value={a.id}>{a.name}</option>{/each}
        </select>
      </label>
      <span class="muted tiny right">built {data.world.meta.built.slice(0, 10)} · {Object.keys(data.world.actors).length} actors · {data.world.registry.variables.length} variables</span>
    </header>
    <main>
      <Map world={data.world} geo={data.geo} forecast={data.forecast} {variable} {year} {layers} {selected} onSelect={(s) => selected = s} />
      <Panel world={data.world} forecast={data.forecast} {selected} {year} onSelect={(s) => selected = s} onPickVariable={(id) => varId = id} />
    </main>
  </div>
{/if}

<style>
  .app { display: flex; flex-direction: column; height: 100%; }
  header { display: flex; align-items: center; gap: 14px; padding: 6px 12px; border-bottom: 1px solid var(--line); background: var(--bg2); flex-wrap: wrap; }
  h1 { font-size: 15px; margin-right: 6px; }
  label { display: inline-flex; align-items: center; gap: 6px; color: var(--fg2); font-size: 12px; }
  .year input { width: 260px; }
  .year .mono { color: var(--fg); font-weight: 600; width: 36px; }
  .right { margin-left: auto; }
  .tiny { font-size: 10.5px; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 400px; grid-template-rows: minmax(0, 1fr); flex: 1; min-height: 0; }
  main > :global(*) { min-height: 0; min-width: 0; }
  .center { display: grid; place-items: center; height: 100%; }
  .bad { color: var(--bad); }
</style>
