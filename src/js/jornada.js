/* ============ Registro de jornada y horas para nóminas (a partir de los partes) ============ */
MODS.partes.tables = ["partes","jornada","trabajadores","maquinaria"];
UI.jMes = UI.jMes || today().slice(0,7);
UI.jTrab = UI.jTrab || "";
const jornadaDia = () => Number(DB._meta.jornada?.horas ?? 8);

/* Días trabajados de una persona en un mes: entrada, salida, descanso, horas y extras */
function diasJornada(tid, mes){
  const P = DB.partes.filter(p=>p.trabajador===tid && (p.fecha||"").startsWith(mes));
  const dias = {};
  for (const p of P) { const d = dias[p.fecha] = dias[p.fecha] || {fecha:p.fecha, ent:"", sal:"", desc:0, horas:0, tareas:[], partes:[]};
    if (p.inicio && (!d.ent || p.inicio < d.ent)) d.ent = p.inicio; if (p.fin && (!d.sal || p.fin > d.sal)) d.sal = p.fin;
    d.desc += Number(p.descanso||0); d.horas += horasParte(p); d.tareas.push(p.tarea); d.partes.push(p); }
  const J = jornadaDia();
  return Object.values(dias).sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(d => ({...d, ord:Math.min(d.horas, J), extra:Math.max(0, d.horas - J), tareas:[...new Set(d.tareas)].filter(Boolean)}));
}
function resumenMes(mes){
  return DB.trabajadores.map(w => { const D = diasJornada(w.id, mes); const h = D.reduce((s,d)=>s+d.horas,0), o = D.reduce((s,d)=>s+d.ord,0), x = D.reduce((s,d)=>s+d.extra,0);
    return {w, dias:D.length, h, o, x, coste:h*Number(w.coste_hora||0)}; }).filter(r => r.dias || r.w.activo);
}
TABS.jornada = {title: "Jornada", render(){
  const ws = DB.trabajadores; if (!ws.length) return `<div class="empty">Da de alta a tus trabajadores para llevar su registro de jornada. <br><br><button class="btn primary" data-new="trabajadores">+ Añadir trabajador</button></div>`;
  if (!ws.some(w=>w.id===UI.jTrab)) UI.jTrab = (ws.find(w=>w.activo && w.tipo!=="Titular") || ws[0]).id;
  const R = resumenMes(UI.jMes), D = diasJornada(UI.jTrab, UI.jMes), w = ws.find(x=>x.id===UI.jTrab);
  const mesTxt = new Date(UI.jMes+"-15").toLocaleDateString("es-ES",{month:"long", year:"numeric"});
  return `<div class="toolbar"><label for="jMes" class="muted">Mes</label><input type="month" id="jMes" value="${UI.jMes}" style="width:auto">
    <label for="jHoras" class="muted">Jornada ordinaria</label><input type="number" id="jHoras" value="${jornadaDia()}" step="0.5" min="1" style="width:80px" aria-label="Horas de jornada ordinaria al día"><span class="muted">h/día</span>
    <span class="grow"></span><button class="btn" data-act="nom-pdf">Resumen para nóminas (PDF)</button><button class="btn" data-act="nom-csv">Exportar CSV</button></div>
  <section class="panel"><h3>Resumen de ${esc(mesTxt)}</h3><div class="table-wrap"><table><thead><tr><th>Trabajador</th><th>Relación</th><th>Días</th><th>Horas</th><th>Ordinarias</th><th>Extra</th><th>€/hora</th><th>Coste</th></tr></thead><tbody>
    ${R.map(r=>`<tr data-act="j-trab" data-id="${r.w.id}" ${r.w.id===UI.jTrab?'style="background:var(--surface-2)"':""}><td><strong>${esc(r.w.nombre)}</strong></td><td>${esc(r.w.tipo||"")}</td><td class="num">${r.dias}</td><td class="num">${fnum(r.h)}</td><td class="num">${fnum(r.o)}</td><td class="num">${r.x?`<span class="pill warn">${fnum(r.x)}</span>`:"0"}</td><td class="num">${r.w.coste_hora?eur.format(r.w.coste_hora):""}</td><td class="num">${eur.format(r.coste)}</td></tr>`).join("")}
  </tbody></table></div></section>
  <section class="panel"><div class="head"><h3>Registro de jornada · ${esc(w.nombre)}</h3><button class="btn primary" data-act="jor-pdf">Registro de jornada (PDF)</button></div>
    ${D.length ? `<div class="table-wrap"><table><thead><tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Descanso</th><th>Horas</th><th>Extra</th><th>Tareas</th></tr></thead><tbody>
      ${D.map(d=>`<tr data-edit="partes" data-id="${d.partes[0].id}"><td>${new Date(d.fecha+"T12:00").toLocaleDateString("es-ES",{weekday:"short", day:"numeric"})}</td><td>${d.ent||"—"}</td><td>${d.sal||"—"}</td><td class="num">${d.desc?d.desc+" min":""}</td><td class="num">${fnum(d.horas)}</td><td class="num">${d.extra?fnum(d.extra):""}</td><td class="wrap-cell">${esc(d.tareas.join(", "))}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">Sin partes este mes. El registro se rellena solo con los partes de trabajo (hora de inicio, fin y descanso).</p>`}
    <p class="muted" style="font-size:.82rem;margin:0">El registro diario de jornada es obligatorio (art. 34.9 del Estatuto de los Trabajadores) y debe conservarse 4 años. Las horas extra se calculan sobre la jornada ordinaria diaria; revisa tu convenio del campo.</p></section>`;
}};
document.addEventListener("change", e => {
  if (e.target.id === "jMes" && e.target.value) { UI.jMes = e.target.value; render(); }
  if (e.target.id === "jHoras") { const v = Number(e.target.value); if (v > 0) { DB._meta.jornada = {horas:v}; DB._meta.titular_u = now(); save(); render(); } }
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "j-trab") { UI.jTrab = el.dataset.id; render(); }
  else if (a === "jor-pdf") pdfJornada(UI.jTrab, UI.jMes);
  else if (a === "nom-pdf") pdfNominas(UI.jMes);
  else if (a === "nom-csv") { const R = resumenMes(UI.jMes); const L = [["Trabajador","NIF","Relación","Días","Horas","Ordinarias","Extra","Euros/hora","Coste"].join(";"), ...R.map(r=>[r.w.nombre, r.w.nif||"", r.w.tipo||"", r.dias, fnum(r.h), fnum(r.o), fnum(r.x), fnum(r.w.coste_hora||0), fnum(Math.round(r.coste*100)/100)].join(";"))]; download(`horas-${UI.jMes}.csv`, "﻿"+L.join("\r\n"), "text/csv;charset=utf-8"); }
});
function pdfJornada(tid, mes){
  if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const w = DB.trabajadores.find(x=>x.id===tid); if (!w) return;
  const {jsPDF} = window.jspdf, doc = new jsPDF({unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51], D = diasJornada(tid, mes);
  const mesTxt = new Date(mes+"-15").toLocaleDateString("es-ES",{month:"long", year:"numeric"});
  doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...verde); doc.text("Registro diario de jornada", 14, 18);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(40);
  doc.autoTable({startY:23, body:[["Empresa", `${T.nombre||""}${T.nif?" · NIF "+T.nif:""}`], ["Trabajador", `${w.nombre}${w.nif?" · "+w.nif:""}`], ["Mes", mesTxt], ["Jornada ordinaria", `${fnum(jornadaDia())} h/día`]], theme:"plain", styles:{fontSize:9.5, cellPadding:1}, columnStyles:{0:{fontStyle:"bold", cellWidth:40}}});
  const dim = new Date(Number(mes.slice(0,4)), Number(mes.slice(5,7)), 0).getDate(), byF = Object.fromEntries(D.map(d=>[d.fecha, d]));
  const body = []; for (let i=1;i<=dim;i++){ const f = `${mes}-${String(i).padStart(2,"0")}`, d = byF[f]; body.push([new Date(f+"T12:00").toLocaleDateString("es-ES",{weekday:"short", day:"2-digit"}), d?.ent||"", d?.sal||"", d?.desc?`${d.desc} min`:"", d?fnum(d.horas):"", d?.extra?fnum(d.extra):"", ""]); }
  doc.autoTable({startY:doc.lastAutoTable.finalY+3, head:[["Día","Entrada","Salida","Descanso","Horas","Extra","Firma"]], body, theme:"grid", styles:{fontSize:8, cellPadding:1.1, minCellHeight:5.6}, headStyles:{fillColor:verde}, columnStyles:{6:{cellWidth:45}}, margin:{left:14, right:14},
    foot:[["Total", "", "", "", fnum(D.reduce((s,d)=>s+d.horas,0)), fnum(D.reduce((s,d)=>s+d.extra,0)), ""]], footStyles:{fillColor:[233,237,226], textColor:20}});
  const y = Math.min(doc.lastAutoTable.finalY + 14, 280);
  doc.setFontSize(9); doc.text("Firma del trabajador", 14, y); doc.text("Firma de la empresa", 110, y); doc.line(14, y+12, 90, y+12); doc.line(110, y+12, 186, y+12);
  try { doc.save(`jornada-${w.nombre.replace(/\W+/g,"-")}-${mes}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}
function pdfNominas(mes){
  if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const {jsPDF} = window.jspdf, doc = new jsPDF({unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51], R = resumenMes(mes);
  const mesTxt = new Date(mes+"-15").toLocaleDateString("es-ES",{month:"long", year:"numeric"});
  doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...verde); doc.text(`Horas para nóminas · ${mesTxt}`, 14, 18);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(60); doc.text([T.nombre, T.nif&&`NIF ${T.nif}`, `Jornada ordinaria ${fnum(jornadaDia())} h/día`].filter(Boolean).join(" · "), 14, 25);
  doc.autoTable({startY:30, head:[["Trabajador","NIF","Relación","Días","Horas","Ordinarias","Extra","€/hora","Coste"]], body:R.map(r=>[r.w.nombre, r.w.nif||"", r.w.tipo||"", r.dias, fnum(r.h), fnum(r.o), fnum(r.x), r.w.coste_hora?eur.format(r.w.coste_hora):"", eur.format(r.coste)]),
    foot:[["Total","","", R.reduce((s,r)=>s+r.dias,0), fnum(R.reduce((s,r)=>s+r.h,0)), fnum(R.reduce((s,r)=>s+r.o,0)), fnum(R.reduce((s,r)=>s+r.x,0)), "", eur.format(R.reduce((s,r)=>s+r.coste,0))]],
    theme:"grid", styles:{fontSize:9}, headStyles:{fillColor:verde}, footStyles:{fillColor:[233,237,226], textColor:20}, margin:{left:14, right:14}});
  try { doc.save(`nominas-${mes}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}
