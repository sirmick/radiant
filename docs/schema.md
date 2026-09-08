# Radiant — data schema (M1)

Everything the engine and UI consume is compiled from `data/` into one `public/world.json` by `scripts/build-world.mjs`. Hand-edited files are YAML; fetched files live in `data/raw/` and are never edited. Every hand-coded number carries a `source` — a dataset name, or `estimate`. Estimates are fine; unlabeled numbers are not.

Time: quarterly steps, `t = 0` is 2026Q3. Horizon 160 steps (2066Q3). Year `y = 2026.5 + t/4`.

## Entities

### Actor (`data/actors.yaml`)

The ~44 states that matter for the scenario. Blocs are not actors; they emerge from the alliance graph (M2).

```yaml
- id: IRN                  # ISO 3166-1 alpha-3; TWN for Taiwan
  name: Iran
  region: mideast          # americas | europe | eurasia | mideast | south_asia | east_asia | sea | oceania | africa
  regime:
    type: closed_autocracy # liberal_democracy | electoral_democracy | electoral_autocracy | closed_autocracy   (V-Dem RoW)
    personalism: 0.6       # 0-1, V-Dem v2xnp_pers-style
    succession: 0.2        # 0-1, how institutionalised the next transfer of power is (1 = boring election)
    leader_born: 1960      # only where leader age is a hazard covariate; null otherwise
    leader_since: 2026
    source: ...
  nuclear:
    status: latent         # weapon | latent | none
    warheads: 0
  tech: "NNNINNNSSNNSSSI"  # 15 chars, one per capability in CAPABILITIES order; S=sovereign I=import N=none
  chokepoints: { hormuz: 0.8 }   # share of external trade that transits, 0-1 (estimate)
  notes: ...
```

`CAPABILITIES` (fixed order for the `tech` string):

| # | id | meaning |
|---|---|---|
| 0 | logic | leading-edge logic fabrication (≤5 nm) |
| 1 | memory | DRAM/HBM/NAND at scale |
| 2 | euv | EUV lithography tools |
| 3 | chem | semiconductor precursor chemistry, resists, high-purity gases |
| 4 | ai_compute | frontier-scale AI training compute |
| 5 | leo_isr | sovereign LEO imaging/ISR constellation |
| 6 | pnt | sovereign positioning/navigation/timing |
| 7 | strike | long-range autonomous strike (2,000 km class, mass-producible) |
| 8 | usv | unmanned surface/subsurface vessels at scale |
| 9 | de | directed energy / HPM air defence |
| 10 | nukes | deployed nuclear weapons |
| 11 | latency | fuel-cycle nuclear latency (enrichment or reprocessing) |
| 12 | launch | orbital launch |
| 13 | refining | domestic crude refining meeting ≥50% of demand |
| 14 | rail_hvdc | manufacturing of electrified rail + HVDC equipment |

Levels: `N` none, `I` imports (can lose it if the supplier is across an alliance cut), `S` sovereign. The tech-diffusion rule (M2) moves N→I→S; the alliance cut rule moves I→N.

Numeric fields (population, GDP, oil demand, working-age share, fertility, debt, trade openness, milex, R&D, net migration, resource rents, water stress, EV share, electricity mix…) are **not** hand-coded. The build script pulls them by ISO3 from `data/raw/` (World Bank WDI, UN WPP 2024, OWID/Energy Institute, IEA EV). Each compiled actor carries `series: { <var>: { years: [...], values: [...], source } }`.

### Territory (`data/territories.yaml`)

Any polygon whose controller is not its sole claimant. This is where the dice get rolled.

```yaml
- id: golan_buffer_2025
  name: Israeli buffer zone in southern Syria
  controller: ISR
  claimants: [SYR]
  status: occupied         # occupied | disputed | breakaway | buffer | contested_active | frozen
                           #  historical records also use: annexed | leased | protectorate | settled
  stakes: { ISR: 0.6, SYR: 0.7 }   # 0-1, how much each side would pay to hold/take it (estimate)
  stakes_source: estimate
  geometry:
    ne_ids: [1159320905]   # reference Natural Earth disputed-area features, and/or
    sketch: [[lon,lat], ...]   # a hand-drawn polygon (tagged so the UI can render it as a sketch)
    point: [35.9, 33.1]    # historical territories with no polygon layer: a point, tagged geometry_source
  history:                 # REQUIRED: dated control record; controller/status above are the 2026 snapshot
    - { year: 1882.70, controller: GBR, status: occupied, source: "Tel el-Kebir 13 Sep 1882" }
  hazard: golan_buffer_control   # id of the control-change hazard (optional; static if absent)
  notes: ...
```

A `kind: territory` event in `data/history/events.yaml` must name a record here; the build fails otherwise.

Control change is a competing-risks hazard over claimants (plus `status` transitions like `contested_active → frozen`). Its covariates come from the dyadic conflict hazard between controller and claimant, the military layer, and treaty hazards (`israel_syria_treaty` firing moves this to `buffer` with controller `UN`).

### Corridor (`data/corridors.yaml`)

Chokepoints and land corridors — the load-bearing infrastructure that turns transit into alliance.

```yaml
- id: hormuz
  name: Strait of Hormuz
  kind: chokepoint         # chokepoint | corridor
  mode: sea                # sea | rail | pipeline | hvdc | cable | multimodal
  status: closed           # open | contested | closed | planned | building | built | abandoned
  controller: IRN          # optional: who actually holds it (Suez 1882–1956 is why this exists)
  sponsor: DEU             # optional: who is building/financing it (corridor_status reads sponsor_great_power)
  geometry: { point: [56.3, 26.5] }        # or  { line: [[lon,lat], ...] }
  transits: [IRN, IRQ, SAU, ARE, QAT]      # states whose territory/coast it runs through
  load_bearing_for: { CHN: 0.5, JPN: 0.6, QAT: 0.9 }   # 0-1 per dependent state; for planned corridors, the value once built
  load_bearing_source: estimate            # every hand number carries a source or the literal `estimate`
  history:                 # REQUIRED: the dated status record. status/controller/completion above are the 2026 snapshot.
    - { year: 1869.87, status: open, controller: OTTOMAN, source: "opened 17 Nov 1869" }
    - { year: 1882.70, status: open, controller: GBR, capacity: 0.5, source: "..." }
  notes: ...
```

`status` values: `abandoned` is a corridor that was started and given up (Panama 1881–1889, Cape-to-Cairo) — distinct from
`planned` (never started) and `closed` (built, then shut). `mode: cable` covers telegraph/data cables, where the
load-bearing property is routing concentration rather than throughput.

Every `kind: corridor` / `kind: chokepoint` event in `data/history/events.yaml` must name a record here, and every record
must carry a non-empty `history`; `scripts/build-events.mjs` and `scripts/build-world.mjs` fail the build otherwise.

`load_bearing_for` is the corridor-dampener term in the dyadic conflict hazard: a dyad whose shared infrastructure is load-bearing for a third party gets its dispute hazard multiplied down, weighted by that third party's alliance edge to each side. "China won't let the rail through Iran be bombed" is this one number.

### Hazard (`data/hazards.yaml`)

Unknown-time events, competing risks, quarterly.

```yaml
- id: russia_transition
  name: Russian leadership transition
  outcomes: [managed, hardliner, fragmentation]    # single-outcome hazards have one entry
  outcome_weights: [0.5, 0.3, 0.2]                 # base split; covariates can shift it
  base_q: 0.012            # baseline quarterly rate; build script prints implied 10-yr P
  covariates:
    - { var: actors.RUS.leader_age, beta: 0.06, center: 73 }
    - { var: actors.RUS.fiscal_stress, beta: 0.8 }
    - { var: latent.oil_decline, beta: 0.5 }
  reference_class: "personalist autocracies, leader age > 70, in a stalemated war (n≈6)"
  fires:                   # state rewrites and multipliers on other hazards, per outcome
    managed:  { set: { actors.RUS.regime.personalism: 0.5 }, mult: { ukraine_freeze: 3.0 } }
    hardliner: { mult: { ukraine_freeze: 0.5, baltic_incident: 2.0 } }
    fragmentation: { set: { actors.RUS.regime.type: state_failure }, mult: { ukraine_freeze: 4.0 } }
  source: estimate
```

Rate: `λ_t = base_q × exp(Σ β·(x − center))`, `P(fire in quarter) = 1 − exp(−λ_t)`. Recomputed every step from current state, never precomputed.

### Latent factor (`data/latents.yaml`)

Shared draws so correlated beliefs aren't sampled independently. Each run draws one value per latent (Gaussian, then transformed), and parameters/hazards that reference it read the same draw.

```yaml
- id: us_reliability
  description: how dependable the US is as an ally/supplier over the run
  prior: { mean: 0.45, sd: 0.2, clip: [0, 1] }
  drives: [visa_policy, export_control_enforcement, alliance_pull_USA]
```

### Claim (`data/claims.yaml`)

A resolvable statement plus the query that computes it from a sampled world.

```yaml
- id: iran_bomb_2036
  statement: Iran conducts a nuclear test or is officially assessed to possess a weapon by 2036-09-01
  type: event              # event | structural | conditional
  horizon: 2036-09-01
  prior: 0.30              # first human estimate, never edited
  p_history: [[2026-09-06, 0.30, human]]
  query: "actors.IRN.tech[10] == 'S' by 2036Q3"
  depends_on: [iran_consolidation, hormuz_reopens]
  antagonists: [isfahan_heu_removed]
  resolution: "IAEA / US / Israeli official assessment; CTBTO-detected test"
  falsifiers: ["verified HEU export", "IAEA continuity of knowledge restored for 2+ years"]
  signals: [iaea_quarterly, isfahan_imagery]
```

The engine reports `model_p` (fraction of runs where the query holds) next to the human `p`. Disagreement is the point.

### Scenario (`data/scenarios/*.yaml`)

A named set of overrides — latent means, hazard multipliers, parameter values — encoded into the URL when shared. `the_thread.yaml` is the conversation's story.

## Compiled output (`public/world.json`)

```
{ meta: { built, t0: "2026Q3", steps: 160 },
  capabilities: [...15 ids...],
  actors: { IRN: { ...static fields..., series: {...} }, ... },
  territories: [...], corridors: [...], hazards: [...], latents: [...], claims: [...],
  geo: <TopoJSON: countries + disputed> }
```

The engine (`src/engine/`) reads this, runs N worlds in a Worker, and writes results into typed arrays the UI queries: per-variable percentile bands by year, per-hazard firing-time histograms, per-territory controller frequencies by year, per-claim marginals, and a run×event bitmask for conditioning.


## Military presence (`data/presence.yaml`) — added 2026-09-07

Dated great-power stations: `{ actor, host | sea:<area>, name, kind: base|garrison|fleet|advisors, level 1–3, from, to|null, geometry: [lon, lat], source }`. `level` 1 = outpost/advisors, 2 = base or brigade-scale, 3 = fleet HQ / corps-scale / occupation. Entries whose `source` contains `operator` are the user's own observations and are drawn with emphasis and labelled unverified. Compiled to `public/presence.json` by `scripts/build-presence-slice.mjs`; consumed by the map's presence layer and the influence field, and, since 2026-09-07 (`operator / presence`, package 7), by the model. `src/engine/presence.js` is the only place these records become numbers and is imported by `scripts/build-panel.mjs`, `scripts/lib/fit.mjs` and `src/engine/core.js` at once. Two conventions it states: a station is present in year y iff `from <= y < to` (`to` is the year the presence *ended*, so a withdrawal is visible in the year the source dates it), and the layer's coverage claim is 1870-2026, outside which every derived column is null rather than zero. It produces the panel columns `presence_<POWER>` (for each power with at least `PRESENCE.min_hosts` distinct land hosts), `presence_any`, `presence_change` (some power's level on this actor fell inside the last 3 years) and `troops_usa_host` (Troopdata, the measured series the 0-3 ordinal is calibrated against); the dyad features `patron_presence` and `patron_presence_rival`; and the record-year features `guarantor_presence` (the largest per-power *sum* of station levels within 1,500 km of the record or on one of its transit states - a sum, because the maximum of a 1-3 ordinal saturates and no withdrawal can lower it while one other station remains) and `guarantor_withdrawal` (that weight fell inside the last 3 years), which is the only one promoted. The layer is **frozen at as-of in the engine**, like the alliance and border graphs, while its recency terms still age against the simulated year.

## Dated history on records

Corridors and territories carry `history: [{ year, status?, controller?, capacity?, source }]`; the top-level `status`/`controller` is the 2026 snapshot. The viewer reads the entry in force at the slider year (`statusAt`) and does not draw a record before its first entry; `scripts/build-events.mjs` and `scripts/build-world.mjs` fail the build when a `corridor`/`chokepoint`/`territory` event id has no record, or a record has no history. The corridor-year / chokepoint-year panel unit (package 4) is built from these histories.

## Fields (`src/lib/influence.js`)

A field is a continuous geographic overlay: `{ label, note, paint: 'dominant'|'heat', groups(ctx), sources(ctx) -> [{ group, polygonKey?, lonlat?, w, lambda }], color(ctx, group), threshold }`. Sources add `w` to every grid cell inside a polygon and/or `w·exp(−d/λ)` around a point. `dominant` paints each cell with its leading group at an opacity equal to the margin over the runner-up; `heat` paints one hue at an opacity proportional to intensity. Weights are `estimate` — fields are pictures of the data layers, not fitted quantities. Registered: `influence`, `conflict`.

## Ensembles (`public/forecast*.json`, `public/forecasts.json`)

`run-forward.mjs` writes `{ meta: { asOf, from, to, runs, horizon, fit_source, templates }, actors: { id: { regime0, p: { template: cumulative P by year }, regime: [[p0,p1,p2,p3] per year], gdp_pc: [[q10,q50,q90]], info_access } }, dyads: { "A|B": { template: { pAny, curve } } } }`. With `--as-of Y < 2025` the coefficients are refit on labels ≤ Y (`scripts/lib/fit.mjs`), and the index `forecasts.json` lists every ensemble for the viewer's *forecast from* menu.


## Cleanup 2026-09-07

- `data/variables.yaml`: entries with `model: false` are display-only snapshot estimates (fiscal breakeven, desalination dependence, food self-sufficiency, mineral refining share, reserve-currency share, refining coverage, STEM inflow, openness, war losses, chokepoint exposure, and every `cap_*` level). The viewer shows them labelled as estimates; `build-world.mjs` fails if any template covariate reads one. The scenario latents were deleted (nothing read them; the originals are in `docs/origin/`).
- `data/templates.yaml` has a top-level `retired:` list (ERT episode templates, `autocratize_step`, `sovereign_default`) that no script loads; `templates:` is the active set. Switched-off candidates (coalition joining, war duration) stay declared on their templates with their numbers.
- `scripts/analysis/` holds the implementation one-offs; `scripts/shot.mjs` is gone (`shot2.mjs`).
