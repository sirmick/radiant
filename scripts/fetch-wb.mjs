// Pull World Bank WDI indicators for all countries, 2000-2024 -> data/raw/wb/<indicator>.json
import { writeFileSync } from 'node:fs';
const IND = {
  'SP.POP.TOTL': 'population',
  'SP.POP.1564.TO.ZS': 'working_age_share',
  'SP.POP.65UP.TO.ZS': 'age65_share',
  'SP.DYN.TFRT.IN': 'fertility',
  'NY.GDP.MKTP.PP.CD': 'gdp_ppp',
  'NY.GDP.MKTP.CD': 'gdp_mer',
  'NY.GDP.PCAP.PP.CD': 'gdp_pc_ppp',
  'GC.DOD.TOTL.GD.ZS': 'gov_debt_gdp',
  'NE.TRD.GNFS.ZS': 'trade_gdp',
  'BN.CAB.XOKA.GD.ZS': 'current_account_gdp',
  'MS.MIL.XPND.GD.ZS': 'milex_gdp',
  'GB.XPD.RSDV.GD.ZS': 'rd_gdp',
  'SM.POP.NETM': 'net_migration',
  'EG.USE.PCAP.KG.OE': 'energy_use_pc',
  'EG.ELC.ACCS.ZS': 'elec_access',
  'AG.LND.ARBL.HA.PC': 'arable_ha_pc',
  'ER.H2O.FWST.ZS': 'water_stress',
  'NY.GDP.PETR.RT.ZS': 'oil_rents_gdp',
  'NY.GDP.TOTL.RT.ZS': 'resource_rents_gdp',
  'FP.CPI.TOTL.ZG': 'inflation',
};
for (const [code, name] of Object.entries(IND)) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=2000:2024`;
  const r = await fetch(url);
  const [meta, rows] = await r.json();
  const out = {};
  for (const x of rows ?? []) {
    if (x.value == null) continue;
    (out[x.countryiso3code] ??= {})[x.date] = x.value;
  }
  writeFileSync(`data/raw/wb/${name}.json`, JSON.stringify({ code, name, fetched: new Date().toISOString().slice(0,10), data: out }));
  console.log(name, Object.keys(out).length, 'countries');
}
