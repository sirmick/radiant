# Escalations

Proposals from the refinement loop that add a new effect, variable or mechanism. Each needs a human decision.

## era-1870-1914 / corridors-1 + engine-8 + statistics-8 — corridor-year panel unit and the corridor dampener

**Adds.** (a) A `corridor-year` / `chokepoint-year` row emitter in `scripts/build-panel.mjs`: one row per corridor per year from its introduced year, carrying `adjacent_war`, `adjacent_intrastate`, `transit_at_war_any`, `transit_gdp_growth_mean`, `sponsor_great_power`, computed from the actor panel and `data/events.json` via each record's `transits` / `sponsor` / `controller`. (b) Deletion of the unit-based skip at `scripts/fit-hazards.mjs:174`. (c) A new dyad covariate on `mid_force`/`mid_war`: `corridor_dampener(a,b,y) = Σ_third load_bearing_for[third] × alliance_edge(third,a) × alliance_edge(third,b)`, registered under `candidates:` with prior 0.

**Why.** `chokepoint_status` and `corridor_status` are `status: unfitted` for want of a unit, so their covariates have never been tested against anything — `docs/schema.md` calls `load_bearing_for` "the corridor-dampener term in the dyadic conflict hazard" and no such term exists in `src/engine/core.js`. This turn added the data that makes the test possible: corridor/chokepoint events 1869–1914 went 9 → 48, every record now carries dated `history`, and the two cable cuts (1898.35, 1914.60) plus the Dardanelles closure (1912.30) are the first positives with a firing `adjacent_war`.

**Data it needs.** None beyond what now exists: `data/corridors.yaml` (43 records with history, transits, load_bearing_for, sponsor, controller), `data/territories.yaml` (42 with history), `data/events.json` (35 chokepoint + 48 corridor events).

**Templates it feeds.** `chokepoint_status`, `corridor_status`, and `mid_force`/`mid_war` through the dampener candidate.

**Test that decides it.** `node scripts/fit-hazards.mjs chokepoint_status corridor_status` reports `n > 0` and a posterior rate with an interval instead of `unfitted`; `node scripts/backtest.mjs --from 1870 --to 1930 ...` emits rows for both with `n > 0` (add `corridor: [1869, 2026]`, `chokepoint: [1841, 2026]` to `COVERAGE`). For the dampener: promote only on a holdout AUC/Brier gain in the `mid_force` ablation. The Berlin–Baghdad record predicts the opposite sign to the schema's claim — the Anglo-German convention of 15 Jun 1914 settled the corridor dispute six weeks before the war — so a positive fitted coefficient falsifies the dampener as written.

## era-1870-1914 / statistics-4 — rolling-origin refit of the coefficients

**Adds.** A `--refit` mode in `scripts/backtest.mjs` that fits each template on `year < asOf` only (factoring the fit out of `scripts/fit-hazards.mjs` into `scripts/lib/fit.mjs`), caching one fits object per as-of year, and a `fit_source` / `leaky` field on each scored row.

**Why.** Every era row currently forecasts with a full-sample fit. At as-of 1870/1880/1890 there is no training year before the as-of date at all: 100% of the coefficients come from data including the disputes being scored. Measured: `node scripts/fit-hazards.mjs mid_force --split 1900` gives holdout AUC 0.776 against 0.864 at the default 1946 split; `mid_war --split 1900` cannot fit (fewer than 5 training events). This is why the era rows look better than the 1950–2000 rows. `docs/system.md` has been corrected to say so; the fix is this.

**Data it needs.** None — a refactor plus compute (15 as-of years × ~12 templates per full backtest).

**Templates it feeds.** All of them; it changes every published number.

**Test that decides it.** Every `byAsOf[].templates[]` row carries `fit_split <= asOf`; as-of years with too few training events report `fit_source: 'literature prior'` or are excluded from `pooled`. Direction check: the refit era AUCs must be ≤ the current ones.

**Status:** implemented (2026-09-07).

**Implemented as.** The whole fitting layer moved to `scripts/lib/fit.mjs` (`createFitter({panel, events, templates, contiguity, pacts})` → `fitAll({ maxYear, only, splitOverride, holdout, ablation })`); `scripts/fit-hazards.mjs` is now a thin CLI over it and reproduces `data/fits.json` byte for byte (two additive fields, `trained_through` and `train_years`). `scripts/backtest.mjs` takes `--refit` (**default**, per the operator note of 2026-09-07) and `--no-refit`; the no-refit path reproduces the pre-change run digit for digit, and writes to `scores/…-norefit.json` so the published file stays the refit one.

Two deviations from the package as written, both recorded here:
- **The information set is the label year, not the row year.** A row is in the training sample iff `year + (lead ?? 0) <= asOf` — a `lead: 1` template's row for year *y* is labelled by an event in *y+1*, so a fit at as-of 1940 may use rows up to 1939 and a dyad row up to 1940. Filtering on the row year alone would have kept rows whose outcome the forecaster cannot have seen. Standardisation means and sds (`z`, `log` centring) are recomputed on each training subset for the same reason.
- **No literature-prior fallback.** The package offered `fit_source: 'literature prior'` *or* exclusion from `pooled` for as-of years with too little training data. There is no sourced base rate in `data/templates.yaml` to put in the intercept, so inventing one would be a hand-typed number driving the engine — the thing `docs/system.md` "Faithful first" retires. Such a template is instead reported as a row with `n: 0`, `fit_source: 'none (no training data at as-of)'` and the count that failed (`n=1080, events=2 in years ≤ 1890`), the engine simulates nothing for it, and it is out of `pooled`. Thirty-eight of the 110 template × as-of rows in the 1870–2010 run are now of this kind.

Each scored row carries `fit_split` (last training label year), `fit_n`, `fit_events`, `fit_source` and `leaky`.

**Test result.** `node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`: 72 scored rows, **all with `fit_split <= asOf`, 0 leaky**, 38 no-fit rows reported and excluded from `pooled`. The same run with `--no-refit`: 104 scored rows, **103 leaky** (the exception is `coup_attempt` at as-of 2010, whose training sample ends 2001).

Direction check on the era rows (before = full-sample fit, after = refit), `auc` / `auc_at_risk` / exp:obs:

| as-of | mid_force before | mid_force after | mid_war before | mid_war after |
|---|---|---|---|---|
| 1870 | 0.83 / 0.79 / 3.51 | **no fit** (0 training rows) | 0.87 / 0.53 / 3.63 | **no fit** |
| 1880 | 0.81 / 0.82 / 2.71 | **no fit** (0 training rows) | 0.70 / 0.76 / 3.21 | **no fit** |
| 1890 | 0.81 / 0.71 / 1.63 | **no fit** (n=1080, 2 events) | 0.73 / 0.66 / 2.39 | **no fit** (0 events) |
| 1900 | 0.78 / 0.77 / 0.77 | 0.75 / 0.73 / 0.28 | 0.77 / 0.76 / 0.82 | 0.76 / 0.75 / 0.26 |
| 1910 | 0.81 / 0.72 / 0.71 | 0.80 / 0.68 / 0.28 | 0.85 / 0.63 / 0.80 | 0.80 / 0.57 / 0.19 |
| 1920 | 0.89 / 0.77 / 1.08 | 0.89 / 0.74 / 1.07 | 0.88 / 0.75 / 0.97 | 0.87 / 0.66 / 0.94 |
| 1930 | 0.77 / 0.75 / 0.33 | 0.76 / 0.73 / 0.31 | 0.78 / 0.75 / 0.23 | 0.77 / 0.72 / 0.18 |
| 1940 | 0.71 / 0.72 / 0.53 | 0.71 / **0.75** / 0.68 | 0.73 / 0.74 / 0.43 | 0.73 / **0.77** / 0.59 |

The check holds everywhere it can be evaluated except as-of 1940, where `auc_at_risk` *rises* 0.03 on both templates. That is reproducible, not noise: re-run at as-of 1940 with 400 runs, refit 0.75 / 0.78 against full-sample 0.72 / 0.75, headline AUC identical at 0.71 / 0.73 both ways, and exp/obs moves toward 1 (0.53 → 0.68, 0.43 → 0.59). The reading: the full-sample fit is pulled toward the 1946–2001 process, which discriminates the 1940–1960 horizon *worse* than a fit that stops in 1940 — leakage inflates in-sample fit but does not have to help out of sample when the eras differ. The three as-of years the package was written about (1870/1880/1890) are the strongest form of the result: they had no fittable dyad sample at all, so their 0.79–0.82 `auc_at_risk` was entirely a report on data the forecaster could not have.

Cost of the honesty, post-1946: over-prediction that the full sample was hiding. `mid_war` exp/obs at as-of 1950/1960/1970/1980 goes 1.88 → 3.95, 2.82 → 5.21, 3.19 → 5.14, 3.63 → 4.75 — a forecaster standing in 1950 has WW1 and WW2 in the sample and nothing after, and the engine has no war duration to damp it (`era-1914-1945 / engine-5`).

**Scores: before → after** (pooled, as-of 1870…2010, +20y, 100 runs, all states; exp/obs · Brier skill · AUC):

| template | before (full-sample fit) | after (`--refit`) |
|---|---|---|
| mid_force | n=113,477 · 0.90 · +0.09 · 0.77 | n=108,797 · 0.95 · +0.03 · 0.77 |
| mid_war | n=113,477 · 0.97 · +0.03 · 0.78 | n=108,797 · 1.10 · −0.06 · 0.77 |
| coup_attempt | n=1,241 · 0.84 · +0.15 · 0.73 | n=1,105 · 0.89 · +0.18 · 0.76 |
| intrastate_onset | n=1,241 · 0.95 · +0.20 · 0.77 | n=1,241 · 1.02 · +0.12 · 0.74 |
| leader_exit | n=1,241 · 0.84 · −0.68 · 0.76 | n=1,105 · 0.85 · −0.82 · 0.74 |
| irregular_exit | n=1,241 · 1.49 · −0.11 · 0.69 | n=1,105 · 2.06 · −0.47 · 0.71 |
| democratize_step | n=1,065 · 0.96 · −0.19 · 0.56 | n=942 · 0.97 · −0.20 · 0.54 |
| autocratic_closure | n=749 · 0.80 · −0.08 · 0.60 | n=696 · 0.66 · −0.15 · 0.60 |
| democratic_deepening | n=186 · 1.09 · +0.06 · 0.72 | n=169 · 1.51 · −0.10 · 0.69 |
| liberal_erosion | n=185 · 1.08 · −0.08 · 0.35 | **gone** — 3 training events by 2010, never fittable at any as-of year |

Era rows this package targets, pooled: 1870–1910 `mid_force` 0.28 · +0.10 · 0.78 and `mid_war` 0.23 · +0.05 · 0.78 (both were unscorable-as-forecasts before); 1910–1940 `mid_force` 0.53 · +0.12 · 0.76, `mid_war` 0.41 · +0.09 · 0.76 (was 0.44 · +0.117 · 0.76).

**What this means for every later package.** The published numbers are now the `--refit` ones, and the guards written into the packages below were measured under the old full-sample fit. Restated where they moved (`--refit`, same commands): 1910–1940 pooled `mid_war` skill **0.094** (was 0.117) and exp/obs **0.41** (was 0.44); as-of 1930/1940 `mid_war` `n_structural_miss` **79 / 87** with `auc_at_risk` **0.72 / 0.77** (was 75 / 87 and 0.75 / 0.74); 1950–2000 pooled `mid_war` exp/obs **4.18** (was 2.62) and `mid_force` **1.53** (was 1.16); as-of 1940 `democratize_step` `auc_at_risk` **0.38** (was 0.44) with 1910–1940 pooled skill **−0.274** (was −0.25). Two tests are no longer measurable as written: `engine-6` and `engine-7` are scored at as-of 1870/1880/1890, where there is now no fitted dyad model at all — they need restating against as-of 1900–1930, or a `mid_force` sample that reaches behind 1886 (CoW Direct Contiguity, `docs/refine-log.md` *Deferred*).

## era-1870-1914 / statistics-6 — a pre-1946 era term on the dyadic templates

**Adds.** A dyad-level constant `pre_1946` in `scripts/build-panel.mjs` and a `candidates:` entry on `mid_war` (and `mid_force`) with `holdout_split: 1946` so the term is identified with the era partly in training.

**Why.** Scoring the fitted one-year `mid_war` model back on its own sample by era gives exp/obs 1.02 / 0.36 / 0.88 (1886–1914, by dyad type), 0.45 / 0.52 / 0.65 (1915–1945) and 2.31 / 1.47 / 2.76 (1946–2001): a 5× swing that no covariate tracks. `nuclear_both` is the only post-1945 shifter and it reaches a handful of dyads.

**Data it needs.** None — a derived constant.

**Templates it feeds.** `mid_war`, `mid_force`.

**Test that decides it.** `node scripts/fit-hazards.mjs mid_war --split 1946`: promote only if holdout AUC improves and the base variant's holdout exp/obs moves toward 1; then the per-era, per-dyad-type calibration table must show 1886–1914 contiguous-only exp/obs above 0.6 (from 0.36) and 1946–2001 major-only below 1.6 (from 2.31). If rejected, record under `rejected:` with these numbers.

## era-1870-1914 / engine-7 — nest mid_war inside mid_force, and give wars duration

**Adds.** (a) A conditional draw: war fires only in a dyad-year where a dispute fired, with `P(war | dispute)` either derived as `hz.mid_war / max(hz.mid_force, hz.mid_war)` or refitted on the mid_force-positive subsample. (b) A `warLeft` counter mirroring `conflictLeft`, so `at_war` survives more than one year and `lag1(at_war_any)` means something.

**Why.** The two dyadic templates are independent Bernoulli draws on the same pair in the same year, so the engine can produce a war in a dyad that had no dispute — CoW hostility level 5 is a subset of use of force. `mid_war` is the worst-calibrated part of the era (exp/obs 2.88 at as-of 1870 after this turn's fixes) and `a.cur.at_war = 0` is set unconditionally every year, so every war including WW1 lasts exactly twelve months.

**Data it needs.** None. It changes what the `mid_war` coefficients mean, so `data/templates.yaml` must record which form was chosen.

**Templates it feeds.** `mid_war`, and through `at_war` every actor-year template that carries `lag1(at_war)`.

**Test that decides it.** No run may log a `mid_war` for a dyad-year without a `mid_force` in the same dyad-year; `mid_war` exp/obs at as-of 1870 falls from 2.88 toward ~1.5 and pooled `mid_war` skill rises, with `mid_force` exp/obs and AUC unchanged.

## era-1870-1914 / engine-6 — rivalry decay instead of a binary recurrence flag

**Adds.** Replace the binary `win5(mid_force)` memory with an exponentially decaying rivalry score `r ← max(r·δ, 1)` on firing, entered as `z(rivalry)`, with the same feature built in `scripts/fit-hazards.mjs` and `src/engine/core.js`; ablate δ ∈ {1.0, 0.85, 0.75, 0.6}.

**Why.** `win5(mid_force)` is fitted at +2.01 (e² = 7.5×) and every in-simulation firing rewrites `dyadRecent`, so one dispute holds the dyad at 7.5× for five more draws, which re-fire. Measured by disabling the in-simulation writes only: mid_force expected falls 11–13% and mid_war 13–17% at every as-of year in this turn, always in the direction of the observed counts. (The *window* itself is correct — see the skipped note in `docs/refine-log.md`.)

**Data it needs.** None.

**Templates it feeds.** `mid_force`, `mid_war`.

**Test that decides it.** As-of 1870/1880/1890 `mid_force` exp/obs moves toward 1.0 without pooled AUC or skill falling; the chosen δ is recorded with the ablation numbers.

## era-1870-1914 / data-6 — empire-wide economic series

**Adds.** Empire-wide `gdp_pc` (and a population cross-check) for the multinational empires, either from a Maddison aggregate or derived as a successor-state sum over the constituent modern codes, tagged `source: derived (successor-state sum)`; plus a build-time hard guard `|log(population/tpop)| < 0.3`.

**Why.** `AUT_HUN → owid: AUT` and `OTTOMAN → owid: TUR` join modern-successor-border series to empire-wide CoW NMC series in the same row. This turn dropped the population half (365 actor-years, disagreements up to 8×), but `gdp_pc` is still Austria-only for Austria-Hungary — roughly +0.4 in logs for every actor-year of the empire's 102-year life — and Ottoman `gdp_pc` is null for 43 of the 45 years 1870–1914, so with the engine's 30-year carry-forward the Ottoman Empire has no `log_gdp_pc` at all from about 1901. 900 of 11,858 rows still disagree by >30%, so the hard guard cannot be switched on yet.

**Data it needs.** Maddison Project 2023 country tables for the successor sets, or a published empire-wide series.

**Templates it feeds.** Every actor-year template carrying `log_gdp_pc` or `log(population)` — most of the regime ladder and `intrastate_onset`.

**Test that decides it.** `AUT_HUN.population[1870] > 30,000,000`, `OTTOMAN.population[1870] > 25,000,000`, `OTTOMAN.gdp_pc` non-null for ≥30 of 1870–1914, and the build guard passing at the 30% threshold.

## era-1914-1945 / engine-1 + statistics-3 — coalition joining, and a dyad relevance set that is not frozen at as-of

**Adds.** (a) A coalition step in `stepYear`: when a `mid_war` fires between a and b, form sides, then draw each defence-pact neighbour of each side into the war with probability `p_join`, emitting every joiner × opposing-side pair as a `mid_war` and writing it into `world.dyadRecent`. (b) A relevance rule that is evaluated at the simulated year rather than frozen at as-of: a dyad is at risk if contiguous *now*, or either side is a great power, **or** either side is at war with a state allied to the other. Both `src/engine/core.js:dyadHazards` and `scripts/fit-hazards.mjs:buildDyadRows` must change together, or the fit and the simulation stop being the same model.

**Why.** After this turn's label fix the residual is entirely structural: at as-of 1930 `mid_war` has 75 of 202 observed dyads at p ≡ 0, at as-of 1940 87 of 174, and `mid_force` 104 and 128. `src/engine/core.js` gates every dyad on `if (!contiguous && !major) return out;` with the border graph frozen at as-of, so a small-power pair on opposite sides of a coalition war — BEL|BGR, BRA|FIN, CAN|HUN — has probability exactly zero for all twenty years. No independent-Bernoulli dyad process can produce a coalition war either: the 1941 peak is 99 simultaneous dyadic wars. `lag1(at_war_any)` (promoted this turn, +2.12) reaches the pairs inside the gate and nothing reaches the pairs outside it.

**Data it needs.** None. `p_join` is calibrated from the `sides:` lists already in `data/history/events.yaml` (ww1, ww2, korean, gulf_1991): observed joiners over allies-of-a-belligerent per war.

**Templates it feeds.** `mid_war`, `mid_force`, and through `at_war` every actor-year template carrying `lag1(at_war)`.

**Test that decides it.** `node scripts/backtest.mjs --from 1910 --to 1940 --step 10 --horizon 20 --runs 100 --universe all`: `n_structural_miss` for `mid_war` falls below 20 at as-of 1930 and 1940 (now 75 and 87) with `auc_at_risk` not below its current 0.75 / 0.74, and pooled `mid_war` skill above 0.117. Guard: as-of 1950–2000 `mid_war` exp/obs must not rise above its current 2.62 — a joining rule that fires in the wrong era makes the standing over-prediction worse.

## era-1914-1945 / engine-5 — war duration (the damping this turn's contagion term needs)

**Adds.** A `warLeft` counter for interstate war mirroring `conflictLeft`: a fired `mid_war` holds `at_war = 1` on both belligerents for a drawn duration, suppresses a duplicate draw on a dyad already at war, and applies `warShock` for the whole spell. (Supersedes the duration half of `era-1870-1914 / engine-7`; the nesting half was resolved this turn in the labels — `mid_war` now nests inside `mid_force` by construction.)

**Why.** `src/engine/core.js` clears `a.cur.at_war = 0` every step and only a fresh draw re-sets it: 84% of simulated at-war spells last one year against 33% in the panel, whose mode is 7. This turn promoted `lag1(at_war_any)` to `mid_war` at +2.12 on the strength of a holdout gain (AUC 0.757 → 0.850 forecasting 1939+ out of sample), and the measured cost is amplification without duration: 1950–2000 `mid_war` exp/obs 1.66 → 2.62. A war that lasts one year cannot carry a coalition, but it can restart every year in a fresh dyad.

**Data it needs.** None; the duration distribution is the panel's own `at_war` run lengths.

**Templates it feeds.** `mid_war`, `mid_force`, `autocratic_closure`, `democratize_step`, `intrastate_onset`, `irregular_exit` — everything with an `at_war` term.

**Test that decides it.** The simulated `at_war` run-length histogram from as-of 1920 moves from 84% one-year spells toward the panel's 33%, and 1950–2000 `mid_war` exp/obs falls from 2.62 below 1.5 without the 1910–1940 pooled exp/obs (0.44) falling below 0.35.

## era-1914-1945 / statistics-8 + engine-8 + corridors-7 — make the corridor layer scorable

**Adds.** The corridor-year / chokepoint-year sample this turn's data now supports: one row per record per year built from `history`, with `adjacent_war` / `transit_at_war_any` joined from the panel's `at_war` over `transits`, `sponsor_great_power` from `great_power`, and dated `transits_history` (or a fallback to the history row's `controller`) so a transit state that did not exist yet — OTTOMAN before TUR, EGY 1883–1921 — does not null the covariate. Plus the dampener `data/schema.md` already specifies as a dyad covariate.

**Why.** This turn added 12 corridor/chokepoint events in 1919–1934 (there were none), 19 in 1938–45 (there were 3) and four WWII corridor records, and 53 territory events in 1914–46 (there was one). `chokepoint_status` and `corridor_status` are still `status: unfitted` in `data/fits.json` because `scripts/fit-hazards.mjs` skips every `chokepoint-year`/`corridor-year` unit outright, so none of it is scored anywhere. Two of the new rows are the falsifiers for a covariate set that is entirely conflict terms: the Panama slides of 1915 close a canal with no war attached, and Britain closes the Burma Road in Jul 1940 under diplomatic pressure with no war on any transit state.

**Data it needs.** None — `data/corridors.yaml` now carries 47 records with dated histories.

**Templates it feeds.** `chokepoint_status`, `corridor_status`, and as a dampener `mid_force` / `mid_war`.

**Test that decides it.** `node scripts/fit-hazards.mjs chokepoint_status corridor_status` reports `fitted` with n ≥ 200 corridor-years and events ≥ 30; both templates appear in every `byAsOf` row of the 1910–1940 backtest with n > 0; the dampener is kept only on a Brier improvement in both 1910–1940 and 1950–2000.

## era-1914-1945 / engine-4b — an entry state for actors born inside the horizon that is derived, not median

**Adds.** Replace this turn's world-median entry prior with a derived one: an actor introduced inside the horizon inherits from its predecessor entity (`lifecycle.successors` inverted) where one exists, else from the median of its *region* at as-of rather than the world, with the imputation recorded per variable on the actor state and surfaced in the backtest row.

**Why.** The leak is fixed (an introduced actor is now built from the panel at as-of, not at its birth year) but the replacement is crude: `world.entryPrior` is the median live actor at as-of for regime, polyarchy, gdp_pc, gdp_growth, population and tpop. It is the difference between scoring the decolonisation cohort and not scoring it — at as-of 1940 `democratize_step` goes from 50 units the model cannot reach to 9 — but a single world median for 44 states is a stated prior, not a forecast. `cinc` is deliberately *not* imputed, so a newborn actor still carries no dyads at all.

**Data it needs.** A region field per actor (Natural Earth subregion is already in `data/geo`), or the predecessor mapping.

**Templates it feeds.** Every actor-year template; `mid_force`/`mid_war` if `cinc` is ever imputed too.

**Test that decides it.** At as-of 1940, `democratize_step` `auc_at_risk` rises above its current 0.44 and the pooled 1910–1940 skill above −0.25, with the imputed-variable counts reported per as-of row.

## operator / modern-fold — put the 2000–2025 measured series on the panel clock

**Adds.** Extra columns on `data/panel.json` for every actor, 2000–2025, from the fetched modern datasets in `data/raw/` (World Bank WDI 1960+ already partly used; UN WPP 2024 `TPopulation1July`, `TFR`, `MedianAgePop`, working-age share from the age-5 file; OWID energy `oil_consumption`, `electricity_generation`, `renewables_share_elec`; IEA EV stock share), registered in `data/variables.yaml`-style metadata inside the panel (`meta.sources`, `introduced`). The modern actor snapshot (`data/actors.yaml` capability levels, nuclear status, chokepoint exposure) becomes panel columns too (`cap_*`, `nuclear_status`, `chokepoint_hormuz`…) valued at 2025 with `source` carried, so the engine's `createWorld(2025)` reads them like any other variable. `scripts/build-world.mjs` keeps producing `public/world.json` for the viewer but no longer owns any series.

**Why.** Operator decision 2026-09-07 ("get a faithful model first"): one panel, one clock. Today the 2000–2025 layer lives in a second artefact the engine never sees, and the refine loop cannot attack it.

**Data it needs.** None new — all in `data/raw/`.

**Templates it feeds.** None directly yet; it makes the modern era attackable by the loop and gives future candidates (EV share, fertility, working-age share, renewables) a home.

**Test that decides it.** `node -e` on `data/panel.json` shows `population`, `fertility`, `working_age_share`, `oil_twh`, `ev_share`, `cap_logic` … non-null for ≥ 40 actors in 2025 with `meta.sources` entries; `createWorld(2025)` exposes them on `a.cur`; the 1870–2010 backtest numbers are unchanged (the fold adds columns, changes no fitted covariate).
