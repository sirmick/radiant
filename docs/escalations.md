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
