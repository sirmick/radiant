# UI review — 2026-09-07

What the viewer has, what it is missing, and the order to close the gaps. Verified against screenshots at 1905, 1914, 1955, 1975, 2000, 2031, 2040.

## Fixed this pass
- **Legend** — was a fixed list of every status colour regardless of what was drawn. Now: the variable's own key (with category labels, not `0 1 2 3`), then only the territory/corridor statuses present at the slider year for enabled layers, plus keys for whichever of alliances / regime glyphs / qualities are on. Geometry hints (hatched, ◇ point, ○ chokepoint, ┄ cable).
- **Flags + regime glyphs** layer: emoji flag and ◆▲●★ (closed / electoral autocracy / electoral / liberal democracy) at each featured country's centroid; count scales with zoom. Historical entities without a modern code get the glyph only.
- **Alliances** layer from CoW defence pacts: bilateral solid, multilateral dashed hub-and-spoke (hub = largest member), selected actor's pacts highlighted; carried forward past 2000 and labelled as such.
- **Qualities** layer: five-axis percentile glyph (regime, GDP/cap, capability, information access, urbanisation) with a red ring when at war.
- **Scores** tab: pooled skill/AUC per template and the per-as-of table from the baseline backtest.
- **Per-actor history charts** (1870–2025 line per panel variable with the year marker), click to colour the map by it.
- **URL state** (`#y=1956&v=h_regime&a=EGY&l=…&t=news`) so any view is a link; **reset zoom**; selecting an actor opens Detail.

## Still missing, by value
1. **Dyad view** — click two countries: their dispute/war hazard curve, contiguity, pacts, rivalry memory, and what the fitted coefficients say. The model is largely dyadic and the UI can't show a dyad.
2. **Time-series with the forecast fan** — the history chart stops at 2025; the forecast has 10/50/90 GDP bands and regime distributions per year. One chart, history line into a fan.
3. **Bloc view** — community detection on the alliance graph per year (the Anglosphere / Warsaw Pact / GCC as coloured regions), and its evolution as you scrub. Needs the alliance layer to become a dyad state in the model, not just a picture.
4. **Compare two years** — side-by-side or swipe, for "what changed 1989→1999".
5. **Explain this number** — for any forecast probability, the covariate contributions (η = intercept + Σβx) so the model shows its reasoning per country.
6. **Ensemble diff / "what moved"** — the weekly-loop front page: which hazards changed since the last run and why (needs snapshots from successive forward runs).
7. **Capability heat-map** (country × capability × year, blurred by uncertainty) from `waves.yaml` — nothing renders the waves yet.
8. **Loading / progress** — ~6 MB of JSON with no indicator; lazy-load forecast/news/alliances after the map.
9. **Hover tooltips** richer than `<title>`: value, year, source, and the sparkline.
10. **Mobile / narrow layout** — the panel is fixed at 400 px; below ~1100 px the map is unusable.
11. **Search** — the actor dropdown is 44 modern actors; the panel knows 207. A type-ahead over all actors, territories and corridors.
12. **Keyboard**: ←/→/space exist; add `[`/`]` for decade steps, `f` to fit selection, `?` for the key list.

## Known visual limits
- Great-circle alliance arcs to the Pacific cross the map edge on the Natural Earth projection (correct, but reads as "off the map"). A globe option or an edge-aware split would fix it.
- Point territories (Kiaochow, Canal Zone…) are diamonds without labels until hovered.
- Emoji flags depend on the OS font; Linux without a colour emoji font shows boxes.
