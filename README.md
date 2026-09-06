# Radiant

An open, versioned world model for the next 40 years: ~44 actors, contested territories, load-bearing corridors, competing-risk hazards, and resolvable claims — all as YAML in git, compiled to one JSON, run as a Monte Carlo in the browser, with uncertainty as the primary visual.

Origin: `docs/session-transcript.md` (the conversation that produced the scenario and the spec). Schema: `docs/schema.md`.

## Status

**M1 — data viewer + map** (done): scrubbable map 2000→2066 coloured by any registry variable, hatched territories, corridor/chokepoint overlay, per-actor data panel with sources and sparklines, hazard/claim/territory/corridor browsers. No engine yet — years past the data are held at the last value; the Monte Carlo replaces that.

## Run

```
npm install
./scripts/fetch-raw.sh          # ~60 MB of public data into data/raw (gitignored)
node scripts/build-geo.mjs      # Natural Earth -> data/geo/world.topo.json
node scripts/build-world.mjs    # data/*.yaml + data/raw -> public/world.json (validates, prints hazard 10-yr probabilities)
npm run dev                     # http://localhost:5173
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
data/raw/             fetched datasets (World Bank, UN WPP 2024, OWID/Energy Institute, IEA EV, Natural Earth)
scripts/              fetch + build + screenshot
src/lib/Map.svelte    D3-geo map; src/lib/Panel.svelte data panel; src/lib/data.js value-at-year + scales
```

## Adding a variable

1. Add an entry to `data/variables.yaml` (`id`, `group`, `kind`, `scope`, `source`, `display`).
2. If it needs a new dataset: add a fetcher in `scripts/build-world.mjs` returning `{ ISO3: { year: value } }`.
3. If it evolves over time: add `equation: <name>` and implement it in `src/engine/equations.js` (M2).

Nothing else needs to change — the map picker, panel tables and validation are generated from the registry.
