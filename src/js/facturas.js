/* ============ Escanear facturas y albaranes ============
   Se hace una foto (o se elige el PDF que manda el proveedor) y la app lee el texto en el propio
   móvil, sin mandarlo a ningún sitio. Luego enseña lo que ha entendido para que lo revises antes
   de guardarlo como compras del almacén o como gastos. */
const FAC = {};

/* ---- Lector de texto (Tesseract, se descarga la primera vez y queda guardado) ---- */
function facScript(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { s.remove(); rej(new Error(src)); }; document.head.appendChild(s); }); }
async function facLector(aviso){
  if (FAC.worker) return FAC.worker;
  const local = new URL("vendor/ocr/", location.href).href;
  const cdn = {lib:"https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/", core:"https://cdn.jsdelivr.net/npm/tesseract.js-core@6.1.2", lang:"https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int"};
  let rutas = {lib: local, core: local + "core", lang: local + "lang"};
  if (!window.Tesseract) {
    try { await facScript(local + "tesseract.min.js"); }
    catch(e) { rutas = cdn; await facScript(cdn.lib + "tesseract.min.js"); }
  }
  FAC.worker = await Tesseract.createWorker("spa", 1, {
    workerPath: rutas.lib + "worker.min.js", corePath: rutas.core, langPath: rutas.lang,
    logger: m => aviso?.(m)
  });
  return FAC.worker;
}
/* Prepara la foto: tamaño adecuado y en gris, que se lee mejor */
async function facPreparar(file){
  const bmp = await createImageBitmap(file);
  const k = Math.min(2.2, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext("2d"); x.filter = "grayscale(1) contrast(1.25)"; x.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/* ---- Entender el texto ---- */
const facNorm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function facNum(s){
  s = String(s).replace(/[€\s]/g, "").replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0");
  if (!/\d/.test(s)) return NaN;
  const c = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c >= 0) s = /^-?\d{1,3}(,\d{3})+$/.test(s) && !/,\d{2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (p >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return Number(s);
}
const FAC_UNID = {kg:"kg", kgs:"kg", kilos:"kg", k:"kg", l:"L", lt:"L", lts:"L", litros:"L", litro:"L", ud:"ud", uds:"ud", u:"ud", un:"ud", unid:"ud", unidades:"ud", saco:"sacos", sacos:"sacos", sc:"sacos", dosis:"dosis", tiras:"tiras", t:"t", tm:"t", tn:"t"};
const FAC_NO_LINEA = /\b(total|subtotal|base|imponible|i\.?v\.?a|cuota|recargo|retenci|n\.?i\.?f|c\.?i\.?f|tel[eé]?f|\btel\b|tlf|m[oó]vil|fax|c\.?p\b|telefono|direcci|calle|avda|pol[ií]gono ind|p[aá]gina|vencim|iban|swift|forma de pago|banco|entidad|cuenta|fecha|factura n|albar[aá]n n|cliente|proveedor|registro mercantil|tomo|folio|inscrita|e-?mail|www\.|@)/i;
const FAC_CAT = [
  [/semilla|simiente|planta(?!ci)|plant[oó]n|injert/i, "Semillas y plantas", "Semilla"],
  [/herbicida|fungicida|insecticida|acaricida|glifosato|cobre|azufre|fitosanit|mojante|coadyuvante|\bsc\b|\bwg\b|\bec\b|\bwp\b|\bsl\b/i, "Fitosanitarios", "Fitosanitario"],
  [/abono|urea|nitrato|sulfato am|fosfato|potas|npk|\b\d{1,2}-\d{1,2}-\d{1,2}\b|n-32|nac\b|estiercol|enmienda|quelato|foliar/i, "Abonos", "Abono"],
  [/pienso|cebada para|forraje|paja|alfalfa|corrector|bloque|leche en polvo|lactorreemplazante/i, "Piensos", "Pienso"],
  [/vacuna|antiparasit|antibio|veterin|ivermect|oxitetra|medicament/i, "Veterinario", "Medicamento veterinario"],
  [/amitraz|apivar|apistan|oxalico|acido formico|varroa|cera|candy|fondant|jarabe/i, "Piensos", "Alimento apícola"],
  [/gasoleo|gasoil|gasóleo|adblue|combustible|carburante|gasolina/i, "Combustible", "Combustible"],
  [/reparaci|recambio|neumatic|filtro|aceite (de )?motor|aceite hidraul|correa|rodamiento|cuchilla|reja|bateria|mano de obra taller|taller|itv/i, "Maquinaria", "Otro"],
  [/seguro|poliza|agroseguro/i, "Seguros", ""],
];
function facCategoria(txt){ for (const [re, cat, tipo] of FAC_CAT) if (re.test(txt)) return {cat, tipo}; return {cat:"Otros", tipo:"Otro"}; }
function facProducto(desc){
  const toks = s => facNorm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const d = new Set(toks(desc)); let best = null, bs = 0;
  for (const p of DB.productos) {
    const pt = toks(p.nombre); if (!pt.length) continue;
    let s = pt.filter(w => d.has(w)).length / pt.length;
    if (p.registro && facNorm(desc).replace(/\s/g, "").includes(facNorm(p.registro).replace(/\s/g, ""))) s += 1;
    if (s > bs) { bs = s; best = p; }
  }
  return bs >= 0.5 ? best : null;
}
function facFecha(txt){
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const cands = [];
  for (const m of txt.matchAll(/(?<!\d)(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})(?!\d)/g)) {
    let [, d, mo, y] = m; y = y.length === 2 ? "20" + y : y;
    if (+d >= 1 && +d <= 31 && +mo >= 1 && +mo <= 12 && +y > 2000) cands.push({f:`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`, i:m.index});
  }
  for (const m of facNorm(txt).matchAll(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/g)) { const mo = meses.indexOf(m[2]) + 1; if (mo) cands.push({f:`${m[3]}-${String(mo).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`, i:m.index}); }
  if (!cands.length) return "";
  // La que está más cerca de la palabra «fecha»; si no, la primera
  const fi = facNorm(txt).search(/fecha/);
  if (fi >= 0) cands.sort((a, b) => Math.abs(a.i - fi) - Math.abs(b.i - fi));
  return cands.find(c => c.f <= addDays(today(), 7))?.f || cands[0].f;
}
function facLeerTexto(txt){
  const lineas = txt.split(/\r?\n/).map(l => l.replace(/[|_]{1,}/g, " ").replace(/\s{2,}/g, "  ").trim()).filter(Boolean);
  const nifPropio = facNorm(DB._meta.titular?.nif).replace(/[^a-z0-9]/g, "");
  const o = {fecha: facFecha(txt), numero:"", proveedor:"", nif:"", total:null, base:null, tipo: /albar[aá]n/i.test(txt) && !/factura/i.test(txt) ? "Albarán" : "Factura", lineas:[]};
  // NIF o CIF del proveedor (el primero que no sea el tuyo)
  for (const m of txt.toUpperCase().matchAll(/\b([A-HJ-NP-SUVW])[\s.\-]?(\d{7})[\s.\-]?([0-9A-J])\b|\b(\d{8})[\s.\-]?([A-Z])\b/g)) {
    const v = m[0].replace(/[\s.\-]/g, ""); if (facNorm(v) !== nifPropio) { o.nif = v; break; }
  }
  const nm = txt.match(/(?:factura|fra\.?|albar[aá]n|n[ºo°]\s*(?:de\s*)?(?:factura|documento))\s*(?:n[ºo°.]*|num\.?|n[uú]mero|no\.?)?\s*[:#.]?\s*([A-Z]{0,4}[\s\-\/]?\d[A-Z0-9\-\/.]{1,18})/i);
  if (nm) o.numero = nm[1].replace(/\s+/g, "").replace(/[.\-\/]$/, "");
  // Proveedor: uno que ya conozcas si aparece; si no, una línea con S.L., S.A., cooperativa...
  const conocidos = [...new Set([...DB.compras.map(c => c.proveedor), ...DB.productos.map(p => p.proveedor)].filter(Boolean))];
  o.proveedor = conocidos.find(p => facNorm(txt).includes(facNorm(p))) || "";
  if (!o.proveedor) {
    const tit = facNorm(DB._meta.titular?.nombre);
    const limpia = l => l.replace(/\s+(factura|albar[aá]n|fra\.)(\s.*)?$/i, "").replace(/\s{2,}.*/, "").trim();
    const ok = l => { l = limpia(l); return /[a-z]{3}/i.test(l) && !(tit && facNorm(l).includes(tit)) && !/^(factura|albar|fecha|cliente|c\/|calle|avda)/i.test(l); };
    o.proveedor = limpia(lineas.slice(0, 12).find(l => /(^|[\s,])(s\.?\s?l\.?(u\.?)?|s\.?\s?a\.?(u\.?)?|s\.?\s?coop\.?|cooperativa|s\.?a\.?t\.?|sociedad|agro\w*|comercial|suministros|hermanos|hnos\.?)(?=[\s,]|$)/i.test(limpia(l)) && ok(l)) || lineas.slice(0, 5).find(l => ok(l) && (limpia(l).match(/\d/g) || []).length < 3) || "").slice(0, 80);
  }
  // Total y base
  const ultimoNum = l => { const ns = (l.match(/-?\d[\d.,\s]*\d|\d/g) || []).map(s => facNum(s.trim())).filter(n => !isNaN(n)); return ns.length ? ns[ns.length - 1] : null; };
  for (const l of lineas) {
    const n = facNorm(l);
    if (/total/.test(n) && !/subtotal|total base|total bruto|total linea|total dto|total descuento/.test(n)) { const v = ultimoNum(l); if (v != null && v > 0) o.total = v; }
    if (/base\s*imponible|total\s*base|^base\b|subtotal|total bruto/.test(n)) { const v = ultimoNum(l); if (v != null && v > 0 && o.base == null) o.base = v; }
  }
  // Líneas de producto: descripción seguida de columnas de números (cantidad, precio, importe)
  for (const l of lineas) {
    if (FAC_NO_LINEA.test(l)) continue;
    const tk = l.split(/\s+/), cols = []; let unidad = "", i = tk.length - 1;
    for (; i >= 0; i--) {
      const t = tk[i].replace(/[€%]/g, ""), tn = facNorm(t).replace(/\.$/, "");
      if (t === "") continue;
      const pegado = t.match(/^(\d[\d.,]*)(kg|kgs|l|lt|lts|ud|uds)\.?$/i);
      if (pegado) { cols.unshift(facNum(pegado[1])); unidad = unidad || FAC_UNID[pegado[2].toLowerCase()]; continue; }
      if (/^-?[\dOo][\d.,Oo]*$/.test(t) && /\d/.test(t)) { cols.unshift(facNum(t)); continue; }
      if (FAC_UNID[tn] && cols.length) { unidad = unidad || FAC_UNID[tn]; continue; }
      break;
    }
    const desc = tk.slice(0, i + 1).join(" ").replace(/^[\d.\-\s]+(?=[a-záéíóúñ])/i, "").trim();
    const nums = cols.filter(n => !isNaN(n));
    if (!nums.length || (desc.match(/[a-záéíóúñ]/gi) || []).length < 3) continue;
    const importe = nums[nums.length - 1];
    if (!(importe > 0)) continue;
    let cantidad = "", precio = "";
    if (nums.length >= 3) {
      // Busca los dos números cuyo producto da el importe (puede haber descuento o IVA en medio)
      outer: for (let a = 0; a < nums.length - 1; a++) for (let b = a + 1; b < nums.length - 1; b++) {
        if (Math.abs(nums[a] * nums[b] - importe) <= Math.max(0.05, importe * 0.12)) { cantidad = nums[a]; precio = nums[b]; break outer; }
      }
      if (cantidad === "") { cantidad = nums[0]; precio = nums[nums.length - 2]; }
    } else if (nums.length === 2) { cantidad = nums[0]; precio = nums[0] ? Math.round(importe / nums[0] * 10000) / 10000 : ""; }
    const u = unidad || (desc.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|l|lt|litros)\b/i) ? FAC_UNID[facNorm(desc.match(/\b\d+(?:[.,]\d+)?\s*(kg|l|lt|litros)\b/i)[1])] : "");
    o.lineas.push({desc, cantidad, precio, importe, unidad: u === "t" ? "kg" : u, cantKg: u === "t" && cantidad !== "" ? cantidad * 1000 : null});
  }
  for (const L of o.lineas) if (L.cantKg != null) { L.cantidad = L.cantKg; delete L.cantKg; }
  // Si no hay total, la suma de líneas o el número más alto con céntimos
  if (o.total == null) { const s = o.lineas.reduce((a, L) => a + L.importe, 0); o.total = s || Math.max(0, ...(txt.match(/\d[\d.]*,\d{2}\b/g) || []).map(facNum).filter(n => !isNaN(n))) || null; }
  // Quita líneas que en realidad son la suma de otras
  if (o.lineas.length > 1) o.lineas = o.lineas.filter(L => !(o.total && Math.abs(L.importe - o.total) < 0.01 && o.lineas.length > 1 && /total|suma/i.test(L.desc)));
  return o;
}

/* ---- Ventana ---- */
function facDialogo(){
  FAC.archivo = null; FAC.res = null;
  const dlg = $("#dlg");
  dlg.innerHTML = `<form class="dlg" id="facFrm" novalidate>
    <header><h2>Escanear factura o albarán</h2><button type="button" class="x" data-act="close" aria-label="Cerrar">×</button></header>
    <div class="body" id="facBody">
      <div class="fld full"><p style="margin:0">Hazle una foto a la factura o al albarán, o elige el PDF que te ha mandado el proveedor. La app lee el proveedor, la fecha, los productos, las cantidades y el importe, y te lo enseña para que lo revises antes de guardarlo.</p>
      <p class="muted" style="margin:6px 0 0;font-size:.88rem">Consejos: ponla sobre la mesa, con buena luz, sin sombras y que salga entera y recta. Todo se lee en tu móvil, la foto no se manda a ningún sitio.</p></div>
      <div class="fld full"><div class="toolbar">
        <label class="btn primary" for="facCam" style="cursor:pointer">📷 Hacer foto</label><input type="file" id="facCam" accept="image/*" capture="environment" hidden>
        <label class="btn" for="facArch" style="cursor:pointer">🖼 Elegir foto o PDF</label><input type="file" id="facArch" accept="image/*,application/pdf,.pdf" hidden>
      </div></div>
      <div class="fld full" id="facEstado" aria-live="polite"></div>
    </div>
    <footer><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn primary" id="facOk" disabled>Guardar</button></footer></form>`;
  dlg.dataset.t = ""; dlg.dataset.id = "";
  dlg.showModal();
}
function facEstado(html){ const e = $("#facEstado"); if (e) e.innerHTML = html; }
async function facCargar(file){
  FAC.archivo = file; let txt = "";
  try {
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
      facEstado(`<p class="muted">Leyendo el PDF…</p>`);
      txt = await pacPdf(await file.arrayBuffer());
      if (!txt.trim()) return facEstado(`<p style="color:var(--warn)">Este PDF es una imagen escaneada y no trae texto. Haz una captura de pantalla de la factura y elígela como foto.</p>`);
      FAC.foto = null; FAC.pdf = file;
    } else {
      FAC.pdf = null; FAC.foto = await comprimir(file);
      facEstado(`<div class="muted" id="facProg">Preparando el lector…</div><progress id="facBar" max="1" value="0" style="width:100%"></progress>
        <p class="muted" style="font-size:.85rem;margin:4px 0 0">La primera vez se descarga el lector de texto (unos 6 MB). Después funciona sin cobertura.</p>`);
      const w = await facLector(m => {
        const p = $("#facProg"), b = $("#facBar"); if (!p) return;
        p.textContent = m.status === "recognizing text" ? "Leyendo la factura…" : /load|download|initializ/i.test(m.status) ? "Preparando el lector de texto…" : "Trabajando…";
        if (b && typeof m.progress === "number") b.value = m.progress;
      });
      const r = await w.recognize(await facPreparar(file));
      txt = r.data.text || "";
    }
  } catch(e) {
    console.warn(e);
    return facEstado(`<p style="color:var(--crit)">No se ha podido leer. ${navigator.onLine ? "Prueba con otra foto más nítida." : "La primera vez hace falta cobertura para descargar el lector."}</p>`);
  }
  FAC.texto = txt; FAC.res = facLeerTexto(txt);
  facPintar();
}
function facPintar(){
  const R = FAC.res, fis = typeof fiscal === "function" ? fiscal() : {regimen:"REAGP"};
  if (!R.lineas.length) R.lineas.push({desc: R.proveedor ? `${R.tipo} de ${R.proveedor}` : R.tipo, cantidad:"", precio:"", importe: R.total || ""});
  for (const L of R.lineas) if (L.modo == null) {
    const p = facProducto(L.desc), c = facCategoria(L.desc);
    L.prod = p?.id || ""; L.cat = c.cat; L.tipo = p?.tipo || c.tipo || "Otro"; L.on = true;
    L.modo = p ? "alm" : (c.tipo && !/Otro/.test(c.tipo) && L.cantidad !== "" ? "nuevo" : "gasto");
    if (!L.unidad) L.unidad = p?.unidad || "";
  }
  const suma = R.lineas.reduce((a, L) => a + Number(L.importe || 0), 0);
  const dup = R.numero && DB.compras.some(c => c.factura && facNorm(c.factura) === facNorm(R.numero) && (!R.proveedor || facNorm(c.proveedor) === facNorm(R.proveedor)));
  const prodOpts = sel => DB.productos.map(p => `<option value="${p.id}" ${sel === p.id ? "selected" : ""}>${esc(p.nombre)}</option>`).join("");
  const cats = S.economia.fields.find(f => f.k === "categoria").o;
  const UNI = S.productos.fields.find(f => f.k === "unidad").o;
  $("#facBody").innerHTML = `
    ${FAC.foto ? `<div class="fld full" style="height:200px;flex:none;overflow:auto;border:1px solid var(--line);border-radius:var(--r)"><img alt="Foto de la factura" src="${URL.createObjectURL(FAC.foto)}" style="width:100%;display:block;flex:none"></div>` : ""}
    ${dup ? `<p class="fld full" style="color:var(--warn);margin:0">Ojo: ya tienes apuntada una compra con el número ${esc(R.numero)}. Comprueba que no la estás metiendo dos veces.</p>` : ""}
    <div class="fld"><label for="fac_fecha">Fecha</label><input type="date" id="fac_fecha" value="${esc(R.fecha || today())}">${R.fecha ? "" : `<span class="help" style="color:var(--warn)">No he encontrado la fecha, revísala</span>`}</div>
    <div class="fld"><label for="fac_prov">Proveedor</label><input id="fac_prov" value="${esc(R.proveedor)}" list="facProvs"><datalist id="facProvs">${[...new Set(DB.compras.map(c => c.proveedor).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join("")}</datalist>${R.nif ? `<span class="help">NIF leído: ${esc(R.nif)}</span>` : ""}</div>
    <div class="fld"><label for="fac_num">Nº de ${R.tipo === "Albarán" ? "albarán" : "factura"}</label><input id="fac_num" value="${esc(R.numero)}"></div>
    <div class="fld"><label for="fac_total">Total de la factura (€)</label><input type="number" step="0.01" inputmode="decimal" id="fac_total" value="${R.total ?? ""}"><span class="help">Suma de las líneas: ${eur.format(suma)}${R.base ? ` · base leída ${eur.format(R.base)}` : ""}</span></div>
    <div class="fld full chk"><input type="checkbox" id="fac_iva" ${fis.regimen === "REAGP" && R.total && suma && R.total > suma + 0.01 ? "checked" : ""}><label for="fac_iva">Repartir el IVA entre las líneas para que el coste sea el total pagado (lo normal si estás en el régimen especial agrario y no recuperas el IVA)</label></div>
    <div class="fld full"><label>Qué hay en la factura</label>
      <div class="fac-lin">
      ${R.lineas.map((L, i) => `<div class="fac-item" data-i="${i}">
        <div class="fac-r1"><input type="checkbox" data-fl="on" ${L.on ? "checked" : ""} aria-label="Guardar esta línea"><input data-fl="desc" value="${esc(L.desc)}" aria-label="Concepto" placeholder="Concepto"></div>
        <div class="fac-r2"><select data-fl="modo" aria-label="Cómo guardarlo">
            <option value="alm" ${L.modo === "alm" ? "selected" : ""}>Compra de un producto que ya tengo</option>
            <option value="nuevo" ${L.modo === "nuevo" ? "selected" : ""}>Producto nuevo en el almacén</option>
            <option value="gasto" ${L.modo === "gasto" ? "selected" : ""}>Solo gasto (no va al almacén)</option></select>
          ${L.modo === "alm" ? `<select data-fl="prod" aria-label="Producto"><option value="">Elige el producto</option>${prodOpts(L.prod)}</select>` : ""}
          ${L.modo === "nuevo" ? `<select data-fl="tipo" aria-label="Tipo de producto">${TIPOS_PROD.map(t => `<option ${L.tipo === t ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}
          ${L.modo === "gasto" ? `<select data-fl="cat" aria-label="Categoría del gasto">${cats.map(c => `<option ${L.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select>` : ""}</div>
        <div class="fac-r3">${L.modo === "gasto" ? "" : `<label>Cantidad <input type="number" step="any" inputmode="decimal" data-fl="cantidad" value="${L.cantidad}"></label><label>Unidad <select data-fl="unidad">${UNI.map(u => `<option ${L.unidad === u ? "selected" : ""}>${u}</option>`).join("")}</select></label>`}
          <label>Importe (€) <input type="number" step="0.01" inputmode="decimal" data-fl="importe" value="${L.importe}"></label></div></div>`).join("")}
      </div>
      <div class="toolbar" style="margin-top:6px"><button type="button" class="btn" data-act="fac-add">+ Añadir línea</button><button type="button" class="btn" data-act="fac-otra">Escanear otra</button></div></div>
    <details class="fld full"><summary class="muted" style="cursor:pointer">Ver el texto que se ha leído</summary><pre style="white-space:pre-wrap;font-size:.8rem;max-height:200px;overflow:auto;background:var(--surface-2);padding:8px;border-radius:var(--r)">${esc(FAC.texto)}</pre></details>
    <p class="fld full muted" style="margin:0;font-size:.85rem">Revisa sobre todo las cantidades y los importes: la lectura automática puede confundir algún número. Las compras suben el stock del almacén y se apuntan como gasto en Economía. La foto queda guardada en cada apunte.</p>`;
  $("#facOk").disabled = false;
}
/* Copia lo que haya cambiado el usuario en la tabla antes de repintar o guardar */
function facRecoger(){
  if (!FAC.res) return;
  const R = FAC.res;
  R.fecha = $("#fac_fecha")?.value || R.fecha; R.proveedor = $("#fac_prov")?.value.trim() ?? R.proveedor; R.numero = $("#fac_num")?.value.trim() ?? R.numero;
  const t = $("#fac_total")?.value; R.total = t === "" || t == null ? null : Number(t); R.iva = !!$("#fac_iva")?.checked;
  for (const tr of document.querySelectorAll(".fac-lin .fac-item")) {
    const L = R.lineas[Number(tr.dataset.i)];
    for (const el of tr.querySelectorAll("[data-fl]")) { const k = el.dataset.fl; L[k] = el.type === "checkbox" ? el.checked : (el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value); }
  }
}
async function facGuardar(){
  facRecoger();
  const R = FAC.res; if (!R) return;
  const L = R.lineas.filter(x => x.on && Number(x.importe) > 0);
  if (!L.length) return toast("Marca al menos una línea con importe");
  if (L.some(x => x.modo === "alm" && !x.prod)) return toast("Elige el producto del almacén en cada línea de compra");
  if (L.some(x => x.modo !== "gasto" && !(Number(x.cantidad) > 0))) return toast("Pon la cantidad en cada compra del almacén");
  const fecha = R.fecha || today(), suma = L.reduce((a, x) => a + Number(x.importe), 0);
  const k = R.iva && R.total && suma && R.total > suma ? R.total / suma : 1;
  const ref = [R.proveedor, R.numero].filter(Boolean).join(" ");
  const adj = FAC.foto || FAC.pdf;
  const conFoto = async rec => { if (!adj) return; const id = uid(); await idbPut("files", id, {blob: adj, mime: adj.type || "application/pdf", kind: FAC.foto ? "image" : "pdf", created: now()}); rec._adj = [id]; };
  let nc = 0, ng = 0;
  for (const x of L) {
    const importe = Math.round(Number(x.importe) * k * 100) / 100;
    if (x.modo === "gasto") {
      const c = x.cat || "Otros";
      const mod = {Fitosanitarios:"Agrícola", Abonos:"Agrícola", "Semillas y plantas":"Agrícola", Piensos:"Ganadero", Veterinario:"Ganadero"}[c] || "General";
      const e = {id: uid(), fecha, tipo:"Gasto", modulo: mod, categoria: c, concepto: `${x.desc}${ref ? ` (${ref})` : ""}`, importe, notas: `Leído de ${R.tipo === "Albarán" ? "un albarán" : "una factura"} escaneado`, _u: now()};
      await conFoto(e); DB.economia.push(e); ng++;
      continue;
    }
    let pid = x.prod;
    if (x.modo === "nuevo") {
      const p = {id: uid(), nombre: x.desc, tipo: x.tipo || "Otro", unidad: x.unidad || "ud", stock_ini: 0, proveedor: R.proveedor, _u: now()};
      DB.productos.push(p); pid = p.id;
    }
    const c = {id: uid(), fecha, producto: pid, cantidad: Number(x.cantidad), importe, proveedor: R.proveedor, factura: R.numero, gasto: true, notas: `Leída de ${R.tipo === "Albarán" ? "un albarán" : "una factura"} escaneado`};
    await conFoto(c);
    for (const f of FORM_EXTRA) try { f.collect?.("compras", c); } catch(e) { console.warn(e); }
    c._u = now(); DB.compras.push(c); nc++;
  }
  await save(); $("#dlg").close();
  go(nc ? "alm" : "eco", nc ? "compras" : "economia");
  toast([nc && `${nc} compra${nc > 1 ? "s" : ""} apuntada${nc > 1 ? "s" : ""}`, ng && `${ng} gasto${ng > 1 ? "s" : ""} apuntado${ng > 1 ? "s" : ""}`].filter(Boolean).join(" y "));
}
document.addEventListener("change", e => {
  if (e.target.id === "facCam" || e.target.id === "facArch") { const f = e.target.files[0]; if (f) facCargar(f); e.target.value = ""; }
  if (e.target.matches?.('.fac-lin [data-fl="modo"]')) { facRecoger(); facPintar(); }
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "fac-abrir") facDialogo();
  else if (el.dataset.act === "fac-add") { facRecoger(); FAC.res.lineas.push({desc:"", cantidad:"", precio:"", importe:"", on:true, modo:"gasto", cat:"Otros", tipo:"Otro", unidad:""}); facPintar(); }
  else if (el.dataset.act === "fac-otra") facDialogo();
});
document.addEventListener("submit", e => { if (e.target.id === "facFrm") { e.preventDefault(); facGuardar(); } });

/* Botón en Almacén, en Economía y en el inicio */
{ const BTN = '<button class="btn" data-act="fac-abrir" title="Hazle una foto y se apunta sola">📷 Escanear factura</button>';
  const _vm = viewModulo; viewModulo = mod => { let h = _vm(mod);
    if (mod === "alm") h = h.replace(/<button class="btn primary" data-new="(compras|productos)">/, m => BTN + m);
    if (mod === "eco" && UI.tab.eco === "economia") h = h.replace('<button class="btn primary" data-new="economia">', BTN + '<button class="btn primary" data-new="economia">');
    return h; };
  const _vi = viewInicio; viewInicio = () => _vi().replace(/<button class="btn" data-new="partes">/, BTN.replace("📷 Escanear factura", "📷 Escanear factura o albarán") + '<button class="btn" data-new="partes">');
}
