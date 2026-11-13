/* ============ Agenda: recordatorios, calendario y notificaciones ============ */
const REPET = {"No se repite":0, "Cada semana":"7d", "Cada mes":"1m", "Cada 3 meses":"3m", "Cada 6 meses":"6m", "Cada año":"12m"};
S.recordatorios = {title: "Recordatorios", one: "recordatorio", label: r => r.titulo, help: "Vacunas, saneamientos, tratamientos de varroa, labores... Te avisa en el inicio y, si lo activas, con notificaciones.", fields: [
  {k:"titulo", l:"Qué hay que hacer", req:1}, {k:"fecha", l:"Fecha", t:"date", req:1, def:today},
  {k:"hora", l:"Hora", t:"sel", o:Array.from({length:17},(_,i)=>`${String(i+6).padStart(2,"0")}:00`), def:"09:00"},
  {k:"tipo", l:"Tipo", t:"sel", o:["Vacunación","Saneamiento","Desparasitación","Tratamiento varroa","Revisión de colmenas","Labor","Tratamiento fitosanitario","Papeleo (PAC, REGA...)","ITV o mantenimiento","Otro"]},
  {k:"modulo", l:"Actividad", t:"sel", o:["General","Agrícola","Ganadero","Apícola"], def:"General"},
  {k:"repetir", l:"Repetir", t:"sel", o:Object.keys(REPET), def:"No se repite"},
  {k:"antes", l:"Avisar con antelación (días)", t:"num", def:1},
  {k:"hecho", l:"Hecho", t:"chk", help:"En los que se repiten, marca hecho y pasa a la siguiente fecha"},
  {k:"notas", l:"Notas", t:"area"}],
  cols: [{l:"Próxima fecha", f:r=>fdate(proxima(r)), pill:r=>{const p=proxima(r); if(!p) return "ok"; return p<today()?"crit":daysBetween(today(),p)<=Number(r.antes||0)?"warn":"";}}, "hora", "titulo", "tipo", "modulo", "repetir",
    {l:"Estado", f:r=>!proxima(r)?"Hecho":proxima(r)<today()?"Atrasado":"Pendiente", pill:r=>!proxima(r)?"ok":proxima(r)<today()?"crit":""}]};
MODS.agenda.tables = ["calendario","recordatorios"];

function sumPeriod(d, p, k=1){ const x = new Date(d+"T12:00:00"); if (p.endsWith("d")) x.setDate(x.getDate()+parseInt(p)*k); else x.setMonth(x.getMonth()+parseInt(p)*k); return x.toISOString().slice(0,10); }
/* Próxima fecha pendiente: para los que se repiten, "hecho" avanza la fecha al guardar */
function proxima(r){ if (r.hecho && !REPET[r.repetir]) return ""; return r.fecha; }
/* Fechas de un recordatorio dentro de un rango */
function ocurrencias(r, desde, hasta){
  const out = []; const p = REPET[r.repetir];
  if (r.hecho && !p) return out;
  let d = r.fecha, i = 0;
  while (d && d <= hasta && i < 400) { if (d >= desde) out.push(d); if (!p) break; i++; d = sumPeriod(r.fecha, p, i); }
  return out;
}
FORM_EXTRA.push({ html:()=>"", collect(t, rec){ if (t==="recordatorios" && rec.hecho && REPET[rec.repetir]) { let d = rec.fecha; const h = today(); do { d = sumPeriod(d, REPET[rec.repetir]); } while (d < h); rec.fecha = d; rec.hecho = false; } } });

ALERTS.push(() => DB.recordatorios.filter(r=>proxima(r)).flatMap(r => {
  const p = proxima(r), dd = daysBetween(today(), p);
  if (dd < 0) return [{lv:"crit", t:r.titulo, s:`Recordatorio atrasado ${-dd} día${dd===-1?"":"s"}`, d:p, mod:"agenda", tab:"recordatorios"}];
  if (dd <= Math.max(Number(r.antes||0), 0)) return [{lv:"warn", t:r.titulo, s: dd===0?`Hoy a las ${r.hora||""}`:`Dentro de ${dd} día${dd===1?"":"s"}`, d:p, mod:"agenda", tab:"recordatorios"}];
  return [];
}));

/* Eventos automáticos que salen de otros registros */
function eventosAuto(desde, hasta){
  const E = []; const inR = d => d && d >= desde && d <= hasta;
  for (const r of DB.fitosanitarios) if (r.plazo) { const d = addDays(r.fecha, r.plazo); if (inR(d)) E.push({d, c:"var(--agri)", t:`Fin plazo de seguridad: ${refName("parcelas", r.parcela)}`, go:["agri","fitosanitarios"]}); }
  for (const r of DB.veterinarios) for (const [k,n] of [["sup_carne","carne"],["sup_leche","leche"]]) if (r[k]!==""&&r[k]!=null) { const d = addDays(r.fecha, Number(r.duracion||1)-1+Number(r[k])); if (inR(d)) E.push({d, c:"var(--gan)", t:`Fin espera ${n}: ${r.animal}`, go:["gan","veterinarios"]}); }
  for (const r of DB.apitratamientos) if (r.retirada && !r.retirado && inR(r.retirada)) E.push({d:r.retirada, c:"var(--api)", t:`Retirar tratamiento: ${refName("apiarios", r.apiario)}`, go:["api","apitratamientos"]});
  for (const p of DB.productos||[]) if (p.caducidad && inR(p.caducidad)) E.push({d:p.caducidad, c:"var(--alm)", t:`Caduca ${p.nombre}`, go:["alm","productos"]});
  for (const t of ["labores","fitosanitarios","veterinarios","revisiones","apitratamientos","cosechas","producciones"]) for (const r of DB[t]) if (inR(r.fecha)) E.push({d:r.fecha, c:"var(--muted)", t:`${S[t].one[0].toUpperCase()+S[t].one.slice(1)}: ${S[t].label(r)}`, done:1, edit:[t, r.id]});
  return E;
}
UI.cal = UI.cal || today().slice(0,7);
TABS.calendario = {title: "Calendario", render(){
  const [y, m] = UI.cal.split("-").map(Number);
  const first = new Date(y, m-1, 1), dim = new Date(y, m, 0).getDate(), off = (first.getDay()+6)%7;
  const desde = `${UI.cal}-01`, hasta = `${UI.cal}-${String(dim).padStart(2,"0")}`;
  const ev = {};
  for (const r of DB.recordatorios) for (const d of ocurrencias(r, desde, hasta)) (ev[d] = ev[d]||[]).push({d, c:"var(--agenda)", t:`${r.hora||""} ${r.titulo}`, edit:["recordatorios", r.id], rem:1});
  for (const e of eventosAuto(desde, hasta)) (ev[e.d] = ev[e.d]||[]).push(e);
  const sel = UI.calDay && UI.calDay.startsWith(UI.cal) ? UI.calDay : (today().startsWith(UI.cal) ? today() : desde);
  const cells = [];
  for (let i=0;i<off;i++) cells.push(`<div class="cal-c out"></div>`);
  for (let d=1; d<=dim; d++) { const k = `${UI.cal}-${String(d).padStart(2,"0")}`, es = ev[k]||[];
    cells.push(`<button class="cal-c ${k===today()?"hoy":""} ${k===sel?"sel":""}" data-act="cal-day" data-d="${k}"><span class="cal-n">${d}</span><span class="cal-dots">${es.slice(0,4).map(e=>`<i style="background:${e.c}"></i>`).join("")}${es.length>4?`<small>+${es.length-4}</small>`:""}</span><span class="cal-t">${es.filter(e=>!e.done).slice(0,2).map(e=>`<span style="border-left-color:${e.c}">${esc(e.t)}</span>`).join("")}</span></button>`); }
  const lista = (ev[sel]||[]);
  const mes = first.toLocaleDateString("es-ES",{month:"long"}).replace(/^./, c=>c.toUpperCase()) + " " + y;
  return `<div class="toolbar"><button class="btn" data-act="cal-mv" data-n="-1" aria-label="Mes anterior">‹</button><h2 style="min-width:150px;text-align:center">${mes}</h2><button class="btn" data-act="cal-mv" data-n="1" aria-label="Mes siguiente">›</button><button class="btn" data-act="cal-hoy">Hoy</button>
    <span class="grow"></span><button class="btn" data-act="notif">${notifState()}</button><button class="btn" data-act="ics" title="Para que tu móvil te avise aunque la app esté cerrada">Añadir al calendario del móvil</button><button class="btn primary" data-new="recordatorios">+ Recordatorio</button></div>
  <div class="cal">${["L","M","X","J","V","S","D"].map(d=>`<div class="cal-h">${d}</div>`).join("")}${cells.join("")}</div>
  <section class="panel"><h3>${new Date(sel+"T12:00:00").toLocaleDateString("es-ES",{weekday:"long", day:"numeric", month:"long"})}</h3>
  ${lista.length?`<ul class="alerts">${lista.map(e=>`<li ${e.edit?`data-edit="${e.edit[0]}" data-id="${e.edit[1]}"`:`data-go="${e.go[0]}" data-tab="${e.go[1]}"`} style="cursor:pointer;border-left-color:${e.c}"><div><strong>${esc(e.t)}</strong><small>${e.rem?"Recordatorio":e.done?"Registrado":"Aviso automático"}</small></div></li>`).join("")}</ul>`:`<p class="muted">Nada este día. <button class="btn" data-act="cal-new" data-d="${sel}">+ Recordatorio para este día</button></p>`}</section>`;
}};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "cal-mv") { const [y,m] = UI.cal.split("-").map(Number); const d = new Date(y, m-1+Number(el.dataset.n), 1); UI.cal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; render(); }
  else if (a === "cal-hoy") { UI.cal = today().slice(0,7); UI.calDay = today(); render(); }
  else if (a === "cal-day") { UI.calDay = el.dataset.d; render(); }
  else if (a === "cal-new") { openForm("recordatorios"); const f = $("#f_fecha"); if (f) f.value = el.dataset.d; }
  else if (a === "ics") icsExport();
  else if (a === "notif") activarNotif();
});

/* ---- Notificaciones (cuando la app está abierta o en segundo plano reciente) ---- */
function notifState(){ if (!("Notification" in window)) return "Notificaciones no disponibles"; return Notification.permission === "granted" ? "Notificaciones activadas" : "Activar notificaciones"; }
async function activarNotif(){
  if (!("Notification" in window)) return toast("Este navegador no permite notificaciones. Usa «Añadir al calendario del móvil».");
  try { const p = await Notification.requestPermission(); toast(p === "granted" ? "Notificaciones activadas" : "No se han permitido las notificaciones"); } catch(e) { toast("Este navegador no permite notificaciones aquí."); }
  render(); comprobarAvisos();
}
async function notificar(titulo, cuerpo, tag){
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(titulo, {body:cuerpo, tag, icon:"icon.svg", badge:"icon.svg"}); } catch(e) {}
  try { new Notification(titulo, {body:cuerpo, tag}); } catch(e) {}
}
function comprobarAvisos(){
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  let sent = {}; try { sent = JSON.parse(localStorage.getItem("mi-explotacion-notif")||"{}"); } catch(e) {}
  const h = today(), hora = new Date().toTimeString().slice(0,5);
  for (const a of alertas()) {
    if (a.lv !== "crit" && a.lv !== "warn") continue;
    const key = `${a.t}|${a.d}|${h}`; if (sent[key]) continue;
    const r = DB.recordatorios.find(x=>x.titulo===a.t && proxima(x)===a.d);
    if (r && r.fecha === h && r.hora && r.hora > hora) continue;
    notificar(a.t, a.s, key); sent[key] = 1;
  }
  for (const k in sent) if (!k.endsWith(h)) delete sent[k];
  try { localStorage.setItem("mi-explotacion-notif", JSON.stringify(sent)); } catch(e) {}
}
setInterval(comprobarAvisos, 15*60*1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") comprobarAvisos(); });

/* ---- Exportación .ics: el calendario del móvil avisa aunque la app esté cerrada ---- */
function icsExport(){
  const z = s => String(s||"").replace(/[\\;,]/g, m=>"\\"+m).replace(/\n/g,"\\n");
  const dt = (d, h) => d.replace(/-/g,"") + "T" + (h||"09:00").replace(":","") + "00";
  const rr = {"7d":"FREQ=WEEKLY", "1m":"FREQ=MONTHLY", "3m":"FREQ=MONTHLY;INTERVAL=3", "6m":"FREQ=MONTHLY;INTERVAL=6", "12m":"FREQ=YEARLY"};
  const L = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Mi Explotacion//ES","CALSCALE:GREGORIAN","X-WR-CALNAME:Mi Explotación"];
  const stamp = new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z";
  for (const r of DB.recordatorios) { if (!proxima(r)) continue; const h = r.hora||"09:00"; const end = `${String(Math.min(23, Number(h.slice(0,2))+1)).padStart(2,"0")}:${h.slice(3)}`;
    L.push("BEGIN:VEVENT", `UID:${r.id}@mi-explotacion`, `DTSTAMP:${stamp}`, `DTSTART:${dt(proxima(r), h)}`, `DTEND:${dt(proxima(r), end)}`, `SUMMARY:${z(r.titulo)}`, `DESCRIPTION:${z([r.tipo, r.notas].filter(Boolean).join(" · "))}`);
    if (REPET[r.repetir]) L.push(`RRULE:${rr[REPET[r.repetir]]}`);
    L.push("BEGIN:VALARM","ACTION:DISPLAY",`DESCRIPTION:${z(r.titulo)}`,`TRIGGER:-P${Math.max(0, Number(r.antes||0))}D`,"END:VALARM","END:VEVENT"); }
  // Fin de plazos y retiradas futuras como eventos de día completo
  for (const e of eventosAuto(today(), addDays(today(), 365))) if (!e.done) L.push("BEGIN:VEVENT", `UID:${e.d}-${z(e.t).slice(0,40).replace(/\W/g,"")}@mi-explotacion`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${e.d.replace(/-/g,"")}`, `SUMMARY:${z(e.t)}`, "END:VEVENT");
  L.push("END:VCALENDAR");
  download(`mi-explotacion-agenda.ics`, L.join("\r\n"), "text/calendar");
  toast("Abre el archivo descargado para añadirlo a tu calendario");
}

SEEDS.push((d, add, D) => {
  add("recordatorios", {titulo:"Vacuna de la enterotoxemia (ovino)", fecha:D(5), hora:"09:00", tipo:"Vacunación", modulo:"Ganadero", repetir:"Cada 6 meses", antes:3});
  add("recordatorios", {titulo:"Saneamiento ganadero con la ADS", fecha:D(24), hora:"10:00", tipo:"Saneamiento", modulo:"Ganadero", repetir:"Cada año", antes:7});
  add("recordatorios", {titulo:"Control de caída de varroa", fecha:D(1), hora:"11:00", tipo:"Tratamiento varroa", modulo:"Apícola", repetir:"Cada mes", antes:1});
  add("recordatorios", {titulo:"Abonado de cobertera en La Hoya", fecha:D(60), hora:"08:00", tipo:"Labor", modulo:"Agrícola", repetir:"No se repite", antes:3});
});
