/* ============ Seguro agrario: pólizas y siniestros con fotos y ubicación para el perito ============ */
S.polizas = {title: "Pólizas", one: "póliza", label: r => `${r.linea||"Póliza"} ${r.numero||""}`.trim(), help: "Guarda tus seguros con sus fechas. Te avisa antes de que acaben las garantías y apunta la prima en Economía.", fields: [
  {k:"aseguradora", l:"Aseguradora o mediador", req:1}, {k:"numero", l:"Nº de póliza o declaración"},
  {k:"linea", l:"Línea de seguro", t:"sel", o:["Cultivos herbáceos extensivos","Olivar","Uva de vinificación","Frutos secos","Frutales","Hortalizas","Cultivos forrajeros","Explotaciones de ganado","Retirada de animales muertos","Apicultura","Tractores y maquinaria","Instalaciones","Responsabilidad civil","Otro"], req:1},
  {k:"modulo", l:"Módulo o garantías", help:"Ejemplo: módulo P, pedrisco e incendio"},
  {k:"campana", l:"Campaña", t:"num", def:() => new Date().getFullYear()},
  {k:"alta", l:"Fecha de contratación", t:"date", def:today}, {k:"inicio", l:"Inicio de garantías", t:"date"}, {k:"fin", l:"Fin de garantías", t:"date", req:1},
  {k:"capital", l:"Capital asegurado (€)", t:"num", step:"0.01"}, {k:"prima", l:"Lo que pagas tú (€)", t:"num", step:"0.01", help:"Ya descontadas las subvenciones de ENESA y de la comunidad"},
  {k:"subvencion", l:"Subvención descontada (€)", t:"num", step:"0.01"}, {k:"gasto", l:"Apuntar la prima como gasto en Economía", t:"chk", def:true},
  {k:"telefono", l:"Teléfono para siniestros"}, {k:"notas", l:"Notas", t:"area"}],
  cols: ["aseguradora","numero","linea","campana",{l:"Fin de garantías", f:r=>fdate(r.fin), pill:r=>!r.fin?"":r.fin<today()?"":daysBetween(today(),r.fin)<=30?"warn":"ok"},
    {l:"Parcelas", f:r=>(r.parcelas||[]).map(id=>refName("parcelas", id)).filter(Boolean).join(", "), wrap:1},
    {l:"Prima", f:r=>r.prima?eur.format(r.prima):"", num:1}, {l:"Estado", f:r=>!r.fin?"":r.fin<today()?"Vencida":r.inicio&&r.inicio>today()?"Aún no empieza":"En vigor", pill:r=>!r.fin?"":r.fin<today()?"":r.inicio&&r.inicio>today()?"warn":"ok"}]};
const RIESGOS = ["Pedrisco","Helada","Sequía","Viento","Lluvia torrencial o inundación","Incendio","Fauna silvestre","Enfermedad o plaga","Muerte o accidente de animales","Otro"];
S.siniestros = {title: "Siniestros", one: "siniestro", label: r => `${r.riesgo||"Siniestro"} ${fdate(r.fecha)}`, help: "Apunta el daño en cuanto lo veas, con fotos y la ubicación. Normalmente hay 7 días para comunicarlo a la aseguradora: revisa tus condiciones.", fields: [
  {k:"fecha", l:"Fecha del daño", t:"date", req:1, def:today}, {k:"riesgo", l:"Qué ha pasado", t:"sel", o:RIESGOS, req:1},
  {k:"poliza", l:"Póliza", t:"ref", ref:"polizas"}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas"},
  {k:"cultivo", l:"Cultivo o animales afectados"}, {k:"dano", l:"Daño estimado (%)", t:"num"}, {k:"sup_afectada", l:"Superficie afectada (ha)", t:"num", step:"0.01"},
  {k:"estado", l:"Estado", t:"sel", o:["Por comunicar","Comunicado","Peritado","Indemnizado","Rechazado"], def:"Por comunicar"},
  {k:"comunicado", l:"Fecha en que lo comunicaste", t:"date"}, {k:"ref_siniestro", l:"Nº de siniestro"},
  {k:"perito", l:"Perito"}, {k:"peritacion", l:"Fecha de peritación", t:"date"},
  {k:"indemnizacion", l:"Indemnización (€)", t:"num", step:"0.01"}, {k:"fecha_cobro", l:"Fecha de cobro", t:"date"},
  {k:"descripcion", l:"Descripción del daño", t:"area"},
  {k:"lat", l:"Latitud", hide:1}, {k:"lng", l:"Longitud", hide:1}],
  cols: ["fecha","riesgo","parcela","poliza",{l:"Daño", f:r=>r.dano!==""&&r.dano!=null?`${fnum(r.dano)} %`:"", num:1},
    {l:"Comunicar antes de", f:r=>r.estado==="Por comunicar"?fdate(addDays(r.fecha,7)):"", pill:r=>r.estado!=="Por comunicar"?"":addDays(r.fecha,7)<today()?"crit":"warn"},
    {l:"Estado", f:r=>r.estado, pill:r=>({"Por comunicar":"crit", Comunicado:"warn", Peritado:"warn", Indemnizado:"ok", Rechazado:""})[r.estado]||""},
    {l:"Indemnización", f:r=>r.indemnizacion?eur.format(r.indemnizacion):"", num:1}]};
CON_ADJ.push("polizas","siniestros");

/* Módulo propio «Seguros y ayudas», detrás de Ventas */
(() => { const e = Object.entries(MODS); for (const [k] of e) delete MODS[k];
  for (const [k, v] of e) { MODS[k] = v; if (k === "ventas") MODS.seg = {name:"Seguros", color:"var(--seg)", desc:"Seguros, siniestros y ayudas", tables:["polizas","siniestros"]}; } })();
ICONS.seg = '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>';

/* Punto dentro de un polígono [[lat,lng],...] */
function dentroDe(pt, poly){
  let c = false; for (let i=0, j=poly.length-1; i<poly.length; j=i++) { const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (((yi > pt[0]) !== (yj > pt[0])) && (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) c = !c; }
  return c;
}
const distM = (a, b) => { const R = 6371000, r = Math.PI/180, dLa = (b[0]-a[0])*r, dLo = (b[1]-a[1])*r; const h = Math.sin(dLa/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
/* Parcela en la que está un punto; si no cae dentro de ninguna, la más cercana a menos de 300 m */
function parcelaEn(lat, lng){
  const P = DB.parcelas.filter(p=>p.geo?.length > 2), pt = [lat, lng];
  const d = P.find(p=>dentroDe(pt, p.geo)); if (d) return {p:d, dentro:true};
  let best = null, bd = 300; for (const p of P) { const m = Math.min(...p.geo.map(q=>distM(pt, q))); if (m < bd) { bd = m; best = p; } }
  return best ? {p:best, dentro:false, m:Math.round(bd)} : null;
}
function miPosicion(){ return new Promise((res, rej) => { if (!navigator.geolocation) return rej(new Error("sin GPS")); navigator.geolocation.getCurrentPosition(p => res([p.coords.latitude, p.coords.longitude, p.coords.accuracy]), rej, {enableHighAccuracy:true, timeout:15000, maximumAge:30000}); }); }

/* Formulario de póliza: parcelas aseguradas. Formulario de siniestro: ubicación por GPS */
FORM_EXTRA.push({
  html(t, r){
    if (t === "polizas") return `<div class="fld full"><label>Parcelas aseguradas</label><div class="chk-list">${DB.parcelas.map(p=>`<label><input type="checkbox" name="pol_parc" value="${p.id}" ${(r?.parcelas||[]).includes(p.id)?"checked":""}> ${esc(p.nombre)} <small class="muted">${fnum(p.superficie)} ha</small></label>`).join("") || `<span class="muted">Sin parcelas</span>`}</div></div>`;
    if (t === "siniestros") return `<div class="fld full"><label>Ubicación</label><div class="toolbar"><button type="button" class="btn" data-act="sin-gps">📍 Usar mi posición</button><span id="sinPos" class="muted">${r?.lat?`${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}`:"Sin ubicación"}</span>${r?.lat?`<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${r.lat},${r.lng}">Ver en el mapa</a>`:""}</div>
      <input type="hidden" id="sinLat" value="${esc(r?.lat??"")}"><input type="hidden" id="sinLng" value="${esc(r?.lng??"")}"></div>
      ${r?`<div class="fld full"><div class="toolbar"><button type="button" class="btn" data-act="sin-pdf" data-id="${r.id}">Informe para el perito (PDF)</button></div></div>`:""}`;
    return "";
  },
  mount(t, r){
    if (t === "siniestros") {
      $("#f_estado").addEventListener("change", e => { if (e.target.value !== "Por comunicar" && !$("#f_comunicado").value) $("#f_comunicado").value = today(); });
      $("#f_parcela").addEventListener("change", e => { if ($("#f_poliza").value) return; const pol = DB.polizas.find(p=>(p.parcelas||[]).includes(e.target.value) && (!p.fin || p.fin >= $("#f_fecha").value)); if (pol) $("#f_poliza").value = pol.id;
        const c = DB.cultivos.filter(c=>c.parcela===e.target.value).sort((a,b)=>Number(b.campana)-Number(a.campana))[0]; if (c && !$("#f_cultivo").value) $("#f_cultivo").value = c.cultivo; });
    }
  },
  collect(t, rec){
    if (t === "polizas") {
      rec.parcelas = [...document.querySelectorAll('input[name="pol_parc"]:checked')].map(x=>x.value);
      vincularEco(rec, "poliza", rec.gasto && rec.prima ? {fecha:rec.alta||today(), tipo:"Gasto", modulo:"General", categoria:"Seguros", concepto:`Seguro ${rec.linea||""} ${rec.numero||""} (${rec.aseguradora})`.replace(/\s+/g," "), importe:Number(rec.prima)} : null);
    }
    if (t === "siniestros") {
      rec.lat = $("#sinLat")?.value || ""; rec.lng = $("#sinLng")?.value || "";
      const p = DB.parcelas.find(x=>x.id===rec.parcela);
      vincularEco(rec, "siniestro", rec.estado === "Indemnizado" && rec.indemnizacion ? {fecha:rec.fecha_cobro||today(), tipo:"Ingreso", modulo:"Agrícola", categoria:"Otros", concepto:`Indemnización del seguro: ${rec.riesgo}${p?" en "+p.nombre:""}`, importe:Number(rec.indemnizacion), parcela:rec.parcela||""} : null);
    }
  },
  remove(t, rec){ if (rec && (t === "polizas" || t === "siniestros")) vincularEco(rec, t === "polizas" ? "poliza" : "siniestro", null); }
});
/* Crea, cambia o quita el apunte de Economía ligado a un registro */
function vincularEco(rec, campo, datos){
  const ex = DB.economia.find(e=>e[campo]===rec.id);
  if (datos) { const e = {...(ex||{id:uid()}), ...datos, [campo]:rec.id, _u:now()}; if (ex) DB.economia = DB.economia.map(x=>x.id===ex.id?e:x); else DB.economia.push(e); }
  else if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); }
}
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "sin-gps") {
    $("#sinPos").textContent = "Buscando posición…";
    try { const [la, lo, acc] = await miPosicion(); $("#sinLat").value = la.toFixed(6); $("#sinLng").value = lo.toFixed(6);
      const q = parcelaEn(la, lo); $("#sinPos").textContent = `${la.toFixed(5)}, ${lo.toFixed(5)} (±${Math.round(acc)} m)${q?` · ${q.dentro?"dentro de":"cerca de"} ${q.p.nombre}`:""}`;
      if (q && !$("#f_parcela").value) { $("#f_parcela").value = q.p.id; $("#f_parcela").dispatchEvent(new Event("change")); }
    } catch(err) { $("#sinPos").textContent = "No se pudo obtener la posición. Activa la ubicación."; }
  }
  if (el.dataset.act === "sin-pdf") pdfSiniestro(DB.siniestros.find(x=>x.id===el.dataset.id));
});
async function pdfSiniestro(s){
  if (!s) return; if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const {jsPDF} = window.jspdf, doc = new jsPDF({unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51];
  const p = DB.parcelas.find(x=>x.id===s.parcela), pol = DB.polizas.find(x=>x.id===s.poliza);
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...verde); doc.text("Declaración de daños", 14, 20);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(60); doc.text([T.nombre, T.nif&&`NIF ${T.nif}`].filter(Boolean).join(" · ") || "", 14, 27);
  doc.autoTable({startY:32, body:[
    ["Fecha del daño", fdate(s.fecha)], ["Riesgo", s.riesgo||""], ["Póliza", pol?`${pol.aseguradora} · ${pol.linea||""} · Nº ${pol.numero||"—"}`:"—"],
    ["Parcela", p?`${p.nombre} · ${p.municipio||""} · SIGPAC ${[p.provincia,p.poligono,p.parcela,p.recinto].filter(x=>x!==""&&x!=null).join("/")} · ${fnum(p.superficie)} ha`:"—"],
    ["Cultivo", s.cultivo||""], ["Daño estimado", s.dano!==""&&s.dano!=null?`${fnum(s.dano)} %`:""], ["Superficie afectada", s.sup_afectada?`${fnum(s.sup_afectada)} ha`:""],
    ["Ubicación", s.lat?`${s.lat}, ${s.lng}  (https://www.google.com/maps?q=${s.lat},${s.lng})`:"—"], ["Nº de siniestro", s.ref_siniestro||""], ["Comunicado el", fdate(s.comunicado)],
    ["Descripción", s.descripcion||""]], theme:"grid", styles:{fontSize:10}, columnStyles:{0:{fontStyle:"bold", cellWidth:48}}, margin:{left:14, right:14}});
  let y = doc.lastAutoTable.finalY + 6, x = 14;
  for (const id of s._adj||[]) { let f = null; try { f = await idbGet("files", id); } catch(e) {} if (!f || f.kind !== "image") continue;
    const url = await blobToDataURL(f.blob), img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = url; }); if (!img) continue;
    const w = 88, h = w * img.height / img.width; if (y + h > 285) { if (x === 14) { doc.addPage(); y = 16; } else { x = 14; doc.addPage(); y = 16; } }
    doc.addImage(url, "JPEG", x, y, w, Math.min(h, 120)); if (x === 14) x = 108; else { x = 14; y += Math.min(h,120) + 4; } }
  try { doc.save(`siniestro-${s.fecha}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}
ALERTS.push(() => {
  const A = [], h = today();
  for (const s of DB.siniestros) if (s.estado === "Por comunicar") { const lim = addDays(s.fecha, 7); A.push({lv: lim < h ? "crit" : "warn", t:`Comunica el siniestro: ${s.riesgo}`, s:`${refName("parcelas", s.parcela) || "Sin parcela"} · ${lim < h ? "el plazo habitual de 7 días ya ha pasado" : "plazo habitual de 7 días"}`, d:lim, mod:"seg", tab:"siniestros"}); }
  for (const p of DB.polizas) if (p.fin && p.fin >= h && daysBetween(h, p.fin) <= 30) A.push({lv:"warn", t:`Acaba el seguro de ${p.linea||"la póliza"} ${p.numero||""}`, s:`${p.aseguradora} · revisa si tienes que renovarlo`, d:p.fin, mod:"seg", tab:"polizas"});
  // Parcelas con cultivo este año que no están en ninguna póliza en vigor
  const y = Number(h.slice(0,4)), aseg = new Set(DB.polizas.filter(p=>!p.fin || p.fin >= h).flatMap(p=>p.parcelas||[]));
  if (DB.polizas.length) { const sin = DB.cultivos.filter(c=>Number(c.campana)===y && c.estado==="En curso" && !aseg.has(c.parcela)); if (sin.length) A.push({lv:"", t:`${sin.length} cultivo${sin.length>1?"s":""} sin seguro en vigor`, s:sin.slice(0,3).map(c=>`${c.cultivo} (${refName("parcelas", c.parcela)})`).join(", "), d:"", mod:"seg", tab:"polizas"}); }
  return A;
});
SEEDS.push((d, add, D, ids) => {
  const pol = add("polizas", {aseguradora:"Agroseguro · mediador (ejemplo)", numero:"0000001", linea:"Cultivos herbáceos extensivos", modulo:"Módulo P", campana:new Date().getFullYear(), alta:D(-40), inicio:D(-35), fin:D(20), capital:9500, prima:310, subvencion:190, gasto:true, telefono:"900 000 000"});
  d.polizas.find(x=>x.id===pol).parcelas = [ids.p1];
  add("economia", {fecha:D(-40), tipo:"Gasto", modulo:"General", categoria:"Seguros", concepto:"Seguro Cultivos herbáceos extensivos 0000001", importe:310, poliza:pol});
  add("siniestros", {fecha:D(-2), riesgo:"Pedrisco", poliza:pol, parcela:ids.p1, cultivo:"Cebada", dano:15, sup_afectada:2, estado:"Por comunicar", descripcion:"Granizo fuerte por la tarde; hojas rotas en la zona baja de la parcela."});
});
