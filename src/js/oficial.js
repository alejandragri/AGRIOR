/* ============ Exportaciones oficiales: cuaderno digital (SIEX), libro REGA y censos ============ */
MODS.informes.tables = ["pdf","oficial"]; MODS.informes.desc = "Libros oficiales y exportaciones";
UI.censoF = UI.censoF || `${new Date().getFullYear()}-01-01`;
const csvCell = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const csvNum = v => v === "" || v == null ? "" : String(v).replace(".", ",");
function bajarCSV(nombre, cab, filas){ download(nombre, "﻿" + [cab, ...filas].map(f=>f.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8"); }
const sig = id => { const p = DB.parcelas.find(x=>x.id===id) || {}; return {prov:p.provincia||"", mun:p.municipio||"", pol:p.poligono??"", par:p.parcela??"", rec:p.recinto??"", sup:p.superficie??"", uso:(p.uso||"").split(" · ")[0], nombre:p.nombre||""}; };
const cultivoDe = (pid, y) => DB.cultivos.find(c=>c.parcela===pid && String(c.campana)===String(y));
const variedadDe = r => cultivoDe(r.parcela, (r.fecha||"").slice(0,4))?.variedad || "";
const carneDe = nombre => { const w = DB.trabajadores?.find(x=>nombre && (nombre.includes(x.nombre) || x.nombre.includes(nombre))); return w ? `${w.carne||""}` : ""; };

{ const F = S.fitosanitarios.fields, i = F.findIndex(f=>f.k==="equipo"); if (!F.some(f=>f.k==="asesor")) F.splice(i < 0 ? F.length : i, 0, {k:"asesor", l:"Asesor (nombre y nº de inscripción, si lo hay)"}); }
const EXPORTS = {
  siex_parcelas: {g:"siex", t:"Parcelas y cultivos", run(y){ bajarCSV(`siex-parcelas-${y}.csv`,
    ["Campaña","Provincia","Municipio","Agregado","Zona","Polígono","Parcela","Recinto","Superficie SIGPAC (ha)","Uso SIGPAC","Cultivo","Variedad","Fecha siembra o plantación","Superficie cultivada (ha)","Sistema de explotación","Nombre o paraje"],
    DB.parcelas.map(p => { const s = sig(p.id), c = cultivoDe(p.id, y); return [y, s.prov, s.mun, 0, 0, s.pol, s.par, s.rec, csvNum(s.sup), s.uso, c?.cultivo||"", c?.variedad||"", fdate(c?.siembra), csvNum(c?.superficie??""), p.riego||"", s.nombre]; })); }},
  siex_fito: {g:"siex", t:"Tratamientos fitosanitarios", run(y){ bajarCSV(`siex-tratamientos-${y}.csv`,
    ["Fecha","Provincia","Municipio","Polígono","Parcela","Recinto","Cultivo","Variedad","Superficie tratada (ha)","Problema fitosanitario","Producto comercial","Nº registro","Materia activa","Dosis","Unidad de dosis","Plazo de seguridad (días)","Aplicador","Carné del aplicador","Asesor","Equipo (ROMA)","Eficacia","Observaciones"],
    DB.fitosanitarios.filter(r=>(r.fecha||"").startsWith(y)).map(r => { const s = sig(r.parcela); return [fdate(r.fecha), s.prov, s.mun, s.pol, s.par, s.rec, r.cultivo||"", variedadDe(r), csvNum(r.sup_tratada), r.problema||"", r.producto||"", r.registro||"", r.materia||"", csvNum(r.dosis), r.unidad||"", r.plazo??"", r.aplicador||"", carneDe(r.aplicador), r.asesor||"", r.equipo||"", r.eficacia||"", r.notas||""]; })); }},
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
      tratamientos: DB.fitosanitarios.filter(r=>(r.fecha||"").startsWith(y)).map(r=>({fecha:r.fecha, recinto:sig(r.parcela), cultivo:r.cultivo, problema:r.problema, producto:r.producto, registro:r.registro, materia_activa:r.materia, dosis:r.dosis, unidad:r.unidad, superficie_ha:r.sup_tratada, plazo_seguridad:r.plazo, aplicador:r.aplicador, carne_aplicador:carneDe(r.aplicador), asesor:r.asesor||null, variedad:variedadDe(r)||null, equipo_roma:r.equipo, eficacia:r.eficacia, observaciones:r.notas||null})),
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
  ${revisionCuaderno(y)}
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
  <p class="muted" style="font-size:.85rem;max-width:80ch">El Ministerio no ha publicado todavía un formato de archivo único para entregar el cuaderno: cada comunidad autónoma usa su aplicación o su plantilla. Estos archivos llevan los datos ordenados por recinto SIGPAC y con los campos del registro de tratamientos (RD 1311/2012) y del cuaderno digital (RD 1054/2022) para que tu entidad, tu ADS o tu técnico los carguen. Pregunta el formato exacto en tu oficina comarcal agraria antes de enviarlos.</p>`;
}};
document.addEventListener("click", e => { const el = e.target.closest('[data-act="exp"]'); if (!el) return; try { EXPORTS[el.dataset.k].run(UI.repY); toast("Archivo descargado"); } catch(err) { console.warn(err); toast("No se pudo generar el archivo"); } });
document.addEventListener("change", e => { if (e.target.id === "censoF" && e.target.value) { UI.censoF = e.target.value; render(); } if (e.target.id === "repY2") { UI.repY = e.target.value; render(); } });

/* ============ Revisión del cuaderno: qué falta para que el registro esté completo ============ */
/* Datos del registro de tratamientos del anexo III del RD 1311/2012 y de identificación del cuaderno (RD 1054/2022) */
const FALTAS_FITO = [["fecha","fecha"],["parcela","parcela"],["cultivo","cultivo"],["problema","plaga o enfermedad"],["producto","producto"],["registro","nº de registro del producto"],["dosis","dosis"],["sup_tratada","superficie tratada"],["aplicador","aplicador"],["equipo","equipo de aplicación (ROMA)"],["eficacia","eficacia"]];
function faltasCuaderno(y){
  const vacio = v => v === "" || v == null, F = [];
  const T = DB._meta.titular || {};
  if (!T.nombre || !T.nif) F.push({t:"Datos del titular", s:"Falta el nombre o el NIF del titular", go:["ajustes"]});
  for (const p of DB.parcelas) { const f = ["provincia","municipio","poligono","parcela","recinto"].filter(k=>vacio(p[k])); if (f.length) F.push({t:`Parcela ${p.nombre}`, s:`Falta la referencia SIGPAC: ${f.join(", ")}`, edit:["parcelas", p.id]});
    if (!cultivoDe(p.id, y)) F.push({t:`Parcela ${p.nombre}`, s:`Sin cultivo apuntado en la campaña ${y}`, go:["agri","cultivos"], leve:1}); }
  for (const r of DB.fitosanitarios.filter(r=>(r.fecha||"").startsWith(y))) { const f = FALTAS_FITO.filter(([k])=>vacio(r[k])).map(x=>x[1]);
    if (r.aplicador && !carneDe(r.aplicador) && !/carn[eé]/i.test(r.aplicador)) f.push("carné del aplicador (añade al aplicador en Partes › Trabajadores)");
    if (f.length) F.push({t:`Tratamiento del ${fdate(r.fecha)}: ${r.producto||"sin producto"}`, s:`Falta: ${f.join(", ")}`, edit:["fitosanitarios", r.id]}); }
  for (const r of DB.abonados.filter(r=>(r.fecha||"").startsWith(y))) { const f = [["producto","producto"],["cantidad","cantidad"],["superficie","superficie"],["riqueza","riqueza N-P-K"]].filter(([k])=>vacio(r[k])).map(x=>x[1]);
    if (f.length) F.push({t:`Abonado del ${fdate(r.fecha)}: ${r.producto||"sin producto"}`, s:`Falta: ${f.join(", ")}`, edit:["abonados", r.id]}); }
  for (const m of DB.maquinaria||[]) if (/Pulverizador|Abonadora/.test(m.tipo||"") && !m.roma) F.push({t:`${m.nombre}`, s:"Falta el nº ROMA del equipo", edit:["maquinaria", m.id], leve:1});
  return F;
}
function revisionCuaderno(y){
  const F = faltasCuaderno(y), graves = F.filter(f=>!f.leve), h = today(), dias = daysBetween(h, "2027-01-01");
  const n = DB.fitosanitarios.filter(r=>(r.fecha||"").startsWith(y)).length;
  const li = f => `<li class="${f.leve?"":"warn"}" ${f.edit?`data-edit="${f.edit[0]}" data-id="${f.edit[1]}"`:`data-go="${f.go[0]}"${f.go[1]?` data-tab="${f.go[1]}"`:""}`} style="cursor:pointer"><div><strong>${esc(f.t)}</strong><small>${esc(f.s)}</small></div></li>`;
  return `<section class="panel" style="grid-column:1/-1;box-shadow:inset 0 3px 0 var(--agri)"><h3>Cuaderno digital: ¿está completo?</h3>
    <dl class="kv">
      <dt>Tratamientos fitosanitarios</dt><dd>${dias > 0 ? `Desde el <strong>1 de enero de 2027</strong> (dentro de ${dias} días) el registro tiene que llevarse en formato electrónico; el papel vale hasta el 31/12/2026 (Real Decreto 1039/2025). Lo que apuntas aquí ya cumple ese formato.` : `Desde el 1 de enero de 2027 el registro de tratamientos es electrónico (Real Decreto 1039/2025). Lo que apuntas aquí ya cumple ese formato.`}</dd>
      <dt>Cuaderno completo (CUE)</dt><dd>Hoy es voluntario. Será obligatorio con la próxima PAC para quien tenga más de 30 ha de cultivo, más de 5 ha de regadío o invernaderos (Real Decreto 34/2025). Todavía no hay fecha.</dd>
    </dl>
    ${F.length ? `<p style="margin:0"><span class="pill ${graves.length?"warn":"ok"}">${graves.length ? `${graves.length} registro${graves.length>1?"s":""} incompleto${graves.length>1?"s":""}` : "Lo obligatorio está completo"}</span> <span class="muted" style="font-size:.88rem">Campaña ${esc(y)} · ${n} tratamiento${n===1?"":"s"}. Toca cada uno para completarlo.</span></p>
      <ul class="alerts">${F.slice(0, 12).map(li).join("")}</ul>${F.length > 12 ? `<details><summary class="muted" style="cursor:pointer">Ver ${F.length-12} más</summary><ul class="alerts" style="margin-top:6px">${F.slice(12).map(li).join("")}</ul></details>` : ""}`
      : `<p style="margin:0"><span class="pill ok">Completo</span> <span class="muted" style="font-size:.88rem">Campaña ${esc(y)} · ${n} tratamiento${n===1?"":"s"} con todos los datos.</span></p>`}
  </section>`;
}
/* Un aviso en el inicio si hay tratamientos de este año sin completar */
ALERTS.push(() => { const y = today().slice(0,4), n = faltasCuaderno(y).filter(f=>f.edit?.[0]==="fitosanitarios").length;
  return n ? [{lv:"", t:`${n} tratamiento${n>1?"s":""} sin completar en el cuaderno`, s:"Revisa qué falta en Informes › Exportaciones oficiales", d:"", mod:"informes", tab:"oficial"}] : []; });
