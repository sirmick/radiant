# Plan — one state contract, then unfreeze the structure

Status: proposed 2026-10-23. Two goals that share one mechanism:

1. **The viewer stops distinguishing past from future.** It reads *frames* from a provider; the record and the engine
   are two providers of the same schema.
2. **The world's structure becomes simulated state.** Capability shares, great-power status, polarity, alliances,
   nuclear status and state membership move inside a run instead of being frozen at as-of
   (`docs/system.md` → *Derived world state*; escalations `era-1945-1991-r2 / engine-8`, `era-1991-2026-r2 / engine-2`).

Phase A (contract + replay) lands first so every structural variable in phase C appears in the viewer, past and
future, with no UI work.

Decision recorded: event-score regressions are **accepted** where structural calibration improves (operator,
2026-10-23). The gate changes accordingly — see *Gate*.

---

## Phase A — the frame contract and engine replay

### A1. The contract (`src/contract/`)

One schema for any (source, year). Entities: `actor`, `dyad` (`A|B`, sorted), `record` (corridor / chokepoint /
territory), `world`. Each entity-variable-year carries one **value object**:

| field | meaning |
|---|---|
| `kind` | `categorical` · `binary` · `continuous` · `count` |
| `dist` | categorical/binary: probability vector over `meta.vars[v].levels`; continuous: `[p10, p50, p90]` |
| `n` | runs behind it (1 for the record) |
| `prov` | `observed` · `carried` (with `stale` years) · `simulated` · `imputed` · `frozen` (engine holds it at as-of) |

Plus per year: `events[]` (`{t, u, run?}` — template/kind, unit) and, for ensembles, `paths` (N whole runs, the
existing packed format generalised to every tracked variable).

Variables are declared once in a registry (`src/contract/vars.js`): id, kind, levels, label, unit, format, which
providers can supply it. The viewer's variable picker, legend and hover card read the registry, not the files.

**The record is an ensemble of one.** `n = 1`, every `dist` a point mass, `paths` = the one actual path, `events` =
the event log. Consensus / sample / odds then reduce to the fact (odds = 0/1) without a branch.

### A2. Engine replay (`src/engine/replay.js`)

`replayWorld({asOf: 1816, to: 2025, ...})` steps the same engine but, instead of drawing each hazard, **applies the
recorded events** for that year (leader exits, coups, regime steps, MID onsets/ends, intrastate on/off, record status
changes, births/retirements, pact entry/exit, nuclear acquisition) and overwrites continuous state from the panel
where observed. The same state tracker that writes forecast occupancy writes the replay.

Why replay instead of a separate history builder:
- one exporter → the two schemas cannot drift;
- **replay is a test**: after each year, engine state vs panel row must agree (regime level, at_war, intrastate,
  great_power, pact set, live set). Every disagreement is an engine transition bug or a data inconsistency, listed by
  `scripts/analysis/replay-diff.mjs`, and CI fails on new ones;
- every structural variable added in phase C gets its historical series as a by-product.

### A3. Exporter (`scripts/export-frames.mjs`)

Writes `public/frames/<source>/<family>.json`, chunked by variable family (politics, conflict, capability, structure,
records, events) and loaded lazily. Sources: `record`, `fc-2025`, `fc-1900` … `fc-2005`. `run-forward.mjs` and the
replay both call it; `build-history-slice.mjs`, `build-news.mjs`, `build-alliance-slice.mjs`,
`build-presence-slice.mjs` and the `state` block of `forecast*.json` are replaced by it.

Acceptance: the viewer driven by the new files paints every view at 1870, 1942, 1989, 2025, 2040 identically to today
(`scripts/shot2.mjs` before/after, pixel diff below a threshold, differences listed and explained). Load size no
larger than today's ~8 MB on first paint.

### A4. Fork-and-score backtest

A backtest is two providers forked from one state: replay to `asOf`, then one branch keeps replaying the record and
the other forecasts N runs with coefficients refit on labels ≤ `asOf` (`--refit`, as today). One generic scorer
compares the two frame sets over every variable in the registry, per lead year and pooled over origins
(1870…2010, step 10):

| kind | score |
|---|---|
| categorical / binary | Brier, log score, base-rate skill |
| continuous | CRPS, p10–p90 coverage |
| events | first occurrence within H (today's event score) |
| structure | simulated vs observed rates (see *Gate*) |

The forecaster's start state **is** the replay state at `asOf` — `createWorld(asOf)` built from the panel becomes a
check on it, not a second construction. Scored only inside each source's truth window (`COVERAGE`). Known leaks it does
not remove: structure still frozen until phase C (state existence above all), and data vintage (the panel is today's
revision of the past). `scripts/backtest.mjs`'s bespoke per-template scoring is replaced by the scorer once its
numbers reproduce the current `scores/backtest-1870-2010-h20-all.json` pooled rows.

## Phase B — the viewer on providers

`src/lib/provider.js`: `frame(source, year, {family, mode, run})` → `{entityId: value}`. Static-file implementation
first; the interface admits a later in-browser engine (web worker) for live scenarios.

- `seriesAt` loses its history/forecast branches and its per-variable special cases: one generic reducer per `kind`
  × read mode (consensus with hysteresis, sample, odds) over `dist`.
- News reads `events` from any source; forecast news = sampled run's events, or ranked hazards in consensus.
- Actual-vs-forecast = two providers over the same years (`record` and `fc-1955`), not a special column.
- Delete: the history branch in `seriesAt`, `forecastNews`/`sampleNews` split, `alliancesAt` carry-forward,
  `presenceAt` static read, `statusAt` vs `recordStateAt` split.

Acceptance: same screenshots as A3; `src/lib/data.js` shrinks; adding a variable to the registry + engine tracker
makes it paintable with no viewer edit (tested by adding one).

## Phase C — unfreeze the structure

Each step follows the repo's existing rule: template or process in data, fitted, ablatable by `ENGINE_ABLATE`, scored
by the backtest, and published in frames. Order matters — later steps read earlier ones.

| step | what becomes state | process | data | feeds |
|---|---|---|---|---|
| C1 | capability shares (`cinc` components, `pol_share`) | stochastic growth (fitted variance by size/era), war-outcome shocks (loss/gain by result), demographic drift; re-normalised to world share each year | NMC 7.0, Maddison, panel war outcomes | everything dyadic; polarity |
| C2 | `great_power`, poles, era flags | **derived**, not hazarded: GP = logistic on simulated share with entry/exit hysteresis, fitted to the CoW GP list; polarity module unchanged | CoW GP spans in `data/history/actors.yaml` | `major_power_any`, PRD filter, `great_game`, `aid_conditionality`, `cold_war` |
| C3 | alliance graph | dyad hazards: pact formation and termination (ATOP dates). Covariates: shared rival / common threat, regime similarity, GP status, contiguity, neighbour capability growth, existing pacts | ATOP 5.1 (already fetched) | `allied`, coalition joining (unblocks the candidate), `defence_pacts` |
| C4 | `world.nukes` | fit the existing `weaponization` template (≈10 events; literature priors carry it) | nuclear events in `data/history/events.yaml` | `nuclear_both`, war hazards |
| C5 | live set and borders | secession hazard (from intrastate conflict, separatist flag), absorption/union hazard; successor and contiguity edges inherited as `src/engine/core.js` already does for successors | CoW system membership, CShapes | closes the *existence* leak in backtests; decolonisation-era backtests |
| C6 | military presence | base/garrison open-close hazards on patron–host dyads | `data/presence.yaml` | `guarantor_withdrawal`, patron terms |

### Status

- **A1–A4, B — done 2026-10-23.** Contract, replay, fork scorer (reproduces every event row and occupancy row of the
  old backtest), exporter, viewer on `makeView`.
- **C1 + C2 — done 2026-10-23.** Fitted three-part growth process (`src/engine/growth.js`, fit by
  `scripts/analysis/growth.mjs`), CINC moved by output growth (`stepCinc`), great-power entry/exit fitted at as-of
  (`src/engine/greatpower.js`). Gate (`scripts/analysis/structure.mjs`, 1900–1990 step 30, +30y, 20 runs): polarity
  transitions 2.07 → 4.61 per 100 world-years (record 4.31), great-power entry 0 → 1.21 (1.72), exit 0 → 0.65 (3.45 —
  recorded exits are war defeats, and simulated great-power wars are too rare), top-pole change 0.04 → 1.90 (6.90).
  p10–p90 coverage on the 1950–1990 fork backtest: gdp_pc 0.20 → 0.70, cinc 0.00 → 0.67, pol_share 0.12 → 0.52.
  Event scores: 10 of 15 pooled templates improve, 5 fall (intrastate_onset skill 0.15 → 0.11, democratic_deepening
  0.41 → 0.34) — accepted under the gate.

- **C3 + C4 — done 2026-10-23.** Pact formation / dissolution hazards fitted on the dated graph at as-of
  (`src/engine/alliances.js`; covariates incl. shared allies and a degree-saturation brake — without the brake triadic
  closure densified the graph 2.3x), nuclear acquisition fitted at as-of on ten weapon events with literature-centred
  priors (`src/engine/nuclear.js`). Each draws from its own random stream. Gate: pact formations 0.96x, dissolutions
  1.77x, nuclear acquisitions 0.93x of the record; polarity 1.03x, great-power entry 0.70x. Still out: great-power exit
  0.18x and top-pole change 0.28x. Backtest cost: allied-pair occupancy skill 0.63 -> 0.44 (a frozen graph is a strong
  persistence forecast), corridor_status -0.10; mid_war +0.04.
- **C5 — built, a candidate (off; `MEMBERSHIP_HAZARD=1`), 2026-10-23.** Births are drawn over TERRITORIES — every
  map polygon no live state occupies (a colony, a Soviet republic before 1991, Greenland today) — on world and
  neighbourhood birth waves, area and the democratic share; deaths over live states on capability, war, great-power
  status and the democratic share (`src/engine/membership.js`). It removes the existence leak, but fails its gate on
  births (0.35x: the 1960 and 1991 waves are bursts no hazard fitted before them predicts; the fit's own in-sample
  expectation misses them too), deaths 1.31x. Backtest 1950-1990: leader_exit -0.59, democratic_deepening -0.24 of
  skill (the decolonisation cohort is no longer handed to the forecaster). Not promoted by the rule.
- **C5 breakup — built, inside the C5 candidate, 2026-10-23.** `data/holders.json` (`scripts/build-holders.mjs`, from
  CShapes 2.0 via the CRAN `cshapes` copy): for every map territory and year 1886-2019, the state that holds it and
  how (colony / protectorate / mandate / occupied / integral). Births over held territories are drawn in two stages:
  a per-holder breakup hazard (territories held, colonial share, 3-year rise in electoral democracy, at war, a breakup
  of its own in the last 5 years, world births, democratic share, great power), then each held territory given the
  breakup; death reads the breakup and the share that left; a dead state's territories pass to its absorber.
  Unheld territories keep the single-stage hazard. In-sample (`MEMBERSHIP_FIT_YEAR=2019`, a diagnostic leak) the gate
  reproduces the record — births 0.97x, deaths 1.00x — so simulation and fit agree; out of sample births are 0.26x
  (1900: 0.7 vs 21, 1930: 5.9 vs 54, 1960: 22 vs 53, 1990: 10 vs 18): the 1918 and 1945-60 waves had no precedent in
  the training years. Still a candidate. `ENGINE_ABLATE=breakup` = the first C5 build.
- **Bloc contagion — tested, not adopted, 2026-10-23.** `ally_up_recent` (a pact partner stepped up a regime category
  this or last year) on `democratize_step`: raw lift in every era (1.6x in 1946-88) but +0.18 fitted, backtest
  skill -0.174 -> -0.180 on its own template. Evidence in `data/templates.yaml` (rejected); the column stays.
- **Case: 1987 (`scripts/analysis/ussr-1987.mjs`).** From 1987, 200 runs, C5 + breakup on, coefficients refit on
  labels <= 1987: P(>=1 Warsaw Pact member democratises by 1991) 28.5%, P(>=3) 0% [record 6 of 6]; P(USSR
  democratises by 1990) 16.5%; P(>=1 Soviet republic a state by 1992) 4.5%, P(>=10) 0% [record 12]; East Germany
  gone 0.5%. With the membership hazards fitted through 2019 (the upper bound): 10% / 1%. Nothing before 1987 looks
  like 1989-91: no bloc patron had liberalised and taken its clients with it, and the integral states that broke up
  before (Russia 1917-18, Austria-Hungary) lost some of their parts, not all. With the dated membership list
  (C5 off) the breakup is "predicted" at 100% — a leak, which is what C5 removes.
- **Breakup scoring — 2026-10-23 (`scripts/analysis/breakup.mjs`, `scores/breakup-5y*.json`).** For every origin
  1900-2014 and every state holding territories, P(at least one becomes a state within 5 / 10 years), hazards refit on
  labels <= origin, covariates frozen at the origin, scored against climatology. What moved it:
  - the unit is a holder's colonies OR its integral territory, never both (a remnant of islands and a federation of
    nations do not come apart for the same reasons);
  - the world-births wave and the democratic share act on colonies only; the centre's 3-year rise in freedom of
    expression (V-Dem `v2x_freexp_altinf` — glasnost) on integral territory only;
  - territories the generalised map cannot resolve (Hong Kong, Macau, San Marino, the Vatican) have no holder — they
    were making "China" and "Italy" integral holders.
  5-year skill 0.113 -> 0.199, AUC 0.668 -> 0.743; 1980-2014 AUC 0.39 -> 0.63. Watchlist: from 1987 the USSR ranks
  first (18% in 5 y, 33% in 10 y), from 1990 Czechoslovakia 11%, from 2000 Indonesia 61% (East Timor); the leading
  false positives are Sudan (2011) and Serbia (2006), both near misses. Tested and not adopted: prior statehood,
  freedom gap, corruption, growth, held-area share, war defeat (CoW outcomes), ethnic fractionalisation (CREG/HIEF).
  Members are drawn beta-binomial, the within-breakup correlation by zero-truncated ML (rho 0.10 at 1987).
- **Opening / closing — trial templates, 2026-10-23.** `opening` (freedom of expression up >= 0.05 in a year, in an
  autocracy) and `closing` (down >= 0.05), events from `scripts/build-vdem-extra.mjs`; the engine moves `freexp` by the
  mean step on record. Opening is mostly contingency (holdout AUC 0.43 >= 1990) with momentum (+0.49 on a recent
  opening); closing follows openings (+0.37: Czechoslovakia 1969, Poland 1981).
- **Regional waves — 2026-10-23.** Fitted hazards under-state how events cluster in a V-Dem region-year. Gamma frailty
  by moments over region-years (`fit.frailty`): opening theta 2.27, closing 0.79, democratize_step 0.52, leader_exit
  0.07, coups 0. The engine draws one latent N(0,1) shock per region and year, AR(1) with the opening template's latent
  coefficient (0.78), shared by every actor-year template (multiplier exp(sigma u - sigma^2/2), sigma^2 = ln(1+theta)),
  and starts it from the wave visible at as-of (gamma posterior on the region's openings in the last three years).
  `FRAILTY=0` turns it off. From 1987 Eastern Europe starts raised (+0.53); from 2009 the Middle East starts quiet
  (-1.23), which is what a wave model should say before a spark.
- **Case studies.** `scripts/analysis/ussr-1987.mjs`, `scripts/analysis/cluster.mjs` (joint outcomes per run; dispersion
  = run variance over the independent variance). From 1987, C5 + breakup + openings + waves: P(>=1 Soviet republic a
  state by 1992) 15%, by 1997 23%; >=10 by 1997 0.5-1.5%; >=1 Warsaw Pact democratisation by 1991 ~40%, >=3 ~1%. From
  2009 for the Middle East's 17 autocracies, 2011-12: leader exits mean 3.5 (record 4), P(>=4) 48%; >=2 civil-war onsets
  25% (record 2); >=4 openings 2.5% (record 4). Data note: REIGN codes Ben Ali's flight and Gaddafi's death as regular
  exits — `irregular_exit` undercounts uprisings; Archigos (peacesciencer) codes them properly.
- **Leader exits re-coded from Archigos — 2026-10-23 (`scripts/build-archigos.mjs`).** REIGN marks only coup removals
  irregular; Archigos 4.1 codes the manner (Ben Ali and Mubarak: popular protest; Gaddafi: rebels with foreign support).
  1,798 of 2,117 exits matched; 134 become irregular, 31 regular; 35 flagged foreign-supported (`foreign_support`,
  `exit_manner`; the REIGN flag kept as `irregular_reign`). irregular_exit holdout AUC 0.757 -> 0.787.
- **War outcomes — 2026-10-23 (`src/engine/waroutcome.js`, `data/war_outcomes.json`).** P(a belligerent loses) on the log
  ratio of its side's capability (with co-belligerents) to the other's, fitted on CoW wars ended by as-of; the
  capability slope falls from -1.27 (fit to 1900) to -0.38 (to 2010) — the weak side wins more after 1945. A simulated
  war's end draws a loser (own stream), who carries `war_defeat`; great-power exit reads it (+1.3 on 4 recorded exits,
  fit on a defeat in t or t-1, applied the year after in a run). Gate: gp_exit 0.31x -> 0.28x — unchanged, the exits
  before 1946 are too few for the 1900/1930 origins to learn. As a candidate on leader_exit / irregular_exit /
  democratize_step: no holdout gain, not adopted. Backtest with Archigos + outcomes: 11 up, 6 down, mean -0.0372 -> -0.0361.
- **Tested, not adopted — 2026-10-23.** Shared IGO memberships (CoW IGO v3, `data/igo.json`) as a dyadic pacifier:
  log(igo) +0.05 on mid_force, +0.10 on mid_war, -0.07 on interstate_onset (no gain); a hinge above 70 shared IGOs
  (deep integration) cannot be identified by the fitter's pre-1946 ablation split. A great-power ally as protection
  against state death: +0.26 (not protective in the record). External-support data (UCDP ESD) is not reachable.
- **Birth pool** excludes territories with no permanent population (`data/uninhabited.yaml`) or under 10,000 people
  (World Bank, via the `datasets/population` mirror): the first 50-year run made Antarctica a state in 35% of worlds.
- **Trade — promoted 2026-10-23 (`data/trade.json`, `src/engine/trade.js`).** CoW dyadic trade v3.0 (1870-2009, via the
  `dyadr` package's copy) as the weak-link dependence min(s_ij, s_ji), s = the pair's trade over each side's total.
  On mid_force: -0.10 candidate / -0.14 fitted, holdout AUC 0.871 -> 0.873, exp/obs 1.03 -> 0.99; on mid_war -0.22 /
  -0.25, 0.858 -> 0.871. Held at as-of in a run (trade is not simulated). No effect on interstate_onset (candidate).
- **Unions — the EU as an institution, 2026-10-23 (`data/unions.yaml`, `src/engine/unions.js`).** Dated membership
  (1958 founders, every accession, the 2020 exit). In a run membership is state: enlargement ROUNDS (P on years since
  the last round: +0.98, 7 rounds) and joiners given a round (democracy +2.09, bordering a member +0.89, 20 joiners),
  over the candidate pool visible at as-of; exit at a rate each run draws from Gamma(0.5 + 1, 1,023 member-years) —
  one recorded exit, so the forecast carries that uncertainty instead of a point rate. `joint_union` on the dyad
  hazards: identified at a 1990 split (training 1958-89), -0.84 on mid_force and -0.53 on mid_war as candidates;
  fitted on the full sample -2.58 / -0.94. The fitter's candidate ablation took its split from the first candidate
  that declared one (1946), which is why every post-war institution read "unidentified" before.
  Backtest 1870-2010 (100 runs), trade + unions against Archigos + war outcomes: 9 up, 8 down, mean -0.0361 -> -0.0256
  (record_reopen +0.10, chokepoint +0.03, corridor +0.03; mid_force/mid_war exp/obs 0.81 -> 0.68 / 0.71 -> 0.58).
  The 50-year run: a war between two members by 2050 40% -> 13%.
- **C6 — done 2026-10-23.** Station open / close hazards over the dated presence layer (`src/engine/stations.js`), the
  presence index rebuilt as the run moves and read at the simulated year; a dyad `presence` variable carries it into
  the frames, and the viewer draws it after the seam. Gate: openings 0.62x, closures 0.56x of the record (between
  states that exist in both years); presence occupancy exp/obs 1.01, skill 0.55. Backtest 1950-1990: 8 of 15 up, 7
  down; the cost is record_reopen (-0.22 on ~15 events), which reads the guarantor term and was already out of
  calibration (exp/obs 3.65).
- **D2 — promoted 2026-10-23.** λ per template by an inner holdout inside the training years: on 1870-2010 (40 runs)
  11 of 15 pooled templates up, mean skill -0.0286 -> -0.0207. `wave_attain` pinned at λ = 2 (its unit is not in the
  event backtest, and the inner choice doubled its era-holdout Brier). `FIT_LAMBDA=fixed` restores λ = 2.
- **D1 — built, opt-in (`FIT_DECAY=cv`).** Recency-weighted likelihood, half-life by inner holdout (mostly 20 y):
  9 of 15 up, mean -0.0286 -> -0.0265, at-war occupancy skill 0.021 -> 0.004. Not promoted.
- **D5 — done.** `scripts/analysis/benchmark.mjs` (`scores/benchmark-glm-vs-boosted.json`): boosted depth-2 trees on
  the same rows and era split beat the penalised logistic out of sample on no template except `wave_attain` — the
  linear form is not what limits the model; out-of-era, strong priors (λ = 32) generalise best, which is the drift
  D1 addresses.
- **D3 — promoted 2026-10-23.** `scripts/analysis/dependence.mjs`: the panel's events co-occur in a state-year far beyond
  conditional independence (coup + irregular exit 10x, coup + civil-war onset 2.4x), and simulated worlds reproduced
  0.11x / 0.33x of the record's co-occurrence: a successful coup replaced the leader but logged no exit, and its
  followers were drawn independently. Now the coup is drawn first and its followers are coupled with marginal-
  preserving conditionals (q from the record up to as-of; (p - p_t q) / (1 - p_t) without the trigger). Co-occurrence
  0.80x (coup + irregular exit), 0.61x (coup + onset), 0.29x (coup + autocratic step — no liberal-erosion template).
  Backtest 1870-2010 (40 runs): the coupled templates gain (irregular_exit +0.034, leader_exit +0.028,
  intrastate_onset +0.017, autocratic_closure +0.011); the pooled mean dips -0.0243 -> -0.0290 on democratic_deepening
  (-0.09, a template coupling does not touch: random-stream divergence on 17 events, already out of calibration).
  `COUPLING=0` restores independent draws.
- **D4 — tested, not promoted.** `scripts/analysis/duration.mjs`: a hinge on spell age at knots 1-8 years improves no
  termination hazard's era holdout (best: intrastate_end at 5 y, log-loss 0.4293 -> 0.4263, AUC +0.001). The `hinge`
  transform stays in the fitter and the engine for later use.
- **Next data item**: war outcomes (CoW war outcome coding). In war years the weaker side's capability share is far
  more volatile (sd 0.35 vs 0.12 in peace) but the mean shift is unidentifiable without who won — and defeat is what
  produces the great-power exits (0.36x) and top-pole changes (0.24x) the gate still misses.

## Phase D — fitter upgrades (after C, same gate)

1. **Time-varying coefficients**: era-pooled (hierarchical shrinkage of per-era β toward a common β) in place of
   hand-typed era flags where the flag only stands in for drift.
2. **Prior strength per template**: λ estimated (empirical Bayes or rolling-origin CV) instead of λ = 2 everywhere.
3. **Within-year dependence**: a shared per-actor frailty or same-year cross terms (coup ↔ civil war ↔ war).
4. **Duration splines** on spell age for the termination hazards.
5. **Benchmark**: gradient-boosted trees on the same rows, scored only, never simulated — a ceiling that says when
   the GLM is missing structure.

## Gate

Event scores alone reward freezing (less variance, better Brier). Each phase-C step is judged on both:

**Structural calibration** (new, `scripts/analysis/structure.mjs`, also written into `scores/`): simulated vs observed
per 100 world-years, per as-of year and pooled —
polarity transitions (observed 2.38; today 0.00), GP entries/exits, pact formations/terminations, nuclear
acquisitions, state births/deaths, rank correlation of capability share at +10/+20, and the spread of capability share
(the p10–p90 band must cover the realised share at the nominal rate).

**Event scores** (`scripts/backtest.mjs`, unchanged): reported beside it. A step is **promoted** when its structural
targets move inside a factor of 2 of observed and no event template's calibration (exp/obs) leaves 0.5–2. Brier/AUC
regressions are recorded in `docs/refine-log.md` with the numbers and accepted.

## Files

- new: `src/contract/{schema,vars}.js`, `src/engine/replay.js`, `src/lib/provider.js`, `scripts/export-frames.mjs`,
  `scripts/analysis/{replay-diff,structure}.mjs`, one module per phase-C process under `src/engine/`
  (`capability.js`, `alliances.js`, `membership.js`; `polarity.js` extended)
- changed: `src/engine/core.js` (tracker writes the contract; hooks for C1–C6), `scripts/run-forward.mjs`,
  `scripts/backtest.mjs` (structural block), `src/lib/data.js`, `Map.svelte`, `Panel.svelte`, `data/templates.yaml`
- retired: the four `build-*-slice.mjs` / `build-news.mjs` scripts and the old `forecast*.json` layout (kept for one
  release behind a flag for the before/after screenshots)
- docs: `docs/schema.md` (contract), `docs/ui.md` (providers, read modes), `docs/system.md` (structural gate),
  `docs/escalations.md` (close engine-8 and engine-2 when C2 lands)

## Open questions

- C5: the dissolution mechanism and the colonial-ownership layer are now in (breakup, `data/holders.json`); the birth
  gap that remains out of sample is regime shift — each wave is larger than anything before it. What could carry it:
  a world-level state for the post-1945 norm against empire (the democratic share is the only proxy), and for 1991
  a patron-to-client link that only that case identifies.

- Replay of continuous variables: overwrite from the panel every observed year (exact, but hides drift-model error) or
  replay drift and report the residual (diagnostic). Plan: overwrite, and report the residual in `replay-diff`.
- Frame size for 300 runs × 100 years × all dyads: keep the existing dyad floor (peak P) and widen `paths` only for
  the 12 sample runs.
- C1 war-outcome shocks need a result coding (win/lose/draw) per belligerent; CoW MID has `outcome` — verify coverage
  before fitting.
