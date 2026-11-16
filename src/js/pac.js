/* ============ Importar la declaración de la PAC (solicitud única) ============
   Lee el fichero que da la comunidad autónoma o la cooperativa y crea las parcelas
   (y si se quiere, los cultivos de la campaña) sin teclearlos.
   Formatos: Excel (.xlsx), CSV/TXT, PDF (si trae texto), GML/XML, GeoJSON, KML,
   capa SHP en .zip, o texto copiado y pegado del PDF. */
const PAC = {filas: [], origen: ""};
const pacNorm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/* Nombres de columna que usan las distintas comunidades (sin tildes, en minúsculas) */
const PAC_COLS = {
  ref: ["referencia sigpac","ref sigpac","referencia","recinto sigpac","codigo sigpac","sigpac","ref recinto","id recinto"],
  prov: ["provincia","prov","cod provincia","codigo provincia","cpro","pr","dn pr"],
  mun: ["municipio","mun","muni","cod municipio","codigo municipio","termino municipal","termino","cmun","mu","dn mu"],
  ag: ["agregado","agr","ag","dn ag"],
  zona: ["zona","zon","zo","dn zo"],
  pol: ["poligono","pol","poli","dn po","po"],
  par: ["parcela","parc","par","dn pa","pa"],
  rec: ["recinto","rec","reci","dn re","re"],
  supd: ["superficie declarada","sup declarada","superficie declarada ha","sup decl","sup declarada ha","superficie solicitada","sup solicitada","superficie cultivada","sup cultivada","superficie linea","sup linea","superficie neta","sup neta","sup"],
  sups: ["superficie sigpac","sup sigpac","superficie recinto","sup recinto","superficie","superficie ha","dn surface","area","sup m2","superficie m2"],
  uso: ["uso sigpac","uso","uso del recinto","cod uso","uso recinto"],
  prod: ["producto","cultivo","producto declarado","descripcion producto","desc producto","nombre producto","producto cultivo","cultivo declarado","descripcion cultivo","desc cultivo","especie"],
  prodc: ["cod producto","codigo producto","cod cultivo","codigo cultivo","producto codigo"],
  var: ["variedad","descripcion variedad","desc variedad"],
  riego: ["sistema de explotacion","sistema explotacion","sist explotacion","secano regadio","regadio","riego","sistema","s r","sec reg"],
  nombre: ["paraje","nombre","nombre paraje","denominacion","alias"],
};
function pacCol(h){
  const n = pacNorm(h); if (!n) return null;
  for (const [k, vs] of Object.entries(PAC_COLS)) if (vs.includes(n)) return k;
  for (const [k, vs] of Object.entries(PAC_COLS)) if (vs.some(v => v.length > 3 && n.startsWith(v + " "))) return k;
  return null;
}
const pacNum = v => { if (v == null || v === "") return null; if (typeof v === "number") return v; let s = String(v).trim().replace(/\s/g, ""); if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, ""); s = s.replace(",", "."); const n = Number(s); return isFinite(n) ? n : null; };
const pacInt = v => { const n = pacNum(v); return n == null ? null : Math.round(n); };

/* ---- Lectura de ficheros ---- */
function pacTexto(buf){
  const u = new Uint8Array(buf);
  if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder("utf-16le").decode(u);
  try { return new TextDecoder("utf-8", {fatal: true}).decode(u); } catch(e) { return new TextDecoder("windows-1252").decode(u); }
}
async function pacInflar(bytes, raw){
  /* Lee todo lo que se pueda aunque al final haya bytes de sobra (pasa en muchos PDF) */
  const rd = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(raw ? "deflate-raw" : "deflate")).getReader(), partes = [];
  try { for (;;) { const {done, value} = await rd.read(); if (done) break; partes.push(value); } } catch(e) { if (!partes.length) throw e; }
  const out = new Uint8Array(partes.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
/* Lector mínimo de .zip (para .xlsx y capas SHP comprimidas) */
async function pacZip(buf){
  const u = new Uint8Array(buf), dv = new DataView(buf), files = {};
  let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("zip");
  let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const met = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u.subarray(start, start + csz);
    files[name] = async () => met === 0 ? data : await pacInflar(data, true);
    p += 46 + nl + xl + cl;
  }
  return files;
}
const pacXml = s => new DOMParser().parseFromString(s, "application/xml");
async function pacXlsx(buf){
  const z = await pacZip(buf), txt = async k => z[k] ? new TextDecoder().decode(await z[k]()) : "";
  const ss = [...pacXml(await txt("xl/sharedStrings.xml")).getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent).join(""));
  const hojas = [];
  for (const k of Object.keys(z).filter(k => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()) {
    const filas = [];
    for (const row of pacXml(await txt(k)).getElementsByTagName("row")) {
      const f = [];
      for (const c of row.getElementsByTagName("c")) {
        const col = (c.getAttribute("r") || "").replace(/\d+/g, "").split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent;
        f[col < 0 ? f.length : col] = t === "s" ? ss[Number(v)] : t === "inlineStr" ? [...c.getElementsByTagName("t")].map(x => x.textContent).join("") : v != null && v !== "" && !isNaN(v) ? Number(v) : v;
      }
      filas.push(Array.from(f, x => x ?? ""));
    }
    hojas.push(filas);
  }
  return hojas;
}
function pacCsv(txt){
  const lin = txt.split(/\r?\n/).slice(0, 40);
  const sep = [";", "\t", ",", "|"].map(s => [s, lin.reduce((a, l) => a + (l.split(s).length - 1), 0)]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = []; let f = [], c = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"' && c === "") q = true;
    else if (ch === sep) { f.push(c); c = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; f.push(c); filas.push(f); f = []; c = ""; }
    else c += ch;
  }
  if (c !== "" || f.length) { f.push(c); filas.push(f); }
  return filas;
}
/* Texto de un PDF: recorre las páginas, traduce las fuentes (ToUnicode) y reconstruye las filas por su posición */
async function pacPdf(buf){
  const u = new Uint8Array(buf), s = new TextDecoder("latin1").decode(u), L1 = b => new TextDecoder("latin1").decode(b);
  const objs = {}, re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(s))) objs[m[1]] = m.index + m[0].length;
  const crudo = {};
  const leer = async n => {
    if (crudo[n]) return crudo[n];
    if (objs[n] == null) return {d: ""};
    const ini = objs[n], fe = s.indexOf("endobj", ini), body = s.slice(ini, fe < 0 ? undefined : fe), k = body.search(/stream\r?\n/);
    if (k < 0) return crudo[n] = {d: body};
    const d = body.slice(0, k), st = ini + k + body.slice(k).match(/stream\r?\n/)[0].length;
    let ln = d.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/), len = null;
    if (ln) len = ln[2] ? Number((await leer(ln[1])).d.trim()) : Number(ln[1]);
    const fin = s.indexOf("endstream", st);
    let data = u.subarray(st, len && st + len <= fin + 2 ? st + len : fin);
    if (/FlateDecode/.test(d)) { try { data = await pacInflar(data, false); } catch(e) { data = null; } } else if (/\/Filter/.test(d)) data = null;
    return crudo[n] = {d, data};
  };
  /* Objetos guardados dentro de «object streams» (PDF 1.5+) */
  for (const n of Object.keys(objs)) {
    const ini = objs[n]; if (!/\/Type\s*\/ObjStm/.test(s.slice(ini, ini + 300))) continue;
    const o = await leer(n); if (!o.data) continue;
    const t = L1(o.data), first = Number(o.d.match(/\/First\s+(\d+)/)?.[1]), nn = Number(o.d.match(/\/N\s+(\d+)/)?.[1]);
    const h = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < nn; i++) { const num = h[2 * i], off = first + h[2 * i + 1], fin = i + 1 < nn ? first + h[2 * i + 3] : t.length; if (objs[num] == null || !crudo[num]) crudo[num] = {d: t.slice(off, fin)}; }
  }
  const ref = d => d.match(/^\s*(\d+)\s+\d+\s+R/)?.[1];
  const val = async (d, clave) => { const i = d.search(new RegExp("/" + clave + "\\b")); if (i < 0) return null; const r = d.slice(i + clave.length + 1); const n = ref(r); if (n) return (await leer(n)).d; if (r.trim().startsWith("<<")) { let p = 0, j = r.indexOf("<<"); for (; j < r.length; j++) { if (r.startsWith("<<", j)) { p++; j++; } else if (r.startsWith(">>", j)) { p--; j++; if (!p) break; } } return r.slice(r.indexOf("<<"), j + 1); } return r; };
  /* Fuentes: nombre -> {bytes por carácter, tabla} */
  const cmaps = {};
  const cmap = async n => {
    if (cmaps[n]) return cmaps[n]; const o = await leer(n); const t = o.data ? L1(o.data) : ""; const map = {}; let bytes = 1;
    const cs = t.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/); if (cs) bytes = cs[1].length / 2;
    const uni = h => { let r = ""; for (let i = 0; i + 3 < h.length + 1; i += 4) r += String.fromCharCode(parseInt(h.substr(i, 4), 16)); return r; };
    for (const bl of t.match(/beginbfchar[\s\S]*?endbfchar/g) || []) for (const x of bl.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map[parseInt(x[1], 16)] = uni(x[2]);
    for (const bl of t.match(/beginbfrange[\s\S]*?endbfrange/g) || []) for (const x of bl.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
      const a = parseInt(x[1], 16), b = parseInt(x[2], 16);
      if (x[4]) { const base = parseInt(x[4], 16); for (let c = a; c <= b && c - a < 65536; c++) map[c] = String.fromCharCode(base + c - a); }
      else (x[5].match(/<([0-9A-Fa-f]+)>/g) || []).forEach((h, i) => map[a + i] = uni(h.slice(1, -1)));
    }
    return cmaps[n] = {bytes, map};
  };
  const fuentes = async res => {
    const F = {}; const fd = res ? await val(res, "Font") : null; if (!fd) return F;
    for (const x of fd.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      const fo = (await leer(x[2])).d; const tu = fo.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
      const f = tu ? {...await cmap(tu[1])} : {bytes: /Identity-H/.test(fo) ? 2 : 1, map: null};
      /* Anchos de letra, para saber dónde acaba cada trozo de texto */
      const W = {}; let dw = 500;
      const arr = async (d, k) => { const v = await val(d, k); if (!v) return null; const n = ref(v); return n ? (await leer(n)).d : v; };
      const desc = (await val(fo, "DescendantFonts")) || "", dn = desc.match(/(\d+)\s+\d+\s+R/)?.[1];
      if (dn) { const dd = (await leer(dn)).d; dw = Number(dd.match(/\/DW\s+(\d+)/)?.[1] || 1000); const w = await arr(dd, "W");
        if (w) { const tk = w.replace(/^[^\[]*\[/, "").match(/\[|\]|-?\d*\.?\d+/g) || []; let i = 0;
          while (i < tk.length) { const c0 = Number(tk[i]); if (isNaN(c0)) { i++; continue; } if (tk[i + 1] === "[") { let j = i + 2, c = c0; while (tk[j] !== "]" && j < tk.length) W[c++] = Number(tk[j++]); i = j + 1; } else { const c1 = Number(tk[i + 1]), wv = Number(tk[i + 2]); for (let c = c0; c <= c1 && c - c0 < 65536; c++) W[c] = wv; i += 3; } } } }
      else { const fc = Number(fo.match(/\/FirstChar\s+(\d+)/)?.[1] || 0), w = await arr(fo, "Widths"); if (w) (w.match(/-?\d*\.?\d+/g) || []).forEach((v, i) => W[fc + i] = Number(v)); }
      f.W = W; f.dw = dw; F[x[1]] = f;
    }
    return F;
  };
  /* Páginas en orden */
  const paginas = [], visto = new Set();
  const recorrer = async n => { if (visto.has(n)) return; visto.add(n); const d = (await leer(n)).d; if (/\/Type\s*\/Pages\b/.test(d)) { const k = d.match(/\/Kids\s*\[([^\]]*)\]/); for (const r of (k?.[1] || "").matchAll(/(\d+)\s+\d+\s+R/g)) await recorrer(r[1]); } else if (/\/Type\s*\/Page\b/.test(d)) paginas.push(n); };
  const raiz = Object.keys({...objs, ...crudo}).find(n => /\/Type\s*\/Pages\b/.test((crudo[n]?.d) ?? s.slice(objs[n], objs[n] + 400)) && !/\/Parent/.test((crudo[n]?.d) ?? s.slice(objs[n], s.indexOf("endobj", objs[n]))));
  if (raiz) await recorrer(raiz);
  const out = [];
  for (const pn of paginas) {
    const d = (await leer(pn)).d; let res = await val(d, "Resources");
    if (!res) { let par = d.match(/\/Parent\s+(\d+)/)?.[1]; while (par && !res) { const pd = (await leer(par)).d; res = await val(pd, "Resources"); par = pd.match(/\/Parent\s+(\d+)/)?.[1]; } }
    const F = await fuentes(res);
    const cont = d.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/)?.[1] || "", partes = [];
    for (const r of cont.matchAll(/(\d+)\s+\d+\s+R/g)) { const o = await leer(r[1]); if (o.data) partes.push(L1(o.data)); else if (/^\s*\[/.test(o.d)) for (const r2 of o.d.matchAll(/(\d+)\s+\d+\s+R/g)) { const o2 = await leer(r2[1]); if (o2.data) partes.push(L1(o2.data)); } }
    out.push(pacPdfTexto(partes.join("\n"), F));
  }
  if (!out.join("").trim()) { /* Último recurso: todos los flujos de texto sin fuentes */
    for (const n of Object.keys(objs)) { const o = await leer(n); if (o.data) { const c = L1(o.data); if (/\bBT\b/.test(c)) out.push(pacPdfTexto(c, {})); } }
  }
  return out.join("\n");
}
function pacPdfTexto(c, F){
  const mul = (a, b) => [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3], a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]];
  let ctm = [1,0,0,1,0,0], pilaG = [], tm = [1,0,0,1,0,0], tlm = [1,0,0,1,0,0], TL = 0, fz = 10, font = null;
  const trozos = [];
  const tok = /\((?:\\[\s\S]|[^\\)])*\)|<<|>>|<[0-9A-Fa-f\s]*>|\[|\]|-?\d*\.?\d+|\/[^\s/<>\[\]()]+|[A-Za-z'"*]+[01*]?/g; let t, pila = [];
  const lit = s => { s = s.slice(1, -1); const b = []; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch !== "\\") { b.push(ch.charCodeAt(0)); continue; } const n = s[++i]; if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; b.push(parseInt(o, 8) & 255); } else if (n === "\n" || n === "\r") { if (n === "\r" && s[i + 1] === "\n") i++; } else b.push(({n:10, r:13, t:9, b:8, f:12}[n]) ?? n.charCodeAt(0)); } return b; };
  const hex = s => { const h = s.slice(1, -1).replace(/\s/g, ""); const b = []; for (let i = 0; i < h.length; i += 2) b.push(parseInt((h.substr(i, 2) + "0").slice(0, 2), 16)); return b; };
  let tc = 0, tw = 0, th = 1;
  /* Devuelve el texto y lo que avanza (en unidades de texto) */
  const dec = x => { const b = x[0] === "(" ? lit(x) : hex(x), f = F[font] || {bytes: 1}; let r = "", w = 0;
    for (let i = 0; i + f.bytes <= b.length; i += f.bytes) { let c = 0; for (let k = 0; k < f.bytes; k++) c = c * 256 + b[i + k];
      const ch = f.map ? (f.map[c] ?? "") : f.bytes === 2 ? "" : String.fromCharCode(c); r += ch;
      w += ((f.W?.[c] ?? f.dw ?? 500) / 1000 * fz + tc + (ch === " " && f.bytes === 1 ? tw : 0)) * th; }
    return [r, w]; };
  const avanza = w => { tm = mul([1,0,0,1,w,0], tm); };
  const pon = (txt, w) => { const m = mul(tm, ctm), esc_ = Math.hypot(m[0], m[1]) || 1; if (txt) trozos.push({x: m[4], y: m[5], xe: m[4] + w * esc_ * Math.sign(m[0] || 1), em: fz * esc_, s: txt}); avanza(w); };
  const nl = () => { tlm = mul([1,0,0,1,0,-TL], tlm); tm = tlm.slice(); };
  while ((t = tok.exec(c))) {
    const v = t[0], num = i => Number(pila[pila.length - i]);
    switch (v) {
      case "q": pilaG.push(ctm.slice()); pila = []; break;
      case "Q": ctm = pilaG.pop() || [1,0,0,1,0,0]; pila = []; break;
      case "cm": ctm = mul(pila.slice(-6).map(Number), ctm); pila = []; break;
      case "BT": tm = [1,0,0,1,0,0]; tlm = tm.slice(); pila = []; break;
      case "Tf": font = String(pila[pila.length - 2] || "").slice(1); fz = num(1); pila = []; break;
      case "TL": TL = num(1); pila = []; break;
      case "Td": tlm = mul([1,0,0,1,num(2),num(1)], tlm); tm = tlm.slice(); pila = []; break;
      case "TD": TL = -num(1); tlm = mul([1,0,0,1,num(2),num(1)], tlm); tm = tlm.slice(); pila = []; break;
      case "Tm": tlm = pila.slice(-6).map(Number); tm = tlm.slice(); pila = []; break;
      case "T*": nl(); pila = []; break;
      case "Tc": tc = num(1); pila = []; break;
      case "Tw": tw = num(1); pila = []; break;
      case "Tz": th = num(1) / 100; pila = []; break;
      case "Tj": { const x = [...pila].reverse().find(p => /^[(<]/.test(p)); if (x) pon(...dec(x)); pila = []; break; }
      case "'": case '"': { nl(); const x = [...pila].reverse().find(p => /^[(<]/.test(p)); if (x) pon(...dec(x)); pila = []; break; }
      case "TJ": { const ini = pila.lastIndexOf("["); let a = "", w = 0, x0 = null;
        for (const p of pila.slice(ini + 1)) { if (/^[(<]/.test(p)) { const [t2, w2] = dec(p); a += t2; w += w2; } else if (!isNaN(p)) { const d = -Number(p) / 1000 * fz * th; if (d > fz * 0.25) a += " "; w += d; } }
        pon(a, w); pila = []; break; }
      default: if (/^[A-Za-z]/.test(v) && v !== "R") pila = []; else pila.push(v);
    }
  }
  /* Agrupa por renglones (misma altura) y ordena de izquierda a derecha */
  const filas = [];
  for (const k of trozos.sort((a, b) => b.y - a.y || a.x - b.x)) { const f = filas.find(f => Math.abs(f.y - k.y) < 2.5); if (f) f.t.push(k); else filas.push({y: k.y, t: [k]}); }
  /* Une los trozos: sin espacio si van pegados (letras separadas por el ajuste entre caracteres) */
  return filas.sort((a, b) => b.y - a.y).map(f => f.t.sort((a, b) => a.x - b.x).reduce((acc, k, i, arr) => { if (!i) return k.s; const pr = arr[i - 1]; return acc + (k.x - pr.xe > k.em * 0.2 ? " " : "") + k.s; }, "").replace(/\s+/g, " ").trim()).join("\n");
}

/* ---- Coordenadas: UTM (ETRS89) y Web Mercator a grados ---- */
function pacUtm(x, y, zona){
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996;
  const M = y / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = ep2 * Math.cos(p1) ** 2, R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = (x - 500000) / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lat * 180 / Math.PI, (zona * 6 - 183) + lon * 180 / Math.PI];
}
/* srs: texto con el sistema de referencia (EPSG, .prj…). Devuelve una función [x,y] -> [lat,lng] */
function pacProy(srs, muestra){
  const s = String(srs || ""), z = s.match(/(?:258|326|230|3263|3043)(2[89]|3[01])\b/) || s.match(/UTM[ _]?(?:zone[ _]?)?(2[89]|3[01])/i) || s.match(/huso[ _]?(2[89]|3[01])/i);
  if (z) return ([x, y]) => pacUtm(x, y, Number(z[1]));
  if (/3857|900913|Mercator_Auxiliary|Pseudo/i.test(s)) return ([x, y]) => { const R = 6378137; return [(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI, x / R * 180 / Math.PI]; };
  const [x, y] = muestra || [0, 0];
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return Math.abs(x) > Math.abs(y) ? ([a, b]) => [a, b] : ([a, b]) => [b, a]; /* En España la latitud siempre es mayor */
  if (x < 0) return pacProy("3857");
  return ([a, b]) => pacUtm(a, b, b < 3.3e6 ? 28 : 30); /* Sin dato: huso 30 (península) o 28 (Canarias) */
}
const pacAnillo = (pts, proy) => pts.length > 2 ? pts.map(p => proy(p)).map(([la, ln]) => [Math.round(la * 1e7) / 1e7, Math.round(ln * 1e7) / 1e7]) : null;

/* ---- Formatos con geometría ---- */
function pacGeojson(j){
  const feats = j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : Array.isArray(j) ? j : [];
  const srs = j.crs?.properties?.name;
  return feats.map(f => {
    let c = f.geometry?.coordinates; if (f.geometry?.type === "MultiPolygon") c = [...c].sort((a, b) => b[0].length - a[0].length)[0];
    const ring = f.geometry?.type?.endsWith("Polygon") ? c?.[0] : null;
    return {props: f.properties || {}, geo: ring ? pacAnillo(ring, pacProy(srs, ring[0])) : null};
  });
}
function pacGml(txt){
  const doc = pacXml(txt);
  if (doc.getElementsByTagName("parsererror").length) throw new Error("xml");
  const kml = doc.getElementsByTagName("Placemark");
  if (kml.length) return [...kml].map(pm => {
    const props = {}; for (const d of pm.querySelectorAll("SimpleData, Data")) props[d.getAttribute("name")] = d.textContent.trim() || d.getElementsByTagName("value")[0]?.textContent?.trim();
    const nm = pm.getElementsByTagName("name")[0]?.textContent; if (nm && !props.nombre) props.nombre = nm;
    const co = pm.getElementsByTagName("coordinates")[0]?.textContent.trim().split(/\s+/).map(p => p.split(",").map(Number));
    return {props, geo: co?.length > 2 ? co.map(([ln, la]) => [la, ln]) : null};
  });
  const out = [], srsGlobal = doc.documentElement.getAttribute("srsName") || doc.querySelector("[srsName]")?.getAttribute("srsName");
  const miembros = [...doc.getElementsByTagNameNS("*", "featureMember"), ...doc.getElementsByTagNameNS("*", "member")].map(m => m.firstElementChild).filter(Boolean);
  const lista = miembros.length ? miembros : [...(doc.getElementsByTagNameNS("*", "featureMembers")[0]?.children || [])];
  for (const ft of lista) {
    const props = {};
    for (const el of ft.getElementsByTagName("*")) if (!el.children.length && el.textContent.trim() && !/posList|coordinates|pos$/i.test(el.localName)) props[el.localName] = el.textContent.trim();
    const pl = ft.getElementsByTagNameNS("*", "posList")[0] || ft.getElementsByTagNameNS("*", "coordinates")[0];
    let geo = null;
    if (pl) {
      const srs = pl.closest("[srsName]")?.getAttribute("srsName") || srsGlobal;
      const nums = pl.textContent.trim().split(/[\s,]+/).map(Number), dim = Number(pl.getAttribute("srsDimension")) || 2, pts = [];
      for (let i = 0; i + dim - 1 < nums.length; i += dim) pts.push([nums[i], nums[i + 1]]);
      if (pts.length) { const pr = /4258|4326/.test(srs || "") && !/CRS84/.test(srs) ? ([a, b]) => [a, b] : pacProy(srs, pts[0]); geo = pacAnillo(pts, pr); }
    }
    out.push({props, geo});
  }
  return out;
}
async function pacShp(z){
  const nombres = Object.keys(z), base = nombres.find(n => /\.shp$/i.test(n))?.replace(/\.shp$/i, "");
  if (!base) return null;
  const get = async ext => { const k = nombres.find(n => n.toLowerCase() === (base + ext).toLowerCase()); return k ? await z[k]() : null; };
  const shp = await get(".shp"), dbf = await get(".dbf"), prj = await get(".prj"), cpg = await get(".cpg");
  const srs = prj ? new TextDecoder().decode(prj) : "";
  const props = [];
  if (dbf) {
    const dv = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength), nr = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true);
    const enc = cpg && /utf/i.test(new TextDecoder().decode(cpg)) ? "utf-8" : null, dec = b => { if (enc) return new TextDecoder(enc).decode(b); try { return new TextDecoder("utf-8", {fatal: true}).decode(b); } catch(e) { return new TextDecoder("windows-1252").decode(b); } };
    const campos = []; for (let p = 32, o = 1; dbf[p] !== 0x0D && p < hl; p += 32) { const len = dbf[p + 16]; campos.push({n: dec(dbf.subarray(p, p + 11)).replace(/\0.*$/s, "").trim(), o, len}); o += len; }
    for (let i = 0; i < nr; i++) { const b = hl + i * rl, r = {}; for (const c of campos) r[c.n] = dec(dbf.subarray(b + c.o, b + c.o + c.len)).trim(); props.push(r); }
  }
  const geos = [];
  if (shp) {
    const dv = new DataView(shp.buffer, shp.byteOffset, shp.byteLength); let p = 100, proy = null;
    while (p + 8 <= shp.byteLength) {
      const len = dv.getInt32(p + 4) * 2, c = p + 8, tipo = dv.getInt32(c, true); let geo = null;
      if ([5, 15, 25].includes(tipo)) {
        const np = dv.getInt32(c + 36, true), nPts = dv.getInt32(c + 40, true), partes = []; for (let k = 0; k < np; k++) partes.push(dv.getInt32(c + 44 + 4 * k, true));
        const pb = c + 44 + 4 * np, pts = []; for (let k = 0; k < nPts; k++) pts.push([dv.getFloat64(pb + 16 * k, true), dv.getFloat64(pb + 16 * k + 8, true)]);
        partes.push(nPts); const anillos = partes.slice(0, -1).map((s, k) => pts.slice(s, partes[k + 1])).sort((a, b) => b.length - a.length);
        if (anillos[0]?.length) { proy = proy || pacProy(srs, anillos[0][0]); geo = pacAnillo(anillos[0], proy); }
      }
      geos.push(geo); p = c + len;
    }
  }
  return Array.from({length: Math.max(props.length, geos.length)}, (_, i) => ({props: props[i] || {}, geo: geos[i] || null}));
}

/* ---- De filas/rasgos a recintos ---- */
const pacUsoOpc = cod => { const c = String(cod || "").trim().toUpperCase().slice(0, 2); return USOS.find(u => u.startsWith(c + " ")) || null; };
function pacDeRefs(o){
  const r = {};
  if (o.ref != null && o.ref !== "") { const n = String(o.ref).split(/[^0-9]+/).filter(Boolean); if (n.length >= 7) [r.prov, r.mun, r.ag, r.zona, r.pol, r.par, r.rec] = n.slice(-7); else if (n.length >= 5) [r.prov, r.mun, r.pol, r.par, r.rec] = n.slice(-5); }
  for (const k of ["prov","mun","ag","zona","pol","par","rec"]) if (o[k] != null && o[k] !== "") r[k] = o[k];
  return r;
}
function pacRecinto(o, geo){
  const r = pacDeRefs(o);
  const pol = pacInt(r.pol), par = pacInt(r.par); if (pol == null || par == null) return null;
  const munN = pacInt(r.mun), provN = pacInt(r.prov);
  let supd = pacNum(o.supd), sups = pacNum(o.sups);
  const rows = {
    prov: provN != null && /^\d+$/.test(String(r.prov).trim()) ? provN : (r.prov != null ? String(r.prov).trim() : null),
    mun: munN != null && /^\d+$/.test(String(r.mun).trim()) ? munN : (r.mun != null ? String(r.mun).trim() : null),
    ag: pacInt(r.ag) ?? 0, zona: pacInt(r.zona) ?? 0, pol, par, rec: pacInt(r.rec),
    supd, sups, uso: o.uso ? String(o.uso).trim() : "", prod: String(o.prod || "").trim(), prodc: o.prodc != null ? String(o.prodc).trim() : "",
    var: String(o.var || "").trim(), riego: String(o.riego || "").trim(), nombre: String(o.nombre || "").trim(), geo: geo || null};
  return rows;
}
/* Ajusta superficies en m² a hectáreas si toca */
function pacUnidades(rs, cab){
  for (const k of ["supd", "sups"]) {
    const v = rs.map(r => r[k]).filter(x => x > 0).sort((a, b) => a - b); if (!v.length) continue;
    const m2 = /m2|m\u00b2|metros/.test(cab?.[k] || "") || v[Math.floor(v.length / 2)] > 2000;
    const a = /\bareas?\b/.test(cab?.[k] || "");
    if (m2 || a) for (const r of rs) if (r[k] != null) r[k] = r[k] / (m2 ? 10000 : 100);
  }
  return rs;
}
function pacTabla(filas){
  let best = null;
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const map = {}; filas[i].forEach((h, j) => { const k = pacCol(h); if (k && map[k] == null) map[k] = j; });
    const pts = Object.keys(map).length + (map.pol != null && map.par != null ? 3 : 0) + (map.ref != null ? 3 : 0);
    if ((map.pol != null && map.par != null || map.ref != null) && (!best || pts > best.pts)) best = {i, map, pts, cab: Object.fromEntries(Object.entries(map).map(([k, j]) => [k, pacNorm(filas[i][j])]))};
  }
  if (!best) return null;
  const rs = [];
  for (const f of filas.slice(best.i + 1)) {
    if (!f.some(x => String(x).trim())) continue;
    const o = {}; for (const [k, j] of Object.entries(best.map)) o[k] = f[j];
    const r = pacRecinto(o); if (r) rs.push(r);
  }
  return pacUnidades(rs, best.cab);
}
function pacProps(lista){
  const rs = [];
  for (const {props, geo} of lista) {
    const o = {}; for (const [h, v] of Object.entries(props)) { const k = pacCol(h); if (k && (o[k] == null || o[k] === "")) o[k] = v; }
    const r = pacRecinto(o, geo); if (r) rs.push(r);
  }
  const cab = {}; for (const {props} of lista.slice(0, 1)) for (const h of Object.keys(props)) { const k = pacCol(h); if (k && !cab[k]) cab[k] = pacNorm(h); }
  return pacUnidades(rs, cab);
}
/* Texto libre (pegado o sacado del PDF): busca líneas con prov, mun, agr, zona, pol, par y recinto */
function pacLineas(txt){
  const rs = [];
  /* Busca tramos de 7 o más números enteros seguidos (prov, mun, agr, zona, pol, par, rec). Si delante hay
     un número de orden o de línea, elige la ventana más verosímil: agregado y zona suelen ser 0. */
  const ventana = l => {
    const toks = [...l.matchAll(/\d+(?:[.,]\d+)?/g)].map(x => ({v: x[0], i: x.index, f: x.index + x[0].length})), mejor = [];
    for (let a = 0; a < toks.length; a++) {
      let b = a; while (b < toks.length && /^\d+$/.test(toks[b].v) && (b === a || /^[\s:\-/]+$/.test(l.slice(toks[b - 1].f, toks[b].i)))) b++;
      if (b - a >= 7) for (let k = a; k + 7 <= b; k++) {
        const n = toks.slice(k, k + 7).map(x => Number(x.v)); if (n[0] < 1 || n[0] > 52 || !n[1] || n[1] > 999 || n[4] < 1 || n[5] < 1) continue;
        const pts = (n[2] === 0) * 4 + (n[3] === 0) * 4 + (n[2] < 100) * 2 + (n[3] < 100) * 2 + (k + 7 === b) * 1 + ([2, 13, 16, 19, 45].includes(n[0])) * 1;
        mejor.push({pts, n, fin: toks[k + 6].f});
      }
      if (b > a) a = b - 1;
    }
    return mejor.sort((x, y) => y.pts - x.pts)[0];
  };
  /* Renglones sueltos solo con texto en mayúsculas: suelen ser un nombre de cultivo partido en dos líneas */
  const ls = txt.split(/\r?\n/).map(l => l.trim()), ws = ls.map(ventana), suelto = i => i >= 0 && i < ls.length && !ws[i] && /^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ .,\-/]{2,40}$/.test(ls[i]);
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i], w = ws[i]; if (!w) continue;
    const [prov, mun, ag, zona, pol, par, rec] = w.n;
    const resto = l.slice(w.fin);
    const uso = (resto.match(/\b([A-Z]{2})\b/g) || []).find(c => SIG_USOS[c] || pacUsoOpc(c)) || "";
    const dec = (resto.match(/\d+[.,]\d+/g) || []).map(pacNum).filter(x => x > 0 && x < 5000);
    const palabras = resto.replace(/\b[A-Z]{2}\b/, " ").replace(/(^|\s)[SR](?=\s|$)/g, " ").match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.()\-/ ]{2,}/g) || [];
    let prod = palabras.map(s => s.trim()).filter(s => s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "").length >= 3 && !/^(si|no|secano|regadio|regadío|ha|has)$/i.test(s)).sort((a, b) => b.length - a.length)[0] || "";
    const centrado = j => ws[j] && suelto(j - 1) && suelto(j + 1);
    if (centrado(i)) prod = [ls[i - 1], ls[i + 1], prod].filter(Boolean).join(" ");
    else if (suelto(i + 1) && !centrado(i + 2)) prod = [prod, ls[i + 1]].filter(Boolean).join(" ");
    const riego = /regad[ií]o|(^|\s)R(\s|$)/i.test(resto) ? "Regadío" : /secano|(^|\s)S(\s|$)/.test(resto) ? "Secano" : "";
    rs.push({prov, mun, ag, zona, pol, par, rec, supd: dec.length ? dec[dec.length - 1] : null, sups: dec.length > 1 ? dec[0] : null, uso, prod, prodc: "", var: "", riego, nombre: "", geo: null});
  }
  return rs;
}
async function pacLeer(file){
  const buf = await file.arrayBuffer(), u = new Uint8Array(buf), nom = file.name.toLowerCase();
  const esZip = u[0] === 0x50 && u[1] === 0x4B;
  if (esZip) {
    const z = await pacZip(buf);
    if (z["xl/workbook.xml"]) { for (const h of await pacXlsx(buf)) { const r = pacTabla(h); if (r?.length) return r; } const t = (await pacXlsx(buf)).map(h => h.map(f => f.join(" ")).join("\n")).join("\n"); return pacLineas(t); }
    const shp = await pacShp(z); if (shp) return pacProps(shp);
    for (const k of Object.keys(z).filter(k => /\.(gml|xml|kml|geojson|json|csv|txt)$/i.test(k))) { const r = await pacLeer(new File([await z[k]()], k)); if (r.length) return r; }
    throw new Error("zip-vacio");
  }
  if (u[0] === 0xD0 && u[1] === 0xCF) throw new Error("xls");
  if (String.fromCharCode(...u.subarray(0, 5)) === "%PDF-") { PAC.pdf = await pacPdf(buf); return pacLineas(PAC.pdf); }
  const txt = pacTexto(buf), t0 = txt.trimStart();
  if (/^[{[]/.test(t0) && /\.(geo)?json$/.test(nom) || /^\{\s*"type"/.test(t0)) return pacProps(pacGeojson(JSON.parse(t0)));
  if (t0.startsWith("<")) return pacProps(pacGml(t0));
  const t = pacTabla(pacCsv(txt)); return t?.length ? t : pacLineas(txt);
}

/* ---- Pantalla de importación ---- */
const pacRefTxt = r => [r.prov, r.mun, r.ag, r.zona, r.pol, r.par, r.rec].map(x => x ?? "").join(":");
const pacMisma = (p, r) => !p._demo && String(p.poligono) === String(r.pol) && String(p.parcela) === String(r.par) && String(p.recinto ?? "") === String(r.rec ?? "") && (!p.municipio || r.mun == null || pacNorm(p.municipio) === pacNorm(r.mun));
function pacAgrupar(rs){
  const g = new Map();
  for (const r of rs) { const k = pacRefTxt(r); if (!g.has(k)) g.set(k, {...r, lineas: []}); const x = g.get(k); x.lineas.push(r); if (!x.geo && r.geo) x.geo = r.geo; if (!x.uso && r.uso) x.uso = r.uso; if (x.sups == null && r.sups != null) x.sups = r.sups; if (!x.nombre && r.nombre) x.nombre = r.nombre; if (!x.riego && r.riego) x.riego = r.riego; }
  return [...g.values()].map(x => { const sd = x.lineas.reduce((a, l) => a + (l.supd || 0), 0); x.sup = sd || x.sups || (x.geo && typeof areaHa === "function" ? Math.round(areaHa(x.geo) * 10000) / 10000 : null); x.existe = DB.parcelas.find(p => pacMisma(p, x)) || null; return x; });
}
function pacDialogo(){
  const dlg = $("#dlg"), y = new Date().getFullYear();
  dlg.innerHTML = `<form class="dlg" id="pacFrm" novalidate>
    <header><h2>Importar la declaración de la PAC</h2><button type="button" class="x" data-act="close" aria-label="Cerrar">×</button></header>
    <div class="body" id="pacBody">
      <p class="fld full" style="margin:0">Elige el fichero de tu solicitud única (te lo da la comunidad autónoma, la cooperativa o la oficina que te hace la PAC). Sirve el Excel, el CSV, el PDF, el fichero del mapa (GML, KML, GeoJSON o SHP en .zip). No se sube a ningún sitio: se lee en este dispositivo.</p>
      <div class="fld full"><label for="pacFile">Fichero de la PAC</label><input type="file" id="pacFile" accept=".xlsx,.csv,.txt,.pdf,.gml,.xml,.kml,.json,.geojson,.zip"></div>
      <div class="fld full"><label for="pacTxt">O pega aquí el texto copiado del PDF</label><textarea id="pacTxt" rows="4" placeholder="Abre el PDF, selecciona la tabla de recintos, cópiala y pégala aquí"></textarea>
        <div class="toolbar" style="margin-top:6px"><button type="button" class="btn" data-act="pac-pegar">Leer el texto pegado</button></div></div>
      <div class="fld full" id="pacRes"></div>
    </div>
    <footer><div class="left"><label class="muted" for="pacCamp">Campaña</label><select id="pacCamp" style="width:auto">${[y + 1, y, y - 1, y - 2].map(v => `<option ${v === y ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pacCult" checked style="width:auto"> Crear también los cultivos</label></div>
      <button type="button" class="btn" data-act="close">Cancelar</button>
      <button type="submit" class="btn primary" id="pacOk" disabled>Importar</button></footer></form>`;
  dlg.dataset.t = ""; dlg.dataset.id = "";
  dlg.showModal();
}
function pacMostrar(rs){
  const box = $("#pacRes"), ok = $("#pacOk");
  PAC.filas = pacAgrupar(rs);
  if (!PAC.filas.length) {
    ok.disabled = true;
    box.innerHTML = `<p style="color:var(--warn);margin:0">No he encontrado recintos en ${esc(PAC.origen)}.</p><p class="muted" style="margin:4px 0 0">${PAC.pdf != null ? "Este PDF no deja leer su texto directamente. Ábrelo, selecciona la tabla de recintos, cópiala y pégala en el cuadro de arriba." : "Comprueba que es la declaración (con polígono, parcela y recinto) o pega el texto en el cuadro de arriba."}</p>`;
    return;
  }
  const nuevas = PAC.filas.filter(r => !r.existe).length, lineas = PAC.filas.reduce((a, r) => a + r.lineas.length, 0), ha = PAC.filas.reduce((a, r) => a + (r.sup || 0), 0), conGeo = PAC.filas.filter(r => r.geo).length;
  const puedeSig = PAC.filas.some(r => !r.geo && typeof r.mun === "number" && typeof r.prov === "number");
  box.innerHTML = `<p style="margin:0 0 8px"><strong>${PAC.filas.length} recinto${PAC.filas.length === 1 ? "" : "s"}</strong> · ${fnum(Math.round(ha * 100) / 100)} ha · ${lineas} línea${lineas === 1 ? "" : "s"} de cultivo${conGeo ? ` · ${conGeo} con contorno para el mapa` : ""}.
    ${PAC.filas.length - nuevas ? ` ${PAC.filas.length - nuevas} ya estaban en la app: solo se completará lo que les falte.` : ""}</p>
    ${puedeSig ? `<label class="muted" style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="pacSig" checked style="width:auto"> Buscar los contornos en el SIGPAC para verlos en el mapa (necesita internet)</label>` : ""}
    <div class="table-wrap" style="max-height:40vh"><table><thead><tr><th><input type="checkbox" id="pacTodos" checked aria-label="Marcar todos" style="width:auto"></th><th>Recinto (pol/par/rec)</th><th>Municipio</th><th>Superficie</th><th>Uso</th><th>Cultivo</th></tr></thead><tbody>
    ${PAC.filas.map((r, i) => `<tr><td><input type="checkbox" class="pacSel" data-i="${i}" checked style="width:auto" aria-label="Importar"></td><td>${r.pol}/${r.par}/${r.rec ?? ""}${r.existe ? ` <span class="pill">ya está</span>` : ""}</td><td>${esc(r.mun ?? "")}</td><td class="num">${r.sup ? fnum(Math.round(r.sup * 10000) / 10000) + " ha" : ""}</td><td>${esc(r.uso)}</td><td class="wrap-cell">${esc([...new Set(r.lineas.map(l => l.prod || (l.prodc ? `Producto ${l.prodc}` : "")).filter(Boolean))].join(", "))}</td></tr>`).join("")}
    </tbody></table></div>`;
  ok.disabled = false; ok.textContent = `Importar ${PAC.filas.length}`;
}
async function pacCargar(fn, origen){
  const box = $("#pacRes"); PAC.origen = origen; PAC.pdf = null;
  box.innerHTML = `<p class="muted" style="margin:0">Leyendo ${esc(origen)}…</p>`;
  try { pacMostrar(await fn()); }
  catch(e) {
    console.warn(e); $("#pacOk").disabled = true;
    box.innerHTML = `<p style="color:var(--warn);margin:0">${e.message === "xls" ? "Este Excel es del formato antiguo (.xls). Ábrelo y guárdalo como «Libro de Excel (.xlsx)» o como CSV, y vuelve a elegirlo." : "No he podido leer ese fichero. Prueba con el Excel o el CSV de la declaración, o pega el texto del PDF en el cuadro de arriba."}</p>`;
  }
}
/* Contorno, superficie y uso de un recinto desde el servicio de consultas del SIGPAC (FEGA) */
async function pacSigpac(r){
  const url = `https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfo/${r.prov}/${r.mun}/${r.ag || 0}/${r.zona || 0}/${r.pol}/${r.par}/${r.rec ?? 1}.geojson`;
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try { const res = await fetch(url, {signal: ctl.signal}); if (!res.ok) return null; const j = await res.json(); const f = (j.features || [j])[0]; if (!f) return null;
    const d = sigDatos(f.properties || {}); d.geo = sigAnillo(f.geometry); return d; }
  catch(e) { return null; } finally { clearTimeout(to); }
}
async function pacImportar(){
  const camp = Number($("#pacCamp").value), cult = $("#pacCult").checked, sig = $("#pacSig")?.checked && navigator.onLine;
  const sel = [...document.querySelectorAll(".pacSel:checked")].map(c => PAC.filas[Number(c.dataset.i)]);
  if (!sel.length) return toast("Marca al menos un recinto");
  const ok = $("#pacOk"); ok.disabled = true;
  if (sig) {
    let n = 0; for (const r of sel.filter(r => !r.geo && typeof r.mun === "number")) {
      ok.textContent = `Buscando contornos ${++n}…`;
      const d = await pacSigpac(r); if (!d) { if (n >= 3 && !sel.some(x => x._sig)) break; continue; }
      r._sig = 1; if (d.geo?.length > 2) r.geo = d.geo; if (!r.uso && d.uso) r.uso = d.uso; if (!r.sup && d.superficie) r.sup = d.superficie;
    }
  }
  let np = 0, ac = 0, nc = 0; const t = now();
  for (const r of sel) {
    const usoOpc = pacUsoOpc(r.uso) || (r.uso ? "Otro" : "");
    const riego = /^r|regad/i.test(r.riego) ? "Regadío" : /^s|secano/i.test(r.riego) ? "Secano" : "";
    let p = r.existe;
    if (p) {
      let cambia = false; const fija = (k, v) => { if ((p[k] == null || p[k] === "") && v != null && v !== "") { p[k] = v; cambia = true; } };
      fija("recinto", r.rec); fija("municipio", r.mun != null ? String(r.mun) : ""); fija("provincia", r.prov != null ? String(r.prov) : ""); fija("superficie", r.sup ? Math.round(r.sup * 10000) / 10000 : null); fija("uso", usoOpc); fija("riego", riego);
      if (!p.geo?.length && r.geo) { p.geo = r.geo; cambia = true; }
      if (cambia) { p._u = t; ac++; }
    } else {
      p = {id: uid(), nombre: r.nombre || `Pol. ${r.pol} Par. ${r.par}${r.rec != null ? ` Rec. ${r.rec}` : ""}`, municipio: r.mun != null ? String(r.mun) : "", provincia: r.prov != null ? String(r.prov) : "",
        poligono: r.pol, parcela: r.par, recinto: r.rec ?? "", superficie: r.sup ? Math.round(r.sup * 10000) / 10000 : "", uso: usoOpc, riego,
        notas: `Importada de la PAC ${camp}. Referencia SIGPAC ${pacRefTxt(r)}${usoOpc === "Otro" ? ` · uso ${r.uso}` : ""}`, _u: t};
      if (r.geo) p.geo = r.geo;
      DB.parcelas.push(p); np++;
    }
    if (cult) for (const l of r.lineas) {
      const nombre = l.prod || (l.prodc ? `Producto PAC ${l.prodc}` : ""); if (!nombre) continue;
      if (DB.cultivos.some(c => c.parcela === p.id && String(c.campana) === String(camp) && pacNorm(c.cultivo) === pacNorm(nombre))) continue;
      DB.cultivos.push({id: uid(), campana: camp, parcela: p.id, cultivo: nombre, variedad: l.var || "", superficie: l.supd ? Math.round(l.supd * 10000) / 10000 : (r.lineas.length === 1 && r.sup ? Math.round(r.sup * 10000) / 10000 : ""), estado: "En curso", notas: `Declarado en la PAC ${camp}`, _u: t});
      nc++;
    }
  }
  await save(); $("#dlg").close(); UI.tab.agri = "parcelas"; render();
  toast([np && `${np} parcela${np === 1 ? "" : "s"} nueva${np === 1 ? "" : "s"}`, ac && `${ac} completada${ac === 1 ? "" : "s"}`, nc && `${nc} cultivo${nc === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "No había nada nuevo que importar");
}
document.addEventListener("change", e => {
  if (e.target.id === "pacFile" && e.target.files[0]) { const f = e.target.files[0]; pacCargar(() => pacLeer(f), `«${f.name}»`); }
  else if (e.target.id === "pacTodos") document.querySelectorAll(".pacSel").forEach(c => c.checked = e.target.checked);
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "pac-abrir") pacDialogo();
  else if (el.dataset.act === "pac-pegar") { const t = $("#pacTxt").value; if (!t.trim()) return toast("Pega primero el texto del PDF"); pacCargar(async () => { const tb = pacTabla(pacCsv(t)); return tb?.length ? tb : pacLineas(t); }, "el texto pegado"); }
});
document.addEventListener("submit", e => { if (e.target.id === "pacFrm") { e.preventDefault(); pacImportar(); } });
/* Botón «Importar PAC» en la lista de parcelas */
{ const _vm = viewModulo; viewModulo = mod => { const h = _vm(mod); return mod === "agri" && UI.tab.agri === "parcelas" ? h.replaceAll('<button class="btn primary" data-new="parcelas">', '<button class="btn" data-act="pac-abrir" title="Crear las parcelas desde el fichero de la solicitud única">📄 Importar PAC</button><button class="btn primary" data-new="parcelas">') : h; }; }
