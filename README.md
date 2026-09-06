# Radiant

An open, versioned world model for the next 40 years: ~44 actors, contested territories, load-bearing corridors, competing-risk hazards, and resolvable claims — all as YAML in git, compiled to one JSON, run as a Monte Carlo in the browser, with uncertainty as the primary visual.

Origin: `docs/session-transcript.md` (the conversation that produced the scenario and the spec). Schema: `docs/schema.md`.

## Status

**M1 — data viewer + map** (done): scrubbable map 2000→2066 coloured by any registry variable, hatched territories, corridor/chokepoint overlay, per-actor data panel with sources and sparklines, hazard/claim/territory/corridor browsers.

**M2a — historical pipeline + backtest** (done, offline in node): actor-year panel 1816–2025 for all 217 states (CoW NMC/MID/alliances, Maddison, V-Dem, UCDP, REIGN, OWID energy, World Bank), 8,071 dated events, contiguity from CShapes, 8 generic hazard templates fitted with era holdout, an annual-step engine, a rolling-origin backtest (as-of 1870…2000, +20y), and an ablation loop for candidate factors. See `docs/system.md`. Not yet wired to the map.

## Run

```
npm install
./scripts/fetch-raw.sh          # ~60 MB of public data into data/raw (gitignored)
node scripts/build-geo.mjs      # Natural Earth -> data/geo/world.topo.json
node scripts/build-world.mjs    # data/*.yaml + data/raw -> public/world.json (validates, prints hazard 10-yr probabilities)
npm run dev                     # http://localhost:5173
```

Historical pipeline + backtest (all offline once `data/raw/hist` is fetched — see `scripts/fetch-raw.sh` and the URLs in `scripts/build-panel.mjs`):

```
node scripts/build-panel.mjs      # -> data/panel.json   actor-year covariates 1816–2025
node scripts/build-events.mjs     # -> data/events.json  dated events (machine + data/history/events.yaml)
node scripts/fit-hazards.mjs      # -> data/fits.json    MAP logistic per template, holdout AUC, calibration
node scripts/backtest.mjs --from 1870 --to 2000 --step 10 --horizon 20 --runs 100   # -> scores/
```

Screenshot check: `npx vite preview` then `node scripts/shot.mjs http://localhost:4173/ out.png [actor:IRN] [2050]`.

## Layout

```
data/variables.yaml   the registry — every variable the model tracks; build, engine, UI all read it
data/actors.yaml      44 states: regime, nuclear, capability map, chokepoint exposure (hand-coded, source-tagged)
data/territories.yaml 29 polygons whose controller ≠ sole claimant
data/corridors.yaml   16 chokepoints + land corridors with load_bearing_for
data/hazards.yaml     32 competing-risk hazards: base_q, covariates, reference class, fires
data/claims.yaml      25 resolvable claims with priors and model queries
data/overrides.yaml   hand values where datasets are silent (Taiwan, North Korea)
data/templates.yaml   generic hazard templates (no country names): event, unit, covariates, literature priors
data/waves.yaml       capability waves 1825→ with introduction/saturation/retirement and first-sovereign years
data/history/         historical actor lifecycles (Prussia→DEU, Ottoman→TUR…) and hand-coded events 1816–2026
data/panel.json, events.json, fits.json   built artefacts of the historical pipeline
src/engine/core.js    annual-step engine: createWorld(asOf) → stepYear → runEnsemble
scores/               backtest outputs
data/raw/             fetched datasets (World Bank, UN WPP 2024, OWID/Energy Institute, IEA EV, Natural Earth)
scripts/              fetch + build + screenshot
src/lib/Map.svelte    D3-geo map; src/lib/Panel.svelte data panel; src/lib/data.js value-at-year + scales
```

## Adding a variable

1. Add an entry to `data/variables.yaml` (`id`, `group`, `kind`, `scope`, `source`, `display`).
2. If it needs a new dataset: add a fetcher in `scripts/build-world.mjs` returning `{ ISO3: { year: value } }`.
3. If it evolves over time: add `equation: <name>` and implement it in `src/engine/equations.js` (M2).

Nothing else needs to change — the map picker, panel tables and validation are generated from the registry.
