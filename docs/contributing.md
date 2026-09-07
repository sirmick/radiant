# Contributing — how to add things

The rules first, because every recipe below assumes them:

1. **No country names in `data/templates.yaml` or `src/engine/`.** Country specifics are data.
2. **Every hand-set number carries `source:` or `estimate`.** Operator observations are tagged `operator … unverified`.
3. **Fit and simulation are the same model.** A feature built in `scripts/lib/fit.mjs` is built identically in `src/engine/core.js`; share the code.
4. **State-transition templates use `lead: 1`** (label = next year's event). Era-interacted covariates need a `holdout_split` that leaves the era partly in training.
5. **Nothing is deleted.** Retire (`retired:`), monitor (`status: monitored`), or record under `rejected:` with the numbers.
6. **The build must stay green:** `npm run build:hist` and the baseline backtest; `npx vite build` if `src/` changed.

## Add a covariate to a template (existing panel variable)

Append to the template's `candidates:` in `data/templates.yaml`:
```yaml
- { id: info_access, var: info_access, transform: z, prior: 0, hypothesis: "why it should matter" }
```
Run `node scripts/fit-hazards.mjs <template>`; the ablation block prints base / +each / +all on the era holdout. Promote by moving it into `covariates:` with a `lifecycle: { phase: active, promoted: <date>, reason: "<numbers>" }`, or move it to `rejected:` with the evidence. Then `npm run backtest` and record the delta in `docs/refine-log.md`.

## Add a panel variable (new derivation or dataset)

1. Fetcher: `scripts/fetch-wb.mjs` for World Bank codes, or a new block in `scripts/fetch-raw.sh`.
2. `scripts/build-panel.mjs`: read the file, `put(id, 'var', year, value)`, add `sources.var = '…'`; if absence inside the source window means zero, add it to `FLAGS`.
3. If the engine must evolve it forward, add the rule in `src/engine/core.js` `stepYear` (and the identical construction for the fitter if it is a feature).
4. Register it as a candidate (above). This is a *new mechanism* by the loop's rules, so if an agent proposes it, it goes through `docs/escalations.md`.

## Add a template

Append to `data/templates.yaml`: `id, label, unit (actor-year|dyad-year|corridor-year), event (a kind in data/events.json), event_filter?, window, holdout_split, lead, sample?, covariates (with priors and literature), sources`. If the event kind is new, emit it in `scripts/build-events.mjs` and add its truth window to `COVERAGE` in `scripts/backtest.mjs`. Give the engine a state rewrite for it in `applyActorEvent` (there is a `HANDLED` guard that throws otherwise).

## Add an event, corridor, territory, presence record

- Event: `data/history/events.yaml` — dated, with `source`. Wars need `sides`; corridor/chokepoint/territory events need an id that exists in the corresponding YAML (the build fails otherwise).
- Corridor/territory: a record with geometry (`point`, `line`, `ne_ids`, or `sketch` + `geometry_source`), `transits`, `load_bearing_for` (estimate), and a dated `history`.
- Presence: `data/presence.yaml` — `actor, host|sea:<area>, kind, level, from, to, geometry, source`.
- Rebuild the slices (`npm run build:ui-data`, `build-alliance-slice`, `build-presence-slice`, `build-world`) to see it on the map.

## Add an actor

`data/history/actors.yaml` for a historical entity (lifecycle, successor, GW/CoW codes, OWID code, `great_power` dates, `successor_borders_until` if a modern-borders series must be dropped); `data/actors.yaml` for a modern snapshot. Fit-only states come from the countrycode panel automatically.

## Add a field (map overlay)

Register in `src/lib/influence.js` `FIELDS`: `label`, `note`, `paint` (`dominant`|`heat`), `groups(ctx)`, `sources(ctx)` returning `{ group, polygonKey?, lonlat?, w, lambda }`, `color`, `threshold`. `ctx` carries the year's powers, pacts, presence, conflicts and centroid lookups from the map. Add the option to the field selector in `src/App.svelte`.

## Add a viewer variable

History: add it to `VARS` in `scripts/build-history-slice.mjs` (label, unit, format, categorical/log). Forecast: it appears automatically for every simulated template. Modern: add it to `data/variables.yaml` with `display.map`.

## Propose a mechanism the loop must decide on

Write a section in `docs/escalations.md` with **Adds / Why / Data it needs / Templates it feeds / Test that decides it**. That format is what the implementer executes and the checker verifies.
