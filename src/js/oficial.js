/* ============ Exportaciones oficiales: cuaderno digital (SIEX), libro REGA y censos ============ */
MODS.informes.tables = ["pdf","oficial"]; MODS.informes.desc = "Libros oficiales y exportaciones";
UI.censoF = UI.censoF || `${new Date().getFullYear()}-01-01`;
const csvCell = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const csvNum = v => v === "" || v == null ? "" : String(v).replace(".", ",");
function bajarCSV(nombre, cab, filas){ download(nombre, "﻿" + [cab, ...filas].map(f=>f.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8"); }
const sig = id => { const p = DB.parcelas.find(x=>x.id===id) || {}; return {prov:p.provincia||"", mun:p.municipio||"", pol:p.poligono??"", par:p.parcela??"", rec:p.recinto??"", sup:p.superficie??"", uso:(p.uso||"").split(" · ")[0], nombre:p.nombre||""}; };
const cultivoDe = (pid, y) => DB.cultivos.find(c=>c.parcela===pid && String(c.campana)===String(y));
const carneDe = nombre => { const w = DB.trabajadores?.find(x=>nombre && (nombre.includes(x.nombre) || x.nombre.includes(nombre))); return w ? `${w.carne||""}` : ""; };

const EXPORTS = {
  siex_parcelas: {g:"siex", t:"Parcelas y cultivos", run(y){ bajarCSV(`siex-parcelas-${y}.csv`,
    ["Campaña","Provincia","Municipio","Agregado","Zona","Polígono","Parcela","Recinto","Superficie SIGPAC (ha)","Uso SIGPAC","Cultivo","Variedad","Fecha siembra o plantación","Superficie cultivada (ha)","Sistema de explotación","Nombre o paraje"],
    DB.parcelas.map(p => { const s = sig(p.id), c = cultivoDe(p.id, y); return [y, s.prov, s.mun, 0, 0, s.pol, s.par, s.rec, csvNum(s.sup), s.uso, c?.cultivo||"", c?.variedad||"", fdate(c?.siembra), csvNum(c?.superficie??""), p.riego||"", s.nombre]; })); }},
  siex_fito: {g:"siex", t:"Tratamientos fitosanitarios", run(y){ bajarCSV(`siex-tratamientos-${y}.csv`,
    ["Fecha","Provincia","Municipio","Polígono","Parcela","Recinto","Cultivo","Superficie tratada (ha)","Problema fitosanitario","Producto comercial","Nº registro","Materia activa","Dosis","Unidad de dosis","Plazo de seguridad (días)","Aplicador","Carné del aplicador","Equipo (ROMA)","Eficacia","Observaciones"],
    DB.fitosanitarios.filter(r=>(r.fecha||"").startsWith(y)).map(r => { const s = sig(r.parcela); return [fdate(r.fecha), s.prov, s.mun, s.pol, s.par, s.rec, r.cultivo||"", csvNum(r.sup_tratada), r.problema||"", r.producto||"", r.registro||"", r.materia||"", csvNum(r.dosis), r.unidad||"", r.plazo??"", r.aplicador||"", carneDe(r.aplicador), r.equipo||"", r.eficacia||"", r.notas||""]; })); }},
  siex_fert: {g:"siex", t:"Fertilización", run(y){ bajarCSV(`siex-fertilizacion-${y}.csv`,
    ["Fecha","Provincia","Municipio","Polígono","Parcela","Recinto","Tipo de fertilizante","Producto","Riqueza N-P-K","Cantidad (kg/ha)","Superficie (ha)","N aplicado (kg/ha)","P2O5 aplicado (kg/ha)","K2O aplicado (kg/ha)"],
    DB.abonados.filter(r=>(r.fecha||"").startsWith(y)).map(r => { const s = sig(r.parcela), n = String(r.riqueza||"").split(/[-\/ ]+/).map(Number); const u = i => n[i] && r.cantidad ? csvNum(Math.round(n[i]*r.cantidad)/100) : "";
      return [fdate(r.fecha), s.prov, s.mun, s.pol, s.par, s.rec, r.tipo||"", r.producto||"", r.riqueza||"", csvNum(r.cantidad), csvNum(r.superficie), u(0), u(1), u(2)]; })); }},
  siex_cosecha: {g:"siex", t:"Cosechas comercializadas", run(y){ bajarCSV(`siex-cosechas-${y}.csv`,
    ["Fecha","Provincia","Municipio","Polígono","Parcela","Recinto","Cultivo","Cantidad (kg)","Comprador o destino","NIF comprador","Albarán o lote"],
    DB.cosechas.filter(r=>(r.fecha||"").startsWith(y)).map(r => { const s = sig(r.parcela), v = (DB.ventas||[]).find(v=>(v.lineas||[]).some(l=>l.lote&&l.lote===r.albaran)), c = v && DB.clientes.find(x=>x.id===v.cliente);
      return [fdate(r.fecha), s.prov, s.mun, s.pol, s.par, s.rec, r.cultivo||"", csvNum(r.cantidad), c?.nombre || r.comprador || "", c?.nif||"", r.albaran||""]; })); }},
  siex_json: {g:"siex", t:"Cuaderno completo (JSON)", run(y){ const T = DB._meta.titular||{};
    const j = {formato:"Mi Explotación · cuaderno digital", version:1, campana:Number(y), titular:{nombre:T.nombre, nif:T.nif, ccaa:T.ccaa}, generado:new Date().toISOString(),
      parcelas: DB.parcelas.map(p=>({...sig(p.id), id:p.id, sistema:p.riego, cultivo:cultivoDe(p.id,y)?.cultivo||null, variedad:cultivoDe(p.id,y)?.variedad||null, contorno:p.geo||null})),
      tratamientos: DB.fitosanitarios.filter(r=>(r.fecha||"").startsWith(y)).map(r=>({fecha:r.fecha, recinto:sig(r.parcela), cultivo:r.cultivo, problema:r.problema, producto:r.producto, registro:r.registro, materia_activa:r.materia, dosis:r.dosis, unidad:r.unidad, superficie_ha:r.sup_tratada, plazo_seguridad:r.plazo, aplicador:r.aplicador, equipo_roma:r.equipo, eficacia:r.eficacia})),
      fertilizacion: DB.abonados.filter(r=>(r.fecha||"").startsWith(y)).map(r=>({fecha:r.fecha, recinto:sig(r.parcela), tipo:r.tipo, producto:r.producto, riqueza:r.riqueza, kg_ha:r.cantidad, superficie_ha:r.superficie})),
      labores: DB.labores.filter(r=>(r.fecha||"").startsWith(y)).map(r=>({fecha:r.fecha, recinto:sig(r.parcela), labor:r.tipo, descripcion:r.descripcion})),
      cosechas: DB.cosechas.filter(r=>(r.fecha||"").startsWith(y)).map(r=>({fecha:r.fecha, recinto:sig(r.parcela), cultivo:r.cultivo, kg:r.cantidad, destino:r.comprador, lote:r.albaran}))};
    download(`cuaderno-digital-${y}.json`, JSON.stringify(j, null, 1), "application/json"); }},
  rega_libro: {g:"rega", t:"Libro de registro (altas y bajas)", run(){ bajarCSV(`rega-libro-registro.csv`,
    ["Código REGA","Identificación","Especie","Raza","Sexo","Fecha nacimiento","Identificación madre","Fecha de alta","Causa de alta","Fecha de baja","Causa de baja","Lote"],
    DB.animales.map(a=>[DB._meta.titular?.rega_gan||"", a.crotal, a.especie||"", a.raza||"", a.sexo||"", fdate(a.nacimiento), a.madre||"", fdate(a.alta), a.origen||"", fdate(a.baja), a.motivo_baja||"", a.lote||""])); }},
  rega_mov: {g:"rega", t:"Movimientos (entradas y salidas)", run(){ bajarCSV(`rega-movimientos.csv`,
    ["Código REGA","Fecha","Tipo","Motivo","Especie","Nº animales","Identificaciones","Origen o destino","REGA origen o destino","Documento de traslado"],
    DB.movimientos.map(m=>[DB._meta.titular?.rega_gan||"", fdate(m.fecha), m.tipo||"", m.motivo||"", m.especie||"", m.num??"", m.identificacion||"", m.origen_destino||"", m.rega||"", m.documento||""])); }},
  rega_med: {g:"rega", t:"Tratamientos veterinarios", run(){ bajarCSV(`rega-medicamentos.csv`,
    ["Código REGA","Fecha","Animal o lote","Especie","Diagnóstico","Medicamento","Nº receta","Lote medicamento","Dosis","Vía","Duración (días)","Espera carne (días)","Espera leche (días)","Veterinario"],
    DB.veterinarios.map(r=>[DB._meta.titular?.rega_gan||"", fdate(r.fecha), r.animal||"", r.especie||"", r.diagnostico||"", r.medicamento||"", r.receta||"", r.lote_med||"", r.dosis||"", r.via||"", r.duracion??"", r.sup_carne??"", r.sup_leche??"", r.veterinario||""])); }},
  rega_censo: {g:"rega", t:"Declaración de censo", run(){ const f = UI.censoF, C = censoA(f); bajarCSV(`rega-censo-${f}.csv`,
    ["Código REGA","Fecha de referencia","Especie","Categoría","Nº animales"], C.map(c=>[DB._meta.titular?.rega_gan||"", fdate(f), c.especie, c.cat, c.n])); }},
  api_censo: {g:"api", t:"Declaración de censo apícola", run(){ bajarCSV(`censo-apicola-${new Date().getFullYear()}.csv`,
    ["Código REGA explotación","Código de asentamiento","Nombre","Municipio","Polígono","Parcela","Coordenadas","Colmenas activas","Modelos","Colmenas débiles o huérfanas"],
    DB.apiarios.map(a=>{ const cs = DB.colmenas.filter(c=>c.apiario===a.id && c.estado!=="Muerta" && c.estado!=="Vendida"); return [DB._meta.titular?.rega_api||"", a.codigo||"", a.nombre, a.municipio||"", a.poligono??"", a.parcela??"", a.coordenadas||"", cs.length, [...new Set(cs.map(c=>c.modelo).filter(Boolean))].join(", "), cs.filter(c=>c.estado!=="Activa").length]; })); }},
  api_mov: {g:"api", t:"Movimientos de colmenas", run(){ bajarCSV(`movimientos-colmenas.csv`,
    ["Código REGA","Fecha","Asentamiento de origen","Código origen","Asentamiento de destino","Código destino","Nº colmenas","Documento"],
    DB.trashumancia.map(t=>{ const o = DB.apiarios.find(a=>a.id===t.origen)||{}, d = DB.apiarios.find(a=>a.id===t.destino)||{}; return [DB._meta.titular?.rega_api||"", fdate(t.fecha), o.nombre||"", o.codigo||"", d.nombre||"", d.codigo||"", t.colmenas??"", t.documento||""]; })); }},
  api_trat: {g:"api", t:"Tratamientos apícolas", run(){ bajarCSV(`tratamientos-apicolas.csv`,
    ["Código REGA","Fecha","Asentamiento","Código","Nº colmenas","Enfermedad","Medicamento","Nº registro","Lote","Dosis","Fecha de retirada","Receta o veterinario"],
    DB.apitratamientos.map(r=>{ const a = DB.apiarios.find(x=>x.id===r.apiario)||{}; return [DB._meta.titular?.rega_api||"", fdate(r.fecha), a.nombre||"", a.codigo||"", r.colmenas??"", r.enfermedad||"", r.producto||"", r.registro||"", r.lote||"", r.dosis||"", fdate(r.retirada), r.receta||""]; })); }},
};
/* Censo a una fecha: animales dados de alta y sin baja en ese día, por especie y categoría */
function censoA(f){
  const A = DB.animales.filter(a => (!a.alta || a.alta <= f) && (!a.baja || a.baja > f) && (!a.nacimiento || a.nacimiento <= f));
  const meses = a => a.nacimiento ? daysBetween(a.nacimiento, f)/30.44 : 99;
  const cat = a => { const m = meses(a);
    if (["Ovino","Caprino"].includes(a.especie)) return a.sexo === "Hembra" ? (m >= 12 ? "Hembras reproductoras (12 meses o más)" : "Reposición y corderos/cabritos (menos de 12 meses)") : (m >= 12 ? "Machos reproductores" : "Reposición y corderos/cabritos (menos de 12 meses)");
    if (a.especie === "Vacuno") return m < 12 ? "Menores de 12 meses" : m < 24 ? "De 12 a 24 meses" : a.sexo === "Hembra" ? "Hembras de más de 24 meses" : "Machos de más de 24 meses";
    return a.sexo === "Hembra" ? "Hembras" : "Machos"; };
  const g = {}; for (const a of A) { const k = `${a.especie}|${cat(a)}`; g[k] = (g[k]||0) + 1; }
  return Object.entries(g).map(([k, n]) => { const [especie, c] = k.split("|"); return {especie, cat:c, n}; }).sort((a,b)=>a.especie.localeCompare(b.especie) || a.cat.localeCompare(b.cat));
}
TABS.oficial = {title: "Exportaciones oficiales", render(){
  const y = UI.repY, grupo = g => Object.entries(EXPORTS).filter(([,e])=>e.g===g).map(([k,e])=>`<button class="btn" data-act="exp" data-k="${k}">${esc(e.t)}</button>`).join("");
  const C = censoA(UI.censoF);
  return `<div class="toolbar"><label for="repY2" class="muted">Campaña</label><select id="repY2" style="width:auto">${years().map(v=>`<option ${v===y?"selected":""}>${v}</option>`).join("")}</select></div>
  <div class="rep-grid">
  <section class="panel" style="box-shadow:inset 0 3px 0 var(--agri)"><h3>Cuaderno digital de explotación (SIEX)</h3>
    <p class="muted" style="margin:0;font-size:.88rem">Parcelas identificadas por recinto SIGPAC, tratamientos, fertilización y cosechas de la campaña ${esc(y)}, en hojas CSV para Excel y en un archivo JSON completo.</p>
    <div class="toolbar">${grupo("siex")}</div></section>
  <section class="panel" style="box-shadow:inset 0 3px 0 var(--gan)"><h3>Libro de registro ganadero (REGA)</h3>
    <p class="muted" style="margin:0;font-size:.88rem">REGA ${esc(DB._meta.titular?.rega_gan || "sin indicar (añádelo en Ajustes)")}.</p>
    <div class="toolbar">${grupo("rega")}</div>
    <div class="fld"><label for="censoF">Fecha de referencia del censo</label><input type="date" id="censoF" value="${UI.censoF}" style="width:auto"></div>
    ${C.length?`<div class="table-wrap"><table><thead><tr><th>Especie</th><th>Categoría</th><th>Nº</th></tr></thead><tbody>${C.map(c=>`<tr style="cursor:default"><td>${esc(c.especie)}</td><td class="wrap-cell">${esc(c.cat)}</td><td class="num">${c.n}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin animales en esa fecha.</p>`}</section>
  <section class="panel" style="box-shadow:inset 0 3px 0 var(--api)"><h3>Registro apícola</h3>
    <p class="muted" style="margin:0;font-size:.88rem">REGA ${esc(DB._meta.titular?.rega_api || "sin indicar (añádelo en Ajustes)")} · ${DB.apiarios.length} asentamientos · ${DB.colmenas.filter(c=>c.estado!=="Muerta"&&c.estado!=="Vendida").length} colmenas.</p>
    <div class="toolbar">${grupo("api")}</div></section>
  </div>
  <p class="muted" style="font-size:.85rem;max-width:80ch">El cuaderno digital se presenta a través del SIEX del Ministerio y de las aplicaciones de cada comunidad autónoma. Cada una tiene su propia plantilla de importación, así que estos archivos llevan los datos ordenados por recinto SIGPAC y con los campos que piden (RD 1311/2012 y RD 1054/2022) para que tu entidad o tu técnico los cargue. Comprueba el formato exacto con tu oficina comarcal o tu ADS antes de enviarlos.</p>`;
}};
document.addEventListener("click", e => { const el = e.target.closest('[data-act="exp"]'); if (!el) return; try { EXPORTS[el.dataset.k].run(UI.repY); toast("Archivo descargado"); } catch(err) { console.warn(err); toast("No se pudo generar el archivo"); } });
document.addEventListener("change", e => { if (e.target.id === "censoF" && e.target.value) { UI.censoF = e.target.value; render(); } if (e.target.id === "repY2") { UI.repY = e.target.value; render(); } });
