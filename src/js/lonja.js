/* ============ Precios de lonja ============
   Las lonjas de Castilla-La Mancha (Albacete, Toledo, Talavera...) publican cada semana una hoja
   en PDF, sin un servicio de datos que la app pueda consultar sola. Por eso los precios se apuntan
   a mano o se leen de la hoja descargada (o del texto copiado), y se comparan con lo que te cuesta
   producir cada kilo y con la cosecha que te queda sin vender. */
const LONJAS = ["Albacete","Toledo","Talavera de la Reina","Ciudad Real","Cooperativa","Otra"];
const LONJA_UNID = ["€/t","€/kg","€/100 kg","€/l","€/hgdo","€/cabeza"];
S.cotizaciones = {title: "Precios apuntados", one: "precio", label: r => `${r.producto} ${fdate(r.fecha)}`, fields: [
  {k:"fecha", l:"Fecha de la sesión", t:"date", req:1, def:today},
  {k:"lonja", l:"Lonja", t:"sel", o:LONJAS, def:"Albacete"},
  {k:"producto", l:"Producto tal como sale en la lonja", req:1, help:"Por ejemplo: Cebada pienso >62 kg/hl"},
  {k:"cultivo", l:"Tu cultivo", help:"Escríbelo igual que en Cultivos (por ejemplo Cebada) para compararlo con tus costes"},
  {k:"precio", l:"Precio", t:"num", req:1, step:"0.01"},
  {k:"unidad", l:"Unidad", t:"sel", o:LONJA_UNID, def:"€/t"},
  {k:"notas", l:"Notas", t:"area"}],
  cols: ["fecha","lonja","producto","cultivo",{l:"Precio", f:r=>`${fnum(r.precio)} ${r.unidad||""}`, num:1}]};
MODS.ventas.tables = [...MODS.ventas.tables.filter(t => t !== "mercado"), "mercado"];

const lonjaKg = r => { const p = Number(r.precio); if (!isFinite(p)) return null; return {"€/t":p / 1000, "€/kg":p, "€/100 kg":p / 100}[r.unidad || "€/t"] ?? null; };
function lonjaCultivos(){ return [...new Set(DB.cultivos.map(c => c.cultivo).filter(Boolean))]; }
/* Adivina tu cultivo a partir del nombre del producto de la lonja */
function lonjaAdivina(prod){
  const m = DB._meta.lonjaMap || {}, n = facNorm(prod);
  if (m[n] != null) return m[n];
  const C = lonjaCultivos().sort((a, b) => b.length - a.length);
  return C.find(c => n.includes(facNorm(c))) || C.find(c => facNorm(c).split(/\s+/)[0].length > 3 && n.split(/[^a-z]+/).includes(facNorm(c).split(/\s+/)[0])) || "";
}
/* Coste por kg de un cultivo: el del año actual o, si aún no hay cosecha, el del último año con cosecha */
function lonjaCoste(cult){
  const A = (typeof campanaAnos === "function" ? campanaAnos() : [String(new Date().getFullYear())]).slice().reverse();
  for (const y of A) {
    const R = campanaParcelas(y).filter(r => facNorm(r.cultivo) === facNorm(cult));
    const kg = R.reduce((s, r) => s + r.kg, 0), gas = R.reduce((s, r) => s + r.gas, 0);
    if (kg > 0) return {y, kg: gas / kg};
  }
  return null;
}
/* Cosecha sin precio de venta (todavía en el almacén o pendiente de liquidar), del año actual y el anterior */
function lonjaSinVender(cult){
  const y = new Date().getFullYear();
  return DB.cosechas.filter(r => facNorm(r.cultivo) === facNorm(cult) && !Number(r.precio) && Number((r.fecha || "").slice(0, 4)) >= y - 1).reduce((s, r) => s + Number(r.cantidad || 0), 0);
}
function lonjaSpark(P){
  if (P.length < 2) return "";
  const W = 220, H = 46, v = P.map(p => p.v), mx = Math.max(...v), mn = Math.min(...v), r = mx - mn || 1;
  const pts = P.map((p, i) => `${(4 + i * (W - 8) / (P.length - 1)).toFixed(1)},${(4 + (H - 8) * (mx - p.v) / r).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución del precio" style="max-width:100%"><polyline points="${pts.join(" ")}" fill="none" stroke="var(--ventas)" stroke-width="2"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--ventas)"/></svg>`;
}
function lonjaTarjeta(cult){
  const R = DB.cotizaciones.filter(r => facNorm(r.cultivo) === facNorm(cult) && r.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!R.length) return "";
  // La serie principal es el producto y la lonja del último precio apuntado
  const u = R[R.length - 1], serie = R.filter(r => facNorm(r.producto) === facNorm(u.producto) && r.lonja === u.lonja && r.unidad === u.unidad);
  const pr = serie.length > 1 ? serie[serie.length - 2] : null;
  const ano = serie.filter(r => r.fecha >= addDays(u.fecha, -365)), vals = ano.map(r => Number(r.precio));
  const media = vals.reduce((a, b) => a + b, 0) / vals.length, mx = Math.max(...vals), mn = Math.min(...vals);
  const pos = vals.length > 2 ? Math.round(vals.filter(v => v < Number(u.precio)).length / (vals.length - 1) * 100) : null;
  const kg = lonjaKg(u), coste = lonjaCoste(cult), sin = lonjaSinVender(cult);
  const dif = pr ? Number(u.precio) - Number(pr.precio) : null;
  const frases = [];
  if (kg != null && coste) frases.push(kg >= coste.kg
    ? `A este precio ganas unos <strong>${eur.format(kg - coste.kg)} por kilo</strong> (tu coste en ${coste.y} fue de ${eur.format(coste.kg)}/kg).`
    : `Este precio <strong>no cubre tu coste</strong> de ${eur.format(coste.kg)}/kg de ${coste.y}: perderías ${eur.format(coste.kg - kg)} por kilo.`);
  else if (kg != null) frases.push(`Cuando apuntes la cosecha y los gastos de ${esc(cult)} verás aquí si este precio cubre tu coste.`);
  if (vals.length > 2) frases.push(`Está un ${fnum(Math.round(Math.abs(Number(u.precio) - media) / media * 100))} % ${Number(u.precio) >= media ? "por encima" : "por debajo"} de la media de los últimos 12 meses (${fnum(media)} ${esc(u.unidad)}).`);
  if (sin && kg != null) frases.push(`Tienes ${fnum(Math.round(sin))} kg cosechados sin precio de venta: a este precio valdrían ${eur.format(sin * kg)}.`);
  return `<section class="panel" style="--mc:var(--ventas)"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
      <div><div class="eyebrow">${esc(cult)}</div><h3 style="margin-top:2px">${esc(u.producto)}</h3><div class="muted" style="font-size:.85rem">Lonja de ${esc(u.lonja || "—")} · ${fdate(u.fecha)}</div></div>
      <div style="text-align:right"><div style="font:700 1.6rem var(--f-display)">${fnum(u.precio)} <span style="font-size:.9rem;font-weight:500">${esc(u.unidad)}</span></div>
      ${dif != null ? `<div style="font-size:.85rem;color:var(--${dif > 0 ? "ok" : dif < 0 ? "crit" : "muted"})">${dif > 0 ? "▲" : dif < 0 ? "▼" : "="} ${fnum(Math.abs(dif))} desde el ${fdate(pr.fecha)}</div>` : ""}</div></div>
    ${lonjaSpark(serie.slice(-26).map(r => ({v: Number(r.precio)})))}
    ${vals.length > 1 ? `<div class="muted" style="font-size:.85rem">Último año: mínimo ${fnum(mn)}, máximo ${fnum(mx)}${pos != null ? ` · más alto que el ${pos} % de las sesiones apuntadas` : ""}</div>` : ""}
    ${frases.length ? `<ul style="margin:8px 0 0;padding-left:18px">${frases.map(f => `<li>${f}</li>`).join("")}</ul>` : ""}
  </section>`;
}
TABS.mercado = {title: "Precios de lonja", render(){
  const conPrecio = [...new Set(DB.cotizaciones.map(r => r.cultivo).filter(Boolean).map(c => lonjaCultivos().find(x => facNorm(x) === facNorm(c)) || c))];
  const sinPrecio = lonjaCultivos().filter(c => !conPrecio.some(x => facNorm(x) === facNorm(c)));
  const rows = DB.cotizaciones.slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).slice(0, 40);
  return `<div class="toolbar">
      <button class="btn primary" data-new="cotizaciones">+ Apuntar un precio</button>
      <button class="btn" data-act="lonja-abrir">📄 Leer la hoja de la lonja</button>
      <button class="btn" data-act="csv" data-t="cotizaciones">Exportar CSV</button></div>
    <section class="panel"><h3>Dónde ver los precios de cada semana</h3>
      <p style="margin:4px 0">Las lonjas publican una hoja en PDF cada semana. Descárgala y pulsa «Leer la hoja de la lonja», o copia el texto y pégalo. La app saca los precios y los guarda para ver cómo evolucionan.</p>
      <ul style="margin:4px 0 0;padding-left:18px">
        <li><a href="https://www.asajaclm.org/comunicacion/lonjas/" target="_blank" rel="noopener">Lonjas de Albacete, Toledo y Talavera</a> (las publica ASAJA Castilla-La Mancha cada semana)</li>
        <li><a href="https://www.mapa.gob.es/es/estadistica/temas/estadisticas-agrarias/economia/precios-coyunturales-prod-agricolas" target="_blank" rel="noopener">Precios semanales del Ministerio de Agricultura</a> (medias nacionales y de mercados representativos)</li>
      </ul></section>
    ${conPrecio.length ? `<div class="grid2">${conPrecio.map(lonjaTarjeta).join("")}</div>` : `<div class="empty">Aún no has apuntado precios. Apunta el de tu cultivo o lee la hoja de la lonja para empezar a ver cómo va.</div>`}
    ${sinPrecio.length && conPrecio.length ? `<p class="muted" style="margin:0">Sin precios apuntados: ${sinPrecio.map(esc).join(", ")}.</p>` : ""}
    ${rows.length ? `<section class="panel"><h3>Últimos precios apuntados</h3><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Lonja</th><th>Producto</th><th>Tu cultivo</th><th class="num">Precio</th></tr></thead><tbody>
      ${rows.map(r => `<tr data-edit="cotizaciones" data-id="${r.id}" tabindex="0"><td>${fdate(r.fecha)}</td><td>${esc(r.lonja)}</td><td>${esc(r.producto)}</td><td>${esc(r.cultivo)}</td><td class="num">${fnum(r.precio)} ${esc(r.unidad)}</td></tr>`).join("")}
      </tbody></table></div><p class="muted" style="font-size:.85rem;margin:6px 0 0">Toca una fila para corregirla o borrarla.</p></section>` : ""}`;
}};

/* ---- Leer la hoja de la lonja ---- */
function lonjaLeer(txt){
  const n = facNorm(txt);
  const lonja = /albacete/.test(n) ? "Albacete" : /talavera/.test(n) ? "Talavera de la Reina" : /toledo/.test(n) ? "Toledo" : /ciudad real/.test(n) ? "Ciudad Real" : "";
  const fr = txt.match(/(cotizaci[oó]n(es)?|sesi[oó]n|d[ií]a|fecha)[^\n]{0,40}/i);
  const fecha = (fr && facFecha(fr[0])) || facFecha(txt) || today();
  const precio = t => /^\d{1,5}[.,]\d{2,3}$/.test(t);
  const out = []; let seccion = "", grupo = "";
  for (const linea of txt.split(/\r?\n/)) {
    const tk = linea.trim().split(/\s+/).filter(Boolean); if (!tk.length) continue;
    if (!tk.some(t => precio(t) || /^(s\/c|s\.o\.?)$/i.test(t))) {
      const l = linea.trim();
      if (/[a-záéíóúñ]/i.test(l) && l.length < 50) { if (l === l.toUpperCase() && !/\d/.test(l)) { seccion = l; grupo = ""; } else if (!/\d{2}/.test(l)) grupo = l; }
      continue;
    }
    let lab = [];
    for (let i = 0; i < tk.length; i++) {
      const t = tk[i];
      if (precio(t) || /^(s\/c|s\.o\.?)$/i.test(t)) {
        let mn = precio(t) ? facNum(t) : null, mx = mn;
        if (mn != null && tk[i + 1] === "-" && precio(tk[i + 2] || "")) { mx = facNum(tk[i + 2]); i += 2; }
        else if (mn != null && /^-\d/.test(tk[i + 1] || "") && precio(tk[i + 1].slice(1))) { mx = facNum(tk[i + 1].slice(1)); i += 1; }
        // Detrás del precio suele venir la diferencia con la semana anterior: se salta
        if (/^[+\-]?\d{1,4}[.,]\d{2}$|^=$/.test(tk[i + 1] || "")) i += 1;
        let label = lab.join(" ").replace(/^[\-–:·.]+|[\-–:·.]+$/g, "").trim();
        lab = [];
        if (!/[a-záéíóúñ]/i.test(label)) label = grupo;
        else if (grupo && label.split(/\s+/).length <= 3 && !facNorm(label).includes(facNorm(grupo).split(/\s+/)[0])) label = `${grupo} ${label}`;
        if (!label || mn == null) continue;
        const sec = facNorm(seccion + " " + label);
        const unidad = /cereal|legum|oleag|forraj|paja|alfalfa|trigo|cebada|avena|centeno|triticale|maiz|girasol|guisante|veza|yero|lenteja|garbanzo/.test(sec) && mn > 40 ? "€/t"
          : /hgdo|grado/.test(sec) ? "€/hgdo" : mn > 60 ? "€/t" : "€/kg";
        out.push({producto: label.slice(0, 80), min: mn, max: mx, precio: Math.round((mn + mx) / 2 * 1000) / 1000, unidad});
      } else lab.push(t);
    }
  }
  const m = DB._meta.lonjaMap || {}, visto = new Set();
  for (const r of out) { r.cultivo = lonjaAdivina(r.producto); const k = facNorm(r.producto); r.on = !!r.cultivo && (m[k] != null || !visto.has(facNorm(r.cultivo))); if (r.cultivo) visto.add(facNorm(r.cultivo)); }
  return {lonja, fecha, filas: out};
}
const LJ = {};
function lonjaDialogo(){
  LJ.res = null;
  const dlg = $("#dlg");
  dlg.innerHTML = `<form class="dlg" id="lonjaFrm" novalidate>
    <header><h2>Leer la hoja de la lonja</h2><button type="button" class="x" data-act="close" aria-label="Cerrar">×</button></header>
    <div class="body" id="lonjaBody">
      <p class="fld full" style="margin:0">Elige el PDF de la hoja semanal de la lonja, o abre la hoja, selecciona los precios, cópialos y pégalos aquí.</p>
      <div style="grid-column:1/-1"><label class="btn" for="lonjaPdf" style="cursor:pointer;justify-self:start">📄 Elegir el PDF de la lonja</label><input type="file" id="lonjaPdf" accept="application/pdf,.pdf,text/plain" hidden></div>
      <div class="fld full"><label for="lonjaTxt">O pega aquí el texto</label><textarea id="lonjaTxt" rows="5" placeholder="Cebada pienso >62 kg/hl  196,00  0,00&#10;Trigo panificable  224,00  +2,00"></textarea>
        <div class="toolbar" style="margin-top:6px"><button type="button" class="btn" data-act="lonja-pegar">Leer el texto pegado</button></div></div>
      <div class="fld full" id="lonjaRes"></div>
    </div>
    <footer><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn primary" id="lonjaOk" disabled>Guardar los marcados</button></footer></form>`;
  dlg.dataset.t = ""; dlg.dataset.id = "";
  dlg.showModal();
}
function lonjaPintar(){
  const R = LJ.res, box = $("#lonjaRes");
  if (!R.filas.length) { box.innerHTML = `<p style="color:var(--warn);margin:0">No he encontrado precios en este texto. Si el PDF no deja leerse, ábrelo, copia la tabla y pégala arriba.</p>`; $("#lonjaOk").disabled = true; return; }
  const C = lonjaCultivos();
  box.innerHTML = `<div class="grid2" style="gap:10px"><div class="fld"><label for="lj_fecha">Fecha de la sesión</label><input type="date" id="lj_fecha" value="${R.fecha}"></div>
    <div class="fld"><label for="lj_lonja">Lonja</label><select id="lj_lonja">${LONJAS.map(l => `<option ${l === R.lonja ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
    <p class="muted" style="font-size:.88rem;margin:8px 0">He encontrado ${R.filas.length} precios. Marca los que te interesan y di a qué cultivo tuyo corresponden. La próxima vez se acordará.</p>
    <datalist id="ljCult">${C.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="table-wrap"><table class="lj-lin"><thead><tr><th></th><th>Producto</th><th>Tu cultivo</th><th class="num">Precio</th><th>Unidad</th></tr></thead><tbody>
    ${R.filas.map((r, i) => `<tr data-i="${i}" style="cursor:default"><td><input type="checkbox" data-lj="on" ${r.on ? "checked" : ""} aria-label="Guardar"></td>
      <td style="min-width:180px"><input data-lj="producto" value="${esc(r.producto)}" aria-label="Producto"></td>
      <td style="min-width:120px"><input data-lj="cultivo" list="ljCult" value="${esc(r.cultivo)}" aria-label="Tu cultivo"></td>
      <td class="num"><input type="number" step="0.001" data-lj="precio" value="${r.precio}" style="width:90px" aria-label="Precio">${r.min !== r.max ? `<br><span class="muted" style="font-size:.78rem">${fnum(r.min)} – ${fnum(r.max)}</span>` : ""}</td>
      <td><select data-lj="unidad" aria-label="Unidad" style="width:auto">${LONJA_UNID.map(u => `<option ${u === r.unidad ? "selected" : ""}>${u}</option>`).join("")}</select></td></tr>`).join("")}
    </tbody></table></div>`;
  $("#lonjaOk").disabled = false;
}
async function lonjaGuardar(){
  const R = LJ.res; if (!R) return;
  for (const tr of document.querySelectorAll(".lj-lin tbody tr")) { const r = R.filas[Number(tr.dataset.i)]; for (const el of tr.querySelectorAll("[data-lj]")) r[el.dataset.lj] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value.trim(); }
  const fecha = $("#lj_fecha").value || today(), lonja = $("#lj_lonja").value;
  const F = R.filas.filter(r => r.on && r.producto && r.precio > 0);
  if (!F.length) return toast("Marca al menos un precio");
  DB._meta.lonjaMap = DB._meta.lonjaMap || {};
  let n = 0, rep = 0;
  for (const r of F) {
    DB._meta.lonjaMap[facNorm(r.producto)] = r.cultivo || "";
    const ex = DB.cotizaciones.find(x => x.fecha === fecha && x.lonja === lonja && facNorm(x.producto) === facNorm(r.producto));
    const rec = {...(ex || {id: uid()}), fecha, lonja, producto: r.producto, cultivo: r.cultivo, precio: r.precio, unidad: r.unidad, notas: r.min !== r.max ? `Horquilla ${fnum(r.min)} – ${fnum(r.max)}` : (ex?.notas || ""), _u: now()};
    if (ex) { DB.cotizaciones = DB.cotizaciones.map(x => x.id === ex.id ? rec : x); rep++; } else { DB.cotizaciones.push(rec); n++; }
  }
  DB._meta.lonjaMap_u = now();
  await save(); $("#dlg").close(); go("ventas", "mercado");
  toast(`${n} precio${n === 1 ? "" : "s"} guardado${n === 1 ? "" : "s"}${rep ? ` y ${rep} actualizado${rep === 1 ? "" : "s"}` : ""}`);
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "lonja-abrir") lonjaDialogo();
  else if (el.dataset.act === "lonja-pegar") { const t = $("#lonjaTxt").value; if (!t.trim()) return toast("Pega primero el texto de la hoja"); LJ.res = lonjaLeer(t); lonjaPintar(); }
});
document.addEventListener("change", async e => {
  if (e.target.id !== "lonjaPdf") return;
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  $("#lonjaRes").innerHTML = `<p class="muted">Leyendo la hoja…</p>`;
  try { const buf = await f.arrayBuffer(); const txt = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? await pacPdf(buf) : new TextDecoder().decode(buf); LJ.res = lonjaLeer(txt); lonjaPintar(); }
  catch(err) { console.warn(err); $("#lonjaRes").innerHTML = `<p style="color:var(--warn)">No he podido leer este PDF. Ábrelo, copia los precios y pégalos arriba.</p>`; }
});
document.addEventListener("submit", e => { if (e.target.id === "lonjaFrm") { e.preventDefault(); lonjaGuardar(); } });

/* Aviso en el inicio cuando el precio de un cultivo con cosecha sin vender supera tu coste y la media */
ALERTS.push(() => {
  const A = [];
  for (const c of lonjaCultivos()) {
    const R = DB.cotizaciones.filter(r => facNorm(r.cultivo) === facNorm(c) && r.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const u = R[R.length - 1]; if (!u || daysBetween(u.fecha, today()) > 14) continue;
    const kg = lonjaKg(u), sin = lonjaSinVender(c); if (kg == null || !sin) continue;
    const co = lonjaCoste(c); const ano = R.filter(r => r.unidad === u.unidad && r.fecha >= addDays(u.fecha, -365)).map(r => Number(r.precio));
    const media = ano.reduce((a, b) => a + b, 0) / ano.length;
    if (co && kg > co.kg && ano.length > 2 && Number(u.precio) > media) A.push({lv:"", t:`${c}: buen precio en la lonja`, s:`${fnum(u.precio)} ${u.unidad}, por encima de tu coste y de la media del año. Tienes ${fnum(Math.round(sin))} kg sin vender.`, d:"", mod:"ventas", tab:"mercado"});
  }
  return A;
});

SEEDS.push((d, add, D) => {
  const base = [196, 198, 201, 199, 204, 207, 205, 210];
  base.forEach((p, i) => add("cotizaciones", {fecha: D(-4 - 7 * (base.length - 1 - i)), lonja:"Albacete", producto:"Cebada pienso >62 kg/hl", cultivo:"Cebada", precio:p, unidad:"€/t"}));
  [224, 226, 225, 229].forEach((p, i) => add("cotizaciones", {fecha: D(-4 - 7 * (3 - i)), lonja:"Albacete", producto:"Trigo panificable", cultivo:"Trigo", precio:p, unidad:"€/t"}));
});
