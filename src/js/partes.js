/* ============ Partes de trabajo: trabajadores, maquinaria y partes diarios ============ */
S.trabajadores = {title: "Trabajadores", one: "trabajador", label: r => r.nombre, fields: [
  {k:"nombre", l:"Nombre y apellidos", req:1}, {k:"nif", l:"NIF o NIE"},
  {k:"tipo", l:"Relación", t:"sel", o:["Titular","Familiar","Asalariado fijo","Fijo discontinuo","Eventual","Contratista o empresa de servicios"], def:"Asalariado fijo"},
  {k:"coste_hora", l:"Coste por hora (€)", t:"num", step:"0.01", help:"Salario más Seguridad Social, para calcular costes"},
  {k:"carne", l:"Carné de aplicador fitosanitario", t:"sel", o:["No tiene","Básico","Cualificado","Fumigador","Piloto"]},
  {k:"carne_cad", l:"Caducidad del carné", t:"date"}, {k:"telefono", l:"Teléfono"},
  {k:"activo", l:"Activo", t:"chk", def:true}, {k:"notas", l:"Notas", t:"area"}],
  cols: ["nombre","tipo",{l:"€/hora", f:r=>r.coste_hora?eur.format(r.coste_hora):"", num:1},"carne",
    {l:"Carné caduca", f:r=>fdate(r.carne_cad), pill:r=>!r.carne_cad?"":r.carne_cad<today()?"crit":daysBetween(today(),r.carne_cad)<=60?"warn":"ok"},
    {l:`Horas ${new Date().getFullYear()}`, f:r=>fnum(DB.partes.filter(p=>p.trabajador===r.id&&(p.fecha||"").startsWith(String(new Date().getFullYear()))).reduce((s,p)=>s+horasParte(p),0)), num:1},
    {l:"Estado", f:r=>r.activo?"Activo":"Baja", pill:r=>r.activo?"ok":""}]};
S.maquinaria = {title: "Maquinaria", one: "máquina", label: r => r.nombre, fields: [
  {k:"nombre", l:"Nombre", req:1}, {k:"tipo", l:"Tipo", t:"sel", o:["Tractor","Pulverizador","Abonadora","Sembradora","Cosechadora","Apero de laboreo","Remolque","Vehículo","Otro"]},
  {k:"marca", l:"Marca y modelo"}, {k:"matricula", l:"Matrícula"}, {k:"roma", l:"Nº ROMA"},
  {k:"coste_hora", l:"Coste por hora (€)", t:"num", step:"0.01", help:"Gasoil, mantenimiento y amortización"},
  {k:"itv", l:"Próxima ITV o inspección (ITEAF)", t:"date"}, {k:"horometro", l:"Horas del horómetro al darla de alta", t:"num"}, {k:"notas", l:"Notas", t:"area"}],
  cols: ["nombre","tipo","marca","matricula","roma",{l:"€/hora", f:r=>r.coste_hora?eur.format(r.coste_hora):"", num:1},
    {l:"Horas de uso", f:r=>fnum(Number(r.horometro||0)+DB.partes.filter(p=>p.maquina===r.id).reduce((s,p)=>s+Number(p.horas_maq||0),0)), num:1},
    {l:"ITV / ITEAF", f:r=>fdate(r.itv), pill:r=>!r.itv?"":r.itv<today()?"crit":daysBetween(today(),r.itv)<=30?"warn":"ok"}]};

const TAREAS = ["Laboreo","Siembra","Abonado","Tratamiento fitosanitario","Riego","Poda","Desbroce","Recolección","Manejo del ganado","Ordeño","Alimentación del ganado","Limpieza de instalaciones","Revisión de colmenas","Extracción de miel","Mantenimiento de maquinaria","Transporte","Otro"];
S.partes = {title: "Partes de trabajo", one: "parte", label: r => `Parte ${r.numero||""}`, help: "Cada parte registra quién trabajó, dónde, cuántas horas, con qué máquina y qué productos usó. Se puede firmar en el móvil y descargar en PDF.", fields: [
  {k:"numero", l:"Nº de parte", def:()=>siguienteNumero()}, {k:"fecha", l:"Fecha", t:"date", req:1, def:today},
  {k:"trabajador", l:"Trabajador", t:"ref", ref:"trabajadores", req:1},
  {k:"tarea", l:"Tarea", t:"sel", o:TAREAS, req:1},
  {k:"actividad", l:"Actividad", t:"sel", o:["Agrícola","Ganadero","Apícola","General"], def:"Agrícola"},
  {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas"}, {k:"lote", l:"Lote de ganado"}, {k:"apiario", l:"Apiario", t:"ref", ref:"apiarios"},
  {k:"inicio", l:"Hora de inicio", t:"time", def:"08:00"}, {k:"fin", l:"Hora de fin", t:"time"},
  {k:"descanso", l:"Descanso (minutos)", t:"num", def:0}, {k:"horas", l:"Horas trabajadas", t:"num", help:"Se calcula con las horas de inicio y fin si lo dejas vacío"},
  {k:"maquina", l:"Máquina", t:"ref", ref:"maquinaria"}, {k:"horas_maq", l:"Horas de máquina", t:"num", help:"Si lo dejas vacío, las mismas que el trabajador"},
  {k:"superficie", l:"Superficie trabajada (ha)", t:"num", step:"0.01"},
  {k:"trabajo", l:"Trabajo realizado", t:"area"},
  {k:"estado", l:"Estado", t:"sel", o:["Pendiente","Hecho","Firmado"], def:"Hecho"},
  {k:"notas", l:"Observaciones e incidencias", t:"area"},
  {k:"firma", l:"Firma", hide:1}, {k:"firma_fecha", l:"Fecha de firma", hide:1}],
  cols: ["numero","fecha","trabajador","tarea",{l:"Lugar", f:r=>lugarParte(r), wrap:1},{l:"Horas", f:r=>fnum(horasParte(r)), num:1},"maquina",
    {l:"Coste", f:r=>{const c=costeParte(r);return c?eur.format(c):"";}, num:1},
    {l:"Estado", f:r=>r.estado, pill:r=>({Firmado:"ok", Hecho:"", Pendiente:"warn"})[r.estado]||""}]};

/* Orden del menú: Partes justo después de Agenda */
(() => { const e = Object.entries(MODS); for (const [k] of e) delete MODS[k];
  for (const [k, v] of e) { MODS[k] = v; if (k === "agenda") MODS.partes = {name:"Partes", color:"var(--partes)", desc:"Partes de trabajo, personal y maquinaria", tables:["partes","trabajadores","maquinaria"]}; } })();
ICONS.partes = '<path d="M9 3h6v3H9zM7 4.5H5v16h14v-16h-2M8 11h8M8 15h5"/>';

function siguienteNumero(){ const y = new Date().getFullYear(); const n = DB.partes.filter(p=>String(p.numero||"").startsWith(`${y}-`)).map(p=>Number(String(p.numero).split("-")[1])||0); return `${y}-${String((n.length?Math.max(...n):0)+1).padStart(3,"0")}`; }
function horasParte(p){
  if (p.horas !== "" && p.horas != null) return Number(p.horas);
  if (!p.inicio || !p.fin) return 0;
  const m = t => Number(t.slice(0,2))*60 + Number(t.slice(3,5));
  let d = m(p.fin) - m(p.inicio); if (d < 0) d += 1440;
  return Math.max(0, (d - Number(p.descanso||0)) / 60);
}
const horasMaq = p => p.maquina ? (p.horas_maq !== "" && p.horas_maq != null ? Number(p.horas_maq) : horasParte(p)) : 0;
function costeParte(p){
  const t = DB.trabajadores.find(x=>x.id===p.trabajador), m = DB.maquinaria.find(x=>x.id===p.maquina);
  return horasParte(p)*Number(t?.coste_hora||0) + horasMaq(p)*Number(m?.coste_hora||0) + costeConsumo(p);
}
const lugarParte = r => [refName("parcelas", r.parcela), r.lote, refName("apiarios", r.apiario)].filter(Boolean).join(" · ");

/* Productos del almacén gastados en el parte */
CONSUMO.partes = {tipos:[], fill:{}};
{ const i = S.partes.fields.findIndex(f=>f.k==="trabajo");
  S.partes.fields.splice(i, 0, {k:"prod", l:"Producto del almacén", t:"ref", ref:"productos", help:"Opcional. Descuenta del stock y suma su coste.", filter:()=>true}, {k:"consumo", l:"Cantidad gastada del almacén", t:"num"}); }

/* Al guardar: horas calculadas, y la firma */
let firmaPad = null;
FORM_EXTRA.push({
  html(t, r){
    if (t !== "partes") return "";
    return `<div class="fld full"><label>Firma del trabajador</label>
      <div class="firma-box"><canvas id="firmaCv" aria-label="Zona de firma"></canvas>${r?.firma?`<img id="firmaImg" src="${r.firma}" alt="Firma guardada">`:""}</div>
      <div class="toolbar"><button type="button" class="btn" data-act="firma-borrar">Borrar firma</button><span class="muted" style="font-size:.82rem">${r?.firma?`Firmado el ${fdate(r.firma_fecha)}. Firma encima para cambiarla.`:"Firma con el dedo o el ratón."}</span></div></div>
      ${r ? `<div class="fld full"><div class="toolbar"><button type="button" class="btn" data-act="parte-pdf" data-id="${r.id}">Descargar este parte en PDF</button><button type="button" class="btn" data-act="parte-dup" data-id="${r.id}">Duplicar para otro día</button></div></div>` : ""}`;
  },
  mount(t){
    if (t !== "partes") { firmaPad = null; return; }
    const cv = $("#firmaCv"), img = $("#firmaImg"); if (!cv) return;
    const dpr = window.devicePixelRatio || 1; cv.width = cv.clientWidth*dpr; cv.height = cv.clientHeight*dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr); c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#1d261c";
    firmaPad = {cv, sucio:false, borrada:false};
    let pinta = false, last = null;
    const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX-b.left, e.clientY-b.top]; };
    cv.addEventListener("pointerdown", e => { pinta = true; last = pt(e); cv.setPointerCapture(e.pointerId); if (img) img.remove(); firmaPad.sucio = true; });
    cv.addEventListener("pointermove", e => { if (!pinta) return; const p = pt(e); c.beginPath(); c.moveTo(...last); c.lineTo(...p); c.stroke(); last = p; });
    cv.addEventListener("pointerup", () => { pinta = false; });
    // Al rellenar inicio y fin, se calculan las horas
    const calc = () => { const h = $("#f_horas"); if (!h || h.dataset.manual) return; const v = horasParte({inicio:$("#f_inicio").value, fin:$("#f_fin").value, descanso:$("#f_descanso").value}); h.placeholder = v ? `${fnum(v)} h calculadas` : ""; };
    for (const id of ["f_inicio","f_fin","f_descanso"]) $("#"+id)?.addEventListener("input", calc); calc();
    // Al elegir parcela/lote/apiario, la actividad se pone sola
    $("#f_parcela")?.addEventListener("change", e => { if (e.target.value) $("#f_actividad").value = "Agrícola"; });
    $("#f_apiario")?.addEventListener("change", e => { if (e.target.value) $("#f_actividad").value = "Apícola"; });
    $("#f_lote")?.addEventListener("input", e => { if (e.target.value) $("#f_actividad").value = "Ganadero"; });
  },
  collect(t, rec){
    if (t !== "partes") return;
    if (rec.horas === "") { const h = horasParte({...rec, horas:""}); if (h) rec.horas = Math.round(h*100)/100; }
    if (firmaPad?.borrada && !firmaPad.sucio) { rec.firma = ""; rec.firma_fecha = ""; if (rec.estado === "Firmado") rec.estado = "Hecho"; }
    if (firmaPad?.sucio) { rec.firma = firmaPad.cv.toDataURL("image/png"); rec.firma_fecha = today(); rec.estado = "Firmado"; }
    firmaPad = null;
  }
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "firma-borrar" && firmaPad) { const c = firmaPad.cv.getContext("2d"); c.save(); c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,firmaPad.cv.width,firmaPad.cv.height); c.restore(); $("#firmaImg")?.remove(); firmaPad.sucio = false; firmaPad.borrada = true; }
  else if (a === "parte-pdf") pdfParte(DB.partes.find(p=>p.id===el.dataset.id));
  else if (a === "parte-dup") {
    const o = DB.partes.find(p=>p.id===el.dataset.id); if (!o) return;
    $("#dlg").close(); openForm("partes");
    for (const f of S.partes.fields) { if (f.hide || ["numero","fecha","estado"].includes(f.k)) continue; const x = $(`#f_${f.k}`); if (x && o[f.k] != null) { if (x.type === "checkbox") x.checked = !!o[f.k]; else x.value = o[f.k]; } }
    toast("Parte duplicado: revisa la fecha y guarda");
  }
});
document.addEventListener("input", e => { if (e.target.id === "f_horas") e.target.dataset.manual = e.target.value ? "1" : ""; });

/* ---- Integración: costes, calendario y avisos ---- */
{ const _p = rentParcelas, _l = rentLotes, _a = rentApiarios;
  const sumar = (r, filtro) => { const c = DB.partes.filter(p=>filtro(p)&&enAno(p)).reduce((s,p)=>s+costeParte(p),0); if (c) { r.gas += c; r.det["Partes de trabajo"] = c; } return r; };
  rentParcelas = () => _p().map((r,i) => sumar(r, p => p.parcela === DB.parcelas[i].id));
  rentLotes = () => _l().map(r => sumar(r, p => p.lote && p.lote === r.n));
  rentApiarios = () => _a().map((r,i) => sumar(r, p => p.apiario === DB.apiarios[i].id));
}
{ const _ev = eventosAuto;
  eventosAuto = (desde, hasta) => { const E = _ev(desde, hasta);
    for (const p of DB.partes) if (p.fecha >= desde && p.fecha <= hasta) E.push({d:p.fecha, c:"var(--partes)", t:`Parte ${p.numero||""}: ${refName("trabajadores", p.trabajador)} · ${p.tarea||""}`, done:1, edit:["partes", p.id]});
    for (const m of DB.maquinaria) if (m.itv && m.itv >= desde && m.itv <= hasta) E.push({d:m.itv, c:"var(--partes)", t:`ITV o ITEAF: ${m.nombre}`, go:["partes","maquinaria"]});
    return E; }; }
ALERTS.push(() => {
  const A = [];
  for (const m of DB.maquinaria) if (m.itv) { const d = daysBetween(today(), m.itv); if (d < 0) A.push({lv:"crit", t:`${m.nombre}: ITV o inspección caducada`, s:m.matricula||m.roma||"", d:m.itv, mod:"partes", tab:"maquinaria"}); else if (d <= 30) A.push({lv:"warn", t:`${m.nombre}: ITV o inspección próxima`, s:m.matricula||m.roma||"", d:m.itv, mod:"partes", tab:"maquinaria"}); }
  for (const w of DB.trabajadores) if (w.activo && w.carne_cad) { const d = daysBetween(today(), w.carne_cad); if (d <= 60) A.push({lv:d<0?"crit":"warn", t:`Carné de aplicador de ${w.nombre} ${d<0?"caducado":"caduca pronto"}`, s:w.carne||"", d:w.carne_cad, mod:"partes", tab:"trabajadores"}); }
  const pend = DB.partes.filter(p=>p.estado==="Pendiente"&&p.fecha<=today()).length;
  if (pend) A.push({lv:"", t:`${pend} parte${pend>1?"s":""} de trabajo pendiente${pend>1?"s":""}`, s:"Complétalos o fírmalos", d:"", mod:"partes", tab:"partes"});
  return A;
});

/* ---- PDF de un parte ---- */
function pdfParte(p){
  if (!p) return; if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const {jsPDF} = window.jspdf, doc = new jsPDF({unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51];
  const w = DB.trabajadores.find(x=>x.id===p.trabajador), m = DB.maquinaria.find(x=>x.id===p.maquina), pr = DB.productos.find(x=>x.id===p.prod);
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...verde); doc.text("Parte de trabajo", 14, 20);
  doc.setFontSize(12); doc.text(`Nº ${p.numero||"—"}`, 196, 20, {align:"right"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(60); doc.text([T.nombre, T.nif && `NIF ${T.nif}`].filter(Boolean).join(" · ") || "Explotación", 14, 27);
  const fila = (k, v) => [k, v == null || v === "" ? "—" : String(v)];
  const body = [
    fila("Fecha", fdate(p.fecha)), fila("Trabajador", w ? `${w.nombre}${w.nif?" · "+w.nif:""}` : ""), fila("Relación", w?.tipo), fila("Carné de aplicador", w?.carne),
    fila("Tarea", p.tarea), fila("Actividad", p.actividad), fila("Parcela", refName("parcelas", p.parcela)), fila("Lote de ganado", p.lote), fila("Apiario", refName("apiarios", p.apiario)),
    fila("Horario", p.inicio || p.fin ? `${p.inicio||"?"} a ${p.fin||"?"}${Number(p.descanso)?` (descanso ${p.descanso} min)`:""}` : ""), fila("Horas trabajadas", fnum(horasParte(p))),
    fila("Máquina", m ? `${m.nombre}${m.matricula?" · "+m.matricula:""}${m.roma?" · ROMA "+m.roma:""}` : ""), fila("Horas de máquina", m ? fnum(horasMaq(p)) : ""),
    fila("Superficie trabajada", p.superficie ? `${fnum(p.superficie)} ha` : ""),
    fila("Producto usado", pr ? `${pr.nombre}${pr.registro?" (Nº "+pr.registro+")":""} · ${fnum(p.consumo)} ${pr.unidad||""}` : ""),
    fila("Trabajo realizado", p.trabajo), fila("Observaciones", p.notas), fila("Coste estimado", costeParte(p) ? eur.format(costeParte(p)) : "")];
  doc.autoTable({startY:33, body, theme:"grid", styles:{fontSize:10, cellPadding:2.2}, columnStyles:{0:{fontStyle:"bold", cellWidth:48, fillColor:[243,245,239]}}, margin:{left:14, right:14}});
  let y = doc.lastAutoTable.finalY + 12;
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFontSize(9); doc.setTextColor(60);
  doc.text("Firma del trabajador", 14, y); doc.text("Firma del titular o encargado", 110, y);
  if (p.firma) try { doc.addImage(p.firma, "PNG", 14, y+2, 70, 26); } catch(e) {}
  doc.line(14, y+30, 90, y+30); doc.line(110, y+30, 186, y+30);
  if (p.firma_fecha) doc.text(`Firmado el ${fdate(p.firma_fecha)}`, 14, y+35);
  doc.setFontSize(8); doc.setTextColor(120); doc.text(`Emitido el ${fdate(today())}`, 196, 290, {align:"right"});
  try { doc.save(`parte-${p.numero||p.fecha}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}

/* ---- Informe: resumen de partes por trabajador y mes ---- */
INFORMES.partes = {t:"Partes de trabajo y horas por trabajador", s:"Todos los partes del año y el resumen de horas por trabajador y mes, útil para nóminas y registro de jornada", c:"var(--partes)", secs:[]};
{ const _g = generarPDF;
  generarPDF = k => {
    if (k !== "partes") return _g(k);
    if (!window.jspdf) return toast("El generador de PDF no está disponible");
    const {jsPDF} = window.jspdf, doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51];
    const P = DB.partes.filter(p=>(p.fecha||"").startsWith(UI.repY)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
    doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...verde); doc.text(INFORMES.partes.t, 14, 18);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(60); doc.text([T.nombre, T.nif && `NIF ${T.nif}`, `Año ${UI.repY}`, `Emitido el ${fdate(today())}`].filter(Boolean).join(" · "), 14, 25);
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const ws = DB.trabajadores.filter(w => P.some(p=>p.trabajador===w.id));
    const head = ["Trabajador", ...meses, "Total h", "Coste"];
    const body = ws.map(w => { const pw = P.filter(p=>p.trabajador===w.id); const hm = meses.map((_,i)=>pw.filter(p=>Number(p.fecha.slice(5,7))===i+1).reduce((s,p)=>s+horasParte(p),0));
      return [w.nombre, ...hm.map(h=>h?fnum(h):""), fnum(hm.reduce((a,b)=>a+b,0)), eur.format(pw.reduce((s,p)=>s+horasParte(p)*Number(w.coste_hora||0),0))]; });
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...verde); doc.text("Horas por trabajador y mes", 14, 34);
    doc.autoTable({startY:36, head:[head], body: body.length?body:[[{content:"Sin partes este año", colSpan:head.length, styles:{halign:"center"}}]], theme:"grid", styles:{fontSize:8, cellPadding:1.4, halign:"right"}, columnStyles:{0:{halign:"left", cellWidth:45}}, headStyles:{fillColor:verde, halign:"center"}, margin:{left:14, right:14}});
    let y = doc.lastAutoTable.finalY + 10;
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...verde); doc.text("Detalle de partes", 14, y);
    doc.autoTable({startY:y+2, head:[["Nº","Fecha","Trabajador","Tarea","Lugar","Horario","Horas","Máquina","h máq.","Producto","Trabajo realizado","Firmado"]],
      body: P.map(p=>[p.numero||"", fdate(p.fecha), refName("trabajadores",p.trabajador), p.tarea||"", lugarParte(p), p.inicio&&p.fin?`${p.inicio}-${p.fin}`:"", fnum(horasParte(p)), refName("maquinaria",p.maquina), p.maquina?fnum(horasMaq(p)):"", p.prod?`${refName("productos",p.prod)} ${fnum(p.consumo)}`:"", p.trabajo||"", p.firma?"Sí":"No"]),
      theme:"grid", styles:{fontSize:7.5, cellPadding:1.3}, headStyles:{fillColor:verde}, alternateRowStyles:{fillColor:[243,245,239]}, columnStyles:{10:{cellWidth:55}}, margin:{left:14, right:14}});
    for (let i=1;i<=doc.getNumberOfPages();i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Página ${i} de ${doc.getNumberOfPages()}`, 283, 203, {align:"right"}); }
    try { doc.save(`partes-${UI.repY}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
  };
}

SEEDS.push((d, add, D, ids) => {
  const w1 = add("trabajadores", {nombre:"Titular de la explotación", tipo:"Titular", coste_hora:0, carne:"Cualificado", carne_cad:D(900), activo:true});
  const w2 = add("trabajadores", {nombre:"Trabajador de ejemplo", nif:"00000000T", tipo:"Asalariado fijo", coste_hora:14.5, carne:"Básico", carne_cad:D(40), activo:true});
  const m1 = add("maquinaria", {nombre:"Tractor 110 CV", tipo:"Tractor", marca:"Ejemplo 6110", matricula:"E-0000-BBB", roma:"ROMA-EJEMPLO", coste_hora:18, itv:D(25), horometro:4210});
  const m2 = add("maquinaria", {nombre:"Pulverizador 1200 L", tipo:"Pulverizador", roma:"ROMA-EJEMPLO-2", coste_hora:6, itv:D(300)});
  const y = new Date().getFullYear();
  add("partes", {numero:`${y}-001`, fecha:D(-30), trabajador:w2, tarea:"Siembra", actividad:"Agrícola", parcela:ids.p1, inicio:"08:00", fin:"13:30", descanso:30, horas:5, maquina:m1, horas_maq:4.5, superficie:6.35, trabajo:"Siembra de cebada a 180 kg/ha", estado:"Hecho"});
  add("partes", {numero:`${y}-002`, fecha:D(-6), trabajador:w1, tarea:"Tratamiento fitosanitario", actividad:"Agrícola", parcela:ids.p2, inicio:"07:30", fin:"10:00", descanso:0, horas:2.5, maquina:m2, superficie:3.1, trabajo:"Tratamiento contra repilo con cobre", estado:"Hecho"});
  add("partes", {numero:`${y}-003`, fecha:D(-2), trabajador:w2, tarea:"Manejo del ganado", actividad:"Ganadero", lote:"Lote A", inicio:"08:00", fin:"12:00", descanso:0, horas:4, trabajo:"Desparasitación y revisión de pezuñas", estado:"Pendiente"});
});
