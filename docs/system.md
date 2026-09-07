# Radiant — the system, not the model

The model is a set of generic sub-models instantiated from data. The system is the loop that keeps it honest: every number has a source, every hazard has a fitted history, every forecast is dated and later scored, and every new factor has to earn its place.

## Pipeline

```
data/raw/hist/*        ─┐
data/history/*.yaml    ─┼─▶ build-panel.mjs  ─▶ data/panel.json      actor-year covariates 1816–2025
                        ├─▶ build-events.mjs ─▶ data/events.json     dated events 1816–2026 (machine + hand)
data/templates.yaml    ─┴─▶ fit-hazards.mjs  ─▶ data/fits.json       MAP logistic per template, era holdout, calibration
                                                     │
src/engine/core.js  ◀───────────────────────────────┘   annual-step stochastic engine (node + browser)
scripts/backtest.mjs  ─▶ scores/backtest-*.json         rolling-origin: as-of 1870…2000, +20y, Brier/AUC/calibration per template
data/*.yaml (modern)  ─▶ build-world.mjs ─▶ public/world.json      current-state viewer (M1)
```

Everything is reproducible offline: `./scripts/fetch-raw.sh` (once), then `node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs && node scripts/backtest.mjs`.

## The three honesty mechanisms

**As-of dating.** `createWorld({asOf})` builds the world from the panel as it stood that year. Same code, different date = a backtest. Ground truth is scored only inside each dataset's coverage window (`COVERAGE` in `backtest.mjs`); absence past a dataset's end is not a non-event.

**Lifecycles.** Actors (`data/history/actors.yaml`: `introduced` / `retired` / `successor`), capability waves (`data/waves.yaml`: `introduced` / `saturates` / `retired`), and variables (`introduced`, `lifecycle.phase`, `influence.window`) all carry dates. A saturated variable stops discriminating on its own (no cross-actor variance); an explicit window handles factors whose relevance ends before their variance does. Retired ≠ deleted — backtests need the data.

**Ablation scoring.** A proposed factor is a PR with a registry entry, sources, initial values, the templates it feeds, and a reference class. CI runs the backtest with and without it. The Brier/CRPS delta is its evidence. It lands as `candidate` (compiled, visible, not wired into hazards) and is promoted by backtest improvement or by a human with a stated reason and a `review_by` date. The same test applies to removals.

## Generic sub-models (templates)

No country names in `data/templates.yaml`. Each template predicts one event kind on one unit (actor-year or dyad-year) from panel covariates with literature priors; `fit-hazards.mjs` fits coefficients and reports era-holdout AUC. Country specifics live in data: outcome mixes for succession, stakes for territories, `load_bearing_for` on corridors.

| template | unit | fitted on | holdout AUC (first fit) |
|---|---|---|---|
| leader_exit | actor-year | REIGN 1950–2021 | 0.63 |
| irregular_exit | actor-year | REIGN + Powell–Thyne | 0.81 |
| coup_attempt | actor-year | Powell–Thyne | 0.88 |
| autocratization_onset | actor-year | V-Dem ERT 1900–2024 | — (too few pre-1946) |
| democratization_onset | actor-year | V-Dem ERT | 0.65 |
| intrastate_onset | actor-year | UCDP 1946–2024 | 0.83 |
| mid_force | dyad-year | CoW MID 1816–2001 | 0.86 |
| mid_war | dyad-year | CoW MID | 0.74 |
| weaponization, chokepoint_status, corridor_status, sovereign_default | — | prior only (no panel sample yet) | — |

## Full scale (2026-09-06, later): fit on all 217 states, simulate 64

Templates are generic, so they are fitted on every state in the CoW/GW system (countrycode panel crosswalk), and only the modeled actors are simulated. Contiguity is derived from CShapes 2.0 polygons (30 km buffer); dyads are restricted to politically relevant pairs (contiguous or ≥1 major power). Two user hypotheses were promoted through the ablation loop: `info_access` (−0.88 on coup odds per SD) and `great_game` (superpower client × bipolar era, +0.54).

Backtest as-of 1950…2000, +20y, all states: coup_attempt exp/obs 1.08, Brier skill +0.27, AUC 0.81, calibration deciles 2→1 17→14 40→42 56→51 74→67; intrastate +0.16; autocratization +0.10; democratization +0.12; mid_force +0.16 (contiguity in; "allied" flips from +0.35 to −0.13 once contiguity is controlled — Bremer's artefact). Post-Cold-War coup over-prediction went 2.55×/3.48× (as-of 1990/2000) → 1.08×/1.46×.

## Neighbourhood diffusion: tested and rejected (2026-09-06)

Candidates `nbr_democracy_share`, `nbr_regime_up/down_recent`, `bad_neighbourhood`, `nbr_conflict_count`, `nbr_coup_recent` on four templates, holdout ≥1990. Wrong sign or no holdout gain everywhere (democracy share −0.25 on democratization, +0.36 on autocratization: survivor selection — the autocracies left inside democratic neighbourhoods are the resilient ones; the 2010s backsliding happened inside democratic Europe). Recorded under `rejected:` in `data/templates.yaml` so the loop does not re-propose them.

Two things the test surfaced instead:
- **Target definition matters more than covariates.** V-Dem RoW category steps (`democratize_step`, `autocratize_step`) replace ERT "episodes" as the regime templates. An apparent AUC jump to 0.77 was leakage — events dated to the year the new regime is observed, credited to rows already in the new category. Fixed by `lead: 1` (label = next year's event; hazard from this year's state applies to the coming year, which is how the engine uses it). Honest one-year holdout AUC is 0.59 for both directions.
- **Dynamic backtest, all states, 1950–2000 +20y:** autocratize_step skill +0.17, AUC 0.77 (calibration 17→3 30→19 43→41 55→52 67→62); democratize_step skill −0.12, AUC 0.52 — calibrated but no discrimination. Which autocracies democratize is not predictable from income, growth, war and leader turnover; Przeworski's "predicting emergence is hard" reproduces. Open: `irregular_exit` over-predicts 1.9× dynamically (coup-trap feedback needs decay).

## External influence beats neighbours (2026-09-06, user hypothesis)

Channels operationalised per actor: `pact_usa` / `pact_rus` (CoW alliances), `great_game` (client × bipolar era), `aid_conditionality` (ODA/GNI × 1992–2016 promotion era), `patron_regime`, `hegemon_regime`, `hegemon_x_client`. Identification lesson: era-interacted terms need a holdout that leaves the era partly in training — `holdout_split: 2005` for the regime templates (with 1990, conditionality is all-zero in training and the coefficient never leaves its prior).

Promoted: on `democratize_step` aid_conditionality +0.78 (holdout AUC 0.578→0.641), pact_usa +0.90, pact_rus −0.23; on `autocratic_closure` aid_conditionality −0.59 (0.565→0.617), great_game +0.15 (+0.62 alone). Untestable for now: `hegemon_regime` (no cross-section), `hegemon_x_client` (collinear with pact_usa while the US scored 3 every year — first variation is 2025 = 2). `liberal_erosion` (3→2) split off from closures per bucket C; 28 events, model predicts 4% of post-2005 erosions, `info_access` +1.05 in-sample — the polarisation channel, unpromotable on n=28.

Dynamic backtest, all states, 1950–2000 +20y: democratize_step AUC 0.52→0.67; autocratic_closure skill +0.09, AUC 0.68; coups +0.27 unchanged.

## What the first backtest said (as-of 1870…2000, +20y, 100 runs, 67 actors)

- One-year fits with AUC 0.8+ become 20-year dynamic forecasts with AUC 0.65–0.8 and mostly near-zero Brier skill over the base rate. That is the honest starting point.
- **Feedback amplification**: recurrence covariates (`win5(mid_force)` +2.9, conflict trap +1.5) are right one year ahead but self-perpetuate in simulation → disputes over-predicted ~1.5×, intrastate onsets ~1.7×. Fix: fit the recurrence term on multi-year horizons, or add decay.
- **Secular trends**: coups over-predicted 2.5–3.5× for as-of 1990/2000 — their decline after 1990 is an era effect the covariates don't carry. Candidate factor: a global `coup_norm` latent, or `year` as a covariate with a prior of zero.
- **Missing covariates the literature says matter**: contiguity (Bremer's #1), infant mortality and bad-neighbourhood (PITF), external debt (defaults). All fetchable; all in `templates[].missing`.

## The weekly loop (to build)

```
signals ─▶ triage (local model) ─▶ proposals (frontier model, PR) ─▶ human merge ─▶ rebuild + refit + backtest (CI) ─▶ snapshot ─▶ score resolved ─▶ diff page
```

Four proposal kinds: covariate update (auto-mergeable from allowlisted sources), event (append to `data/history/events.yaml` — scoring and refit data at once), claim delta (capped ±0.05/wk), new factor (candidate package, ablation-tested). Quarterly: refit rates with a Gamma–Poisson update; monthly: adversary pass on claims.

## Guardrails

- Build fails on an unresolvable path, a missing equation, or an unlabelled number.
- Golden run: fixed-seed ensemble diffed in CI; data changes may move it, template bugs may not.
- Signals are allowlisted per claim; everything else is context.
- Schema version in every compiled artefact; migrations are scripts.
