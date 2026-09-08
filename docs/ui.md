# The viewer

`npm run dev` (http://localhost:5173) or `npx vite preview` (http://localhost:4173). Bound to all interfaces. Everything is static: the app loads `public/*.json` and does the rest in the browser.

## Layout

- **Header** — variable picker (History · Forecast · Capabilities · modern groups), five one-click **views**, **2D / 3D** map toggle, ⋯ opens the advanced layer drawer, actor picker, build stamp.
- **Timeline** — 1870→forecast end slider (**to** picks +40/50/60/80/100 years past the forecast start, up to the loaded ensemble's horizon) with era ticks and a *now* marker; ▶ plays (space), ←/→ step one year. The shaded band is the active forecast window. **horizon** sets the window for forecast probabilities on the map (P within the next H years, given not yet). **forecast from** switches to an ensemble run as of a past year (1900, 1930, 1955, 1975, 1990, 2005) whose coefficients were refit on data up to that year — the map then shows the model's belief at that date over what actually happened, and the actor panel gains an *actual* column.
- **Headline strip** — the year's top three recorded events (wars, nuclear, territory, corridors, coups, alliances); in forecast years, the three most surprising hazards, one per template.
- **Map** (left) and **panel** (right, tabs: News · Detail · Territories · Corridors · Scores).

## Views

A view is a preset of fill variable + layers + field. One click each; the advanced drawer (⋯) still exposes every individual layer for anything a view does not cover.

| view | fill | field | vector layers |
|---|---|---|---|
| Politics (default) | regime gradient, one series across the seam (see below) | — | territories, flags · regime glyphs |
| Power | capability share | spheres of influence | great-power pacts, military presence |
| Conflict | at war | belligerents (heat) | territories, corridors, conflict outlines and arcs |
| Routes | primary energy | routes (open green / contested red, weighted by how many states each is load-bearing for) | corridors and chokepoints |
| Forecast | regime gradient, jumps the slider to 2036 if it is in the past | forecast hazard | flags · regime glyphs |

## Across the seam

A history variable is one series from 1870 to 2066; nothing switches palette at the forecast start. Before the panel ends it is the observed value, carried forward where a source stopped early and washed toward grey by staleness (GDP stops in 2022, so 2023–2025 are already a little pale). After it, regime is the *most likely* category in each of the 300 runs, painted in the same four colours with the modal share as saturation — a state at 90% keeps its colour, a 50/50 one goes grey. Continuous series the engine carries (GDP per head, information access) show the ensemble median with a slow wash by lead; the rest hold their last observation and fade. The hover card says which: "in 63% of runs", "23.4k median (20k–26.8k)", or "as of 2022". The ensemble mean of the regime level and its entropy remain as separate forecast variables.

**Regime (gradient)**, the default fill, is V-Dem's continuous polyarchy score placed on the four-category axis: the panel's median polyarchy inside each Regimes-of-the-World category (0.085, 0.281, 0.649, 0.843 — an estimate, recorded in `src/lib/data.js`) maps to 0, 1, 2, 3 and the colour ramp passes through the four category colours at those points. Hungary drifts from blue toward orange instead of flipping; a state with a category but no polyarchy score (before 1900) is painted flat and washed. After the seam the same axis carries the ensemble mean of the level, washed by the entropy of the run distribution. The liberal democracy index (`libdem`) is on the panel as well for the non-electoral dimension.

## Renderer

One canvas, one scene description, two projections: `src/lib/geo.js` builds the projection (Natural Earth in 2D, orthographic with `clipAngle(90)` in 3D) and an 0.5° owner grid for O(1) hit-testing; `src/lib/render.js` paints the scene in a fixed order (sphere, blurred field, fills, borders, conflict outlines, territories, corridors, geodesic arcs, marks, labels, selection). Every layer goes through the same projection, so the globe needs no layer-specific code. Fields are rasterised to an offscreen canvas and blurred there, then clipped to the sphere. Drag pans (2D) or rotates (3D), wheel zooms, ↻ auto-rotates the globe, ⤢ resets.

## Map layers

| layer | shows | source |
|---|---|---|
| country fill | the selected variable at the slider year: historical panel (regime, GDP, population, capability, steel, energy, information access, war flags…), forecast (expected regime, entropy, P(event)), or modern snapshot variables | `history.json`, `forecast*.json`, `world.json` |
| territories | hatched polygons / ◇ points for contested territories, status and controller as of the year | `world.json` (dated `history`) |
| corridors | lines (rail/pipeline/HVDC, dotted cable) and ○ chokepoints, status as of the year | `world.json` |
| conflicts | red outline at war, orange dashed internal conflict, arcs joining principal belligerents (dashed while ongoing) | `history.json`, `news.json` |
| military presence | ■ base · ◆ garrison · ⚓ fleet area · • advisors, coloured by power, sized by level; operator entries emphasised | `presence.json` |
| alliances | defence pacts: *major* = pacts involving a great power (hub-and-spoke), *all* = every pact, off; the selected actor's pacts always highlighted; carried forward past 2000 and labelled | `alliances.json` |
| flags · regime | emoji flag + government glyph (◆ closed autocracy ▲ electoral autocracy ● electoral democracy ★ liberal democracy) on a population bubble; count scales with zoom | `history.json` |
| qualities | five-axis percentile glyph (regime, GDP/cap, capability, information access, urban) with a red ring when at war | `history.json` |
| field | continuous overlays painted like weather, registry in `src/lib/influence.js`: *spheres of influence* (dominant power, opacity = margin), *belligerents* (heat), *routes* (open vs contested), *forecast hazard* (P(any modelled event within the horizon \| not yet) from the ensemble, painted as the excess over the median actor; dyad hazards sit between the pair; blur grows with distance from the forecast start and with the horizon) | all of the above |

The **legend** shows only what is on the map: the variable's key with real category labels, the territory/corridor statuses present that year, and keys for the enabled overlays.

**Hover card** on any country: flag, name, government, population, pacts (great-power ones highlighted), conflicts, foreign forces present, and the country's unusual events that year. Click to open Detail. Scroll to zoom, drag to pan, ⤢ resets.

## Panel tabs

- **News** — the year's recorded events with kind filters, each linking to its actor/corridor/territory. In forecast years: the ensemble's hazards for that year ranked by surprise (relative to the typical actor).
- **Detail** — the selected actor (regime chips, capabilities, chokepoint exposure, forecast table at 5/10/20/40 years with regime distribution, historical panel with charts and the year marker, modern series with sources and sparklines); or a territory / corridor with its full dated history (future entries greyed).
- **Territories / Corridors** — browsable lists.
- **Scores** — the baseline backtest: pooled skill/AUC per template and the per-as-of table.

## URL state

`#y=1956&v=h_regime&a=EGY&l=territories,corridors,alliances:major,conflicts,presence,labels,field:influence&t=detail&f=1955&h=10&view=power&m=3d` — year, variable, actor, layers, tab, forecast-from, horizon, view, map mode (`m=3d`; omitted for 2D). Hash changes apply live, so any view is a link.

## Screenshots (for verification)

`node scripts/shot2.mjs out.png <year> "<btn1>,<btn2>" [actor] [tab] [x,y]` toggles header buttons by label, selects an actor, opens a tab, hovers a point. `scripts/shot.mjs` was removed; use `shot2.mjs`.

## Known limits

Point territories have no labels until hovered; emoji flags need a colour-emoji font; the panel is fixed-width (no narrow layout); ~8 MB of JSON loads with no progress indicator; the field is evaluated on a 2° grid on the main thread (the hazard field keeps the 150 strongest dyads), so a very large horizon on a slow machine can take a moment; canvas text is not selectable. Ranked gaps: `docs/ui-review.md`.
