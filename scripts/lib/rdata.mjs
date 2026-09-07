// Minimal reader for R's XDR serialization (RDX2/RDX3 `.rda`, gzip-wrapped), enough to pull one data.frame out.
// Why this exists: the only offline-fetchable copy of CoW NMC past 3.02 is the `cow_nmc` object inside the R package
// `peacesciencer` (CRAN/GitHub), shipped as a serialized R data.frame. Rather than depend on R at build time, the
// fetch step decodes the format here. Format reference: R Internals §1.8 (serialization formats).
//
// Supported: NILVALUE, SYMSXP, LISTSXP (pairlists, for attributes), CHARSXP, STRSXP, INTSXP/LGLSXP, REALSXP, VECSXP,
// REFSXP (symbol back-references) and attribute blocks. Anything else throws — a silent wrong parse would put
// unlabelled numbers on the panel.
import { gunzipSync } from 'node:zlib';

const NA_INT = -2147483648;

class Reader {
  constructor(buf) { this.b = buf; this.i = 0; this.refs = []; }
  int() { const v = this.b.readInt32BE(this.i); this.i += 4; return v; }
  dbl() { const v = this.b.readDoubleBE(this.i); this.i += 8; return v; }
  bytes(n) { const v = this.b.subarray(this.i, this.i + n); this.i += n; return v; }

  item() {
    const flags = this.int();
    const type = flags & 255, hasAttr = (flags >> 9) & 1, hasTag = (flags >> 10) & 1;
    switch (type) {
      case 254: return null;                       // NILVALUE_SXP
      case 253: return { env: 'global' };          // GLOBALENV_SXP
      case 255: {                                  // REFSXP — index packed in the flags, or the next int
        let idx = flags >> 8; if (idx === 0) idx = this.int();
        return this.refs[idx - 1];
      }
      case 1: { const name = this.item(); this.refs.push(name); return name; }   // SYMSXP
      case 2: case 17: case 18: {                  // LISTSXP / LANGSXP / DOTSXP: a pairlist, read to the NIL tail
        const out = []; let a = hasAttr, t = hasTag;
        for (;;) {
          if (a) this.item();
          const tag = t ? this.item() : null;
          out.push([tag, this.item()]);
          const f = this.int(); if ((f & 255) === 254) break;
          if ((f & 255) !== 2) throw new Error(`rdata: pairlist tail type ${f & 255}`);
          a = (f >> 9) & 1; t = (f >> 10) & 1;
        }
        return out;
      }
      case 9: { const n = this.int(); return n === -1 ? null : this.bytes(n).toString('utf8'); }   // CHARSXP
      default: {
        let v;
        if (type === 16) { const n = this.int(); v = new Array(n); for (let k = 0; k < n; k++) v[k] = this.item(); }          // STRSXP
        else if (type === 13 || type === 10) { const n = this.int(); v = new Array(n); for (let k = 0; k < n; k++) { const x = this.int(); v[k] = x === NA_INT ? null : x; } }  // INTSXP/LGLSXP
        else if (type === 14) { const n = this.int(); v = new Array(n); for (let k = 0; k < n; k++) { const x = this.dbl(); v[k] = Number.isNaN(x) ? null : x; } }             // REALSXP
        else if (type === 19) { const n = this.int(); v = new Array(n); for (let k = 0; k < n; k++) v[k] = this.item(); }     // VECSXP
        else throw new Error(`rdata: unsupported SEXP type ${type} at byte ${this.i}`);
        if (hasAttr) return { value: v, attr: this.item() };
        return { value: v, attr: null };
      }
    }
  }
}

/** `.rda` (possibly gzipped) -> { name: { columns: [...], rows: n, get(col) } } for every data.frame in the file. */
export function readRda(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const magic = buf.subarray(0, 5).toString('latin1');
  if (magic !== 'RDX2\n' && magic !== 'RDX3\n') throw new Error(`rdata: not an RData file (magic ${JSON.stringify(magic)})`);
  const r = new Reader(buf); r.i = 5;
  if (buf.subarray(r.i, r.i + 2).toString('latin1') !== 'X\n') throw new Error('rdata: not XDR-encoded');
  r.i += 2;
  r.int(); r.int(); r.int();                                   // format version, writer R version, min reader version
  if (magic === 'RDX3\n') { const n = r.int(); r.bytes(n); }    // native encoding name
  const top = r.item();                                        // pairlist: name -> object
  const out = {};
  for (const [name, obj] of top) {
    if (!obj || !obj.attr) continue;
    const attrs = Object.fromEntries(obj.attr.map(([tag, v]) => [tag, v]));
    const names = attrs.names?.value;
    if (!names) continue;
    const cols = {};
    names.forEach((nm, j) => { const c = obj.value[j]; cols[nm] = c && c.value ? c.value : c; });
    out[name] = { columns: names, rows: cols[names[0]]?.length ?? 0, cols };
  }
  return out;
}
