# Radiant

A world model you can argue with. One historical panel (every state, 1816–2025), one dated event log, one dated infrastructure layer (corridors, chokepoints, territories, military presence), a set of **generic** hazard templates fitted on that history, and one engine that steps the world forward a year at a time — whether the clock says 1870 (a backtest) or 2025 (a forecast). A browser viewer shows the whole thing as a scrubbable map, and an adversary/fixer/checker loop refines the model era by era with every change measured against the backtest.

Nothing hand-typed drives the engine. Every number carries a source or is labelled `estimate`; every mechanism has a fitted history and a holdout score; every proposed factor earns its place by ablation or is recorded as rejected with the numbers.

- **Play with it, no install:** **https://sirmick.github.io/radiant/** — the built viewer, deployed from this repo by GitHub Actions on every push (`.github/workflows/pages.yml`). Scrub the timeline, pick a view (Politics · Power · Conflict · Routes · Industry · Forecast), flip to 3D, hover a country; past 2025 read the forecast as a consensus, as one sample world of the ensemble (flip between worlds), or as odds. Every state of the viewer is a link (the URL hash).
- **Run it locally:** `git clone https://github.com/sirmick/radiant && cd radiant && npm install && npm run dev` → http://localhost:5173. The map data (`public/*.json`) is committed, so this needs no data build; the pipeline below is only for regenerating it.
- **Docs index:** [docs/system.md](docs/system.md) (how the loop keeps it honest) · [docs/schema.md](docs/schema.md) (entities and files) · [docs/data-catalogue.md](docs/data-catalogue.md) (every dataset) · [docs/ui.md](docs/ui.md) (the viewer) · [docs/runbook.md](docs/runbook.md) (commands and workflows) · [docs/contributing.md](docs/contributing.md) (how to add things) · [docs/glossary.md](docs/glossary.md) · [docs/refine-log.md](docs/refine-log.md) (what each loop turn changed) · [docs/escalations.md](docs/escalations.md) (decisions for the operator) · [docs/ui-review.md](docs/ui-review.md) (UI gaps, ranked).
- **Origin:** [docs/origin/](docs/origin/) — the conversation that started it and the hand-typed 2026 scenario it produced, retired on 2026-09-07 ("faithful first").

## Quick start

```
npm install
./scripts/fetch-raw.sh                 # public datasets into data/raw (gitignored, ~150 MB)
npm run build:hist                     # panel -> events -> fits           (data/panel.json, events.json, fits.json)
npm run backtest                       # rolling-origin backtest           (scores/)
npm run forecast                       # 2026-2125 ensemble, 300 runs       (public/forecast.json, ~7 min)
node scripts/build-geo.mjs && node scripts/build-world.mjs && npm run build:ui-data   # map data (public/*.json)
npm run dev
```

The full command reference is in [docs/runbook.md](docs/runbook.md).

## What is modelled

| layer | file(s) | what |
|---|---|---|
| Actors | `data/history/actors.yaml`, `data/actors.yaml`, countrycode panel | 217 states with lifecycles (introduced / retired / successor / spans); 64 modelled in detail |
| Panel | `data/panel.json` (built) | ~65 actor-year covariates 1816–2025: regime, capability, economy, demography, information access, alliances, superpower ties, neighbourhood |
| Events | `data/events.json` (built), `data/history/events.yaml` | ~8,000 dated events: leader exits, coups, regime steps, disputes, wars, civil-war onsets, corridor/chokepoint/territory changes, nuclear acquisitions |
| Infrastructure | `data/corridors.yaml`, `data/territories.yaml`, `data/presence.yaml`, `data/waves.yaml` | corridors and chokepoints with dated `history`; contested territories with dated control; great-power bases, garrisons and fleet areas; capability waves |
| Templates | `data/templates.yaml`, `data/fits.json` (built) | generic hazards (no country names): leader exit, irregular exit, coup, regime steps up/down, liberal erosion, civil-war onset, dispute, war, chokepoint and corridor status; fitted with era holdouts, candidates and rejections recorded |
| Engine | `src/engine/core.js` | annual step: structural drift, actor hazards, dyad hazards (politically relevant dyads), corridor hazards, births/retirements, great-power dates, rivalry decay |
| Scores | `scores/*.json` | rolling-origin backtests: coefficients refit on labels ≤ as-of, scored only inside each dataset's truth window |
| Forecasts | `public/forecast*.json` | ensembles from 2025 and from past as-of years (1900, 1930, 1955, 1975, 1990, 2005) |

## Status (2026-09-07)

- **M1** viewer + map · **M2a** historical pipeline and backtest · **M2b** forward ensemble on the map — done.
- **Refinement loop** (`.claude/workflows/refine.js`): eras 1870–1914 and 1914–1945 done and checked; loop restarts after the implementation run.
- **Implementation run** (`.claude/workflows/implement.js`): approved escalations — rolling-origin refit ✔, war process ✔ (duration built, not promoted), coalitions ✔ (era term promoted; joining built, not promoted), corridor layer scored ✔, data quality and modern fold in progress, then re-baseline.
- **Queued packages:** military presence (data and map exist; model wiring), termination hazards (war end, chokepoint reopen, contest settle), alliance model layer + blocs.
- **UI:** timeline 1870–2066 with play, history and forecast layers, past-as-of forecasts with actual-vs-forecast, News, Scores, flags/regime glyphs, alliances, conflicts, military presence, continuous fields (spheres of influence, conflict intensity), hover cards, URL state.

## Repository layout

```
data/                 hand-authored YAML (source-tagged) + built JSON artefacts
  history/            actor lifecycles, hand-coded events 1816–2026
  raw/                fetched datasets (gitignored)
docs/                 documentation (index above)
agent/                procedures for the loop's adversary, fixer, checker, implementer
.claude/workflows/    refine.js (attack → fix → check per era), implement.js (approved packages → checker → baseline)
scripts/              fetch, build, fit, backtest, forecast, UI slices, screenshots  (docs/runbook.md)
src/engine/core.js    the engine (node + browser)
src/lib/              viewer: Map.svelte, Panel.svelte, data.js, influence.js (fields)
scores/               backtest outputs
public/               compiled data the viewer loads
```
