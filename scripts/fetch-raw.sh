#!/usr/bin/env bash
# Fetch every raw dataset the build reads into data/raw/. Idempotent; re-run to refresh.
# Sources: Natural Earth (public domain), World Bank WDI API, UN WPP 2024, OWID energy (Energy Institute-derived), IEA Global EV Data Explorer,
# CoW NMC 7.0 (via the peacesciencer R package, which is the only copy a script can reach: correlatesofwar.org answers 403).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw/ne data/raw/wb data/raw/wpp data/raw/ei data/raw/hist

echo "== Natural Earth"
NE=https://naturalearth.s3.amazonaws.com
for f in 50m_cultural/ne_50m_admin_0_countries 10m_cultural/ne_10m_admin_0_disputed_areas 10m_cultural/ne_10m_admin_0_countries_chn 10m_physical/ne_10m_geography_marine_polys; do
  z=data/raw/ne/$(basename "$f").zip
  [ -s "$z" ] || curl -sL -o "$z" "$NE/$f.zip"
  unzip -oq "$z" -d data/raw/ne
done

echo "== CoW National Material Capabilities v7.0 (1816-2022)"
node scripts/fetch-nmc.mjs

echo "== World Bank WDI"
node scripts/fetch-wb.mjs

echo "== UN WPP 2024 (medium variant)"
WPP='https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES'
[ -s data/raw/wpp/wpp_medium.csv.gz ]      || curl -sL -o data/raw/wpp/wpp_medium.csv.gz      "$WPP/WPP2024_Demographic_Indicators_Medium.csv.gz"
[ -s data/raw/wpp/wpp_age5_medium.csv.gz ] || curl -sL -o data/raw/wpp/wpp_age5_medium.csv.gz "$WPP/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz"

echo "== OWID energy"
curl -sL -o data/raw/ei/owid-energy.csv https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv

echo "== IEA EV (cars, historical, all years)"
: > data/raw/ei/iea-ev.csv
for y in $(seq 2010 2025); do
  curl -sL "https://api.iea.org/evs?parameters=EV%20sales%20share&category=Historical&mode=Cars&csv=true&year=$y" \
    | { if [ "$y" = 2010 ]; then cat; else tail -n +2; fi; } >> data/raw/ei/iea-ev.csv
done

echo "done. next: node scripts/build-geo.mjs && node scripts/build-world.mjs"
