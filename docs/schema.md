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
  stakes: { ISR: 0.6, SYR: 0.7 }   # 0-1, how much each side would pay to hold/take it (estimate)
  geometry:
    ne_ids: [1159320905]   # reference Natural Earth disputed-area features, and/or
    sketch: [[lon,lat], ...]   # a hand-drawn polygon (tagged so the UI can render it as a sketch)
  hazard: golan_buffer_control   # id of the control-change hazard (optional; static if absent)
  notes: ...
```

Control change is a competing-risks hazard over claimants (plus `status` transitions like `contested_active → frozen`). Its covariates come from the dyadic conflict hazard between controller and claimant, the military layer, and treaty hazards (`israel_syria_treaty` firing moves this to `buffer` with controller `UN`).

### Corridor (`data/corridors.yaml`)

Chokepoints and land corridors — the load-bearing infrastructure that turns transit into alliance.

```yaml
- id: hormuz
  name: Strait of Hormuz
  kind: chokepoint         # chokepoint | corridor
  mode: sea                # sea | rail | pipeline | hvdc | multimodal
  status: closed           # open | contested | closed | planned | building | built
  geometry: { point: [56.3, 26.5] }        # or  { line: [[lon,lat], ...] }
  transits: [IRN, IRQ, SAU, ARE, QAT]      # states whose territory/coast it runs through
  load_bearing_for: { CHN: 0.5, JPN: 0.6, QAT: 0.9 }   # 0-1 per dependent state; for planned corridors, the value once built
  notes: ...
```

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
