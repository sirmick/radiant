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

**Status:** implemented (2026-09-07) — **promoted on `mid_war`, rejected on `mid_force`**. Raised as a `candidates:` entry by the operator's note on the `engine-1` package and scored by the loop's own ablation.

**Implemented as.** A derived dyad-year constant `pre_1946` (year < 1946), built in `scripts/lib/fit.mjs`'s dyad feature block and mirrored in `src/engine/core.js:dyadHazards`. Two deviations from the package as written, both forced by identification:
- **Not `holdout_split: 1946`, and not in `build-panel.mjs`.** A pre-1946 dummy has *no within-training variation at any split at or before 1946* — every training row is on one side of the era, the coefficient cannot leave its prior, and the test is empty. The candidate therefore declares its own `holdout_split: 1975`, and the whole ablation (base variant included) is scored at that split so the variants stay comparable. `scripts/lib/fit.mjs` gained two fixes to make that runnable: the ablation loop built **actor** rows for every template, so a candidate on a dyad-year template was silently scored on the wrong sample; and a candidate may now declare the split its ablation runs at.
- **It is a dyad-year constant, not a panel column.** Nothing in `data/panel.json` is needed for `year < 1946`.

**Test result.** `node scripts/fit-hazards.mjs mid_war mid_force`, ablation at split 1975:

| | holdout AUC | holdout exp/obs | fitted |
|---|---|---|---|
| `mid_war` base | 0.838 | 3.68 | — |
| `mid_war` + `pre_1946` | **0.841** | **2.10** | +1.17 |
| `mid_force` base | 0.900 | 1.14 | — |
| `mid_force` + `pre_1946` | 0.900 | 1.12 | +0.14 |

Per-era, per-dyad-type in-sample calibration on `mid_war` (exp/obs, contiguous-only / major-only / both), base → with the term: 1886–1914 **0.37 / 1.07 / 0.84 → 0.71 / 1.64 / 1.20**, 1915–1945 0.77 / 0.59 / 0.78 → 1.38 / 0.82 / 0.98, 1946–2001 1.38 / **2.37** / 2.66 → 0.88 / **1.17** / 1.25. The package asked for 1886–1914 contiguous-only above 0.6 (0.37 → 0.71) and 1946–2001 major-only below 1.6 (2.37 → 1.17); both hold. `mid_force` earns nothing and is recorded under `rejected:` with its numbers.

The term also pulls `lag1(at_war_any)` down from +2.13 to +1.92 on the full sample: part of what that coefficient was carrying was the era, not the contagion.

**Under the rolling-origin refit it is identified only where a forecaster holds both eras**, and the fitted coefficient by as-of year says exactly that: 1940 **−0.00** (no post-1946 training row at all), 1950 −0.39, 1960 +0.40, 1970 +0.76, 1980 +0.96, 1990 +1.05, 2000 +1.22. So every pre-1946 as-of row in the backtest is **bit-identical** to the run without the term, and the whole effect is post-war. The one row it makes worse is as-of 1950, where the five post-war years in the training sample contain 1948 and the Korean onset and the term fits *negative*: `mid_war` exp/obs 3.81 → 5.48. From as-of 1960 the peace accumulates and every row improves.

**Scores: before → after** (pooled 1870–2010, +20y, 100 runs, all states; exp/obs · Brier skill · AUC):

| template | before | after |
|---|---|---|
| mid_war | 1.03 · −0.035 · 0.765 | **0.79 · −0.009 · 0.768** |
| mid_force | 0.84 · +0.069 · 0.766 | **0.78 · +0.084 · 0.766** |

Era rows: **1910–1940** unchanged to the digit (`mid_war` 0.39 · +0.092, `mid_force` 0.50 · +0.122 — the term is unidentified there). **1950–2000** `mid_war` 3.89 · −0.670 → **2.61 · −0.53**, `mid_force` 1.32 · −0.026 → **1.17 · +0.01**. Per as-of year, `mid_war` exp/obs: 1950 3.81 → 5.48, 1960 5.10 → **2.93**, 1970 4.61 → **1.88**, 1980 4.23 → **1.53**, 1990 2.33 → **0.86**, 2000 0.31 → 0.18. `mid_force` improves everywhere post-1946 without a term of its own, through the `at_war` feedback from the war template (1970 1.43 → 1.16, 1980 1.40 → 1.13).

Note for the packages that quote it: **the 1950–2000 `mid_war` over-prediction guard is now 2.61, not 3.89**, and `auc_at_risk` on the post-1990 rows is computed over a smaller at-risk set (a rarer event fails to appear at all in 100 runs: `mid_war` `n_at_risk` at as-of 1990 goes 794 → 607), so those two numbers are not comparable across the change.

## era-1870-1914 / engine-7 — nest mid_war inside mid_force, and give wars duration

**Adds.** (a) A conditional draw: war fires only in a dyad-year where a dispute fired, with `P(war | dispute)` either derived as `hz.mid_war / max(hz.mid_force, hz.mid_war)` or refitted on the mid_force-positive subsample. (b) A `warLeft` counter mirroring `conflictLeft`, so `at_war` survives more than one year and `lag1(at_war_any)` means something.

**Why.** The two dyadic templates are independent Bernoulli draws on the same pair in the same year, so the engine can produce a war in a dyad that had no dispute — CoW hostility level 5 is a subset of use of force. `mid_war` is the worst-calibrated part of the era (exp/obs 2.88 at as-of 1870 after this turn's fixes) and `a.cur.at_war = 0` is set unconditionally every year, so every war including WW1 lasts exactly twelve months.

**Data it needs.** None. It changes what the `mid_war` coefficients mean, so `data/templates.yaml` must record which form was chosen.

**Templates it feeds.** `mid_war`, and through `at_war` every actor-year template that carries `lag1(at_war)`.

**Test that decides it.** No run may log a `mid_war` for a dyad-year without a `mid_force` in the same dyad-year; `mid_war` exp/obs at as-of 1870 falls from 2.88 toward ~1.5 and pooled `mid_war` skill rises, with `mid_force` exp/obs and AUC unchanged.

**Status:** implemented (2026-09-07) — the nesting half. The duration half was split out to `era-1914-1945 / engine-5` and is *not* promoted; its numbers are there.

**Implemented as.** `src/engine/core.js:stepYear` draws the dispute first and the war only inside it: `P(war | dispute) = hz.mid_war / max(hz.mid_force, hz.mid_war)` — the first of the two forms the package offered, chosen because it needs no second fit and leaves the marginal alone wherever `p_war <= p_form`, which is where the coefficients put it. Where the war model runs hotter than the dispute model (the cascade years, when `lag1(at_war_any)` = +2.13 is on for `mid_war` and +1.16 for `mid_force`) the war probability is capped at the dispute's own, and that cap is the whole effect. The two random draws per dyad-year are kept even when the dispute misses, so an ablation differs by mechanism and not by random stream. `data/templates.yaml` records the chosen form in `mid_war.notes`. `ENGINE_ABLATE=war_nesting` restores the independent draws.

**Test result.** `node scripts/analysis/war-spells.mjs --as-of 1920 --runs 100`: **5,610 simulated dyadic wars, 0 of them in a dyad-year without a `mid_force` in the same dyad and year.** The as-of 1870 row the package named no longer exists (no fitted dyad model there since `statistics-4`), so the calibration half is read at the as-of years that do: `mid_war` exp/obs 4.61 (was 5.14) at as-of 1970, 4.23 (4.75) at 1980, 2.33 (2.61) at 1990, and pooled `mid_war` skill −0.058 → **−0.035** with `mid_force` skill +0.032 → **+0.069** (both measured against the same run with nesting off, so the number is the nesting's own). `mid_force` AUC 0.765 → 0.766, unchanged as required.

**Scores: before → after** (the before column is this turn's rivalry-only run, so nesting is the only difference; pooled 1870–2010, +20y, 100 runs, all states):

| template | rivalry only | + nesting (shipped) |
|---|---|---|
| mid_force | 0.94 · +0.032 · 0.765 | **0.84 · +0.069 · 0.766** |
| mid_war | 1.10 · −0.058 · 0.769 | **1.03 · −0.035 · 0.765** |


## era-1870-1914 / engine-6 — rivalry decay instead of a binary recurrence flag

**Adds.** Replace the binary `win5(mid_force)` memory with an exponentially decaying rivalry score `r ← max(r·δ, 1)` on firing, entered as `z(rivalry)`, with the same feature built in `scripts/fit-hazards.mjs` and `src/engine/core.js`; ablate δ ∈ {1.0, 0.85, 0.75, 0.6}.

**Why.** `win5(mid_force)` is fitted at +2.01 (e² = 7.5×) and every in-simulation firing rewrites `dyadRecent`, so one dispute holds the dyad at 7.5× for five more draws, which re-fire. Measured by disabling the in-simulation writes only: mid_force expected falls 11–13% and mid_war 13–17% at every as-of year in this turn, always in the direction of the observed counts. (The *window* itself is correct — see the skipped note in `docs/refine-log.md`.)

**Data it needs.** None.

**Templates it feeds.** `mid_force`, `mid_war`.

**Test that decides it.** As-of 1870/1880/1890 `mid_force` exp/obs moves toward 1.0 without pooled AUC or skill falling; the chosen δ is recorded with the ablation numbers.

**Status:** implemented (2026-09-07), δ = 0.85.

**Implemented as.** `rivalryScore(lastDisputeYear, year, δ) = δ^(year − lastDisputeYear)`, 0 for a pair that has never had a dispute — exported from `src/engine/core.js` and imported by `scripts/lib/fit.mjs`, so there is one function and not two implementations. δ is declared on the covariate in `data/templates.yaml` (`{ var: rivalry, transform: z, prior: 0.26, decay: 0.85 }`) and read by both sides through `rivalryDecay(templates)`, which throws if the two dyadic templates disagree; `RIVALRY_DECAY` in the environment overrides it, which is how the ablation below was run. Two deviations, both recorded:
- **The form is δ^(age of the last dispute), not a running sum.** The package wrote `r ← max(r·δ, 1)` on firing, which is exactly this: the max is never binding for a trace that decays from 1. It is a recency trace, not a count — two disputes in a decade leave the same mark as one.
- **The prior is rescaled, not carried over.** The literature prior (1.5, 2.0) is stated for the binary flag, i.e. for a *fresh* dispute. On a z-scored trace a fresh dispute is 5.80 sd above the mean (rivalry mean 0.038, sd 0.140, nonzero on 22.7% of politically relevant dyad-years), so the prior per sd is 1.5/5.80 = 0.26 and 2.0/5.80 = 0.35. It barely matters: moving the prior from 0.10 to 0.80 moves the fitted coefficient by under 0.01 on the full sample and 0.04 at as-of 1900, so the ablation below holds the prior fixed while δ moves.
- `createWorld` now seeds `dyadRecent` with the *year* of each pair's last dispute over the whole observed history, where it used to store `asOf` for anything inside a five-year window. A decaying trace has no window to truncate at.

**Test result — the δ ablation.** One-year fit (`node scripts/fit-hazards.mjs mid_force mid_war`, era holdout) and the dynamic backtest (`RIVALRY_DECAY=δ node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`, pooled, exp/obs · Brier skill · AUC):

| variant | holdout AUC mid_force (≥1946) / mid_war (≥1939) | pooled mid_force | pooled mid_war |
|---|---|---|---|
| `win5(mid_force)` (before) | 0.8586 / 0.8498 | 0.95 · +0.026 · 0.765 | 1.10 · −0.056 · 0.769 |
| δ = 1.0 (no decay) | 0.8475 / 0.8447 | 1.00 · −0.013 · 0.765 | 1.13 · −0.079 · 0.767 |
| **δ = 0.85** | **0.8613** / 0.8482 | **0.84 · +0.069 · 0.766** | **1.03 · −0.035 · 0.765** |
| δ = 0.75 | 0.8582 / 0.8477 | 0.86 · +0.059 · 0.765 | 1.04 · −0.038 · 0.766 |
| δ = 0.6 | 0.8531 / 0.8466 | 0.88 · +0.049 · 0.765 | 1.04 · −0.041 · 0.767 |

δ = 0.85 is first on both the one-year holdout and the dynamic skill, and the ranking is single-peaked in δ, which is the shape a real parameter has. δ = 1.0 — the same feature with the decay switched off — is *worse than the binary flag it replaces*, so the decay is doing the work and not the reparameterisation. Fitted coefficient +0.40 per sd on `mid_force` against +1.81 for the binary: the trace is not weaker, it is shorter. A dispute one year old is worth 2.30 log-odds (against win5's 1.81 flat) and one five years old 1.15.

**The test as written cannot be run, and what replaced it.** As-of 1870/1880/1890 have no fitted dyad model at all since `statistics-4`. Read at the as-of years that do exist, the exp/obs clause also no longer means what it meant: those rows now *under*-predict (0.28, 0.27, 0.28 at 1900/1910/1930), so any damping moves them further from 1.0, and it does — 0.28 → 0.27, 0.28 → 0.27, 0.31 → 0.28. The over-predicted rows are the ones that move toward 1: as-of 1970 `mid_force` 1.70 → 1.43, 1980 1.69 → 1.40, 1990 1.19 → **1.00**; `mid_war` 5.14 → 4.61, 4.75 → 4.23, 2.61 → 2.33. The clause that survives intact is *without pooled AUC or skill falling*, and both rise: `mid_force` skill +0.026 → +0.069, `mid_war` −0.056 → −0.035, AUC 0.765/0.769 → 0.766/0.765. Restated for the next reader: **the deciding numbers for a damping term are pooled Brier skill with AUC held, plus the over-predicted era rows moving toward 1.** (The table above is the joint rivalry + nesting effect; rivalry on its own is 0.94 · +0.032 and 1.10 · −0.058 — most of the pooled gain is the nesting, most of the δ *ranking* is the rivalry.)

**Scores: before → after** — the published run, `node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all` (`scores/backtest-1870-2010-h20-all.json`), pooled, exp/obs · Brier skill · AUC. Both dyadic changes are in the after column; every actor-year template moves only through `at_war` and `mid_force` on its own covariates, and none of them moves materially:

| template | n | before | after |
|---|---|---|---|
| mid_force | 108,797 | 0.95 · +0.026 · 0.765 | **0.84 · +0.069 · 0.766** |
| mid_war | 108,797 | 1.10 · −0.056 · 0.769 | **1.03 · −0.035 · 0.765** |
| democratize_step | 942 | 0.97 · −0.202 · 0.535 | 0.98 · −0.186 · 0.546 |
| autocratic_closure | 696 | 0.66 · −0.149 · 0.597 | 0.66 · −0.143 · 0.602 |
| intrastate_onset | 1,241 | 1.02 · +0.120 · 0.742 | 1.02 · +0.117 · 0.740 |
| leader_exit | 1,105 | 0.85 · −0.824 · 0.739 | 0.85 · −0.823 · 0.737 |
| irregular_exit | 1,105 | 2.06 · −0.470 · 0.706 | 2.05 · −0.465 · 0.703 |
| coup_attempt | 1,105 | 0.89 · +0.180 · 0.757 | 0.89 · +0.180 · 0.758 |
| democratic_deepening | 169 | 1.51 · −0.100 · 0.692 | 1.47 · −0.080 · 0.692 |

Era rows this package and `engine-7` target: **1910–1940** `mid_force` 0.53 · +0.121 · 0.765 → **0.50 · +0.122 · 0.764**, `mid_war` 0.41 · +0.094 · 0.764 → **0.39 · +0.092 · 0.760** (the guard `engine-5` inherited — pooled exp/obs not below 0.35 — holds). **1950–2000** `mid_force` 1.53 · −0.125 · 0.750 → **1.32 · −0.026 · 0.751**, `mid_war` 4.18 · −0.798 · 0.727 → **3.89 · −0.670 · 0.723. The standing 1950–2000 `mid_war` over-prediction is 30% smaller and still 3.9×; nothing in this package addresses its cause, which is that a forecaster standing in 1950 has WW1 and WW2 in the training sample and no covariate that says the post-1945 process is different (`era-1870-1914 / statistics-6`).



## era-1870-1914 / data-6 — empire-wide economic series

**Adds.** Empire-wide `gdp_pc` (and a population cross-check) for the multinational empires, either from a Maddison aggregate or derived as a successor-state sum over the constituent modern codes, tagged `source: derived (successor-state sum)`; plus a build-time hard guard `|log(population/tpop)| < 0.3`.

**Why.** `AUT_HUN → owid: AUT` and `OTTOMAN → owid: TUR` join modern-successor-border series to empire-wide CoW NMC series in the same row. This turn dropped the population half (365 actor-years, disagreements up to 8×), but `gdp_pc` is still Austria-only for Austria-Hungary — roughly +0.4 in logs for every actor-year of the empire's 102-year life — and Ottoman `gdp_pc` is null for 43 of the 45 years 1870–1914, so with the engine's 30-year carry-forward the Ottoman Empire has no `log_gdp_pc` at all from about 1901. 900 of 11,858 rows still disagree by >30%, so the hard guard cannot be switched on yet.

**Data it needs.** Maddison Project 2023 country tables for the successor sets, or a published empire-wide series.

**Templates it feeds.** Every actor-year template carrying `log_gdp_pc` or `log(population)` — most of the regime ladder and `intrastate_onset`.

**Test that decides it.** `AUT_HUN.population[1870] > 30,000,000`, `OTTOMAN.population[1870] > 25,000,000`, `OTTOMAN.gdp_pc` non-null for ≥30 of 1870–1914, and the build guard passing at the 30% threshold.

**Status:** implemented (2026-09-07).

**Implemented as.** A general constituent-set mechanism rather than a per-empire patch. An actor may declare `derived_series` in `data/history/actors.yaml`: a window, a `min_gdp_coverage`, a `source`, and `parts` of the form `{ pop, gdp, share, from, to, note }`. `population` is the share-weighted sum of the parts' OWID population series; `gdp_pc` is the population-weighted mean of the parts' Maddison series, emitted only where the parts that *have* a series cover `min_gdp_coverage` (0.5) of the derived population. A part's `gdp` code may differ from its `pop` code, which is how a crown land with no series of its own borrows the entity-wide one (Bohemia and Slovakia take `OWID_CZS`, the South Slav lands `OWID_YGS`) and how the eastern Galician and Levantine parts take a neighbour's. Eight actors declare one: **AUT_HUN, OTTOMAN, RUS** (the empires the package names), **SWE** (the Sweden-Norway union), **NLD** (the United Kingdom of the Netherlands), **DNK** (the duchies), and — the same machinery run the other way, for a predecessor *smaller* than its modern borders — **GRC** (the 1832 kingdom) and **ROU** (the Old Kingdom). The shares partition: the Habsburg set's 0.44 of Romania and the Ottoman set's 0.56 are complements, as are the Ottoman and Greek shares of modern Greece.

Four decisions the package did not fix, recorded here:

1. **Maddison is benchmark years before 1950, so the parts are log-linearly interpolated between their own observed years** (never extrapolated, never across a gap > 60 years). Without it the Ottoman set has 1820, 1870 and 1913 and nothing else, and the test's "non-null for ≥ 30 of 1870–1914" is unreachable from `data/raw/hist/maddison.csv` — Turkey has two observations in that window and every Arab successor has one. The interpolation is flagged, not hidden: `gdp_pc_interp` is the share of the year's gdp weight that came from an interpolated value (Ottoman 1900 = 0.83, Austria-Hungary 1900 = 0), and a year at 1 has no annual observation behind it, so its `gdp_growth` is a smooth fill rather than a measurement. `gdp_pc_derived` / `population_derived` flag the actor-years this block wrote (531 and 592).

2. **The hard guard is real: the build now exits non-zero.** `|log(population/tpop)| > 0.3` on a live actor-year means the row has joined two different states. Every remaining violation has to be declared in the new `data/history/population_guard.yaml` as `{ id, spans, prefer: tpop|population|none, reason, source }` — `tpop` drops the modern-borders value, `population` drops NMC's, `none` is a declared, unresolved disagreement that keeps both. Undeclared → build failure with the list.

3. **Not every disagreement is a borders join, and those are not "fixed" by dropping data.** 404 actor-years across 24 actors are declared `prefer: none`: CoW NMC and HYDE/Gapminder are two independent estimates for states without a census (Ethiopia 7.10M vs 17.68M in 1903, Liberia, Morocco, Guatemala, Paraguay, Peru, Saudi Arabia, Jordan, Bhutan, Eritrea, Somalia 1992, Rwanda 1993). Two are actor-definition problems escalated rather than excused: **VNM** 1954–75 (the model's VNM is CoW 816, the DRV, for capabilities and 19.94M of population, while every OWID-coded series joined to it is whole Vietnam at 46.48M — the fix is to split the actor) and **SRB** 1996–2001 (NMC 345 is FR Yugoslavia, the OWID series is Serbia without Montenegro and Kosovo). Three are resolved: the Papal States (`VAT`, whose OWID series is Vatican City), Pakistan 1947–70 (NMC counts both wings, OWID only the west), and Haiti 2001, where NMC's tpop jumps from 8,222 to 82,248 thousand — a misplaced decimal, so `tpop` is dropped for that year.

4. **Two entity-window boundaries moved with it**, because they are the same double-counting bug: the USSR series (`owid_alt` OWID_USS) now ends in 1991, not 1992, since the panel introduces the 14 successor actors in 1991 and NMC's ccode 365 is Russia alone that year (148.3M against the union's 292.7M); the Yugoslav series ends in 1992, from when NMC's ccode 345 is FR Yugoslavia (10.45M) rather than the SFRY (23.09M). Prussia is **not** derived: CoW's tpop for it is the North German Confederation from 1867 (16.6M in 1850 → 31.2M in 1870) and a constituent set for that needs dated shares of modern Germany, Poland and Russia. Its population stays dropped.

**Test result.** `node scripts/build-panel.mjs`:
- `AUT_HUN.population[1870]` = **35.22M** (> 30M; NMC tpop 35.7M, and 50.4M in 1913 against the 1910 census's 51.4M). Its `gdp_pc` in 1870 goes 2,970 → **1,733**, i.e. −0.54 in logs — the Austria-only overstatement the package estimated at +0.4.
- `OTTOMAN.population[1870]` = **32.00M** (> 25M; NMC tpop 33.7M). The dated losses track NMC's own series: 1913 24.8M against 21.3M, 1918 21.9M against 18.9M.
- `OTTOMAN.gdp_pc` non-null **45 of 45** years 1870–1914 (was 2). Austria-Hungary is 45/45 too.
- Build guard: **0 undeclared violations** over 12,094 compared live actor-years (was 757 of 11,854, reported and ignored), 404 declared exemptions across 24 actors, 227 actor-years dropped. (Checked 2026-09-07: as first committed these read 12,095 / 405 / 226, because the guard applied only the *last* `prefer` declared for an id and Haiti's two declarations left the 2001 NMC decimal error in the panel. Fixed in the check commit; the resolution now fires and the pooled scores are unchanged to three decimals.)
- **Checked 2026-09-07:** `public/forecast.json` was committed as a 3-run, 5-year smoke artifact (`runs` 500 → 3, `horizon` 40 → 5, `to` 2065 → 2030) that `git add -A` swept in from the working tree, and `public/forecasts.json` recorded it as the published 2025 ensemble. Regenerated with `node scripts/run-forward.mjs` (its defaults are the previous 500 runs × 40y), which it needed anyway because `data/fits.json` changed. Rebuild any published artifact the package's inputs feed, rather than committing whatever the tree happens to hold.
- Also derived: RUS 1816–1921 (population 90.5M in 1870 against NMC's 84.5M; `gdp_pc` 789 → 1,599, the modern-Russia series replaced by the empire-wide one), SWE 1816–1904 (3.44M in 1816 = 2.50 + 0.94, exactly NMC's), NLD 1816–30, DNK 1816–63, GRC 1828–1913, ROU 1878–1917.

**Scores: before → after** (`node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`, pooled, exp/obs · skill · auc):
| template | before | after |
|---|---|---|
| democratize_step | 0.97 · −0.174 · 0.554 | 0.95 · −0.189 · 0.548 |
| autocratic_closure | 0.66 · −0.138 · 0.605 | 0.65 · −0.143 · 0.602 |
| intrastate_onset | 1.01 · +0.120 · 0.741 | 1.02 · +0.113 · 0.738 |
| coup_attempt | 0.89 · +0.182 · 0.759 | 0.89 · +0.177 · 0.758 |
| leader_exit | 0.85 · −0.826 · 0.738 | 0.86 · −0.829 · 0.736 |
| irregular_exit | 2.05 · −0.471 · 0.697 | 2.05 · −0.472 · 0.698 |
| democratic_deepening | 1.50 · −0.080 · 0.694 | 1.50 · −0.073 · 0.704 |
| mid_force | 0.78 · +0.081 · 0.766 | 0.78 · +0.085 · 0.767 |
| mid_war | 0.81 · −0.013 · 0.771 | 0.80 · −0.008 · 0.770 |
| chokepoint_status | 0.97 · +0.111 · 0.740 | 0.96 · +0.140 · 0.759 |
| corridor_status | 1.09 · +0.076 · 0.675 | 1.13 · +0.062 · 0.664 |

**The era rows this package targets did not move at all, and that is the finding.** Every `byAsOf` row at as-of 1870–1900 is identical before and after, to the digit, and at 1910 nothing scored moves either — `democratization_onset` (`status: monitored`, out of pooled either way) drops out of the row instead of appearing in it with `n: 0` and a reason, and `democratize_step`'s unfitted sample grows from n 261 to n 271; both are `n: 0`, below the event minimum, before and after: the only templates fitted before 1900 are the two dyad ones, and they carry `cinc`, not `gdp_pc`. The regime ladder's window starts in 1900 and its first fittable as-of year is 1920. So the empire series buys nothing *today* in the 1870–1914 score — it removes a covariate error (an empire entering every actor-year template at its richest province's income, or with no income at all) that only becomes scorable when a template reaches behind 1900. The rows that did move are 1920 onward, where the changed inputs are the guard's resolutions (Pakistan, Haiti, the Papal States) and the two entity-window boundaries; the movements are within run-to-run noise of the pooled numbers above.


## era-1914-1945 / engine-1 + statistics-3 — coalition joining, and a dyad relevance set that is not frozen at as-of

**Adds.** (a) A coalition step in `stepYear`: when a `mid_war` fires between a and b, form sides, then draw each defence-pact neighbour of each side into the war with probability `p_join`, emitting every joiner × opposing-side pair as a `mid_war` and writing it into `world.dyadRecent`. (b) A relevance rule that is evaluated at the simulated year rather than frozen at as-of: a dyad is at risk if contiguous *now*, or either side is a great power, **or** either side is at war with a state allied to the other. Both `src/engine/core.js:dyadHazards` and `scripts/fit-hazards.mjs:buildDyadRows` must change together, or the fit and the simulation stop being the same model.

**Why.** After this turn's label fix the residual is entirely structural: at as-of 1930 `mid_war` has 75 of 202 observed dyads at p ≡ 0, at as-of 1940 87 of 174, and `mid_force` 104 and 128. `src/engine/core.js` gates every dyad on `if (!contiguous && !major) return out;` with the border graph frozen at as-of, so a small-power pair on opposite sides of a coalition war — BEL|BGR, BRA|FIN, CAN|HUN — has probability exactly zero for all twenty years. No independent-Bernoulli dyad process can produce a coalition war either: the 1941 peak is 99 simultaneous dyadic wars. `lag1(at_war_any)` (promoted this turn, +2.12) reaches the pairs inside the gate and nothing reaches the pairs outside it.

**Data it needs.** None. `p_join` is calibrated from the `sides:` lists already in `data/history/events.yaml` (ww1, ww2, korean, gulf_1991): observed joiners over allies-of-a-belligerent per war.

**Templates it feeds.** `mid_war`, `mid_force`, and through `at_war` every actor-year template carrying `lag1(at_war)`.

**Test that decides it.** `node scripts/backtest.mjs --from 1910 --to 1940 --step 10 --horizon 20 --runs 100 --universe all`: `n_structural_miss` for `mid_war` falls below 20 at as-of 1930 and 1940 (now 75 and 87) with `auc_at_risk` not below its current 0.75 / 0.74, and pooled `mid_war` skill above 0.117. Guard: as-of 1950–2000 `mid_war` exp/obs must not rise above its current 2.62 — a joining rule that fires in the wrong era makes the standing over-prediction worse.

**Status:** partial (2026-09-07) — both halves built, measured, and **not promoted**. The coalition rule does what the package said it would do to the structural residual and fails its post-1945 guard by 11×. It ships switched off in the data (`mid_war.coalition.status: candidate` in `data/templates.yaml`); `COALITION_ON=1` on any `backtest.mjs` run reproduces every number below, and `ENGINE_ABLATE=coalition` forces it off whatever the data says. The operator's second instruction — a pre-1946 era term as a `candidates:` entry — was run first, is **promoted on `mid_war`**, and is written up under `era-1870-1914 / statistics-6`; every number here is measured on top of it.

**Implemented as.** Both halves, from one declaration (`mid_war.coalition` in `data/templates.yaml`) read by `coalitionRule(templates)` in `src/engine/core.js` and imported by `scripts/lib/fit.mjs`, so the fit and the simulation cannot use different relevance sets.
- **Joining.** After the dyad loop, each fired `mid_war` is treated as a war between two sides: every defence-pact ally of each side is drawn in at `p_join`, an ally of both sides stays out, and each joiner × opposing-side pair is emitted as a `mid_force` **and** a `mid_war` (the labels nest, so the engine nests too), written into `world.dyadRecent` and into the next year's war graph. One round only — a joiner's own allies are not drawn — so a cascade cannot run away on alliance chains alone.
- **Relevance.** `dyadHazards` admits a pair that is neither contiguous nor major-power if it is at war with the other, or at war with a state allied to the other, evaluated on the **simulated** year's war graph (seeded at as-of from the dated war records, rewritten by `stepYear` from the run's own wars). `scripts/lib/fit.mjs` builds the identical clause on the observed war graph — the cross-side pairs the hand-coded `sides:` lists imply, lagged a year like `at_war_any` — which adds 854 dyad-years to the estimation sample (69,099 → 69,953).
- **`p_join = 0.094`, calibrated, reproducible.** `scripts/analysis/coalition-calib.mjs` is new and prints the calibration: for each of the 44 hand-coded wars take the pair that starts it (earliest entrant per side), count every live state holding a CoW defence pact (sstype 1) with either in that year, and count how many of those appear in the war's `sides:` list. **28 joiners / 297 allies at risk = 0.0943.** The `sides:` lists are the one place country names are allowed, and the calibration is recorded as `source:` on the template.

**Test result.** The structural half passes in direction and misses the threshold; the guard fails outright.

`node scripts/backtest.mjs --from 1910 --to 1940 --step 10 --horizon 20 --runs 100 --universe all` and the same for `--from 1950 --to 2000`, run three ways: off, `COALITION_ON=1 COALITION_P_JOIN=0` (the relevance half alone) and `COALITION_ON=1` (both halves, `p_join = 0.094`). Every cell below is 100 runs, all states, coefficients refit per as-of year:

| | off | relevance only (`COALITION_P_JOIN=0`) | both halves |
|---|---|---|---|
| `mid_war` `n_structural_miss` 1930 / 1940 | 81 / 87 | 77 / **57** | **70 / 54** (test asked for < 20) |
| `mid_war` `auc_at_risk` 1930 / 1940 | 0.729 / 0.776 | 0.729 / **0.704** | **0.776 / 0.823** (guard: not below 0.75 / 0.74) |
| `mid_war` pooled exp/obs · skill | 0.39 · +0.092 | 0.45 · +0.100 | **0.60 · +0.129** |
| `mid_force` `n_structural_miss` 1930 / 1940 | 105 / 128 | 96 / 96 | **93 / 88** |
| `mid_force` pooled exp/obs · skill | 0.50 · +0.122 | 0.54 · +0.133 | **0.64 · +0.146** |
| **guard**: 1950–2000 `mid_war` exp/obs | 2.61 | **4.85** | **28.00** |
| 1950–2000 `mid_force` exp/obs | 1.17 | 1.69 | 6.39 |

With both halves on: `auc_at_risk` holds and rises, pooled skill clears 0.117, the under-prediction the 1914–1945 era has always shown is roughly halved — and `n_structural_miss` lands at 70 and 54 where the test asked for below 20. **The guard then fails by 11×**: 1950–2000 pooled `mid_war` exp/obs 2.61 → **28.00** (skill −0.53 → −12.87) and `mid_force` 1.17 → 6.39, with every post-1945 as-of year 10–40× over (1950 41.6, 1960 38.0, 1970 30.9, 1980 20.4, 1990 9.9).

**The relevance half alone does not rescue it**, and that is the measurement this turn adds beyond the package: it carries most of the structural gain at as-of 1940 (87 → 57 of the 87 → 54) and still takes the post-1945 guard from 2.61 to **4.85**, because it admits pairs *because* one side is at war and every such pair carries `lag1(at_war_any)` = +1.92. It also loses discrimination exactly where it adds units — as-of 1940 `auc_at_risk` 0.776 → **0.704**, below the guard's 0.74 — since the pairs it opens are mostly ones that never fight.

**Why it fails, measured.** Both halves amplify, separately and together. Sweep at 1950–1980, 20 runs, pooled `mid_war` exp/obs (3.10 with the mechanism off):

| `p_join` | joining only | + relevance (`linked`) | + relevance (`both_at_war`) |
|---|---|---|---|
| 0.094 (calibrated) | 12.96 | **33.58** | 17.10 |
| 0.046 | 7.36 | — | — |
| 0.0145 | 4.19 | — | 4.26 |
| 0.005 | 3.42 | 6.78 | — |

No setting of `p_join` is neutral post-1945, because the level is wrong before the rule multiplies it.

1. **`p_join` is a per-war rate applied per dyadic war-year draw.** The engine draws joiners once per *fired dyad*, and post-1945 it fires several times too many of those. Against the record (`scripts/analysis/coalition-calib.mjs`): 1,016 dyadic war-years carry 3,973 ally-draws — 3.91 allies per dyadic war-year counting every ally of the pair, which is the engine's own denominator, or 2.13 counting only the allies still out of the war. The historical rate per draw is therefore **0.0070–0.0130**, not 0.094: an order of magnitude below the per-war rate, because a coalition war is one joining decision spread over many dyad-years, and post-1945 blocs are an order of magnitude larger than the wartime average (Gulf 1991: 5 joiners of 66 allies at risk; Vietnam 1 of 38; Falklands 0 of 43).
2. **The relevance half admits a pair *because* one side is at war**, so every pair it admits carries `lag1(at_war_any)` = +1.92 on the very covariate that is already supercritical — which is why it fails the guard (4.85) even with the joining rule switched off. On the observed record the rule is small and the fit sees that the post-war half of it is cold — 854 extra dyad-years (69,099 → 69,953), 397 of them pre-1946 carrying 29 wars (7.3%) and 457 post-1946 carrying 4 (0.9%). In simulation it is not small: at as-of 1970 `mid_war` `n_at_risk` goes 749 → 1,702 on its own and → **5,186** with joining on, because every one of the engine's too-many wars opens its belligerents' whole alliance neighbourhood.

**Scores: before → after.** No published number moves: the mechanism is off in `data/templates.yaml`, and `scores/backtest-1870-2010-h20-all.json` is unchanged by it (pooled `mid_war` 0.79 · −0.009 · 0.77, `mid_force` 0.78 · +0.084 · 0.77 — those moved under `statistics-6`, not here). The ablation runs are kept beside it under their own names: an engine switch now goes into the backtest's `meta.engine` **and into the filename** (`…-abl-coalition_on_1.json`), so a sweep can no longer overwrite a published score file with a number produced under a different engine — which is exactly what happened to `scores/backtest-1950-1980-h20-all.json` during this turn's first sweep.

**What would make it promotable** (escalated as such): a war process whose *level* is right post-1945 before any joining rule multiplies it — `statistics-6` took the standing over-prediction from 3.89 to 2.61 and that is still 2.6× too many wars for a coalition rule to sit on top of. Then either (a) `p_join` calibrated per dyadic war-year (0.0070–0.0130) instead of per war, or (b) the joining draw made **once per war component per year** rather than once per fired dyad, which is what the per-war calibration actually measures, or (c) a relevance rule that does not hand every pair it opens the `lag1(at_war_any)` term that opened it — a war-linked pair is *structurally* at risk without being at the contagion coefficient's odds, which is the one form of this package that was not tried here and the only one whose failure mode is not already measured.

## era-1914-1945 / engine-5 — war duration (the damping this turn's contagion term needs)

**Adds.** A `warLeft` counter for interstate war mirroring `conflictLeft`: a fired `mid_war` holds `at_war = 1` on both belligerents for a drawn duration, suppresses a duplicate draw on a dyad already at war, and applies `warShock` for the whole spell. (Supersedes the duration half of `era-1870-1914 / engine-7`; the nesting half was resolved this turn in the labels — `mid_war` now nests inside `mid_force` by construction.)

**Why.** `src/engine/core.js` clears `a.cur.at_war = 0` every step and only a fresh draw re-sets it: 84% of simulated at-war spells last one year against 33% in the panel, whose mode is 7. This turn promoted `lag1(at_war_any)` to `mid_war` at +2.12 on the strength of a holdout gain (AUC 0.757 → 0.850 forecasting 1939+ out of sample), and the measured cost is amplification without duration: 1950–2000 `mid_war` exp/obs 1.66 → 2.62. A war that lasts one year cannot carry a coalition, but it can restart every year in a fresh dyad.

**Data it needs.** None; the duration distribution is the panel's own `at_war` run lengths.

**Templates it feeds.** `mid_war`, `mid_force`, `autocratic_closure`, `democratize_step`, `intrastate_onset`, `irregular_exit` — everything with an `at_war` term.

**Test that decides it.** The simulated `at_war` run-length histogram from as-of 1920 moves from 84% one-year spells toward the panel's 33%, and 1950–2000 `mid_war` exp/obs falls from 2.62 below 1.5 without the 1910–1940 pooled exp/obs (0.44) falling below 0.35.

**Status:** partial (2026-09-07) — built, measured, and **not promoted**. It fixes the spell shape and fails the calibration half of its own test by a wide margin. The mechanism ships switched off in the data (`mid_war.duration.status: candidate` in `data/templates.yaml`); flipping that one word to `active` reproduces every number below, and `ENGINE_ABLATE=war_duration` forces it off whatever the data says.

**Implemented as.** `world.warSpells` holds the years left on each pair's war; a fired `mid_war` draws a duration and holds `at_war = 1` on both belligerents for it, suppresses any fresh draw (dispute or war) on a pair already inside a spell, and — because the drift loop reads `at_war` before it clears it — carries `warShock` for the whole spell. The duration is resampled from `warRunLengths(panel, asOf)`, the panel's own `at_war` run lengths **as observed at the as-of year**, with a spell still open at as-of dropped as right-censored. An actor already at war at as-of gets a residual drawn from the same distribution (a stated approximation: the panel dates the spell's start, and its end is past the as-of date).

**Test result.** First half passes, second half fails.

- Spell shape, `node scripts/analysis/war-spells.mjs --as-of 1920 --runs 100`: one-year spells **70% → 24%**, mean length **1.51 → 3.91 years**, against the panel's 49% / 2.99 over all years and 26% / 2.91 for the 35 spells a forecaster standing in 1920 has actually seen. (The package's "84% against 33%, mode 7" does not reproduce on this measurement: the panel's spells are 49% one-year with a mode of 1, and the engine's were 70%, not 84%. Counted here as maximal runs of `at_war = 1` per actor, spells still open at the horizon's end and spells already running at as-of excluded.)
- Calibration, `node scripts/backtest.mjs …` at three windows, `mid_war` / `mid_force` exp/obs · skill:
  - **1950–2000: 3.89 · −0.67 → 5.58 · −1.41** and 1.32 · −0.026 → 1.65 · −0.174. The test asked for below 1.5.
  - 1910–1940: 0.39 · +0.092 → **0.60** · +0.090 and 0.50 · +0.122 → 0.69 · +0.109. The guard holds (nothing falls below 0.35) and this is the one window where duration helps the level.
  - pooled 1870–2010: 1.03 · −0.035 → 1.50 · −0.176 and 0.84 · +0.069 → 1.08 · 0.000. AUC unchanged at 0.77 throughout.

**Why it fails, measured.** The amplification the package expected to damp does not run through repeated draws inside the same dyad — those are suppressed, and suppressing them is nearly free because the score is *any event in the pair within 20 years*. It runs through `lag1(at_war_any)` = +2.12 reaching the belligerents' **other** dyads, so a longer spell is a longer exposure and the process is supercritical: the simulated dyadic war count at as-of 1920 doubles, 5,610 → 10,352. Second, the two `at_war` variables are not the same population. The panel's `at_war` is the hand-coded interstate-war list (371 actor-years 1886–2001, 3.3% of live actor-years); the engine sets `at_war` from any CoW hostility-5 dyad, whose onsets are 283 actor-years. The observed ratio is **1.31 at-war years per onset year**, not the 2.6–3.0 of a whole spell, because about half the dyadic onsets happen inside a war that is already running. Drawing a full spell for every onset therefore roughly doubles simulated at-war exposure before any cascade.

**What would make it promotable** (escalated as such): the era term (`era-1870-1914 / statistics-6`) or the coalition rule (`era-1914-1945 / engine-1`), so the level is not already 4× too high before duration multiplies it; or a duration drawn per dyad from CoW MID `endyear` (396 dyadic war spells, mean 2.61, 38% of one year — already in `data/raw/hist/midb_3.02.csv`, not yet carried into `data/events.json`) and calibrated on simulated at-war *exposure* rather than on spell length; or a decayed `at_war_any` on the dyadic templates, since the +2.12 was estimated where at-war is exogenous and is used where it is endogenous — the same trap `engine-6` just took out of `win5(mid_force)`.


## era-1914-1945 / statistics-8 + engine-8 + corridors-7 — make the corridor layer scorable

**Adds.** The corridor-year / chokepoint-year sample this turn's data now supports: one row per record per year built from `history`, with `adjacent_war` / `transit_at_war_any` joined from the panel's `at_war` over `transits`, `sponsor_great_power` from `great_power`, and dated `transits_history` (or a fallback to the history row's `controller`) so a transit state that did not exist yet — OTTOMAN before TUR, EGY 1883–1921 — does not null the covariate. Plus the dampener `data/schema.md` already specifies as a dyad covariate.

**Why.** This turn added 12 corridor/chokepoint events in 1919–1934 (there were none), 19 in 1938–45 (there were 3) and four WWII corridor records, and 53 territory events in 1914–46 (there was one). `chokepoint_status` and `corridor_status` are still `status: unfitted` in `data/fits.json` because `scripts/fit-hazards.mjs` skips every `chokepoint-year`/`corridor-year` unit outright, so none of it is scored anywhere. Two of the new rows are the falsifiers for a covariate set that is entirely conflict terms: the Panama slides of 1915 close a canal with no war attached, and Britain closes the Burma Road in Jul 1940 under diplomatic pressure with no war on any transit state.

**Data it needs.** None — `data/corridors.yaml` now carries 47 records with dated histories.

**Templates it feeds.** `chokepoint_status`, `corridor_status`, and as a dampener `mid_force` / `mid_war`.

**Test that decides it.** `node scripts/fit-hazards.mjs chokepoint_status corridor_status` reports `fitted` with n ≥ 200 corridor-years and events ≥ 30; both templates appear in every `byAsOf` row of the 1910–1940 backtest with n > 0; the dampener is kept only on a Brier improvement in both 1910–1940 and 1950–2000.

**Status:** implemented (the layer is scorable; the dampener is measured and not promoted).

**Implemented as.** One row per corridor/chokepoint record per year, built by `scripts/lib/fit.mjs:buildRecordRows` from `data/corridors.yaml`. Everything the row needs is in `src/engine/core.js` (`corridorFirstYear`, `corridorStateAt`, `corridorTransitionYears`, `corridorTransits`, `corridorFeatures`, `corridorIndex`, `corridorStake`, `corridorOutcomeMix`) and is read by the fitter over the panel and by the engine over the simulated world through one `look` interface — the same one-construction rule `rivalryScore` and `coalitionRule` already follow. Checked, not asserted: at as-of 1913 the engine's feature block and the fitter's row agree on all 27 records that have both (`node -e` harness in the turn's notes; the two records that have neither are the ones below).

Four decisions the package did not fix, each with its reason:

1. **The label is a change of `status` OR `controller` during the year.** Control is half of what the layer is for — Suez 1882 (OTTOMAN→GBR) and 1956 (GBR→EGY) are control changes at constant status — and a change that reverses inside one year (the All-Red cable cut and repaired in 1914) is still a transition in that year, because the unit is the record-year. Status-only would have given 25 corridor and 32 chokepoint events; status-or-control gives 37 and 37.
2. **A record whose history opens with `closed`/`contested` starts at the window's first year in the kind's base status,** not at that first row: a strait is not built, and a record first *observed* impaired must have existed unimpaired before. That is what makes Malacca, Bab al-Mandab, Hormuz and the Taiwan Strait units for the whole window instead of appearing in 1942/2023/1984/1996 out of nowhere. A corridor's first row (`planned`/`building`/`built`) is its birth and is not a transition.
3. **Transits are dated.** A transit that is not a live actor is followed through the successor chain and the controller counts as a transit — which is what keeps Suez scorable 1883–1921 (EGY is out of the system under occupation; GBR holds it) and Berlin–Baghdad scorable after 1922 (OTTOMAN → TUR). `transits_history` turned out not to be needed: the successor chain plus the controller covers every case in the file.
4. **`transit_gdp_growth_mean` is dropped and recorded under `rejected:`** — its coverage is not missing at random. Requiring it dropped 168 of 3,143 corridor-years, and those 168 carried 5 of the 37 transitions (2.98% against 1.08% in the rows it kept) because Maddison's holes are the war years and the record layer's transitions are the war years. One of the five was **Burma Road 1940**, one of this package's own falsifiers: with the covariate in, the case was not a miss, it was not in the sample. On the same 2,975 rows the covariate is worth in-sample AUC 0.848 → 0.870; the 0.870-vs-0.813 gap against the full sample is mostly that selection.

`COVERAGE` gains `chokepoint: [1869, 1945]` and `corridor: [1869, 1945]`. The hand-coded layer is complete only where the refine loop has been, and two records prove it is not complete after 1945: the Bosphorus record closes in 1939 and never reopens, and Kiel is `open/GBR` in 1945 and never returns to German control. The templates are still *fitted* on 1869–2025 (that is the whole record, and this test asks for ≥ 30 events), so the published full-sample fit carries a post-1945 base rate biased low — the backtest rows at as-of ≤ 1940 are refit on labels ≤ as-of and do not. Extending the record layer past 1945 is the follow-on data task.

The engine draws the layer **last in the step**, after the war draws, so a transit state that goes to war this year is visible to the corridor hazard — the fit reads the same contemporaneous `at_war`. A fired transition rewrites the record's status from `corridorOutcomeMix`, the status-to-status counts observed at as-of, so the outcome of a simulated transition is drawn from the layer's own history and not from a typed number. Control transfer is *not* simulated (the competing-risks model over claimants in `docs/schema.md` is still an escalation), so a simulated record moves through status only while the label counts control changes too.

New switches: `CORRIDOR_DAMPENER=1` promotes the `corridor_stake` candidate on `mid_force`/`mid_war` for one run without editing the data (refit-only), and `ENGINE_ABLATE=corridor_layer` takes the layer out of the world entirely. Both are stamped into `meta.engine` and the output filename. `scripts/analysis/corridor-fit.mjs` is the falsifier harness: coefficients, every observed transition ranked by the probability the model gave it, and the same fit with the named cases dropped.

**Test result.** Two of three pass; the dampener fails and stays a candidate.

- `node scripts/fit-hazards.mjs chokepoint_status corridor_status` → both **fitted**. `chokepoint_status` n=**1,143** ev=**37** (3.24%, AUC in 0.774, holdout ≥1946 0.580), `adjacent_war` **+2.38**, `adjacent_intrastate` −0.35. `corridor_status` n=**3,143** ev=**37** (1.18%, AUC in 0.813, holdout ≥1946 0.683), `transit_at_war_any` **+2.43**, `sponsor_great_power` +0.42. The test asked for ≥ 200 corridor-years and ≥ 30 events.
- Both templates appear in **every** `byAsOf` row of the 1910–1940 backtest with n > 0: chokepoint n=9 at all four as-of years (7 at risk), corridor n=20/20/20/23. Pooled over them: chokepoint exp/obs 0.97, Brier 0.222 against a base of 0.249 (skill +0.111), AUC 0.740; corridor exp/obs 1.09, Brier 0.185 against 0.200 (skill +0.076), AUC 0.675. At as-of 1870–1900 the rows are reported with n=0 and the counts that failed (fewer than 5 transitions in the training years) — the fit-at-as-of rule, not a scoring gap.
- **Dampener: fails, in both windows, and is not promoted.** `corridor_stake` (log1p of the load-bearing weight third parties carry on infrastructure running through either side of the pair, counted only where the third party holds a defence pact with one of the two; z-scored) is registered as a candidate on both dyadic templates. One-year holdout ablation: `mid_force` AUC 0.861 → 0.861 and Brier 0.0099 → 0.0099 at −0.04; `mid_war` 0.848 → 0.850 and 0.0031 → 0.0031 at −0.13 (exp/obs 0.91 → 0.87). Backtest, off → on (`CORRIDOR_DAMPENER=1`, 100 runs, all states): 1910–1940 `mid_force` Brier **0.03985 → 0.03994** and `mid_war` **0.02902 → 0.02918**; 1950–2000 `mid_force` **0.00666 → 0.00670** and `mid_war` **0.00205 → 0.00211**. The test asked for an improvement in both windows and got a small loss in all four numbers. The sign is right and the magnitude is nothing: the dampener is −0.13 per sd on a covariate that is zero for almost every pair, because a defence-pact tie to a third party that leans on the corridor is rare in the alliance graph before 1946 — which is where the corridor records are.

**The three falsifiers, measured** (`node scripts/analysis/corridor-fit.mjs`; p is the full-sample fitted probability, pct its percentile in that template's sample):

- **Panama 1915** — the Gaillard Cut slides close the canal with no war anywhere near it. p=**0.0171**, **24th percentile**: the model gives it the base rate, exactly as the package predicted a conflict-only covariate set would. Dropping the row moves `adjacent_war` +2.38 → +2.44 and in-sample AUC 0.774 → 0.780. It sits in the residual; it does not distort the fit.
- **Burma Road 1940** — Britain closes the road for three months under Japanese diplomatic pressure. p=**0.0407**, **84th percentile**: the model ranks it in the top sixth, but for a reason the case denies — `transit_at_war_any` is 1 because China had been at war with Japan since 1937, not because anything happened on the road. A rank that is right for the wrong reason. And until this turn dropped `transit_gdp_growth_mean` the case was not in the sample at all (point 4 above).
- **Berlin–Baghdad** — three transitions. 1896 (planned → building, the concession) p=**0.0059**, **50th percentile**, a clean miss: the model has no covariate for a great-power sponsor *starting* a corridor, only for one holding it. 1914 (building → closed) p=0.0606, **92nd**. 1940 (closed → built, under TUR) p=0.0606, **92nd**. Dropping all three moves `transit_at_war_any` +2.43 → +2.41, `sponsor_great_power` +0.42 → +0.35 and AUC 0.813 → 0.806.
- What the three of them say together is visible in the coefficients: with two binary covariates the corridor model takes exactly **four values** — 0.0606 (war and a great-power sponsor), 0.0407 (war, no sponsor), 0.0056 (sponsor, no war), 0.0037 (neither). That is the whole resolution of the layer as fitted. The two cases it cannot see (a landslide, a diplomatic closure) and the one it half-sees (a concession signed) are the argument for the next covariates, not for re-weighting these.
- A fourth case the layer surfaced on its own: **Malacca 1942 is a structural miss** (`n_structural_miss` = 1 at as-of 1930 and 1940). None of its transit states (MYS, IDN, SGP) is in the international system before 1949 and it has no recorded controller, so `adjacent_war` is null and the record carries no hazard at all — the model cannot reach it. Bab al-Mandab is the same before 1977. That is the actor universe, not the covariate set: a colonial-era corridor has no sovereign transit state to join a panel row to.

**Scores: before → after** (rolling-origin refit, 100 runs, all states).

| window | template | before | after |
|---|---|---|---|
| pooled 1870–2010 | `mid_force` | 0.775 · +0.084 · 0.766 | **0.781 · +0.081 · 0.766** |
| pooled 1870–2010 | `mid_war` | 0.794 · −0.009 · 0.768 | **0.806 · −0.013 · 0.771** |
| pooled 1870–2010 | `chokepoint_status` | not scored anywhere | **n=36, exp/obs 0.97, skill +0.111, AUC 0.740** |
| pooled 1870–2010 | `corridor_status` | not scored anywhere | **n=83, exp/obs 1.09, skill +0.076, AUC 0.675** |
| 1910–1940 | `mid_force` / `mid_war` | 0.50 · +0.122 / 0.39 · +0.092 | **0.50 · +0.123 / 0.40 · +0.092** |
| 1950–2000 | `mid_force` / `mid_war` | 1.17 / 2.61 | **1.18 / 2.65** |

The dyadic templates gained no covariate this turn (the dampener is a candidate, off), so their movement is the random stream: the corridor draws consume random numbers after the dyad loop in every step. Checked rather than asserted — `ENGINE_ABLATE=corridor_layer` reproduces the pre-turn numbers exactly (pooled `mid_force` **0.775 · +0.084 · 0.766** and `mid_war` **0.794 · −0.009 · 0.768**, the published values before this turn), while the same run with the layer on gives 0.781 and 0.806. Nothing but the stream moved.

**What it opens.** (a) The corridor model has four values; the covariates that would give it more are a status term (a closed corridor reopens on a different hazard than an open one closes), a sponsor-*starting* term for the Berlin–Baghdad 1896 kind of row, and `guarantor_presence` from `operator/presence`, which is queued and was waiting on exactly this unit. (b) The record layer is complete only to 1945 — extending the 47 records' histories past it moves `COVERAGE` and makes the post-1945 half of the fit honest. (c) Malacca 1942 says the layer needs a transit state that is not a sovereign actor (a colony's metropole, which `controller` half-supplies). (d) The dampener is registered, measured and cheap to re-test: `CORRIDOR_DAMPENER=1` on any window.



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

**Status:** implemented (2026-09-07, commit below). One caveat measured and reported rather than papered over: `ev_share` is non-null in **2024**, not 2025 — see the test result.

**Implemented as.** A new `scripts/lib/modern.mjs` holds the fetchers (World Bank WDI, UN WPP medium + the age-5 file, OWID energy, IEA EV), the transforms and the ordinal encodings, and **both** sides read it: `scripts/build-panel.mjs` puts the series on the panel clock, and `scripts/build-world.mjs` uses it only for the years past the panel. The fold is registry-driven — every `data/variables.yaml` variable with `source: { fetch: … }` and `scope: actor` becomes a panel column over 2000–2025 (27 of them), and every `kind: state` actor variable from the modern snapshot becomes a column valued at 2025 alone (37 of them: 19 `cap_*`, 5 `chokepoint_*`, `nuclear_status`, `nuclear_warheads`, `regime_type`, `personalism`, `succession`, and the 8 hand estimate maps). Four decisions the package did not fix:

- **Adds columns only, enforced by the build.** A variable whose id already names a panel column throws — the fold cannot merge into a fitted covariate by accident. That is why UN WPP population lands in **`population_wpp`**, declared as `panel: population_wpp` on the registry entry (a new key, documented in `data/variables.yaml`'s header): the panel's `population` is the OWID/Maddison historical series and a fitted covariate on `intrastate_onset`, whose window runs to 2024 — filling its 2024–25 nulls from a different source would have added scored rows to the 1870–2010 backtest, which the operator's note forbids. So the test's `population` is read here as `population_wpp`; `population` itself is untouched to the cell.
- **Nothing is carried forward.** A source that ends in 2023 leaves 2024–25 null in the panel. The engine already carries the last observation forward in `buildActorState` and records the staleness, so `createWorld(2025)` sees the value and knows how old it is; the panel does not manufacture one.
- **Categorical snapshot levels are encoded as ordinals** so the panel stays a numeric matrix: `cap_*` N=0/I=1/S=2, `nuclear_status` none=0/latent=1/threshold=2/weapon=3, `regime_type` on the V-Dem RoW scale the panel's own `regime` uses. The mapping is written into `meta.sources` for every column, and an undeclared level throws rather than writing a null. `chokepoint_exposure` fans out to one column per chokepoint (`chokepoint_hormuz`, `chokepoint_malacca`, `chokepoint_suez`, `chokepoint_bab_al_mandab`, `chokepoint_taiwan_strait`). `leader_age`/`leader_tenure` are the two snapshot fields the panel already measures (REIGN 1950–2021); the snapshot does not overwrite them.
- **`build-world.mjs` no longer owns a series.** A series variable's history is read from `data/panel.json` (`v.panel ?? v.id`), and only years past the panel's last year come from the raw files, so the viewer cannot drift from the model. Two consequences: `hist` now starts at the declared `HIST_FROM` (2000) for the World Bank/OWID variables, which used to run from whatever year the file began (1960–1990), and 20 of 2,569 actor-variable `v0` values changed — all of them in the two variables that declare a `region_median` fallback (`gov_debt_gdp`, `ev_share`), where an actor whose only observation was pre-2000 now takes the fallback instead of a 1990-vintage value presented as current. The other 2,549 are identical.

`data/panel.json` also gains its own registry: `meta.vars[col] = { source, introduced, last, actor_years, actors }` plus `meta.sources` (the existing top-level `sources` is kept — `build-history-slice.mjs` reads it) and `meta.introduced`. `src/engine/core.js` reads `meta.introduced` to skip the carry-forward scan below a column's first year — same values, and it keeps 64 mostly-empty modern columns from costing anything on an 1870 world.

**Test result.** `data/panel.json` 68 → **132 columns** (64 new, none removed), 12.0 → 19.0 MB. Non-null actors **in 2025**: `population_wpp` 195, `fertility` 195, `working_age_share` 195, `old_age_share` 195, `median_age` 195, `net_migration` 195, `electricity_generation` 89, `renewables_share_elec` 89, `oil_twh` 78 (already there), `cap_logic` 44, `nuclear_status` 44, `regime_type` 44, `chokepoint_hormuz` 9 — all ≥ 40 except the chokepoint columns, which are exposures of the actors that have one. **`ev_share` is 0 in 2025 and 46 in 2024**: the IEA EV file ends in 2024, as do the World Bank series (`gdp_ppp` 183, `milex_gdp` 146 in 2024). The panel does not extrapolate, so the literal "non-null in 2025 for ≥ 40 actors" fails for every source that ends in 2024 — what passes is the engine test: `createWorld(2025)` (universe `modeled`, 59 actors) exposes on `a.cur` `population_wpp` 59, `fertility` 59, `working_age_share` 59, `median_age` 59, `oil_twh` 52, `gdp_ppp` 57, `ev_share` 39, `cap_logic` 44, `nuclear_status` 44, `regime_type` 44, with `a.stale` = 1 on exactly the ones whose source ended in 2024. `data/fits.json` is byte-identical.

**Scores: before → after.** Unchanged, to the digit, on every template and every as-of row: the score file `scores/backtest-1870-2010-h20-all.json` from the pre-change run and the post-change run are identical once the wall-clock fields are dropped, and 2,711,940 panel cells across the 12,914 pre-existing actor-columns compare equal. Pooled 1870–2010 (100 runs, universe all), before **and** after: `mid_force` 0.78 · +0.08 · 0.77, `mid_war` 0.80 · −0.01 · 0.77, `intrastate_onset` 1.02 · +0.11 · 0.74, `democratize_step` 0.95 · −0.19 · 0.55, `autocratic_closure` 0.65 · −0.14 · 0.60, `coup_attempt` 0.89 · +0.18 · 0.76, `leader_exit` 0.86 · −0.83 · 0.74, `irregular_exit` 2.05 · −0.47 · 0.70, `democratic_deepening` 1.50 · −0.07 · 0.70, `chokepoint_status` 0.96 · +0.14 · 0.76, `corridor_status` 1.13 · +0.06 · 0.66. The only cost is wall clock: 105s → 122s for the full backtest (a 19 MB panel to parse and 64 more columns per actor-year state build).

## operator / presence — military presence: bases, garrisons and fleet stations as a layer that feeds chokepoints, conflicts and coups

**Adds.** (a) Entity `data/presence.yaml` (written 2026-09-07): dated great-power stations 1870–2026 `{actor, host | sea:<area>, kind: base|garrison|fleet|advisors, level 1–3, from, to, geometry, source}`; the two 2026 operator observations (US Gulf carrier presence → Indian Ocean; drawdown in Japan/Korea) are entries tagged `operator … unverified`. (b) Panel variables in `scripts/build-panel.mjs`: `sp_presence_host` = max level of any great-power presence on the host that year, per power (`presence_USA`, `presence_RUS`, `presence_GBR`, `presence_FRA`, `presence_CHN`, …) and `presence_any`; `presence_change` = level dropped in the last 3 years (a withdrawal). (c) Derived dyad covariate `patron_presence(a, b)` = a great power with level ≥ 2 on a's territory that is allied to a (and not to b), and symmetric. (d) Corridor-year covariate `guarantor_presence` = max great-power fleet/base level whose geometry is within ~1,500 km of the chokepoint / along a corridor's transits, and `guarantor_withdrawal` = fell in the last 3 years. (e) Optional: the DMDC/Kane US troops-abroad panel (`data/raw/hist/troops_us.csv`, 1950–2005) as `troops_usa_host` where available, to calibrate levels.

**Why.** Presence is the mechanism behind terms the model already scores by proxy: `great_game` (client × bipolar) is "a superpower garrison next door"; a chokepoint's closure hazard depends on who guarantees it; a US garrison changes what a coup costs (Iran 1953 vs 1979, Thailand, Korea 1961/1979, Pakistan). The 2026 Hormuz case is exactly a guarantor withdrawal the model cannot see.

**Data it needs.** `data/presence.yaml` (exists, ~130 records, mostly `estimate` dates — verify the ones the tests lean on). Optional: Heritage/Kane "Global U.S. Troop Deployment 1950–2005" (DMDC), if fetchable.

**Templates it feeds (as `candidates:`, prior 0 unless stated).**
- `chokepoint_status`: `guarantor_presence` (prior −0.5: closure less likely with a guarantor), `guarantor_withdrawal` (+0.5).
- `mid_force` / `mid_war`: `patron_presence` (prior −0.3 for the dyad overall — tripwire deterrence; but +0.3 on disputes *between* the host and the patron's rivals — test both forms).
- `coup_attempt` / `autocratic_closure`: `presence_any` and `presence_USA` / `presence_RUS` (sign unknown: protection vs provocation), and `presence_change` (withdrawal in the last 3 years, prior +0.3).
- `intrastate_onset`: `presence_any` (prior −0.2).

**Test that decides it.** Ablation on the era holdouts (≥1986 for coups/closure, ≥1946 for dyads, corridor-year holdout ≥1970): promote each term only on a holdout AUC/Brier gain. Named falsifiers: Iran 1979 (US advisors present, revolution anyway), Vietnam 1973–75 (presence then withdrawal), Suez 1956 (British garrison had just left — withdrawal completed Jun 1956, closure Oct 1956: the term should fire), Subic 1992 → Mischief Reef 1995 (withdrawal then a rival's move), Aden 1967. Direction check on the 2026 state: after `guarantor_withdrawal` fires for Hormuz, the chokepoint's closure hazard must rise, not fall.

**Map.** A `presence` layer: base/garrison markers coloured by power, sized by level; fleet areas as dashed circles; dated by the slider; hover shows actor, name, since, source. Legend lists the powers present that year with counts.

**Status:** implemented (2026-09-07).

**Implemented as.** One shared module, `src/engine/presence.js`, imported by `scripts/build-panel.mjs`, `scripts/lib/fit.mjs` and `src/engine/core.js` — the presence layer becomes numbers in exactly one place, so the fit and the simulation cannot drift apart. Two conventions are stated in it rather than implied: a station is present in year y iff `from <= y < to` (`to` is the year the presence *ended*, so a withdrawal is visible in the year the source dates it — that is what makes the canal case 1956 and not 1957), and the layer's coverage claim is its own header's 1870–2026, outside which every column is null rather than zero.

Four deviations from the package's text, each with a reason:

1. **`presence_<POWER>` for six powers, not ten.** A per-power column needs cross-sectional variance; `PRESENCE.min_hosts = 5` distinct land hosts gives `presence_FRA GBR ITA RUS TUR USA` (35, 24, 21, 14, 7, 5 hosts) and folds CHN, DEU, IND, JPN (1–3 hosts each) into `presence_any` only.
2. **`guarantor_presence` is a per-power *weight* — the sum of that power's station levels near the record — not the maximum level the package specifies.** The maximum of a 1–3 ordinal saturates: it stands at 3 for 81 of the 90 chokepoint-years of the 1940s–60s, no withdrawal can lower it while one other station remains, and the 1956 canal case does not fire under it at all (the garrison on the record's own transit state leaves; a fleet 1,400 km away does not, so the max never moves). Both constructions were measured and both sets of numbers are in `data/templates.yaml`.
3. **`patron_presence` has a second form, `patron_presence_rival`**, as the package asks ("test both forms"): the same station, but the other side is itself a great power.
4. **`troops_usa_host`** landed from `data/raw/hist/troopdata-rebuild-country-year.csv` (Troopdata: Allen, Flynn & Martinez Machain, 1950–2024, 11,546 actor-years) — the measured series the hand-coded ordinals are calibrated against, which the package listed as optional. `data/raw/hist/basedata.csv` is undated (a cross-section of current US sites) and is not joined.

Panel columns (`scripts/build-panel.mjs`, all self-registering with source lines): `presence_FRA`, `presence_GBR`, `presence_ITA`, `presence_RUS`, `presence_TUR`, `presence_USA`, `presence_any`, `presence_change`, `troops_usa_host`. Dyad features (`patron_presence`, `patron_presence_rival`) are built in `src/engine/presence.js:patronFeatures` and called from both `scripts/lib/fit.mjs`'s dyad block and `src/engine/core.js:dyadHazards`. Record-year features (`guarantor_presence`, `guarantor_withdrawal`) are computed inside `corridorFeatures` from a `look.guarantor` accessor, dated in the fitter and **frozen at as-of in the engine** — like the alliance and border graphs, where great-power forces will sit in year t of the horizon is an outcome, not knowledge. The *recency* still ages: both `presence_change` (per actor, `applyPresence` in the step) and `guarantor_withdrawal` (against `look.year`) switch off when the last fall leaves the 3-year window, so a withdrawal in the as-of year does not fire for twenty simulated years.

**Test result.**

*Level calibration (the package's optional part, run as a validation).* The hand-coded 0–3 ordinal against the measured US troop count, over 11,546 actor-years: level 0 median 10 troops (p90 104), level 1 median 898 (p10 32), level 2 median 6,518 (p10 466), level 3 median 45,501 (p10 11,625). Strictly monotone, about an order of magnitude per level, with 10% / 88% / 96% / 100% of the years above 100 troops. The levels are not measured but they are not arbitrary.

*Named falsifiers* (`node scripts/analysis/presence.mjs`): Iran 1979 — US advisors present 1953–78, gone in 1979, the withdrawal flag on 1979–82 and the revolution happens anyway (the term does not have to explain it, and it does not suppress it: the coup and closure candidates below are all ≈0). Vietnam — level 3 through 1972, 0 from 1973, withdrawal 1973–76 covering the 1975 fall. **Suez 1956 fires**: the record's guarantor weight goes 10 → 7 in the transition year, `guarantor_withdrawal` = 1, and the closure is in the sample as a predicted event rather than a miss. Subic 1992 → Mischief Reef 1995: `presence_USA` 3 → 0 in 1992, `presence_change` on 1992–95, so 1995 is inside the window. Aden 1967: level 2 → 0, flag on 1967–70.

*Ablations* (holdout AUC / Brier, base → with the term). Promoted:
- `chokepoint_status` `guarantor_withdrawal` — 1940 0.692/0.0278 → 0.660/0.0278, 1946 0.580/0.0212 → **0.621**/0.0214, 1960 0.572/0.0146 → **0.597**/0.0148, **1970 (the package's split) 0.501/0.0148 → 0.624/0.0151**, 1980 0.742/0.0143 → 0.714/0.0145. Fitted +0.21.
- `corridor_status` `guarantor_withdrawal` — 1940 0.832/0.0078 → **0.852**/0.0078, 1946 0.683/0.0034 → **0.774**/0.0035. Fitted +0.62. The ≥ 1970 corridor holdout the package asks for is **empty**: 2 of the 37 corridor transitions are after 1970 and the fitter reports `insufficient events` at every split from 1960 on.

Not promoted, all with numbers in `data/templates.yaml` under the candidate entries:
- `guarantor_presence`, both templates: AUC loss at 4 of 5 chokepoint splits and the sign flips positive (fitted +0.06 against a prior of −0.5).
- `coup_attempt` (holdout ≥ 1986, base 0.833/0.0202/exp-obs 1.01): `presence_any` 0.827/0.0205/1.04, `presence_change` 0.833/0.0203/1.01 (+0.26, the predicted sign, zero discrimination), `presence_USA` 0.831/0.0203/1.02, `presence_RUS` 0.837/0.0202/1.00 (−0.40). Only `presence_RUS` gains, +0.004 of AUC on 339 events with the Brier unmoved — one event changing places, and it would be the first country-named column in a fitted covariate list. Not worth it.
- `autocratic_closure` (holdout ≥ 1986, base 0.592/0.0310/1.14): four presence terms, four zeros (0.591, 0.591, 0.592, 0.592).
- `intrastate_onset` (holdout ≥ 1985, base 0.813/0.0419/0.74): `presence_any` 0.807 (fitted −0.06 against a prior of −0.2), `presence_change` 0.812 (+0.49). Right signs, no discrimination.
- `mid_force` / `mid_war` (holdout ≥ 1946): `patron_presence` mid_force 0.861→0.852 with exp/obs 0.95→1.10 (fitted −0.17), mid_war 0.802→0.809 with exp/obs 3.22→3.50 (fitted **+0.20 — the wrong sign**). `patron_presence_rival` mid_force 0.861→0.859 (fitted +0.42), mid_war 0.802→0.800 (+0.54): the predicted sign on both templates and no AUC on either. Diagnosis: `patron_presence` is on 18% of politically relevant dyad-years and is close to collinear with `allied` and `major_power_any`; what is left is a Cold-War-bloc marker. The re-proposal is a *directed* dyad sample, where "the garrison is on one side" is expressible.

*Direction check on the 2026 state.* `guarantor_withdrawal` fires for the Gulf chokepoint in 2026 (guarantor weight 13 → 12: the fleet leaves the Gulf, a smaller presence appears in the Indian Ocean) and the record's annual transition hazard rises **15.37% → 18.32%**. Rises, as required. No other chokepoint's 2026 state changes.

**Scores: before → after** (`scores/backtest-1870-2010-h20-all.json`, as-of 1870…2010, +20y, 100 runs, universe all; exp/obs · skill · AUC):

| template | before | after |
|---|---|---|
| chokepoint_status | 0.95 · +0.109 · 0.726 | 0.96 · **+0.114** · 0.724 |
| corridor_status | 1.11 · +0.049 · 0.640 | 1.06 · **+0.045** · 0.634 |
| mid_force | 0.77 · +0.088 · 0.766 | 0.78 · +0.084 · 0.765 |
| mid_war | 0.80 · −0.007 · 0.771 | 0.80 · −0.010 · 0.770 |
| coup_attempt | 0.74 · +0.172 · 0.748 | 0.75 · +0.173 · 0.750 |
| intrastate_onset | 1.02 · +0.119 · 0.742 | 1.01 · +0.121 · 0.742 |
| autocratic_closure | 0.68 · −0.157 · 0.584 | 0.68 · −0.164 · 0.583 |
| democratize_step | 0.92 · −0.211 · 0.529 | 0.92 · −0.212 · 0.525 |
| democratic_deepening | 1.40 · −0.087 · 0.681 | 1.38 · −0.052 · 0.692 |
| leader_exit | 0.85 · −0.818 · 0.742 | 0.85 · −0.819 · 0.737 |
| irregular_exit | 2.02 · −0.446 · 0.695 | 2.01 · −0.441 · 0.695 |

Nothing moves. The two templates the promotion touches move by +0.005 and −0.004 of skill; every other template is a random-stream shift (a fired corridor transition consumes one extra draw, so a single changed record draw at as-of 1870 moves every later number by noise). **This promotion rests on the one-year holdout and the falsifiers, not on the rolling-origin score**, and the reason is measurable: in the layer's scoreable window (`COVERAGE` chokepoint/corridor = 1869–1945) `guarantor_withdrawal` is on 26 of 620 chokepoint-years carrying 2 of 29 transitions, against 179 of 720 carrying 5 of 10 after 1946. The corridor half is better placed — 105 of 1,114 pre-1946 rows carrying 9 of 31 transitions, an 8.6% event rate against 2.2% in the rest — which is where the +0.091 of holdout AUC at the 1946 split comes from. Extending the record layer's histories past 1945 (`era-1914-1945/corridors-7 (b)`) is what would let the backtest score this term properly.

The published forward run was regenerated at the same settings and is **byte-identical to the committed one apart from `meta.built`**, so `public/forecast.json` is left as it was: `scripts/run-forward.mjs` does not pass the corridor layer, the promoted term lives only there, and the eleven unpromoted presence features are computed but read by no fitted covariate — an inert feature does not move a draw. The reverted file is the check, not an omission.

## operator / termination — endings as fitted processes (package 8)

**Adds.** Four templates on new units, fitted on the spells the panel and records already contain: `war_end` (dyad-year while at war: duration so far, capability ratio, great-power belligerent, third-party presence, GDP shock), `chokepoint_reopen` (record-year while closed/contested: duration, adjacent war ended, guarantor presence, controller), `contest_settle` (territory-year while `contested_active`: duration, war status of controller and claimant, treaty/pact between them, presence), `intrastate_end` (actor-year while in internal conflict: duration, external presence, regime). Engine: replace the drawn `warLeft` spell with the fitted termination hazard; corridor and territory statuses transition back, not only forward.

**Why.** Every current template predicts onset; nothing predicts termination, so the model is silent on the questions that matter over 1–5 years (an ongoing war ending, a closed strait reopening, a contest settling). Package 2 could not calibrate war duration for exactly this reason.

**Data it needs.** None new: interstate war spells (hand log + MIDs), corridor/territory histories, UCDP episode ends.

**Templates it feeds.** The four new ones; through `at_war`, `intrastate` and record status, every template that reads them.

**Test that decides it.** Each template fitted with n ≥ 100 spell-years and holdout AUC ≥ 0.6 on ≥1946; simulated war-spell length distribution within ±30% of the panel's (mean 3.0y, 33% one-year) *and* 1950–2000 `mid_war` exp/obs not worse than the baseline (the guard that failed in package 2); Suez 1956–57 and 1967–75, Hormuz 1984–88, Iran–Iraq 1980–88 reproduced as the modal termination decade in as-of runs from 1957/1968/1985/1982.

**Status:** partial (2026-09-07). Three of the four terminations are fitted, simulated, scored and left **on**; the fourth — the war spell — is fitted, simulated, scored and left **off**, because it fails the package's own package-2 guard. Every number below is reproducible from the committed tree.

**Implemented as.** One shared module, `src/engine/termination.js`, imported by `scripts/lib/fit.mjs` (over the panel) and `src/engine/core.js` (over the simulated world), the same construction the corridor and presence layers use. Four templates on three new units plus one new sample filter:

| template | unit | sample | n / endings | holdout AUC |
|---|---|---|---|---|
| `war_end` | `war-year` | merged dyadic hostlev-5 spells, CoW MID 3.02 | 1,041 / 407 | **0.612** (≥ 1946) |
| `intrastate_end` | `actor-year`, `sample.flag: intrastate` | runs of the panel's UCDP conflict flag | 1,550 / 249 | **0.734** (≥ 1985) |
| `record_reopen` | `record-year` (both record kinds) | impaired corridor/chokepoint-years 1869–1945 | 185 / 16 | **0.742** (≥ 1930) |
| `contest_settle` | `territory-year` | unsettled territory-years, `data/territories.yaml` | 1,577 / 22 | **0.646** (≥ 1946) |

The spell convention is the record layer's, not `lead: 1`: a row's covariates are the state the year **opens** in, the label is "the spell ends during the year", and a spell's first year (age 0) can be its last — which is exactly what the engine does when a war fires and draws its termination in the same step. A spell whose end the source never observes is right-censored and its last row dropped.

**Engine.** `warLeft` and the resampled run length are gone. A running war now draws `war_end` each year with its own duration-so-far in it; a war already running at as-of is seeded from the observed record with its real start year (the old mechanism gave it a fresh residual). An internal conflict's typed `1 + U{0..5}` is replaced by `intrastate_end`. An **impaired** corridor or chokepoint draws `record_reopen` *instead of* the generic status hazard — not as well as it, because the status template is fitted on every record-year including the impaired ones and a second draw would count one transition twice — and a fired reopening is logged twice, once under the status template so its mass and truth stay the record layer's, once under the reopen template. **Territories enter the engine for the first time**: `createWorld` carries the records whose dated history has opened by as-of and settles them through `contest_settle`. Four switches, one per ending (`ENGINE_ABLATE=war_duration|intrastate_end|record_reopen|contest_settle`), plus `WAR_DURATION_ON=1` to run the candidate war spell without editing the data.

**Deviations from the package as written**, all four forced by the data and all four measured:

1. **`chokepoint_reopen` is `record_reopen`, over both record kinds, on 1869–1945.** Chokepoints alone give 31 impaired record-years inside the window where the hand record layer is complete — below the fitter's own n ≥ 50 floor. On the full 1869–2026 record they give 128, but 86 of those are one record sitting `closed` from 1939 to 2025 because nothing has ever added its post-war reopening, so the full-record base rate (9.4%) is an artefact of a missing history rather than a measurement, and a hazard fitted on it reopens straits an order of magnitude too slowly. Pooling the two kinds is the mechanism as well as the sample: a cut rail line and a closed strait are the same process — the thing stops carrying traffic and later carries it again.
2. **`contest_settle`'s sample is every *unsettled* territory-year, not the `contested_active` ones.** The literal sample is 21 rows and **0** endings: `contested_active` appears only on live 2014–2026 records. `settled` is the only resolved status — `annexed` is a change of holder and the records show it cycling (one record is annexed three times before it is settled once), so treating annexation as a resolution would score a conquest as an ending.
3. **Four of `war_end`'s five stated covariates do not survive**, and the reasons are in `data/templates.yaml` under `candidates:`. The capability ratio deletes 87 of 1,041 spell-years and those rows carry **84 of the 407 endings** (an 82% event rate against 29% elsewhere), because `build-panel.mjs` nulls `cinc` for occupied actor-years and the occupied actor-years of 1940–45 are exactly where the war spells of 1945 end — the `transit_gdp_growth_mean` failure on `corridor_status` again. `major_power_any` costs 0.098 of holdout AUC. `joint_democracy` is the largest available gain (+0.049) at the *wrong sign* on a sample it shrinks by 73 endings. Third-party presence (`patron_presence`) has the predicted sign and no discrimination. What is fitted is duration plus `war_coalition`, a spell-level fact the package did not ask for: whether the pair's war is part of a wider coalition.
4. **The GDP shock is lagged one year, and that is the finding.** Contemporaneous growth in the year a war ends fits at −0.66 against a prior of +0.3 with in-sample AUC 0.639 — "wars end in good years", which is the recovery being dated to the year the fighting stopped. Lagging it flips the sign to the prior's and costs the in-sample AUC. That is a covariate that was partly its own label.

**Test result** (`node scripts/analysis/termination.mjs --runs 400`).

*(a) Each template fitted with n ≥ 100 spell-years and holdout AUC ≥ 0.6 on ≥ 1946.* All four clear n ≥ 100. Three clear the AUC bar at the split the package names; `record_reopen` cannot be evaluated there at all — its window ends in 1945 because that is where `scripts/backtest.mjs` already says the record layer is complete, and on the full record the ≥ 1946 test half holds 4 events, which `fit.mjs` reports as `insufficient events`. It is reported at 1930 (0.742) and 1943 (0.656) instead.

| | n / endings | holdout | package's bar |
|---|---|---|---|
| `war_end` | 1,041 / 407 | 0.612 (≥ 1946, 270 rows / 80 endings) | **pass, and only just — see below** |
| `intrastate_end` | 1,550 / 249 | 0.734 (≥ 1985) | **pass** |
| `record_reopen` | 185 / 16 | 0.742 (≥ 1930), 0.656 (≥ 1943) | **not evaluable at ≥ 1946** |
| `contest_settle` | 1,577 / 22 | 0.646 (≥ 1946, 751 rows / 10 endings) | **pass** |

`intrastate_end` is the only one that discriminates wherever it is cut (0.706 / 0.734 / 0.735 at splits 1970 / 1985 / 2000). **`war_end` does not**: the same fitted pair scores 0.468 / 0.461 / 0.499 / **0.612** / 0.504 / 0.550 at splits 1900 / 1914 / 1939 / 1946 / 1960 / 1975, and its in-sample AUC is 0.507 on 1,041 rows. The one split at which it clears 0.6 is the one the package asked for. That is recorded under `rejected: war_end_discrimination` rather than reported as a pass: what the template is for is the baseline hazard and its duration shape, and the ≥ 0.6 is one split's worth of ordering.

*(b) Simulated war-spell length within ±30% of the panel's.* `WAR_DURATION_ON=1`, as-of 1920, 400 runs: **mean 3.06 years, 36% one-year**, against the panel's 3.02 / 49% over all years and the package's stated 3.0 / 33%. Both inside ±30%. The mechanism this replaces — a length resampled from the panel's run-length distribution — gave 3.91 / 24% and was rejected on exactly this. As-of 1970 the engine gives 2.53 / 42% against a 20-year-windowed panel figure of 2.39 / 57%. Internal conflicts: engine 2.55 / 45% against a 20-year-windowed panel 3.02 / 47% (the engine's spells are measured inside a 20-year horizon, so the panel has to be truncated the same way to be comparable at all).

*(c) 1950–2000 `mid_war` exp/obs not worse than the baseline — the guard that failed in package 2.* **It fails, and that is why the war spell ships off.** With the fitted hazard driving war spells: 1950–2000 `mid_war` exp/obs **2.65 → 3.57** and `mid_force` **1.17 → 1.43**; pooled 1870–2010 `mid_war` skill −0.010 → −0.064 and `mid_force` +0.084 → +0.044. The pooled *calibration* improves (`mid_war` 0.80 → 1.10, `mid_force` 0.78 → 0.96 — the model under-predicted wars over the whole window and now does not), so this is a genuine trade and not a bug; but the guard is a guard. The mechanism therefore stays `duration.status: candidate`, exactly as the resampled version did, with the numbers in `data/templates.yaml` under `rejected: war_end` and both ablation runs written to `scores/backtest-*-abl-war_duration_on_1.json`. With it off, the guard passes: **1950–2000 `mid_war` 2.65 → 2.62, `mid_force` 1.17 → 1.17**.

*(d) The four named cases, as-of runs with coefficients refit on labels ≤ as-of.* All four reproduce the observed decade as the modal one, two of them narrowly:

| case | observed | modal | observed decade's share | median |
|---|---|---|---|---|
| Suez reopen, as-of 1956 | 1957 | **1950s** | 40% (next: 1960s 34%) | 1960 |
| Suez reopen, as-of 1968 | 1975 | **1970s** | 54% (next: 1960s 14%) | 1972 |
| Hormuz reopen, as-of 1985 | 1988 | **1980s** | 36% (next: 1990s 31%) | 1990 |
| Iran–Iraq war ends, as-of 1982 | 1988 | **1980s** | 99% | 1983 |

The package writes the first as "as-of 1957"; at as-of 1957 the canal is already open (it reopened in April), so the run starts from 1956, the last year it closes. Suez 1956 and Hormuz 1985 are separated from the next decade by 6 and 5 points of 400 runs — read them as ties that fall the right way, not as sharp results. The war case is sharp because the spell is seeded at age 2 with a hazard of 0.47.

**Scores: before → after** (`node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`; exp/obs · Brier skill · AUC). "before" is the committed baseline; "after" is the published run with `intrastate_end`, `record_reopen` and `contest_settle` on and the war spell off.

| template | before | after |
|---|---|---|
| mid_force | 0.78 · +0.084 · 0.765 | 0.77 · +0.088 · 0.765 |
| mid_war | 0.80 · −0.010 · 0.770 | 0.80 · −0.009 · 0.770 |
| chokepoint_status | 0.96 · +0.114 · 0.724 | 0.95 · **+0.066** · 0.695 |
| corridor_status | 1.06 · +0.045 · 0.634 | 1.05 · **+0.108** · 0.699 |
| democratize_step | 0.92 · −0.212 · 0.525 | 0.92 · −0.216 · 0.527 |
| autocratic_closure | 0.68 · −0.164 · 0.583 | 0.67 · −0.163 · 0.581 |
| intrastate_onset | 1.01 · +0.121 · 0.742 | 1.05 · +0.122 · 0.747 |
| leader_exit | 0.85 · −0.819 · 0.737 | 0.85 · −0.821 · 0.737 |
| irregular_exit | 2.01 · −0.441 · 0.695 | 2.01 · −0.437 · 0.697 |
| coup_attempt | 0.75 · +0.173 · 0.750 | 0.75 · +0.171 · 0.749 |
| democratic_deepening | 1.38 · −0.052 · 0.692 | 1.41 · **−0.103** · 0.676 |
| **intrastate_end** (new) | — | 1.00 · +0.119 · 0.736 |
| **record_reopen** (new) | — | 1.13 · +0.082 · 0.718 |
| **contest_settle** (new) | — | 0.84 · +0.063 · 0.798 |
| `war_end` (candidate, `WAR_DURATION_ON=1`) | — | 1.12 · −0.002 · 0.785 |

1950–2000 (the guard's window): `mid_war` 2.65 → **2.62**, `mid_force` 1.17 → 1.17, `intrastate_onset` 1.04 → 1.07, `coup_attempt` 0.76 → 0.77, `democratic_deepening` 1.14 · +0.05 → 1.18 · −0.006. New rows: `intrastate_end` 0.95 · +0.110 · 0.726, `contest_settle` 2.00 · +0.083 · 0.923.

**The layer switches off cleanly.** `ENGINE_ABLATE=war_duration,intrastate_end,record_reopen,contest_settle` reproduces the committed baseline **exactly** on all eleven pre-existing templates — 0.78 · +0.084 · 0.765 on `mid_force`, 0.96 · +0.114 · 0.724 on `chokepoint_status`, and so on, to three decimals. Nothing in this package changes a number except through a mechanism you can name and turn off.

**Two costs, attributed by ablation rather than guessed.**

- **`chokepoint_status` loses 0.048 of skill and `corridor_status` gains 0.063**, and `ENGINE_ABLATE=record_reopen` shows both are entirely the reopen substitution (chokepoint +0.123 / corridor +0.072 with it off, against +0.066 / +0.108 with it on). The reason is the substitution's own logic: an impaired record's transition hazard was the status template's 3.2% base rate and is now the reopen template's 8.6% front-loaded one, which is what the record layer says actually happens to impaired records — the exp/obs stays near 1 (0.96 → 0.95, 1.06 → 1.05) and what moves is the ordering of nine chokepoint records over eight as-of years. On n = 36 rows that is two records changing places. Reported, not defended.
- **`democratic_deepening` falls 0.052 → 0.103 of negative skill on 169 rows / 29 events**, and it is *not* attributable: `ENGINE_ABLATE=intrastate_end` gives −0.108 and `ENGINE_ABLATE=record_reopen` −0.076, both worse than one of the two on its own. Any mechanism that consumes a random number moves this template, which is the honest description of a 29-event sample.

**What the package surfaced that it did not ask about: `data/territories.yaml` has the corridor layer's disease.** Twelve records are "unsettled contests" in 2025 and seven of them are contests history closed decades ago — the record's history simply stops at its last status change and no row was ever added for the settlement. That biases `contest_settle`'s base rate down (22 settlements over 1,577 territory-years) and it is why the 2026 direction check assigns 40-56% forty-year settlement probabilities to territories that are not disputed by anyone. The same escalation as `era-1914-1945/corridors-7 (b)`, on the other record layer.

**The 2026 direction check** (published engine, 400 runs × 40 years): the two live impaired sea records reopen with P = 0.79 and 0.73, both with a median year of 2029-2030; the cut pipeline reopens with P = 0.80 by 2029; and the record that closed in 1939 and was never reopened in the data sits at **P = 0**, because 86 years of impairment take `z(impair_duration)` off the end of the fitted range. That last number is the data hole made visible rather than a forecast.

## operator / derived-polarity — replace hard-coded era dates with derived world state (package 9)

**Adds.** World-level derived variables computed each year in both `build-panel.mjs` and `core.js` (shared code): `polarity` from capability shares (unipolar if the top actor holds > 2× the second; bipolar if two actors each exceed a threshold and the third is far behind; multipolar otherwise), `hegemon` = the top actor, `promotion_era` = hegemon is a democracy (regime ≥ 2) and its aid/GNI-weighted conditionality is active, `info_rate` from the observed logistic fit of `info_access` rather than a 1985 switch. `bipolar`, `unipolar_us`, `cold_war`, `anticoup_norm` become derived aliases; `great_game` = superpower client × `polarity == bipolar`.

**Why.** The promoted era terms (`great_game`, `aid_conditionality`, `unipolar_us`) are typed calendar years: 1947–1991, 1992–2016. Forward from 2025 they are all switched off forever, so a US–China bipolar 2030s cannot reactivate the client-coup mechanism, and no future promotion era can exist. They were fitted *because the eras had happened*; a forecast needs the state, not the dates.

**Data it needs.** None: `cinc` (and the modern composite from package 10), `regime`, `aid_gni`.

**Templates it feeds.** `coup_attempt`, `autocratic_closure`, `democratize_step`, `mid_force`, `mid_war` — everything carrying an era term.

**Test that decides it.** The derived flags reproduce the historical eras without being told them (bipolar ≈ 1947–1991 ± 3 years, unipolar ≈ 1992–2016 ± 5, promotion era ≈ 1992–2016) and the pooled backtest skill of every template that reads them does not fall by more than 0.02; in the 2025 forward run, `polarity` must be reported per year (with the 2030s share where it flips to bipolar) rather than assumed.

**Status:** implemented (2026-09-07).

**Implemented as.** One shared module, `src/engine/polarity.js`, imported by `scripts/build-panel.mjs` and by `src/engine/core.js`, so the era a coefficient was fitted on and the era the simulation runs forward are the same construction.

1. **Projection-weighted capability, not CINC.** An actor's share of world capability is the geometric mean of its **CINC share** and its **military-expenditure share**, smoothed with an EWMA (λ = 0.75) and classified by a **gap rule**: ranked by smoothed share, the poles are the actors above the first ratio of ≥ 2.0; one pole = unipolar, two = bipolar, more (or no gap in the top five) = multipolar. Military expenditure comes from CoW NMC to 2022 and from the World Bank series the capability composite already uses (`MS.MIL.XPND.GD.ZS × NY.GDP.MKTP.CD`) after that; only shares enter, so the two need not share a scale.

   The package proposed the rule on capability shares alone. **That construction fails, and the failure is worth recording**: on CINC alone the same λ and gap read 1999–2007 as bipolar and 2008–2024 as multipolar *with the wrong pole at the top* — CINC is the unweighted mean of six indicators of which four are latent mass (population, urban population, energy, iron and steel), so the largest 2016 share is 22.9% against the second's 13.2%. Military expenditure is the one indicator of the six that measures what a pole can project. On military expenditure alone the eras come out well (bipolar 1950–1992, unipolar 1993–2024) but only 59 of the 69 interwar years read multipolar and the series cannot be computed past NMC without the World Bank join. The geometric mean of the two is what reproduces all three eras at once.

2. **The eras as state.** `bipolar`, `unipolar`, `multipolar`, `n_poles`, `hegemon_share`, `is_hegemon`, `dem_share`, `cold_war` (= bipolar), `promotion_era` (= unipolar and the hegemon's own regime ≥ 2), `anticoup_norm` (= at least half of live states score regime ≥ 2), `hegemon_regime` (the top pole's regime, not a named state's), `great_game` (superpower client × derived bipolar) and `aid_conditionality` (ODA/GNI in the derived promotion era) are all panel columns computed from the state. The typed versions survive one run as `bipolar_dates`, `unipolar_us_dates`, `cold_war_dates`, `anticoup_norm_dates`, `great_game_dates`, `aid_conditionality_dates` and `hegemon_regime_dates` so the checker can diff them; `scripts/analysis/polarity.mjs` prints the diff.

   Forward, the engine carries each actor's projection mass and **multiplies it by that actor's own simulated growth** each year (an actor nobody simulates grows at the panel's long-run mean), renormalises, and runs the same EWMA and gap rule. That is the assumption that lets a forecast change polarity at all, and it is declared as one in the code: capability share follows relative output, loosely. The dyadic capability ratio still reads the carried `cinc` — changing *that* is a separate package. The democratic share is anchored at the panel's whole-system value and moved by the simulated universe's own regime changes, so it means the same thing whichever universe is run.

3. **The information wave.** `info_access` diffused at a rate switched by hand at 1985 (0.15/yr after, 0.03 before). It is now a frontier `F(y)` — a logistic fitted by least squares to the live-actor mean of `info_access` — that each actor closes `κ` of its gap to each year, never downward. Both constants are refitted by `build-panel.mjs` on every build and carried in `panel.meta.info_wave`; `κ` is fitted against **what the rule does** (run forward from 1965/75/85/95/2005 to 2024 and scored on the live-actor mean it produces), not on one-year differences. `INFO_DIFFUSION=switch` restores the typed rate as an ablation, which is how the two halves of this package are scored apart below.

**Deviation from the package as written.** The package asked for `polarity` "from capability shares"; this uses capability *and* military expenditure, for the reason in (1). It also asked for `unipolar_us` to become a derived alias — the column is now called `unipolar` (nothing referenced the old name as a covariate; `unipolar_us_dates` keeps the typed series).

**Test result.** `node scripts/analysis/polarity.mjs` — the derived series, having been told nothing about any date:

| | derived | asked for | |
|---|---|---|---|
| bipolar era | **1950–1994** | 1947–1991 ± 3 | worst end off by 3 — **pass** |
| unipolar era | **1995–2014** | 1992–2016 ± 5 | off by 3 — **pass** |
| promotion era | **1995–2014** (and 1946–48) | 1992–2016 | off by 3 — **pass** |
| multipolar 1870–1938 | **69/69 years** | (not asked; the honest check) | **pass** |
| anti-coup norm | 2001–2023 (and 1999) | typed 2000–2025 | crosses back below the majority in 2024 |

The whole 1816–2025 series is six states: multipolar to 1945, unipolar 1946–48 (the atomic monopoly and a demobilised second power — the top share is 46.6%, gap1 3.01), one year of multipolarity in 1949, bipolar 1950–1994, unipolar 1995–2014, bipolar 2015–2024 with the second pole changed. 2025 has no capability measurement in any source, so the panel leaves it null and the engine carries 2024 forward with `stale = 1`.

Sensitivity, since all three thresholds are estimates (the full grid is in the script):

| weight · λ · gap | bipolar | unipolar | multipolar 1870–1938 | states | < 3y |
|---|---|---|---|---|---|
| 0.40 · 0.75 · 2.0 | 1950–1993 | 1994–2017 | 66/69 | 10 | 3 |
| **0.50 · 0.75 · 2.0** | **1950–1994** | **1995–2014** | **69/69** | **6** | **1** |
| 0.60 · 0.75 · 2.0 | 1950–1975 | 1996–2003 | 65/69 | 13 | 2 |
| 0.50 · 0.60 · 2.0 | 1949–1976 | 1993–2013 | 65/69 | 15 | 7 |
| 0.50 · 0.85 · 2.0 | 1952–1996 | 1999–2016 | 69/69 | 7 | 2 |
| 0.50 · 0.75 · 1.9 | 1950–1993 | 1994–2014 | 66/69 | 8 | 1 |
| 0.50 · 0.75 · 2.1 | 1951–1977 | 1996–2013 | 69/69 | 9 | 3 |

The point in use is a genuine optimum in all three directions and a **sharp** one: it is the only cell that puts every interwar year in the multipolar state *and* keeps the series to six states. Two of the three values are statements rather than fits (equal weight; the package's own "twice"), λ is the one tuned knob, and the eras are stable across 1.95–2.05 of gap and 0.75–0.85 of λ. Read the table as the honest width of the claim: the eras are rediscovered, but not from any threshold.

Diff against the typed flags, year by year (`*_dates`): `bipolar` agrees on 193/209 years (92.3%; differs 1947–49, 1992–94, 2015–24), `unipolar` 201/209, `anticoup_norm` 206/209, `cold_war` only 62/209 because the typed version called every year before 1992 cold war. On live actor-years: `great_game` agrees on 94.2% (non-zero 3,267 derived vs 2,534 typed), `aid_conditionality` 93.8%, `hegemon_regime` 75.8%.

The information wave: frontier L = 1, r = 0.086, t0 = 2000.75 (rmse 0.0361 on 209 years of the live-actor mean); κ = 0.295 with rmse **0.0795** on 195 simulated year-points against the typed switch's **0.0822** on the same objective. Run forward from 1990 it reaches 0.875 in 2024 against an observed 0.869 (the typed rule 0.888); from 2000, 0.885 against 0.876 (typed 0.804). In a 1870 run it holds at the panel's floor of 0.020 for twenty years, where the typed 0.03/yr drifts to 0.036 against a panel that observes 0.020 throughout.

Forward from 2025, 40 runs × 40 years, polarity reported per year rather than assumed: the world **starts** bipolar (poles top 25.2% and 18.4%, gap1 1.37, gap2 2.85), the hegemon scores regime 2 and the democratic share is 0.491, so `promotion_era` and `anticoup_norm` are both **off** in 2026 — the first forecast in this model's history where the promotion era is not running. It stays bipolar in 100% of run-years to 2055 and 98% to 2065; the leading pole passes from the first to the second between 2040 and 2045 (the first pole leads 100% of runs in 2030, 78% in 2035, 55% in 2040, 48% from 2045); 1 run in 40 leaves bipolarity inside the horizon. The 2030s flip the package anticipated has already happened in the measured data — 2015, not 2030.

**Scores: before → after** (`node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`; exp/obs · Brier skill · AUC). The third column is the same run with `INFO_DIFFUSION=switch`, i.e. the derived eras with the *typed* diffusion, so the two halves can be told apart:

| template | before | after | derived eras only |
|---|---|---|---|
| mid_force | 0.77 · +0.085 · 0.766 | 0.77 · +0.088 · 0.766 | 0.77 · +0.086 · 0.765 |
| mid_war | 0.80 · −0.008 · 0.770 | 0.80 · −0.007 · 0.771 | 0.79 · −0.006 · 0.770 |
| chokepoint_status | 0.95 · +0.107 · 0.726 | 0.95 · +0.109 · 0.726 | 0.95 · +0.109 · 0.726 |
| corridor_status | 1.10 · +0.048 · 0.639 | 1.11 · +0.049 · 0.640 | 1.11 · +0.049 · 0.640 |
| democratize_step | 0.95 · −0.194 · 0.546 | 0.92 · **−0.211** · 0.529 | 0.92 · −0.209 · 0.528 |
| autocratic_closure | 0.66 · −0.149 · 0.597 | 0.68 · −0.157 · 0.584 | 0.67 · −0.159 · 0.584 |
| intrastate_onset | 1.02 · +0.114 · 0.739 | 1.02 · +0.119 · 0.742 | 1.01 · +0.113 · 0.739 |
| leader_exit | 0.85 · −0.828 · 0.735 | 0.85 · −0.818 · 0.742 | 0.85 · −0.827 · 0.732 |
| irregular_exit | 2.05 · −0.468 · 0.701 | 2.02 · −0.446 · 0.695 | 2.07 · −0.504 · 0.696 |
| coup_attempt | 0.90 · +0.182 · 0.759 | **0.74** · +0.172 · 0.748 | 0.92 · +0.175 · 0.754 |
| democratic_deepening | 1.51 · −0.085 · 0.706 | 1.40 · −0.087 · 0.681 | 1.39 · −0.084 · 0.665 |

**The package's guard passes**: no template's pooled skill falls by more than 0.02 (worst `democratize_step` −0.017; `irregular_exit` gains 0.022). Two costs are worth naming rather than rounding away.

- **`coup_attempt` calibration, 0.90 → 0.74 exp/obs**, and the third column shows it is entirely the information wave (0.92 with the typed diffusion). The fitted wave diffuses faster in the 1970s–90s than the typed switch — which is what the panel says happened: from a 1970 start the fitted rule reaches 0.291 by 1990 against an observed 0.278, the typed rule 0.225 — and `info_access` carries −0.45 on coup odds, so the model predicts fewer coups than it used to. The old calibration was closer to the observed coup count *because* its diffusion was wrong in the direction that happened to compensate. Reported, not defended: the diffusion rule is now the one that fits the diffusion data, and the coup base rate is where that shows up.
- **The regime templates lose AUC**: `democratic_deepening` 0.706 → 0.681 (n = 169, 29 events), `democratize_step` 0.546 → 0.529, `autocratic_closure` 0.597 → 0.584. `aid_conditionality` moves from a 25-year typed window to a 20-year derived one plus 1946–48, and its coefficient falls with it (+0.83 → +0.68 on democratization, −0.50 → −0.43 on closure). `democratize_step` had no discrimination before this package and has none after it (0.55 → 0.53); `democratic_deepening`'s move is 25 events' worth of ordering.

Fitted-coefficient movement on the promoted era terms, one-year holdout: `great_game` +0.67 → +0.60 on `coup_attempt` (holdout AUC 0.833 unchanged), +0.43 → +0.29 on `autocratic_closure` (0.589 → 0.579); `aid_conditionality` +0.83 → +0.68 on `democratize_step` (0.604 → 0.593), −0.50 → −0.43 on `autocratic_closure`. Every era term keeps its sign and most of its size under the derived flags, which is the substantive result: the mechanisms were not artefacts of the dates.

**Checked (2026-09-07).** Build green and reproducible (`data/panel.json`, `events.json`, `fits.json` rebuild byte-identical modulo their timestamps); the deciding test reproduces all four counts; the committed 1870–2010 backtest reproduces bit-exactly from the committed tree.

One construction divergence was found and fixed in `src/engine/core.js`. `initPolarity` read `pol_mass`/`pol_share` with the same 30-year last-observation carry `buildActorState` uses for actor attributes. But a share is a share of *one year's* distribution: at as-of 1950 an actor that is live but has no capability measurement came back carrying its 1945 share (0.207), which entered the ranking as the second pole and rescaled every other. The engine therefore started as-of 1950–1954 **multipolar** where the panel — and so the fit — say bipolar, i.e. `cold_war` and `great_game` were off through a 20-year simulated window the coefficients were fitted on as bipolar. The two polarity columns now carry only past their own last measured year (the case the carry exists for: capability ends in 2024, the forecast does not), and the engine's world state at as-of now equals the panel's for **all 196 years** the panel classifies, 1950–1954 included. Effect on the scores: ≤ 0.002 of skill or AUC on any template (it changes one of the fifteen as-of windows); both committed score files were regenerated with the fix and the table above is the regenerated run. The 2025 forward run and every published slice are unchanged — at as-of 2025 the carry still applies and behaves as before.

**What this does not do.** The dyadic capability ratio still reads carried `cinc`, not the projection share — two capability numbers now live in the model and only one of them moves in a forward run. The forward drift of capability share by simulated GDP growth is an assumption with no ablation behind it (it cannot be scored: no backtest window contains a polarity transition the model could have called). And the interwar result depends on the military-expenditure share, where CoW's official-rate conversion of Soviet spending is a known artefact (3.5 bn USD in 1930 against Britain's 0.51 bn, on a CINC share of 14.9% against 7.8%) — it is the *weight* on that series, not its accuracy, that keeps 1932–34 out of the bipolar state, and a future NMC revision could move those three years.

## operator / modern-capability — capability after 2001 and staleness (package 10)

**Adds.** CoW NMC 6.0 (1816–2016) replacing 3.02; a 2017→ capability composite from World Bank milex, GDP (PPP), population, energy use and SIPRI/IISS personnel where available, spliced to CINC with the overlap years; a `stale` field on every carried-forward value in `createWorld` (`{ var: years_since_observed }`), surfaced in the actor panel and hover card ("capability as of 2016").

**Why.** CINC ends 2001 and is carried forward 25 years, so every modern dyad is scored on 2001 strengths, and the viewer shows carried values as if current.

**Data it needs.** NMC 6.0 (Dataverse or correlatesofwar.org — the latter blocks scripted fetches), SIPRI milex (open), WB series already fetched.

**Templates it feeds.** `mid_force`, `mid_war`, `chokepoint_status`, `corridor_status` (capability ratio, major-power terms); `polarity` in package 9.

**Test that decides it.** The composite tracks CINC with r ≥ 0.95 over 1990–2016; 1990–2010 dyadic backtest AUC not lower than baseline; no `cinc` value older than 5 years in the 2025 world; the staleness field present on every carried value.

**Status:** implemented (2026-09-07).

**Implemented as.** Three pieces.

1. **NMC 7.0, not 6.0 (1816–2022).** correlatesofwar.org answers 403 to every scripted request and Harvard Dataverse carries only 3.02 (searched: the five hits for "National Material Capabilities" are 3.02 twice, ICPSR's 1816–1985 twice, and one replication archive). The copy a script can reach is the `cow_nmc` data.frame inside the R package **peacesciencer**, whose own documentation says "version 7.0 of the Correlates of War National Material Capabilities data" — six years past the 6.0 the package asked for. `scripts/fetch-nmc.mjs` downloads it and `scripts/lib/rdata.mjs` decodes R's XDR serialization (gzip + `RDX3`; ~120 lines, throws on any SEXP type it does not handle rather than parsing silently wrong) so no R is needed at build time. `scripts/build-panel.mjs` reads `nmc_7.0.csv` where the fetch has run and falls back to `nmc_3.02.csv` otherwise, printing which and writing it into `meta.sources.cinc`.

   This is a revision of the whole history, not only an extension: of the 13,020 CINC values the two versions share, **153 are identical and 1,491 differ by more than 5%**. `coup_attempt` gains 3,093 actor-years and 38 events (n 5,834 → 8,927, in-sample AUC 0.814 → 0.849) because its covariates now resolve past 2001; the dyad templates gain 173 rows.

2. **The composite, 2023– .** `scripts/lib/capability.mjs` rebuilds CINC's own construction — the unweighted mean of share-of-system indicators — from series that are still published: milex (WDI `MS.MIL.XPND.GD.ZS` × `NY.GDP.MKTP.CD`), GDP at PPP, OWID primary energy consumption, WDI population, WDI population × urban share. Two departures, both declared in `COMPONENTS` / `MISSING_COMPONENTS` and printed by the diagnostic rather than buried: **GDP PPP stands in for iron and steel** (no open annual series survives), and **military personnel is not represented at all** (SIPRI publishes expenditure but not personnel, IISS is not redistributable, and the World Bank's `MS.MIL.TOTL.P1` returned an HTML error page on every attempt while this was built). An actor-year needs 3 of the 5 to be scored at all; an actor missing one indicator is scored on the rest, not on a zero. Per actor the splice factor is the geometric mean of `cinc / composite` over the last 10 overlap years, and each extension year is renormalised to the share mass CINC itself carried in 2022, so the column keeps summing to ≈1 the way CINC does. `cinc_spliced` (0 = NMC's measurement, 1 = composite) is a panel column, so nothing downstream has to guess.

   WDI ends 2024, so the composite extends 2023 (191 actors) and 2024 (184) and **2025 is left null** — the engine's own carry-forward covers it and records the one year of staleness. The alternative (extrapolating a year the source does not have) would be a fabricated measurement.

3. **Staleness.** `buildActorState` in `src/engine/core.js` already recorded `stale[var] = years_since_observed` for carried values; two gaps are closed. It now also records the event flags reset to no-event and `gdp_growth` imputed from its trailing decade, and it carries a parallel `carry[var]` saying *how* the value was produced — `last` | `aged` (leader age and tenure, advanced by the elapsed years) | `zero` (a flag reset) | `trailing_mean`. A value the panel observes at as-of appears in neither map, so "is in `stale`" is exactly "is not a measurement of this year". `public/world.json` gains `stale` (years from the last observation to t0) on every series variable and `public/history.json` gains `last_observed: { var: year }` per actor, which is what a hover card needs to say "capability as of 2022".

**Deviation from the package as written.** The package asked for the staleness to be *surfaced in the actor panel and hover card*. `src/lib/` and `src/App.svelte` are owned elsewhere this turn (implementer rule), so this package ships the fields those two views need (`world.json` `vars[].stale`, `history.json` `last_observed`) and not the markup. The wiring is one line in each view and is left to the UI turn.

**Also.** NMC 7.0's 2002–2022 block carries three population series the build guard rejects, all now declared in `data/history/population_guard.yaml` with numbers: FSM 2002–2016 sits at 500–523 thousand between its own 117 (2001) and 109 (2017) — a data error, so `prefer: population`; ERI 2002–2016 extends the existing no-census dispute and adds two discontinuities of its own; GNQ extends to 2015. Three v7.0 *revisions* of pre-2002 years also trip it and are declared: PAN 1903–1913 (a flat repeated 450 thousand against the 1911 census's 336,742), CYP 2001 (revised 786 → 701 thousand — the government-controlled area — against OWID's whole-island 0.96M), AFG 1919 (one new row inside an existing declaration).

**Test result.** `node scripts/analysis/capability-composite.mjs`:

| test | result |
|---|---|
| composite vs CINC, 1990–2016 | **r = 0.961**, log r = 0.981, n = 5,021 actor-years — passes ≥ 0.95 |
| composite vs CINC, 1990–2001 | r = 0.950, log r = 0.980, n = 2,169 |
| composite vs CINC, 1990–2022 (whole overlap) | r = 0.964, log r = 0.981, n = 6,167 |
| `cinc` older than 5 years in the 2025 world | **0 actors** (modeled: 56 at 1y, 2 at 2y, 1 at 3y; all 196: 1 at 0y, 184 at 1y, 7 at 2y, 4 at 3y) |
| values at as-of the panel does not observe there and carry no staleness entry | **0** (was 519 of 8,489 before this package — every one an event flag reset to zero) |

The composite is validated against NMC's own years only: `cincOf` in the test returns null wherever `cinc_spliced = 1`, so it is never compared with itself. Rank agreement is the weak spot worth stating — of the top 20 by CINC in 2016, 7 hold the same rank under the composite and the mean absolute rank shift is 2.3 places. The missing personnel indicator is the obvious suspect; the levels track (r 0.96) far better than the ordering does.

`node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`, the package's dyadic condition (auc / auc_at_risk / exp:obs):

| as-of | mid_force before | mid_force after | mid_war before | mid_war after |
|---|---|---|---|---|
| 1990 | 0.747 / 0.878 / 0.84 | 0.747 / **0.879** / 0.84 | 0.596 / 0.546 / 0.85 | 0.596 / **0.569** / 0.85 |
| 2000 | 0.739 / 0.644 / 0.67 | 0.739 / 0.642 / 0.67 | 0.497 / — / 0.18 | 0.497 / — / 0.18 |

Not lower: headline AUC is identical to three places at both as-of years, `auc_at_risk` rises at 1990 on both templates and falls 0.002 on one row at 2000. **The honest reading is that this test cannot see what the package is for.** CoW MID ends 2001, so `COVERAGE` scores dyad-years only to 2001 and the as-of 1990/2000 horizons are scored entirely inside years where 3.02 already had measured CINC. What changed there is the *revision*, and it is worth ~0.00 of dyadic AUC. The gain the package was written for — a 2010s or 2020s dyad scored on 2010s or 2020s strengths rather than 2001's — is not scorable against any dataset in the repo, and saying so is more useful than a number that looks like a pass.

**Scores: before → after** (pooled, as-of 1870…2010, +20y, 100 runs, all states; exp/obs · Brier skill · AUC):

| template | before | after |
|---|---|---|
| mid_force | 0.78 · +0.085 · 0.767 | 0.77 · +0.085 · 0.766 |
| mid_war | 0.80 · −0.008 · 0.770 | 0.80 · −0.008 · 0.770 |
| coup_attempt | 0.89 · +0.177 · 0.758 | 0.90 · **+0.182** · 0.759 |
| intrastate_onset | 1.02 · +0.113 · 0.738 | 1.02 · +0.114 · 0.739 |
| irregular_exit | 2.05 · −0.472 · 0.698 | 2.05 · −0.468 · **0.701** |
| leader_exit | 0.86 · −0.829 · 0.736 | 0.85 · −0.828 · 0.735 |
| democratize_step | 0.95 · −0.189 · 0.548 | 0.95 · −0.194 · 0.546 |
| autocratic_closure | 0.65 · −0.143 · 0.602 | 0.66 · −0.149 · 0.597 |
| democratic_deepening | 1.50 · −0.073 · 0.704 | 1.51 · −0.085 · 0.706 |
| chokepoint_status | 0.96 · +0.140 · 0.759 | 0.95 · +0.107 · **0.726** |
| corridor_status | 1.13 · +0.062 · 0.664 | 1.10 · +0.048 · **0.639** |

Everything moves by less than 0.006 of AUC except the two corridor templates, and those need naming rather than rounding away. Their ground-truth window is 1869–1945, so **no post-2001 capability value can reach them**; the only channel is the whole-history CINC revision moving `log(cap_ratio)` in the dyadic hazards that drive the simulated wars they read. Pooled they are n=36 (17 events) and n=83 (23 events) — one swapped pair is worth ~0.03 of AUC at that size, and the per-as-of rows show exactly that: the whole pooled move on `chokepoint_status` is the as-of 1910 row going 0.725 → 0.550 on **nine units**, while 1920 is unchanged, 1930 rises 0.800 → 0.825 and 1940 is unchanged. Reported, not defended: at n=9 neither number carries information.


## operator / cleanup — phase 1 (not a package: done by hand after the baseline)

Registry entries that are snapshot estimates with no history are marked `model: false` (display only): `fiscal_breakeven`, `desal_dependence`, `food_self_sufficiency`, `mineral_refining_share`, `reserve_currency_share`, the `cap_*` levels, chokepoint exposure. ERT episode templates and the switched-off candidates (coalition joining, war duration) move to a `retired:` block in `data/templates.yaml`. The scenario latents in `data/variables.yaml` are deleted (nothing reads them). The conflict field is relabelled *belligerents* until UCDP GED is in. `scripts/analysis/` holds the implementer one-offs.

## era-1870-1914-r2 / data-2 — CoW Inter-State War v4.0 participant dates instead of a hand-typed war list

**What it would add.** The `at_war` panel column built from a dataset rather than from `data/history/events.yaml`'s
hand list. Today `scripts/build-panel.mjs` reads `kind: war` entries and nothing else; `data/raw/hist/cow_war.csv` is a
741-row name/id codelist with no participants or dates and is read by nothing.

**Why.** Before this turn the hand list carried 40 at_war actor-years across the whole of 1870–1914 (1.7% of the era's
live actor-years) with 32 of the 45 years showing zero states at war anywhere on earth. Eight wars added this turn take
it to 85 and cut the longest all-peace run from 15 years to 7 — but that is eight hand entries, not a source, and the
same hole is certainly present in every era nobody has attacked yet. The covariate carries the largest priors in the
model (`lag1(at_war_any)` fitted at +1.06 on `mid_force` and +1.77 on `mid_war`, `adjacent_war` +2.40 on
`chokepoint_status`, `transit_at_war_any` +1.70 on `corridor_status`, plus `at_war` on both regime templates and all
three termination hazards), and its absence is a silent 0, not a null that drops a row.

**Data it needs.** CoW Inter-State War v4.0 (`Inter-StateWarData_v4.0.csv`, participant-level, 1816–2007) with
`ccode`, `StartYear1/Month1/Day1`, `EndYear1/…`, `Side`. correlatesofwar.org answers 403 to scripted fetches; the
`peacesciencer` R package that supplied NMC 7.0 and Direct Contiguity 3.2 this turn ships `cow_war_inter` — the same
route (`scripts/fetch-contdir.mjs` is the pattern, bzip2-wrapped RDX3 through `scripts/lib/rdata.mjs`) should reach it.

**Templates it feeds.** `mid_force`, `mid_war` (`at_war_any`), `democratize_step`, `autocratic_closure`,
`democratic_deepening`, `liberal_erosion` (`at_war`), `chokepoint_status`, `corridor_status` (`adjacent_war`),
`record_reopen`, `contest_settle`, `war_end`, `intrastate_end`.

**Test that decides it.** Rebuild the panel and assert the 1870–1914 at_war actor-year count rises from 85 and that no
run of more than 2 consecutive years shows zero states at war; then rerun the 1870–2010 backtest and report the move on
`mid_force`/`mid_war` exp/obs at every as-of year, and on the two record templates, against the hand-list baseline.
Keep the hand list as an override layer for wars CoW does not code (the 1882 Anglo-Egyptian war is one).

## era-1870-1914-r2 / statistics-8 (b) — a settled contest writes a border into the graph

**What it would add.** An optional `implies_border: [A, B]` on a `data/territories.yaml` record, and an engine rule
that adds that edge to `world.contiguous` when `contest_settle` fires on the record during a run. A new engine
dynamic — the territory layer writing back into the dyad layer — which is why it is here and not in the turn.

**Why.** `src/engine/core.js` computes the border graph once at as-of and never advances it. Successor inheritance
landed this turn (a retiring actor's edges pass to its successor, which is what opens the Danubian pairs), but a border
that is *created* inside the horizon by a settlement the engine itself simulates still cannot exist. `BGR|GRC` starts
in 1913, inside the horizon of both the as-of-1900 and the as-of-1910 runs, and their dispute is a structural miss at
both.

**Data it needs.** None external: the pairs are already implied by the records this turn added (`bolivian_littoral`,
`morocco`, `norway_sweden_union`, `andes_cordillera`) and by `data/contiguity.json`'s own dated intervals.

**Templates it feeds.** `mid_force`, `mid_war` (through the relevance gate), and `contest_settle` indirectly.

**Test that decides it.** `n_structural_miss` on `mid_force` at as-of 1900 and 1910 must fall below the 20 and 21 this
turn leaves, with `auc_at_risk` not falling below 0.71 / 0.68; and the guard from the rejected coalition-relevance
package applies — pooled 1950–2000 `mid_force` exp/obs must not rise, since the same rule opens post-1945 pairs too.

## era-1870-1914-r2 / corridors-5 — `terms` as a third thing a record-year can change

**What it would add.** A `terms:` field on a corridor/chokepoint history row (`free_passage | concession | lease |
guarantee | ownership_shift | none`, carried forward), and a label for `chokepoint_status` / `corridor_status` that
fires on a change of status, controller **or** terms.

**Why.** The label today is "status or controller changed". Three of Suez's five rows in 1870–1914 change neither: the
Disraeli share purchase (1875.86), the Convention of Constantinople (1888.82) and the Entente (1904.29) are dated,
sourced changes in who controls the corridor's terms, and the fitter cannot see them. The same is true of
`mediterranean_route` 1904.29 and of `trans_caspian`'s second `built` row.

**Why it is not in the turn.** It redefines the outcome of two templates across the whole model and every era, in the
same turn that added five chokepoint records and eleven corridor histories. The two changes would be inseparable in
the backtest. It needs its own package with the record additions already in the baseline.

**Test that decides it.** `corridorTransitionYears(suez, 1869, 1945)` must include 1875, 1888 and 1904; the pre-1946
chokepoint base rate must be re-reported; and pooled `chokepoint_status` / `corridor_status` skill and AUC must be
compared against the baseline this turn leaves, on the same records.

## era-1870-1914-r2 / corridors-6 — dated `load_bearing_for`

**What it would add.** `load_bearing_for` inside a dated history row, with the top-level dict kept as the 2026
snapshot, and `corridorIndex`/`corridorStake` reading the value in force at the year.

**Why.** The field is one undated 2026 snapshot applied to every historical year: Suez's dependants are
`{EGY, ITA, DEU, NLD, CHN, IND, SAU}` with no GBR, in a model whose own Suez record contains the 1882 British
occupation. And 17 of the 25 records live before 1915 list only their own transit states, so `corridorStake` is
structurally 0 for every pair-year on them regardless of the alliance graph — which is a second reason the corridor
dampener measured as nothing, beyond the alliance gate the rejection note blames.

**Why it is not in the turn.** `load_bearing_for` is read by exactly one thing, `src/engine/core.js:corridorStake`,
which feeds only the `corridor_stake` candidate — currently rejected on both dyadic templates. Backfilling the field
changes no fitted number until that candidate is re-proposed, so the two belong in one package.

**Test that decides it.** The share of pre-1915 records whose `load_bearing_for` names a non-transit state must rise
from 8/25 to ≥ 18/25; then `corridor_stake` must be re-measured on `mid_force` at split 1946 with the share of
pre-1914 dyad-years on which it is non-zero printed, against the near-constant zero it is today.

## era-1914-1945-r2 / statistics-1 — a system-war-share covariate on the dyadic templates

**What it would add.** A panel-year scalar `sys_war_share` = (live actors with `at_war` = 1) / (live actors), entered
lagged one year on `mid_war` (and tested as a candidate on `mid_force`), built once in `scripts/build-panel.mjs` and
mirrored in `src/engine/core.js` from the simulated world's own `at_war` so the fit and the draw are one construction.
It is a mean field over the whole system, so it must be computed before any dyad draw in the step and cannot be
updated by the same year's onsets.

**Why.** The adversary built it and ran a static rolling-origin forecast (fit on labels ≤ as-of, score the next 20
years on observed covariates — no engine, so no feedback). `mid_war` exp/obs, base → with the term, holdout AUC in
brackets: as-of 1920 0.66→0.62 [0.813→0.836], 1930 0.29→0.40 [0.764→0.781], 1940 0.59→0.92 [0.776→0.799], 1950
5.33→3.23 [0.887→0.876], 1960 3.31→2.71, 1970 1.96→1.67, 1980 2.39→2.09, 1990 2.07→1.91. Every row moves toward 1.0;
pooled 1910–1940 0.44→0.56 and 1950–1990 3.17→2.38, with AUC better on five of eight rows. The mechanism is visible in
the coefficients: `lag1(at_war_any)` falls from +1.91 to +1.12 on `mid_war` and +1.45 to +0.93 on `mid_force` at as-of
1950 — about 0.8 log-odds moves out of the PAIRWISE branching term, which multiplies per belligerent's other dyads and
is what makes the process supercritical, into a bounded system-level scalar. `pre_1946` shrinks with it, confirming the
era dummy was partly proxying "this is a world-war year". Unlike `pre_1946` it is identified at every as-of year.

**Why it is escalated and not applied.** It is a new derived panel column with an engine mirror — a new variable and a
new engine reading, which `agent/fixer.md` reserves. This turn applied the era interaction on the same coefficient
(`engine-1`), which takes about 1.2 log-odds out of the post-1946 half by a different route; the two overlap and must
be measured together, not stacked blind.

**Data it needs.** None: `at_war` and `live` are already panel columns. (Its quality is the `data-2` question, and this
turn moved the hand list's coverage of the label set from 55% to 62%.)

**Templates it would feed.** `mid_war` (promote), `mid_force` (candidate, ablate).

**Test.** `node scripts/fit-hazards.mjs mid_war mid_force` — promote only if the ≥1975 ablation holds holdout AUC and
moves holdout exp/obs toward 1, and if the fitted `lag1(at_war_any)` falls by ≥0.5 **on top of** this turn's era
interaction. Then the static rolling-origin check (pooled 1910–1940 exp/obs must rise, 1950–1990 must fall, no per-as-of
AUC falling more than 0.015), then `node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100
--universe all`: pooled `mid_war` exp/obs toward 1 with Brier skill not falling.

## era-1914-1945-r2 / statistics-2 — a static-forecast baseline, and the guard restated as amplification

**What it would add.** `scripts/analysis/static-forecast.mjs`: for each as-of year, fit each template on labels ≤ as-of
and score the next H years on the OBSERVED panel covariates (no simulation, no feedback, no recurrence writes),
emitting predicted/observed per template per as-of. Then every `byAsOf[].templates[]` row in `scripts/backtest.mjs`
carries `exp_obs_static` and `amplification` = exp_obs / exp_obs_static, and the guard on an engine mechanism becomes
`amplification ≤ 1.2 with AUC held` instead of an absolute `exp/obs ≤ 1.5`.

**Why.** The adversary ran the fitted one-year `mid_war` model as a pure static forecast: pooled 1950–1990 exp/obs =
3.17 (228 predicted / 72 observed; per as-of 5.33, 3.31, 1.96, 2.39, 2.07), against the dynamic engine's published
1950–2000 pooled 2.62. The engine reproduces the fit's miscalibration and adds essentially nothing to it — on the
post-war window it over-predicts *less* than the coefficients it draws from. The pre-1946 half agrees the same way
(static 1910–1940 0.44 against the engine's 0.40). Both `war_end` (2.62 → 3.57) and `coalition_join` (→ 28.00) were
rejected on that absolute number alone, and its floor — what a perfectly faithful engine would score — is already ~3.
Under the amplification form `war_end`'s 1950–2000 number is 3.57/3.17 = 1.13, not 3.57, while `coalition_join`'s is
28.00/3.17 = 8.8 and the guard still rejects it.

**Why it is escalated.** It redefines the promotion contract that `era-1914-1945/engine-5` and `engine-1` were decided
under, and it is new scoring infrastructure rather than a fix to existing scoring. It should be built and its own
numbers checked before any mechanism is re-taken under it. Note the denominators are not identical (the backtest scores
modeled actors inside `COVERAGE`, the static test every politically relevant dyad-year), so the claim is about ratios
and directions.

**Test.** `node scripts/analysis/static-forecast.mjs --from 1910 --to 1990 --step 10 --horizon 20` must reproduce
`mid_war` pooled exp/obs 3.17 for 1950–1990 and 0.44 for 1910–1940 (±0.05) on the pre-turn tree. Then re-score the two
rejected mechanisms under the amplification form: `WAR_DURATION_ON=1`'s 1950–2000 amplification below 1.2 and
`COALITION_ON=1`'s not.

## era-1914-1945-r2 / statistics-4 — coalition joining as a fitted ally-year hazard

**What it would add.** A `coalition_join` template replacing the constant `coalition.p_join` in `data/templates.yaml`:
unit ally-war-year, sample = every live state holding a defence pact with a belligerent and not itself in the war, one
row per war component per year (not per fired dyad — that is the 3.84-allies-per-dyadic-war-year over-draw the existing
`rejected: coalition_join` record measured). Covariates: `contiguous_to_belligerent` (+2.0), `major_power` (+1.2),
`pact_with_both_sides` (−), `z(war_coalition)`. The sample must be built in a shared module the way
`src/engine/termination.js` is shared, so the fitter and the engine cannot drift.

**Why.** Rebuilding the coalition-calib at-risk set as one row per (war, ally-at-risk) gives 305 rows, 30 joiners,
pooled p = 0.0984 (reproducing `scripts/analysis/coalition-calib.mjs`). A likelihood-ratio test of homogeneity across
the 32 wars with a non-empty at-risk set gives **G = 98.1 on 31 df**, p < 1e-8: one constant p is rejected by its own
calibration sample. The discriminator is already in the repo — `data/contiguity.json`: ally contiguous to a belligerent
22/95 = 0.2316 against 8/210 = 0.0381 not contiguous, a 6.1x rate ratio (+2.03 log-odds); great power 10/39 = 0.2564
against 20/266 = 0.0752. The era effect the rejection blamed is mostly composition: 163 of the 200 post-1946 ally-rows
are non-contiguous and join at 0.0245, while 58 of the 105 pre-1946 rows are contiguous and join at 0.2931. This is not
a re-proposal of the rejected constant — that entry's own closing sentence asks for a rate calibrated per dyadic
war-year and a draw made per war component; this adds the covariates that make such a hazard fire in the right era.

**Data it needs.** None new: `data/history/events.yaml` `sides:`, CoW alliance v3.03, `data/contiguity.json`.

**Test.** `node scripts/analysis/coalition-calib.mjs --verbose` must reproduce 30/305 and the contiguity split.
`node scripts/fit-hazards.mjs coalition_join`: n ≥ 300, events = 30, positive fitted contiguity coefficient, holdout
AUC > 0.65 on a leave-one-war-out or by-component split (not a year split — see `statistics-6`). Then `COALITION_ON=1`
at 1910–1940 and 1950–2000: promote only if `mid_war` `n_structural_miss` at as-of 1930/1940 falls from 68/68 toward
20 with `auc_at_risk` ≥ 0.74, AND the 1950–2000 amplification (`statistics-2`'s form) stays ≤ 1.2.

## era-1914-1945-r2 / corridors-5 — corridor denial as a dyadic and a war-duration covariate

**What it would add.** Three candidates built next to `corridorStake` in `src/engine/core.js` so the fitter and the
engine read one construction: `corridor_denial` on `mid_force`/`mid_war` (max over records active in the year of
`load_bearing_for[a]` where b is a transit or the controller, and symmetrically — asymmetric dependence, the opposite
construction to `corridor_stake` and the opposite predicted sign); `corridor_denial_impaired` (the same restricted to
records impaired that year — coercion realised rather than latent); and `war_corridor_impaired` on `war_end`, prior
−0.5: a war whose object or sustaining line is a chokepoint runs long.

**Why.** `corridorStake` is the only route from the corridor layer into any conflict hazard and its inner loop skips
the two states in the dyad by construction (`if (c === a || c === b) continue`), so "B can shut a corridor A lives on"
is not measurable in this model — while the era's wars are corridor-coercion wars that the corridor file's own source
lines name (`trans_iranian_railway` 1941.65 cites `war record: iran_1941`; `burma_road` 1940.55; `narvik_ore_railway`
1940.27; `bosphorus` 1914.8). The dampener's ablation is worth nothing here (1910–1940 `mid_force` skill 0.1229 off
against 0.1208 on, `mid_war` 0.0920 against 0.0870). `war_corridor_impaired` is the era-asymmetric duration term the
war-spell mechanism needs: it fires almost every year 1914–18 and 1939–45 and rarely in 1950–2000.

**Honesty condition, mandatory.** `scripts/backtest.mjs` sets `COVERAGE` for chokepoint/corridor/record_reopen to
[1869, 1945] because the hand record layer is complete only where this loop has been, and this turn moved the two
status templates' fitting `window` to the same bound for the same reason. A measured 0 after 1945 is data absence, not
peace. So `war_corridor_impaired` must carry `default_outside: { window: [1869, 1945], value: null }` and be fitted on
that subsample; treated as a measured zero it would fit a negative coefficient on the loop's own coverage boundary and
read as "wars got shorter after 1945" — an era dummy wearing a mechanism's name. Falsification stated up front: fill
the post-1945 record layer, refit, and if the coefficient survives at the same magnitude it is a mechanism.

**Test.** `node scripts/fit-hazards.mjs mid_war mid_force --split 1975` and `war_end --split 1975`, with and without
each term. Then ablation backtests on both windows: `mid_war` predicted/observed must move up from 0.34 on 1910–1940
while the 1950–2000 ratio does not rise, and with `WAR_DURATION_ON=1` the 1950–2000 guard must pass. Print the term's
per-decade mean over the war-spell sample so the era asymmetry is a number in the record.

## era-1914-1945-r2 / engine-2 — a two-component growth shock instead of a uniform one

**What it would add.** Replace `src/engine/core.js`'s `shock = (rng() - 0.5) * 0.04` with (a) a world-year common shock
drawn with the panel's own year-mean sd computed at as-of (the way `warRunLengths(panel, asOf)` already computes a
distribution at as-of), applied to every actor in the step, and (b) an idiosyncratic shock resampled from the panel's
within-year residual distribution — resampling, not a Gaussian, because the tail is the point. `warShock` set from the
measured at-war growth differential rather than the typed −0.04, with the at-war variance inflation modelled.

**Why.** The engine's macro process cannot produce an economic crisis. Measured against the panel over the same horizon
(10 runs, all states, refit per as-of): as-of 1930, 11,710 simulated actor-years, sd 0.0154, **0.0% below −5%**, minimum
−0.045, against observed sd 0.0891, 15.3% below −5%, 7.1% below −10%, minimum −0.423. Variance decomposition of the
panel 1900–1960: common (year-mean) sd 0.0258, idiosyncratic 0.0672; the engine has neither component. `z(gdp_growth)`
is standardised on the panel's sd, so in simulation the covariate never leaves ±0.18 sd and its coefficients on
`autocratic_closure`, `democratize_step`, `intrastate_onset`, `irregular_exit` and `coup_attempt` are inert — which is
why `autocratic_closure` scores exp/obs 0.33 and 0.28 at as-of 1930 and 1940 on 17 and 18 observed closures. The typed
constants also fail their own data: the observed at-war growth differential is −0.0250 (n=367) against the typed −0.04,
and at-war years carry sd 0.1056 against 0.0634 in peace.

**Why it is escalated.** A new engine dynamic (a common shock is a new world-level state), and it feeds five templates
at once.

**Test.** Simulated `gdp_growth` from as-of 1930 reaching sd ≥ 0.06 and share below −5% within 5 points of 15.3%, mean
unchanged within 0.003; `autocratic_closure` exp/obs at as-of 1930/1940 rising from 0.33/0.28 with `auc_at_risk` not
below 0.51/0.70; guard on 1950–2000 that `autocratic_closure`, `democratize_step` and `coup_attempt` do not move above
1.5 exp/obs or lose skill.

## era-1914-1945-r2 / engine-3 — demote `contest_settle` to a candidate, or give it covariates that discriminate

**What it would add.** Either (a) `status: candidate` behind an env switch the way `war_duration` and `coalition` ship,
restoring the engine's pre-package behaviour for territories; or (b) covariates that can discriminate — the capability
ratio between controller and claimant (`termLook` already exposes `cinc`), whether the pair is at war or allied, a
great-power-guarantee term from `data/presence.yaml` through `src/engine/presence.js`, and an era interaction on
`contest_reversible`, whose sign flips across eras (pre-1914 lOR ≈ −1.93, 1914–45 +0.73, post-1946 +2.15).

**Why.** `contest_settle` is one of the three terminations shipped ON and its holdout is anti-predictive: 0.356 before
this turn and **0.449** after it, on a sample this turn grew from 34 to 43 events by adding five missing settlement
rows and five records with dated endings. Its at-risk ranking is inverted in this turn's own rows: `auc_at_risk` 0.25 /
0.21 / 0.76 / 0.40 at as-of 1910 / 1920 / 1930 / 1940. The sample fix was the falsifiable half of `data-5`'s and
`corridors-8`'s claim that the inversion was a homogeneous-at-risk-set artefact; it moved as-of 1930 from 0.21 to 0.76
and left 1910 and 1920 below 0.3, so the claim is half falsified and the residual is the covariate block.

**Why it is escalated.** (a) changes a shipped engine mechanism's status and the territory layer's simulated behaviour;
(b) is three new covariate constructions in `src/engine/termination.js`. Both are more than a data or template edit,
and the corrected numbers now stand in `docs/system.md` so nothing is dressed up while it waits.

**Test.** `node scripts/fit-hazards.mjs contest_settle --split 1946` — holdout AUC must clear 0.60 before the template
is allowed to stay `fitted`. Then `node scripts/backtest.mjs --from 1900 --to 1950`: `auc_at_risk` above 0.5 at as-of
1910, 1920 and 1930. If (a) is taken, the row must report `n: 0` with a candidate reason exactly as `war_end` does, and
`ENGINE_ABLATE=contest_settle` must reproduce the new baseline byte-for-byte.

## era-1914-1945-r2 / engine-6 — a controller-transfer branch in the corridor draw

**What it would add.** A control-change branch alongside `drawCorridorStatus`: when a record transition fires, draw
whether it is a status change, a control change, or both from the record layer's own observed mix computed **at as-of**
(42 / 9 / 19 over 1911–1960 is the empirical prior and must not be typed), and where control changes, draw the new
controller from the record's dated transits plus the current controller's war partners in the simulated year.

**Why.** `src/engine/core.js` carries the as-of controller forward untouched for the whole horizon and says so. Of the
83 transitions dated 1911–1960 in `data/corridors.yaml`, 9 are controller-only — at probability exactly zero for the
engine — and on the 19 that are both, the engine can fire the status half while the controller stays wrong from that
year on. Since `corridorFeatures` counts the controller as a transit and `corridorStake` / `guarantorLevel` /
`guarantorFall` are keyed on who holds the record, a missed transfer poisons every later covariate on that record. This
era is exactly the one where corridors change hands: the Ottoman straits, the Baghdad railway, Kiel, the Chinese
Eastern Railway, and — added this turn — Baku–Batumi's four control changes in 1918–20 and the Danube–Ploiesti route's
four between 1918 and 1944.

**Test.** Corridor `auc` clearing 0.55 at as-of 1920/1930/1940 with exp/obs inside 0.7–1.4, and a direct falsifier: in
an ensemble from as-of 1910 at least one run must move a record's controller (today the count is exactly zero across
every run and every record). Note the guard cannot reach past 1945 until the post-war record layer lands.

## era-1914-1945-r2 / engine-7 — occupation as an engine state

**What it would add.** When `war_end` fires on a pair, draw an occupation outcome for the loser from the record's own
rate (occupations per dyadic war ending, computed at as-of from `data/history/events.yaml` — no typed number),
conditioned on the capability ratio at the spell's end, contiguity, and whether the winner is a great power. A drawn
occupation sets `occupied_until` on the loser for a length drawn from the observed span distribution; during it the
actor's domestic templates and its dyad block are skipped the way the panel now marks them, and any regime step is
emitted with `cause: occupation` so the engine's event stream and the fitter's `event_filter` finally agree.

**Why.** Occupation is data with no engine representation. 51 of 1,347 live actor-years in the 1931–1950 horizon (3.8%)
and 54 of 1,567 in 1941–1960 (3.4%) are occupied; the panel nulls or marks them and `scripts/backtest.mjs` filters the
32 `cause: occupation` / `cause: imposed` regime changes out of the truth set, while the engine draws `leader_exit`,
`irregular_exit`, `coup_attempt`, `autocratic_closure`, `democratize_step`, `intrastate_onset` and the full dyad block
on every one of them at sovereign rates. It is a one-sided miscount landing on the era's largest actors. The other half
is that occupation is unreachable: `applyActorEvent` has rewrites for eleven onset kinds and none removes an actor's
sovereignty, so no run from as-of 1930 or 1940 can produce the 1938–45 wave of state deaths and imposed regimes at all.
This turn added the panel's `occupied` column and the fit-side censoring (`sample: { exclude_flag: occupied }`), which
is the data half; the engine half is this.

**Test.** Simulated occupied actor-years from as-of 1930 within a factor of 2 of the observed 51 over 1931–1950 (today
exactly 0); `autocratic_closure` / `democratize_step` `predicted` falling by roughly the excluded share without
`auc_at_risk` dropping; guard that pooled `leader_exit`, `coup_attempt` and `irregular_exit` exp/obs on 1950–2000 move
by less than 0.05; `ENGINE_ABLATE=occupation` reproduces the pre-package baseline exactly.

## era-1945-1991-r2 / data-7, statistics-8, engine-6 — Archigos 4.1 as the pre-1950 leader source

**What it would add.** A second leader dataset — Archigos 4.1 (Goemans, Gleditsch & Chiozza 2009: leader identity,
dated entry and exit, birth date, and an `entry` / `exit` type coded *regular* / *irregular* / *foreign imposition*,
covering 1875–2015) — ingested in `scripts/fetch-raw.sh` and `scripts/build-panel.mjs`, spliced under REIGN over the
1950–2015 overlap the way `scripts/lib/capability.mjs` splices the modern composite under CoW NMC, with a printed
agreement rate on the overlap rather than an assumed one. It would carry `leader_age`, `leader_tenure` and
`leader_exit` back to 1875, and it would supply `leader_irregular_entry` from a coded field instead of the derivation
this turn built out of REIGN's log-months-since-the-last-irregular-change column.

**Why.** `panel.meta.introduced.leader_tenure` is 1950, so `leader_exit`, `irregular_exit` and `coup_attempt` declare
`window: [1950, 2021]` and have **no fit at all** at as-of 1870, 1880, 1890, 1900, 1910, 1920, 1930, 1940 **and 1950** —
nine of the fifteen as-of rows in the published backtest, including the first as-of year of the 1945–1991 turn itself,
where 132 of the era's irregular exits are inside the horizon. `pooled.leader_exit.n_as_of_rows` is 3 in the turn
window and 6 over the full run. The knock-on reaches templates outside the leader family: `leader_exit_recent` on
`democratize_step` and `autocratic_closure` carries a declared `default_outside` imputed 0 for every actor-year before
1946, which is why `win5(leader_exit_recent)` shows up in the `degenerate` list of the as-of 1870 `democratize_step`
row. Archigos is already cited in both templates' own `sources:` and is not fetched.

**Data.** Archigos 4.1, `Archigos_4.1_stata14.dta` / the CSV release (Rochester / Kristian Gleditsch,
http://ksgleditsch.com/archigos.html); `peacesciencer` ships it as `archigos`. Nothing else is needed — the CoW/GW
crosswalk it keys on is already in `scripts/lib/hist.mjs`.

**Templates it would feed.** `leader_exit` and `irregular_exit` (window → [1875, 2021], and `COVERAGE.leader_exit` in
`scripts/backtest.mjs` with it); `coup_attempt` stays at 1950 because Powell–Thyne has no earlier coverage, so
`COVERAGE.leader_exit` and `COVERAGE.coup` must become separate windows with separate values; `democratize_step` and
`autocratic_closure` lose the `default_outside` imputation on `leader_exit_recent` for the years Archigos covers.

**Test.** After the ingest, `data/events.json` carries `leader_exit` events at or before 1880 and the build prints the
1950–2015 overlap agreement rate — exits matched by actor-year, and irregular-flag agreement — with a rate below 0.85
a merge to reject rather than to ship. `byAsOf[1950].templates.leader_exit.n` and `.irregular_exit.n` are non-zero with
`fit_split: 1950` and `leaky: false`; `pooled.leader_exit.n_as_of_rows` rises from 6. Guard: the as-of 1960–1980
`leader_exit` rows must not lose more than 0.03 of `auc_at_risk` (0.76 / 0.85 / 0.77 after this turn), and
`win5(leader_exit_recent)` must leave the as-of 1870 `democratize_step` `degenerate` list.

**Why it is escalated and not applied.** It is a new dataset and a new derivation in `build-panel.mjs`, which
`agent/fixer.md` reserves. It is also correctly ranked behind the three findings this turn did apply: those buy skill
on rows that already exist, this buys new rows.

## era-1945-1991-r2 / engine-8 — great-power entry and exit as a modelled hazard

**What it would add.** A hazard on a pole's capability share: a great power's collapse is an event, not a growth path,
and the engine has no way to produce one. Concretely, a fitted or declared shock process on `cinc` / `pol_mass` for
actors above the pole threshold, drawn per simulated year, with the resulting share re-classified by
`src/engine/polarity.js` the way it already is — plus the `great_power` flag becoming simulated state rather than a
value frozen at as-of.

**Why.** `docs/system.md` says the derived layer exists so that "a run can change polarity — the typed flags could
not". Measured (`scripts/analysis/polarity.mjs`, which now prints this line): the simulated polarity-transition rate is
**0.00 per 100 world-years** against an observed 2.38 over the panel's own 210 years. `world.pol.state.n_poles` is 2 in
197 of 200 simulated world-years from as-of 1980 and never 1, while the panel's own derived column — the same module
run over observed capability — drops to unipolar from 1995. `great_game` carries +0.60 on `coup_attempt` and +0.57 on
`irregular_exit`, so every horizon that crosses 1995 applies a superpower-client term the derived layer itself says had
ended, for five to fifteen simulated years. The layer does real work in the fit and none in the simulation.

**Data.** None new: `cinc`, `milex` and `pol_mass` are already in the panel, and the observed transition record is the
panel's own derived polarity columns. What is missing is a process, which is why this is an escalation and not a fix.
A rate can be estimated off the observed record (two clean transitions in 1870–2025 by the module's own labelling) or
off great-power exits in `data/history/actors.yaml`.

**Templates it would feed.** `great_game` on `coup_attempt` and `irregular_exit`; `aid_conditionality` and
`hegemon_regime` on `democratize_step` and `autocratic_closure`; every era flag in `src/engine/polarity.js:eraFlags`.

**Test.** `scripts/analysis/polarity.mjs` reports a simulated transition rate inside a factor of 2 of the observed
2.38 per 100 world-years. Guard: pooled `coup_attempt` exp/obs at as-of 1980 and 1990 must not degrade, and pooled
`democratize_step` skill must not fall. Until then the honest alternative — taken in this turn — is to say out loud
that polarity is frozen at as-of alongside the great-power flag, the alliance graph, the border graph and
`world.nukes`, which `docs/system.md` and that script now do.

## era-1945-1991-r2 / corridors-1 (residue) — a dated `retired:` on a corridor record

**What it would add.** A dated end-of-life field on `data/corridors.yaml` records, honoured by `corridorFirstYear` /
the record at-risk set the way `spans` is honoured for actors: a record that stops being a corridor leaves the
denominator instead of being scored as a live at-risk record-year forever.

**Why.** This turn landed the 1946–1991 corridor entries and then measured whether they were enough to reopen
`COVERAGE.corridor`. On chokepoints they were (4.73% over 825 post-1945 record-years against 5.19% over the 1,080
coded ones) and that window moved to 1991. On corridors they were not: 1.63% against 4.32%, a factor of 2.6. The
diagnosis is not missing history rows — 29 of the 46 corridor records have no post-1945 transition and roughly a dozen
of those *correctly* have none, because they stopped being corridors decades ago: the submarine telegraph records
superseded by radio and then by cable-laying of a different kind (`eastern_telegraph`, `all_red_pacific`,
`german_atlantic_cables`, `spanish_colonial_cables`), the Hejaz railway abandoned in 1917 and never rebuilt south of
Ma'an, `madeira_mamore` closed in 1972, `cape_to_cairo` never built. `abandoned` exists as a *status* and takes a
record out of the reopen risk set, but it does not take it out of `corridor_status`'s denominator, so eighty years of
guaranteed non-events per record sit under the base rate.

**Data.** None new: the dates are in the records' own sources.

**Templates it would feed.** `corridor_status` and `record_reopen` — and it is the precondition for their `window` and
their `COVERAGE` entry moving past 1945.

**Test.** With the field honoured, the 1946–1991 corridor label rate must come inside a factor of 1.5 of the coded
window's 4.32% before either window moves. Guard: the 1869–1945 rate must not move by more than 0.2 points (a record
retired in 1972 changes nothing before 1946), and pooled 1870–2010 `corridor_status` skill must not fall.

## era-1991-2026-r2 / data-4 — a regime source for the 22 live states V-Dem does not cover

**What it would add.** A second regime series folded under the existing `regime` column with a `regime_source` column
beside it, so "V-Dem" and "filled" stay distinguishable in every fit.

**Why.** 22 states are live in 2024 and have **zero regime observations in the whole 210-year panel**: BHS DMA GRD LCA
VCT ATG KNA BLZ MCO LIE AND SMR KOSOVO BRN KIR TUV TON NRU MHL PLW FSM WSM. V-Dem's Regimes of the World series does
not reach them. `regime` is a covariate on `leader_exit`, `irregular_exit`, `coup_attempt`, `democratize_step`,
`autocratic_closure`, `intrastate_onset` and `intrastate_end`, so 11% of live states are excluded from all seven,
forever — `leader_exit`'s `excluded_vars.regime` is 21 at as-of 2000 with 18 of 173 observed events inside the
exclusion, and `coup_attempt`'s at-risk set falls 165 (1980) → 140 (2010) as more of them enter the system.

The same hole decides a published era flag. `dem_share` is computed over live actors **that have a regime score**, so
2024 is 85/173 = 0.4913 and `POLARITY.dem_share = 0.5` switches `anticoup_norm` off. Counting the ~18 of the 22 that
are plainly electoral or liberal democracies gives about 103/195 = 0.528 and the flag does not switch off; the same
correction removes the 1999/2000/2001 on/off/on flicker. This turn made the denominator visible (`dem_share_n` and
`dem_share_live` are written into `panel.meta.polarity` every year and `sources.dem_share` says which denominator it
is) but could not fix the numerator without a source.

**Data.** Bjørnskov–Rode *Regime Characteristics* (1950–2020, 192 states, covers every one of the 22) or
Boix–Miller–Rosato *Democracy and Dictatorship* (1800–2020). Both are single downloadable tables. The crosswalk onto
the RoW 0–3 scale is the work: BR ships a democracy/autocracy dichotomy plus a regime-type classification, so
`liberal_democracy` vs `electoral_democracy` cannot be recovered from it and the fill would have to enter at the
`>= 2` cut the templates actually use, with `regime_source` saying so.

**Templates it would feed.** All seven above, and `dem_share` / `anticoup_norm` through the derived polarity block.

**Test.** Zero live actors in 2000–2024 have a null `regime`. `dem_share` 2024 ≥ 0.53 and `anticoup_norm` is 1 for
every year 2001–2024 with no flicker at 1999–2001. `leader_exit` `n_excluded_with_event` at as-of 2000 falls from 18
toward 0 and `n_at_risk` rises from 173 toward 195; `coup_attempt` `n_at_risk` at as-of 2010 rises from 140. Report
the `auc_at_risk` movement honestly — adding 21 low-hazard democracies should cost discrimination and buy coverage.

## era-1991-2026-r2 / statistics-3 — a UCDP-derived dyadic conflict kind for 2011–2024

**What it would add.** A new dyadic event kind (`mid_war_ucdp`, or a second scored template on the existing fit) built
from `UcdpPrioConflict_v25_1.csv` `type_of_conflict == 2`, expanding side_a/side_a_2nd × side_b/side_b_2nd into pairs
through the existing GW map, with `intensity_level` carried so a ≥1000-death threshold is separable from the ≥25 one.
A new event kind is a new template kind, which is why this is escalated rather than done.

**Why.** This turn moved `mid_force` / `mid_war` / `war_end` from [1816, 2001] to [1816, 2010] by splicing GML MID
2.2.1 on (era-1991-2026-r2/data-1), which is what the dyadic layer needed for the era it was scored blind in. GML
itself stops in 2010. There is no MID-family source past it, so 2011–2024 is still unscorable: an as-of-2010 row now
gets 1 scored year of its 20, and an as-of 2020 row would get none. UCDP is the only open dyadic interstate source
that reaches 2024 — 147 type-2 conflict-years 1946–2024, 30 of them post-2001, carrying RUS–UKR 2022–24, IND–PAK
2002–03 and 2013–20, IRN–ISR 2018–24, KGZ–TJK 2021–22, SSD–SDN 2012, CHN–IND 2020, KHM–THA 2011, ERI–ETH 2016,
DJI–ERI 2008, AFG–PAK 2024 and the two coalition cases.

**Data.** Already on disk: `data/raw/hist/UcdpPrioConflict_v25_1.csv`, already parsed by `scripts/build-events.mjs`
for its intrastate half and its `interstate_onset` dyads.

**Templates it would feed.** A new dyadic template with its own `COVERAGE` window, NOT a silent splice onto
`mid_force`: the definitions differ (MID hostility ≥ 4 vs UCDP 25 battle deaths) and UCDP is an order of magnitude
thinner — 33 dyad-years over 2002–2024 against MID's ~6/yr of onsets over 2002–2010. Keeping them separate is what
lets the CoW-fitted coefficients be scored against UCDP labels without mixing the label definitions.

**Test.** `scored_years: 20` for the new dyadic template at as-of 2000 and a non-zero n at as-of 2010 and 2020, and
≥ 30 post-2001 dyad-years of the new kind covering at least RUS–UKR, IND–PAK, IRN–ISR and CHN–IND. Guard:
`mid_force`'s pooled skill must not be recomputed over a mixed-definition label set.

## era-1991-2026-r2 / engine-2 — the era terms need a forward distribution, not a frozen one

**What it would add.** Either (a) a non-degenerate forward distribution over polarity — the great-power entry/exit
hazard already escalated as era-1945-1991-r2/engine-8 is the principled version — or (b) replacing the hard
`promotion_era` indicator with the continuous quantity the gap rule already computes (`hegemon_share` / `gap1`, or a
logistic of `gap1` around `POLARITY.gap`), so 149 actors' covariate cannot flip in one step.

**Why.** `conditionality()` returns 0 whenever `promotion_era` is 0, and `promotion_era` requires unipolarity with a
democratic hegemon. `stepPolarity` moves capability shares only by simulated growth, so the ranked share order is
effectively frozen and the mechanism is ONE-WAY: measured over 15 runs × 20y, universe all, as-of 1990 (bipolar) and
as-of 2025 (bipolar) both give **0.0 actors with a non-zero `aid_conditionality` at every horizon year**, while as-of
2010 (unipolar) starts with 149 and collapses to 0 for all of them at once around +10y. `aid_conditionality` is the
largest promoted coefficient on `democratize_step`, and `democratize_step` is the worst-calibrated actor-year
template in the era. This turn fixed the term's *sample* (a non-recipient is a structural zero, not a null —
statistics-4) but not its *dynamics*.

**Data.** None new.

**Templates it would feed.** `democratize_step`, `democratic_deepening`, `autocratic_closure` through
`aid_conditionality`; `coup_attempt` and `irregular_exit` through `great_game`; every template through `cold_war`.

**Test.** `scripts/analysis/polarity.mjs` at as-of 1990 and 2025 must report a non-zero simulated unipolar-entry rate
per 100 world-years, against 0.00 today. Then `node scripts/backtest.mjs --from 1980 --to 1990 --runs 100 --universe
all`: `democratize_step` `count_ratio` at as-of 1980/1990 moves up from 0.53/0.51 toward 1 without pushing as-of 2000
and 2010 past ~1.3.

## era-1991-2026-r2 / data-8 (b) — the panel's year axis should reach the snapshot's own year

**What it would add.** `Y1 = 2026` in `scripts/build-panel.mjs` (and the horizon arithmetic that follows it), so the
modern actor snapshot lands on the year `data/actors.yaml` says it describes.

**Why.** `SNAP = Y1 = 2025` while the file's header says "Snapshot date: 2026-09-06" and it carries fields that are
2026 judgements (`leader_since: 2026`). 44 actors × 19 `cap_*` columns plus `nuclear_status`, `nuclear_warheads`,
`personalism`, `succession`, `regime_type` and the chokepoint exposures therefore sit one year ahead of the panel's
last measured year. This turn declared the lookahead in every one of those columns' source lines and added a build
guard that refuses any template covariate over a single-year column, so nothing can read them by accident — but the
year is still wrong.

**Data.** None new.

**Templates it would feed.** None directly; it moves every horizon by one year, which is why it is a package and not
a fix.

**Test.** The snapshot columns land on the year `data/actors.yaml` describes; `data/fits.json` and the 1870–2010
backtest change only by the one extra year of panel.

## era-1991-2026-r2 / statistics-7 (3) — restore CINC's military-personnel component

**What it would add.** A fifth-plus-one indicator for the modern capability composite: military personnel, the one
CINC component `MISSING_COMPONENTS` declares has no open successor.

**Why.** Without it the composite systematically moves conscript-heavy poor states down and small rich states up, and
the per-actor splice factor absorbs the whole indicator as a fabricated constant. Measured at 2022 over the 191
actors both series score: Spearman is 0.978 but PRK is CINC rank 12 and composite rank 55 (factor 5.07), ERI 46
against 145 (factor 9.75), while IRL rises 122 → 78 and CHE 85 → 59. This turn stopped the damage — `validate()` now
reports the Spearman and the largest top-20 rank displacement beside the Pearson, and an actor whose |log factor|
exceeds ln 2 is no longer extended from the composite but carried at its last CINC with `cinc_carried` recording the
staleness (28 actors) — but carrying a stale value is a refusal to guess, not a measurement.

**Data.** World Bank `MS.MIL.TOTL.P1` (armed forces personnel, total), which `MISSING_COMPONENTS` records as
unreachable when the composite was built; it is reachable from the same `scripts/fetch-wb.mjs` route as the other
fourteen indicators. Failing that, NMC 7.0's own `milper` share held at its 2022 value and renormalised.

**Templates it would feed.** `cap_ratio` on `mid_force` and `mid_war`; the projection-weighted shares in
`src/engine/polarity.js` that classify polarity and set `great_game` / `cold_war` for every downstream template.

**Test.** With the component restored, no actor's |log splice factor| exceeds ln 2 and `cinc_carried` is 0 for every
live actor in 2023–24; the composite's rank for PRK at 2022 is within 10 places of NMC's 12. `panel.meta.polarity`
must be unchanged for 1816–2022 and the 1870–2010 backtest byte-identical.
