import {readFileSync} from 'node:fs'; import {parse as Y} from 'yaml';
import {createWorld, stepYear, dyadHazards} from '/home/mick/radiant/src/engine/core.js';
import {loadActors, makeCodeMap, readCsv} from '/home/mick/radiant/scripts/lib/hist.mjs';
process.chdir('/home/mick/radiant');
const panel=JSON.parse(readFileSync('data/panel.json','utf8'));
const {events}=JSON.parse(readFileSync('data/events.json','utf8'));
const {fits}=JSON.parse(readFileSync('data/fits.json','utf8'));
const templates=Y(readFileSync('data/templates.yaml','utf8')).templates;
const cf=JSON.parse(readFileSync('data/contiguity.json','utf8'));
const actors=loadActors(); const code=makeCodeMap(actors);
const successors=Object.fromEntries([...actors.values()].filter(a=>a.successor).map(a=>[a.id,a.successor]));
const pacts=new Set(); const pk=(a,b)=>a<b?a+'|'+b:b+'|'+a;
for(const r of readCsv('data/raw/hist/alliance_v303_dyadic.csv')){if(r.sstype!=='1')continue;const y=+r.year,a=code(r.ccode1,y),b=code(r.ccode2,y);if(a&&b)pacts.add(pk(a,b)+'|'+y);}
const corridors=Y(readFileSync('data/corridors.yaml','utf8')); const territories=Y(readFileSync('data/territories.yaml','utf8')); const presence=Y(readFileSync('data/presence.yaml','utf8'));
const asOf=+(process.argv[2]||1900), to=+(process.argv[3]||1919);
const w=createWorld({panel,events,fits,templates,asOf,pacts,contiguity:cf.pairs,universe:'all',successors,contiguityFrom:cf.meta.years[0],corridors,territories,presence});
const before=new Set(Object.keys(w.actors));
for(let y=asOf+1;y<=to;y++) stepYear(w,Math.random);
const born=Object.keys(w.actors).filter(id=>!before.has(id));
let zero=0;
for(const id of born){ const a=w.actors[id]; const nz=Object.keys(w.actors).filter(o=>o!==id&&Object.keys(dyadHazards(w,a,w.actors[o])).length>0).length; if(!nz)zero++;
 console.log(id,'cinc',a.cur.cinc==null?'null':a.cur.cinc.toFixed(5),'partners',nz,'| imputed',(a.imputed||[]).slice(0,3).join(',')); }
console.log('born',born.length,'with zero partners',zero);
console.log('AUT|SRB',w.contiguous.has('AUT|SRB'),'HUN|ROU',w.contiguous.has('HUN|ROU'),'TUR cinc',w.actors.TUR?w.actors.TUR.cur.cinc:'-');
