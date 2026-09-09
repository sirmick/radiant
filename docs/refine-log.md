# Refinement log

One section per turn of the adversary → fixer → checker loop (`.claude/workflows/refine.js`, procedures in `agent/`). The file the loop compares against is `scores/backtest-1870-2010-h20-all.json` (as-of 1870…2010 step 10, +20y, 100 runs, all states, rolling-origin refit).

**Baseline 2026-09-08 — after implementing the approved escalation packages** (`operator/occupancy`, package 11; package 12, `operator/capability-waves`, is approved and queued behind it, not in this tree) and after the five refinement turns committed since the 2026-09-07 baseline. Per-template detail, `auc_at_risk`, the occupancy score and the template × as-of rows that carry no fit are in [Baseline 2026-09-08](#baseline-2026-09-08) at the foot of this file. It replaces [Baseline 2026-09-07](#baseline-2026-09-07), which is kept in full there.

| template | exp/obs | Brier skill | AUC |
|---|---|---|---|
| coup_attempt | 0.89 | +0.23 | 0.79 |
| intrastate_onset | 0.98 | +0.23 | 0.79 |
| mid_force | 0.82 | +0.11 | 0.81 |
| intrastate_end | 0.90 | +0.11 | 0.72 |
| contest_settle | 1.08 | +0.11 | 0.80 |
| irregular_exit | 1.29 | +0.05 | 0.76 |
| chokepoint_status | 1.17 | +0.04 | 0.64 |
| corridor_status | 1.39 | +0.04 | 0.66 |
| mid_war | 0.72 | +0.03 | 0.78 |
| interstate_onset | 2.00 | −0.05 | 0.89 |
| autocratic_closure | 0.72 | −0.06 | 0.65 |
| democratic_deepening | 2.05 | −0.19 | 0.78 |
| democratize_step | 0.81 | −0.20 | 0.54 |
| record_reopen | 2.43 | −0.30 | 0.72 |
| leader_exit | 0.99 | −0.34 | 0.74 |

Baseline before implementation, 2026-09-08 — the 2026-09-07 table this one replaces. Every template it lists is pooled over a **different set of as-of years** than the table above (the refinement turns since opened windows, added units and moved coverage: `chokepoint_status` was 36 units pooled over 1910–1940 and is now 210 over 1890–2010), so the two columns are not like-for-like and should not be differenced row by row. The section at the foot says which rows changed for a reason and which changed because the sample did.

| template | exp/obs | Brier skill | AUC |
|---|---|---|---|
| coup_attempt | 0.75 | +0.17 | 0.75 |
| intrastate_onset | 1.05 | +0.12 | 0.75 |
| intrastate_end | 1.00 | +0.12 | 0.74 |
| corridor_status | 1.05 | +0.11 | 0.70 |
| mid_force | 0.77 | +0.09 | 0.77 |
| record_reopen | 1.13 | +0.08 | 0.72 |
| chokepoint_status | 0.95 | +0.07 | 0.70 |
| contest_settle | 0.84 | +0.06 | 0.80 |
| mid_war | 0.80 | −0.01 | 0.77 |
| democratic_deepening | 1.41 | −0.10 | 0.68 |
| autocratic_closure | 0.67 | −0.16 | 0.58 |
| democratize_step | 0.92 | −0.22 | 0.53 |
| irregular_exit | 2.01 | −0.44 | 0.70 |
| leader_exit | 0.85 | −0.82 | 0.74 |

Baseline before implementation, 2026-09-07 — the table the first 2026-09-07 baseline replaced. It was measured on 2026-09-06, before the first turn of the loop: full-sample coefficients on every row (all leaky, the fit saw the years it is scored on), the pre-turn actor universe, and no corridor or chokepoint unit. It records what the numbers used to say; it is **not** a like-for-like comparison with the table above, and the two should not be differenced.

| template | exp/obs | Brier skill | AUC |
|---|---|---|---|
| coup_attempt | 1.03 | +0.28 | 0.83 |
| intrastate_onset | 1.05 | +0.21 | 0.78 |
| mid_force | 0.99 | +0.16 | 0.84 |
| leader_exit | 1.06 | +0.10 | 0.78 |
| mid_war | 0.72 | +0.07 | 0.77 |
| autocratic_closure | 1.03 | +0.05 | 0.64 |
| democratic_deepening | 1.14 | +0.04 | 0.70 |
| democratize_step | 1.28 | 0.00 | 0.68 |
| liberal_erosion | 1.03 | −0.02 | 0.48 |
| irregular_exit | 1.78 | −0.06 | 0.80 |

---

## Turn era-1870-1914 — 2026-09-06

Lenses: data, corridors, statistics, engine (24 findings). Backtest re-run: `node scripts/backtest.mjs --from 1870 --to 1910 --step 10 --horizon 20 --runs 100 --universe all` → `scores/backtest-1870-1910-h20-all.json`, compared against the same as-of rows in `scores/backtest-1870-2010-h20-all.json`. A regression check outside the turn was run for 1950–2000 (`scores/backtest-1950-2000-h20-all.json`, overwritten; the previous file is in git at `5b6ab0c`).

### Applied

| finding | change | files |
|---|---|---|
| data/1, statistics/1a, engine/4 | `aid_conditionality` is a **structural zero** outside 1992–2016, not a null: `build-panel.mjs` emits 0 for every actor-year outside the promotion era (null only inside it when `aid_gni` is missing), and `core.stepYear` drops the `aid_gni != null` guard. This alone was killing every regime template before 1960. | `scripts/build-panel.mjs`, `src/engine/core.js` |
| statistics/1b | New covariate field `default_outside: { window, value, source }`, honoured by `fit-hazards.rawValue`, `core.featureActor` and `backtest.hasCoverage`. Applied to `intrastate` (UCDP 1946–2024) on `autocratization_onset`, `autocratize_step`, `democratic_deepening`, `autocratic_closure`. The imputation is declared in the template with its source, not hidden in the panel. | `data/templates.yaml`, `scripts/fit-hazards.mjs`, `src/engine/core.js`, `scripts/backtest.mjs` |
| data/4 | `loadActors` keeps the codelist's **interior gaps**: actors carry `spans: [[from,to), …]` and `isLive` is span membership, not `[min,max]`. Ten colonised states (DZA, TUN, MMR, MDG, LBY, VNM, MAR, AFG, KOR, EGY) leave the universe while they are colonies. | `scripts/lib/hist.mjs`, `data/history/actors.yaml` |
| data/4 | Hand lifecycle corrections where the codelist's GW span outlives CoW membership: HANOVER → 1866, SAXONY → 1867, MECKLENBURG_SCHWERIN → 1867, VAT (Papal States) → 1860. Entries are `modeled: false` (fit sample and dyad universe, not simulated). | `data/history/actors.yaml` |
| data/5 | EGY gets `spans: [[1855,1883],[1922,null]]` — the Khedivate is a CoW/GW member and the host of the Suez corridor; its 13 NMC capability rows now reach the world (`EGY.cinc[1875] = 0.0053`). | `data/history/actors.yaml` |
| data/3, engine/5 | `great_power` advances during a run from the dated CoW major-power list (the same class of fact as introduced/retired), so USA and JPN become major powers inside a horizon that crosses 1898/1895. Verified: world at as-of 1890, +20y → `USA.great_power = 1`, `JPN.great_power = 1`. `cinc` stays frozen (reading a capability index forward is an outcome, not a list). | `src/engine/core.js` |
| engine/1 | Actors are **born and retired during a run** from `panel.live`, with the successor inheriting the dyadic rivalry memory. Verified: as-of 1870 + 20y → PRUSSIA gone, DEU present. `backtest.mjs` scores dyads over every actor live at any point in the horizon, so truth involving actors born inside it (DEU, POL, TUR, the Baltics) is scored instead of silently dropped. | `src/engine/core.js`, `scripts/backtest.mjs` |
| engine/3 | `applyActorEvent` gains `autocratic_closure`, `liberal_erosion`, `democratic_deepening` rewrites (previously ~64 regime moves per run changed nothing), plus a `HANDLED` guard that throws if a simulated template has no rewrite. | `src/engine/core.js` |
| statistics/7 | Alliance and border graphs are **frozen at as-of** (`world.allied`, `world.contiguous`) instead of being read forward on their historical dates. For an as-of before the contiguity source starts (CShapes 2.0 begins 1886) the first available snapshot stands in — a documented imputation, recorded in `data/templates.yaml`; without it 15 of the 20 forecast years at as-of 1870 have every non-major dyad at hazard 0. | `src/engine/core.js`, `scripts/backtest.mjs`, `data/templates.yaml` |
| statistics/2 | Every scored row now carries `n_at_risk`, `auc_at_risk` and `n_structural_miss`. The turn's headline dyadic AUCs (0.85–0.95) are mostly the relevance filter: at-risk AUC is 0.58 (1870), 0.67 (1880), 0.75 (1890), 0.72 (1900), 0.65 (1910). | `scripts/backtest.mjs`, `docs/system.md` |
| statistics/1c | A template with no at-risk unit is reported (`n: 0`, `reason`) instead of vanishing from `byAsOf`; actor-year rows with `n_at_risk < 10` are marked `underpowered` and kept out of the pooled summary (liberal_erosion at n=2/n=4 was setting a pooled number). | `scripts/backtest.mjs` |
| data/6 (partial) | Successor-border population series dropped for the multinational empires via `successor_borders_until` in `data/history/actors.yaml` (AUT_HUN, OTTOMAN, PRUSSIA, RUS pre-1918): 365 actor-years where OWID modern-borders population contradicted CoW NMC `tpop` by up to 8×. `build-panel` now prints the remaining population/tpop disagreement (900/11858 rows > 30%). `gdp_pc` is **not** dropped — see escalations. | `scripts/build-panel.mjs`, `data/history/actors.yaml` |
| corridors/1, data/8 | Every corridor and territory record carries a dated `history: [{year, status/controller, source}]`; the 2026 `status`/`controller` is now explicitly the snapshot. 27 new corridor records so that **every** `kind: corridor`/`chokepoint` event id resolves. `build-events.mjs` and `build-world.mjs` fail the build on an unresolvable corridor/chokepoint/territory id or a record with no history. `controller`, `sponsor`, `capacity`, `mode: cable` and `status: abandoned` added to the schema. | `data/corridors.yaml`, `data/territories.yaml`, `scripts/build-events.mjs`, `scripts/build-world.mjs`, `docs/schema.md` |
| corridors/2 | Suez 1869–1914 goes from one row to five: opening (1869.87), the British share purchase (1875.86), Tel el-Kebir and the occupation (1882.70), the Convention of Constantinople (1888.82), the Entente (1904.29) — with `controller` OTTOMAN → GBR. EGY is now a live actor for the era (data/5), so `transits: [EGY]` resolves. | `data/history/events.yaml`, `data/corridors.yaml` |
| corridors/3 | Turkish Straits 1877–1913: the Russo-Turkish restriction, the **Dardanelles closure of Apr–May 1912** (the one in-era closure whose `adjacent_war` covariate would fire, against the italo_turkish war already in the file), the Balkan-war contestation and the 1913 reopening. Chokepoint events in 1869–1914: 2 → 16. | `data/history/events.yaml`, `data/corridors.yaml` |
| corridors/4 | Cable corridors added as a first-class mode: `eastern_telegraph`, `all_red_pacific`, `german_atlantic_cables`, `spanish_colonial_cables`, with the two denial events (Manila/Cienfuegos 1898.35, CS Alert 1914.60). `waves.yaml telegraph_cable.saturates` corrected 1880 → 1910 with the reason: routing concentration is a corridor property, not a diffusion one. | `data/corridors.yaml`, `data/history/events.yaml`, `data/waves.yaml`, `docs/schema.md` |
| corridors/5 | Manchurian rail complex: `chinese_eastern_railway`, `south_manchuria_railway` (controller RUS → JPN at Portsmouth 1905.68), `trans_siberian` with dated `capacity` (0.3 single track 1904 → 0.7 in 1916), and the `liaodong_port_arthur` territory. | `data/corridors.yaml`, `data/territories.yaml`, `data/history/events.yaml` |
| corridors/6 | 16 territory events dated ≤1914 (was 0) and 13 new territory records with history: Alsace-Lorraine, Bosnia (1878 occupation, 1908 annexation), Cyprus, Tunisia, Egypt, Heligoland, Kiaochow, Liaodong, Weihaiwei, the Philippines, the Canal Zone, Korea, Libya. The dangling `golan_buffer_2025` event id is renamed to the record it meant (`syria_buffer`). | `data/territories.yaml`, `data/history/events.yaml` |
| corridors/7 | Berlin–Baghdad becomes a record with `sponsor: DEU`, `load_bearing_for` and seven dated rows including the **Anglo-German convention of 15 Jun 1914** that settled the dispute six weeks before the DEU\|GBR war. The note now states the dampener as a test, not a conclusion. | `data/corridors.yaml`, `data/history/events.yaml` |
| corridors/8 | `status: abandoned` added and used for Panama 1889.1 (and Cape-to-Cairo); Panama 1881 building / 1904 US takeover; Kiel's 1907–1914.48 widening; trans_caspian, uganda_railway, cape_bulawayo, gotthard_tunnel, simplon_tunnel, baku_batumi_rail. Corridor+chokepoint events in 1869–1914: 9 → 48. | `data/history/events.yaml`, `data/corridors.yaml`, `docs/schema.md` |

### Before / after — the turn's as-of rows

`brier` lower is better; `auc@risk` is new (no baseline). `n` changes because the actor universe lost fictional colonial actors (data/4) and gained actors born inside the horizon (engine/1).

| as-of | template | n | exp | obs | Brier | AUC | AUC@risk | miss0 |
|---|---|---|---|---|---|---|---|---|
| 1870 | mid_force | 1770 → 1653 | 43.8 → 57.9 | 22 → 27 | 0.0150 → 0.0193 | 0.847 → 0.875 | 0.583 | 4 |
| 1870 | mid_war | 1770 → 1653 | 21.7 → 25.9 | 7 → 9 | 0.0056 → 0.0077 | 0.731 → 0.827 | 0.525 | 2 |
| 1880 | mid_force | 1485 → 1431 | 54.9 → 63.2 | 38 → 38 | 0.0232 → 0.0239 | 0.900 → 0.946 | 0.674 | 0 |
| 1880 | mid_war | 1485 → 1431 | 25.3 → 28.5 | 16 → 18 | 0.0113 → 0.0134 | 0.761 → 0.820 | 0.612 | 4 |
| 1890 | mid_force | 1485 → 1596 | 68.1 → 77.3 | 52 → 53 | 0.0314 → 0.0303 | 0.830 → 0.853 | 0.748 | 10 |
| 1890 | mid_war | 1485 → 1596 | 29.9 → 34.5 | 21 → 21 | 0.0147 → 0.0136 | 0.755 → 0.848 | 0.729 | 4 |
| 1900 | mid_force | 1485 → 2211 | 94.5 → 94.5 | 87 → 109 | 0.0410 → 0.0367 | 0.906 → 0.852 | 0.719 | 22 |
| 1900 | mid_war | 1485 → 2211 | 39.6 → 39.6 | 41 → 62 | 0.0226 → 0.0240 | 0.886 → 0.827 | 0.712 | 15 |
| 1900 | democratize_step | — → 33 | — → 17.2 | — → 13 | — → 0.265 | — → 0.513 | 0.513 | 0 |
| 1900 | autocratic_closure | — → 15 | — → 9.0 | — → 4 | — → 0.268 | — → 0.818 | 0.818 | 0 |
| 1900 | democratic_deepening | — → 1 | — → 0.1 | — → 0 | — → 0.005 | — | — | underpowered |
| 1910 | mid_force | 1830 → 2415 | 95.8 → 88.4 | 89 → 114 | 0.0357 → 0.0364 | 0.903 → 0.861 | 0.652 | 20 |
| 1910 | mid_war | 1830 → 2415 | 40.4 → 36.5 | 46 → 55 | 0.0205 → 0.0206 | 0.885 → 0.841 | 0.633 | 11 |
| 1910 | democratize_step | — → 31 | — → 14.9 | — → 15 | — → 0.255 | — → 0.583 | 0.583 | 0 |
| 1910 | autocratic_closure | — → 19 | — → 10.2 | — → 6 | — → 0.221 | — → 0.865 | 0.865 | 0 |
| 1910 | liberal_erosion | 4 → 4 | 0.9 → 0.8 | 2 → 2 | 0.348 → 0.315 | 0.250 → 0.750 | 0.750 | underpowered |

Fit samples (`data/fits.json`): democratize_step n 4288 → 6981 / events 205 → 312; autocratic_closure 4112 → 5828 / 164 → 249; democratic_deepening 1544 → 1965 / 12 → 30. All three now have rows in the 1900s and 1910s.

**Reading the deltas honestly.** Three of the four score movements are corrections, not gains:
- The as-of 1900/1910 dyadic AUC falls (0.906 → 0.852, 0.903 → 0.861) because 22 and 25 observed dyads that were previously *unscorable* — one party was born inside the horizon — are now in the sample, and because the fictional colonial actors that supplied free true negatives are gone. Brier at 1900 improves (0.0410 → 0.0367); the model is not better at ranking, it is being asked a harder and more complete question.
- The as-of 1870/1880 expected counts rise (43.8 → 57.9) because the pre-1886 border hole is now filled by the 1886 snapshot instead of leaving every non-major dyad at hazard 0 for 15 of 20 years. The over-prediction (exp/obs 2.15) was always there; it was hidden behind forced zeros.
- Three regime templates appear at as-of 1900/1910 for the first time, scoring against events the model previously assigned p = 0 by construction. They are badly calibrated (autocratic_closure exp/obs 1.92); a template that appears and is wrong is strictly better than one that is silently absent.
- 1950–2000 regression check: `autocratic_closure` skill +0.09 → +0.15, AUC 0.68 → 0.73; `democratic_deepening` now scored at all (n=102, skill +0.16); `democratize_step` skill −0.01 → −0.09 and `liberal_erosion` AUC 0.71 → 0.59 — both are consequences of engine/3: the three regime templates now actually move `regime`, so the at-risk sets churn during a run instead of standing still. `mid_force` skill 0.158 → 0.131 on a sample that grew 65k → 92k rows for the same reason as the era rows.

### Skipped

| finding | reason |
|---|---|
| engine/6 (window) | Checked and **not a bug**: `dyadRecent > world.year - 6` reads years y−5…y−1 (the same-year write happens after the draw), which is exactly the fitted `win5`; the as-of seeding `e.year > asOf − 5` gives asOf−4…asOf, which is the same window at the first step. No change made. The recurrence *amplification* it also reports is real and escalated. |
| statistics/5 (collider) | Real, and the measured coefficient shift (contiguous +0.97 → +1.79, major_power_any +0.11 → +1.38) is recorded here — but re-specifying the dyad estimation sample with a case-control offset changes every dyadic number in the model, and the pre-1886 contiguity hole (deferred below) is exactly the region the sampler would draw from. Deferred to the turn after the contiguity backfill lands. |
| data/4 (id rename) | `VAT` → `PAPAL_STATES` not done: the id keys the panel, events and contiguity outputs. The lifecycle is corrected (live 1816–1860) and the record documents the conflation with Vatican City. |
| data/6 (empire GDP) | Only the population half is fixed. Empire-wide `gdp_pc` needs a derived series; dropping Austria-borders `gdp_pc` would remove AUT_HUN from every regime template. Escalated. |

### Deferred (needs a fetch this environment cannot make)

| finding | dataset | note |
|---|---|---|
| data/2, statistics/3, engine/2 | **CoW Direct Contiguity v3.2** (`contdir.csv`, 1816–2016, land + water classes 1–5) — <https://correlatesofwar.org/data-sets/direct-contiguity/> | Would end the 1816–1885 dyad hole (134 mid_force + 106 mid_war events outside the fit) and mark the water pairs CShapes' 30 km land buffer can never see (CHN\|JPN, ESP\|USA, JPN\|KOREA). `correlatesofwar.org` answers curl with HTTP 403; the UC Davis mirror does not resolve; `paulhensel.org` paths 404. Interim: the engine freezes borders at as-of and stands the 1886 snapshot in for earlier as-of years, and the template notes say so. |
| data/1 (second half) | **CoW Intra-State War v4.1** (1816–2007) | `intrastate` before 1946 is currently a declared `default_outside` imputation of 0, not an observation. The real series would replace the imputation. Note `data/raw/hist/cow_war.csv` is only the war-type lookup table (740 rows, no years) and cannot serve. |
| data/7 | **Archigos 4.1** (leader-level, 1875–2015) | Would give `leader_exit`, `irregular_exit` and `coup_attempt` any pre-1950 coverage at all; `data/templates.yaml` already cites it as a source. Until then those templates are correctly absent from the era rows. |

### Escalated

`corridors/1 + engine/8 + statistics/8` (corridor-year panel unit and the corridor dampener), `statistics/6` (pre-1946 era term), `statistics/4` (rolling-origin refit), `engine/7` (nested mid_war and war duration), `engine/6` (rivalry decay), `data/6` (empire-wide series). See `docs/escalations.md`.

*Rule fix noticed during the audit (pre-existing, not from a finding): `src/engine/core.js` read `world.actors.USA.cur.regime` for `hegemon_x_client`, the one country id in a file whose header forbids them. It now reads the panel's `hegemon_regime` variable. The covariate is `candidate`-only, so no fit changes.*

### Checker — 2026-09-06

Independent verification of `49bbd3c`. Build green and byte-reproducible (`build-panel` → `build-events` → `fit-hazards` → `backtest` reproduce the committed `panel.json`, `events.json`, `fits.json` and `scores/backtest-1870-1910-h20-all.json` to the digit; only `meta.built`/`ms` differ). Tests rerun and passing: data/1 guard (0 null `aid_conditionality` on live pre-1992 actor-years), data/3 (as-of 1890 +20y → USA/JPN `great_power = 1`), data/4 (HANOVER/SAXONY/MECKLENBURG_SCHWERIN/VAT and the ten colonised states all `live = 0` in the asserted windows), data/5 (EGY live 1870–1882, `cinc[1875] = 0.0053`), data/8 (build-events exits 1 on an injected dangling id), corridors/1–8 (0 dangling ids, 0 records without history, suez 5 rows, 16 chokepoint and 49 corridor+chokepoint events 1869–1914 with 1 abandoned, 16 territory events ≤1914), engine/1 (PRUSSIA → DEU at 1871), engine/3+4 (7 regime falls and 7 rises in an as-of 1900 run; mean regime 0.586 ≠ 0.509), statistics/2 (auc_at_risk 0.583 at as-of 1870), statistics/7 (allied and contiguous sets identical at as-of 1870 and 1885; 123 border pairs).

One break found and fixed (`47152c2`): `stepLifecycle` read `panel.live[y − Y0]` past the panel's last year, where it is `undefined`, so `run-forward.mjs` (as-of 2025, +40y) retired every actor at its first step — `public/forecast.json` rebuilt to 0 dyads and no hazards. The backtest caps its horizon at the panel end and was unaffected, so the turn's scores stand. Guarded and the forecast regenerated at the same 300 × 40y parameters.

Two things for the next adversary. (1) **Newborn actors are seeded from post-as-of observations**: `stepLifecycle` builds an actor born at year *y* from `panel[y]`, so in an as-of 1870 run DEU enters in 1871 with its *observed* 1871 `cinc` (0.1198) and regime. At as-of 1900 that is 18 of the 67 dyad actors. It is a leak in the direction of better scores and should be replaced by a state derived from the predecessor or from as-of-time information. (2) **Unexplained out-of-turn regression**: in the 1950–2000 check `irregular_exit` pooled skill fell −0.076 → −0.136 (AUC 0.772 → 0.783); the log explains `democratize_step` and `liberal_erosion` as engine/3 consequences but not this one.

## Turn era-1914-1945 — 2026-09-06

Baseline: `scores/backtest-1910-1940-h20-all.json` at `408f577` (as-of 1910/1920/1930/1940, horizon 20, 100 runs, universe=all).
Rebuild order run after every change: `build-panel` → `build-events` → `fit-hazards` → `backtest` (1910–1940 and, as a regression guard, 1950–2000). `npx vite build` green.

### Applied

| finding | change | files | effect |
|---|---|---|---|
| data/1 + statistics/4 | Foreign occupation is no longer a domestic regime change. 19 dated `kind: occupation` spans (Ethiopia 1936, Austria 1938, Czechoslovakia 1939, Poland 1939, Denmark/Norway/Low Countries/France 1940, Yugoslavia/Greece 1941, Philippines 1942, Italy 1943, Hungary/Bulgaria 1944, Germany 1945, Japan 1945) with sources and an `imposed_until` for the settlement written by the occupier. `build-events` stamps `cause: occupation` / `cause: imposed` on the 32 regime steps inside them; the four domestic regime templates carry `event_filter: { cause: null }`. Nothing is deleted — the conquest steps stay in `events.json` under their cause. | `data/history/events.yaml`, `scripts/build-events.mjs`, `data/templates.yaml` | `autocratic_closure` as-of 1930 AUC 0.279 → 0.555, as-of 1940 0.539 → 0.844, pooled AUC 0.500 → 0.642 and skill −0.118 → −0.031. `liberal_erosion` at as-of 1930 no longer scores three German invasions as erosion (obs 3 → 0). |
| data/2 + statistics/1 | Dyadic MIDs are derived per pair, not per dispute: hostility `min(hostlev_a, hostlev_b)`, onset `max(styear_a, styear_b)`, and `mid_war` nests inside `mid_force`. Each row carries `dispnum`, `hostlev`, `n_participants`, `multilateral`. | `scripts/build-events.mjs`, `data/templates.yaml` (notes) | `mid_war` events 649 → 446; CoW dispnum 258 (WWII) is 6 distinct years instead of 1, peaking at 99 dyads in 1941 rather than 223 in 1939. As-of 1920 `mid_war` obs 205 → 52, exp/obs 0.23 → 0.97, Brier 0.073 → 0.018, `n_structural_miss` 71 → 8. As-of 1940 obs 53 → 174 (the war is now inside the window it belongs to). Fit: `allied` +0.05 → −0.62 (literature prior −0.5), `joint_democracy` −1.42 → −2.02. |
| data/3 | `CZECHOSLOVAKIA` given a real lifecycle (`[[1918,1939],[1945,1993]]`, successor CZE) and the series it owns: `owid: CZE` for V-Dem, `owid_alt: OWID_CZS` for Maddison/population. | `data/history/actors.yaml`, `scripts/lib/hist.mjs` | `CZECHOSLOVAKIA` 1930: regime 2, gdp_pc 4664, population 13.96M (was all null); `CZE` regime at 1930 now null (was 2). The 1939 collapse and the 1948 coup are on the actor that exists: `1939 2→0 (cause: occupation)`, `1948 1→0 (domestic)`. |
| data/4 | Wartime system-membership gaps: DEU `[[1871,1946],[1949,null]]`, AUT `[[1918,1938],[1955,null]]`, POL `[[1918,1940],[1945,null]]`, ETH `[[1855,1937],[1941,null]]`, CZECHOSLOVAKIA and ALB as above. `build-panel` writes `at_war` only for live years, and nulls NMC capabilities plus the dispute/alliance flags for fully occupied years (461 values across the 19 spans). | `data/history/actors.yaml`, `scripts/build-panel.mjs` | POL `at_war[1942]` and `mid_force[1942]` are null, not 0; DEU/AUT/POL/ETH/CZECHOSLOVAKIA/ALB `live = 0` through their occupations; FRA `tpop[1941]` null instead of the 8,000,000 Vichy placeholder. |
| corridors/1 | Nine missing wars, every one fought over a line: `cer_1929`, `manchurian` (1931.72, the same date as the SMR record), `saudi_yemeni`, `changkufeng`, `nomonhan`, `winter_war`, `franco_thai`, `anglo_iraqi_1941`, `iran_1941`. WWII gains DNK, LUX, SRB, EGY and THA as belligerents. | `data/history/events.yaml` | CHN/JPN `at_war` = 1 for 1931–33 (was 0), RUS 1929 and 1938–40, IRN and IRQ 1941, SRB 1941. |
| corridors/2 + statistics/7 | War records take per-participant `entries:` / `exits:` maps with the declaration dates as `source`; `build-panel` honours them. | `data/history/events.yaml`, `scripts/build-panel.mjs` | USA `at_war` 1914–16 = 0 and 1917–18 = 1; 1939–40 = 0, 1941–42 = 1. ITA 1914 = 0. BRA 1939–41 = 0, 1942 = 1. RUS out after Brest-Litovsk. ~20 wrongly-positive actor-years removed from a covariate fitted at +1.21 (`mid_force`) and +2.12 (`mid_war`). |
| corridors/3 + 5 + 6 + data/8 | The interwar corridor record: Suez 1915/1916/1922/1936/1940/1941/1943; Kiel 1914/1919 (Versailles Art. 380)/1936/1939/1945; Panama 1915–16 (Culebra slides — a closure with no war attached); Turkish Straits 1915 Dardanelles, 1916, Sèvres 1920, **Lausanne 1923 returns the controller to TUR** (the record had GBR holding them to 1936), Montreux Art. 19 closure 1939; Trans-Siberian 1918–20; the Chinese Eastern Railway through 1929 and the 1935 sale to Manchukuo; the South Manchuria Railway through the 1931 Liutiaohu demolition and 1945; the Pacific cable cut of Sep 1914. | `data/corridors.yaml` | corridor+chokepoint events 1919–1934: 0 → 12; 1938–45: 3 → 19. |
| corridors/4 | Four new corridor records with geometry, transits, `load_bearing_for` (`estimate`) and dated history: `narvik_ore_railway`, `trans_iranian_railway` (the Persian Corridor, built because Montreux shut the Straits), `burma_road`, `mediterranean_route` (so the Suez record stops asserting an open canal for 1940–43). | `data/corridors.yaml` | 43 → 47 records; the Norwegian campaign, the Anglo-Soviet invasion of Iran and the closed Mediterranean now have an infrastructure record. |
| corridors/8 | `build-events` derives an event from every `history` row in `data/corridors.yaml` / `data/territories.yaml` that has no hand event within 0.1y — the build validated events → records but never records → events. Fifteen interwar territory records added (Danzig/the Polish Corridor with Gdynia as the bypass port, Rhineland, Ruhr, Saar, Memel, Anschluss, Sudetenland, Bohemia-Moravia, Manchukuo, Hatay, eastern Poland, Bessarabia, Karelia, the Baltic annexations, Italian Ethiopia). | `scripts/build-events.mjs`, `data/territories.yaml` | 155 derived events; territory events 1914–46: 1 → 53. |
| statistics/2 + engine/6 | `lag1(at_war_any)` promoted on `mid_war` with `holdout_split: 1939` — the feature was already computed in the fitter *and* the engine and used only by `mid_force`. | `data/templates.yaml` | Holdout (train <1939, test ≥1939) AUC 0.757 → 0.850, in-sample 0.793 → 0.872; coefficient +2.12, the largest in the template. Turn pooled `mid_war` exp/obs 0.28 → 0.44, skill 0.08 → 0.12. Cost recorded in the lifecycle entry: 1950–2000 exp/obs 1.66 → 2.62. |
| statistics/6 + engine/7 | `great_power` frozen at as-of, like the alliance and border graphs and like `world.nukes`. It gated the politically-relevant dyad filter and carried `major_power_any`, so the run knew who stopped being a great power in 1917, 1918, 1943 and 1945. | `src/engine/core.js` | Contributes to the as-of 1940 `mid_force` AUC fall 0.826 → 0.708 (with the label change); `auc_at_risk` there rises 0.530 → 0.720. The point is that the lower number is the honest one. |
| engine/2 + data/7b | Actor-year templates are scored over every actor live at **any** year in the window, not the as-of snapshot, with the sample filter read from the panel at the actor's first live year. Each row reports `n_excluded_no_covariate`, `n_excluded_with_event` and `excluded_vars`. | `scripts/backtest.mjs` | `democratize_step` n 148 → 270 and observed 87 → 132 — the decolonisation cohort was previously invisible (at as-of 1940 alone: 44 actors carrying 38 democratization onsets, against a scored row of n=44). The pooled scores fall accordingly; see *Reading the deltas* below. |
| engine/4 | Two as-of leaks closed: the event list is truncated at as-of inside `createWorld`, and an actor introduced mid-horizon is built from the panel **at as-of** instead of at its birth year (IRQ 1932, IND/PAK 1947, ISR 1948, KOR 1948, IDN 1949 all entered with their observed polyarchy for a year the forecaster cannot see). Where the as-of row is empty the actor takes a stated `world.entryPrior` — the median live actor at as-of for regime, polyarchy, gdp_pc, gdp_growth, population, tpop — and zeros for the ties and flags a non-existent state cannot have. `cinc` is deliberately not imputed, so newborn actors carry no dyads. | `src/engine/core.js` | As-of 1940 `democratize_step` `n_structural_miss` 30 → 0 and `n_excluded_no_covariate` 50 → 9; pooled `democratize_step` exp/obs 0.55 → 0.70 and skill −0.45 → −0.25 relative to the leak-free-but-priorless intermediate. |
| engine/3 (half) | The trailing 10-year growth rate decays toward the panel's long-run mean (`GROWTH_MEAN = 0.0172`, n=8,453 live actor-years 1900–2000; `GROWTH_PHI = 0.85`, ~4-year half-life) instead of being frozen for twenty years. | `src/engine/core.js` | The as-of 1920 projection no longer carries the WWI collapse to 1940 (one actor's terminal gdp_pc was 1/19 of the observed value, 3.3 sd on a covariate carrying −0.37 on `autocratic_closure`). The correlated world growth shock the finding also asks for is a new mechanism and is **not** implemented; see *Skipped*. |
| data/5 + data/6 | `owid_alt` windows on the actor record, honoured by a `preferAlt` code map used only for the borders-sensitive series (Maddison gdp_pc, OWID population): RUS ← OWID_USS 1922–91, SRB ← OWID_YGS 1918–92, CZECHOSLOVAKIA ← OWID_CZS 1918–92. SRB also gains `successor_borders_until: 1992`. | `scripts/lib/hist.mjs`, `scripts/build-panel.mjs`, `data/history/actors.yaml` | RUS 1930 gdp_pc 1345 → 2308 and population 85.2M → 151.1M against an NMC tpop of 154.9M; SRB 1930 gdp_pc null → 1935 and population 3.99M → 14.41M against tpop 13.78M. Rows disagreeing >30% in 1910–45: 125 → 71 (RUS 28 → 4, SRB 28 → 0). |
| data/6 (second half) | The three codelist twins that duplicated a CoW code held by a hand actor (`YUGOSLAVIA`/SRB 345 overlapping for 148 years, `AUSTRIA_HUNGARY`/AUT_HUN 300, `GERMAN_DEMOCRATIC_REPUBLIC`/DDR 265) are retired with `spans: []` and a note, not deleted; `build-panel` now reports any remaining overlap. | `data/history/actors.yaml`, `scripts/build-panel.mjs` | `duplicate entities: none`. |
| statistics/5a | The REIGN-era structural zeros are declared: `default_outside` on `win5(coup_attempt)` in `autocratic_closure` and on `leader_exit_recent` in `democratize_step` and `liberal_erosion`, naming the window and calling the 0 an imputation. | `data/templates.yaml` | No coefficient change (the `win5` transform already mapped null to 0); the zero is now visible rather than silent. The coverage half is deferred. |

### Score movement (turn backtest, 1910–1940, h20, 100 runs, universe=all)

| as-of | template | n | exp | obs | Brier | AUC | AUC@risk | miss0 | nocov |
|---|---|---|---|---|---|---|---|---|---|
| 1910 | democratize_step | 31 → 62 | 14.9 → 18.8 | 15 → 32 | 0.255 → 0.328 | 0.583 → 0.568 | 0.583 → 0.581 | 0 → 8 | 17 |
| 1910 | autocratic_closure | 19 → 26 | 10.2 → 11.1 | 6 → 9 | 0.221 → 0.261 | 0.865 → 0.608 | 0.865 → 0.660 | 0 → 1 | 2 |
| 1910 | mid_force | 2415 | 88.4 → 70.5 | 114 → 99 | 0.036 → 0.034 | 0.861 → 0.805 | 0.652 → 0.716 | 20 → 30 | — |
| 1910 | mid_war | 2415 | 36.5 → 40.0 | 55 → 50 | 0.021 → 0.019 | 0.841 → 0.848 | 0.633 → 0.630 | 11 → 10 | — |
| 1920 | democratize_step | 38 → 53 | 17.5 → 18.8 | 15 → 21 | 0.257 → 0.303 | 0.523 → 0.418 | 0.523 → 0.454 | 0 → 4 | 7 |
| 1920 | autocratic_closure | 31 → 39 | 19.9 → 18.8 | 18 → 19 | 0.230 → 0.264 | 0.733 → 0.721 | 0.733 → 0.844 | 0 → 3 | 4 |
| 1920 | mid_force | 2346 | 127.5 → 98.7 | 105 → 91 | 0.033 → 0.030 | 0.900 → 0.894 | 0.747 → 0.768 | 11 → 12 | — |
| 1920 | mid_war | 2346 | 46.8 → 50.2 | **205 → 52** | 0.073 → 0.018 | 0.774 → 0.879 | 0.738 → 0.750 | **71 → 8** | — |
| 1930 | democratize_step | 35 → 59 | 18.3 → 20.6 | 25 → 27 | 0.264 → 0.274 | 0.424 → 0.589 | 0.424 → 0.536 | 0 → 1 | 6 |
| 1930 | democratic_deepening | 8 → 13 | 1.7 → 1.6 | 1 → 1 | 0.140 → 0.079 | 0.000 → 0.583 | 0.000 → 0.375 | 0 | 4 |
| 1930 | liberal_erosion | 9 → 10 | 1.8 → 1.4 | **3 → 0** | 0.268 → 0.022 | 0.056 → — | 0.056 → — | 0 | 1 |
| 1930 | autocratic_closure | 23 → 33 | 11.0 → 11.3 | 15 → 17 | 0.303 → 0.298 | **0.279 → 0.555** | 0.279 → 0.567 | 0 → 2 | 4 |
| 1930 | mid_force | 3486 | 105.4 → 87.1 | 192 → 261 | 0.043 → 0.059 | 0.871 → 0.766 | 0.601 → 0.747 | 30 → 104 | — |
| 1930 | mid_war | 3486 | 39.5 → 45.6 | 240 → 202 | 0.060 → 0.049 | 0.752 → 0.779 | 0.736 → 0.746 | 99 → 75 | — |
| 1940 | democratize_step | 44 → 96 | 26.5 → 33.7 | 32 → 52 | 0.199 → 0.333 | 0.654 → 0.554 | 0.654 → 0.439 | 0 | 9 |
| 1940 | autocratic_closure | 23 → 49 | 8.4 → 8.4 | 17 → 18 | 0.338 → 0.208 | **0.539 → 0.844** | 0.539 → 0.678 | 0 | 16 |
| 1940 | mid_force | 6216 | 155.1 → 126.8 | 215 → 239 | 0.033 → 0.034 | 0.826 → 0.708 | 0.530 → 0.720 | 56 → 128 | — |
| 1940 | mid_war | 6216 | 47.7 → 75.1 | **53 → 174** | 0.009 → 0.024 | 0.781 → 0.726 | 0.607 → 0.737 | 19 → 87 | — |

Pooled over the turn:

| template | n | exp/obs | Brier | skill | AUC |
|---|---|---|---|---|---|
| democratize_step | 148 → 270 | 0.89 → 0.70 | 0.241 → 0.313 | +0.005 → −0.252 | 0.602 → 0.529 |
| autocratic_closure | 96 → 147 | 0.88 → 0.79 | 0.272 → 0.252 | −0.118 → **−0.031** | 0.500 → **0.642** |
| mid_force | 14463 | 0.76 → 0.56 | 0.036 → 0.039 | 0.131 → **0.137** | 0.857 → 0.767 |
| mid_war | 14463 | 0.31 → 0.44 | 0.033 → **0.028** | 0.091 → **0.117** | 0.776 → 0.775 |

**Reading the deltas honestly.** Four of these movements are not gains, and two look like losses but are not:

- **`democratize_step` pooled skill +0.005 → −0.252 is a change of question, not of model.** The unit set nearly doubled (148 → 270) and observed events went 87 → 132 because the scoring set now contains every state created inside the horizon. The model has no data at as-of for a large part of that cohort (`n_excluded_no_covariate` 17/7/6/9 by as-of, mostly `not_live_at_as_of`), so it answers with the entry prior or with 0 and takes the Brier hit. The old score was measured on the units that happened to be easy. The fix that would earn the skill back is a derived entry state — escalated as engine-4b.
- **`mid_force` AUC 0.857 → 0.767 and `mid_war` as-of 1930/1940 `miss0` 99 → 75 / 19 → 87** are the same fact from two sides: nesting `mid_war` inside `mid_force` moved the whole WWII coalition into `mid_force`'s positive set (as-of 1930 obs 192 → 261), and a third of those pairs are outside the frozen politically-relevant gate. The ranking did not get worse — `auc_at_risk` rose at every as-of year (0.601 → 0.747 at 1930, 0.530 → 0.720 at 1940). The gate is escalated as engine-1 + statistics-3.
- **`mid_war` as-of 1940 obs 53 → 174** is the correction that matters most: the entire Second World War used to be dated 1939 and therefore fell outside the 1941–1960 scoring window, which is what made that row's old exp/obs of 0.90 look like calibration.
- **`autocratic_closure` as-of 1930 AUC 0.279 → 0.555 and 1940 0.539 → 0.844** are the occupation fix. The template was ranking rich stable democracies lowest and they were exactly the ones being invaded.

**1950–2000 regression guard** (`scores/backtest-1950-2000-h20-all.json`, same command from 1950 to 2000):

| template | n | exp/obs | skill | AUC |
|---|---|---|---|---|
| mid_force | 92123 | 0.91 → 1.16 | 0.131 → 0.037 | 0.763 → 0.753 |
| mid_war | 92123 | 1.15 → **2.62** | −0.030 → −0.287 | 0.692 → 0.723 |
| autocratic_closure | 344 → 468 | 1.09 → 0.83 | 0.147 → −0.063 | 0.732 → 0.617 |
| democratize_step | 486 → 653 | 1.34 → 1.06 | −0.091 → −0.180 | 0.636 → 0.562 |
| intrastate_onset | 732 → 1045 | 1.06 → 0.96 | 0.171 → 0.169 | 0.752 → 0.753 |
| leader_exit | 724 → 1045 | 1.07 → 0.83 | 0.042 → −0.722 | 0.758 → 0.773 |

The `mid_war` over-prediction is the one number that fails a guard the adversary set (≤1.3). Attribution, measured by ablation: the stricter per-pair labels alone take it from 1.15 to 1.66 (observed war dyads 1970–1990 fall by two thirds, because the coalition cross-product is gone); `lag1(at_war_any)` takes it from 1.66 to 2.62, because the engine has no war duration and redraws every dyad every year. The term is kept — holdout AUC 0.757 → 0.850 forecasting 1939+ out of sample, and the turn it was promoted for improves — with the cost written into its `lifecycle` entry and the damping fix escalated as engine-5. The `leader_exit` and `autocratic_closure` falls are the engine/2 unit-set change again (n 724 → 1045, 344 → 468), not coefficient movement.

### Skipped

| finding | reason |
|---|---|
| engine/1, statistics/3 | Coalition joining and a dynamic relevance set are new engine dynamics (contagion), not template or data changes. Escalated with this turn's residual (75 and 87 unreachable war dyads at as-of 1930/1940). |
| engine/5 | War duration is a new engine state. Escalated, with the amplification cost this turn's `at_war_any` promotion measured. |
| statistics/8, engine/8, corridors/7 | Fitting `chokepoint_status` / `corridor_status` needs a new panel unit and new derivations in `build-panel` (`transit_at_war_any`, `adjacent_war`, `shared_corridor_lb`). The *data* half was done this turn (12 new corridor events in 1919–34, 19 in 1938–45, 4 records); the sample builder is escalated. |
| engine/3 (world shock) | Mean reversion of the growth rate is applied. The correlated annual world growth shock the finding also asks for — a Depression drawable across actors — is a new mechanism and is not implemented; without it simulated `z(gdp_growth)` still cannot reach the −2.9 sd of 1932. |
| statistics/5b | Hand-coding the interwar coup attempts was not attempted: an unsourced list of ~30 events would be worse than a declared imputation. The declaration was added; the dataset is under *Deferred*. |
| corridors/3 (cables), data/8 (Arctic route) | Partially done: the 1914 Pacific-cable cut and the 1942 Eastern Telegraph seizure are in; the Murmansk/Arctic convoy route has no record yet — it needs a `load_bearing_for` estimate with a citable source. |

### Deferred (needs a fetch this environment cannot make)

| finding | dataset | note |
|---|---|---|
| data/2, statistics/1 | **CoW Dyadic MID 3.1 / Maoz MIDdyadic 4.x** — <https://correlatesofwar.org/data-sets/mids/> | This turn approximates real dyad-years with `min` hostility and `max` onset over the pair. The dyadic file records which pairs actually engaged; the approximation is recorded in the `mid_force` template note. `correlatesofwar.org` answers curl with HTTP 403 (same block as the contiguity fetch deferred last turn). |
| statistics/5b | **Bjørnskov–Rode Coup d'État dataset (1900+)**, or the Powell–Thyne pre-1950 appendix | `data/panel.json` has zero positive `coup_attempt` values before 1950, so `win5(coup_attempt)` (+0.61, the largest positive term in `autocratic_closure`) is an imputed 0 for all 1,304 pre-1950 at-risk actor-years — while essentially every interwar closure in the label set (1922, 1923, 1926, 1929, 1930, 1934, 1936) was a coup or self-coup. Would also give `coup_attempt` and `irregular_exit` any pre-1950 sample at all. |
| data/1 (still open) | **CoW Intra-State War v4.1** | Unchanged from last turn: `intrastate` before 1946 remains a declared imputation. |

### Escalated

`engine/1 + statistics/3` (coalition joining, dynamic dyad relevance), `engine/5` (war duration), `statistics/8 + engine/8 + corridors/7` (corridor-year sample and the dampener), `engine/4b` (derived entry state for actors born inside the horizon). See `docs/escalations.md`.

## Implement era-1870-1914 / statistics-4 — 2026-09-07

Rolling-origin refit of the coefficients. Approved by the operator on 2026-09-07 with the instruction that `--refit` be the default and every later package be measured under it.

**What changed.** `scripts/lib/fit.mjs` — the whole fitting layer (design matrices, encoding, IRLS, AUC/Brier/calibration, ablation), lifted out of `scripts/fit-hazards.mjs` unchanged, plus a `maxYear` argument that keeps a row only if the year its *label* is read from is at or before it (`year + (lead ?? 0) <= maxYear`) and recomputes every `z`/`log` centring on the training subset. `scripts/fit-hazards.mjs` is now a thin CLI over it (`--max-year` exposed) and reproduces `data/fits.json` byte for byte apart from two additive fields. `scripts/backtest.mjs` refits per as-of year by default (`--no-refit` reproduces the previous run digit for digit and writes `scores/…-norefit.json`), caches one fits object per as-of year, and stamps `fit_split` / `fit_n` / `fit_events` / `fit_source` / `leaky` on every scored row. A template with too little history at an as-of year is reported as `n: 0` with the counts that failed and kept out of `pooled`; there is no literature-prior fallback because there is no sourced base rate to put in the intercept.

**Result.** 1870–2010, +20y, 100 runs, all states: 72 scored rows, all `fit_split <= asOf`, none leaky; 38 no-fit rows. The same run with `--no-refit`: 104 scored rows, 103 leaky. The as-of 1870/1880/1890 dyad rows disappear — CShapes contiguity starts 1886, so a forecaster at those dates has no fittable dyad-year sample at all, and the 0.79 / 0.82 / 0.71 `auc_at_risk` they used to report was in-sample throughout. Where the check can be run (1900–1930) the refit AUCs fall or hold: `mid_force` 0.78→0.75, 0.81→0.80, 0.89→0.89, 0.77→0.76; `mid_war` 0.77→0.76, 0.85→0.80, 0.88→0.87, 0.78→0.77.

**The one exception, checked.** At as-of 1940 `auc_at_risk` *rises* under the refit (0.72→0.75 `mid_force`, 0.74→0.77 `mid_war`), reproducibly at 400 runs, with headline AUC unchanged and exp/obs moving toward 1 (0.53→0.68, 0.43→0.59). The full-sample fit is pulled toward the 1946–2001 process and discriminates the 1940–1960 horizon worse than a fit that stops in 1940. Leakage inflates in-sample fit; it does not have to help out of sample when the eras differ.

**Pooled 1870–2010, before → after:** mid_force 0.90/+0.09/0.77 → 0.95/+0.03/0.77; mid_war 0.97/+0.03/0.78 → 1.10/−0.06/0.77; coup_attempt 0.84/+0.15/0.73 → 0.89/+0.18/0.76; intrastate_onset 0.95/+0.20/0.77 → 1.02/+0.12/0.74; leader_exit 0.84/−0.68/0.76 → 0.85/−0.82/0.74; irregular_exit 1.49/−0.11/0.69 → 2.06/−0.47/0.71; democratize_step 0.96/−0.19/0.56 → 0.97/−0.20/0.54; autocratic_closure 0.80/−0.08/0.60 → 0.66/−0.15/0.60; democratic_deepening 1.09/+0.06/0.72 → 1.51/−0.10/0.69; liberal_erosion drops out entirely (3 training events by 2010, never fittable at any as-of year).

**Numbers the later packages inherit** (all `--refit`, same commands): 1910–1940 pooled `mid_war` skill 0.094 (was 0.117), exp/obs 0.41 (was 0.44); as-of 1930/1940 `mid_war` `n_structural_miss` 79 / 87, `auc_at_risk` 0.72 / 0.77; 1950–2000 pooled `mid_war` exp/obs 4.18 (was 2.62) and `mid_force` 1.53 (was 1.16) — the post-1946 over-prediction the full sample was hiding, and the target `engine-5` (war duration) now has to hit. `engine-6` and `engine-7` are scored at as-of 1870/1880/1890 and are no longer measurable as written; they need restating against 1900–1930 or a dyad sample that reaches behind 1886.

Score artefacts regenerated under `--refit`: `scores/backtest-1870-2010-h20-all.json`, `-1870-1910-`, `-1910-1940-`, `-1950-2000-`, plus `scores/backtest-1870-2010-h20-all-norefit.json` as the comparison.

## Implement war-process (engine-6 + engine-7 + engine-5) — 2026-09-07

Approved by the operator as one package: a decaying rivalry score with δ ablated, `warLeft` duration drawn from the panel's `at_war` run lengths, and war firing only in a dyad-year that has a dispute. Two of the three land; the third is built, measured and left switched off in the data with its numbers.

**What changed.** `src/engine/core.js` gains three exported pieces of shared feature code and one mechanism: `rivalryScore(lastYear, year, δ) = δ^(age)`, `rivalryDecay(templates)` (reads δ off the covariate spec, throws if the two dyadic templates disagree), `warRunLengths(panel, asOf)` (the panel's completed `at_war` spells by the as-of year), and `warSpells`, a per-pair war counter. `scripts/lib/fit.mjs` imports the first two so there is one rivalry function and not two — the dyad feature block now carries `rivalry` beside the old `mid_force` win5 flag, keyed on δ in its cache. `data/templates.yaml` declares δ = 0.85 on both dyadic templates with the rescaled prior, records the nesting form in `mid_war.notes`, and carries `mid_war.duration` as a `candidate` with the `rejected:` record. `scripts/analysis/war-spells.mjs` is new: the panel's spell histogram against the engine's, plus the nesting check. `scripts/fit-hazards.mjs` no longer rewrites `data/fits.json` on a run that names individual templates — it used to overwrite the file with just those.

**Rivalry (engine-6).** δ ablated over {1.0, 0.85, 0.75, 0.6} on the one-year holdout and on the full dynamic backtest. δ = 0.85 wins both: holdout AUC 0.8613 on `mid_force` (win5 0.8586, δ=1.0 0.8475) and pooled backtest `mid_force` 0.84 · +0.069 against win5's 0.95 · +0.026. The no-decay endpoint is worse than the binary flag it would replace, which is the evidence that the decay and not the reparameterisation is doing the work. Fitted +0.40 per sd against the binary's +1.81: a dispute one year old is worth *more* than the flag was (2.30 log-odds), five years old less than half (1.15).

**Nesting (engine-7).** `P(war | dispute) = hz.mid_war / max(hz.mid_force, hz.mid_war)`, derived rather than refitted. 5,610 simulated wars at as-of 1920 over 100 runs, none without a dispute in the same dyad-year. It is worth more than the rivalry change: pooled `mid_force` skill +0.032 → +0.069, `mid_war` −0.058 → −0.035, AUC held.

**Duration (engine-5) — not promoted.** It fixes the spell shape (one-year spells 70% → 24%, mean 1.51 → 3.91 years, against the panel's 49% / 2.99) and breaks every calibration number: 1950–2000 `mid_war` exp/obs 3.89 → 5.58 where the test asked for below 1.5, pooled 1.03 → 1.50 with skill −0.035 → −0.176. Two measured reasons. The amplification runs through `lag1(at_war_any)` = +2.12 reaching the belligerents' *other* dyads, not through repeated draws in the same dyad, so a longer spell is a longer exposure and the simulated war count doubles (5,610 → 10,352 at as-of 1920). And the engine's `at_war` is not the panel's: the panel's is the hand-coded interstate-war list (371 actor-years 1886–2001), the engine's is set by any CoW hostility-5 dyad (283 onset actor-years) — 1.31 at-war years per onset year, not the 2.6–3.0 of a whole spell, because about half the dyadic onsets happen inside a war already running. Left as `mid_war.duration.status: candidate`; one word flips it back on, `ENGINE_ABLATE=war_duration` forces it off.

**Published run** (`--from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`), before → after: `mid_force` 0.95 · +0.026 · 0.765 → **0.84 · +0.069 · 0.766**, `mid_war` 1.10 · −0.056 · 0.769 → **1.03 · −0.035 · 0.765**; every actor-year template within 0.02 of where it was. Windows: 1910–1940 `mid_war` 0.41 · +0.094 → 0.39 · +0.092 (the ≥0.35 guard holds), 1950–2000 `mid_war` 4.18 · −0.798 → 3.89 · −0.670 and `mid_force` 1.53 · −0.125 → 1.32 · −0.026.

**Escalated from this turn.** The dyadic war process is supercritical under a fitted `lag1(at_war_any)` of +2.12: the coefficient is estimated where at-war is exogenous and used where it is endogenous, which is the same trap `engine-6` has just taken out of `win5(mid_force)`. A decayed or at-risk-aware `at_war_any`, the era term (`statistics-6`) or the coalition rule (`engine-1`) are the three candidate fixes, and war duration is not promotable until one of them lands. Also newly visible: `data/events.json` drops CoW MID `endyear`, so the dyadic war-spell distribution (396 spells, mean 2.61, 38% of one year) is in `data/raw/hist/midb_3.02.csv` and nowhere the engine can read it.

## Implement coalitions (era-1914-1945/engine-1 + statistics-3, and era-1870-1914/statistics-6) — 2026-09-07

Approved by the operator as one package, with the instruction to calibrate `p_join` from the `sides:` lists in `data/history/events.yaml` and to raise the pre-1946 era term as a `candidates:` entry scored by the loop's own test. One of the two lands.

**What changed.** `src/engine/core.js` gains `coalitionRule(templates)` (the declaration in `data/templates.yaml` read by the engine and the fitter alike), `warDyadSpans` / `warPartnersAt` / `warLinked` (the observed war graph the relevance clause is evaluated on), the coalition step in `stepYear`, and `pre_1946` in `dyadHazards`. `scripts/lib/fit.mjs` imports all of it, so the sample the coefficients are estimated on and the sample the simulation draws over are one set; its ablation loop also had two bugs fixed — it built **actor** rows for every template (a candidate on a dyad-year template was silently scored on the wrong sample), and a candidate may now declare the split its ablation runs at. `scripts/analysis/coalition-calib.mjs` is new: the p_join calibration, printed. `scripts/backtest.mjs` stamps the engine switches into `meta.engine` and into the output filename, so an ablation can no longer overwrite a published score file.

**The era term (`statistics-6`) is promoted on `mid_war`, rejected on `mid_force`.** A pre-1946 dummy is unidentified at any split at or before 1946, so the ablation declares `holdout_split: 1975` and scores every variant there: `mid_war` holdout AUC 0.838 → 0.841 with holdout exp/obs 3.68 → 2.10 at +1.17; `mid_force` 0.900 → 0.900 and 1.14 → 1.12, which earns nothing. Per-era, per-dyad-type in-sample calibration on `mid_war` moves as the package required (1886–1914 contiguous-only 0.37 → 0.71, 1946–2001 major-only 2.37 → 1.17). Under the rolling-origin refit the coefficient is identified only where a forecaster holds both eras (1940 −0.00, 1950 −0.39, 1960 +0.40, … 2000 +1.22), so every pre-1946 as-of row is bit-identical and the whole effect is post-war. Pooled 1870–2010: `mid_war` 1.03 · −0.035 → **0.79 · −0.009**, `mid_force` 0.84 · +0.069 → **0.78 · +0.084**; 1950–2000 `mid_war` 3.89 → **2.61**. It also pulls `lag1(at_war_any)` from +2.13 to +1.92: part of what that coefficient carried was the era, not the contagion.

**The coalition rule (`engine-1`) is built, measured and not promoted.** `p_join = 0.0943` calibrated on the `sides:` lists (28 joiners / 297 allies at risk over 44 wars, `node scripts/analysis/coalition-calib.mjs`). At 1910–1940 it does what the package predicted — `mid_war` `n_structural_miss` 81 → 70 and 87 → 54 at as-of 1930/1940, `auc_at_risk` 0.729 → 0.776 and 0.776 → 0.823, pooled skill 0.092 → 0.129 — and misses the test's threshold of 20. Then the post-1945 guard fails by 11×: 1950–2000 `mid_war` exp/obs 2.61 → **28.00**. Three measured reasons, and a fourth thing worth recording: the relevance half *alone* (`COALITION_P_JOIN=0`) carries most of the structural gain (87 → 57 at as-of 1940) and still takes the guard to 4.85 while as-of 1940 `auc_at_risk` falls to 0.704, so the cheap half is not separately promotable either. `p_join` is a per-*war* rate applied per *dyadic war-year* draw (the record has 3.91 allies at risk per dyadic war-year, so the per-draw rate is 0.0070–0.0130, not 0.094); the relevance clause admits a pair *because* one side is at war, so every pair it opens carries `lag1(at_war_any)` = +1.92; and the post-1945 war level is already 2.6× too high before either multiplies it. Sweep at 1950–1980 (20 runs, `mid_war` exp/obs against 3.10 off): joining only 12.96 / 7.36 / 4.19 / 3.42 at p = 0.094 / 0.046 / 0.0145 / 0.005; both halves 33.58 at 0.094 and 6.78 at 0.005; `both_at_war` relevance 17.10 and 4.26. No setting is neutral.

**Published run** (`--from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`), before → after: `mid_war` 1.03 · −0.035 · 0.765 → **0.79 · −0.009 · 0.768**, `mid_force` 0.84 · +0.069 · 0.766 → **0.78 · +0.084 · 0.766**; every actor-year template unchanged (the era term is a dyad covariate). The coalition mechanism contributes nothing to that run: it is `status: candidate` and off.

**Escalated from this turn.** The three fixes the war process still needs are unchanged in kind but now measured against each other: the post-1945 *level* is the binding constraint (2.61 after the era term, from 3.89), and neither duration nor coalitions can be promoted on top of it. `n_structural_miss` in 1914–1945, on the other hand, is only reachable through a relevance rule — 87 of the as-of-1940 misses are pairs the frozen contiguity/major-power gate zeroes forever, and 30 of them come back for free — so the open question is a war-linked relevance set whose pairs do *not* inherit the contagion coefficient that opened them.

## Implement corridors (era-1914-1945 / statistics-8 + engine-8 + corridors-7) — 2026-09-07

Approved by the operator as the corridor package, superseding `era-1870-1914 / corridors-1`: build the corridor-year / chokepoint-year unit, fit `chokepoint_status` and `corridor_status`, add `COVERAGE` windows, register the corridor dampener as a candidate on the dyadic templates, and report what Panama 1915, Burma Road 1940 and Berlin–Baghdad do to the fit. The unit lands; the dampener does not.

**What changed.** `src/engine/core.js` gains the record layer — `corridorFirstYear`, `corridorStateAt`, `corridorTransitionYears`, `corridorTransits`, `corridorFeatures`, `corridorIndex`/`corridorStake`, `corridorOutcomeMix`, `worldLook`, `corridorHazards` and the draw in `stepYear` — and `scripts/lib/fit.mjs` imports every one of them, so the fitter reads the panel and the engine reads the simulated world through one `look` interface and there is a single construction, as with `rivalryScore` and `coalitionRule`. `scripts/backtest.mjs` scores the two record units, declares their coverage windows, and reports `n_unborn_records` / `n_unborn_events` for records whose history opens inside the horizon. `data/templates.yaml` rewrites both templates' labels and covariates, and carries the dampener as a `candidates:` entry on `mid_force` and `mid_war`. `scripts/analysis/corridor-fit.mjs` is new: the falsifier harness.

**The unit.** One row per record per year; the label is a change of the record's **status or controller** during the year (Suez 1882 and 1956 are control changes at constant status, and a cut repaired inside one year is still a transition in that year). A record whose history opens with `closed`/`contested` starts at the window's first year in its kind's base status — a strait is not built — which is what makes Malacca and Bab al-Mandab units for the whole window. Transits are dated through the successor chain with the controller counted as a transit, which covers Suez 1883–1921 (EGY out of the system, GBR holding it) and Berlin–Baghdad after 1922; `transits_history` turned out not to be needed. Result: `chokepoint_status` n=1,143 / 37 events (AUC in 0.774), `corridor_status` n=3,143 / 37 (0.813). The engine draws the layer last in the step, after the war draws, so the contemporaneous `at_war` means the same thing on both sides; a fired transition draws its new status from the status mix observed at as-of.

**A covariate that was selecting on the outcome.** `transit_gdp_growth_mean` is dropped and recorded under `rejected:`. Requiring it dropped 168 of 3,143 corridor-years and those 168 carried **5 of the 37 transitions** (2.98% against 1.08% in the rows it kept), because Maddison's holes are the war years and this layer's transitions are the war years. One of the five was Burma Road 1940 — a falsifier this package was written around, which the covariate was removing from the sample rather than missing. On the same rows it is worth in-sample AUC 0.848 → 0.870; the 0.870-against-0.813 gap on the full sample is mostly that selection.

**Coverage.** `chokepoint` and `corridor` are scored on 1869–1945 only. The hand layer is complete where the refine loop has been and demonstrably not after: the Bosphorus record closes in 1939 and never reopens, Kiel is `open/GBR` in 1945 and never returns to German control. The templates are still fitted on the whole record, so the published full-sample fit carries a post-1945 base rate biased low — the backtest rows at as-of ≤ 1940 are refit on labels ≤ as-of and do not.

**The falsifiers** (`node scripts/analysis/corridor-fit.mjs`). Panama 1915 (landslides, no war): p = 0.0171, 24th percentile — the base rate, exactly the failure the package predicted of an all-conflict covariate set; dropping it moves `adjacent_war` +2.38 → +2.44 and AUC 0.774 → 0.780, so it is residual and not distortion. Burma Road 1940 (a diplomatic closure): p = 0.0407, 84th percentile — ranked high for a reason the case denies, because `transit_at_war_any` fires on the Sino-Japanese war and not on anything happening to the road. Berlin–Baghdad 1896 (the concession): p = 0.0059, 50th percentile, a clean miss — the model has a term for a great-power sponsor *holding* a corridor and none for one *starting* it; its 1914 and 1940 rows are hits at the 92nd percentile. With two binary covariates the corridor model takes exactly four values (0.0606 / 0.0407 / 0.0056 / 0.0037), which is the honest statement of its resolution. And the layer surfaced a fourth case on its own: **Malacca 1942 is a structural miss** — none of MYS, IDN, SGP is in the international system before 1949 and the record has no controller, so the covariate is null and the model cannot reach it. That is the actor universe, not the covariate set.

**The dampener is measured and not promoted.** `corridor_stake` — log1p of the load-bearing weight third parties carry on infrastructure running through either side of the pair, counted only where the third party holds a defence pact with one of the two — is registered as a candidate on both dyadic templates. Holdout ablation: `mid_force` AUC 0.861 → 0.861 at −0.04, `mid_war` 0.848 → 0.850 at −0.13. Backtest off → on (`CORRIDOR_DAMPENER=1`): 1910–1940 `mid_force` Brier 0.03985 → 0.03994 and `mid_war` 0.02902 → 0.02918; 1950–2000 0.00666 → 0.00670 and 0.00205 → 0.00211. The test asked for an improvement in both windows and got a small loss in all four. The sign is right; the term is zero for almost every pair-year, because a defence-pact tie between a corridor's dependent third party and one of the states it runs through is rare in the pre-1946 alliance graph.

**Published run** (`--from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`), before → after: `mid_force` 0.78 · +0.084 · 0.766 → **0.78 · +0.081 · 0.766**, `mid_war` 0.79 · −0.009 · 0.768 → **0.81 · −0.013 · 0.771**, with two new rows, `chokepoint_status` n=36 exp/obs 0.97 skill +0.111 AUC 0.740 and `corridor_status` n=83 exp/obs 1.09 skill +0.076 AUC 0.675. The dyadic templates gained no covariate, so that movement is the random stream — the corridor draws consume random numbers after the dyad loop every step. Checked and not asserted: `ENGINE_ABLATE=corridor_layer` reproduces the pre-turn numbers exactly, 0.775 · +0.084 · 0.766 and 0.794 · −0.009 · 0.768.

**Escalated from this turn.** (a) The corridor model needs covariates it does not have: a status term (a closed corridor reopens on a different hazard than an open one closes), a sponsor-*starting* term, and `guarantor_presence` from `operator/presence`, which was queued behind exactly this unit. (b) The record layer stops being complete in 1945; extending the 47 records' histories moves `COVERAGE` and makes the post-1945 half of the fit honest. (c) Malacca 1942 says a corridor needs a transit *entity* that is not a sovereign actor — a colony's metropole, which `controller` only half supplies. (d) Control transfer is scored but not simulated: the engine moves a record's status and never its controller, so the competing-risks model over claimants in `docs/schema.md` is now the missing half of a layer that is otherwise live.

## Implement era-1870-1914 / data-6 — 2026-09-07

Approved with `era-1914-1945 / engine-4b`, with the operator's design fixed in the note: empire `gdp_pc` as successor-state sums from `data/raw/hist/maddison.csv`, with the constituent sets recorded per empire in `data/history/actors.yaml`.

**What changed.** `data/history/actors.yaml` gains `derived_series` — a window, a `min_gdp_coverage`, a `source`, and `parts` of `{ pop, gdp, share, from, to, note }`. `scripts/build-panel.mjs` builds the two series from it before anything derived from them is computed: `population` is the share-weighted sum of the parts' OWID series, `gdp_pc` the population-weighted mean of the parts' Maddison series over the parts that have one, emitted only where those cover half the derived population. A part's `gdp` code may differ from its `pop` code — that is how Bohemia and Slovakia borrow `OWID_CZS`, the South Slav crown lands `OWID_YGS`, and Palestine the Syrian series. `data/history/population_guard.yaml` is new and holds the declared exemptions for the build guard.

**Eight actors declare a set.** Austria-Hungary, the Ottoman Empire and Russia are the empires the package names; Sweden-Norway, the United Kingdom of the Netherlands and Denmark-with-the-duchies are the same problem in a union; Greece (the 1832 kingdom) and Romania (the Old Kingdom) are the same machinery run the other way, for a predecessor **smaller** than its own modern borders. The shares partition — the Habsburg set claims 0.44 of modern Romania and the Ottoman set 0.56, the Ottoman set 0.65/0.52 of modern Greece and the Greek kingdom 0.35/0.48 — so no territory is counted twice or dropped between two rows.

**Maddison is benchmark years, so the parts are interpolated.** Log-linear between a part's own observed years, never extrapolated, never across a gap over 60 years. This is what makes the test reachable at all: Turkey has two observations in 1870–1914 and every Arab successor has one, so no sum of raw benchmark values can give the Ottoman Empire 30 non-null years. It is flagged rather than hidden — `gdp_pc_interp` carries the share of the year's gdp weight that came from an interpolation (Ottoman 1900 = 0.83, Austria-Hungary 1900 = 0), and a year at 1 has no annual observation behind it, so its `gdp_growth` is a fill and not a measurement. `gdp_pc_derived` and `population_derived` mark the 531 and 592 actor-years this block wrote.

**The guard is now a build failure.** `|log(population/tpop)| > 0.3` on a live actor-year means the row has joined two states. Undeclared → `process.exit(1)` with the list. 757 of 11,854 rows were violating and being reported; there are now **0 undeclared** over 12,094. What is left is declared with a reason: three resolutions (the Papal States, whose id's OWID series is Vatican City; Pakistan 1947–70, where NMC counts both wings; Haiti 2001, where NMC's tpop jumps 8,222 → 82,248 thousand — a misplaced decimal) and 404 actor-years across 24 actors kept as declared disagreements, because CoW NMC and HYDE are two independent estimates for a state with no census and neither is demonstrably wrong. Two of those are actor-definition problems and are escalated as such rather than excused: **VNM** 1954–75 is CoW 816 (the DRV, 19.94M) for capabilities and whole Vietnam (46.48M) for every OWID-coded series in the same row, and **SRB** 1996–2001 is FR Yugoslavia against Serbia-without-Montenegro-and-Kosovo.

**Test result.** `AUT_HUN.population[1870]` 35.22M (NMC 35.7M; 50.4M in 1913 against the 1910 census's 51.4M) and its `gdp_pc` 2,970 → 1,733, −0.54 in logs. `OTTOMAN.population[1870]` 32.00M (NMC 33.7M), and `gdp_pc` non-null 45 of 45 years 1870–1914 against 2 before. Russia's `gdp_pc` in 1870 goes 789 → 1,599: the modern-Russia series replaced by the empire-wide one, which is what the Maddison USSR entity is (it is exactly the sum of the 15 union republics, so the empire is written as that entity minus the not-yet-conquered and already-lost parts, plus Finland and Congress Poland).

**The era rows did not move, and that is the finding.** Every `byAsOf` row at as-of 1870–1900 is identical to the digit before and after; at 1910 nothing scored moves either: `democratization_onset` (`status: monitored`, out of pooled either way) drops out of the row rather than appearing with `n: 0`, and `democratize_step`'s unfitted sample grows n 261 → 271 — both stay `n: 0`, under the event minimum. The only templates fitted before 1900 are the two dyadic ones and they carry `cinc`, not `gdp_pc`; the regime ladder's window opens in 1900 and its first fittable as-of year is 1920. So this package removes a covariate error — an empire entering every actor-year template at its richest province's income, or with none at all — that is not yet **scorable**, and will not be until a regime or conflict template reaches behind 1900. Pooled 1870–2010 after: `mid_force` 0.78 · +0.085 · 0.767, `mid_war` 0.80 · −0.008 · 0.770, `intrastate_onset` 1.02 · +0.113 · 0.738, `democratize_step` 0.95 · −0.189 · 0.548, `autocratic_closure` 0.65 · −0.143 · 0.602, `coup_attempt` 0.89 · +0.177 · 0.758, `chokepoint_status` 0.96 · +0.140 · 0.759, `corridor_status` 1.13 · +0.062 · 0.664. The rows that moved are 1920 onward, where the changed inputs are the guard's three resolutions and two entity-window boundaries (the USSR series now ends 1991 and the Yugoslav one 1992, because the panel introduces the successor actors in those years and NMC's code is already the rump state).

**Escalated from this turn.** (a) The empire series is unscorable until a template reaches pre-1900 — the regime ladder's 1900 window and V-Dem's start are the binding constraint, not the covariates. (b) VNM and SRB need to be split into the entities their own series describe. (c) Prussia is still joined to modern Germany: CoW's tpop for it is the North German Confederation from 1867 (16.6M in 1850 → 31.2M in 1870) and a constituent set for that needs dated shares of Germany, Poland and Russia. (d) 404 actor-years of NMC-vs-HYDE population disagreement are declared and unresolved; a third source (Gapminder's own documentation, or the Correlates of War replication notes) would settle several of them.

## Check era-1870-1914 / data-6 — 2026-09-07

Independent re-verification of `8ab6cc0`. The package's test passes on a clean rebuild: `AUT_HUN.population[1870]` 35.22M (NMC tpop 35.74M), `OTTOMAN.population[1870]` 32.00M (NMC 33.73M), `OTTOMAN.gdp_pc` 45/45 years 1870–1914 against 2 before, and `build-panel.mjs` exits 0 with 0 undeclared guard violations. Every number in the implementer's report reproduces, and re-running `backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all` (112s) reproduces the committed score file to the digit. No pooled skill or AUC falls by more than 0.03 on any template: the largest moves are `democratize_step` −0.016 skill and `corridor_status` −0.015, both inside run-to-run noise, and `chokepoint_status` gains +0.029. Rules hold: the commit touches neither `data/templates.yaml` nor `src/engine/`, so the feature constructions are untouched and still identical branch for branch (`cat`, `z`, `log` with the same 1e-3 epsilon and shared `fit.stats` centering, `win5`/`lag1`/binary); every `derived_series` carries a `source`, every share that is a judgement is marked `estimate`, and all 27 guard declarations carry both `reason` and `source`. The constituent sets partition rather than overlap on the successors they share (Habsburg 0.44 + Ottoman 0.56 of Romania; Greek 0.35/0.48 + Ottoman 0.65/0.52 of Greece).

**Two defects found and fixed in this commit.** (1) The guard collapsed multiple declarations for one id to the *last* `prefer`, so Haiti's 2001 resolution never fired and the panel kept NMC's misplaced decimal — `tpop` 82,248 thousand against 8,222 the year before. The loop now carries a `prefer` per declaration rather than per actor; that one row is the only panel cell that changes, the guard's counts become 12,094 / 404 / 227, and no score moves. (2) `public/forecast.json` was committed as a 3-run, 5-year smoke artifact swept in by `git add -A`, with `public/forecasts.json` recording it as the published 2025 ensemble; regenerated at the script's 500 × 40y defaults on the new fits.

**Not fixed, noted.** The constituent sets double-count two small overlaps at handover years: Bosnia-Herzegovina sits in both the Ottoman and Habsburg sets in 1878 (occupied in July, Ottoman *de jure* until 1908), and modern Greece's 0.35 share is in both the Ottoman set and Greece's own in 1828–29, during the war of independence. Both are one or two years and under 1.5M people, both stay inside the 30% guard, and neither is reachable by a fitted template before 1900 — but a later package that moves a template behind 1900 should date them to one owner.

## Implement operator / modern-fold — 2026-09-07

Approved with the note "adds columns only; must leave the 1870–2010 backtest numbers unchanged". The 2000–2025 measured layer lived only in `public/world.json`, an artefact the engine and the refine loop never see; it is now on the panel clock.

**What changed.** New `scripts/lib/modern.mjs` — the World Bank, UN WPP, OWID-energy and IEA-EV fetchers, the transforms, and the ordinal encodings for the modern snapshot — read by both `scripts/build-panel.mjs` (which writes the columns) and `scripts/build-world.mjs` (which now reads a series' *history from the panel* and touches the raw files only for years past 2025). The fold is registry-driven: 27 series columns from every `data/variables.yaml` variable with `source: { fetch: … }`, 2000–2025, plus 37 snapshot columns at 2025 from the modern actor record (19 `cap_*`, 5 `chokepoint_*`, `nuclear_status`, `nuclear_warheads`, `regime_type`, `personalism`, `succession`, 8 hand estimate maps). `data/panel.json` gains `meta.vars` — per column: source, `introduced`, `last`, actor-years, actors — and `meta.introduced`, which `src/engine/core.js` uses to skip the carry-forward scan below a column's first year.

**The guard is in the build, not in a promise.** A variable whose id already names a panel column throws with the instruction to declare `panel: <column>`. UN WPP population therefore lands in `population_wpp`: the panel's `population` is a fitted covariate on `intrastate_onset` (window to 2024) and filling its 2024–25 nulls from another source would have added scored rows to the very backtest this package must not move. Nothing is carried forward either — a source that ends in 2023 leaves 2024–25 null, and the engine's own last-observation carry-forward (with `stale` recorded) is what makes `createWorld(2025)` see it.

**Test result.** 68 → 132 columns, 12.0 → 19.0 MB. In 2025: `population_wpp`/`fertility`/`working_age_share`/`old_age_share`/`median_age`/`net_migration` 195 actors each, `electricity_generation`/`renewables_share_elec` 89, `oil_twh` 78, `cap_logic`/`nuclear_status`/`regime_type` 44. `ev_share` is **0 in 2025 and 46 in 2024** — the IEA file ends in 2024, as do the World Bank series (`gdp_ppp` 183 in 2024) — so the package's literal "non-null in 2025" is met by every source that runs to 2025 and by no source that stops in 2024. The engine half passes outright: `createWorld(2025)` exposes all of them on `a.cur` (59 modelled actors: `population_wpp` 59, `oil_twh` 52, `gdp_ppp` 57, `ev_share` 39, `cap_logic` 44), with `a.stale` = 1 on exactly the columns whose source ended a year early.

**Nothing moved.** `data/fits.json` byte-identical; the 1870–2010 backtest score file identical to the digit before and after (100 runs, universe all), and 2,711,940 cells across the 12,914 pre-existing actor-columns compare equal. `public/world.json`: 2,549 of 2,569 actor-variable `v0` identical; the 20 that moved are all in the two variables that declare a `region_median` fallback (`gov_debt_gdp`, `ev_share`), where an actor whose only observation predates 2000 now takes the fallback rather than showing a 1990-vintage number as current. Cost: the full backtest goes 105s → 122s.

**For the next package.** (a) The modern columns are *available* and *unused* — no template names one yet. The obvious first candidates are `working_age_share`, `fertility` and `median_age` on the regime ladder post-1950, and `milex_gdp` on `mid_force` (7,892 actor-years, 1960–2024). (b) Two of the modern columns are second measurements of a historical one and should be reconciled before either is fitted: `population_wpp` vs `population` (WPP against OWID/HYDE), and `oil_demand`/`gas_demand`/`coal_demand` (OWID country file) vs `oil_twh`/`coal_twh` (OWID by-source file). (c) `scripts/build-history-slice.mjs` still lists 15 hand-picked variables; the map could offer any of the 64 new ones now. (d) The World Bank pull (`scripts/fetch-wb.mjs`) has 26 indicators on disk of which the registry declares 20 — `gdp_mer` and `age65_share` are fetched and unregistered, so they are not folded.

## Baseline 2026-09-07 (first) — after the escalation packages

Superseded by [Baseline 2026-09-07](#baseline-2026-09-07) at the foot of this file; kept because the turns above are measured against it. The re-baseline after the approved escalation packages of 2026-09-07 (`statistics-4` rolling-origin refit, `engine-6` rivalry decay, `engine-7` war nesting, `statistics-6` pre-1946 era term, the corridor layer, `era-1870-1914/data-6` empire series, `operator/modern-fold`; the coalition and war-duration halves ship as candidates, switched off). Produced with:

```
node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs
node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all
node scripts/run-forward.mjs --runs 300 --horizon 40; node scripts/build-history-slice.mjs; node scripts/build-news.mjs; node scripts/build-world.mjs
```

`scores/backtest-1870-2010-h20-all.json`: 15 as-of years, 80 scored rows, **0 leaky**, 45 rows reported with no fit at their as-of year and excluded from `pooled`, 0 underpowered, 121 s.

### Pooled across as-of years

`exp/obs` is expected over observed count; `skill` is Brier skill against the sample base rate; `AUC@risk` is over the units the model can put mass on (`p > 0`), which is what the fitted coefficients actually rank — the backtest reports it **per as-of row, not pooled**, so the column is the `n_at_risk`-weighted mean of the per-as-of values that entered `pooled`.

| template | n | exp | obs | exp/obs | Brier | base | skill | AUC | AUC@risk | n_at_risk | as-of years pooled |
|---|---|---|---|---|---|---|---|---|---|---|---|
| coup_attempt | 1105 | 255.6 | 287 | 0.89 | 0.158 | 0.192 | +0.18 | 0.76 | 0.74 | 712 | 1960–2010 |
| chokepoint_status | 36 | 16.2 | 17 | 0.96 | 0.214 | 0.249 | +0.14 | 0.76 | 0.85 | 28 | 1910–1940 |
| intrastate_onset | 1241 | 395.1 | 387 | 1.02 | 0.190 | 0.215 | +0.11 | 0.74 | 0.77 | 1101 | 1950–2010 |
| mid_force | 108797 | 1093.4 | 1407 | 0.78 | 0.0117 | 0.0128 | +0.08 | 0.77 | 0.79 | 6165 | 1900–2000 |
| corridor_status | 83 | 25.9 | 23 | 1.13 | 0.188 | 0.200 | +0.06 | 0.66 | 0.66 | 83 | 1910–1940 |
| mid_war | 108797 | 525.0 | 655 | 0.80 | 0.0060 | 0.0060 | −0.01 | 0.77 | 0.72 | 5078 | 1900–2000 |
| democratic_deepening | 169 | 42.0 | 28 | 1.50 | 0.148 | 0.138 | −0.07 | 0.70 | 0.64 | 142 | 1970–2010 |
| autocratic_closure | 696 | 209.6 | 320 | 0.65 | 0.284 | 0.248 | −0.14 | 0.60 | 0.64 | 635 | 1920–2010 |
| democratize_step | 942 | 476.8 | 500 | 0.95 | 0.296 | 0.249 | −0.19 | 0.55 | 0.51 | 876 | 1920–2010 |
| irregular_exit | 1105 | 401.4 | 196 | 2.05 | 0.215 | 0.146 | −0.47 | 0.70 | 0.76 | 845 | 1960–2010 |
| leader_exit | 1105 | 793.7 | 928 | 0.86 | 0.246 | 0.135 | −0.83 | 0.74 | 0.79 | 846 | 1960–2010 |

`liberal_erosion` is in no row of the table: it has fewer than the minimum training events at **every** as-of year in the window (n=1826, events=3 in years ≤ 2010), so the refit reports `no fit at as-of` at all twelve as-of years where its truth window is open (1900–2010) and the template is out of `pooled` entirely. The 45 no-fit rows are: `mid_force`/`mid_war` 1870–1890; `chokepoint_status`/`corridor_status` 1870–1900; `democratize_step`, `autocratize_step`, `autocratization_onset`, `autocratic_closure` 1900–1910; `democratization_onset` 1900; `democratic_deepening` 1900–1960; `liberal_erosion` 1900–2010; `leader_exit`, `irregular_exit`, `coup_attempt` 1950.

### Reading it honestly

- **These are not new numbers.** The run reproduces `scores/backtest-1870-2010-h20-all.json` as committed at `bf570a2` in every field except `meta.run` and the per-as-of `ms`, and `data/panel.json`, `data/events.json` and `data/fits.json` rebuild byte-for-byte except `meta.built`. The baseline's value is that the whole chain was rebuilt from source and landed on the same digits, not that anything improved.
- **The two tables that stood at the top of this file when this section was written are not comparable, and the difference is not attributable to any one change.** The old one was fitted on the full sample — the coefficients had seen the years being scored — but it also predates the actor-universe corrections, the engine rewrites and the corridor unit. The one clean piece of evidence available is the `--no-refit` companion run of 2026-09-07 05:53 (`scores/backtest-1870-2010-h20-all-norefit.json`, itself taken before the last two packages): with full-sample leaky coefficients on otherwise current code, `leader_exit` scores −0.68 and `mid_force` +0.09. So the refit costs `leader_exit` about 0.15 of skill and `mid_force` about 0.01 — it is **not** what turned +0.10 into −0.83. That gap belongs to the model changes between 2026-09-06 and today, and no run in `scores/` isolates them.
- **Two exit templates are badly miscalibrated and say so.** `leader_exit` (skill −0.83) puts near-certainty on exits in the top four calibration bins (95→85, 98→95, 100→98) and near-zero in the bottom bin where 71% of units exit — the hazard is far too steep in tenure. `irregular_exit` over-predicts 2.05×. Both still rank at AUC 0.70–0.74, so the ordering is real and the level is wrong; a base-rate intercept refit is the obvious next package.
- **`mid_force`/`mid_war` under-predict at 0.78/0.80, and 43% of the observed dyads are structural misses** — 607 of 1407 and 280 of 655 units that fought were given `p = 0` by the relevance filter, at every as-of year and not only the early ones (the worst are 1930 and 1940, 105/261 and 128/239). The pooled AUC of 0.77 is measured over a sample where nearly half the positives could never be ranked.
- **The dyadic templates have no row at all at as-of 2010**, and neither is reported: CoW MID 5.0 ends in 2001, so `backtest.mjs:101` skips the template before it can emit a reason. The pooled dyadic numbers are 1900–2000, and 1990/2000 are scored over 11 and 1 truth-years respectively rather than 20. That silent skip is the one thing in this baseline that the log's own rule — a template that cannot be scored is reported, not dropped — says should be a row.
- **The corridor layer is in the baseline table for the first time**: `chokepoint_status` +0.14 / AUC@risk 0.85 on 36 pooled units, `corridor_status` +0.06 on 83. Both are small-n, and both are confined to the 1910–1940 as-of years — earlier there are too few prior events to fit, and their truth windows close in 1945.
- **`public/forecast.json` is now 300 runs × 40y**, per this baseline's command list; the copy committed at `07d7dbf` was 500 runs. `public/scores.json` was not rebuilt — it was generated from the identical previous run of the same backtest file, so its numbers already match this baseline.

## Cleanup (phase 1) — 2026-09-07

After baseline `e843248`. Removed or demoted without changing any fitted number: `data/variables.yaml` lost its scenario latents and gained `model: false` on 29 display-only estimates (enforced by `build-world.mjs`: no template may read one); `data/templates.yaml` now has a `retired:` list holding the two ERT episode templates, `autocratize_step` and `sovereign_default` (13 active templates; `fit-hazards` and `backtest` load `templates:` only); the conflict field is relabelled *belligerents* until UCDP GED gives battle locations; implementation one-offs moved to `scripts/analysis/`; `scripts/shot.mjs` removed. Verification: `fit-hazards` + the 1870–2010 baseline backtest rerun — pooled skill and AUC identical to the committed baseline for every template.

## Implement operator/modern-capability (package 10) — 2026-09-07

Capability stopped in 2001 and was carried forward for 25 years; the viewer showed the carried value as if it were current. Three changes.

**CoW NMC 7.0 (1816–2022) replaces 3.02.** correlatesofwar.org answers 403 to scripts and Harvard Dataverse holds only 3.02, so the fetch reads the `cow_nmc` data.frame from the R package *peacesciencer* — its documentation names it NMC v7.0, six years past the 6.0 the package asked for. `scripts/lib/rdata.mjs` decodes R's XDR serialization directly (no R at build time) and throws on any type it does not handle. This is a revision of the whole series, not only an extension: 12,867 of 13,020 shared CINC values changed, 1,491 by more than 5%. `coup_attempt` gains 3,093 actor-years and 38 events; its in-sample AUC goes 0.814 → 0.849.

**A five-indicator composite covers 2023–2024** (`scripts/lib/capability.mjs`), built the way CINC is built — mean of share-of-system indicators — from WDI milex, GDP PPP, OWID primary energy, WDI population and urban population, spliced onto CINC per actor over their last ten overlap years and renormalised to CINC's own 2022 mass. Two departures are declared in the code and printed by the diagnostic: GDP PPP stands in for iron and steel, and **military personnel is not represented** — no open annual source, and the World Bank series was unreachable. `cinc_spliced` marks which years are which. 2025 has no source and is left null rather than extrapolated.

**Staleness is now complete.** `buildActorState` recorded `stale[var]` for carried values but not for the event flags it resets to zero or the `gdp_growth` it imputes; 519 values in the 2025 world had no entry. It now records all of them plus a parallel `carry[var]` ∈ {`last`, `aged`, `zero`, `trailing_mean`}, so "in `stale`" means exactly "not a measurement of this year". `world.json` gains `vars[].stale`, `history.json` gains `last_observed`.

Test: composite vs CINC 1990–2016 **r = 0.961** (log r 0.981, n = 5,021), against a CINC that excludes the spliced years so it is never compared with itself; **no `cinc` older than 5 years** in the 2025 world (max 3); **0** unlabelled carried values. The 1990/2000 dyadic rows are unchanged to three places — and that is the point worth recording: MID coverage ends in 2001, so the backtest cannot score the thing this package fixes. Pooled skill and AUC move by less than 0.006 everywhere except the two corridor templates (n=36 and n=83, truth window 1869–1945, reached only through the simulated war process), whose whole pooled move is one nine-unit as-of-1910 row.

Six population-guard declarations were added for NMC 7.0's own data: FSM 2002–2016 (a 500-thousand block between its own 117 and 109 — an error), ERI and GNQ (existing no-census disputes extended), and three pre-2002 revisions (PAN 1903–1913, CYP 2001, AFG 1919).


## Implement operator/derived-polarity (package 9) — 2026-09-07

The era terms were typed calendar years — `bipolar` 1947–1991, `unipolar_us` 1992–2016, `cold_war` ≤ 1991, `anticoup_norm` ≥ 2000 — so `great_game` and `aid_conditionality`, the two promoted external-influence mechanisms, were switched off forever past the last typed year. A forecast that cannot re-enter a bipolar world cannot use a mechanism fitted on one.

`src/engine/polarity.js` now computes the world state, and `scripts/build-panel.mjs` and `src/engine/core.js` both import it. An actor's projection-weighted capability share is the geometric mean of its CINC share and its military-expenditure share, EWMA-smoothed (λ = 0.75); the poles are the actors above the first ≥ 2× gap in the ranked shares; one pole is unipolar, two bipolar, more multipolar. `cold_war` = bipolar, `promotion_era` = unipolar under a hegemon scoring regime ≥ 2, `anticoup_norm` = a democratic majority of live states, `hegemon_regime` = the top pole's own regime. The typed versions are kept one run as `*_dates` for the checker to diff. Forward, capability share is carried by each actor's simulated growth, so polarity can change inside a run — which is the whole point.

Told nothing about any date, the flags find: multipolar to 1945, unipolar 1946–48, bipolar **1950–1994**, unipolar **1995–2014**, bipolar 2015–2024 with a different second pole; every one of the 69 years 1870–1938 multipolar; the anti-coup norm 2001–2023 and off again in 2024. Against the package's tolerances (1947–1991 ± 3, 1992–2016 ± 5) the worst end is off by 3. Six states in 210 years.

Two things the test surfaced:
- **Capability shares alone will not do it.** On CINC alone the same rule reads 1999–2007 bipolar and 2008–2024 multipolar with the wrong pole leading — CINC is four parts latent mass to two parts military. Military expenditure alone gets the post-war eras right and 10 of the interwar years wrong. The geometric mean of the two is what reproduces all three eras, and the three thresholds are a sharp optimum: the sensitivity table in `docs/escalations.md` is the width of the claim.
- **The information wave costs coup calibration.** Replacing the diffusion rate switched by hand at 1985 with a fitted frontier (logistic on the panel's own live-actor mean) plus a fitted gap-closing rate κ = 0.295 scores better on diffusion (rmse 0.0795 against the typed switch's 0.0822, and it holds at the panel's floor in a 19th-century run where the typed rate drifts), but it diffuses faster in the 1970s–90s, `info_access` carries −0.45 on coup odds, and `coup_attempt` exp/obs falls 0.90 → 0.74. `INFO_DIFFUSION=switch` is the ablation that separates the two halves and it is what the third column of the score table is.

Pooled backtest 1870–2010: no template's skill falls by more than the package's 0.02 (worst `democratize_step` −0.015, `irregular_exit` +0.022). The regime templates lose AUC (`democratic_deepening` 0.706 → 0.681 on 29 events, `democratize_step` 0.546 → 0.530, `autocratic_closure` 0.597 → 0.584) as `aid_conditionality` moves from a 25-year typed window to a 20-year derived one. Every promoted era coefficient keeps its sign and most of its size: `great_game` +0.67 → +0.60 on coups, `aid_conditionality` +0.83 → +0.68 on democratization. The mechanisms were not artefacts of the dates.

The 2026 forecast is the first this model has published with the promotion era **off**: the 2025 world is bipolar, the hegemon scores regime 2, and the democratic share of live states is 0.491 — just under the majority the anti-coup norm needs. Forty runs keep it bipolar through 2055; the lead passes to the second pole between 2040 and 2045.

### Check — 2026-09-07

Rules, build and scores verified independently. One fix applied: `initPolarity` in `src/engine/core.js` carried `pol_mass`/`pol_share` back up to 30 years like an actor attribute, but a capability *share* only means something inside the year whose distribution it was normalised over. At as-of 1950 that resurrected a live-but-unmeasured actor's 1945 share (0.207) as the second-ranked pole, and the engine ran as-of 1950–1954 multipolar against a panel — and a fit — that call those years bipolar, with `cold_war` and `great_game` off through the simulated window. The two columns now carry only past their column's last measured year. Engine world state now equals the panel's at all 196 classified years; scores move by ≤ 0.002 anywhere, both committed backtest files regenerated, forward run and published slices unchanged.

## Implement operator/presence (package 7) — 2026-09-07

Military presence — bases, garrisons, fleet stations and advisor missions — was in `data/presence.yaml` and on the map, and nowhere in the model. It is now a layer with one construction: `src/engine/presence.js`, imported by `build-panel.mjs`, `scripts/lib/fit.mjs` and `src/engine/core.js`, so the sample the coefficients are estimated on and the state the hazard is drawn from are the same object. Nine panel columns (`presence_<POWER>` for the six powers with ≥ 5 distinct land hosts, `presence_any`, `presence_change`, `troops_usa_host`), two dyad features (`patron_presence`, `patron_presence_rival`) and two record-year features (`guarantor_presence`, `guarantor_withdrawal`) — all measured, one promoted.

**The hand-coded levels are not arbitrary.** Against Troopdata's measured US deployments (1950–2024, 11,546 actor-years) the 0–3 ordinal is strictly monotone at roughly an order of magnitude a level: median 10, 898, 6,518, 45,501 troops.

**One promotion: `guarantor_withdrawal` on `chokepoint_status` and `corridor_status`** — the guarantor's weight around a record fell inside the last three years. Holdout AUC 0.501 → 0.624 at the chokepoint split the package asks for (1970) and 0.683 → 0.774 on corridors at 1946; Brier flat to 0.0003 worse everywhere, which is what the term is: discrimination, not calibration, on a base model that already over-predicts. It loses AUC at two of the five chokepoint splits and that is in the lifecycle record.

**Two things the test surfaced.**

- **The package's own definition of the term does not fire on the package's own falsifier.** "Max great-power fleet/base level within ~1,500 km" is a maximum over a 1–3 ordinal, and it saturates: 81 of the 90 chokepoint-years of the 1940s–60s sit at 3 and never move. At the canal in 1956 the garrison on the record's own transit state leaves and a fleet 1,400 km away does not, so the maximum is unchanged and the closure is a miss. The term is now the per-power *sum* of station levels around the record — the weight of force, which is the quantity a withdrawal actually moves — and 1956 fires (10 → 7). The max version's numbers are kept in `data/templates.yaml`; it is better on chokepoints at every split and worse on corridors at both, which on 37 events each is exactly the kind of coin-flip that argues for choosing the construction on the mechanism and not on the score.
- **The dyadic patron term has the wrong sign on wars.** `patron_presence` (a level-≥2 station of a power allied to one side and not the other) fits at −0.17 on disputes and **+0.20 on wars**, against a prior of −0.3 for tripwire deterrence. It is on 18% of politically relevant dyad-years and nearly collinear with `allied` and `major_power_any`; what survives is a Cold-War-bloc marker, and blocs fight. The second form the package asked to test, `patron_presence_rival`, has the predicted sign on both templates (+0.42, +0.54) and no AUC on either. Both are undirected terms describing a directed fact, and the honest re-proposal is a directed dyad sample.

**What the backtest could not say.** Pooled 1870–2010 moves by ≤ 0.005 of skill on the two templates the promotion touches and by stream noise everywhere else. The reason is measured, not guessed: the record layer's ground-truth window ends at 1945 (`COVERAGE`), and `guarantor_withdrawal` is on 26 of 620 pre-1946 chokepoint-years carrying 2 of 29 transitions, against 179 of 720 carrying 5 of 10 after it. The corridor half is better placed (105 of 1,114 pre-1946 rows, 9 of 31 transitions) and that is where the holdout gain comes from. Until the corridor histories are extended past 1945 this promotion rests on the one-year holdout and on Suez 1956, Aden 1967, Subic 1992 and Hormuz 2026 — which is stated in the lifecycle record rather than dressed up as a backtest result.

**Direction check, 2026.** The Gulf record's guarantor weight falls 13 → 12 as the fleet leaves, `guarantor_withdrawal` fires, and the annual transition hazard rises 15.37% → 18.32%. `node scripts/analysis/presence.mjs` prints all of the above.

## Implement operator/capability-waves (package 12) — 2026-09-08

Capability as a portfolio of dated technology waves instead of CoW's steel-energy-soldiers index. Approved as written. All four tests pass; the capability *substitution* the package proposed passes its own test and is rejected by the backtest, and is recorded as such rather than promoted.

**What changed.** `data/waves.yaml` 14 → 19 waves (ballistic missiles, precision strike, stealth, armed drones, hypersonics split out), each with a `mass` coefficient in [0,1] and a `mass_source`, and — for every wave introduced from 1900 — a `sovereign_source` per attainment entry, citation or `estimate`. `src/engine/waves.js` is new and holds the whole construction (displacement weight, the share, the attainment features and sample); `scripts/build-panel.mjs`, `scripts/lib/fit.mjs`, `src/engine/core.js` and `scripts/analysis/waves.mjs` all call it, so the sample fitted and the sample simulated are one object. New panel columns `industry_share` / `industry_share_carried` / `wave_share` / `wave_attained`; new template `wave_attain` (unit `actor-wave-year`, lead 1); `stepWaves` in the engine with its own random stream; `state.actors[id].wave_share|wave_attained|industry_share` in every ensemble; the viewer's Industry and Power views paint the wave share; `scripts/analysis/waves.mjs` runs tests (a), (b) and (c).

**Result.** (a) fit on the five pre-1900 waves, predict the 20th-century ones: Spearman 0.981 / 0.978 / 1.000 / 0.975 / 0.542 on aviation, radio-radar, nuclear, launch, semiconductors — 4 of 5 over the 0.6 bar, the bar was 3. (b) MID decisive outcomes, capability read the year before: wave_share AUC 0.603 against CINC 0.512 over 1900–2001 and 0.612 against 0.517 after 1945, both bars cleared. (c) polarity boundaries move 2 and 3 years against a 5-year bar. (d) the 1870–2010 backtest with the layer on by default is **identical** to the pre-package baseline on all 15 pooled template rows, and `ENGINE_ABLATE=waves` reproduces it too.

**The number that decided against the substitution.** Test (b)'s decomposition, which the package did not ask for: the raw `industry_share` alone scores **0.628** after 1945, *above* the wave portfolio built on it (0.612). The wave index beats CINC and loses to its own input, and the event backtest agrees where it matters — `WAVE_CAPABILITY=1` takes mid_force AUC 0.810 → 0.773 and mid_war 0.780 → 0.688 while improving everything that reads capability through the termination layer (record_reopen skill −0.300 → −0.102, corridor_status +0.036 → +0.085). So the mass and displacement weights are `rejected` for the dyadic ratio with all their numbers in `data/templates.yaml`, the attainment template stays because (a) passes on its own, and the wave share is published as a forecast rather than used as a decider.

**Two construction bugs found and fixed inside the turn, both about shares of partial worlds.** A share computed inside one source's coverage is a share of *that source's* world: the World Bank manufacturing series covers 19 live actors in 1960 against NMC's 107, and splicing per actor handed one of those 19 a sixth of world industry (France, 16.6% in 1960). The two-stage construction — let the covered block redistribute its own stage-1 aggregate — fixes it. And the block must carry *relative weights*, not dollar figures: WDI stops publishing US manufacturing value added after 2021 while it keeps publishing everyone else's, so the largest OECD manufacturer left the block in 2022 and its share fell 15.8% → 4.3% on a source seam, with every mass-weighted wave then reading it as a non-producer.

**One at-risk floor, declared and swept.** The wave ladder is N → I → S and no source says who is at I, so the sample is floored at 0.03% of world industrial output: 65,879 rows and 153 attainments (0.23%) against 167,506 and 175 (0.10%) with no floor. The 22 attainments below it are structural misses and `scripts/analysis/waves.mjs` prints them and the sweep over {0, 1e-4, 3e-4, 1e-3, 3e-3} that chose it.

**Deviation.** The polarity substitution is measured (test (c) passes) but not wired: `src/engine/polarity.js` writes the era flags in `scripts/build-panel.mjs` that every era-interacted coefficient was fitted on, so swapping its capability input forward-only would put the fit and the simulation on two different definitions of `cold_war`. It is escalated, not smuggled in.

## Implement operator/occupancy (package 11) — 2026-09-08

State occupancy as the forward contract, and its backtest. Approved as written, with the operator's instruction to keep the tracking free of random-number consumption so the event backtest reproduces to stream noise. It reproduces better than that: byte for byte.

**What changed.** `src/engine/core.js` — `runEnsemble` takes `state: true` beside `track`, and accumulates per year offset: per actor P(at war), P(internal conflict ≥ 1), P(≥ 2), P(occupied) and the p10/p50/p90 of two capability shares; per dyad P(at war during the year); per corridor, chokepoint and territory record the full status distribution. `stepYear` publishes `world.atWarPairs` (the spells it iterated, this year's onsets, the coalition pairs) because the spell map alone misses a war that ends in the year it is read. `scripts/run-forward.mjs` writes it as a top-level `state` block with `meta.state.vars`. `scripts/backtest.mjs` scores it per lead year and pooled with base-rate skill, plus the Spearman rank correlation of the median capability share against CoW's at k = 10 and 20, and prints the lead years where the simulated war occupancy exceeds the panel's. `scripts/build-scores-slice.mjs` and the viewer (`src/lib/data.js`, `Map.svelte`, `Panel.svelte`) carry it to the map and the Scores tab. `scripts/analysis/shot-panel.mjs` is new (screenshots below the panel's fold).

**Result.** Block: 195 actors, 620 dyads and all 157 open records at 20 runs × 40 y; `public/forecast.json` 4.07 → 5.94 MB at 300 × 100, a factor of 1.459. Event backtest: the full 1870–2010 run against a clean `git archive HEAD` checkout is **character-identical** (114,164 bytes) once `meta.run`, `ms` and the new `occupancy` blocks are dropped. Occupancy, pooled 1870–2010: `at_war` n=31,429 exp/obs 0.65 skill +0.02; `intrastate` n=23,506 1.09 / +0.19; `dyad_at_war` n=1,683,194 0.28 / +0.00; `record_impaired` n=10,621 1.58 / −0.05; `territory_unsettled` n=14,365 1.00 / +0.71; multi-class record status Brier 0.185 against a 0.579 base (+0.68), territories 0.212 against 0.597 (+0.64); capability rank ρ 0.945 / 0.891 (`cinc`, k = 10 / 20) against 0.950 / 0.936 (`pol_share`).

**What the score sees that the event score could not.** At as-of 1955 the simulated at-war occupancy exceeds the panel's at leads 2–9 and 13 (4.00% against 0.00% at k=5); at 1975 at leads 1 and 17–20; at 1990 at leads 3–5, 7, 12, 14–17, 19–20 (1.47% against 0.00% at k=16). Pooled exp/obs is *below* 1 in every window, so this is not a level error: the simulated at-war rate is flat in lead where the observed one decays. That is the supercritical-war problem stated in the units it actually lives in, and it is the guard `era-1914-1945 / engine-5` has to move.

**The one test that fails, with its number.** Package test (c) asked for Suez to carry closed/contested mass in 1956–57 and 1967–75 above its 1955–2025 mean. At as-of 1955 it carries 5.0% in 1956 and 9.5% in 1957 — the *lowest* part of the horizon — and 22.72% over 1967–75 against a 16.9% observed 1955–2025 rate, which it clears only because the mass accumulates monotonically to a ~22% plateau by lead 10. Nothing at the end of 1955 tells the hazard about July 1956. What the test does establish: over 1956–1995 the ensemble's mean impaired mass is 22.06% against the record's observed 22.5% on the same years — calibrated in level to half a point, blind in timing.

**Two floors reported as floors.** `intrastate_war` (the onset template has no intensity: the engine writes level 1 and never 2, so all its mass is spells carried in at as-of) and `occupied` (occupation is data, not a hazard) are in the block and in the score with a `note` saying so. `cinc` is the third: nothing in the engine rewrites it, so `state.actors[id].cinc` is the as-of ranking held still with a degenerate band, and `pol_share` — which `stepPolarity` does advance — is carried beside it and flagged `simulated: true`. The rank test is run on both, and the projected share ranks the world *better* at twenty years (0.936 against 0.891).

## Implement operator/termination (package 8) — 2026-09-07

Every template in this model predicted an **onset**. Nothing predicted an ending, so the engine ended things with typed constants: a war lasted exactly one year, an internal conflict a uniform draw from 1..6, a closed strait reopened only if the generic status hazard happened to fire and happened to draw `open` out of the outcome mix, and a territorial contest could not end at all because territories were not in the engine. Four fitted terminations now replace those, through one shared module — `src/engine/termination.js`, read by `scripts/lib/fit.mjs` over the panel and by `src/engine/core.js` over the simulated world.

| template | unit | n / endings | holdout AUC |
|---|---|---|---|
| `war_end` | dyadic war spell-year (CoW MID hostlev-5, merged per pair) | 1,041 / 407 | 0.612 (≥ 1946) |
| `intrastate_end` | actor-year while the UCDP flag is on | 1,550 / 249 | 0.734 (≥ 1985) |
| `record_reopen` | impaired corridor/chokepoint-year, 1869–1945 | 185 / 16 | 0.742 (≥ 1930) |
| `contest_settle` | unsettled territory-year | 1,577 / 22 | 0.646 (≥ 1946) |

The spell convention is the record layer's, not `lead: 1`: covariates are the state the year **opens** in, the label is "the spell ends during the year", and a spell's first year can be its last — which is what the engine does when a war fires and draws its own termination in the same step. A spell the source never sees end is right-censored and its last row dropped.

**Three of the four ship on. The war spell ships off, on the package's own guard.** With the fitted hazard driving war spells the 1950–2000 `mid_war` exp/obs goes 2.65 → 3.57 and `mid_force` 1.17 → 1.43 — the guard that failed in package 2 fails again, less badly. It is not a bug: over the whole 1870–2010 window the *calibration* improves (`mid_war` 0.80 → 1.10, `mid_force` 0.78 → 0.96, because the model under-predicted wars without a duration), and the spell shape it produces is right — 3.06 years mean and 36% one-year spells against the panel's 3.02 / 49% and the package's stated 3.0 / 33%, where the resampled length this replaces gave 3.91 / 24%. It is a trade, and the guard says no. `duration.status` stays `candidate`; `WAR_DURATION_ON=1` runs it and both ablation score files are committed. With it off the guard passes: 1950–2000 `mid_war` 2.65 → **2.62**.

**Four deviations, all forced by the data.**
- **`chokepoint_reopen` is `record_reopen` over both record kinds, on 1869–1945.** Chokepoints alone give 31 impaired record-years in the window where the hand layer is complete — under the fitter's own floor. On the full record they give 128, of which 86 are one record sitting closed from 1939 to 2025 because nothing ever added its post-war reopening. A hazard fitted on that reopens straits an order of magnitude too slowly, and its 9.4% base rate is a missing history, not a measurement.
- **`contest_settle` is fitted on every unsettled territory-year, not the `contested_active` ones.** The literal sample is 21 rows and 0 endings: that status exists only on live 2014–2026 records. `settled` is the only resolved status; `annexed` is a change of holder and the records show it cycling three times on one territory before it settles once.
- **Four of `war_end`'s five stated covariates fail.** The capability ratio deletes 87 of 1,041 spell-years and those rows carry **84 of the 407 endings**, because the panel nulls `cinc` for occupied actor-years and the occupied years of 1940–45 are where the war spells of 1945 end — the `transit_gdp_growth_mean` disease again. `major_power_any` costs 0.098 of holdout AUC. `joint_democracy` is the largest available gain at the wrong sign on a sample it shrinks by 73 endings. What survives is duration plus a spell-level fact the package did not ask for: whether the pair's war is inside a wider coalition.
- **The GDP shock had to be lagged.** Contemporaneous growth in the year a war ends fits at −0.66 against a prior of +0.3 with in-sample AUC 0.639 — "wars end in good years" is the recovery being dated to the year the fighting stopped. Lagging it one year flips the sign to the prior's and costs the in-sample AUC. That is what a covariate that is partly its own label looks like.

**The four named cases reproduce** (400 runs, coefficients refit on labels ≤ as-of): Suez reopens in the 1950s from as-of 1956 (40%, next 34%), in the 1970s from 1968 (54%, next 14%), Hormuz in the 1980s from 1985 (36%, next 31%), and the Iran–Iraq war ends in the 1980s from 1982 (99%). Two of the four are five- and six-point margins between adjacent decades; they fall the right way and should be read as ties, not as sharp results.

**What the backtest says.** `ENGINE_ABLATE=war_duration,intrastate_end,record_reopen,contest_settle` reproduces the committed baseline exactly on all eleven pre-existing templates, so everything below is attributable. Three new scored rows: `intrastate_end` 1.00 · +0.119 · 0.736, `record_reopen` 1.13 · +0.082 · 0.718, `contest_settle` 0.84 · +0.063 · 0.798. Two movements in the old ones, both isolated by ablation: the reopen substitution costs `chokepoint_status` 0.048 of skill and buys `corridor_status` 0.063 (on 36 and 83 rows — two records changing places), and `democratic_deepening` falls 0.052 → 0.103 of negative skill on 29 events in a way no single mechanism accounts for, which is what a 29-event sample does when the random stream moves.

**What it surfaced.** `data/territories.yaml` has the corridor layer's disease: twelve records read as live contests in 2025 and seven of them are contests history closed decades ago, because a record's history stops at its last status change and no settlement row was ever added. That is why the 2026 direction check gives 40–56% forty-year settlement probabilities to territories nobody disputes, and it biases `contest_settle`'s base rate down. The same escalation as `era-1914-1945/corridors-7 (b)`, on the other record layer.

## Baseline 2026-09-08

The re-baseline after `operator/occupancy` (package 11) and the five refinement turns committed since
[Baseline 2026-09-07](#baseline-2026-09-07): `era-1870-1914-r2`, `era-1914-1945-r2`, `era-1945-1991-r2`,
`era-1991-2026-r2` and `era-modern-2000-2025`. Package 12 (`operator/capability-waves`) is approved and **not** in
this tree — it is queued behind package 11 and nothing below reflects it. The war-spell and coalition halves still
ship **off** on their own guards; `duration` and `coalition` are both `candidate` in `meta.engine.mechanisms`.
Produced with:

```
node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs
node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all
node scripts/run-forward.mjs --runs 300 --horizon 40; node scripts/build-history-slice.mjs; node scripts/build-news.mjs; node scripts/build-world.mjs
node scripts/build-scores-slice.mjs
```

`scores/backtest-1870-2010-h20-all.json`: 15 as-of years, 240 template × as-of cells, **149 scored rows**, **0 leaky**,
8 underpowered, 91 rows with no score, 212 s of engine time.

**The event half of this baseline is not a new measurement, and the pipeline reproduces.** `data/panel.json`,
`data/events.json` and `data/fits.json` rebuilt from scratch are identical to the copies committed at `2b579aa` once
their `meta.built` stamps are dropped, and the backtest file this run produced is character-identical to the
committed one (457,440 bytes) once `meta.run` and `byAsOf[].ms` are dropped — package 11's claim (d) holding over the
whole baseline rather than the two as-of years it was first checked at. The occupancy tracking consumes no random
numbers, so **every difference between this table and the 2026-09-07 one is the five refinement turns, and none of it
is package 11.** What package 11 adds to the baseline is a second score with no "before": the occupancy block below.

### Pooled across as-of years

`exp/obs` is expected over observed count; `skill` is Brier skill against the sample base rate; `AUC@risk` is over the
units the model can put mass on (`p > 0`), which is what the fitted coefficients actually rank — the backtest reports
it **per as-of row, not pooled**, so the column is the `n_at_risk`-weighted mean of the per-as-of values that entered
`pooled`.

| template | n | exp | obs | exp/obs | Brier | base | skill | AUC | AUC@risk | n_at_risk | as-of years pooled |
|---|---|---|---|---|---|---|---|---|---|---|---|
| coup_attempt | 1103 | 259.4 | 292 | 0.89 | 0.151 | 0.195 | +0.23 | 0.79 | 0.76 | 926 | 1960–2010 |
| intrastate_onset | 1103 | 342.4 | 349 | 0.98 | 0.168 | 0.216 | +0.23 | 0.79 | 0.80 | 1002 | 1960–2010 |
| mid_force | 113394 | 1177.3 | 1440 | 0.82 | 0.0110 | 0.0125 | +0.11 | 0.81 | 0.80 | 9559 | 1870–2000 |
| intrastate_end | 1103 | 260.7 | 291 | 0.90 | 0.173 | 0.194 | +0.11 | 0.72 | 0.75 | 845 | 1960–2010 |
| contest_settle | 693 | 89.8 | 83 | 1.08 | 0.094 | 0.105 | +0.11 | 0.80 | 0.48 | 298 | 1910–2010 |
| irregular_exit | 945 | 178.0 | 138 | 1.29 | 0.119 | 0.125 | +0.05 | 0.76 | 0.74 | 762 | 1970–2010 |
| chokepoint_status | 210 | 117.7 | 101 | 1.17 | 0.240 | 0.250 | +0.04 | 0.64 | 0.64 | 210 | 1890–2010 |
| corridor_status | 317 | 142.3 | 102 | 1.39 | 0.210 | 0.218 | +0.04 | 0.66 | 0.70 | 317 | 1900–2010 |
| mid_war | 113394 | 440.9 | 614 | 0.72 | 0.0052 | 0.0054 | +0.03 | 0.78 | 0.74 | 7354 | 1870–2000 |
| interstate_onset | 89190 | 127.9 | 64 | 2.00 | 0.0008 | 0.0007 | −0.05 | 0.89 | 0.76 | 3122 | 1970–2010 |
| autocratic_closure | 1033 | 280.0 | 387 | 0.72 | 0.248 | 0.234 | −0.06 | 0.65 | 0.70 | 951 | 1870–2010 |
| democratic_deepening | 132 | 39.0 | 19 | 2.05 | 0.146 | 0.123 | −0.19 | 0.78 | 0.74 | 126 | 1990–2010 |
| democratize_step | 1241 | 491.1 | 610 | 0.81 | 0.299 | 0.250 | −0.20 | 0.54 | 0.51 | 1108 | 1870–2010 |
| record_reopen | 432 | 182.4 | 75 | 2.43 | 0.186 | 0.143 | −0.30 | 0.72 | 0.79 | 432 | 1920–2010 |
| leader_exit | 1103 | 921.1 | 930 | 0.99 | 0.177 | 0.132 | −0.34 | 0.74 | 0.80 | 1005 | 1960–2010 |

`liberal_erosion` is no longer in the backtest at all: `era-modern-2000-2025` merged its 3→2 step into
`autocratic_closure` and set it `status: monitored`, because 29 of its 31 labels fall in 2010–2025 and the fitter's
`events >= 5` gate refused it at all fifteen origins. Fifteen templates are simulated; sixteen appear in the file
(`war_end`, which is fitted and deliberately unscored — in no row by its own guard, not by its data).

**The 91 unscored cells, by reason** — 51 outside their label source's coverage, 26 with no fit at the as-of year,
14 the war-spell guard:

- *outside coverage* (the horizon opens entirely outside the ground truth, so absence is not a non-event):
  `coup_attempt`, `intrastate_onset`, `intrastate_end`, `leader_exit`, `irregular_exit`, `interstate_onset` at
  1870–1940; `mid_force`, `mid_war`, `war_end` at 2010.
- *no fit at as-of* (too few training events on labels ≤ as-of): `democratic_deepening` 1870–1960;
  `record_reopen` 1870–1910; `contest_settle` 1870–1890; `chokepoint_status`, `corridor_status` 1870–1880;
  `coup_attempt`, `intrastate_end`, `leader_exit`, `irregular_exit` 1950.
- *candidate guard*: `war_end` at all fourteen as-of years whose horizon is inside its coverage.

**The 8 underpowered rows** (scored and reported, kept out of `pooled` at EPV < 3): `corridor_status` 1890,
`contest_settle` 1900, `intrastate_onset` and `interstate_onset` 1950, `irregular_exit` and `interstate_onset` 1960,
`democratic_deepening` 1970 and 1980.

**`mid_force` and `mid_war` now say why they have no row at as-of 2010.** The complaint the last two baselines
carried — the dyadic templates vanish at 2010 and report no reason — is closed: the cell reads *"ground truth for
`mid_force` is covered only 1816–2010; the horizon opening at 2011 is entirely outside it"*. The row is still absent;
the silence is not.

### Occupancy (package 11's score), pooled 1870–2010

State each year against the panel and the dated record histories, per lead year k = 1…20 and pooled. `skill` is
against the same base rate the event scores use.

| variable | n | exp/obs | Brier | base | skill |
|---|---|---|---|---|---|
| territory_unsettled | 14365 | 1.00 | 0.0678 | 0.2373 | +0.71 |
| intrastate | 23506 | 1.09 | 0.1008 | 0.1244 | +0.19 |
| at_war | 31429 | 0.65 | 0.0432 | 0.0443 | +0.02 |
| dyad_at_war | 1683194 | 0.28 | 0.00107 | 0.00107 | +0.00 |
| intrastate_war | 23506 | 0.31 | 0.0361 | 0.0359 | −0.01 |
| record_impaired | 10621 | 1.58 | 0.0713 | 0.0680 | −0.05 |
| occupied | 31678 | 0.88 | 0.0081 | 0.0045 | −0.79 |
| record_status (7-class) | 10621 | — | 0.1847 | 0.5793 | +0.68 |
| territory_status (11-class) | 14365 | — | 0.2123 | 0.5970 | +0.64 |

Capability rank against CoW, mean Spearman over the as-of rows: `cinc` 0.945 at k=10 (15 rows, 0.81–0.99) and 0.891 at
k=20 (14 rows, 0.73–0.99); `pol_share` 0.950 and **0.936** — the projected share still ranks the world better twenty
years out than the frozen index. `intrastate_war`, `occupied` and `cinc` are floors, not forecasts, and carry a `note`
in `meta.state.vars` saying so.

**The hot-process line changed, and the change is a sample effect, not a fix.** Over the full 1870–2010 grid the
simulated at-war occupancy exceeds the panel's at **0 of 20 lead years** for both `at_war` and `dyad_at_war`, where at
the 1955–1990 origins package 11 measured it exceeding at 9, 5 and 11 lead years respectively. Pooled exp/obs is 0.65
and 0.28 — the ensemble is far *under* the panel on average once the pre-1946 origins are in, and their war-years
swamp the modern tail where the flat-in-lead problem lives. The per-lead-year rows are still in the file and still
show the shape; the pooled headline hides it. The supercritical-war guard should keep reading the 1955–1990 window.

### What moved since 2026-09-07, and what only looks like it moved

The as-of years pooled changed for eleven of the fourteen templates carried over (only `coup_attempt`,
`intrastate_end` and `leader_exit` are pooled over the same origins as before), so most row-to-row differences are a
different sample rather than a different model. The three that are real:

- **`record_reopen` +0.08 → −0.30 and exp/obs 1.13 → 2.43** is the `era-modern-2000-2025` turn extending the record
  layer's coverage past 1945: 3 as-of rows became 10, and the reopen hazard over-predicts by 2.4× on the years it had
  never been scored on. This is the largest single regression in the table and it is a measurement being taken, not a
  model getting worse — the mechanism's own turn section records it the same way.
- **`irregular_exit` −0.44 → +0.05 and `leader_exit` −0.82 → −0.34** are `era-1945-1991-r2`, which reports the same
  two numbers in its own before/after table: the leader block in the entry prior (the decolonisation cohort stops
  carrying probability 0), REIGN's `irregular` column read as log-months rather than as a flag, `lag: 1` on `regime`
  and `gdp_growth` for the whole coup family, and `irregular_exit` drawn inside `leader_exit` instead of beside it.
  `leader_exit` is still the worst-calibrated row in the table (bottom quintile 38→68, top 100→97) and, as that turn
  says, cannot go much further on this statistic: its horizon base rate is 0.84, so the reference forecaster is nearly
  perfect by answering yes. Read `expected_count / observed_count` for it, not the Brier skill.
- **`chokepoint_status` +0.07 → +0.04 and `corridor_status` +0.11 → +0.04** on samples that went 36 → 210 and
  83 → 317 pooled rows (19 chokepoint records over 13 as-of years, 50 corridor records over 12). The layer's AUC of
  0.64 / 0.66 is the honest number now that it is scored on 1946–2010 as well as before it, and it is the same
  blindness-in-timing that package 11's Suez test states in the units the map paints.

`interstate_onset` is a new pooled row (2.00 / −0.05 / 0.89 on 89,190 dyad-years, five as-of rows). It is not a row
that improved: the template did not exist at the 2026-09-07 baseline — `era-modern-2000-2025` added it (UCDP-derived
interstate onsets, `f209c4c`). It over-predicts by 2× and its skill is negative; the 0.89 AUC is ranking on a base
rate of 0.07%.

### Reading it honestly

- **Nothing in this baseline is evidence about package 11.** The event score is identical by construction; the
  occupancy block has no prior measurement to be compared against. The package's own test record (`(c)` failed) is at
  [Implement operator/occupancy](#implement-operatoroccupancy-package-11--2026-09-08) and stands.
- **`democratize_step` at −0.20 skill and 0.54 AUC is still the model's worst discriminator**, unchanged in kind since
  the first baseline: 1,241 rows, 610 events, and coefficients that rank barely better than the base rate.
- **`democratic_deepening` reads 2.05 exp/obs on 19 observed events across three as-of years.** It is the smallest
  scored sample in the table and its AUC (0.78) and skill (−0.19) should both be read as one decade of data.
- **`contest_settle`'s AUC@risk of 0.48 against a pooled AUC of 0.80** says the template's discrimination is almost
  entirely the at-risk filter and almost none of it the fitted coefficients — the ranking *within* the units it can
  put mass on is a coin flip. That is a sharper statement of the `era-1914-1945-r2 / engine-3` escalation (demote it
  to a candidate or give it covariates that discriminate) than the escalation itself has.
- **`public/scores.json` and `public/forecast.json` were both rebuilt** (`build-scores-slice.mjs` is the one command
  beyond the list the operator gave, for the same reason as last time: the published copy would otherwise be from a
  superseded baseline). `public/forecast.json` is 300 runs × 40 y and carries the `state` block.

## Baseline 2026-09-07

Superseded by [Baseline 2026-09-08](#baseline-2026-09-08) above; kept because the five `-r2` and `era-modern` turns are measured against it. The re-baseline after the operator packages implemented since [Baseline 2026-09-07 (first)](#baseline-2026-09-07-first--after-the-escalation-packages): phase-1 cleanup, `operator/modern-capability` (package 10), `operator/derived-polarity` (package 9), `operator/presence` (package 7) and `operator/termination` (package 8). The war-spell half of package 8 ships **off** on its own guard; `duration` and `coalition` are both `candidate` in `meta.engine.mechanisms`. Produced with:

```
node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs
node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all
node scripts/run-forward.mjs --runs 300 --horizon 40; node scripts/build-history-slice.mjs; node scripts/build-news.mjs; node scripts/build-world.mjs
node scripts/build-scores-slice.mjs
```

`scores/backtest-1870-2010-h20-all.json`: 15 as-of years, 98 scored rows, **0 leaky**, 0 underpowered, 143 s of engine time. 66 rows carry no scored number and are excluded from `pooled` — 52 because the refit has too few training events at that as-of year, and 14 `war_end` rows that report the candidate guard instead (`the war-spell mechanism is a candidate … run with WAR_DURATION_ON=1`).

### Pooled across as-of years

`exp/obs` is expected over observed count; `skill` is Brier skill against the sample base rate; `AUC@risk` is over the units the model can put mass on (`p > 0`), which is what the fitted coefficients actually rank — the backtest reports it **per as-of row, not pooled**, so the column is the `n_at_risk`-weighted mean of the per-as-of values that entered `pooled`.

| template | n | exp | obs | exp/obs | Brier | base | skill | AUC | AUC@risk | n_at_risk | as-of years pooled |
|---|---|---|---|---|---|---|---|---|---|---|---|
| coup_attempt | 1105 | 214.1 | 287 | 0.75 | 0.159 | 0.192 | +0.17 | 0.75 | 0.72 | 736 | 1960–2010 |
| intrastate_onset | 1241 | 405.9 | 387 | 1.05 | 0.188 | 0.215 | +0.12 | 0.75 | 0.77 | 1102 | 1950–2010 |
| intrastate_end | 1105 | 289.1 | 290 | 1.00 | 0.171 | 0.194 | +0.12 | 0.74 | 0.77 | 819 | 1960–2010 |
| corridor_status | 83 | 24.1 | 23 | 1.05 | 0.179 | 0.200 | +0.11 | 0.70 | 0.69 | 80 | 1910–1940 |
| mid_force | 108797 | 1090.4 | 1407 | 0.77 | 0.0116 | 0.0128 | +0.09 | 0.77 | 0.80 | 6150 | 1900–2000 |
| record_reopen | 90 | 19.3 | 17 | 1.13 | 0.141 | 0.153 | +0.08 | 0.72 | 0.85 | 82 | 1920–1940 |
| chokepoint_status | 36 | 16.1 | 17 | 0.95 | 0.233 | 0.249 | +0.07 | 0.70 | 0.77 | 28 | 1910–1940 |
| contest_settle | 243 | 24.4 | 29 | 0.84 | 0.098 | 0.105 | +0.06 | 0.80 | 0.71 | 101 | 1930–2010 |
| mid_war | 108797 | 521.8 | 655 | 0.80 | 0.0060 | 0.0060 | −0.01 | 0.77 | 0.70 | 5122 | 1900–2000 |
| democratic_deepening | 169 | 39.4 | 28 | 1.41 | 0.152 | 0.138 | −0.10 | 0.68 | 0.67 | 136 | 1970–2010 |
| autocratic_closure | 696 | 215.9 | 320 | 0.67 | 0.289 | 0.248 | −0.16 | 0.58 | 0.62 | 629 | 1920–2010 |
| democratize_step | 942 | 461.0 | 500 | 0.92 | 0.303 | 0.249 | −0.22 | 0.53 | 0.51 | 872 | 1920–2010 |
| irregular_exit | 1105 | 394.0 | 196 | 2.01 | 0.210 | 0.146 | −0.44 | 0.70 | 0.76 | 843 | 1960–2010 |
| leader_exit | 1105 | 790.7 | 928 | 0.85 | 0.245 | 0.135 | −0.82 | 0.74 | 0.80 | 846 | 1960–2010 |

`liberal_erosion` is still in no row: fewer than the minimum training events at **every** as-of year in the window (n=1826, events=3 in years ≤ 2010), so it reports `no fit at as-of` at all twelve as-of years where its truth window is open. `war_end` is in no row either, by the guard rather than by the data. The 52 no-fit rows are: `mid_force`, `mid_war`, `record_reopen`, `contest_settle`, `chokepoint_status`, `corridor_status` 1870–1890; `chokepoint_status`/`corridor_status` also 1900; `record_reopen` 1900–1910; `contest_settle` 1900–1920; `democratize_step`, `autocratic_closure` 1900–1910; `democratic_deepening` 1900–1960; `liberal_erosion` 1900–2010; `leader_exit`, `irregular_exit`, `coup_attempt`, `intrastate_end` 1950.

### What moved since the first baseline

Three templates are new — `intrastate_end`, `record_reopen` and `contest_settle`, the three terminations package 8 switched on. Of the eleven that existed before, the intermediate ablation run of 2026-09-08 01:48 (`scores/backtest-1870-2010-h20-all-abl-engine_ablate_war_duration_intrastate_end_record_reopen_contest_settle.json`, the current tree with the four terminations ablated) separates the two halves:

- **`coup_attempt` exp/obs 0.89 → 0.75** is the whole visible effect of the earlier three packages, and it is CoW **NMC 7.0**: the revision adds 3,093 actor-years and 38 events to the fit sample, and 12,867 of 13,020 shared CINC values changed. Skill and AUC barely move (+0.18 → +0.17, 0.76 → 0.75); the model now expects a quarter fewer coups than happened rather than a tenth fewer. `democratize_step`, `autocratic_closure`, `irregular_exit`, `leader_exit`, `mid_war` and `mid_force` move by ≤ 0.03 of exp/obs and ≤ 0.03 of skill.
- **The corridor pair swaps places**, and that is package 8's `record_reopen` substitution, isolated by ablation there: `chokepoint_status` +0.14 → +0.07 and `corridor_status` +0.06 → +0.11. On 36 and 83 pooled units this is two records changing sides, not a finding.
- **`democratic_deepening` −0.07 → −0.10** on 28 observed events, with no mechanism accounting for it: the ablation run puts it at −0.05, so about half is the random stream moving under a 29-event sample and the rest is unattributed.
- `intrastate_onset` gains a little (+0.11 → +0.12, AUC 0.74 → 0.75) with exp/obs going 1.02 → 1.05 — an onset template scored in a world where internal wars now end on a fitted hazard instead of a uniform 1..6 draw.

### Reading it honestly

- **The two exit templates are unchanged and still wrong.** `leader_exit` skill −0.82 with the same calibration failure (0→71 in the bottom bin, 100→98 in the top); `irregular_exit` over-predicts 2.01×. Nothing implemented since the first baseline touched them, and the base-rate intercept refit named there is still the obvious next package.
- **`mid_force`/`mid_war` still under-predict at 0.77/0.80 with the structural-miss problem intact**, and the dyadic templates still have **no row at all at as-of 2010** and still report no reason for it — CoW MID 5.0 ends in 2001 and `backtest.mjs` skips the template before it can emit one. That was named in the first baseline as the one thing the log's own rule says should be a row; it is still not a row.
- **`war_end` is the model's first template that is measured, fitted and deliberately not scored.** It reports the candidate guard at 14 as-of years rather than vanishing, which is the behaviour the rule asks for; the reason it is off is in [Implement operator/termination](#implement-operatortermination-package-8--2026-09-07) and is a calibration trade, not a defect in the hazard.
- **`record_reopen` at AUC@risk 0.85 on 82 at-risk units and `contest_settle` at AUC 0.80 on 243 are the smallest samples in the table** and both are confined to windows the record layer covers by hand. `contest_settle`'s base rate is biased low by twelve territory records that read as live contests in 2025 because no settlement row was ever added — the escalation recorded in the termination section.
- **`public/scores.json` was rebuilt this time** (`build-scores-slice.mjs`, one command beyond the list above), because the pooled numbers changed and the published copy was from the first baseline. `public/forecast.json` is 300 runs × 40y.

## Turn era-1870-1914-r2 — 2026-09-07

Lenses: data, corridors, statistics, engine (28 findings, ranked). Backtest re-run for the turn:
`node scripts/backtest.mjs --from 1870 --to 1910 --step 10 --horizon 20 --runs 100 --universe all`
→ `scores/backtest-1870-1910-h20-all.json`, compared against the same as-of rows in the committed
`scores/backtest-1870-2010-h20-all.json`. The out-of-turn regression check is the full
`--from 1870 --to 2010` run, which overwrites that same file; the previous copy is in git at `79b5ffd`.

**The turn's one sentence: the era stopped being unscorable.** Before this turn, three of the five as-of years
(1870, 1880, 1890) carried `n: 0` on *every* template — 30 dead cells across the five rows, and not one actor-year
template was scored anywhere in 1870–1910. After it, 22 of those cells are scored rows and every as-of year in the
turn carries at least four templates.

### Applied

| finding | change | files |
|---|---|---|
| data/1, statistics/1, engine/1 | **The pre-1886 contiguity hole is closed.** `scripts/fetch-contdir.mjs` fetches CoW Direct Contiguity 3.2 (1816–2016) the way `fetch-nmc.mjs` fetches NMC 7.0 — the `peacesciencer` copy, bzip2-wrapped rather than gzip, piped through `bzip2 -dc` into `scripts/lib/rdata.mjs`. `build-contiguity.mjs` merges conttype 1–3 with CShapes: a pair is contiguous where **either** source says so, and the build prints the disagreement (25,489 pair-years both, 10,001 CShapes only, 5,942 CoW only). `meta.years` is `[1816, 2030]`; `scripts/lib/fit.mjs` reads that floor from the file instead of two hard-coded `1886` literals, so the fitter's floor and the engine's `contiguityFrom` cannot drift again. | `scripts/fetch-contdir.mjs` (new), `scripts/fetch-raw.sh`, `scripts/build-contiguity.mjs`, `data/contiguity.json`, `scripts/lib/fit.mjs`, `scripts/backtest.mjs`, `data/templates.yaml`, `docs/data-catalogue.md` |
| data/6 | **Antimeridian bug fixed in the same rebuild.** `turf.buffer` round-trips through Mercator and wraps any longitude past ±180 back around the globe, so Fiji's buffered polygon was 178× its real area and Fiji bordered Peru, Angola and Madagascar. Polygons are now split into parts; a part reaching the antimeridian is unwrapped, translated over the meridian, buffered there and kept in **both** frames. A build guard throws on any buffered part more than 5° wider than its own raw bbox. All 13 impossible pairs (`FJI\|PER`, `ISL\|RUS`, `CAN\|RUS`, …) are gone; `NOR\|RUS`, `CHN\|RUS`, `FIN\|RUS`, `KOREA\|RUS` survive. | `scripts/build-contiguity.mjs` |
| data/5 (part) | Conttype 3 (≤ 24 miles of water) is in the merge, not just 1–2: the CShapes test is a 30 km gap, which falls between type 2 (19 km) and type 3 (39 km), so 1–3 makes the merge a superset of the buffer rather than a subset. `ESP\|MAR` is now `[[1847,1911],[1956,2030]]` (was a hole over the Rif campaigns), `NIC\|SLV` exists from 1900 (Gulf of Fonseca), `RUS\|USA` no longer truncates at the source's 2016. `NLD\|VEN` is still absent — CoW codes it colonial, and `cow_contdir` is the direct file. | `scripts/build-contiguity.mjs`, `data/contiguity.json` |
| data/3, statistics/4, engine/2 | `democratize_step` and `autocratic_closure` move from `window: [1900, 2024]` to `[1816, 2024]`, and `COVERAGE.regime_change` from `[1900, 2025]` to `[1816, 2025]`. Their label source (V-Dem RoW via OWID) runs from 1789 and `events.json` holds 179 pre-1900 regime changes. `democratic_deepening` and `liberal_erosion` are **not** moved: 26 and 48 rows with **0 events** at labels ≤ 1900, so the extension would add non-events only. The reason is on each of the four `window:` lines. | `data/templates.yaml`, `scripts/backtest.mjs` |
| data/2 | Eight interstate wars of the era added with dates, sides and sources: War of the Pacific (with Bolivia's separate exit), Anglo-Egyptian 1882, Sino-French, Franco-Siamese, First Italo-Ethiopian, Greco-Turkish 1897, Boxer, and the two Central American wars. `at_war` actor-years in 1870–1914 go **40 → 85** and the longest run of years with no state at war anywhere falls from 15 to 7 (1886–1892, which the CoW interstate list also has empty). `sources.at_war` now says the column is a hand list with known gaps, not an observation. | `data/history/events.yaml`, `scripts/build-panel.mjs` |
| data/4, corridors/3, engine/6 | **The territory layer gets an era.** `heligoland`'s treaty is now its settlement (`{1890.50, settled}`): its unsettled spell-years over 1890–2025 fall from 136 to 0. Thirteen records added with dated openings, dated termini and sources — venezuela_guiana_boundary, alaska_boundary, puna_de_atacama, andes_cordillera, upper_nile_fashoda, samoa, norway_sweden_union, bolivian_littoral, tacna_arica, acre, crete, eastern_rumelia, morocco. Settled rows dated before 1921 go **0 → 13**, earliest 1886. `tacna_arica` (46 unsettled years) and `morocco` are in as the counter-cases, so the sample is not selected the other way. | `data/territories.yaml` |
| statistics/3, engine/3 | **`corridorFirstYear` no longer back-dates.** It returned the template window start whenever a record's first row was an impairment — true of a strait, false of a *record*: four chokepoints whose first coded entry is 1942, 1984, 1996 and 2023 were handed 469 record-years of synthesised `open` state carrying no transition (41% of the fitted sample), and the backtest reported them as born and at risk with `n_unborn_records: 0`. Existence is now declared: an optional `exists_from:` with a source, and otherwise the record enters when its history does. Verified: 0 records back-dated below their own first row. | `src/engine/core.js`, `docs/schema.md` |
| corridors/1, engine/7, data/7 | The same four chokepoints get **real dated history** instead of the inference: malacca (1867 Straits Settlements, 1914 Emden, 1915 reopen), bab_al_mandab (1869 Aden/Perim, 1915 Sheikh Said, 1915 reopen), hormuz (1892 Trucial agreements), taiwan_strait (1884 French blockade, 1885 Tientsin, 1895 Shimonoseki, 1945 return). Suez gains the 1882 contestation the war record now names. | `data/corridors.yaml` |
| corridors/7, corridors/4 | Five chokepoint records the era had and the layer did not: **gibraltar**, **danish_straits** (1914 Great Belt mining, 1919 reopen), **magellan_strait** (1878 crisis, 1881 neutralisation, 1914 Panama substitution as a capacity fall), **sunda_strait** (Krakatoa 1883, reopened 1884 — the layer's one natural closure), **corinth_canal** (1882 building, 1893 open — the only chokepoint transition in the 1891–1900 decade). Chokepoint records 9 → 14. | `data/corridors.yaml` |
| corridors/2, corridors/8 | Eleven one-row corridor stubs get their construction sequence (gotthard 1869 planned / 1872 building / 1882 built; canadian_pacific, trans_caspian, uganda_railway, cape_bulawayo, simplon_tunnel), and seven corridors the era had are added: **panama_railway** (1885 Colón, 1903 secession), **arica_la_paz** and **madeira_mamore** (the two corridor-for-territory trades that pay for `bolivian_littoral` and `acre`), **sind_pishin_chaman** (the British half of the trans_caspian race), **orenburg_tashkent**, **delagoa_bay_railway**, **peking_mukden_railway**. Corridor transitions dated ≤ 1900 go 2 → 14; ≤ 1890, 1 → 5. | `data/corridors.yaml` |
| engine/5 | **Right-censoring on the reopen sample.** `buildReopenRows` ran to the template window end whether or not the record's history said anything about those years: 113 of 185 rows were a tail after a record's last dated row, putting the reopen base rate at 8.6% where the coded sample says 22%. Rows now stop at `covered_through` where the record declares one with a source, else at the last dated history year, and that final year is dropped unless the spell is observed to end in it. `german_atlantic_cables` and `hejaz_railway` declare `covered_through: 1945` (both impairments are permanent and the sources say why); `bosphorus` gets the 1945 reopening its history was missing; `spanish_colonial_cables` gets the 1899 relay under American ownership. Sample 185/16 (8.6%) → 154/25 (16.2%). | `scripts/lib/fit.mjs`, `data/corridors.yaml`, `docs/schema.md` |
| statistics/2, engine/4 | **A state born inside the horizon is no longer at probability zero for its whole life.** `dyadHazards` returns `{}` the moment either side's `cinc` is null, and `entryPrior` had no `cinc`, so every mid-horizon entrant carried zero on every dyadic template. `cinc` joins the entry prior at the **25th percentile** (a state entering the system is not a median power), and a newborn with a predecessor in the successor chain is seeded from it first — capability scaled by population share, income and regime outright, recorded on `a.imputed` as `cinc<-AUT_HUN`. Probe (`scripts/analysis/probe-newborn.mjs`, as-of 1900 → 1919): 18 introduced actors, **0 with any dyad hazard before, 18 after**; AUT inherits cinc 0.0212 from AUT_HUN. | `src/engine/core.js`, `scripts/analysis/probe-newborn.mjs` (new) |
| statistics/8 (a) | A retiring actor's **contiguity edges** pass to its successor, as its rivalry memory already did. The border graph is frozen at as-of, so a successor born inside the horizon was non-contiguous with everyone. Probe: `AUT\|SRB` false → true once AUT_HUN retires. Edges are only added, so the at-risk set cannot silently shrink. `HUN\|ROU` stays false — `successors` is one-to-one and names AUT, not HUN. | `src/engine/core.js` |
| statistics/5 | **The pooled guard applies to every unit type.** It tested `t.unit === 'actor-year'`, so half the record rows entered pooled at `n_at_risk < 10` — `chokepoint_status` was pooled at 7 at-risk units in four separate as-of years and the headline read `n=36`. Every pooled entry now also carries `n_distinct_units` and `n_as_of_rows`, and `auc`/`skill` ship a 95% CI **bootstrapped by unit id**, not by row, which prices in the fact that a 20-year horizon at a 10-year step measures every unit twice. `chokepoint_status` reads `n=80 (14 units × 6 as-of)` with `auc 0.57 [0.43, 0.68]` — a CI that contains 0.5, which is the honest reading of 14 records. | `scripts/backtest.mjs` |
| statistics/6 | Every fit reports `degenerate` (encoded columns with no within-training variation, by name) and `epv` (events per column actually estimated); the backtest copies both onto the row and marks `underpowered` below EPV 3, using the same pooled exclusion. `mid_war` at as-of 1900 was 8 events over 9 covariates, two of them constants (`pre_1946`, `nuclear_both`) — EPV 0.9 — reported with the same fields as a fit on 227 events. After the contiguity fix it is 35 events and EPV 5.0. | `scripts/lib/fit.mjs`, `scripts/backtest.mjs` |
| engine/8 | A spell template whose at-risk set is empty **because its upstream onset template has no fit at that as-of year** now reports `n: 0` with a reason naming the upstream template, instead of a scored row with `n_at_risk: 0, predicted: 0, auc: 0.5` — a forecast of nothing that reads as a calibrated zero. | `scripts/backtest.mjs` |
| data/8 | The Russian Empire's derived population drift is **recorded, not repaired**: the `derived_series` source line now cross-checks four dates (1870 1.07, 1890 0.98, 1910 0.87, 1914 0.82) instead of the two that agreed, and `population_guard.yaml` carries a `prefer: none` declaration saying this is the one large, systematic, direction-consistent disagreement the 0.3 threshold is calibrated to let through. Preferring `tpop` would rewrite every per-capita covariate on the era's largest actor and belongs in its own change; the guard threshold is **not** lowered (7 declared exemptions in this window say it is doing its job). | `data/history/actors.yaml`, `data/history/population_guard.yaml` |
| candidate promotion (war_end / `contiguous`) | Measured 2026-09-07 and not promoted with the note *"promote it together with the pre-1886 contiguity source"* — because it cost 122 spell-years carrying 64 endings, every war-year before 1886. The source landed this turn and the condition is met: the ablation now keeps the **whole** sample (n=1041 / 407 with and without). Holdout (≥1946) AUC 0.612 → 0.632, Brier 0.2241 → 0.2230, exp/obs 1.45 → 1.45, fitted +0.25 against a prior of +0.3. It changes no scored row: `war_end` is scored only under `WAR_DURATION_ON=1`. | `data/templates.yaml` |
| candidate promotion (corridor_status / `record_building`) | The eleven construction sequences raised the template's events from 37 to 56 **and made an identification problem visible**: one hazard over two processes (a record under construction transitions because construction has stages; one in service because somebody seizes it) fits the mixture and over-predicts on the in-service records. `record_building` is derived from the record's own status word the way `contest_reversible` reads a territory's. Ablation (holdout AUC / Brier / exp-obs, base → with the term): 1910 0.813 / 0.0113 / 6.39 → 0.867 / 0.0092 / 3.68; 1920 0.817 / 0.0081 / 5.42 → 0.833 / 0.0072 / 3.02; 1930 0.846 / 0.0072 / 5.16 → 0.846 / 0.0066 / 2.99; 1946 0.830 / 0.0031 / 12.43 → 0.830 / 0.0027 / 8.06. AUC never falls, Brier improves at all four, calibration gains a third to a half. Measured and **not** promoted on `chokepoint_status`: only two chokepoint records are ever under construction, and it moves nothing. | `src/engine/core.js`, `data/templates.yaml` |

### Before / after — the turn's as-of rows

`n / at-risk / expected / observed / structural-miss / Brier / AUC@risk`. A dash is a row that did not exist:
`{"n": 0, "reason": "no fit at as-of"}`.

| as-of | template | before | after |
|---|---|---|---|
| 1870 | mid_force | — | 1653 / 188 / 24.4 / 11 / 4 / 0.0076 / 0.76 |
| 1870 | mid_war | — | 1653 / 156 / 10.6 / 6 / 3 / 0.0042 / 0.82 |
| 1870 | democratize_step | — | 54 / 38 / 6.4 / 12 / 5 / 0.1978 / 0.60 |
| 1870 | autocratic_closure | — | 14 / 12 / 2.4 / 4 / 2 / 0.2459 / 0.68 |
| 1880 | mid_force | — | 1431 / 217 / 23.3 / 20 / 5 / 0.0129 / 0.75 |
| 1880 | mid_war | — | 1431 / 158 / 10.0 / 10 / 5 / 0.0069 / 0.86 |
| 1880 | democratize_step | — | 52 / 35 / 9.4 / 16 / 8 / 0.2765 / 0.55 |
| 1880 | autocratic_closure | — | 16 / 12 / 3.7 / 6 / 4 / 0.3323 / 0.85 |
| 1890 | mid_force | — | 1596 / 255 / 22.8 / 35 / 10 / 0.0191 / 0.72 |
| 1890 | mid_war | — | 1596 / 186 / 9.6 / 14 / 7 / 0.0083 / 0.82 |
| 1890 | democratize_step | — | 53 / 38 / 9.3 / 19 / 6 / 0.2980 / 0.48 |
| 1890 | autocratic_closure | — | 19 / 16 / 3.4 / 5 / 2 / 0.2264 / 0.59 |
| 1890 | chokepoint_status | — | 11 / 11 / 5.7 / 3 / 0 / 0.2816 / 0.42 |
| 1890 | corridor_status | — | 9 / 9 / 4.1 / 3 / 0 / 0.1607 / 0.67 |
| 1900 | mid_force | 2211 / 263 / 26.6 / 99 / **41** / 0.0389 / 0.72 | 2211 / 414 / 30.9 / 99 / **20** / 0.0370 / 0.73 |
| 1900 | mid_war | 2211 / 253 / 13.5 / 55 / **22** / 0.0229 / 0.70 | 2211 / 299 / 13.9 / 55 / **15** / 0.0226 / 0.74 |
| 1900 | democratize_step | — | 61 / 48 / 11.7 / 30 / 7 / 0.4109 / 0.35 |
| 1900 | autocratic_closure | — | 27 / 20 / 5.9 / 9 / 4 / 0.2606 / 0.76 |
| 1900 | contest_settle | — | 21 / 15 / 3.6 / 5 / 0 / 0.1621 / 0.58 |
| 1900 | chokepoint_status | — | 13 / 13 / 6.1 / 7 / 0 / 0.2664 / 0.40 |
| 1900 | corridor_status | — | 21 / 20 / 11.2 / 10 / 1 / 0.2072 / 0.85 |
| 1910 | mid_force | 2415 / 313 / 27.5 / 99 / **34** / 0.0355 / 0.72 | 2415 / 433 / 34.3 / 99 / **20** / 0.0358 / 0.67 |
| 1910 | mid_war | 2415 / 219 / 9.6 / 50 / 18 / 0.0195 / 0.56 | 2415 / 297 / 14.4 / 50 / 14 / 0.0195 / 0.60 |
| 1910 | democratize_step | — | 62 / 46 / 10.6 / 32 / 8 / 0.3895 / 0.49 |
| 1910 | autocratic_closure | — | 26 / 24 / 4.7 / 9 / 1 / 0.2309 / 0.73 |
| 1910 | contest_settle | — | 25 / 14 / 5.1 / 6 / 0 / 0.1793 / 0.22 |
| 1910 | chokepoint_status | 9 / 7 / 3.0 / 4 / 0 / 0.2271 / 0.42 | 14 / 14 / 6.3 / 7 / 0 / 0.2823 / 0.36 |
| 1910 | corridor_status | 20 / 19 / 6.2 / 7 / 0 / 0.2088 / 0.64 | 27 / 27 / 11.8 / 9 / 0 / 0.1734 / 0.66 |

Fit samples that moved: `mid_force`/`mid_war` 69,272 → 78,915 rows with events 813 → 888 and 227 → 257
(holdout AUC 0.861 → 0.873 and 0.848 → 0.827); `democratize_step` 7,072 → 8,571 / 304 → 333; `autocratic_closure`
5,880 → 6,488 / 245 → 266; `chokepoint_status` 1,143 → 2,052 / 37 → 54; `corridor_status` 3,143 → 4,085 / 37 → 56;
`contest_settle` 1,577 → 1,649 / 22 → 34; `record_reopen` 185 → 154 / 16 → 25.

Pooled over the turn's five as-of years (new rows only — there was nothing to compare against at 1870–1890):
`mid_force` n=9,306 skill +0.10 AUC 0.83 [0.81, 0.85]; `mid_war` n=9,306 skill +0.04 AUC 0.79;
`democratize_step` n=228 skill −0.42; `autocratic_closure` n=72 skill −0.11; `corridor_status` n=48 skill **+0.21**
AUC 0.73; `chokepoint_status` n=38 skill −0.12 AUC 0.35; `contest_settle` n=25 skill +0.02.

### Out-of-turn regression check — pooled 1870–2010

| template | n before → after | exp/obs | skill | AUC (with the new by-unit CI) |
|---|---|---|---|---|
| mid_force | 108,797 → 113,477 (20,288u × 14) | 0.77 → 0.78 | +0.088 → **+0.100** | 0.765 → 0.797 [0.80, 0.81] |
| mid_war | 108,797 → 113,477 | 0.80 → 0.81 | −0.009 → −0.015 | 0.770 → 0.771 [0.78, 0.78] |
| record_reopen | 90 → 85 (44u × 2) | 1.13 → 0.93 | +0.082 → **+0.255** | 0.718 → 0.760 [0.54, 0.93] |
| contest_settle | 243 → 169 (41u × 5) | 0.84 → 0.71 | +0.063 → **+0.178** | 0.798 → 0.793 [0.69, 0.88] |
| intrastate_onset | 1,241 → 1,105 (200u × 6) | 1.05 → 0.95 | +0.122 → +0.194 | 0.747 → 0.770 |
| autocratic_closure | 696 → 768 (152u × 13) | 0.67 → 0.64 | −0.163 → −0.158 | 0.581 → 0.603 |
| democratize_step | 942 → 1,170 (164u × 14) | 0.92 → 0.79 | −0.216 → −0.237 | 0.527 → 0.540 |
| corridor_status | 83 → 132 (30u × 5) | 1.05 → 1.20 | +0.108 → **+0.081** | 0.699 → 0.627 [0.49, 0.75] |
| chokepoint_status | 36 → 80 (14u × 6) | 0.95 → 1.17 | +0.066 → **−0.021** | 0.695 → 0.565 [0.43, 0.68] |
| irregular_exit | 1,105 → 948 (199u × 5) | 2.01 → 2.43 | −0.437 → −0.639 | 0.697 → 0.719 |
| democratic_deepening | 169 → 95 (59u × 2) | 1.41 → 2.46 | −0.103 → −0.590 | 0.676 → 0.598 |
| leader_exit / coup_attempt / intrastate_end | unchanged | unchanged | ±0.007 | ±0.002 |

### Reading it honestly

- **`chokepoint_status` losing its skill is the expected outcome, not a regression to fix.** The finding that
  produced it (`statistics/3`) said so in its own test: *"the pooled skill (+0.066 today) must be re-reported on the
  honest sample — a fall is the expected, correct outcome."* Sixteen of the old pooled 36 units were four straits
  nobody had coded before 1942, back-dated to 1869 and guaranteed not to move. They are gone; five real records with
  real transitions are in; the pooled row now says `14 units × 6 as-of` with a CI of [0.43, 0.68] that contains 0.5.
  The old +0.066 on "36 units" was a number about nine records measured four times.
- **`corridor_status` is a genuine partial loss, and it is attributable.** Adding eleven construction sequences
  raised the base rate and put a construction-stage hazard on records that are finished. `record_building` recovers
  most of it — inside the turn the template goes skill −0.26 → **+0.21** and Brier 0.301 → 0.188 — but pooled over
  1870–2010 it still ends at +0.081 against +0.108, with exp/obs 1.20. The residual is the same two-process problem
  on the in-service half, and it is stated in the promotion record rather than smoothed over.
- **Three pooled movements are the new guards, not new data.** `intrastate_onset` (+0.122 → +0.194),
  `irregular_exit` (−0.437 → −0.639) and `democratic_deepening` (−0.103 → −0.590) each lost as-of rows from `pooled`
  to the EPV guard: as-of 1950 `intrastate_onset` (EPV 1.00), 1960 `irregular_exit` (2.60), and 1970/1980/1990
  `democratic_deepening` (1.40 / 2.00 / 2.60, all with `aid_conditionality` degenerate). `contest_settle` lost six
  as-of rows to the at-risk guard (8, 8, 8, 8, 6, 6 units at 1960–2010). Those rows still exist in `byAsOf` with
  `underpowered: true` and a reason; they no longer set a headline. Nothing about the underlying model changed for
  any of them.
- **`mid_war` gains a sample and does not gain skill.** 30 more pre-1886 events, EPV at as-of 1900 from 0.9 to 5.0,
  the era's structural miss down from 22 to 15 — and pooled skill −0.009 → −0.015 with the AUC flat. The template's
  problem is not the sample size; the calibration column (`0→1 0→0 0→0 0→0 2→2`) says it puts almost no mass
  anywhere. That is the next adversary's.
- **The 1900 and 1910 dyadic under-prediction is smaller and still large.** `mid_force` at as-of 1900 goes from
  26.6 expected against 99 observed to 30.9 — 0.27 → 0.31 of the truth. The structural miss halved (41 → 20), which
  is the newborn-capability and successor-border fixes doing exactly what they were predicted to do, but the
  remaining gap is a rate problem, not a reachability problem: 1900–1920 contains the two Balkan wars and the first
  world war, and a hazard fitted on labels ≤ 1900 has never seen a year like them.
- **`contest_settle`'s holdout AUC falls 0.646 → 0.356 while its backtest skill rises 0.063 → 0.178.** These are not
  in conflict and both are real. The template's declared holdout splits at 1946: the training half is now dominated
  by the era's fast arbitrated settlements (a boundary award closes a contest in one or two years) and the test half
  is 20th-century decolonisation, which is a different process. The rolling-origin backtest, which refits at each
  as-of year, does better precisely because it never has to forecast one from the other. The template's own
  `holdout_split` is the number to revisit.

### Skipped

| finding | reason |
|---|---|
| data/2 (Second Boer War) | The belligerents are not in the actor universe: the Boer republics are absent from the CoW/GW codelist this model's universe is built from, and `ZAF` is not live until 1920. The war cannot be coded as a `sides:` pair. The corridor it was fought over is in instead (`delagoa_bay_railway`, with the 1899 closure and the 1900 British takeover), and the record's `notes` says why the war is not. |
| data/5 (`NLD\|VEN`) | CoW codes the Netherlands–Venezuela pair as *colonial* contiguity, which lives in `contcol`, not in the `contdir` file `peacesciencer` ships. The 1908 coast-guard incident stays a structural miss. |
| data/7 (bosphorus 1885/86, panama 1885) | The proposed Bosphorus rows are not supported: the 1886 Greek blockade was of Greece by the powers, not a closure of the Straits, and I could not source a status change on the record. The Panama 1885 crisis is real and is coded where it belongs — on the new `panama_railway` record (Colón burned 31 Mar 1885, US landings under the 1846 transit guarantee), not on the canal record, which in 1885 was a French construction site. |
| statistics/5 (territory censoring, engine/5 second half) | The censoring rule is applied to `buildReopenRows` and **not** to `buildTerritoryRows`. The corridor layer's records stop at their last status change; the territory layer's carry an explicit 2026 `status:` snapshot at the top of each record, so the years after the last history row are a claim the file makes, not a gap. Censoring them would throw away observed non-endings. The twelve records whose top-level `status` disagrees with their own history are the escalated defect, and the right fix is the missing settlement row — which is what this turn did for `heligoland`. |
| corridors/5 (`terms`) | Escalated. It redefines the outcome of two templates across every era, in the same turn that added five chokepoint records and eleven corridor histories; the two changes would be inseparable in the backtest. |
| corridors/6 (dated `load_bearing_for`) | Escalated. The field is read by exactly one thing — `corridorStake`, which feeds only the `corridor_stake` candidate, currently rejected on both dyadic templates. Backfilling it changes no fitted number until that candidate is re-proposed. |
| statistics/8 (b) (`implies_border`) | Escalated: a new engine dynamic (the territory layer writing into the dyad layer). Half (a), successor inheritance of contiguity edges, is applied. |
| data/1 (drop `contiguityFrom`) | The forward-snapshot in `src/engine/core.js:528` is left in place. With `meta.years[0] = 1816` it is inert for every as-of year in the modelled window — `Math.max(asOf, 1816) === asOf` — and it is the general rule for a source that starts late, not a fact about CShapes. The comment now says so. |

### Deferred

| finding | dataset | note |
|---|---|---|
| data/2 (the general case) | **CoW Inter-State War v4.0** participant-level dates | Eight hand entries fixed this era; the hand list is still a hand list. `peacesciencer` ships `cow_war_inter` and the fetch route now exists (`scripts/fetch-contdir.mjs` is the pattern). Escalated with its test. |
| data/3 (second-order) | Maddison benchmark interpolation for all actors | 55% of the recoverable pre-1900 `democratize_step` sample is still lost to a null `log_gdp_pc` or `gdp_growth` (1,815 and 1,865 rows of 3,367), against 23 lost to `at_war`. Extending the log-linear benchmark interpolation already built for `derived_series` actors to all actors roughly doubles the sample again. Not folded in here. |
| statistics/7, corridors/7 | a coverage audit flag on the corridor layer | The nine single-entry corridor records that remain (mostly post-1945) can never produce a positive label. `covered_through:` now exists as the mechanism; auditing every record against it is a pass of its own. |

*Published slices (`public/*.json`) are deliberately **not** rebuilt: they are regenerated as one set at a
re-baseline, and a turn that rebuilt only `world.json` would leave `scores.json` and `forecast.json` describing a
different model. `scores/backtest-1870-2000-h20-modeled.json` was already modified in the working tree when this turn
opened and is left uncommitted — its provenance is not this turn's.*

*Rule check: no country ids were added to `data/templates.yaml` or `src/engine/`. `record_building` and `BUILDING`
in `src/engine/core.js` are status words, not places; every hand number added to `data/corridors.yaml` and
`data/territories.yaml` carries a `source:` or the literal `estimate`.*

---

## Turn era-1914-1945-r2 — 2026-09-07

Backtest range `--from 1910 --to 1940 --step 10 --horizon 20 --runs 100 --universe all`.

**A note on the baseline, because it changes every number below.** `scores/backtest-1910-1940-h20-all.json` as
committed was written on 2026-09-07T14:46 by `implement(era-1914-1945/corridors-7)` and was never regenerated after
`refine(era-1870-1914-r2)` landed CoW Direct Contiguity back to 1816 — at as-of 1910 it reported a dyad fit sample of
7,178 rows against the current tree's 16,785. Comparing to it would have credited this turn with the previous turn's
work and would have read the era split as a regression it is not. Every before/after below is against the as-of 1910,
1920, 1930 and 1940 rows of `scores/backtest-1870-2010-h20-all.json` (run 2026-09-08T03:53, the current baseline), and
the stale turn file is overwritten by this turn's run.

### Applied

| finding | change | files | effect |
|---|---|---|---|
| data/1 | The WWII dyad cross-product no longer clamps a pair whose CoW participant spans do not overlap: `end = min(a.ey, b.ey)` and the pair is dropped when that precedes the later entry. The two `dispnum 2004` rows whose own `endyear` precedes their `styear` are clamped at read time instead, which is what they actually needed. The build prints the count. | `scripts/build-events.mjs` | **62 fabricated dyads dropped, 56 at hostlev ≥ 5, every one from dispnum 258 (WWII)**, dated 1940:5 1941:34 1943:2 1944:14 1945:7. `war_end` n 1041→995, events 407→**362**, base rate 39.10%→36.38%, `z(war_duration)` +0.086→**+0.21**, `contiguous` +0.25→+0.37, holdout (≥1946) AUC 0.632→**0.634**, Brier 0.2230→**0.2152**, exp/obs 1.45→**1.36** — the finding predicted 0.634 / 0.2149 / 1.36. Observed `mid_war` in the scored windows falls 202→164 at as-of 1930 and 174→140 at 1940. |
| data/2 | Six wars the hand `at_war` list never named added to `data/history/events.yaml` with per-participant entry/exit dates and sources: `hungarian_adversaries_1919`, `franco_turkish_1919` (coded OTTOMAN — TUR is not live until 1923), `polish_lithuanian_1920`, `kashmir_1947`, `palestine_1948`, `hungary_1956`. `korean`'s `sides` extended from 5 contributors to 16 with contingent-arrival dates from CoW MID 51. `chaco` and `italo_ethiopian` keep their CoW war dates with a `notes` saying why they differ from the MID onset. `scripts/build-events.mjs` now prints the hand list against the label set every build. | `data/history/events.yaml`, `scripts/build-events.mjs` | at_war coverage of the `mid_war` spell-year set **400/732 (55%) → 454/732 (62%)**. The four years of declared global peace are gone: at_war positives by year 1946:0 1947:0 1948:0 1949:0 → **1946:0 1947:2 1948:9 1949:7** (1946 is genuinely 0 — Indonesia and Indochina are colonial wars, not interstate ones in this list). Korea's contingents: 1951 goes from 12 to 19 actors at war. |
| data/3 | The log-linear Maddison benchmark interpolation that `derived_series` actors already had is extended to **every** actor, inside that actor's own observed range only, never extrapolated, never across a gap wider than 40 years, never on a `derived_series` actor (that block owns its window and deliberately nulls territory-change years). `gdp_pc_interp` = 1 marks every filled year. | `scripts/build-panel.mjs`, `data/history/actors.yaml` | 2,110 actor-years filled across 72 actors. Live actor-years with null `log_gdp_pc`: 1911–1930 **377 → 247**, 1921–1940 363 → 222, 1931–1950 367 → 196, 1941–1960 232 → 131; null `gdp_growth` 404 → 258 in 1911–1930. Of the 247 that remain, **19 are interior gaps** (EST, whose Maddison gap is wider than 40 years) and 228 are outside the actor's observed range or have no series at all — the finding's target of ≤ 200 counted those as recoverable and they are not, without extrapolating. POL 1914–1919 and 1921–1928, ALB 1932/1938 and THA 1933 are now non-null with `gdp_growth`; **LVA 1934/1935, LTU 1927 and EST 1934/1935 stay null and are declared in `data/history/actors.yaml`** — no pre-1950 Maddison row exists for them and inventing one would be worse than the hole. `democratize_step` n 8,571→9,378 events 333→354; `autocratic_closure` 6,488→6,700 / 266→288, both with holdout AUC flat (0.597→0.596, 0.584→0.584). |
| data/4, statistics/3 | The occupation null split into the two things it was doing. Capabilities (`cinc`, `irst`, `milex`, `milper`, `energy_nmc`, `tpop`, `upop`) now carry the last **pre-occupation** observation forward instead of being nulled, so the actor survives the dyad filter; the dispute/alliance flags stay null; `at_war` **keeps its 1** where the war list says the actor is a belligerent and is null otherwise. A new `occupied` column marks every fully occupied actor-year, and an occupation declared `partial: true` marks and causes without touching the series. The backtest reports `n_excluded_no_covariate` / `excluded_vars` on dyad rows. | `scripts/build-panel.mjs`, `scripts/backtest.mjs`, `data/history/events.yaml` | 113 occupied actor-years marked, 243 capability values carried, 43 `at_war = 1` kept (FRA/NLD/BEL/LUX/NOR/DNK/SRB/GRC 1941–45 stop being coded as peace). Dyad exclusions are now visible: 15 actors at as-of 1910, 4 / 7 / 8 at 1920 / 1930 / 1940. `mid_force`/`mid_war` fit sample 78,915 → 79,207 rows with 888 → 890 and 257 → 258 events. |
| data/5 | The five records whose top-level `status: settled` their own history never reaches: dated settlement rows added to `eastern_poland` (1945.62, Moscow agreement 16 Aug 1945), `bessarabia_bukovina` and `karelia_ceded` (1947.11, the Paris peace treaties) and `baltic_annexation` (1991.63 — the 47 unsettled years 1944–1991 stand, they are real non-endings); `hatay`'s top-level status corrected to `disputed`, because Syria has never renounced the claim, which makes it the counter-case that keeps the sample from being selected on settlement. `scripts/build-events.mjs` now **fails the build** if a record declares `settled` and never reaches a resolved status. | `data/territories.yaml`, `scripts/build-events.mjs` | `contest_settle` n 1,649→1,453 events 34→**43**. `auc_at_risk` at as-of 1930 **0.21 → 0.76** and at 1910 0.22 → 0.25; at 1920 0.28 → 0.21 and at 1940 0.47 → 0.40. Pooled 1870–2010 skill **+0.178 → +0.248**, AUC 0.793 → **0.840**. The claim that the inversion was a homogeneous-at-risk-set artefact is **half falsified** — see engine/3 under escalations. |
| data/6 | The First World War's occupation spans, absent from a layer that began in 1936: BEL and LUX 1914.60–1918.86 (DEU), SRB 1915.86–1918.83 (AUT_HUN), ROU 1916.95–1918.86 (DEU, `partial: true` — the Iasi government kept fielding an army), ALB 1916–1920 (AUT_HUN). MNE is not live in the panel in 1916 and is not coded. | `data/history/events.yaml` | BEL's 1914 3→0 collapse and its 1919 0→1 restoration now carry `cause: occupation` and `cause: imposed` and leave the domestic regime templates, as the identical 1940/1946 pair already did. `autocratic_closure` `auc_at_risk` at as-of 1910 0.73 → 0.75; `democratize_step` at as-of 1910 0.49 → 0.54. |
| data/7 | `capability_from` + `capability_from_source` declared on CAN, AUS, NZL and ZAF (CoW NMC has no row before 1920 while the corridor layer needs them alive from 1867/1901/1907/1910). `scripts/build-panel.mjs` prints every actor live before its capability source covers it. | `data/history/actors.yaml`, `scripts/build-panel.mjs` | The build now says: **50 actors live before CoW NMC covers them, 1,926 actor-years outside every dyadic template, 46 without a declaration**. The remaining 46 reach the panel through `codelist_panel.csv` rather than `actors.yaml` (NPL, LBR, CRI from 1920; OMN 1971; MNE 2006; BTN 1971) and declaring them needs a lifecycle entry each — the hole is now reported every build instead of being discovered. |
| corridors/1 | An impaired record whose `record_reopen` template has no fit at the as-of year no longer falls through both draws. The substitution of the reopen hazard for the generic status hazard is now conditional on the reopen hazard existing; `impairAge` increments on both paths. | `src/engine/core.js` | The absorbing state is gone. At as-of 1910 `record_reopen` is still unfitted (n=10, 6 events ≤ 1910) and the four impaired records of 1920 now reach the status hazard. `corridor_status` at as-of 1920 `n_structural_miss` **2 → 0** and observed_at_risk 3 → 7. |
| corridors/2 | Five records that stopped before the war they were fought in: `sunda_strait` (1942.16 closed/JPN, 1945.70 open/NLD), `danish_straits` (1940.27 closed/DEU — Weserübung, 1945.35 open/DNK), `corinth_canal` (1941.32 closed/DEU, 1948.51 open/GRC), `bab_al_mandab` (1940.44 contested — the Red Sea combat zone, 1941.28 open/GBR), `taiwan_strait` (1937.65 contested/JPN — the blockade that makes the Burma Road necessary). | `data/corridors.yaml` | `chokepoint_status` observed in the scored windows: as-of 1910 7 → 8, 1920 **4 → 8**, 1930 **6 → 11**, 1940 **6 → 11**. Fit sample 2,052 → 1,031 rows (the window truncation of statistics/5) with events 54 → 56. |
| corridors/3 | `german_atlantic_cables` gets a dated `abandoned` row (1922.10, the Versailles cable clauses and the 1922 Washington settlement) and `hejaz_railway`'s 1920 row changes from `closed` to `abandoned` — its own source text said the through corridor was never restored. `abandoned` is in neither IMPAIRED nor ACTIVE_STATUS, so both leave the reopen risk set without a line of history being deleted. | `data/corridors.yaml` | The two longest phantom spells are out of `record_reopen`: base rate 16.2% → **27.0%** on n 154 → 148 with events 25 → 40 (the new dated histories supply the rest). This is also the one clear regression below. |
| corridors/4 | Three records the era's wars were fought over and the layer did not have: `murmansk_railway` (1916.98 built — the line the Bosphorus closure forced, 1918.18 contested/GBR, 1920.20 built/RUS, 1941.50 contested, 1944.72 built), `danube_ploiesti` (1900 built/ROU through 1944.66 closed/RUS, seven dated rows), `dover_strait` (1869 open through 1944.43 open, five dated rows). | `data/corridors.yaml` | 59 → 62 records, 14 → 15 chokepoints. `corridor_status` units 27 → 28/29/29/32 across the four as-of years, `chokepoint_status` 14 → 15 at every one, `n_unborn_records` 0 for all three. |
| corridors/6 | Both Baku–Batumi records were frozen at their construction year with `controller: RUS`. Six dated rows added to each (1918.40 contested, 1918.71 closed/OTTOMAN, 1918.88 closed/GBR, 1920.32 built/RUS, 1942.56 contested — Operation Edelweiss, 1943.10 built), `transits` widened to RUS/AZE/GEO, `load_bearing_for` raised to 0.8 with a sourced estimate (Baku was roughly 70% of Soviet crude in 1940), and the rail record carries `parent: baku_batumi_pipeline` so a reader knows the two are one corridor in two modes. | `data/corridors.yaml` | Four control changes and a multi-year cut become visible in the as-of 1910 and as-of 1920 horizons, where the model previously ran a Russian, built, unimpaired line straight through. |
| corridors/7 | `kirkuk_haifa_pipeline` jumped 1935 → 1948 and so missed the two 1941 wars fought over it: 1940.48 contested (the T-branch inside Vichy Syria stops pumping), 1941.34 closed (the Rashid Ali coup and the Anglo-Iraqi war), 1941.58 built/GBR. `transits` corrected to IRQ/SYR/LBN/JOR/ISR — the IPC system was a Y and half of it ran through the French mandate. | `data/corridors.yaml` | A genuine short impaired spell (1941.34 → 1941.58) enters `record_reopen`, against a sample whose spells were 24–27 year phantoms. |
| corridors/8 | Five territory records with dated endings, chosen because the era's territorial wars had none and the interwar arbitrations — the natural control group of contests that end by award — were absent: `chaco_boreal`, `smyrna_ionia`, `vilnius`, `mosul_vilayet`, `upper_silesia`. | `data/territories.yaml` | 70 → 75 records. With data/5, `contest_settle` events 34 → 43 and pooled 1870–2010 AUC 0.793 → 0.840. |
| statistics/5 | `chokepoint_status` and `corridor_status` fitting windows moved [1869, 2026] → **[1869, 1945]**, the window `scripts/backtest.mjs` already scores their ground truth in. | `data/templates.yaml` | Base rates stop being halved by un-coded years: corridor 1.37% on 4,085 rows → **4.45%** on 1,572; chokepoint 2.63% on 2,052 → **5.43%** on 1,031. `adjacent_intrastate` on the chokepoint template **flips from −0.48 to +1.00**, exactly as the finding predicted. Holdout moves to the fitter's own choice (≥1907): chokepoint AUC 0.661 → 0.771, corridor 0.830 → 0.811 — and the old 0.830 was measured against a post-1946 half with exp/obs 8.06, which is the signature of scoring against a layer that is not there. |
| statistics/6 | `war_end` declares `cluster: war_component`; the fitter reports `n_clusters` and `epv_clusters` alongside `epv`. | `scripts/lib/fit.mjs`, `data/templates.yaml` | `war_end` prints **n=995 clusters=32 ev=362**. The union-find here is over spell-YEARS that share a belligerent in a year and so chains transitively (the adversary's count over spells was 65); either number says the effective sample is two orders below `n`, and `epv: 135.7` was a number about rows. The cluster bootstrap on the holdout AUC is the half not built. |
| statistics/8 | The recency-weighting result recorded under `rejected:` on the war template with its full τ sweep, so the loop does not chase it. | `data/templates.yaml` | No score change; a closed door with numbers on it. |
| engine/1 | The contagion term is era-interacted: `lag1(at_war_any)` keeps its pooled coefficient and `lag1(at_war_any_post46)` enters as a **delta** with prior 0, built identically in `scripts/lib/fit.mjs` and `src/engine/core.js`. `holdout_split` 1939 → 1975 on the war template and 1975 declared on the dispute template, because at 1946 and earlier the interaction has no within-training variation. | `data/templates.yaml`, `scripts/lib/fit.mjs`, `src/engine/core.js` | Fitted: `mid_war` at_war_any **+1.90** with delta **−1.19** (post-1946 effective +0.71); `mid_force` +1.15 and −0.60 (+0.55). **1950–2000 pooled `mid_war` exp/obs 2.62 → 1.91 and Brier skill −0.530 → −0.122; `mid_force` 1.17 → 0.98 and +0.008 → +0.112.** Pooled 1870–2010 `mid_war` skill −0.015 → +0.033 and `mid_force` +0.100 → +0.124. |
| engine/1 (form) | The **two-dummy** form the finding proposed was built and measured first and is recorded, not just described: it gives 1950–2000 `mid_war` 1.87 and `mid_force` 0.95 — marginally better than the delta — and costs this turn's own window, `mid_war` pooled exp/obs 0.34 → **0.28** and `mid_force` 0.45 → 0.40, because at as-of ≤ 1940 the post-1946 half is unidentified and 15 of the 20 horizon years take a prior of +0.4 where the pooled term has +1.70. The delta form gives a forecaster with no post-1946 rows the pooled coefficient instead of a prior. The reasoning is in the covariate's own `source:`. | | |
| engine/5 | `pre_1946` added to `war_end`, built in `src/engine/termination.js:warEndFeatures` so the fitter and the engine read one construction. | `data/templates.yaml`, `src/engine/termination.js` | The template's own sample says the constant is wrong by era: observed termination hazard 0.559 pre-1914 / 0.391 in 1914–45 / 0.296 post-1946. Fitted **+0.47**. At split 1975, where the term is identified: AUC 0.534 → 0.531 (−0.003), Brier 0.2323 → **0.2201**, holdout exp/obs 1.40 → **1.14**. It buys calibration, which is what a level-per-era term is for, and does not buy discrimination — stated rather than smoothed. |
| engine/8 | `coalitionJoin` passes the war component's size to `openWarSpell` instead of letting it default to 2, and raises the initiating pair's own spell to the same count when a joining draw enlarges it. | `src/engine/core.js` | No scored change today — the coalition rule is a switched-off candidate — but the engine can now produce the object `war_coalition` was added for, and `engine/4` or `statistics/4` will not silently inherit the bug. |
| engine/3 (partial) | `docs/system.md`'s holdout table corrected where it disagreed with `data/fits.json`: `contest_settle` 0.65 → **0.45**, `record_reopen` 0.74 → 0.50, `war_end` 0.61 → 0.63 (≥1946) / 0.53 (≥1975, the declared split), and the two record templates' windows and holdouts restated. A paragraph under the table says what `contest_settle`'s numbers are and that demotion is the open option. | `docs/system.md` | The published table stops advertising a discrimination the fit does not have. |

### Skipped

| finding | reason |
|---|---|
| statistics/7 (at_war_any built from `warSpells`) | Overlaps data/2 and engine/1 and would be inseparable from them in this turn's numbers. data/2 raised the hand list's coverage of the label set from 55% to 62% (the population half of the complaint) and engine/1 took ~1.2 log-odds out of the post-1946 coefficient by a different route (the size half). The residual mismatch is real — the finding measured it at 0.2–0.3 log-odds on its own — and it should be re-measured against this tree rather than stacked on top of two changes that move the same number. The structural answer is the deferred CoW Inter-State War v4.0 ingest. |
| engine/4 (split the coalition `status` into relevance and joining) | Its own evidence is conditional on `engine/1` landing and was measured with the two-dummy form and `WAR_DURATION_ON=1`. The era interaction that landed here is the delta form and the war spell is still a candidate, so every number in the finding (2.59x, 2.92x, 12.41x) is from a tree that no longer exists. It is the first thing to re-measure next turn, and `statistics/4` — a fitted joining hazard rather than a constant — is escalated in the same area. |
| data/8 (Otranto barrage, the `chokepoint_*` panel column audit) | The Arctic route and the Danube–Ploiesti and Dover records it asks for landed under corridors/4. The Otranto barrage and the audit of the five `chokepoint_*` panel columns against fifteen records are the remainder and are hygiene against a layer this turn already grew by three records; adding more units in the same turn would make the chokepoint row's movement unattributable. |
| corridors/2 (`mediterranean_route` double counting) | Left alone deliberately. It restates `suez`'s 1940.44/1943.4 and Gibraltar's absent 1940–43 history from the same cause, so two of fifteen chokepoint units fire on one event — but demoting it to a `corridor` or deleting its rows changes the unit count in the same turn that five records gained wartime histories, and the two effects would not be separable. Recorded here so the next turn can take it with a clean baseline. |

### Escalated

`statistics/1` (a system-war-share covariate — a new derived panel column with an engine mirror), `statistics/2` (a
static-forecast baseline and the guard restated as amplification), `statistics/4` (coalition joining as a fitted
ally-year hazard — a new template kind), `corridors/5` (corridor denial as a dyadic and a war-duration covariate — new
constructions in the engine, with a mandatory `default_outside` honesty condition on the post-1945 coverage boundary),
`engine/2` (a two-component growth shock — a new engine dynamic feeding five templates), `engine/3` (demote
`contest_settle` or give it covariates that discriminate), `engine/6` (a controller-transfer branch in the corridor
draw), `engine/7` (occupation as an engine state — this turn landed its data half). All eight are written up in
`docs/escalations.md` with the evidence, the data they need, the templates they feed and the test that would decide
them.

### Before / after — the turn's own as-of rows

Against `scores/backtest-1870-2010-h20-all.json` as it stood at 2026-09-08T03:53. Format: n / expected / observed /
structural-miss / Brier / auc@risk.

| as-of | template | before | after |
|---|---|---|---|
| 1910 | mid_force | 2415 / 34.3 / 99 / 20 / 0.036 / 0.67 | 2415 / 34.5 / 99 / **17** / 0.035 / 0.66 |
| 1910 | mid_war | 2415 / 14.4 / 50 / 14 / 0.020 / 0.60 | 2415 / 14.3 / 50 / **13** / 0.020 / **0.62** |
| 1910 | democratize_step | 62 / 10.6 / 32 / 8 / 0.390 / 0.49 | 62 / 12.1 / 30 / 7 / **0.347** / **0.54** |
| 1910 | autocratic_closure | 26 / 4.7 / 9 / 1 / 0.231 / 0.73 | 26 / 5.2 / 9 / 1 / 0.223 / **0.75** |
| 1910 | chokepoint_status | 14 / 6.3 / 7 / 0 / 0.282 / 0.36 | **15** / 6.1 / **8** / 0 / **0.261** / **0.53** |
| 1910 | corridor_status | 27 / 11.8 / 9 / 0 / 0.173 / 0.66 | **28** / 12.1 / **12** / 0 / 0.208 / 0.58 |
| 1910 | contest_settle | 25 / 5.1 / 6 / 0 / 0.179 / 0.22 | 26 / 6.0 / 6 / 0 / 0.173 / 0.25 |
| 1920 | mid_force | 2346 / 71.0 / 91 / 9 / 0.031 / 0.73 | 2346 / 70.3 / 86 / **7** / **0.029** / 0.72 |
| 1920 | mid_war | 2346 / 34.2 / 52 / 8 / 0.020 / 0.61 | 2346 / 33.9 / 47 / 8 / 0.019 / **0.64** |
| 1920 | chokepoint_status | 14 / 8.9 / 4 / 0 / 0.302 / 0.79 | **15** / 9.0 / **8** / 0 / **0.212** / 0.79 |
| 1920 | corridor_status | 27 / 9.0 / 5 / **2** / 0.201 / 0.87 | **29** / 16.0 / 7 / **0** / 0.204 / 0.79 |
| 1920 | record_reopen | no fit at as-of | 44 / 22.2 / 4 / 0 / 0.227 / 0.83 |
| 1930 | mid_force | 3486 / 59.4 / **261** / 102 / 0.064 / 0.75 | 3486 / 56.1 / **220** / **79** / **0.054** / 0.73 |
| 1930 | mid_war | 3486 / 26.5 / **202** / 85 / 0.053 / 0.69 | 3486 / 25.2 / **164** / **68** / **0.044** / 0.69 |
| 1930 | contest_settle | 32 / 5.1 / 6 / 0 / 0.113 / **0.21** | 37 / 5.7 / 9 / 0 / 0.107 / **0.76** |
| 1930 | chokepoint_status | 14 / 6.1 / 6 / 0 / 0.224 / 0.68 | 15 / 6.4 / **11** / 0 / 0.306 / 0.44 |
| 1930 | corridor_status | 27 / 6.6 / 5 / 0 / 0.148 / 0.50 | 29 / 9.3 / 9 / 0 / 0.208 / 0.41 |
| 1940 | mid_force | 6216 / 122.6 / 239 / 114 / 0.033 / 0.79 | 6216 / 113.5 / 202 / **92** / **0.028** / 0.79 |
| 1940 | mid_war | 6216 / 71.5 / 174 / 85 / 0.024 / 0.80 | 6216 / 63.5 / 140 / **68** / **0.020** / 0.80 |
| 1940 | chokepoint_status | 14 / 5.6 / 6 / 0 / 0.137 / 0.97 | 15 / 8.4 / **11** / 0 / 0.167 / 0.83 |
| 1940 | corridor_status | 30 / 3.5 / 6 / 0 / 0.173 / 0.43 | 32 / 6.1 / **11** / 0 / 0.223 / **0.68** |
| 1940 | contest_settle | 41 / 6.0 / 14 / 0 / 0.198 / 0.47 | 46 / 7.2 / 17 / 0 / 0.183 / 0.40 |

Pooled over the four as-of years, this turn's window: `mid_force` exp/obs 287.3/690 = **0.42 → 274.4/607 = 0.45**,
`mid_war` 146.6/478 = **0.31 → 136.9/401 = 0.34** — both move toward 1 from below, and the fabricated-label half of the
move is honest deflation of the denominator rather than better forecasting.

### Out-of-turn regression check — pooled 1870–2010

| template | n before → after | exp/obs | skill | AUC |
|---|---|---|---|---|
| mid_force | 113,477 → 113,477 | 0.78 → 0.71 | +0.100 → **+0.124** | 0.797 → **0.806** |
| mid_war | 113,477 → 113,477 | 0.81 → 0.68 | −0.015 → **+0.033** | 0.771 → **0.778** |
| contest_settle | 169 → 190 | 0.71 → 0.63 | +0.178 → **+0.248** | 0.793 → **0.840** |
| corridor_status | 132 → 140 | 1.20 → **1.09** | +0.081 → **+0.106** | 0.627 → 0.626 |
| chokepoint_status | 80 → 86 | 1.17 → **0.85** | −0.021 → **−0.007** | 0.565 → 0.569 |
| democratize_step | 1,170 → 1,224 | 0.79 → 0.82 | −0.237 → **−0.204** | 0.540 → 0.547 |
| autocratic_closure | 768 → 798 | 0.64 → 0.66 | −0.158 → −0.153 | 0.603 → 0.596 |
| intrastate_onset | 1,105 → 1,105 | 0.95 → 0.94 | +0.194 → +0.201 | 0.770 → 0.775 |
| intrastate_end | 1,105 → 1,105 | 1.00 → 0.99 | +0.112 → +0.109 | 0.734 → 0.735 |
| leader_exit / coup_attempt | 1,105 → 1,105 | unchanged | ±0.008 | ±0.007 |
| irregular_exit | 948 → 948 | 2.43 → 2.45 | −0.639 → −0.644 | 0.719 → **0.728** |
| democratic_deepening | 95 → 95 | 2.46 → 2.49 | −0.590 → −0.620 | 0.598 → 0.592 |
| **record_reopen** | 85 → 135 | 0.93 → **1.24** | **+0.255 → +0.007** | 0.760 → **0.631** |

And the 1950–2000 guard, which is what `engine/1` was taken for: `mid_war` exp/obs **2.62 → 1.91** and skill −0.530 →
−0.122; `mid_force` 1.17 → 0.98 and +0.008 → +0.112; `contest_settle` 2.00 → 0.87 and +0.083 → +0.429;
`intrastate_onset` 1.07 → 0.95. Against it, `irregular_exit` 2.00 → 2.48 (skill −0.485 → −0.712) and
`democratic_deepening` 1.18 → 2.15 (−0.006 → −0.457) — both on the actor-year side, both fitted on samples the gdp
interpolation changed, and `democratic_deepening` is a 47-unit single-as-of row.

### Reading it honestly

- **`record_reopen` is the turn's one clear loss and it is attributable.** Pooled skill +0.255 → +0.007. Two things
  did it, and both are correct data work. Retiring the two permanently dead records (corridors/3) removed the sample's
  two longest guaranteed non-events, and dating five wartime impairments (corridors/2, /7) added real short spells: the
  base rate goes 16.2% → 27.0% on n 154 → 148 with events 25 → 40. A hazard fitted at 27% run forward for twenty years
  over-fires, and the as-of 1920 row shows it — expected 22.2 against 4 observed. Part of the pooled fall is also an
  honesty artefact: as-of 1920 previously reported `no fit at as-of` and was **out of pooled**, and it is now a scored
  row with a bad number in it. The template's covariate block (`impair_duration` −0.26, `adjacent_war` −0.30,
  `guarantor_presence` −0.02, `sponsor_great_power` −0.74) does not discriminate at the declared split (holdout AUC
  0.500) and that is the next adversary's, not something to paper over by putting the phantom spells back.
- **`data/5`'s and `corridors/8`'s central claim is half falsified, by their own test.** They said `contest_settle`'s
  inverted at-risk ranking was an artefact of a homogeneous Versailles-bloc denominator and set the falsifier: if
  `auc_at_risk` does not rise above 0.5 at as-of 1910, 1920 **and** 1930 with the records in, the cause is the
  covariates. It rose at 1930 (0.21 → 0.76) and did not at 1910 (0.25) or 1920 (0.21). The sample was part of it; the
  covariate block is the rest, and that is `engine/3`'s (b), escalated.
- **The era interaction is the turn's largest number and it is a post-1945 result, not an interwar one.** 1950–2000
  `mid_war` exp/obs 2.62 → 1.91 with skill −0.530 → −0.122; the 1910–1940 window gains only what the label fix gives
  it, because at as-of ≤ 1940 the interaction is unidentified and sits at 0 by design. The two-dummy form buys another
  0.04 on the guard and costs 0.06 on this turn's window; the delta form was chosen and both numbers are recorded.
- **`mid_war` and `mid_force` still under-predict this era by 2–3x and the reason is unchanged.** Structural miss at
  as-of 1930 is 68 of 164 observed and at 1940 68 of 140 — pairs the relevance filter never admits, which is the
  coalition-relevance question (`engine/4`) and the fitted joining hazard (`statistics/4`), both open.
- **`war_end` improves on every number except the one its own `rejected:` entry already said not to trust.** Duration
  dependence more than doubles (+0.086 → +0.21), the base rate falls 3 points onto the real sample, holdout Brier and
  calibration improve at both splits — and holdout AUC is 0.634 at 1946 and 0.531 at 1975, on 32 war components. The
  template is a baseline hazard with a duration shape, not a discriminator, and the cluster count now says so in the
  fit line.

### Deferred

| finding | dataset | note |
|---|---|---|
| data/2 (the general case) | **CoW Inter-State War v4.0** participant-level dates | Six wars and eleven Korean contingents added by hand; the list is still a hand list and still sees only 62% of the label set's war-years. The worst remaining decades are outside this turn (1860s 63 actor-years, 1970s 44, 1990s 37). `peacesciencer` ships `cow_war_inter`; `scripts/fetch-contdir.mjs` is the fetch pattern. |
| data/3 (the residue) | a pre-1950 Baltic income series | LVA and LTU have no Maddison `gdp_pc` before 1973 and EST none between 1913 and 1990, so the Baltic interwar coups stay outside the regime fits. Declared in `data/history/actors.yaml` rather than filled. |
| data/7 (the 46 undeclared) | — | The actors that reach the panel through `codelist_panel.csv` need a lifecycle entry each before `capability_from` can be declared on them. The build now prints all 50 every run. |
| corridors/5, statistics/2 (the post-1945 record layer) | — | `COVERAGE` and now the two status templates' `window` both stop at 1945. Nothing after it is scored or fitted, so no corridor mechanism can be guarded post-war until the record histories are extended — Suez 1956–57 and 1967–75, Hormuz 1980–88, the Berlin corridors 1948–49, the Panama handovers. |

*Published slices (`public/*.json`) are deliberately not rebuilt: they are regenerated as one set at a re-baseline.*

*Rule check: no country ids were added to `data/templates.yaml` or `src/engine/`. `at_war_any_post46`, `pre_1946`,
`occupied` and `abandoned` are derived constants and status words, not places; every hand number added to
`data/corridors.yaml`, `data/territories.yaml` and `data/history/events.yaml` carries a `source:` or the literal
`estimate`.*

## Turn era-1945-1991-r2 — 2026-09-07

Backtest range `--from 1950 --to 1980 --step 10 --horizon 20 --runs 100 --universe all`.

**Baseline.** Every before/after below is against the as-of 1950, 1960, 1970 and 1980 rows and the `pooled` block of
`scores/backtest-1870-2010-h20-all.json` as it stood at the start of the turn (run 2026-09-08T04:52, 100 runs, all
states). The committed turn file `scores/backtest-1950-1980-h20-all.json` was written at 20 runs by an earlier
coalition sweep and is not a like-for-like baseline; it is overwritten by this turn's 100-run run. The full 1870–2010
file is regenerated.

### Pooled 1870–2010, before → after

| template | exp/obs | Brier | skill | AUC |
|---|---|---|---|---|
| **irregular_exit** | 2.45 → **1.24** | 0.205 → **0.117** | −0.644 → **+0.058** | 0.73 → 0.76 |
| **leader_exit** | 0.85 → **0.99** | 0.244 → **0.177** | −0.815 → **−0.340** | 0.73 → 0.74 |
| **chokepoint_status** | 0.85 → 1.17 | 0.247 → **0.222** | −0.007 → **+0.102** | 0.57 → **0.70** |
| **coup_attempt** | 0.75 → **0.90** | 0.161 → 0.149 | +0.165 → **+0.225** | 0.75 → **0.80** |
| record_reopen | 1.24 → 1.31 | 0.198 → 0.180 | +0.007 → **+0.055** | 0.63 → 0.66 |
| corridor_status | 1.09 → 1.13 | 0.207 → 0.197 | +0.106 → **+0.128** | 0.63 → 0.65 |
| autocratic_closure | 0.66 → 0.77 | 0.284 → 0.278 | −0.153 → −0.129 | 0.60 → 0.60 |
| intrastate_onset | 0.94 → 0.99 | 0.173 → 0.170 | +0.201 → +0.215 | 0.77 → 0.79 |
| democratic_deepening | 2.49 → 2.70 | 0.139 → 0.137 | −0.620 → −0.599 | 0.59 → 0.65 |
| intrastate_end | 0.99 → 1.04 | 0.173 → 0.173 | +0.109 → +0.110 | 0.73 → 0.74 |
| democratize_step | 0.82 → 0.80 | 0.301 → 0.298 | −0.204 → −0.194 | 0.55 → 0.55 |
| mid_force | 0.71 → 0.72 | 0.011 → 0.011 | +0.124 → +0.124 | 0.81 → 0.81 |
| mid_war | 0.68 → 0.69 | 0.005 → 0.005 | +0.033 → +0.034 | 0.78 → 0.78 |
| **contest_settle** | 0.63 → **1.16** | 0.142 → 0.088 | **+0.248 → +0.082** | 0.84 → 0.81 |

Turn window (`1950–1980`, 100 runs) after: `leader_exit` skill −0.323 Brier 0.192, `irregular_exit` −0.029 / 0.183,
`coup_attempt` +0.172 / 0.197, `intrastate_onset` +0.065, `mid_force` +0.120, `mid_war` −0.141, `chokepoint_status`
−0.056 on 4 as-of rows (it produced no row at all in this window before), `contest_settle` −0.075 on 4 rows.

### Applied

| finding | change | files | effect |
|---|---|---|---|
| data/1, statistics/1, engine/1 | `entryPrior` in `createWorld` extended with the leader block. Two of the four are structural facts and are set as such rather than as medians — `leader_tenure = 0` (a state entering the system has a leader who took office at about the year it entered) and `leader_irregular_entry = 0` (that leader did not overthrow the predecessor of a state that did not yet exist) — `leader_age` and `leader_military` take the live-actor median at as-of, `milper` the 25th percentile on the same reasoning `cinc` already uses, `info_access` the median. Every one is pushed to `a.imputed` by the existing `stepLifecycle` loop. | `src/engine/core.js` | The decolonisation cohort stops carrying probability exactly 0 on the three leader templates. `n_structural_miss` at as-of 1960 / 1970 / 1980: `leader_exit` **32 → 6, 24 → 9, 38 → 17**; `irregular_exit` **18 → 4, 11 → 4**, 4 → 4; `coup_attempt` **21 → 4, 16 → 5**, 7 → 6. `n_at_risk` 101 → **149**, 127 → **154**, 146 → **174**. `n_excluded_no_covariate` 56 → 9, 37 → 11, 49 → 21. The label `not_live_at_as_of` is gone from every leader row except one actor at as-of 1970 and 1980; what is left is real nulls (`gdp_growth` 18 and `regime` 6 at as-of 1980). Pooled `leader_exit` Brier **0.244 → 0.177** and its bottom calibration quintile 38→67 instead of 0→71. |
| data/1 (b) | `missingVars` in the backtest reconstructs the state `stepLifecycle` would build for an actor born inside the horizon — the panel row at `min(first live year, asOf)`, then the world's dated entry prior, then the structural zeros — and names the covariates that are *still* null, prefixed `entrant:`. | `scripts/backtest.mjs` | `excluded_vars` stops collapsing every mid-horizon entrant to one label. At as-of 1960 the leader_exit row now reads `gdp_growth: 6, regime: 1, leader_tenure: 4, leader_age: 4, at_war: 2` where it read `not_live_at_as_of: 47`. |
| data/2, statistics/5, engine/3 | REIGN's `irregular` column is **not** a flag: 4,332 distinct values over 138,600 rows, the four commonest being log 2, log 3, log 4 and log 5 — it is log(months since the state's last irregular leader change), and read as a flag it was 1 in 99.3% of actor-years and 0 exactly when an irregular change had just happened. `leader_irregular_entry` is now derived: a leader entered irregularly iff `exp(irregular) ≤ tenure_months` at the first observed month of that leader's spell, decided once per `(ccode, leader)` spell and carried across it. The raw column is kept, exponentiated and renamed `irregular_recency_months`. `applyActorEvent` now *clears* the flag on a regular `leader_exit`, so the coup-trap rewrite is no longer a no-op. | `scripts/build-panel.mjs`, `src/engine/core.js` | Non-zero share of the panel column **99.3% → 22.5%** (2,584 of 11,474 actor-years; 427 of 2,197 REIGN leader spells, 19.4%). The fitted coefficient on `irregular_exit` flips from **−0.69 to +0.09** at `--split 1986` with holdout AUC flat (0.845 → 0.843). It is positive and small, not the +1.28 the raw rate difference implies, because `win5(coup_attempt)` at +1.04 already carries most of the coup trap — recorded rather than argued away. |
| statistics/2 | `lag: 1` on `regime` **and** `gdp_growth` for `leader_exit`, `irregular_exit` and `coup_attempt`. V-Dem's RoW category for year *y* is measured across the year the coup happened, which is the leakage `docs/system.md` already documents for the regime templates and fixed there with `lead: 1`; it was never applied to the coup family. | `data/templates.yaml` | Exactly the predicted numbers. `irregular_exit`: `regime=1` **−0.81 → +0.20** (sign flip), `regime=2` **−2.52 → −0.85** (odds ratio 0.08 → 0.43), `regime=3` −2.89 → −2.52, in-sample AUC 0.849 → 0.802. `coup_attempt`: `regime=1` **−0.47 → +0.15**, `regime=2` **−1.39 → −0.31**, holdout 0.833 → 0.815. `gdp_growth` −0.19 → −0.04 / −0.26 → −0.14 / −0.22 → −0.07. The control holds: `leader_exit`'s regime coefficients barely move (0.68 → 0.63) — a routine exit does not move V-Dem RoW, a coup does. The AUC fall is the leakage leaving. Engine alignment checked and needs no change: `a.cur.regime` at the hazard draw already *is* regime[y−1], so `lag: 1` (which reads `a.prev`) is the same value, and `gdp_growth` is the one that actually moves — `a.cur.gdp_growth` is this year's simulated growth and `a.prev` is last year's, which is what the fit row now reads. |
| statistics/3, engine/4 | `irregular_exit` is drawn **inside** `leader_exit`, not beside it. A generic rule (`subsetNesting`): any actor-year template whose `event` matches another's and which adds an `event_filter` the parent does not have is a strict subset, so it is drawn at P(child \| parent) = p_child / max(p_parent, p_child) in the years the parent fired — the same construction and the same cap as the war-inside-dispute nesting. `applyActorEvent` no longer re-runs the leader replacement when one has already fired this year, on either the irregular or the coup path. `ENGINE_ABLATE=exit_nesting` restores the independent draws. | `src/engine/core.js` | Simulated leader turnover from as-of 1980 over 1981–2000 (40 runs): `leader_exit` **910 → 884 per run against 713 observed (1.24×)**, and the ~70 actor-years per run that fired both templates and replaced the leader twice are gone by construction. `irregular_exit` 104 → 99 per run against 59 observed. Per unit `pAny[irregular_exit] ≤ pAny[leader_exit]` now holds everywhere (as-of 1980: 65.0 against 156.4). |
| statistics/3 (b), engine/5 | The two hand-typed regime decrements on an irregular exit (`rng() < 0.5`) and a successful coup (`rng() < 0.6`) are **off**. They were unfitted constants stacked on `autocratize_step` / `autocratic_closure`, which are fitted on V-Dem RoW downward steps that already contain the coup-caused ones. `ENGINE_ABLATE=coup_regime_step` restores them. | `src/engine/core.js` | **Partial, and the number says so.** Simulated regime mix at 2000 from as-of 1980 (40 runs) **0.451 / 0.320 / 0.076 / 0.153 → 0.379 / 0.367 / 0.093 / 0.161**, against an observed 1980 mix of 0.447 / 0.293 / 0.107 / 0.153 and an observed 2000 mix of 0.182 / 0.324 / 0.265 / 0.229. With the typed steps in, the simulated world was frozen at its as-of mix; without them it moves, and it still does not reach the third wave. The finding's acceptance line (regime-0 share below 0.32, regime-2 above 0.15) is **not** met — 0.379 and 0.093. The predicted cost also lands: `coup_attempt` fires 104 per run against 133 observed (0.80×) where the typed channel had it at 1.01×, which is the finding's own diagnosis that the typed step was standing in for a missing regime feedback on `coup_attempt`. |
| statistics/4, engine/2 | A `candidates:` block on `irregular_exit`, which had none, with all seven terms measured; `great_game` and `info_access` promoted with lifecycle records; `presence_any` and `presence_change` recorded under `rejected:`. | `data/templates.yaml` | Ablation at holdout ≥ 1986 against base (AUC / Brier / exp-obs) **0.770 / 0.0098 / 2.52**: `great_game` 0.780 / 0.0096 / 2.15, `info_access` 0.773 / 0.0096 / 1.65, `anticoup_norm` 0.774 / 0.0096 / 1.99, `milper_share` 0.777 / 0.0097 / **2.63**, `year_trend` (the null benchmark) 0.776 / 0.0095 / 1.93, `presence_any` 0.779 / **0.0099** / **2.60**, `presence_change` 0.772 / 0.0098 / 2.52. Promoted **jointly**: `great_game` +0.57 and `z(info_access)` −0.40 give **0.775 / 0.0095 / 1.51** — the best Brier and the best calibration of any combination tried, and better than the bare trend. `great_game` is also the only term that survives the all-candidates joint fit (+0.41 there, while `info_access` collapses to +0.04 and `anticoup_norm` to −0.07). |
| data/3 | The split states V-Dem/OWID codes separately and the registry never claimed: DEU `owid_alt: OWID_GFR` 1949–1991, DDR `owid: OWID_GDR` (it was `null`, which `loadActors` defaults to the id — a code no OWID file carries), VNM `owid_alt: OWID_DRV` 1954–1976, and hand entries for YEMEN_ARAB_REPUBLIC (OWID_YAR), YEMEN_PEOPLE_S_REPUBLIC (OWID_YPR), REPUBLIC_OF_VIETNAM (OWID_RVN) and ZANZIBAR (OWID_ZAN). | `data/history/actors.yaml` | Live actor-years with `regime == null` in 1946–1991 **339 → 163**, and the residue is the Caribbean/Pacific microstates V-Dem genuinely does not cover. DEU regime 1950 = 3, DDR 1950 = 0, VNM 1965 = 1 where all three were null. `dyadHazards` returns `{}` on a null regime, so these actors carried probability exactly 0 on every dyad for their whole Cold War life; `mid_force` `n_at_risk` at as-of 1960 / 1970 / 1980 **890 → 927, 964 → 1006, 1090 → 1146** and `n_structural_miss` 59 → 54, 50 → 45, 53 → 51. |
| data/4 | `817: 'VNM'` removed from the hard-coded `extra` table — CoW 817 is the Republic of Vietnam, not the DRV — and a hand entry added for it. `makeCodeMap`'s candidate set widened from the *simulated* actors to every **hand-coded** actor, selected by liveness at the queried year, with the same `extra` → panel fallthrough for a code no candidate is live for (so the `spans: []` codelist twins can never win a lookup). | `scripts/lib/hist.mjs`, `data/history/actors.yaml` | South Vietnam exists: `REPUBLIC_OF_VIETNAM` has a panel row with regime 0, cinc 0.0065 and leader_age 42 at 1965. Saigon's record leaves Hanoi's actor-year row — **coup events VNM 7 → 0, RVN 0 → 7; leader_exit VNM 10 → 1, RVN 0 → 9**; VNM's 1954–1975 event count 54 → 34 with 31 on RVN. |
| data/6 | The Yemens dated. YAR was live 1918–2025 alongside YEM 1990–2025 — 36 years of two live actors for one state, the older of them covariate-free and still a live at-risk unit scored at p = 0. Hand entries retire YAR and the PDRY at 1990 with `successor: YEM`, and YEM claims `gw: 678` from 1990 so the UCDP join lands on the live state. | `data/history/actors.yaml`, `scripts/lib/hist.mjs` | `YEMEN_ARAB_REPUBLIC.live[2000] = 0`, `YEM.live[2000] = 1`. The **5 post-1991 intrastate onsets, 1 ending and 2 interstate onsets** move from the dead actor to the live one (`YEM intrastate_onset ≥ 1991: 0 → 5`). |
| data/5 | The World Bank PPP series spliced onto `gdp_pc` where Maddison has no row: level-matched by the geometric-mean ratio on the actor's own overlap, else by the pooled ratio, only into null years, flagged in a new `gdp_pc_wb` column and printed every build. | `scripts/build-panel.mjs` | **1,313 actor-years filled across 186 actors**; live actor-years 1950–2020 with `gdp_pc` null while `gdp_pc_ppp` is not: **827 → 0**. Pooled log ratio −0.014 over 5,149 overlap actor-years. The three covariates that die with `gdp_pc` come back with it: `leader_exit`'s `excluded_vars.gdp_growth` at as-of 1980 / 1990 / 2000 / 2010 goes **17 → 18, 21 → 9, 31 → 2, 33 → 3**. At as-of 2010 it was the single largest exclusion reason of any kind and it is now three actors. It does not move at 1980 because the World Bank PPP series begins around 1990 and there is nothing to splice before it — that residue is deferred below. |
| corridors/3 | Eight records still named a power that had left. Dated control transfers added: `sunda_strait` → IDN 1949.99 (the record had NLD to 2026), `bab_al_mandab` → the PDRY 1967.92 and YEM 1990 (it had GBR to 2023), `hormuz` → OMN 1971.92 (GBR to 1984), `malacca` → MYS 1957.66 (GBR to 2023), `kiel` → DEU 1955.34 (GBR to 2026), `sind_pishin_chaman` → PAK 1947.62, `delagoa_bay_railway` → PRT 1902 and MOZ 1975.48, `taiwan_strait` → TWN/USA from 1949–50 (the record made the PRC controller of the strait through 1996). Each with the crisis rows that go with it. | `data/corridors.yaml` | The departed power leaves each record's transit set, so Britain's Korea, Suez, Falklands and Gulf wars stop setting `adjacent_war` on the Kiel Canal, the Malacca Strait and a Baluchistan railway. |
| corridors/3 (b) | `load_bearing_for` is one undated 2026 map per record read at every simulated year. `corridorStake` now takes the year and honours a record-level `load_bearing_from`, returning 0 before it; the eleven records added or corrected here carry the field. The remaining 62 do not and the `corridor_stake` candidate's evidence block now says so. | `src/engine/core.js`, `scripts/lib/fit.mjs`, `data/corridors.yaml`, `data/templates.yaml` | The dampener stops knowing Japan's Gulf-oil dependence and Singapore's Malacca dependence in 1950 *on the records that declare it*. The candidate is still measured on a partial lookahead and that is now recorded rather than silent. |
| corridors/4 | `berlin_corridors`: the road, rail, canal and air access routes, seven dated rows — the four-power access agreements of 1945, the closure of 24 Jun 1948, the reopening of 12 May 1949 after 322 days, the 1958 ultimatum, the Wall, the Quadripartite Agreement of 3 Sep 1971, and 9 Nov 1989. | `data/corridors.yaml` | The era's defining corridor crisis is in the layer, and with it the one case where a chokepoint closure produces a great-power confrontation without a war and reopens because the guarantor's weight went **up**. |
| corridors/5 | `tiran`: seven dated rows from the 1949 Egyptian batteries through the closure of 22 May 1967, the seizure of Sharm el-Sheikh, the 1979 treaty guarantee and the 1982 MFO. | `data/corridors.yaml` | The Six-Day War's proximate cause is a chokepoint closure sixteen days before the war, not a canal closing because a war happened — which is all the `suez` record could say. |
| corridors/6 | The southern-African system: `benguela_railway` (built 1931, cut Aug 1975, reopened 2014), `beira_corridor` (the Beira Patrol from 1966, closed by Mozambique 3 Mar 1976, reopened 1980, contested from 1982), `lourenco_marques_railway`, and `tazara` (agreement 5 Sep 1967 → building Oct 1970 → through traffic Oct 1975 → handover 14 Jul 1976). `cape_bulawayo` gets the Rhodesian UDI, the border closure of 9 Jan 1973 and the 1978 reopening. | `data/corridors.yaml` | The layer's only Cold War instance of a corridor built by a third-party great power to break another power's chokepoint — the sequence `sponsor_great_power` and `record_building` are fitted on, whose every other instance was an imperial railway before 1914. |
| corridors/7 | The Soviet energy set: `druzhba_pipeline` expanded from one row to four (CMEA agreement 18 Dec 1959, the COCOM large-diameter pipe embargo of 18 Nov 1962, first oil 1964, Druzhba-2 1974), plus `bratstvo_pipeline`, `soyuz_pipeline`, `urengoy_uzhgorod` (contracts Nov 1981, US sanctions 29 Dec 1981, extension to European subsidiaries 18 Jun 1982, lifted 13 Nov 1982, gas Jan 1984) and `bam_railway`. | `data/corridors.yaml` | The alliance-splitting pipeline fight is in the layer. |
| corridors/8 | The great-power chokepoint confrontations, all of them gaps inside records that already existed: `taiwan_strait` 1950 / 1954–55 / 1958, `panama` 1964 / 1977 / 1979 / 1989, `malacca` under Konfrontasi 1963–66, `gibraltar`'s Spanish frontier closure 1969–1985, and a new `florida_straits` record for the quarantine of 24 Oct – 20 Nov 1962. The Panama 1979 row is aligned with `data/territories.yaml`'s `panama_canal_zone 1979.75`, which the two layers had disagreed about. | `data/corridors.yaml` | 62 → 73 records, 15 → 18 chokepoints. Chokepoint transitions in 1946–1991 **7 → 42** on the adversary's count and **39** on the fitter's own labels. |
| corridors/1 | The `chokepoint` window and `COVERAGE` entry reopened to **1991** — and only that one, because the gate was measured before anything moved. | `data/templates.yaml`, `scripts/backtest.mjs` | Chokepoint label rate 1946–1991 **4.73%** over 825 record-years against **5.19%** over the 1,080 coded ones: inside the factor of 1.5. `chokepoint_status` fit sample 1,031 → **1,905** rows / 56 → 95 events, and the template produces a scored row at all four as-of years of this turn where it produced none. Pooled 1870–2010 skill **−0.007 → +0.102**, AUC **0.57 → 0.70**, `n_as_of_rows` 6 → 11. |
| corridors/2 | 24 territory records carried a single 2026 first row, so a dispute open since 1947 contributed nothing to the era. Dated histories added to all of them (`golan`, `gaza`, `west_bank`, `shebaa`, `taiwan`, `senkaku`, `paracels`, `spratlys`, `korean_dmz`, `dokdo`, `kashmir_pak`, `siachen`, `abu_musa_tunbs`, `northern_cyprus`, `western_sahara`, `somaliland`, `abkhazia`, `south_ossetia`, `transnistria`, `kurdistan_region`, `scarborough`, `nagorno_karabakh`, `zangezur_syunik`), eight missing records added with **both** endpoints (`goa`, `west_new_guinea`, `hong_kong`, `south_west_africa`, `sinai`, `falklands`, `ogaden`, `aouzou`), and `rhineland` — whose last row was the 1936 remilitarisation and which was therefore scored as an open territorial contest in 1980 — closed at the Paris Agreements, 5 May 1955. | `data/territories.yaml` | Unsettled records at 1950 / 1960 / 1970 / 1980: **10 / 5 / 5 / 5 → 23 / 20 / 20 / 25**, and they include `kashmir_pak`, `golan`, `west_bank`, `taiwan` and `korean_dmz` as the finding's test requires (it asked for ≥ 30 and got 20–25). `contest_settle` fit sample 1,453 → **3,105** rows / 43 → 51 events; the template stops being `underpowered` at as-of 1960 and 1970 and carries a non-null `auc_at_risk` at all four. Pooled `n_as_of_rows` 5 → 11. **This is also the turn's one clear regression — see below.** |
| data/8, statistics/7, engine/7 | The bare `continue` for a template outside its `COVERAGE` window replaced by a reported row: `{ n: 0, reason, coverage, scored_years: 0 }`, kept out of `pooled` exactly as the other `n: 0` rows are. | `scripts/backtest.mjs` | Every as-of row now carries an entry for every fitted template. `corridor_status` and `record_reopen` say out loud, at as-of 1950–1980, that their ground truth ends at 1945 — where before they were simply absent from the row and a reader could not tell that from a layer that was scored and found perfect. |
| statistics/6 | `expected_count` / `observed_count` / `count_ratio` on every actor-year row, plus a `saturated` marker when the horizon base rate passes 0.5. Reported, not pooled: the pooled score stays the Brier so every previous run remains comparable. | `scripts/backtest.mjs`, `docs/system.md` | `leader_exit` is the one template over the line (pooled horizon base rate 0.84, so `brier_base` = 0.13 and the reference forecaster is nearly perfect by saying "yes"). Its counts at as-of 1960 / 1970 / 1980 are **781 / 502, 710 / 515, 885 / 713** — a 1.24–1.56× over-firing that the any-event Brier reported as a mild *under*-prediction of 0.92–1.16. |
| engine/8 | `scripts/analysis/polarity.mjs` prints the simulated polarity-transition rate per 100 world-years next to the observed one, and `docs/system.md` says what the layer actually does forward. | `scripts/analysis/polarity.mjs`, `docs/system.md` | **0.00 simulated over 190 run-years against 2.38 observed over 210 years.** The claim that "a run can change polarity" is true of the fit and false of the simulation: nothing but the growth drift moves a pole's share, and a great power's collapse has no hazard. Polarity is frozen at as-of alongside the great-power flag, the alliance graph, the border graph and `world.nukes`, and that is now stated rather than left to be discovered. The mechanism is escalated. |

### What got worse, and why it is in the file

- **`contest_settle` is the turn's one clear regression, and it is mostly an honesty artefact.** Pooled 1870–2010
  skill **+0.248 → +0.082** and AUC 0.84 → 0.81 — on `n` 190 → **633** and `n_as_of_rows` 5 → 11. Before this turn the
  template's at-risk set in this era was five territory-years, none of them a live Cold War dispute, and the as-of 1960
  and 1970 rows were `underpowered: true` and **out of pooled**. They are now scored rows with a bad number in them:
  exp/obs 4.05 at both, against 2 observed settlements each. The template over-fires on a denominator that has
  quadrupled, which is the same shape as `record_reopen` last turn. The covariate block
  (`contest_duration` −0.11, `contest_reversible` +0.53, `contest_at_war` +0.14, in-sample AUC 0.589) does not
  discriminate, and that is the open question `era-1914-1945-r2/engine-3` already escalated — the sample was part of
  it, the covariates are the rest, and now there is a sample to test them on.
- **`leader_exit` is still at −0.34 and cannot get much further on this statistic.** Its horizon base rate is 0.84, so
  `brier_base` is 0.13 and every unreachable unit costs the full 1.0. The at-risk units are told truthfully (mean
  predicted 0.93–0.99 against observed 0.87–0.91); the residue is the 17 units at as-of 1980 the model still cannot
  reach, and 18 of those are a null `gdp_growth` in the pre-1990 microstate years neither Maddison nor the World Bank
  covers. `expected_count` / `observed_count` is the statistic that can move, and it is now in the file.
- **Removing the typed regime steps costs coup calibration, exactly as the finding predicted.** `coup_attempt` fires
  0.80× the observed count from as-of 1980 where the typed channel had it at 1.01×, and pooled `democratize_step`
  under-fires slightly more at as-of 1980 (exp/obs 0.73 → 0.67, Brier 0.258 → 0.283) because fewer actors are pushed
  down into its `regime_max: 1` at-risk set. Pooled over 1870–2010 both templates still improve. The trade is: an
  unfitted hand-typed channel that was twice the size of the fitted one, against a measured 0.2 of coup calibration.
- **`irregular_exit` loses the as-of 1960 row from `pooled`.** Promoting two covariates took the refit at labels
  ≤ 1960 to 12 estimated terms over 26 events, `epv` 2.17, below the `MIN_EPV` guard — so the row is reported and kept
  out. That is the guard working, not a hidden loss, but it means the turn's pooled `irregular_exit` is 2 as-of rows
  where the baseline had 3.
- **`corridor_status` and `record_reopen` did not get their windows.** The entries landed; the gate did not pass
  (1.63% against 4.32%, and 7.44% against 27.33%). The diagnosis is in `data/templates.yaml` on both templates and the
  fix is escalated: it is a dated `retired:` on about a dozen records that stopped being corridors decades ago and are
  still scored as live at-risk record-years, not more history rows.

### Deferred

| finding | dataset | note |
|---|---|---|
| data/7, statistics/8, engine/6 | **Archigos 4.1** (Goemans–Gleditsch–Chiozza, 1875–2015) | Escalated rather than deferred — it is a new dataset and a new derivation in `build-panel.mjs`. `docs/escalations.md`. Until it lands, the three leader templates have no fit at as-of 1870–1950, which is nine of fifteen as-of rows and the first as-of year of this turn. |
| corridors/1 (residue) | — | A dated `retired:` on a corridor record, escalated. 29 of the 46 corridor records have no post-1945 transition and about a dozen of those correctly have none. |
| data/5 (residue) | a pre-1990 income series for the Caribbean and Pacific microstates | The World Bank PPP series starts around 1990, so the splice fills nothing before it: 18 actors still lose `gdp_growth` at as-of 1980 and that is the largest remaining exclusion on `leader_exit`. |
| data/3 (residue) | — | 163 live actor-years 1946–1991 still have `regime == null`, all of them microstates V-Dem does not cover (BHS 19, GRD 18, WSM 16, DMA 14, LCA 13, VCT 13 …). They should be declared out of the at-risk set with a reason rather than scored at p = 0 as certain non-events; that needs a `default_outside`-style declaration on the templates and is not a data fetch. |

*Published slices (`public/*.json`) are deliberately not rebuilt: they are regenerated as one set at a re-baseline.*

*Rule check: no country ids were added to `data/templates.yaml` or `src/engine/`. `load_bearing_from`, `gdp_pc_wb`,
`irregular_recency_months`, `subsetNesting`, `COUP_REGIME_STEP` and `NO_EXIT_NESTING` are generic fields, columns and
switches. Every hand row added to `data/corridors.yaml` and `data/territories.yaml` carries a `source:`; every
`load_bearing_for` and `stakes` map carries `load_bearing_source: estimate` / `stakes_source: estimate`. Both
promotions on `irregular_exit` carry a `lifecycle:` record with the ablation numbers, and both rejections a
`rejected:` entry with theirs.*

## Turn era-1991-2026-r2 — 2026-09-07

Backtest as-of range for the turn: 1990 and 2000 (step 10). The 2010 row is reported throughout because the horizon
opening at 2011 is where three of this turn's coverage moves stop.

### Applied

| finding | change | files | effect |
|---|---|---|---|
| **data/1** — the dyadic ground truth stops in 2001 | `scripts/fetch-mid.mjs` pulls GML MID 2.2.1 (`gml_dirdisp.rda` via peacesciencer) into `data/raw/hist/gml_dirdisp_2.2.1.csv`; `scripts/lib/rdata.mjs` gained an EXTPTRSXP case (readr stamps one on every tibble) and xz/bzip2 decompression; the pairs are spliced onto midb 3.02 from 2002 in `build-events.mjs` and the participant-years in `build-panel.mjs`; `COVERAGE.mid_force/mid_war/war_end` and the three template windows move [1816, 2001] → [1816, 2010] | `scripts/fetch-mid.mjs`, `scripts/lib/rdata.mjs`, `scripts/build-events.mjs`, `scripts/build-panel.mjs`, `scripts/backtest.mjs`, `data/templates.yaml` | as-of 1990 `mid_force` `scored_years` **11 → 20** (exp 76.5/obs 98 → 122.8/112, AUC 0.765 → 0.778); as-of 2000 **1 → 10** (exp 10.8/obs 16 → 79.8/45, AUC 0.804 → 0.909); `mid_war` the same. 56 spliced pairs, 6.2 onsets/yr over 2002-2010. Join validated on the overlap: GML 14.0 pair-onsets/yr over 1992-2001 against midb's 14.5 |
| **data/2** — `at_war` is a hand list, empty for most of 1992-2024 | unioned with UCDP/PRIO type-2 (interstate) actor-years 1946-2024 inside the loop that already parsed them; `at_war_ucdp` records which source a 1 came from | `scripts/build-panel.mjs` | at_war 1992-2024 actor-years **14 → 93** (207 added overall). The only zero years left (1993, 2004-07, 2009-10) are years UCDP itself records no interstate conflict |
| **data/3** — the capability composite drops 11 live states in 2024 | an actor live past NMC's end that the composite cannot reach is CARRIED at its last CINC with `cinc_carried` = years since, instead of vanishing; each extension year is normalised to the mass CINC carried over *the actors present in that year* | `scripts/lib/capability.mjs`, `scripts/build-panel.mjs` | live actors with a non-null `cinc` in 2024 **184 → 195**; PRK 2024 equals its 2022 value exactly; the column sum is 1.0071 in 2022, 2023 and 2024 alike (was 1.0071 → 1.0009); polarity poles and `hegemon_share` unchanged to three decimals |
| **statistics/1** — every promotion record quotes a leaky coefficient | the ablation reports `coefs` from the TRAIN-ONLY fit (and `coefs_insample` separately), and refuses to score a variant whose added term is constant over the training half, emitting `degenerate_in_train` + `unidentified at this split` | `scripts/lib/fit.mjs`, `data/templates.yaml` | `anticoup_norm` on `irregular_exit` and `coup_attempt` and `cold_war` on `coup_attempt` now report as unidentified instead of a fabricated gain. The `irregular_exit` anticoup_norm evidence block is RETRACTED with the proof (prior −0.5 vs 0 gave 0.743/0.0098/1.22 vs 0.749/0.0099/1.43, identical to base) |
| **statistics/4 + data/6** — `aid_conditionality` codes "not a recipient" as missing | a missing ODA/GNI row inside the era is a structural zero; `aid_recipient` keeps "never in the series" separable | `src/engine/polarity.js`, `scripts/build-panel.mjs`, `src/engine/core.js` | nulls over live actor-years 1995-2014 **1,259 → 0**. `democratic_deepening` n 2,275 → 2,399 and events 36 → 43; `autocratic_closure` n 7,206 → 7,396, holdout AUC 0.543 → 0.556; `democratize_step` n 9,731 → 9,918 |
| **engine/1** — `expected_count` summed over the full horizon | `runEnsemble` exports `expectedWithin(key, years)` off the `yearHist` it already accumulates; the backtest truncates the count the same way it already truncated the indicator | `src/engine/core.js`, `scripts/backtest.mjs` | as-of 2010 `leader_exit` `count_ratio` **1.811 → 1.29** (scored_years 11 of a 15-year horizon), `irregular_exit` 0.63 → 0.50, `coup_attempt` 0.48 → 0.36. Every row with `scored_years == horizon` is unaffected |
| **engine/4** — the rivalry memory is dead after 2001 | `createWorld` and `scripts/lib/fit.mjs` seed the dyad trace from `DYADIC_DISPUTE` = mid_force ∪ mid_war ∪ `interstate_onset` (one exported set, so the fit and the simulation agree); the panel's `mid_force`/`mid_war` are nulled outside their source window instead of written as measured 0s | `src/engine/core.js`, `scripts/lib/fit.mjs`, `scripts/build-panel.mjs` | at as-of 2025 RUS\|UKR reads 2022 / rivalry 0.61, IRN\|ISR 2018 / 0.32, CHN\|IND 2020 / 0.44, and pairs above 0.2 go **0 → 8** (the finding hoped for ≥15; 8 is what UCDP's interstate onsets support and is reported as measured) |
| **engine/3** — the World Bank splice injects a fake +0.43 log growth into 2023 | past an actor's own last Maddison year `gdp_pc` is CHAINED on the World Bank series' year-on-year growth (no level join, no seam); interior and whole-life gaps keep the ratio splice but on the last `SPLICE_YEARS` overlap years, which is what `capability.mjs` already did; a build guard fails if the median live-actor \|gdp_growth\| in any year exceeds 0.15 | `scripts/build-panel.mjs` | median live-actor `gdp_growth` in 2023 **0.426 → 0.057**; the share of actors over ±0.10 falls from 0.75 to 0.09; USA 2023 gdp_pc 91,286 → 61,920 |
| **engine/5** — capability MASS projected by PER-CAPITA growth | `stepPolarity` projects by `exp(gdp_growth + popGrowth)`, the population half being the `popGrowth` `buildActorState` already computes and the drift loop already applies fourteen lines later; `POP_GROWTH_MEAN` = 0.0174 is the panel's own 1900-2000 live-actor mean (n=9,977) | `src/engine/core.js` | the projector no longer omits a factor of 4.2 in projected mass between COD and JPN over 40 years |
| **engine/7 + data/8 (a)** — the derived era block is null for all of 2025 | the polarity block carries the last measured capability distribution forward (restricted to the actors alive that year, renormalised) with `capability_carried` recording the staleness; `dem_share_n` and `dem_share_live` are written every year; the simulated dem-share delta is scaled by the ratio of the simulated to the panel denominator | `scripts/build-panel.mjs`, `src/engine/core.js` | every era column is non-null for all 195 live actors at 2025 (was null for all of them); `panel.meta.polarity` gains a 2025 row (bipolar USA/CHN, dem_share 0.497 over 173 of 195) |
| **data/7 + engine/6** — the alliance graph is frozen at 2000 | `scripts/fetch-atop.mjs` pulls ATOP 5.1 (1815-2018); `scripts/lib/hist.mjs:loadPacts` is now the ONE construction read by the panel, the fitter, the backtest and run-forward — CoW 3.03 ≤ 2000, ATOP 5.1 2001-2018, the 2018 edge set carried past it, plus three dated `kind: pact` accession rows in `data/history/events.yaml` for MKD 2020, FIN 2023 and SWE 2024 | `scripts/fetch-atop.mjs`, `scripts/lib/hist.mjs`, `scripts/build-panel.mjs`, `scripts/lib/fit.mjs`, `scripts/backtest.mjs`, `scripts/run-forward.mjs`, `data/history/events.yaml` | `world.allied` **1,010 edges at every as-of → 1,010 (2000) / 1,681 (2010) / 1,752 (2025)**. `pact_usa` turns on for ROU BGR SVK SVN EST LVA LTU in 2003, ALB HRV 2008, MNE 2016, MKD 2020, FIN 2023, SWE 2024 — ATOP dates from signature, so the seven are 2003 where the finding expected 2004, and that is ATOP's convention rather than an error. **`defence_pacts` halved**: both sources ship DIRECTED dyad-years and the old loop counted every partner twice; it feeds no template and its source line now says so |
| **data/8 (d)** — `oil_production` duplicates `oil_prod` | the fold's clash guard is value-based as well as name-based (median \|log ratio\| < 1e-6 over the overlap AND the new column adds < 1% of its own cells); near-duplicates within 1e-4 are reported, not refused; `oil_production` is retired in `data/variables.yaml` with the measurement | `scripts/build-panel.mjs`, `data/variables.yaml` | one fewer series column. `population_wpp` correctly PASSES (it matches `population` over 2000-2023 and then supplies 2024-25, which `population` does not have); `oil_demand ~ oil_twh` at 9.9e-6 is reported as the outstanding reconciliation it is |
| **data/8 (b, c, e) + statistics/6 (a, d)** — the modern fold's window, the snapshot's year and the RoW claim | `wb()` gained the `inWin` treatment every other fetcher had and `MODERN_FROM` moved 2000 → 1950, so each column carries its source's own range and its source line states the OBSERVED first/last year; the snapshot's one-year lookahead over the panel's last measured year is declared in every snapshot column's source line; `ORDINAL_NOTE.regime_type` withdraws the "as the panel's `regime`" claim and the build prints the disagreement every run; a build guard refuses any template covariate over a single-year column | `scripts/lib/modern.mjs`, `scripts/build-panel.mjs` | `median_age` / `working_age_share` / `fertility` / `old_age_share` / `net_migration` / `population_wpp` **5,070 → 14,820 actor-years each, introduced 1950**; `oil_demand`/`gas_demand`/`coal_demand` 1,950 → 4,405; `regime_type` disagrees with `regime` for 11 of 44 actors and now says so |
| **statistics/6 (b, c)** — an age-structure term, and the infant_mortality measurement | `median_age` added as a candidate on `intrastate_onset` and `coup_attempt`, measured and NOT promoted; the `infant_mortality` candidate finally carries its numbers | `data/templates.yaml` | intrastate_onset base 0.816/0.0418/0.73 vs median_age 0.807/0.0420/0.67 (fitted −0.62, right sign, no discrimination, costs 228 rows); coup_attempt base 0.798/0.0205/1.19 vs 0.801/0.0205/1.21 (fitted −0.19 on the same sample). infant_mortality 0.810/0.0425/0.55 against base, a loss on all three |
| **statistics/7** — the composite's acceptance test cannot see rank | `validate()` reports the worst-year Spearman and the largest displacement of a CINC top-20 actor, both written into `sources.cinc_spliced`; an actor whose \|log splice factor\| exceeds ln 2 is not extended from the composite but carried at its last CINC | `scripts/lib/capability.mjs`, `scripts/build-panel.mjs` | the record now reads r=0.9637, log r=0.9814, **worst-year Spearman 0.9746 (2000), top-20 rank displacement 43 places (PRK, 2022)**; 28 actors refused for an extreme factor (PRK, ERI, IRL, ISL, MLT, PAN, CRI and the microstates) and carried instead |
| **corridors/3, 4, 5, 6, 7** — the era's corridor layer | 1992-2025 history on bosphorus, suez, hormuz, panama, malacca, taiwan_strait, tiran, gotthard_tunnel, trans_siberian, the three Ukrainian gas lines, druzhba and nord_stream (whose two distinct closure mechanisms are now separate rows); eleven new records — kerch_strait, black_sea_grain_corridor, lachin_corridor, yamal_europe, blue_stream, turkstream, balticconnector, estlink, c_lion1, red_sea_cables, taiwan_matsu_cables; dated instruments for instc, china_iran_turkey, development_road, imec, gulf_landbridge and zangezur in place of a 2026 snapshot row; `exists_until` + `exists_until_source` as a new record field, honoured by `corridorLastYear` in the engine, the fitter and the backtest, set on 20 records whose thing has ended; `speculative: true` on the three with no dated instrument | `data/corridors.yaml`, `src/engine/core.js`, `scripts/lib/fit.mjs`, `scripts/backtest.mjs`, `docs/schema.md` | corridor records 73 → 84. `corridor_status` fitted n 1,684 → 3,721 and events 71 → 139; `chokepoint_status` sample tightened 1,905 → 1,859 rows at the same 95 events. Chokepoint events in `data/events.json` 140 → 162, corridor 193 → 269 |
| **corridors/1** — the era is corridor-blind | measured on the label rate the fitter sees, before moving anything: **corridor 3.52% over 1,107 modern record-years against 4.77% over the 1,529 coded ones = 0.74**, inside the [0.67, 1.5] band, so `COVERAGE.corridor` and the template window move [1869, 1945] → [1869, 2025] | `scripts/backtest.mjs`, `data/templates.yaml` | `corridor_status` goes from `n: 0` at as-of 1990, 2000 and 2010 to **n=25 AUC 0.696 / n=28 AUC 0.781 / n=33 AUC 0.742** |
| **corridors/2 + data/5** — no coded settlement after 1999 | fifteen records added to `data/territories.yaml` with dated `history`: the nine settlements the era actually produced (Cordillera del Cóndor 1999, Macau 1999, Timor-Leste 2002, Bakassi 2008, Badme 2018, San Andrés 2012, Preah Vihear 2013, Peru-Chile maritime 2014, the India-Bangladesh enclaves 2015) and six contests that stayed open and belong in the denominator (Piran Bay — `frozen`, not settled, because the 2017 award is unimplemented — Kosovo, Abyei, Aksai Chin / the LAC, the Kurils, the Hala'ib triangle) | `data/territories.yaml` | settlements coded in 2001-2025 **0 → 7**. `contest_settle` at as-of 2000 goes from exp 8.4 / obs **0** / AUC null to exp 10.8 / obs **5** / **AUC 0.795**, and at as-of 2010 from 5.6 / 0 / null to 7.9 / **5** / **0.745** |
| **corridors/8 (a)** — two disagreeing estimates of one quantity | the `chokepoint_*` panel columns are written from `data/corridors.yaml` `load_bearing_for`; the `chokepoint_exposure` registry variable is retired with the four disagreements measured | `scripts/build-panel.mjs`, `data/variables.yaml` | one estimate instead of two. Still valued at the snapshot year alone, because 61 of the 84 records with a `load_bearing_for` carry no `load_bearing_from` — deferred below |
| **statistics/8 (a, b)** — `liberal_erosion` is never scored | `scores/backtest-1990-2015-h10-all.json` added, and the template marked `lifecycle.phase: unvalidated` with the result | `data/templates.yaml`, `scores/` | as-of 2015 gives the template its **first out-of-sample row ever**: n=41, 26 at risk, **predicted 0.5 against 17 observed**, count_ratio 0.03, AUC 0.45 (auc_at_risk 0.61), flagged underpowered. as-of 1990-2010 still report `no fit at as-of` |

### Skipped, with the reason

- **statistics/2 — the durable regime-label filter.** Built and measured, then NOT adopted, and the numbers are in a
  `rejected:` block on `democratize_step`. The defect is real: 321 of 1,130 `regime_change` events (28%) reverse
  within three years, so `scripts/build-events.mjs` now stamps `durable` and `flap` on every event and
  `data/events.json` carries both. What failed was FILTERING on it. Two full rolling-origin runs, identical except
  for `event_filter: { durable: 3 }` on the four regime templates (pooled skill / AUC / exp-obs):
  `democratize_step` −0.226 / 0.544 / 0.69 with the filter against −0.194 / 0.545 / 0.80 without;
  `democratic_deepening` −1.270 / 0.768 / 4.48 against −0.739 / 0.693 / 2.94; `autocratic_closure` −0.115 / 0.575 /
  0.72 against −0.125 / 0.604 / 0.77. Worse on the loop's own statistic for two of three and a wash on the third.
  k=2 is no better on the fit holdout. The flags stay so the next turn can model the flap instead of deleting it.
- **corridors/1, the chokepoint half.** Measured after coding the era and retiring the dead records: 3.27% over 581
  modern chokepoint-years against 5.11% over the 1,859 coded ones, a ratio of **0.64** against the 0.67 floor. The
  entries closed a third of the gap (0.56 → 0.64) and did not close it, so `COVERAGE.chokepoint` stays at 1991 and
  as-of 1995/2000/2005 keep their `n: 0`. Nine of the eighteen records have no 1992-2025 transition and they are
  genuinely quiet straits (Gibraltar, the Danish Straits, Kiel, Dover, Magellan, Sunda, Corinth, the Florida
  Straits), not missing history — so what closes the rest is a modern chokepoint the layer does not have.
- **corridors/1, `record_reopen`.** Its own rate is 6.87% over 131 modern impaired record-years against 27.52%
  coded, a ratio of 0.25, and the cause is real rather than uncoded: Benguela 1975-2014, Kerch and Yamal closed
  since 2022 and the Ukrainian transit lines since 2025 are long modern closures that have not ended. Window
  unchanged.

### Escalated

| id | title |
|---|---|
| era-1991-2026-r2 / data-4 | a regime source for the 22 live states V-Dem does not cover (Bjørnskov–Rode or Boix–Miller–Rosato) — the numerator of `dem_share` and the 2024 anticoup switch-off |
| era-1991-2026-r2 / statistics-3 | a UCDP-derived dyadic conflict kind for 2011-2024 (a new event kind, so a new template kind) |
| era-1991-2026-r2 / engine-2 | the era terms need a forward distribution: `promotion_era` can switch off in a simulation and never on |
| era-1991-2026-r2 / data-8 (b) | the panel's year axis should reach the modern snapshot's own year |
| era-1991-2026-r2 / statistics-7 (3) | restore CINC's military-personnel component (World Bank MS.MIL.TOTL.P1) |

### Deferred

| finding | what it needs | note |
|---|---|---|
| corridors/8 (b) | a dated `load_bearing_from` on 61 records | The known lookahead on `corridor_stake` is unmoved: `corridorStake` still reads 2026 dependence weights at as-of 1990. Dating 61 records is 61 hand estimates about when a dependence claim became true, and the finding's own re-measurement of the dampener is only meaningful once they exist. `chokepoint_*` now comes from the corridor layer so there is at least one estimate rather than two. |
| statistics/5 (numerator) | see escalation data-4 | The denominator half landed: `dem_share_n` and `dem_share_live` are in `panel.meta.polarity` every year and `sources.dem_share` states which denominator it is. Hysteresis on the 0.5 threshold was NOT added — with the series topping out at 0.538 a 0.55/0.45 band would switch `anticoup_norm` off for the whole record, which is worse than the flicker. |
| engine/8 | the corridor half landed; the territory half landed | What remains is `chokepoint_status` and `record_reopen` still reporting `n: 0` after 1991, which is the measured decision above rather than an omission. |

### Before / after (rolling-origin 1870-2010, step 10, +20y, 100 runs, universe all)

| template | n | exp/obs | Brier skill | AUC |
|---|---|---|---|---|
| leader_exit | 1103 → 1103 | 0.99 → 0.99 | −0.340 → −0.343 | 0.742 → 0.732 |
| irregular_exit | 945 → 945 | 1.24 → 1.24 | 0.058 → 0.051 | 0.756 → 0.752 |
| coup_attempt | 1103 → 1103 | 0.90 → 0.89 | 0.225 → **0.238** | 0.795 → **0.801** |
| democratize_step | 1243 → 1243 | 0.80 → 0.80 | −0.194 → −0.194 | 0.550 → 0.545 |
| democratic_deepening | 95 → 95 | 2.70 → 2.94 | −0.599 → −0.739 | 0.651 → **0.693** |
| autocratic_closure | 804 → 804 | 0.77 → 0.77 | −0.129 → −0.125 | 0.605 → 0.604 |
| intrastate_onset | 1103 → 1103 | 0.99 → 0.97 | 0.215 → **0.219** | 0.787 → 0.787 |
| intrastate_end | 1103 → 1103 | 1.04 → 1.02 | 0.110 → **0.118** | 0.737 → **0.739** |
| mid_force | 113394 → 113394 | 0.72 → **0.81** | 0.124 → 0.114 | 0.811 → 0.812 |
| mid_war | 113394 → 113394 | 0.69 → 0.70 | 0.034 → 0.029 | 0.782 → 0.780 |
| contest_settle | 633 → 693 | 1.16 → **1.09** | 0.082 → **0.088** | 0.805 → 0.787 |
| chokepoint_status | 181 → 176 | 1.17 → **1.11** | 0.102 → **0.185** | 0.699 → **0.736** |
| corridor_status | 151 → **317** | 1.13 → 1.44 | 0.128 → 0.021 | 0.654 → 0.652 |
| record_reopen | 145 → 132 | 1.31 → 1.30 | 0.055 → 0.020 | 0.658 → 0.623 |

**What the pooled table does not show, and the turn is about.** The two rows this turn scores gained ground truth
rather than skill. At as-of 1990 `mid_force` goes from 11 scored years of its 20 to all 20 and `corridor_status` from
`n: 0` to n=25; at as-of 2000 `mid_force` goes from **one** scored year to ten with AUC 0.804 → 0.909, `contest_settle`
from "predicted 8.4, observed 0, AUC null" to "predicted 10.8, observed 5, AUC 0.795", and `corridor_status` from
`n: 0` to n=28 with AUC 0.781. Two templates lose pooled skill for exactly that reason: `corridor_status` (0.128 →
0.021) is now scored over 166 modern record-years it was never asked about, and `record_reopen` (0.055 → 0.020) has a
tightened pre-1946 sample because six of the twenty retirements are dated before 1946 — a record that ended in 1924
correctly stops contributing in 1924, which the era-1945-1991 escalation's guard did not anticipate. Both are
coverage bought at a price, and both prices are here rather than in a footnote.

*Published slices (`public/*.json`) are deliberately not rebuilt: they are regenerated as one set at a re-baseline.*

*Rule check (amended by the checker, 2026-09-08): no country id was added to any covariate, column or branch. Five
country ids DID enter `data/templates.yaml` as prose inside the `durable_label_filter` rejection and the
`liberal_erosion` label note — the flapping cases the rejection is evidence about — which is the same use the
`great_game` and `corridor_stake` entries already made of them; four pairs and two actor ids also entered two
comments in `src/engine/core.js`, and the checker rewrote those two comments, since that file states it carries no
country name anywhere. `exists_until`, `speculative`,
`cinc_carried`, `at_war_ucdp`, `aid_recipient`, `dem_share_n`, `durable`/`flap`, `DYADIC_DISPUTE`, `corridorLastYear`,
`expectedWithin`, `POP_GROWTH_MEAN` and `MAX_LOG_FACTOR` are generic fields, columns and constants. Every history row
added to `data/corridors.yaml` and `data/territories.yaml` carries a `source:`; every new `load_bearing_for` and
`stakes` map carries `load_bearing_source: estimate` / `stakes_source: estimate`; every `exists_until` carries an
`exists_until_source`. The one rejection this turn (`durable_label_filter`) carries a `rejected:` entry with both
runs' numbers, and the one retraction (`anticoup_norm` on `irregular_exit`) says what the retracted numbers were and
why they do not reproduce.*

## Turn era-modern-2000-2025 — 2026-09-07

Backtest range as-of 2000 and 2010, horizon 20y, 100 runs, universe all, coefficients refit per as-of year
(`scores/backtest-2000-2010-h20-all.json`). Baseline for every number below is the same two rows of
`scores/backtest-1870-2010-h20-all.json`.

**The headline is coverage, not skill.** At as-of 2010 six of sixteen templates reported `n: 0` — no row, no score,
no miss. After this turn three do, and all three are the MID family, whose source genuinely ends in 2010. At as-of
2000 four reported `n: 0`; now one does. The modern dyad, the reopen mechanism and the chokepoint layer are graded out
of sample at a modern origin for the first time.

### applied

**data-1 / engine-4 / statistics-3 — the modern dyad gets ground truth (`interstate_onset`).**
New dyad-year template in `data/templates.yaml` (event `interstate_onset`, window [1946, 2024], the mid_force
covariate block minus the two era constants that are degenerate on a post-1946 sample), `COVERAGE.interstate_onset =
[1946, 2024]` in `scripts/backtest.mjs`, and a six-line generic draw in `src/engine/core.js:stepYear` for dyadic onset
templates outside the nested MID pair (`NESTED_DYAD`), which writes a fired onset into the rivalry memory
`DYADIC_DISPUTE` already counts it in. NOT merged into `mid_force`: the definitions differ (MID hostility ≥ 4 against
UCDP's 25 battle deaths) and so do the rates by an order of magnitude. Fit n=83,391 / 79 events, holdout AUC 0.862 at
split 2000. Backtest: as-of 2000 `scored_years` 20, n_at_risk 661, AUC 0.86; as-of 2010 `scored_years` 14, n_at_risk
557, AUC 0.90 (auc_at_risk 0.78) where the whole dyadic layer previously read `n: 0`. This implements the open
escalation era-1991-2026-r2/statistics-3 exactly as that entry specified it; the entry is annotated as implemented.

**statistics-2 / engine-1 — regime 3 stops being an absorbing state.**
`autocratic_closure` sample widened from `{regime_min: 1, regime_max: 2}` to `regime_max: 3` with `3: -0.5` added to
its `regime` cat prior; `liberal_erosion` moved to the top-level `retired:` list with `status: monitored` and its full
evidence, because it is the SAME process on a sample the fitter refuses at every backtested origin (29 of its 31
labels fall after 2009; `no fit at as-of` at all 15 as-of years). Before: the only fitted hazard on the top rung
pushed states up, and a 20-run as-of-2010 ensemble took liberal democracies from 44.8 at y+1 to 69.0 at y+20 while the
observed count fell 44 → 31. Fit: n 7,396 → 9,852, events 313 → 343, `regime=3` estimable at −0.56 (full sample) and
−1.87 at as-of 2010, in-sample AUC 0.648 → 0.683, base-ablation holdout AUC 0.574 → 0.601. Backtest: the at-risk set
rises 102 → 142 (as-of 2000) and 107 → 152 (as-of 2010) and the observed event count 45 → 55 and 47 → 68 — **the 21
erosion steps of 2011-2025 are now scored misses instead of invisible ones**, which is why the row's Brier gets worse
at as-of 2010 (0.318 → 0.358, count_ratio 0.57 → 0.39) and better at as-of 2000 (0.238 → 0.235). Honest cost,
recorded: the ratchet is no longer structural but it is still there in the fitted numbers — the y+20 regime-3 count is
69.8 against 44.8 at y+1 — because a forecaster standing at 2010 has two 3→2 labels in the whole record. What remains
is `democratic_deepening`'s over-supply, which is the calendar-trend defect escalated as statistics-1.

**statistics-2 (b) — two sign-flipped covariates demoted on `democratic_deepening`.**
`aid_conditionality` (fitted −0.16 against a +0.3 prior) and `pact_usa` (−0.69 against +0.3) were promoted on
`democratize_step` and carry the opposite sign on this template. Demoted to `candidates:` with the ablation numbers
(holdout ≥ 2005, AUC / Brier / exp-obs: without both 0.859 / 0.0154 / 1.96, with both 0.848 / 0.0158 / 1.86). The
backtest is a wash and is recorded as one: as-of 2000 Brier 0.155 → 0.148 and AUC 0.76 → 0.73; as-of 2010 Brier 0.143
→ 0.164, AUC 0.54 → 0.67, count_ratio 4.02 → 4.89. The 2-4x over-prediction is not these terms.

**corridors-1 / engine-6 — the chokepoint window moves to 2025, after the gate was re-measured.**
Three modern transitions the last turn's list called "quiet straits" and was wrong about, added to
`data/corridors.yaml` with sources: the Corinth Canal shut by the Agios Ioannis landslide 4 Jan 2021, reopened to
limited traffic 1 Jul 2021, shut again Jan 2023 and fully reopened 5 Jul 2023; the Kiel Canal shut to large vessels by
the Holtenau large-lock failure of 5 Mar 2013; the Turkish Straits contested by the unilateral 1994 traffic
regulations until the revised rules of Nov 1998. Gate re-measured on the fitter's own rows: modern chokepoint label
rate 3.27% → **4.13%** over 581 record-years against 5.11% over the 1,859 coded ones, ratio 0.64 → **0.81**, past the
0.67 floor. `chokepoint_status` window and `COVERAGE.chokepoint` move to 2025. Fit n 1,859 → 2,423, events 95 → 119,
holdout AUC (≥1946) 0.594 → 0.608. Backtest: as-of 2000 n=17, predicted 8.3 against 5 observed, AUC 0.74; as-of 2010
n=17, predicted 7.2 against 10, AUC 0.59 — against `n: 0` at both, and at every as-of year since 1950.

**corridors-2 / engine-3 — `record_reopen` fitted and scored on 1869-2025, with the censoring stated.**
The raw modern reopen rate (6.08% over 148 impaired record-years against 27.15% pre-1946) reads as a coding hole and
is not one: 113 of the 148 rows are six spells still impaired at 2025 and therefore incapable of carrying a reopening.
Drop the never-ending spells from the MEASUREMENT and the modern rate is 25.71% over 35 rows against 28.47% over 144,
a ratio of 0.90. The censored rows stay in the FIT as observed non-endings — the correct discrete-time exposure, and
what tells the hazard that modern closures are long. Window and `COVERAGE.record_reopen` move to [1869, 2025]. Fit:
n 148 → 395, events 40 → 68, base rate 27.0%/yr → 17.2%/yr, holdout AUC (≥1930) 0.500 (chance) → 0.546. Backtest:
as-of 2000 n=45, AUC 0.87; as-of 2010 n=50, AUC 0.60, against `n: 0` at every as-of year after 1945. The mechanism
still over-fires (pooled exp/obs 3.98) and engine-3's proposed demotion was MEASURED rather than assumed: with
`ENGINE_ABLATE=record_reopen` the reopen row scores nothing at all (7 observed reopenings at p=0, no AUC,
underpowered) and both status templates lose skill (corridor_status pooled 0.13 → 0.07, chokepoint 0.03 → 0.03), so
the mechanism stays on. Run committed as `scores/backtest-2000-2010-h20-all-abl-engine_ablate_record_reopen.json`.

**data-2 — the published forecast was built with an empty corridor layer.**
`scripts/run-forward.mjs` called `createWorld` without `corridors`, `territories`, `successors` or `contiguityFrom`,
which `scripts/backtest.mjs` has always passed: the built world held 0 corridor records and 0 territory records
against the backtest's 61 and 96 at the same as-of year, so every record hazard iterated an empty array and
`corridorStakeFor` returned 0 for every dyad — while `meta.templates` advertised all four record templates as
simulated. All four inputs now passed; `out.records` carries the per-record probability curves (record_reopen 57,
contest_settle 33, chokepoint_status 17, corridor_status 44 records with non-zero mass on a 20-run smoke test); and
`meta.templates` now carries `produced: true|false` per template, read from what the ensemble actually fired.

**data-3 / engine-5 — the 2022-2025 coup tail.**
`data/history/events.yaml` gains 12 dated coup attempts (6 successful) 2022-2025 on Powell-Thyne's own definition and
12 dated `leader_exit` events (9 irregular, plus two deaths in office and the 2025 US transition; two `kind: leader`
news rows that no template reads were converted). `scripts/build-panel.mjs` merges the hand coups onto the REIGN
columns and moves the `coup_attempt` / `coup_success` FLAGS window with them (`COUP_LAST`), the template window moves
to [1950, 2025], and `COVERAGE.coup` moves to 2025. Effect at the live origin: `win5(coup_attempt)` = 1 for **11**
actors of 195 at as-of 2025, against 4 before and 16 / 9 at the 2000 / 2010 origins. Effect in the backtest: the
as-of-2010 coup row is scored over 15 of its 20 horizon years instead of 11, with 24 observed events instead of 19.
`COVERAGE.leader_exit` does NOT move: the tail there is the irregular half only, and the roster is escalated.

**data-4 — Kosovo had no code and therefore no data.**
`data/raw/hist/codelist_panel.csv` leaves Kosovo's iso3c empty, so `loadActors` built the id from the country name and
defaulted `owid` to it — `KOSOVO`, a code no source file carries — and all 18 live years were null for regime,
polyarchy, gdp_pc, population, urban_share and info_access, i.e. the actor was outside every template and every dyad.
Hand entry in `data/history/actors.yaml` with `owid: XKX` (World Bank) and `owid_alt: OWID_KOS` (V-Dem via OWID, OWID
population), the same fix pattern DDR carries one line up. At 2020 the actor now reads regime 2, polyarchy 0.67,
gdp_pc 8,670, urban_share 45.2.

**data-5 — `regime` was missing exactly in the years transitions happen.**
V-Dem's RoW category is undefined in an interregnum year, so 18 of the 32 interior single-year holes carried an event
in that same year (15 leader exits, 7 democratization onsets, 2 coups, 3 intrastate onsets — GIN 2010 among them, this
turn's own origin), and `scripts/lib/fit.mjs` drops any row with a null covariate: the highest-signal rows in each
sample were missing on the outcome. `scripts/build-panel.mjs` now carries the value across a single-year interior hole
inside the actor's own observed run — never across a longer gap, never past the ends — and flags every filled cell in
a new `regime_imputed` column (43 cells) with its own source line.

**data-7 / engine-8 — a record's state is its dated history.**
Thirteen corridor records carried a top-level `status`/`controller` that contradicted their own history, and
`scripts/build-world.mjs` republished the header verbatim (`public/world.json` said Suez was open while the record's
2023.9 row said contested). The eight live disagreements are corrected in `data/corridors.yaml`, the published
snapshot is now DERIVED with `corridorStateAt(rec, T0)` and carries a `state_source`, and a build guard fails on any
reintroduced mismatch — retired records excluded, since their header describes how they ended. The scenario sentence
left on `hormuz` from the retired conversation-era layer ("the transcript's modal path is a Hormuz-for-blockade swap")
is replaced by a note pointing at the dated history and the reopen hazard.

**engine-2 — a second onset no longer restarts a running conflict.**
`applyActorEvent` set `conflictStart = y` and `conflict_duration = 0` on every `intrastate_onset`, and 43% of the
onsets a run fires land on an actor already carrying `intrastate = 1`; `z(conflict_duration)` is `intrastate_end`'s
strongest term (−1.35 per sd, mean 10.6 / sd 13.7), so a fifteen-year war was moved back into the high-hazard
young-conflict bin. The clock is now idempotent on a running spell. `intrastate_end` count_ratio **1.19 → 1.08**
(as-of 2000) and **1.26 → 1.04** (as-of 2010), exactly the direction the finding predicted; the cost is 0.03-0.04 of
AUC (0.90 → 0.87 and 0.81 → 0.77) on the indicator, which is the saturated statistic the count pair exists to
replace.

**engine-7 — the observed count is counted in the unit the engine can produce.**
UCDP codes one `intrastate_onset` per conflict-dyad, so 2011-2024 carries 149 onset events on 131 actor-years while
`firedHere` lets a template fire at most once per actor per year. `realized()` now counts one event per actor-year and
reports the discarded multiplicity as `observed_count_raw`. `intrastate_onset` count_ratio 0.55 → **0.61** at as-of
2010 and 0.79 → 0.90 at as-of 2000, with the Brier and AUC unchanged; `leader_exit`, `irregular_exit` and
`coup_attempt` move the same way (their observed counts fall 798 → 675, 31 → 23, 47 → 43 at as-of 2000).

**corridors-3 (part) — two transit lists that named a departed colonial power.**
`uganda_railway` transited `[GBR]` with no dated handover, so `corridorTransits` returned Britain for every year to
2026 and the line's `adjacent_war`, `transit_gdp_growth_mean` and guarantor terms were Britain's, including all 34 of
its modern record-years; it is now `[KEN, UGA]` with a dated 1963 control transfer and GBR as the pre-1963 controller,
which is where a departed power belongs. `cape_bulawayo` likewise `[GBR]` → `[ZAF, BWA, ZWE]`. The other fourteen
records in that finding are not fixed — see deferred.

### before → after (the turn's two as-of rows; `sy` = scored years, `cr` = count_ratio)

| template | as-of 2000 before → after | as-of 2010 before → after |
|---|---|---|
| leader_exit | n=195 sy20 brier .164 auc .84 cr 1.35 → brier .167 auc .83 cr 1.61 | sy11 brier .202 auc .73 cr 1.29 → brier .194 auc .76 cr 1.54 |
| irregular_exit | brier .080 auc .76 cr 0.43 → brier .078 auc .79 cr 0.58 | brier .050 auc .79 cr 0.50 → brier .050 auc .80 cr 0.71 |
| coup_attempt | brier .106 auc .78 cr 0.57 → brier .103 auc .80 cr 0.62 | sy11 brier .079 auc .84 cr 0.36 → **sy15** brier .097 auc .80 cr 0.38 |
| democratize_step | brier .297 auc .53 → brier .294 auc .55 | brier .307 auc .48 → brier .313 auc .47 |
| democratic_deepening | brier .155 auc .76 cr 1.81 → brier .148 auc .73 cr 1.74 | brier .143 auc .54 cr 4.02 → brier .164 auc .67 cr 4.89 |
| autocratic_closure | n=102 obs 45 brier .238 auc .68 → **n=142 obs 55** brier .235 auc .69 | n=107 obs 47 brier .318 auc .48 → **n=152 obs 68** brier .358 auc .48 |
| liberal_erosion | n=0 (no fit at as-of) → retired into autocratic_closure | n=0 → retired |
| intrastate_onset | brier .119 auc .90 cr 0.79 → brier .121 auc .90 cr 0.90 | brier .104 auc .92 cr 0.55 → brier .104 auc .92 cr 0.61 |
| intrastate_end | brier .113 auc .90 cr 1.19 → brier .117 auc .87 **cr 1.08** | brier .126 auc .81 cr 1.26 → brier .128 auc .77 **cr 1.04** |
| mid_force | sy10 brier .0020 auc .91 → brier .0020 auc .90 | n=0 (source ends 2010) → n=0 |
| mid_war | sy10 auc .61 → auc .61 | n=0 → n=0 |
| interstate_onset | **n=0 → n=18915 sy20 auc .86** | **n=0 → n=18915 sy14 auc .90 (auc@risk .78)** |
| record_reopen | **n=0 → n=45 auc .87** (pred 15.2 vs 2 obs) | **n=0 → n=50 auc .60** (pred 12.7 vs 5) |
| chokepoint_status | **n=0 → n=17 auc .74** (pred 8.3 vs 5) | **n=0 → n=17 auc .59** (pred 7.2 vs 10) |
| corridor_status | brier .173 auc .78 → brier .160 **auc .87** | brier .204 auc .74 → brier .229 auc .72 |
| contest_settle | brier .064 auc .80 auc@risk .43 → .063 / .80 / .43 | brier .054 auc .75 auc@risk .29 → .053 / .77 / **.35** |
| templates reporting n=0 | **4 of 16 → 1 of 16** | **6 of 16 → 3 of 16** |

Pooled over the two as-of years (new run only; the baseline file's `pooled` is over 15 as-of years and is not
comparable): leader_exit skill −0.39 / AUC 0.77, coup_attempt +0.12 / 0.80, intrastate_onset +0.44 / 0.91,
intrastate_end +0.25 / 0.83, mid_force +0.14 / 0.90, interstate_onset −0.03 / 0.88, corridor_status +0.13 / 0.70,
chokepoint_status +0.03 / 0.59, record_reopen −0.93 / 0.56, autocratic_closure −0.23 / 0.58,
democratic_deepening −0.85 / 0.72.

### skipped

- **corridors-4** (nine missing modern corridor records) — escalated: each record needs its own dated citations, and
  a bulk hand-add without sources is the one thing worse than the gap.
- **corridors-5** (five missing chokepoints and a `substitutes_for` structure) — the substitution covariate is a new
  mechanism; escalated. The five records are part of the same escalation's research task.
- **corridors-6** (territory records one row deep; the territory↔corridor join) — the missing rows (Crimea 2022.75,
  Donbas 2022.75, Kherson 2022.86, Nagorno-Karabakh 2023.72) are codable, but the finding's actual ask is a
  cross-layer validation between two record sets that disagree today; deferred to a turn that can do both halves.
- **corridors-7** (undated `load_bearing_for` on 61 records; ten rows stamped with the file's build date) — real, and
  a mechanical edit on 61 records that changes `corridor_stake` in every era at once. Deferred rather than done
  half-way; nothing in this turn's backtest reads the dampener (it is a candidate).
- **data-6** (the 1992-2010 corridor coding hole) — partly addressed on the chokepoint half (three records coded, the
  gate re-measured, the window moved) and not on the corridor half, which is corridors-4's research task.
- **data-8** (`liberal_erosion` advertised as fitted) — resolved by retiring the template: it is out of
  `data/fits.json` and out of `public/forecast.json`'s `meta.templates` entirely, so no artefact claims it was
  scored.
- **statistics-4** (per-decade window gate) — the transparency half is ADOPTED: the per-decade table (chokepoint
  1.92% / 1.76% / 7.06% for 1992-2000 / 2001-2010 / 2011-2025) is recorded in `data/templates.yaml` and
  `scripts/backtest.mjs` beside the pooled ratio, so the as-of-2000 row is read against a measured deficit. The
  BLOCKING half is not adopted: on a per-decade floor no modern chokepoint window could open at all, and the cost of
  that rule is what this turn just paid off — seven consecutive as-of years reporting `n: 0` on the layer the modern
  era is about. Re-propose the floor once the 1990s are coded.
- **statistics-7** (demote `contest_settle`) — not measured this turn. Its `auc_at_risk` is still 0.43 / 0.35 at the
  two origins and the demotion is defensible, but the finding's own test is an `ENGINE_ABLATE=contest_settle` run
  showing nothing downstream moves, and this turn spent its ablation budget on `record_reopen`.
- **statistics-8 / data-5 (b)** (22 live actors with no regime in any year) — already escalated as
  era-1991-2026-r2/data-4 and not re-escalated; the reported-`n`-versus-scored-`n` half is a one-line change that
  belongs with it.

### deferred

- **statistics-1** — `transform: z_year`. Escalated (new derivation shared by fitter and engine).
- **corridors-4** — the nine modern corridor records. Escalated (needs sourced construction/closure dates).
- **corridors-5** — `substitutes_for` / `substitute_impaired`. Escalated (new mechanism).
- **data-3 residue / statistics-5** — the 2022-2026 leader roster. Escalated (needs a dataset; the coup half is done).
- **statistics-6** — a decaying recurrence trace for internal conflict. Escalated (new derived covariate).

**Falsifier not met, recorded rather than buried (corridors-2 / engine-3).** The reopen falsifier asked that no
impaired record at as-of 2025 carry P(reopen within 20y) above the layer's own modern implied ceiling (~0.76). In the
published run it is 0.976 for `hormuz`, 0.984 for `suez`, 0.968 for `bab_al_mandab` and 0.982 for `nord_stream` —
better than the 1.00 the pre-1946 fit gave (100/100 runs) and still far above the ceiling. `kerch_strait`, whose
impairment is 22 years old, comes in at 0.554, which says the duration term is doing its job and the intercept is
still too high for records that have just closed. The next move on it is the era or censoring-aware duration term the
template note names, not another window.

*Published slices ARE rebuilt this turn, against the previous turns' convention and for a stated reason: two of the
applied findings (data-2, data-7) are about the published artefacts themselves, and leaving `public/forecast.json`
built by the code path the turn just fixed — with an empty corridor layer and a `meta.templates` list that claims four
record templates ran — would have been the defect the finding describes, published. `public/forecast.json`
(500 runs × 40y), `public/forecasts.json` and `public/world.json` are regenerated; nothing else under `public/` is.*

*Checker note (2026-09-08). The turn's own numbers verify: rerunning `node scripts/backtest.mjs --from 2000 --to
2010 --step 10 --horizon 20 --runs 100 --universe all` at this commit reproduces
`scores/backtest-2000-2010-h20-all.json` exactly apart from `meta.run` and the per-row `ms`, and
`build-panel` → `build-events` → `fit-hazards` rebuild to byte-identical `panel.json` / `events.json` / `fits.json`
apart from their `built` stamps. One guard the turn did not run: corridors-1 asked that the pooled
`chokepoint_status` Brier skill over as-of 1870-1990 not fall, and the turn only ever ran the two modern origins. Run
over 1870-2010 it does fall, 0.185 → 0.037, and the cause is this turn's own coverage correction rather than a lost
mechanism: the as-of-1990 row went from `scored_years: 1`, 0 observed and Brier 0.002 — a horizon whose labels were
almost entirely outside the old [1869,1991] window, scored as if they were non-events — to `scored_years: 20`, 3
observed and Brier 0.259, and as-of 1980 from 11 scored years to 20. `record_reopen` moves the same way for the same
reason (3 as-of rows to 8, pooled 1870-1990 skill 0.020 → −0.253). The pre-1992 origins' own rows are otherwise
unchanged to within ensemble noise on n=12-17. Two smaller corrections to this section's claims: `grep transcript
public/world.json` returns 1, not 0 — the surviving hit is the `hormuz` note that quotes the removed sentence while
documenting its removal — and the data-7 mismatch check prints 5 rather than 0 unless retired records are excluded,
which is the exclusion `scripts/build-world.mjs` makes and states (all five carry an `exists_until` before 2026; no
live record disagrees with its own history). No rule violation found: no country id entered a covariate, column or
branch, the five ids in the `liberal_erosion` label note moved into `retired:` with the block they were already in,
all fifteen `rejected:` blocks survive, and every new `data/corridors.yaml` history row and every new
`data/history/events.yaml` coup and leader-exit row carries a `source:`.*
