/* ============ Informes oficiales en PDF (jsPDF + autotable) ============ */
const INFORMES = {
  cuaderno: {t:"Cuaderno de explotación agrícola", s:"Parcelas, cultivos, tratamientos fitosanitarios, abonados, labores y cosechas", c:"var(--agri)", secs:[
    ["Parcelas de la explotación", "parcelas", null, ["nombre","municipio","poligono","parcela","recinto","superficie","uso","riego"]],
    ["Cultivos de la campaña", "cultivos", r=>String(r.campana)===UI.repY, ["parcela","cultivo","variedad","siembra","superficie","estado"]],
    ["Registro de tratamientos fitosanitarios", "fitosanitarios", null, ["fecha","parcela","cultivo","problema","producto","registro","dosis","unidad","sup_tratada","plazo","aplicador","equipo","eficacia"]],
    ["Registro de fertilización", "abonados", null, ["fecha","parcela","producto","tipo","riqueza","cantidad","superficie"]],
    ["Labores realizadas", "labores", null, ["fecha","parcela","tipo","maquinaria","horas","descripcion"]],
    ["Registro de cosecha comercializada", "cosechas", null, ["fecha","parcela","cultivo","cantidad","comprador","albaran"]]]},
  ganadero: {t:"Libro de registro de explotación ganadera", s:"Censo, altas y bajas, movimientos y tratamientos con medicamentos veterinarios", c:"var(--gan)", secs:[
    ["Censo e identificación de animales", "animales", r=>r.estado!=="Baja"||(r.baja||"").startsWith(UI.repY), ["crotal","especie","raza","sexo","nacimiento","madre","alta","origen","estado","baja","motivo_baja"]],
    ["Registro de movimientos (entradas y salidas)", "movimientos", null, ["fecha","tipo","motivo","especie","num","identificacion","origen_destino","rega","documento"]],
    ["Registro de tratamientos veterinarios", "veterinarios", null, ["fecha","animal","diagnostico","medicamento","receta","lote_med","dosis","via","duracion","sup_carne","sup_leche","veterinario"]]]},
  apicola: {t:"Libro de registro de explotación apícola", s:"Apiarios, colmenas, revisiones, tratamientos, alimentación, producción y trashumancia", c:"var(--api)", secs:[
    ["Asentamientos (apiarios)", "apiarios", null, ["nombre","codigo","municipio","poligono","parcela","coordenadas","flora"]],
    ["Colmenas", "colmenas", null, ["codigo","apiario","modelo","alta","reina_ano","origen","estado"]],
    ["Tratamientos veterinarios", "apitratamientos", null, ["fecha","apiario","colmenas","enfermedad","producto","registro","lote","dosis","retirada","receta"]],
    ["Revisiones e incidencias sanitarias", "revisiones", null, ["fecha","apiario","colmena","fuerza","cria","reina","reservas","varroa","sintomas","acciones"]],
    ["Alimentación", "alimentacion", null, ["fecha","apiario","tipo","cantidad","colmenas"]],
    ["Producción", "producciones", null, ["fecha","apiario","producto","tipo_miel","kg","colmenas","lote","destino"]],
    ["Movimientos de colmenas (trashumancia)", "trashumancia", null, ["fecha","origen","destino","colmenas","documento"]]]},
  economico: {t:"Informe económico y de rentabilidad", s:"Gastos e ingresos, y margen por parcela, lote y apiario", c:"var(--eco)", secs:[]},
  almacen: {t:"Inventario del almacén", s:"Existencias, lotes y caducidades de productos", c:"var(--alm)", secs:[]},
};
UI.repY = UI.repY || String(new Date().getFullYear());
TABS.pdf = {title: "Informes", render(){
  const pdfOk = !!window.jspdf;
  return `<div class="toolbar"><label for="repY" class="muted">Año o campaña</label><select id="repY" style="width:auto">${years().map(y=>`<option ${y===UI.repY?"selected":""}>${y}</option>`).join("")}</select></div>
  ${pdfOk?"":`<p class="banner">No se ha podido cargar el generador de PDF. Comprueba la conexión y vuelve a abrir la app.</p>`}
  <div class="rep-grid">${Object.entries(INFORMES).map(([k,r])=>`<section class="panel" style="--mc:${r.c};box-shadow:inset 0 3px 0 ${r.c}"><h3>${r.t}</h3><p class="muted" style="margin:0;font-size:.9rem">${r.s}</p>
    <p class="muted" style="margin:0;font-size:.82rem">${r.secs.map(([,t,flt])=>`${S[t].title}: ${filas(t,flt).length}`).join(" · ")}</p>
    <div><button class="btn primary" data-act="pdf" data-k="${k}">Descargar PDF</button></div></section>`).join("")}</div>
  <p class="muted" style="font-size:.85rem;max-width:75ch">Los informes siguen el contenido mínimo de los registros oficiales (RD 1311/2012 y RD 1050/2022 para el cuaderno de campo, RD 787/2023 y normativa de medicamentos veterinarios para ganadería, RD 209/2002 para apicultura). Cada comunidad autónoma puede pedir su propio modelo; consulta con tu oficina comarcal o tu ADS.</p>`;
}};
function filas(t, flt){
  const conFecha = S[t].fields.some(f=>f.k==="fecha");
  return DB[t].filter(r => flt ? flt(r) : (!conFecha || (r.fecha||"").startsWith(UI.repY))).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""));
}
function celdaPdf(t, k, r){
  const f = S[t].fields.find(x=>x.k===k); const v = r[k];
  if (!f) return String(v ?? "");
  if (f.t === "date") return fdate(v); if (f.t === "ref") return refName(f.ref, v); if (f.t === "num") return fnum(v); if (f.t === "chk") return v?"Sí":"No";
  return String(v ?? "");
}
function generarPDF(k){
  if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const R = INFORMES[k], {jsPDF} = window.jspdf, doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
  const T = DB._meta.titular || {}, W = doc.internal.pageSize.getWidth();
  const verde = [47,82,51];
  // Portada / cabecera
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...verde); doc.text(R.t, 14, 18);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(40);
  const datos = [["Titular", T.nombre||"—"], ["NIF", T.nif||"—"], ["REGA ganadero", T.rega_gan||"—"], ["REGA apícola", T.rega_api||"—"], ["Comunidad autónoma", T.ccaa||"—"], ["Periodo", k==="almacen"?`A ${fdate(today())}`:`Año ${UI.repY}`], ["Fecha de emisión", fdate(today())]];
  doc.autoTable({startY:24, body:datos, theme:"plain", styles:{fontSize:9, cellPadding:1}, columnStyles:{0:{fontStyle:"bold", cellWidth:40}}, tableWidth:120});
  let y = doc.lastAutoTable.finalY + 6;
  const tabla = (titulo, head, body, opts={}) => {
    if (y > 180) { doc.addPage(); y = 16; }
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...verde); doc.text(titulo, 14, y); y += 2;
    doc.autoTable({startY:y, head:[head], body: body.length ? body : [[{content:"Sin registros en este periodo", colSpan:head.length, styles:{halign:"center", textColor:120}}]], theme:"grid", styles:{fontSize:7.5, cellPadding:1.4, overflow:"linebreak"}, headStyles:{fillColor:verde, textColor:255, fontSize:7.5}, alternateRowStyles:{fillColor:[243,245,239]}, margin:{left:14, right:14}, ...opts});
    y = doc.lastAutoTable.finalY + 8;
  };
  for (const [titulo, t, flt, cols] of R.secs) {
    const head = cols.map(c => (S[t].fields.find(f=>f.k===c)?.l || c));
    tabla(titulo, head, filas(t, flt).map(r => cols.map(c => celdaPdf(t, c, r))));
  }
  if (k === "ganadero") {
    const act = DB.animales.filter(a=>a.estado!=="Baja");
    tabla("Resumen del censo a fecha de emisión", ["Especie","Hembras","Machos","Total"], ESPECIES.map(e=>{const g=act.filter(a=>a.especie===e);return g.length?[e, g.filter(a=>a.sexo==="Hembra").length, g.filter(a=>a.sexo!=="Hembra").length, g.length]:null;}).filter(Boolean));
  }
  if (k === "economico") {
    const prev = UI.year; UI.year = UI.repY;
    const eco = filas("economia");
    tabla("Gastos e ingresos", ["Fecha","Tipo","Actividad","Categoría","Concepto","Importe"], eco.map(r=>[fdate(r.fecha), r.tipo, r.modulo||"", r.categoria||"", r.concepto, eur.format((r.tipo==="Gasto"?-1:1)*Number(r.importe||0))]), {columnStyles:{5:{halign:"right"}}});
    const ing = eco.filter(r=>r.tipo==="Ingreso").reduce((s,r)=>s+Number(r.importe||0),0), gas = eco.filter(r=>r.tipo==="Gasto").reduce((s,r)=>s+Number(r.importe||0),0);
    tabla("Resumen", ["Ingresos","Gastos","Resultado"], [[eur.format(ing), eur.format(gas), eur.format(ing-gas)]]);
    for (const [tt, rows, u, uk] of [["Rentabilidad por parcela", rentParcelas(), "€/ha", "ha"], ["Rentabilidad por lote de ganado", rentLotes(), "€/cabeza", "cab"], ["Rentabilidad por apiario", rentApiarios(), "€/colmena", "cab"]])
      tabla(tt, ["", "Ingresos", "Costes", "Margen", `Margen ${u}`], rows.map(r=>[`${r.n} (${r.sub})`, eur.format(r.ing), eur.format(r.gas), eur.format(r.ing-r.gas), r[uk]?eur.format((r.ing-r.gas)/r[uk]):"—"]));
    UI.year = prev;
  }
  if (k === "almacen") {
    tabla("Existencias", ["Producto","Tipo","Nº registro","Stock","Unidad","Precio medio","Valor","Lote","Caducidad"], DB.productos.map(p=>{const pm=precioMedio(p.id), s=stock(p.id);return [p.nombre, p.tipo, p.registro||"", fnum(s), p.unidad||"", pm?eur.format(pm):"", pm?eur.format(Math.max(0,s)*pm):"", p.lote||"", fdate(p.caducidad)];}));
    tabla("Compras del año", ["Fecha","Producto","Cantidad","Importe","Lote","Caducidad","Proveedor","Factura"], DB.compras.filter(c=>(c.fecha||"").startsWith(UI.repY)).map(c=>[fdate(c.fecha), refName("productos",c.producto), fnum(c.cantidad), c.importe?eur.format(c.importe):"", c.lote||"", fdate(c.caducidad), c.proveedor||"", c.factura||""]));
  }
  // Pie con número de página y firma
  const n = doc.getNumberOfPages();
  if (y > 175) { doc.addPage(); y = 20; }
  doc.setFontSize(9); doc.setTextColor(60); doc.text("Firma del titular:", 14, y + 4); doc.line(45, y + 5, 120, y + 5);
  for (let i=1;i<=doc.getNumberOfPages();i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text([R.t, T.nombre, `Página ${i} de ${doc.getNumberOfPages()}`].filter(Boolean).join(" · "), W-14, 203, {align:"right"}); }
  const name = `${k}-${UI.repY}.pdf`;
  try { doc.save(name); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}
document.addEventListener("click", e => { const el = e.target.closest('[data-act="pdf"]'); if (el) generarPDF(el.dataset.k); });
document.addEventListener("change", e => { if (e.target.id === "repY") { UI.repY = e.target.value; render(); } });
