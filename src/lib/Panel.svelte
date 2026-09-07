<script>
  import { valueAt, fmt, sparkPath, forecastAt, statusAt, forecastNews, actualWithin, flagEmoji, regimeAt, REGIME_GLYPH, REGIME_COL4, LEVEL_COLORS, REGIME_COLORS, NUCLEAR_COLORS, STATUS_COLORS, REGIME_LABELS } from './data.js';

  let { world, forecast, history, news, scores, selected, year, onSelect, onPickVariable, tab = $bindable('news') } = $props();
  const hSpark = (v, w = 160, h = 34) => { if (!histActor?.[v]) return null; const ys = [], vs = []; histActor[v].forEach((x, i) => { if (x != null) { ys.push(history.meta.y0 + i); vs.push(x); } }); if (vs.length < 2) return null; const lo = Math.min(...vs), hi = Math.max(...vs); const sx = (yy) => 1 + (yy - history.meta.y0) / (history.meta.y1 - history.meta.y0) * (w - 2); const sy = (x) => (h - 2) - (hi === lo ? (h - 4) / 2 : (x - lo) / (hi - lo) * (h - 4)); let d = ''; let prev = null; ys.forEach((yy, i) => { d += (prev != null && yy === prev + 1 ? 'L' : 'M') + sx(yy).toFixed(1) + ',' + sy(vs[i]).toFixed(1); prev = yy; }); return { d, x: sx(Math.max(history.meta.y0, Math.min(history.meta.y1, Math.round(year)))), w, h, lo, hi }; };
  let newsKinds = $state(new Set(['war', 'nuclear', 'territory', 'corridor', 'alliance', 'coup', 'regime', 'conflict', 'dispute', 'leader', 'capability', 'economic']));
  const KIND_COL = { war: '#ef6a5a', nuclear: '#ff3b3b', territory: '#e8a04f', corridor: '#4fc27a', alliance: '#6cb4ff', coup: '#d95c4f', regime: '#7fc4f0', conflict: '#e8a04f', dispute: '#8b94a3', leader: '#8b94a3', capability: '#c07ae0', economic: '#d9a441' };
  const yearNews = $derived.by(() => { const y = Math.round(year); if (forecast && y >= forecast.meta.from) return { mode: 'forecast', items: forecastNews(forecast, y) }; return { mode: 'history', items: news?.years?.[y] ?? [] }; });
  const shown = $derived(yearNews.items.filter(e => newsKinds.has(e.k)));
  const toggleKind = (k) => { const n = new Set(newsKinds); n.has(k) ? n.delete(k) : n.add(k); newsKinds = n; };
  const goto = (e) => { if (e.c) onSelect({ kind: 'corridor', id: e.c }); else if (e.tr) onSelect({ kind: 'territory', id: e.tr }); else if (e.a?.length) onSelect({ kind: 'actor', id: e.a[0] }); tab = 'detail'; };

  const reg = $derived(world.registry);
  const capVars = $derived(reg.variables.filter(v => v.id.startsWith('cap_')));
  const groups = $derived(Object.entries(reg.groups));
  const actor = $derived(selected?.kind === 'actor' ? world.actors[selected.id] : null);
  const fcActor = $derived(selected?.kind === 'actor' ? forecast?.actors?.[selected.id] : null);
  const fcOnly = $derived(!actor && !!fcActor);
  const REG_COL = ['#d95c4f', '#e8a04f', '#7fc4f0', '#4f9be8'];
  const fcYearIdx = $derived(forecast ? Math.max(0, Math.min(forecast.meta.horizon - 1, Math.round(year) - forecast.meta.from)) : 0);
  const atYears = (curve, ys) => ys.map(y => (curve && curve[y - 1] != null ? curve[y - 1] : null));
  const pastFc = $derived(forecast && history && forecast.meta.asOf < history.meta.y1);
  const actualCell = (id, t) => { if (!pastFc) return null; const y = actualWithin(news, id, t, forecast.meta.asOf, Math.min(forecast.meta.horizon, history.meta.y1 - forecast.meta.asOf)); return y; };
  const territory = $derived(selected?.kind === 'territory' ? world.territories.find(t => t.id === selected.id) : null);
  const corridor = $derived(selected?.kind === 'corridor' ? world.corridors.find(c => c.id === selected.id) : null);
  const actorName = (id) => world.actors[id]?.name ?? history?.actors?.[id]?.name ?? id;
  const tState = $derived(territory ? statusAt(territory, year) : null);
  const cState = $derived(corridor ? statusAt(corridor, year) : null);
  const histActor = $derived(selected?.kind === 'actor' ? history?.actors?.[selected.id] : null);
  const hIdx = $derived(history ? Math.round(year) - history.meta.y0 : -1);
  const hVal = (v) => (histActor && hIdx >= 0 ? histActor[v]?.[hIdx] : null);

  const varsInGroup = (g) => reg.variables.filter(v => v.group === g && v.scope === 'actor' && !v.id.startsWith('cap_') && actor?.vars[v.id]);
  const pct = (x) => `${Math.round(x * 100)}%`;
</script>

<div class="panel">
  <div class="tabs">
    {#each [['news', `News · ${year}`], ['detail', 'Detail'], ['territories', `Territories · ${world.territories.length}`], ['corridors', `Corridors · ${world.corridors.length}`], ['scores', 'Scores']] as [id, label]}
      <button class:on={tab === id} onclick={() => tab = id}>{label}</button>
    {/each}
  </div>

  <div class="body">
    {#if tab === 'news'}
      <div class="kinds">{#each Object.keys(KIND_COL) as k}<button class="kind" class:on={newsKinds.has(k)} style="--c:{KIND_COL[k]}" onclick={() => toggleKind(k)}>{k}</button>{/each}</div>
      {#if yearNews.mode === 'forecast'}
        <div class="tiny muted" style="margin:6px 0">{year}: ensemble hazards — P(first occurrence in this year) from {forecast.meta.runs} runs, ranked by how far above the typical actor each one sits. Generic templates only. Not events; odds.</div>
        {#if !shown.length}<p class="muted">Nothing above 2% for the selected kinds.</p>{/if}
        {#each shown as e}
          <div class="card clickable news" onclick={() => goto(e)}><span class="dot" style="background:{KIND_COL[e.k]}"></span><span class="mono pct">{(e.p * 100).toFixed(0)}%</span><span>{e.t}<div class="tiny muted">{e.surprise.toFixed(1)}× the typical actor's odds this year</div></span></div>
        {/each}
      {:else}
        <div class="tiny muted" style="margin:6px 0">{year}: {yearNews.items.length} recorded events{news ? '' : ' (news.json missing — run scripts/build-news.mjs)'}. Sources: REIGN, Powell–Thyne, V-Dem, UCDP, CoW, hand log.</div>
        {#if !shown.length}<p class="muted">No recorded events for the selected kinds. Coverage: leaders/coups 1950–2021, civil wars 1946–2024, disputes 1816–2001, regimes 1900–2025, hand events throughout.</p>{/if}
        {#each shown as e}
          <div class="card clickable news" onclick={() => goto(e)}><span class="dot" style="background:{KIND_COL[e.k]}"></span><span class="mono pct muted">{e.y != null ? (e.y % 1 ? 'Q' + (Math.floor((e.y % 1) * 4) + 1) : '') : ''}</span><span>{e.t}{#if e.n}<div class="tiny muted">{e.n}</div>{/if}<div class="tiny muted">{e.s}</div></span></div>
        {/each}
      {/if}
    {:else if tab === 'detail'}
      {#if actor}
        {@const rg = regimeAt(history, forecast, actor.id, year)}
        <h2>{flagEmoji(history?.actors?.[actor.id]?.iso2) ?? ''} {actor.name} <span class="mono muted">{actor.id}</span>{#if rg != null} <span style="color:{REGIME_COL4[rg]}" title={REGIME_LABELS[rg]}>{REGIME_GLYPH[rg]}</span>{/if}</h2>
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

        {#if histActor && hIdx >= 0 && hIdx <= history.meta.y1 - history.meta.y0}
          <h3>Historical panel · {year}</h3>
          {#if !histActor.live[hIdx]}<div class="tiny muted">not a system member in {year}</div>{/if}
          <table><tbody>
            {#each Object.entries(history.vars) as [v, spec]}{@const x = hVal(v)}{@const sp = hSpark(v)}{#if x != null || sp}
              <tr onclick={() => onPickVariable(`h_${v}`)} class="clickable"><td class="lbl">{spec.label}<div class="tiny muted">{spec.unit}</div></td><td class="val mono">{x == null ? '—' : v === 'regime' ? REGIME_LABELS[x] : fmt({ display: spec }, x)}</td><td class="spark">{#if sp}<svg width={sp.w} height={sp.h}><line x1={sp.x} x2={sp.x} y1="0" y2={sp.h} stroke="#6cb4ff" stroke-opacity="0.5" /><path d={sp.d} fill="none" stroke="#d7dce3" stroke-width="1" /></svg>{/if}</td></tr>
            {/if}{/each}
          </tbody></table>
        {/if}

        {#if fcActor}
          {@const d = fcActor.regime?.[fcYearIdx]}
          <h3>Forecast{pastFc ? ` made in ${forecast.meta.asOf}` : ''} · generic templates · {forecast.meta.runs} runs</h3>
          {#if d}
            <div class="tiny muted">regime distribution in {Math.max(forecast.meta.from, Math.round(year))} ({forecast.meta.asOf}: {REGIME_LABELS[fcActor.regime0]}){#if pastFc && histActor && Math.round(year) <= history.meta.y1} · actual: <b>{REGIME_LABELS[histActor.regime?.[Math.round(year) - history.meta.y0]] ?? '—'}</b>{/if}</div>
            <div class="regbar">{#each d as p, l}{#if p > 0.005}<i style="width:{p * 100}%;background:{REG_COL[l]}" title="{REGIME_LABELS[l]} {(p * 100).toFixed(0)}%"></i>{/if}{/each}</div>
            <div class="tiny">{#each d as p, l}{#if p > 0.02}<span class="sw"><i style="background:{REG_COL[l]}"></i>{REGIME_LABELS[l]} {(p * 100).toFixed(0)}%</span>{/if}{/each}</div>
          {/if}
          <table class="fc"><tbody>
            <tr class="muted tiny"><td>P(at least once) within</td><td>5y</td><td>10y</td><td>20y</td><td>40y</td>{#if pastFc}<td>actual</td>{/if}</tr>
            {#each forecast.meta.templates.filter(t => t.unit === 'actor-year' && fcActor.p[t.id]) as t}
              {@const act = actualCell(actor.id, t.id)}
              <tr onclick={() => onPickVariable(`fc_${t.id}`)} class="clickable">
                <td class="lbl">{t.label}</td>
                {#each atYears(fcActor.p[t.id], [5, 10, 20, 40]) as v}<td class="val mono">{v == null ? '—' : (v * 100).toFixed(0) + '%'}</td>{/each}
                {#if pastFc}<td class="val mono" style="color:{act ? 'var(--bad)' : act === false ? 'var(--good)' : 'inherit'}">{act ? act : act === false ? 'no' : '—'}</td>{/if}
              </tr>
            {/each}
          </tbody></table>
          {#if fcActor.gdp_pc?.[fcYearIdx]}<div class="tiny muted">GDP/cap {Math.max(forecast.meta.from, Math.round(year))}: {fcActor.gdp_pc[fcYearIdx].map(v => '$' + (v / 1000).toFixed(1) + 'k').join(' / ')} (10/50/90)</div>{/if}
          <div class="tiny muted">{forecast.meta.engine}</div>
        {/if}

        {#each groups as [gid, glabel]}
          {@const vs = varsInGroup(gid)}
          {#if vs.length}
            <h3>{glabel}</h3>
            <table><tbody>
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
            </tbody></table>
          {/if}
        {/each}

      {:else if fcOnly || (histActor && !actor)}
        {@const d = fcActor?.regime?.[fcYearIdx]}
        {@const rg2 = regimeAt(history, forecast, selected.id, year)}
        <h2>{flagEmoji(histActor?.iso2) ?? ''} {histActor?.name ?? selected.id} <span class="mono muted">{selected.id}</span>{#if rg2 != null} <span style="color:{REGIME_COL4[rg2]}">{REGIME_GLYPH[rg2]}</span>{/if} <span class="muted tiny">fit-only state</span></h2>
        {#if histActor && hIdx >= 0 && hIdx <= history.meta.y1 - history.meta.y0}
          <h3>Historical panel · {year}</h3>
          {#if !histActor.live[hIdx]}<div class="tiny muted">not a system member in {year}</div>{/if}
          <div class="kv">
            {#each Object.entries(history.vars) as [v, spec]}{@const x = hVal(v)}{#if x != null}<span>{spec.label}</span><b class="mono">{v === 'regime' ? REGIME_LABELS[x] : fmt({ display: spec }, x)}</b>{/if}{/each}
          </div>
        {/if}
        {#if fcActor}
        <h3>Forecast · generic templates · {forecast.meta.runs} runs</h3>
        {#if d}
          <div class="tiny muted">regime distribution in {Math.max(forecast.meta.from, Math.round(year))} (2025: {REGIME_LABELS[fcActor.regime0]})</div>
          <div class="regbar">{#each d as p, l}{#if p > 0.005}<i style="width:{p * 100}%;background:{REG_COL[l]}"></i>{/if}{/each}</div>
        {/if}
        <table class="fc"><tbody>
          <tr class="muted tiny"><td>P(at least once) within</td><td>5y</td><td>10y</td><td>20y</td><td>40y</td></tr>
          {#each forecast.meta.templates.filter(t => t.unit === 'actor-year' && fcActor.p[t.id]) as t}
            <tr onclick={() => onPickVariable(`fc_${t.id}`)} class="clickable"><td class="lbl">{t.label}</td>{#each atYears(fcActor.p[t.id], [5, 10, 20, 40]) as v}<td class="val mono">{v == null ? '—' : (v * 100).toFixed(0) + '%'}</td>{/each}</tr>
          {/each}
        </tbody></table>
        {/if}
      {:else if territory}
        <h2>{territory.name}</h2>
        {#if !tState.exists}<p class="muted">Does not exist yet in {year}. First entry: {territory.history[0].year} — {territory.history[0].status}.</p>{/if}
        <div class="chips"><span class="chip" style="border-color:{STATUS_COLORS[tState.status]}">{(tState.status ?? territory.status).replace('_', ' ')}{tState.since ? ` since ${Math.floor(tState.since)}` : ''}</span></div>
        <div class="kv">
          <span>controller in {year}</span><b>{actorName(tState.controller ?? territory.controller)}</b>
          <span>claimants</span><b>{territory.claimants.map(actorName).join(', ')}</b>
          <span>stakes</span><b>{Object.entries(territory.stakes ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</b>
          <span>geometry</span><b class="mono tiny">{territory.geometry.ne_ids ? `NE ${territory.geometry.ne_ids.join(', ')}` : ''}{territory.geometry.sketch ? ` sketch (${territory.geometry.geometry_source ?? 'approximate'})` : ''}</b>
        </div>
        {#if territory.history?.length}
          <h3>History</h3>
          <table><tbody>{#each territory.history as h}<tr class:muted={h.year > year + 0.99}><td class="mono val">{h.year.toFixed(2)}</td><td>{h.status ?? ''}{h.controller ? ` · ${actorName(h.controller)}` : ''}<div class="tiny muted">{h.source ?? ''}</div></td></tr>{/each}</tbody></table>
        {/if}
        {#if territory.notes}<p class="notes">{territory.notes}</p>{/if}

      {:else if corridor}
        <h2>{corridor.name}</h2>
        {#if !cState.exists}<p class="muted">Does not exist yet in {year}. First entry: {corridor.history[0].year} — {corridor.history[0].status}.</p>{/if}
        <div class="chips"><span class="chip" style="border-color:{STATUS_COLORS[cState.status]}">{cState.status ?? corridor.status}{cState.since ? ` since ${Math.floor(cState.since)}` : ''}</span><span class="chip">{corridor.kind} · {corridor.mode}</span>{#if cState.controller}<span class="chip">controller {actorName(cState.controller)}</span>{/if}{#if cState.capacity != null}<span class="chip">capacity {cState.capacity}</span>{/if}{#if corridor.completion != null}<span class="chip">completion {pct(corridor.completion)}</span>{/if}</div>
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
        {#if corridor.history?.length}
          <h3>History</h3>
          <table><tbody>{#each corridor.history as h}<tr class:muted={h.year > year + 0.99}><td class="mono val">{h.year.toFixed(2)}</td><td>{h.status ?? ''}{h.controller ? ` · ${actorName(h.controller)}` : ''}{h.capacity != null ? ` · capacity ${h.capacity}` : ''}<div class="tiny muted">{h.source ?? ''}</div></td></tr>{/each}</tbody></table>
        {/if}
        {#if corridor.notes}<p class="notes">{corridor.notes}</p>{/if}

      {:else}
        <p class="muted">Click a country, hatched territory, corridor line, or chokepoint.</p>
        <p class="muted">Colour is the selected variable at the slider year. Dashed sparklines and "proj" are UN WPP projections; "held" means the last observed value is carried forward — the engine will replace that.</p>
      {/if}

    {:else if tab === 'scores'}
      {#if !scores}<p class="muted">No scores.json — run <code>node scripts/build-scores-slice.mjs</code> after a backtest.</p>{:else}
        <div class="tiny muted" style="margin-bottom:6px">Rolling-origin backtest {scores.meta.file} · {scores.meta.runs} runs · +{scores.meta.horizon}y · universe {scores.meta.universe}{scores.meta.refit ? ' · coefficients refit per as-of year' : ' · full-sample coefficients (pre-refit)'}. Skill = 1 − Brier/Brier(base rate).</div>
        <table><tbody>
          <tr class="tiny muted"><td>template</td><td class="val">n</td><td class="val">exp/obs</td><td class="val">skill</td><td class="val">AUC</td></tr>
          {#each Object.entries(scores.pooled).sort((a, b) => (b[1].skill ?? -9) - (a[1].skill ?? -9)) as [t, v]}
            <tr><td class="lbl">{t}</td><td class="val mono">{v.n}</td><td class="val mono">{v.exp_obs == null ? '—' : v.exp_obs.toFixed(2)}</td><td class="val mono" style="color:{v.skill > 0.05 ? 'var(--good)' : v.skill < -0.05 ? 'var(--bad)' : 'inherit'}">{v.skill == null ? '—' : (v.skill >= 0 ? '+' : '') + v.skill.toFixed(2)}</td><td class="val mono">{v.auc == null ? '—' : v.auc.toFixed(2)}</td></tr>
          {/each}
        </tbody></table>
        <h3>By as-of year (exp/obs · AUC)</h3>
        <div style="overflow-x:auto"><table><tbody>
          <tr class="tiny muted"><td>as-of</td>{#each Object.keys(scores.pooled) as t}<td class="val">{t.replace(/_/g, ' ').slice(0, 10)}</td>{/each}</tr>
          {#each scores.byAsOf as r}
            <tr><td class="mono">{r.asOf}</td>{#each Object.keys(scores.pooled) as t}{@const c = r.templates[t]}<td class="val mono tiny" class:muted={!c || c.underpowered}>{c && c.n ? `${c.obs ? (c.exp / c.obs).toFixed(1) : '—'}·${c.auc == null ? '—' : c.auc.toFixed(2)}` : '—'}</td>{/each}</tr>
          {/each}
        </tbody></table></div>
      {/if}
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
  .spark { width: 160px; }
  .tiny { font-size: 10.5px; }
  .card { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
  .card.clickable { cursor: pointer; } .card.clickable:hover { background: var(--bg3); }
  .row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .kinds { display: flex; flex-wrap: wrap; gap: 4px; }
  .kind { font-size: 10.5px; padding: 1px 7px; border-color: var(--line); color: var(--fg2); }
  .kind.on { border-color: var(--c); color: var(--c); }
  .card.news { display: grid; grid-template-columns: 8px 34px 1fr; gap: 8px; align-items: start; padding: 6px 8px; margin-bottom: 4px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; }
  .pct { font-size: 11px; }
  .bars { display: grid; gap: 3px; }
  .bar-row { display: grid; grid-template-columns: 36px 1fr 30px; gap: 8px; align-items: center; font-size: 11px; }
  .bar { height: 8px; background: var(--bg3); border-radius: 2px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .regbar { display: flex; height: 12px; border-radius: 3px; overflow: hidden; margin: 4px 0; }
  .regbar i { display: block; height: 100%; }
  .sw { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; }
  .sw i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
  table.fc td.val { width: 44px; }
</style>
