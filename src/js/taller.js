/* ============ Mantenimiento de maquinaria: planes, intervenciones y estado ============ */
TIPOS_PROD.push("Recambio","Lubricante o aceite");
const TAREAS_MANT = ["Cambio de aceite del motor","Filtro de aceite","Filtro de aire","Filtro de gasoil","Aceite hidráulico y transmisión","Engrase","Refrigerante","Correas","Neumáticos","Frenos","Batería","Revisión del pulverizador (boquillas, filtros, manómetro)","Inspección ITEAF del equipo de tratamiento","ITV","Seguro","Revisión general","Otro"];
S.planes = {title: "Plan de mantenimiento", one: "mantenimiento programado", label: r => `${r.tarea} · ${refName("maquinaria", r.maquina)}`, help: "Cada tarea se repite cada cierto número de horas de motor, cada cierto tiempo, o lo que llegue antes. Al registrar la intervención se reinicia la cuenta.", fields: [
  {k:"maquina", l:"Máquina", t:"ref", ref:"maquinaria", req:1}, {k:"tarea", l:"Tarea", t:"sel", o:TAREAS_MANT, req:1},
  {k:"cada_horas", l:"Cada (horas de motor)", t:"num"}, {k:"cada_meses", l:"Cada (meses)", t:"num"},
  {k:"ultima_fecha", l:"Última vez (fecha)", t:"date"}, {k:"ultima_horas", l:"Última vez (horas del horómetro)", t:"num"},
  {k:"aviso_horas", l:"Avisar con (horas de antelación)", t:"num", def:10}, {k:"aviso_dias", l:"Avisar con (días de antelación)", t:"num", def:15},
  {k:"recambios", l:"Recambios y cantidades", help:"Ejemplo: 15 L aceite 15W40, filtro ref. 1234"}, {k:"notas", l:"Notas", t:"area"}],
  cols: [{l:"Máquina", f:r=>refName("maquinaria", r.maquina)}, "tarea",
    {l:"Frecuencia", f:r=>[r.cada_horas&&`${fnum(r.cada_horas)} h`, r.cada_meses&&`${fnum(r.cada_meses)} meses`].filter(Boolean).join(" o ")},
    {l:"Última vez", f:r=>[fdate(r.ultima_fecha), r.ultima_horas!==""&&r.ultima_horas!=null?`${fnum(r.ultima_horas)} h`:""].filter(Boolean).join(" · ")},
    {l:"Próxima", f:r=>proximaMant(r).txt, wrap:1}, {l:"Estado", f:r=>proximaMant(r).estado, pill:r=>proximaMant(r).lv}]};
S.intervenciones = {title: "Historial de taller", one: "intervención", label: r => `${r.tipo} · ${refName("maquinaria", r.maquina)}`, fields: [
  {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"maquina", l:"Máquina", t:"ref", ref:"maquinaria", req:1},
  {k:"tipo", l:"Tipo", t:"sel", o:["Mantenimiento preventivo","Avería","Reparación","Revisión, ITV o ITEAF","Mejora o modificación"], req:1, def:"Mantenimiento preventivo"},
  {k:"plan", l:"Mantenimiento programado que cumple", t:"ref", ref:"planes", help:"Si eliges uno, se reinicia su cuenta de horas y fecha"},
  {k:"horometro", l:"Horas del horómetro", t:"num", help:"Lectura del cuentahoras ese día. Sirve para ajustar las horas de la máquina."},
  {k:"descripcion", l:"Trabajo realizado o avería", req:1},
  {k:"taller", l:"Taller", help:"Vacío si lo has hecho tú"}, {k:"horas_mo", l:"Horas de mano de obra", t:"num"},
  {k:"coste_recambios", l:"Coste de recambios (€)", t:"num", step:"0.01"}, {k:"coste_taller", l:"Coste de taller o mano de obra (€)", t:"num", step:"0.01"},
  {k:"factura", l:"Factura"}, {k:"dias_parada", l:"Días parada", t:"num"},
  {k:"gasto", l:"Apuntar como gasto en Economía", t:"chk", def:true}, {k:"notas", l:"Notas", t:"area"}],
  cols: ["fecha", {l:"Máquina", f:r=>refName("maquinaria", r.maquina)}, {l:"Tipo", f:r=>r.tipo, pill:r=>/Avería|Reparación/.test(r.tipo)?"crit":/preventivo/.test(r.tipo)?"ok":""},
    {l:"Trabajo", f:r=>r.descripcion, wrap:1}, "horometro", "taller", {l:"Coste", f:r=>{const c=costeInterv(r);return c?eur.format(c):"";}, num:1}, "dias_parada"]};
CONSUMO.intervenciones = {tipos:["Recambio","Lubricante o aceite","Combustible","Otro"], fill:{}};
{ const i = S.intervenciones.fields.findIndex(f=>f.k==="factura");
  S.intervenciones.fields.splice(i, 0, {k:"prod", l:"Recambio o aceite del almacén", t:"ref", ref:"productos", help:"Opcional. Descuenta del stock y suma su coste.", filter:p=>CONSUMO.intervenciones.tipos.includes(p.tipo)}, {k:"consumo", l:"Cantidad gastada del almacén", t:"num"}); }

/* Módulo propio en el menú, después de Partes */
(() => { const e = Object.entries(MODS); for (const [k] of e) delete MODS[k];
  for (const [k, v] of e) { MODS[k] = v; if (k === "partes") MODS.taller = {name:"Taller", color:"var(--taller)", desc:"Mantenimiento de maquinaria", tables:["estado","maquinaria","planes","intervenciones","repostajes","consumo"]}; } })();
ICONS.taller = '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>';

/* Líneas extra en la ficha de estado: (máquina, año) => html */
const TALLER_EXTRA = [];
/* Horas actuales: última lectura del horómetro más las horas de partes posteriores */
function horasMaquina(id){
  const m = DB.maquinaria.find(x=>x.id===id); if (!m) return 0;
  const lect = [...DB.intervenciones, ...(DB.repostajes||[])].filter(i=>i.maquina===id && i.horometro!==""&&i.horometro!=null).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||"")).pop();
  const partes = (desde) => DB.partes.filter(p=>p.maquina===id && (!desde || p.fecha > desde)).reduce((s,p)=>s+horasMaq(p),0);
  const base = Number(m.horometro||0) + partes(null);
  return lect ? Math.max(base, Number(lect.horometro) + partes(lect.fecha)) : base;
}
function proximaMant(r){
  const h = horasMaquina(r.maquina), out = {txt:"", estado:"Al día", lv:"ok", horas:null, fecha:null, pct:0};
  const partes = [];
  if (r.cada_horas) { const ult = r.ultima_horas!==""&&r.ultima_horas!=null ? Number(r.ultima_horas) : Number(DB.maquinaria.find(m=>m.id===r.maquina)?.horometro||0);
    out.horas = ult + Number(r.cada_horas); const q = out.horas - h; out.pct = Math.max(out.pct, Math.min(1, (h-ult)/Number(r.cada_horas)));
    partes.push(q < 0 ? `pasado ${fnum(-q)} h` : `en ${fnum(q)} h (a las ${fnum(out.horas)} h)`);
    if (q < 0) { out.lv = "crit"; out.estado = "Vencido"; } else if (q <= Number(r.aviso_horas||0) && out.lv !== "crit") { out.lv = "warn"; out.estado = "Toca pronto"; } }
  if (r.cada_meses) { const base = r.ultima_fecha || today();
    const x = new Date(base+"T12:00:00"); x.setMonth(x.getMonth()+Number(r.cada_meses)); out.fecha = x.toISOString().slice(0,10);
    const d = daysBetween(today(), out.fecha); const tot = daysBetween(base, out.fecha) || 1; out.pct = Math.max(out.pct, Math.min(1, 1 - d/tot));
    partes.push(d < 0 ? `venció el ${fdate(out.fecha)}` : `el ${fdate(out.fecha)}`);
    if (d < 0) { out.lv = "crit"; out.estado = "Vencido"; } else if (d <= Number(r.aviso_dias||0) && out.lv !== "crit") { out.lv = "warn"; out.estado = "Toca pronto"; } }
  if (!r.cada_horas && !r.cada_meses) { out.estado = "Sin frecuencia"; out.lv = ""; }
  out.txt = partes.join(" o ");
  return out;
}
const costeInterv = r => Number(r.coste_recambios||0) + Number(r.coste_taller||0) + costeConsumo(r);

/* Al guardar una intervención: reinicia el plan y crea el gasto */
FORM_EXTRA.push({
  html: () => "",
  mount(t){
    if (t !== "intervenciones") return;
    const sel = $("#f_maquina"), plan = $("#f_plan"), hor = $("#f_horometro");
    const filtrar = () => { for (const o of plan.options) if (o.value) { const p = DB.planes.find(x=>x.id===o.value); o.hidden = sel.value && p?.maquina !== sel.value; } };
    sel?.addEventListener("change", () => { filtrar(); if (hor && !hor.value && sel.value) hor.placeholder = `Estimado: ${fnum(horasMaquina(sel.value))} h`; });
    plan?.addEventListener("change", () => { const p = DB.planes.find(x=>x.id===plan.value); if (!p) return; if (!sel.value) sel.value = p.maquina; const d = $("#f_descripcion"); if (d && !d.value) d.value = p.tarea + (p.recambios ? `. ${p.recambios}` : ""); const tp = $("#f_tipo"); if (tp) tp.value = /ITV|ITEAF|Seguro/.test(p.tarea) ? "Revisión, ITV o ITEAF" : "Mantenimiento preventivo"; });
    filtrar();
  },
  collect(t, rec){
    if (t !== "intervenciones") return;
    const p = DB.planes.find(x=>x.id===rec.plan);
    if (p && (!p.ultima_fecha || rec.fecha >= p.ultima_fecha)) { p.ultima_fecha = rec.fecha; p.ultima_horas = rec.horometro!=="" && rec.horometro!=null ? Number(rec.horometro) : Math.round(horasMaquina(rec.maquina)*10)/10; p._u = now(); }
    if (/ITV/.test(p?.tarea||"")) { const m = DB.maquinaria.find(x=>x.id===rec.maquina); const n = proximaMant(p).fecha; if (m && n) { m.itv = n; m._u = now(); } }
    const ex = DB.economia.find(e=>e.interv===rec.id), imp = Number(rec.coste_recambios||0) + Number(rec.coste_taller||0);
    if (rec.gasto && imp) { const e = {...(ex||{id:uid()}), fecha:rec.fecha, tipo:"Gasto", modulo:"General", categoria:"Maquinaria", concepto:`${rec.tipo}: ${refName("maquinaria", rec.maquina)}${rec.factura?" ("+rec.factura+")":""}`, importe:imp, interv:rec.id, _u:now()};
      if (ex) DB.economia = DB.economia.map(x=>x.id===ex.id?e:x); else DB.economia.push(e); }
    else if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); }
  },
  remove(t, rec){ if (t==="intervenciones" && rec) { const ex = DB.economia.find(e=>e.interv===rec.id); if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); } } }
});

/* ---- Panel de estado ---- */
UI.tallerY = UI.tallerY || String(new Date().getFullYear());
TABS.estado = {title: "Estado", render(){
  if (!DB.maquinaria.length) return `<div class="empty">Da de alta tus máquinas para llevar su mantenimiento. <br><br><button class="btn primary" data-new="maquinaria">+ Añadir máquina</button></div>`;
  const y = UI.tallerY;
  return `<div class="toolbar"><select id="tallerY" aria-label="Año" style="width:auto">${years().map(v=>`<option ${v===y?"selected":""}>${v}</option>`).join("")}</select>
    <span class="grow"></span><button class="btn" data-new="planes">+ Mantenimiento programado</button><button class="btn primary" data-new="intervenciones">+ Registrar intervención</button></div>
  <div class="taller-grid">${DB.maquinaria.map(m => {
    const h = horasMaquina(m.id), planes = DB.planes.filter(p=>p.maquina===m.id).map(p=>({p, x:proximaMant(p)})).sort((a,b)=>b.x.pct-a.x.pct);
    const iv = DB.intervenciones.filter(i=>i.maquina===m.id), ivY = iv.filter(i=>(i.fecha||"").startsWith(y));
    const coste = ivY.reduce((s,i)=>s+costeInterv(i),0), hY = DB.partes.filter(p=>p.maquina===m.id&&(p.fecha||"").startsWith(y)).reduce((s,p)=>s+horasMaq(p),0);
    const averias = ivY.filter(i=>/Avería|Reparación/.test(i.tipo)).length, parada = ivY.reduce((s,i)=>s+Number(i.dias_parada||0),0);
    const peor = planes.find(z=>z.x.lv==="crit") ? "crit" : planes.find(z=>z.x.lv==="warn") ? "warn" : "ok";
    const itv = m.itv ? daysBetween(today(), m.itv) : null;
    return `<section class="panel taller-card">
      <div class="head"><div><h3>${esc(m.nombre)}</h3><p style="font-size:.85rem">${esc([m.tipo, m.marca, m.matricula].filter(Boolean).join(" · "))}</p></div><span class="pill ${peor}">${peor==="crit"?"Mantenimiento vencido":peor==="warn"?"Toca pronto":"Al día"}</span></div>
      <dl class="kv"><dt>Horómetro</dt><dd><strong>${fnum(Math.round(h*10)/10)} h</strong></dd><dt>Horas en ${y}</dt><dd>${fnum(hY)} h</dd>
        <dt>Coste de taller ${y}</dt><dd>${eur.format(coste)}${hY&&coste?` · ${eur.format(coste/hY)}/h`:""}</dd><dt>Averías ${y}</dt><dd>${averias}${parada?` · ${parada} días parada`:""}</dd>
        ${TALLER_EXTRA.map(f=>f(m, y)).join("")}
        ${m.itv?`<dt>ITV / ITEAF</dt><dd><span class="pill ${itv<0?"crit":itv<=30?"warn":"ok"}">${fdate(m.itv)}</span></dd>`:""}</dl>
      ${planes.length ? `<div class="mant-list">${planes.map(({p,x})=>`<button class="mant" data-edit="planes" data-id="${p.id}"><span class="mant-t">${esc(p.tarea)}</span><span class="track"><span class="fill ${x.lv}" style="width:${Math.round(x.pct*100)}%"></span></span><small class="${x.lv==="crit"?"crit-t":x.lv==="warn"?"warn-t":"muted"}">${esc(x.txt||"Sin frecuencia")}</small></button>`).join("")}</div>` : `<p class="muted" style="margin:0">Sin mantenimientos programados.</p>`}
      <div class="toolbar"><button class="btn" data-act="mant-nuevo" data-id="${m.id}">+ Programar</button><button class="btn" data-act="interv-nueva" data-id="${m.id}">+ Intervención</button><button class="btn" data-act="hist-pdf" data-id="${m.id}">Historial PDF</button></div>
      ${iv.length?`<details><summary class="muted" style="cursor:pointer">Últimas intervenciones (${iv.length})</summary><ul class="alerts" style="margin-top:6px">${iv.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).slice(0,5).map(i=>`<li data-edit="intervenciones" data-id="${i.id}" style="cursor:pointer" class="${/Avería|Reparación/.test(i.tipo)?"crit":""}"><div><strong>${esc(i.descripcion||i.tipo)}</strong><small>${esc(i.tipo)}${i.horometro?` · ${fnum(i.horometro)} h`:""}${costeInterv(i)?` · ${eur.format(costeInterv(i))}`:""}</small></div><span class="when">${fdate(i.fecha)}</span></li>`).join("")}</ul></details>`:""}
    </section>`; }).join("")}</div>`;
}};
document.addEventListener("change", e => { if (e.target.id === "tallerY") { UI.tallerY = e.target.value; render(); } });
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, set = (k, v) => { const f = $(`#f_${k}`); if (f) { f.value = v; f.dispatchEvent(new Event("change")); } };
  if (a === "mant-nuevo") { openForm("planes"); set("maquina", el.dataset.id); set("ultima_horas", Math.round(horasMaquina(el.dataset.id))); set("ultima_fecha", today()); }
  else if (a === "interv-nueva") { openForm("intervenciones"); set("maquina", el.dataset.id); }
  else if (a === "hist-pdf") pdfHistorial(el.dataset.id);
});

/* ---- Avisos y calendario ---- */
ALERTS.push(() => DB.planes.flatMap(p => { const x = proximaMant(p); if (x.lv !== "crit" && x.lv !== "warn") return [];
  return [{lv:x.lv, t:`${refName("maquinaria", p.maquina)}: ${p.tarea}`, s:x.txt, d:x.fecha||"", mod:"taller", tab:"estado"}]; }));
{ const _ev = eventosAuto;
  eventosAuto = (desde, hasta) => { const E = _ev(desde, hasta);
    for (const p of DB.planes) { const x = proximaMant(p); if (x.fecha && x.fecha >= desde && x.fecha <= hasta) E.push({d:x.fecha, c:"var(--taller)", t:`${p.tarea}: ${refName("maquinaria", p.maquina)}`, go:["taller","estado"]}); }
    for (const i of DB.intervenciones) if (i.fecha >= desde && i.fecha <= hasta) E.push({d:i.fecha, c:"var(--muted)", t:`Taller: ${refName("maquinaria", i.maquina)} · ${i.descripcion||i.tipo}`, done:1, edit:["intervenciones", i.id]});
    return E; }; }

/* ---- PDF: historial de mantenimiento ---- */
function pdfHistorial(id){
  if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const ms = id ? DB.maquinaria.filter(m=>m.id===id) : DB.maquinaria;
  const {jsPDF} = window.jspdf, doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51];
  ms.forEach((m, n) => {
    if (n) doc.addPage();
    doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...verde); doc.text(`Historial de mantenimiento · ${m.nombre}`, 14, 18);
    doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(60);
    doc.text([m.tipo, m.marca, m.matricula && `Matrícula ${m.matricula}`, m.roma && `ROMA ${m.roma}`, `Horómetro ${fnum(Math.round(horasMaquina(m.id)))} h`, T.nombre].filter(Boolean).join(" · "), 14, 25);
    doc.autoTable({startY:30, head:[["Mantenimiento programado","Frecuencia","Última vez","Próxima","Estado"]],
      body: DB.planes.filter(p=>p.maquina===m.id).map(p=>{const x=proximaMant(p);return [p.tarea, [p.cada_horas&&`${fnum(p.cada_horas)} h`, p.cada_meses&&`${fnum(p.cada_meses)} meses`].filter(Boolean).join(" o "), [fdate(p.ultima_fecha), p.ultima_horas!=null&&p.ultima_horas!==""?`${fnum(p.ultima_horas)} h`:""].filter(Boolean).join(" · "), x.txt, x.estado];}),
      theme:"grid", styles:{fontSize:8, cellPadding:1.4}, headStyles:{fillColor:verde}, margin:{left:14, right:14}});
    const iv = DB.intervenciones.filter(i=>i.maquina===m.id).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""));
    doc.autoTable({startY:doc.lastAutoTable.finalY+6, head:[["Fecha","Tipo","Trabajo realizado o avería","Horómetro","Taller","Recambios","Taller €","Total","Factura","Días parada"]],
      body: iv.length ? iv.map(i=>[fdate(i.fecha), i.tipo, i.descripcion||"", i.horometro?fnum(i.horometro):"", i.taller||"Propio", i.coste_recambios?eur.format(i.coste_recambios):"", i.coste_taller?eur.format(i.coste_taller):"", eur.format(costeInterv(i)), i.factura||"", i.dias_parada||""]) : [[{content:"Sin intervenciones registradas", colSpan:10, styles:{halign:"center"}}]],
      foot: iv.length ? [["","","","","","","Total", eur.format(iv.reduce((s,i)=>s+costeInterv(i),0)),"",""]] : undefined,
      theme:"grid", styles:{fontSize:8, cellPadding:1.4}, headStyles:{fillColor:verde}, footStyles:{fillColor:[233,237,226], textColor:20}, columnStyles:{2:{cellWidth:70}}, margin:{left:14, right:14}});
  });
  for (let i=1;i<=doc.getNumberOfPages();i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Emitido el ${fdate(today())} · Página ${i} de ${doc.getNumberOfPages()}`, 283, 203, {align:"right"}); }
  try { doc.save(`mantenimiento-${id ? (ms[0]?.nombre||"maquina").replace(/\W+/g,"-") : "maquinaria"}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}
INFORMES.mantenimiento = {t:"Historial de mantenimiento de la maquinaria", s:"Planes, intervenciones, averías y costes de cada máquina", c:"var(--taller)", secs:[]};
{ const _g = generarPDF; generarPDF = k => k === "mantenimiento" ? pdfHistorial(null) : _g(k); }

SEEDS.push((d, add, D) => {
  const tr = d.maquinaria.find(m=>m.tipo==="Tractor"), pu = d.maquinaria.find(m=>m.tipo==="Pulverizador");
  if (!tr) return;
  const pAceite = add("planes", {maquina:tr.id, tarea:"Cambio de aceite del motor", cada_horas:250, cada_meses:12, ultima_fecha:D(-200), ultima_horas:4100, aviso_horas:20, aviso_dias:15, recambios:"14 L aceite 15W40, filtro de aceite"});
  add("planes", {maquina:tr.id, tarea:"Engrase", cada_horas:50, ultima_fecha:D(-40), ultima_horas:4180, aviso_horas:20, aviso_dias:7});
  add("planes", {maquina:tr.id, tarea:"Filtro de aire", cada_horas:500, cada_meses:24, ultima_fecha:D(-380), ultima_horas:3900, aviso_horas:20, aviso_dias:15});
  if (pu) { add("planes", {maquina:pu.id, tarea:"Inspección ITEAF del equipo de tratamiento", cada_meses:36, ultima_fecha:D(-800), aviso_dias:60});
    add("planes", {maquina:pu.id, tarea:"Revisión del pulverizador (boquillas, filtros, manómetro)", cada_meses:12, ultima_fecha:D(-340), aviso_dias:30}); }
  add("intervenciones", {fecha:D(-200), maquina:tr.id, tipo:"Mantenimiento preventivo", plan:pAceite, horometro:4100, descripcion:"Cambio de aceite y filtro", coste_recambios:96, factura:"", gasto:false});
  add("intervenciones", {fecha:D(-95), maquina:tr.id, tipo:"Avería", horometro:4160, descripcion:"Fuga en latiguillo hidráulico del elevador", taller:"Talleres del pueblo", horas_mo:2, coste_recambios:38, coste_taller:70, factura:"T-552", dias_parada:2, gasto:false});
});
