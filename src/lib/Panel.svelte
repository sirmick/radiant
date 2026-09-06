<script>
  import { valueAt, fmt, sparkPath, LEVEL_COLORS, REGIME_COLORS, NUCLEAR_COLORS, STATUS_COLORS } from './data.js';

  let { world, selected, year, onSelect, onPickVariable } = $props();
  let tab = $state('detail');

  const reg = $derived(world.registry);
  const capVars = $derived(reg.variables.filter(v => v.id.startsWith('cap_')));
  const groups = $derived(Object.entries(reg.groups));
  const actor = $derived(selected?.kind === 'actor' ? world.actors[selected.id] : null);
  const territory = $derived(selected?.kind === 'territory' ? world.territories.find(t => t.id === selected.id) : null);
  const corridor = $derived(selected?.kind === 'corridor' ? world.corridors.find(c => c.id === selected.id) : null);
  const hazardById = $derived(Object.fromEntries(world.hazards.map(h => [h.id, h])));
  const actorName = (id) => world.actors[id]?.name ?? id;

  const varsInGroup = (g) => reg.variables.filter(v => v.group === g && v.scope === 'actor' && !v.id.startsWith('cap_') && actor?.vars[v.id]);
  const p10 = (h) => 1 - Math.exp(-h.base_q * 40);
  const pct = (x) => `${Math.round(x * 100)}%`;
</script>

<div class="panel">
  <div class="tabs">
    {#each [['detail', 'Detail'], ['hazards', `Hazards · ${world.hazards.length}`], ['claims', `Claims · ${world.claims.length}`], ['territories', `Territories · ${world.territories.length}`], ['corridors', `Corridors · ${world.corridors.length}`]] as [id, label]}
      <button class:on={tab === id} onclick={() => tab = id}>{label}</button>
    {/each}
  </div>

  <div class="body">
    {#if tab === 'detail'}
      {#if actor}
        <h2>{actor.name} <span class="mono muted">{actor.id}</span></h2>
        <div class="chips">
          <span class="chip" style="border-color:{REGIME_COLORS[actor.regime.type]}">{actor.regime.type.replace('_', ' ')}</span>
          <span class="chip" style="border-color:{NUCLEAR_COLORS[actor.nuclear.status]}">nuclear: {actor.nuclear.status}{actor.nuclear.warheads ? ` · ${actor.nuclear.warheads}` : ''}</span>
          <span class="chip">{actor.region}</span>
        </div>
        <div class="kv">
          <span>personalism</span><b>{actor.regime.personalism}</b>
          <span>succession</span><b>{actor.regime.succession}</b>
          {#if actor.regime.leader_born}<span>leader age</span><b>{Math.floor(year - actor.regime.leader_born)} <i class="muted">(since {actor.regime.leader_since})</i></b>{/if}
        </div>
        <div class="src muted">{actor.regime.source}</div>
        {#if actor.notes}<p class="notes">{actor.notes}</p>{/if}

        <h3>Capabilities</h3>
        <div class="caps">
          {#each capVars as v}
            {@const lvl = actor.tech[v.id.slice(4)]}
            <button class="cap" style="background:{LEVEL_COLORS[lvl]}22;border-color:{LEVEL_COLORS[lvl]}" title={v.label} onclick={() => onPickVariable(v.id)}>
              <b>{lvl}</b><span>{v.label}</span>
            </button>
          {/each}
        </div>

        {#if Object.keys(actor.chokepoints).length}
          <h3>Chokepoint exposure</h3>
          <div class="kv">{#each Object.entries(actor.chokepoints) as [k, v]}<span><a href="#" onclick={(e) => { e.preventDefault(); onSelect({ kind: 'corridor', id: k }); }}>{k}</a></span><b>{pct(v)}</b>{/each}</div>
        {/if}

        {#each groups as [gid, glabel]}
          {@const vs = varsInGroup(gid)}
          {#if vs.length}
            <h3>{glabel}</h3>
            <table>
              {#each vs as v}
                {@const rec = actor.vars[v.id]}
                {@const at = valueAt(rec, year)}
                {@const sp = sparkPath(rec)}
                <tr onclick={() => v.display?.map && onPickVariable(v.id)} class:clickable={v.display?.map}>
                  <td class="lbl">{v.label}<div class="muted tiny">{rec.source}{at.year && at.year !== Math.floor(year) ? ` · ${at.year}` : ''}{at.extrapolated ? ' · held' : at.projected ? ' · proj' : ''}</div></td>
                  <td class="val mono" class:muted={at.extrapolated}>{fmt(v, at.value)}</td>
                  <td class="spark">{#if sp}<svg width={sp.w} height={sp.h}><line x1={sp.x0} x2={sp.x0} y1="0" y2={sp.h} stroke="#2a303a" /><path d={sp.hist} fill="none" stroke="#6cb4ff" stroke-width="1.2" />{#if sp.proj}<path d={sp.proj} fill="none" stroke="#6cb4ff" stroke-width="1.2" stroke-dasharray="2 2" />{/if}</svg>{/if}</td>
                </tr>
              {/each}
            </table>
          {/if}
        {/each}

      {:else if territory}
        <h2>{territory.name}</h2>
        <div class="chips"><span class="chip" style="border-color:{STATUS_COLORS[territory.status]}">{territory.status.replace('_', ' ')}</span></div>
        <div class="kv">
          <span>controller</span><b>{actorName(territory.controller)}</b>
          <span>claimants</span><b>{territory.claimants.map(actorName).join(', ')}</b>
          <span>stakes</span><b>{Object.entries(territory.stakes ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</b>
          <span>geometry</span><b class="mono tiny">{territory.geometry.ne_ids ? `NE ${territory.geometry.ne_ids.join(', ')}` : ''}{territory.geometry.sketch ? ` sketch (${territory.geometry.geometry_source ?? 'approximate'})` : ''}</b>
          {#if territory.hazard}<span>hazard</span><b><a href="#" onclick={(e) => { e.preventDefault(); tab = 'hazards'; }}>{territory.hazard}</a> <i class="muted">10-yr {pct(p10(hazardById[territory.hazard]))}</i></b>{/if}
        </div>
        {#if territory.notes}<p class="notes">{territory.notes}</p>{/if}

      {:else if corridor}
        <h2>{corridor.name}</h2>
        <div class="chips"><span class="chip" style="border-color:{STATUS_COLORS[corridor.status]}">{corridor.status}</span><span class="chip">{corridor.kind} · {corridor.mode}</span>{#if corridor.completion != null}<span class="chip">completion {pct(corridor.completion)}</span>{/if}</div>
        <div class="kv">
          <span>transits</span><b>{corridor.transits.map(actorName).join(', ')}</b>
          {#if corridor.requires}<span>requires</span><b>{corridor.requires.join(', ')}</b>{/if}
          {#if corridor.hazard}<span>hazard</span><b>{corridor.hazard}</b>{/if}
        </div>
        <h3>Load-bearing for</h3>
        <div class="bars">
          {#each Object.entries(corridor.load_bearing_for).sort((a, b) => b[1] - a[1]) as [k, v]}
            <div class="bar-row"><span class="mono">{k}</span><div class="bar"><i style="width:{v * 100}%"></i></div><span class="mono muted">{v}</span></div>
          {/each}
        </div>
        {#if corridor.notes}<p class="notes">{corridor.notes}</p>{/if}

      {:else}
        <p class="muted">Click a country, hatched territory, corridor line, or chokepoint.</p>
        <p class="muted">Colour is the selected variable at the slider year. Dashed sparklines and "proj" are UN WPP projections; "held" means the last observed value is carried forward — the engine will replace that.</p>
      {/if}

    {:else if tab === 'hazards'}
      {#each world.hazards as h}
        <div class="card">
          <div class="row"><b>{h.name}</b><span class="mono muted">{h.id}</span></div>
          <div class="row tiny"><span>base <code>{h.base_q}</code>/qtr → <b>{pct(p10(h))}</b> by 2036 (no covariates)</span><span class="muted">{h.once ? 'once' : 'recurring'}</span></div>
          {#if h.outcomes.length > 1}<div class="tiny">outcomes: {h.outcomes.map((o, i) => `${o} ${h.outcome_weights ? pct(h.outcome_weights[i]) : ''}`).join(' · ')}</div>{/if}
          {#if h.covariates?.length}<div class="tiny muted">covariates: {h.covariates.map(c => `${c.var} (β ${c.beta})`).join('; ')}</div>{/if}
          {#if h.reference_class}<div class="tiny muted">ref: {h.reference_class}</div>{/if}
        </div>
      {/each}

    {:else if tab === 'claims'}
      {#each world.claims as c}
        <div class="card">
          <div class="row"><b>{c.statement}</b></div>
          <div class="row tiny"><span>prior <b>{pct(c.prior)}</b> · horizon {c.horizon} · {c.type}</span><span class="mono muted">{c.id}</span></div>
          <div class="tiny mono muted">{c.query}</div>
        </div>
      {/each}

    {:else if tab === 'territories'}
      {#each world.territories as t}
        <div class="card clickable" onclick={() => { onSelect({ kind: 'territory', id: t.id }); tab = 'detail'; }}>
          <div class="row"><b>{t.name}</b><span class="chip" style="border-color:{STATUS_COLORS[t.status]}">{t.status.replace('_', ' ')}</span></div>
          <div class="tiny muted">{actorName(t.controller)} holds · claimed by {t.claimants.map(actorName).join(', ')}{t.geometry.sketch ? ' · sketch' : ''}</div>
        </div>
      {/each}

    {:else if tab === 'corridors'}
      {#each world.corridors as c}
        <div class="card clickable" onclick={() => { onSelect({ kind: 'corridor', id: c.id }); tab = 'detail'; }}>
          <div class="row"><b>{c.name}</b><span class="chip" style="border-color:{STATUS_COLORS[c.status]}">{c.status}</span></div>
          <div class="tiny muted">{c.kind} · {c.mode} · {c.transits.join(' → ')}</div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100%; background: var(--bg2); border-left: 1px solid var(--line); }
  .tabs { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .tabs button { font-size: 11px; padding: 3px 7px; }
  .body { overflow: auto; padding: 10px 12px; flex: 1; }
  h2 { font-size: 16px; margin-bottom: 4px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg2); margin: 14px 0 6px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 8px; }
  .chip { border: 1px solid var(--line); border-radius: 10px; padding: 1px 8px; font-size: 11px; }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 12px; }
  .kv span { color: var(--fg2); }
  .src { font-size: 10px; margin-top: 4px; }
  .notes { color: var(--fg); font-size: 12px; border-left: 2px solid var(--line); padding-left: 8px; margin: 8px 0; }
  .caps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
  .cap { display: flex; gap: 6px; align-items: center; text-align: left; padding: 3px 6px; border-radius: 4px; font-size: 11px; min-width: 0; overflow: hidden; }
  .cap b { font-family: var(--mono); width: 12px; flex: none; }
  .body { overflow-x: hidden; }
  .cap span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 4px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  tr.clickable { cursor: pointer; } tr.clickable:hover td { background: var(--bg3); }
  .lbl { font-size: 12px; }
  .val { text-align: right; white-space: nowrap; }
  .spark { width: 120px; }
  .tiny { font-size: 10.5px; }
  .card { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
  .card.clickable { cursor: pointer; } .card.clickable:hover { background: var(--bg3); }
  .row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .bars { display: grid; gap: 3px; }
  .bar-row { display: grid; grid-template-columns: 36px 1fr 30px; gap: 8px; align-items: center; font-size: 11px; }
  .bar { height: 8px; background: var(--bg3); border-radius: 2px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
</style>
