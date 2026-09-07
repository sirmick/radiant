# Radiant — the system, not the model

The model is a set of generic sub-models instantiated from data. The system is the loop that keeps it honest: every number has a source, every hazard has a fitted history, every forecast is dated and later scored, and every new factor has to earn its place.

## Pipeline

```
data/raw/hist/*        ─┐
data/history/*.yaml    ─┼─▶ build-panel.mjs  ─▶ data/panel.json      actor-year covariates 1816–2025
                        ├─▶ build-events.mjs ─▶ data/events.json     dated events 1816–2026 (machine + hand)
data/templates.yaml    ─┴─▶ fit-hazards.mjs  ─▶ data/fits.json       MAP logistic per template, era holdout, calibration
                            (scripts/lib/fit.mjs)       │               the same fitter refits per as-of year for the backtest
src/engine/core.js  ◀───────────────────────────────────┘   annual-step stochastic engine (node + browser)
scripts/backtest.mjs  ─▶ scores/backtest-*.json         rolling-origin in state *and* coefficients: as-of 1870…2010, +20y, Brier/AUC/calibration per template
data/*.yaml (modern)  ─▶ build-world.mjs ─▶ public/world.json      current-state viewer (M1)
```

Everything is reproducible offline: `./scripts/fetch-raw.sh` (once), then `node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs && node scripts/backtest.mjs`.

## The honesty mechanisms

**As-of dating.** `createWorld({asOf})` builds the world from the panel as it stood that year: state, the alliance graph and the border graph are all frozen at `asOf`, and actors are introduced and retired during the run from their dated system membership. Same code, different date = a backtest — **for the coefficients as well as the state, since 2026-09-07**: `backtest.mjs` refits every template at every as-of year on rows whose *label* year is at or before it (`--refit`, the default; `scripts/lib/fit.mjs` is the shared fitting layer, `--no-refit` restores the old full-sample behaviour for comparison). Every scored row carries `fit_split`, `fit_source` and `leaky`. Where a forecaster standing at the as-of date has too little history to fit a template at all, the row is reported with `n: 0` and the counts that failed and is kept out of `pooled` — an unfitted model is a miss, not a clean score. That is what the pre-1900 dyad rows turn out to be: at as-of 1870 and 1880 there is no fittable dyad-year sample (CShapes contiguity begins 1886), so the 0.79–0.82 `auc_at_risk` those rows used to report was a report on data the forecaster could not have had. Ground truth is scored only inside each dataset's coverage window (`COVERAGE` in `backtest.mjs`); absence past a dataset's end is not a non-event.
Three additions from the 1914–1945 turn (2026-09-06): **great-power membership is frozen at as-of too** — it used to be read forward from the panel at the simulated year, so a run knew who stopped being a great power in 1917, 1918, 1943 and 1945, and it both gates the politically-relevant dyad filter and carries `major_power_any` (worth roughly 0.03 of the pre-1946 dyad AUC; great-power entry/exit as a modelled hazard is escalated). **The event list is truncated at as-of inside `createWorld`**, so nothing dated later can reach an actor's `recent` memory. **An actor introduced inside the horizon is built from the panel at as-of**, not from the row of its birth year — that row is an observation the forecaster cannot have (IND entered an as-of-1930 run with its 1947 polyarchy). Where the as-of row is empty it takes a stated `entryPrior` (the median live actor at as-of) and the imputed variables are recorded on the actor state. The *existence* of the new actor is still read from the dated system membership; that is a known remaining leak.
The corridor layer joined the scored model on 2026-09-07 (`era-1914-1945 / corridors-7`): one row per corridor or chokepoint record per year, the label being a change of the record's **status or controller** during the year, covariates joined from the panel over the record's dated transit states (a transit that is not a live actor is followed through the successor chain, and the controller counts as a transit). The construction lives in `src/engine/core.js` and is read by the fitter and the engine from the same code. Its ground-truth window is `chokepoint`/`corridor` = 1869–1945 in `COVERAGE`: the hand-coded record layer is complete only where the refine loop has been, and two records demonstrate that it is not complete after 1945 — the Bosphorus closes in 1939 and never reopens, Kiel is `open/GBR` in 1945 and never returns to German control. The templates are still *fitted* on the whole record (1869–2025), so the published full-sample fit carries a post-1945 base rate biased low; the backtest rows at as-of ≤ 1940 are refit on labels ≤ as-of and do not.
Occupation is data, not a hazard: `data/history/events.yaml` carries dated `kind: occupation` spans, and a regime step inside one (or inside the settlement the occupier wrote, `imposed_until`) is stamped with a `cause` and filtered out of the domestic regime templates rather than deleted.

**At-risk scoring.** Each `byAsOf[].templates[]` row carries `n_at_risk` (units the model can put any mass on), `auc_at_risk` and `n_structural_miss` (observed events in units the relevance filter zeroes out forever). The headline `auc` over all dyads mostly measures the politically-relevant-dyad filter; `auc_at_risk` is what the fitted coefficients do. A template with no at-risk unit is reported with `n: 0` and a reason rather than being dropped from the score.

**Lifecycles.** Actors (`data/history/actors.yaml`: `introduced` / `retired` / `successor`), capability waves (`data/waves.yaml`: `introduced` / `saturates` / `retired`), and variables (`introduced`, `lifecycle.phase`, `influence.window`) all carry dates. A saturated variable stops discriminating on its own (no cross-actor variance); an explicit window handles factors whose relevance ends before their variance does. Retired ≠ deleted — backtests need the data.
An actor whose territory is not its modern successor's declares a **constituent set** instead of a code (`derived_series` in `data/history/actors.yaml`, 2026-09-07): `population` is the share-weighted sum of the modern successor series that made it up and `gdp_pc` their population-weighted mean, with dated `from`/`to` per part for territory gained or lost, and Maddison's benchmark years log-linearly interpolated inside each part (flagged per actor-year in `gdp_pc_interp`). Austria-Hungary, the Ottoman Empire and the Russian Empire have empire-wide series this way rather than Austria's, Turkey's and modern Russia's; Sweden-Norway and the United Kingdom of the Netherlands are unions; Greece before 1914 and Romania before 1918 are the same mechanism for a state *smaller* than its modern borders. The build then **fails** if any live actor-year has `|log(population/tpop)| > 0.3` — two population series describing two different territories in one row — unless the disagreement is declared in `data/history/population_guard.yaml` with a reason.

**Staleness.** Every source ends before the forecast does. `createWorld` carries the last observation forward and, since 2026-09-07 (`operator / modern-capability`), records what that cost on the actor state: `stale[var]` = years since the panel last observed it, and `carry[var]` = how the value at as-of was produced (`last`, `aged` for leader age and tenure, `zero` for an event flag reset to no-event, `trailing_mean` for imputed growth). A value the panel observes at as-of is in neither map, so "in `stale`" is exactly "not a measurement of this year". `public/world.json` carries the same quantity per series variable and `public/history.json` a `last_observed` year per actor and variable, so a viewer can say "capability as of 2022" rather than paint a carried number as current. The first thing this measured was capability itself: CoW NMC 3.02 ended in 2001 and was carried 25 years, so every modern dyad was scored on 2001 strengths. It is now NMC 7.0 (1816–2022, a revision of the whole series — 12,867 of 13,020 shared CINC values changed) plus a five-indicator composite for 2023–2024 built on CINC's own share-of-system construction and spliced onto it over the overlap (`scripts/lib/capability.mjs`, r = 0.96 against CINC 1990–2016; military personnel has no open annual source and is not represented, which is declared in the code and printed by the diagnostic).

**Derived world state.** Since 2026-09-07 (`operator / derived-polarity`) no era in the model is a typed calendar year. `src/engine/polarity.js` computes the world's polarity each year from projection-weighted capability — the geometric mean of an actor's CINC share and its military-expenditure share, EWMA-smoothed — and calls the actors above the first 2× gap in the ranked shares the poles: one is unipolar, two bipolar, more multipolar. `cold_war` is bipolarity, `promotion_era` is unipolarity under a hegemon scoring regime ≥ 2, `anticoup_norm` is a democratic majority of live states, `hegemon_regime` is the top pole's own regime, and the two promoted era mechanisms (`great_game`, `aid_conditionality`) read those instead of dates. The same module runs in `build-panel.mjs` and in the engine, and forward it carries each actor's share by that actor's simulated growth, so a run can change polarity — the typed flags could not, which meant no forecast could re-enter a bipolar world and use a mechanism fitted on one. Told nothing about any date the flags find bipolar 1950–1994, unipolar 1995–2014 and bipolar again from 2015, with all 69 years of 1870–1938 multipolar; the thresholds are estimates and `scripts/analysis/polarity.mjs` prints what each of them is worth. The same package replaced the `info_access` diffusion rate switched by hand at 1985 with a logistic frontier fitted to the panel's own live-actor mean plus a gap-closing rate fitted against what the rule produces (`INFO_DIFFUSION=switch` restores the typed one as an ablation).

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
| chokepoint_status | chokepoint-year | data/corridors.yaml dated histories 1869–2025 | 0.58 (≥1946) |
| corridor_status | corridor-year | data/corridors.yaml dated histories 1869–2025 | 0.68 (≥1946) |
| weaponization, sovereign_default | — | prior only (no panel sample yet) | — |

## Faithful first (2026-09-07)

Decision: the conversation-era layer (`hazards.yaml` with hand-typed base rates, `claims.yaml`, scenario latents) is retired to `docs/origin/`. Nothing hand-typed drives the engine. The model is one panel (1816–2025, one row of years per actor), one event log, one dated infrastructure layer (corridors, territories, waves), and fitted templates — the same `createWorld(asOf)` whether `asOf` is 1870 or 2025. Named present-day risks (a strait closing, a territory changing hands) re-enter only as instances of chokepoint/territory templates fitted on the corridor-year panel — the chokepoint and corridor half of that landed 2026-09-07 (`chokepoint_status` n=1,143/37 events, `corridor_status` n=3,143/37, both simulated and scored); the territory half is still escalated in `docs/escalations.md`. Claims return later as queries over the faithful model.

## Full scale (2026-09-06, later): fit on all 217 states, simulate 64

Templates are generic, so they are fitted on every state in the CoW/GW system (countrycode panel crosswalk), and only the modeled actors are simulated. Contiguity is derived from CShapes 2.0 polygons (30 km buffer); dyads are restricted to politically relevant pairs (contiguous or ≥1 major power). Two user hypotheses were promoted through the ablation loop: `info_access` (−0.88 on coup odds per SD) and `great_game` (superpower client × bipolar era, +0.54).

Backtest as-of 1950…2000, +20y, all states: coup_attempt exp/obs 1.08, Brier skill +0.27, AUC 0.81, calibration deciles 2→1 17→14 40→42 56→51 74→67; intrastate +0.16; autocratization +0.10; democratization +0.12; mid_force +0.16 (contiguity in; "allied" flips from +0.35 to −0.13 once contiguity is controlled — Bremer's artefact). Post-Cold-War coup over-prediction went 2.55×/3.48× (as-of 1990/2000) → 1.08×/1.46×.

## Neighbourhood diffusion: tested and rejected (2026-09-06)

Candidates `nbr_democracy_share`, `nbr_regime_up/down_recent`, `bad_neighbourhood`, `nbr_conflict_count`, `nbr_coup_recent` on four templates, holdout ≥1990. Wrong sign or no holdout gain everywhere (democracy share −0.25 on democratization, +0.36 on autocratization: survivor selection — the autocracies left inside democratic neighbourhoods are the resilient ones; the 2010s backsliding happened inside democratic Europe). Recorded under `rejected:` in `data/templates.yaml` so the loop does not re-propose them.

Two things the test surfaced instead:
- **Target definition matters more than covariates.** V-Dem RoW category steps (`democratize_step`, `autocratize_step`) replace ERT "episodes" as the regime templates. An apparent AUC jump to 0.77 was leakage — events dated to the year the new regime is observed, credited to rows already in the new category. Fixed by `lead: 1` (label = next year's event; hazard from this year's state applies to the coming year, which is how the engine uses it). Honest one-year holdout AUC is 0.59 for both directions.
- **Dynamic backtest, all states, 1950–2000 +20y:** autocratize_step skill +0.17, AUC 0.77 (calibration 17→3 30→19 43→41 55→52 67→62); democratize_step skill −0.12, AUC 0.52 — calibrated but no discrimination. Which autocracies democratize is not predictable from income, growth, war and leader turnover; Przeworski's "predicting emergence is hard" reproduces. Open: `irregular_exit` over-predicts 1.9× dynamically (coup-trap feedback needs decay).

## External influence beats neighbours (2026-09-06, user hypothesis)

Channels operationalised per actor: `pact_usa` / `pact_rus` (CoW alliances), `great_game` (client × bipolar era), `aid_conditionality` (ODA/GNI × 1992–2016 promotion era), `patron_regime`, `hegemon_regime`, `hegemon_x_client`. (Both eras are derived world state since 2026-09-07 — see **Derived world state** above; the coefficients below were fitted on the typed windows and the derived ones move them to +0.68 and −0.43.) Identification lesson: era-interacted terms need a holdout that leaves the era partly in training — `holdout_split: 2005` for the regime templates (with 1990, conditionality is all-zero in training and the coefficient never leaves its prior).

Promoted: on `democratize_step` aid_conditionality +0.78 (holdout AUC 0.578→0.641), pact_usa +0.90, pact_rus −0.23; on `autocratic_closure` aid_conditionality −0.59 (0.565→0.617), great_game +0.15 (+0.62 alone). Untestable for now: `hegemon_regime` (no cross-section), `hegemon_x_client` (collinear with pact_usa while the US scored 3 every year — first variation is 2025 = 2). `liberal_erosion` (3→2) split off from closures per bucket C; 28 events, model predicts 4% of post-2005 erosions, `info_access` +1.05 in-sample — the polarisation channel, unpromotable on n=28.

Dynamic backtest, all states, 1950–2000 +20y: democratize_step AUC 0.52→0.67; autocratic_closure skill +0.09, AUC 0.68; coups +0.27 unchanged.

## What the first backtest said (as-of 1870…2000, +20y, 100 runs, 67 actors)

- One-year fits with AUC 0.8+ become 20-year dynamic forecasts with AUC 0.65–0.8 and mostly near-zero Brier skill over the base rate. That is the honest starting point.
- **Feedback amplification**: recurrence covariates (`win5(mid_force)` +2.9, conflict trap +1.5) are right one year ahead but self-perpetuate in simulation → disputes over-predicted ~1.5×, intrastate onsets ~1.7×. Fix: fit the recurrence term on multi-year horizons, or add decay.
  - Decay landed 2026-09-07: the dyadic recurrence flag is now `z(rivalry)`, an exponentially decaying trace δ^(years since the pair's last dispute) with δ = 0.85 chosen by ablation over {1.0, 0.85, 0.75, 0.6} (the no-decay endpoint is worse than the binary flag), and a war fires only inside a dyad-year that has a dispute. Pooled `mid_force` skill +0.026 → +0.069, `mid_war` −0.056 → −0.035, AUC held at 0.77. The same trap is still open one level up: `lag1(at_war_any)` is fitted at +2.12 where at-war is exogenous and used in simulation where it is endogenous, which is why giving wars a duration — built, measured, not promoted — makes the process supercritical rather than damping it (`docs/escalations.md`, `era-1914-1945 / engine-5`).
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
