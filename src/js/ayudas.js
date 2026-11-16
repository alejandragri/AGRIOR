/* ============ Ayudas y subvenciones: las que encajan con tu explotación, búsqueda en la BDNS y tus solicitudes ============ */
S.solicitudes = {title: "Mis solicitudes", one: "solicitud", label: r => r.ayuda, help: "Lleva el control de las ayudas que pides: plazos, requerimientos, justificación y cobro.", fields: [
  {k:"ayuda", l:"Ayuda", req:1}, {k:"organismo", l:"Organismo", def:"Junta de Comunidades de Castilla-La Mancha"},
  {k:"convocatoria", l:"Nº BDNS o enlace a la convocatoria"},
  {k:"fin_plazo", l:"Fin del plazo de solicitud", t:"date"}, {k:"presentada", l:"Fecha en que la presentaste", t:"date"},
  {k:"importe", l:"Importe solicitado (€)", t:"num", step:"0.01"},
  {k:"estado", l:"Estado", t:"sel", o:["Preparando","Presentada","Requerimiento","Concedida","Denegada","Cobrada"], def:"Preparando"},
  {k:"concedido", l:"Importe concedido (€)", t:"num", step:"0.01"}, {k:"justificar", l:"Fecha límite para justificar o ejecutar", t:"date"},
  {k:"fecha_cobro", l:"Fecha de cobro", t:"date"}, {k:"notas", l:"Notas y documentos que piden", t:"area"}],
  cols: ["ayuda","organismo",{l:"Fin de plazo", f:r=>fdate(r.fin_plazo), pill:r=>!r.fin_plazo||r.estado!=="Preparando"?"":r.fin_plazo<today()?"crit":daysBetween(today(),r.fin_plazo)<=15?"warn":""},
    {l:"Solicitado", f:r=>r.importe?eur.format(r.importe):"", num:1},{l:"Concedido", f:r=>r.concedido?eur.format(r.concedido):"", num:1},
    {l:"Justificar antes de", f:r=>fdate(r.justificar), pill:r=>!r.justificar||r.estado==="Cobrada"?"":r.justificar<today()?"crit":daysBetween(today(),r.justificar)<=30?"warn":""},
    {l:"Estado", f:r=>r.estado, pill:r=>({Cobrada:"ok", Concedida:"ok", Requerimiento:"crit", Denegada:"", Presentada:"warn", Preparando:"warn"})[r.estado]||""}]};
MODS.seg.tables.push("ayudas", "solicitudes"); MODS.seg.name = "Seguros y ayudas";
CON_ADJ.push("solicitudes");
FORM_EXTRA.push({ html:()=>"", collect(t, rec){ if (t !== "solicitudes") return;
  vincularEco(rec, "solicitud", rec.estado === "Cobrada" && (rec.concedido || rec.importe) ? {fecha:rec.fecha_cobro||today(), tipo:"Ingreso", modulo:"General", categoria:"Subvenciones (PAC)", concepto:`Ayuda: ${rec.ayuda}`, importe:Number(rec.concedido||rec.importe)} : null); },
  remove(t, rec){ if (t === "solicitudes" && rec) vincularEco(rec, "solicitud", null); } });
ALERTS.push(() => DB.solicitudes.flatMap(r => {
  const A = [], h = today();
  if (r.estado === "Preparando" && r.fin_plazo && r.fin_plazo >= h && daysBetween(h, r.fin_plazo) <= 15) A.push({lv:"warn", t:`Presenta la solicitud: ${r.ayuda}`, s:`El plazo acaba en ${daysBetween(h, r.fin_plazo)} días`, d:r.fin_plazo, mod:"seg", tab:"solicitudes"});
  if (r.estado === "Requerimiento") A.push({lv:"crit", t:`Responde al requerimiento: ${r.ayuda}`, s:"Suelen dar 10 días hábiles", d:"", mod:"seg", tab:"solicitudes"});
  if (r.estado === "Concedida" && r.justificar && daysBetween(h, r.justificar) <= 30) A.push({lv: r.justificar < h ? "crit" : "warn", t:`Justifica la ayuda: ${r.ayuda}`, s:"Facturas, pagos y lo que pida la resolución", d:r.justificar, mod:"seg", tab:"solicitudes"});
  return A; }));

/* Perfil de la explotación sacado de los datos */
function perfilExpl(){
  const usos = new Set(DB.parcelas.map(p=>(p.uso||"").slice(0,2))), y = String(new Date().getFullYear());
  const cult = DB.cultivos.filter(c=>String(c.campana)===y).map(c=>norm(c.cultivo)).join(" ");
  return {ha: DB.parcelas.reduce((s,p)=>s+Number(p.superficie||0),0), regadio: DB.parcelas.some(p=>p.riego==="Regadío") || DB.concesiones.length > 0,
    vina: usos.has("VI") || /vin|uva/.test(cult), olivar: usos.has("OV") || /olivo|olivar/.test(cult), lenosos: usos.has("FS") || /almend|pistach|nogal/.test(cult),
    ganado: DB.animales.some(a=>a.estado!=="Baja"), colmenas: DB.colmenas.filter(c=>c.estado!=="Muerta"&&c.estado!=="Vendida").length,
    maquinas: DB.maquinaria.length, viejas: DB.maquinaria.filter(m=>/tractor|pulveriz|abonadora/i.test(m.tipo||"")).length, seguros: DB.polizas.length, eco: /ecol/i.test(JSON.stringify(DB._meta.titular||{}))};
}
/* Líneas de ayuda que se convocan con regularidad. Las fechas y requisitos cambian cada año: siempre se enlaza a la búsqueda oficial. */
const AYUDAS = [
  {id:"mejora", t:"Planes de mejora de explotaciones", q:"inversiones explotaciones agrarias planes de mejora", que:"Inversiones en la explotación: maquinaria, naves, riego eficiente, plantaciones, energía solar…", quien:"Agricultores profesionales o explotaciones prioritarias.", ok:p=>p.ha>0||p.ganado, por:p=>"Tienes una explotación en activo"},
  {id:"jovenes", t:"Primera instalación de jóvenes agricultores", q:"primera instalación jóvenes agricultores", que:"Prima por instalarse por primera vez como titular, a menudo junto con un plan de mejora.", quien:"Menores de 41 años que se instalan por primera vez.", ok:()=>true, por:()=>"Si tienes menos de 41 años y te instalas ahora"},
  {id:"renove", t:"Renovación de maquinaria agrícola (Plan Renove)", q:"renovación maquinaria agrícola", que:"Ayuda por achatarrar un tractor, pulverizador o abonadora viejos y comprar uno nuevo más eficiente.", quien:"Titulares de explotación con maquinaria inscrita en el ROMA.", ok:p=>p.viejas>0, por:p=>`Tienes ${p.viejas} tractor${p.viejas>1?"es":""} o equipo${p.viejas>1?"s":""} de tratamiento o abonado`},
  {id:"seguros", t:"Subvención a los seguros agrarios", q:"seguros agrarios subvención", que:"El Ministerio (ENESA) y la comunidad pagan parte de la prima. Se aplica al contratar la póliza.", quien:"Quien contrata un seguro del Plan de Seguros Agrarios.", ok:()=>true, por:p=>p.seguros?"Tienes pólizas apuntadas: comprueba que te han descontado la subvención":"Ningún cultivo tiene seguro apuntado"},
  {id:"riego", t:"Modernización y eficiencia del regadío", q:"modernización regadío eficiencia riego", que:"Cambio a goteo, contadores, telecontrol, balsas o bombeo solar.", quien:"Regantes y comunidades de regantes.", ok:p=>p.regadio, por:()=>"Tienes parcelas de regadío"},
  {id:"vina", t:"Reestructuración y reconversión del viñedo", q:"reestructuración reconversión viñedo", que:"Arranque y replantación, cambio de variedad, espaldera y riego en el viñedo.", quien:"Viticultores con plantación inscrita en el registro vitícola.", ok:p=>p.vina, por:()=>"Tienes viñedo"},
  {id:"lenosos", t:"Leñosos y frutos secos", q:"frutos secos almendro pistacho olivar ayuda", que:"Líneas para olivar tradicional, almendro, pistachero y otros leñosos (ecorregímenes, ayudas asociadas, plantaciones).", quien:"Titulares de leñosos.", ok:p=>p.olivar||p.lenosos, por:()=>"Tienes olivar o frutos secos"},
  {id:"agroamb", t:"Agroambiente, clima y agricultura ecológica", q:"agroambiente clima agricultura ecológica", que:"Pagos por hectárea por compromisos ambientales de varios años o por producir en ecológico.", quien:"Quien se compromete durante 5 años.", ok:p=>p.ha>0, por:p=>`Tienes ${fnum(p.ha)} ha`},
  {id:"apicola", t:"Ayudas al sector apícola", q:"apicultura apícola ayudas colmenas", que:"Lucha contra la varroa, trashumancia, mejora de la producción y comercialización de miel.", quien:"Apicultores con explotación registrada en el REGA.", ok:p=>p.colmenas>0, por:p=>`Tienes ${p.colmenas} colmenas`},
  {id:"ganado", t:"Ganadería: sanidad, bienestar y razas autóctonas", q:"ganadería sanidad animal razas autóctonas bienestar", que:"Agrupaciones de defensa sanitaria, bienestar animal, razas autóctonas y retirada de cadáveres.", quien:"Ganaderos con explotación en el REGA.", ok:p=>p.ganado, por:()=>"Tienes ganado"},
  {id:"adversas", t:"Daños por heladas, granizo o sequía", q:"daños adversidades climáticas agricultores", que:"Cuando hay daños graves, a veces se aprueban ayudas extraordinarias o préstamos bonificados.", quien:"Afectados de las zonas declaradas. Suele exigirse tener seguro.", ok:p=>DB.siniestros.length>0, por:()=>"Tienes siniestros apuntados"},
];
const BDNS_API = "https://www.infosubvenciones.es/bdnstrans/api/convocatorias/busqueda";
const BDNS_WEB = "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias";
const AYU_KEY = "mi-explotacion-ayudas";
let ayuCache = {}; try { ayuCache = JSON.parse(localStorage.getItem(AYU_KEY) || "{}"); } catch(e) {}
const ayuSave = () => { try { localStorage.setItem(AYU_KEY, JSON.stringify(ayuCache)); } catch(e) {} };
/* Busca convocatorias en la Base de Datos Nacional de Subvenciones (pública, sin clave) */
async function buscarBDNS(q){
  const u = `${BDNS_API}?vpd=GE&page=0&pageSize=40&order=numeroConvocatoria&direccion=desc&descripcion=${encodeURIComponent(q)}&descripcionTipoBusqueda=1`;
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try { const r = await fetch(u, {signal:ctl.signal, headers:{Accept:"application/json"}}); if (!r.ok) throw new Error(`error ${r.status}`); const j = await r.json();
    const L = (j.content || j.convocatorias || j || []).map(c => ({n:String(c.numeroConvocatoria ?? c.codigoBDNS ?? c.id ?? ""), t:c.descripcion || c.titulo || "", f:(c.fechaRecepcion || c.fechaRegistro || "").slice(0,10), o:[c.nivel1, c.nivel2, c.nivel3].filter(Boolean).join(" · ")}));
    // Se quedan las estatales y las de Castilla-La Mancha (y sus provincias y municipios)
    return L.filter(c => c.t && (/castilla.?la mancha|albacete|ciudad real|cuenca|guadalajara|toledo/i.test(c.o) || /^estado/i.test(c.o)));
  } finally { clearTimeout(to); }
}
UI.ayuQ = UI.ayuQ || "";
let ayuRes = null, ayuMsg = "";
TABS.ayudas = {title: "Ayudas para ti", render(){
  const p = perfilExpl(), enc = AYUDAS.filter(a=>a.ok(p)), resto = AYUDAS.filter(a=>!a.ok(p)), vig = DB._meta.ayudasVigilar || [], nuevas = ayuCache.nuevas || [];
  const tarjeta = a => `<article class="ayu"><h3>${esc(a.t)}</h3><p>${esc(a.que)}</p><p class="muted" style="font-size:.85rem">Para: ${esc(a.quien)}${a.ok(p)?`<br><strong style="color:var(--ok)">✓ ${esc(a.por(p))}</strong>`:""}</p>
    <div class="toolbar"><button class="btn" data-act="ayu-buscar" data-q="${esc(a.q)}">Ver convocatorias</button><button class="btn" data-act="ayu-vigilar" data-q="${esc(a.q)}">${vig.includes(a.q)?"✓ Avisándote":"🔔 Avisarme"}</button><button class="btn" data-act="ayu-solicitud" data-t="${esc(a.t)}">+ Mis solicitudes</button></div></article>`;
  return `${nuevas.length ? `<section class="panel"><h3>Convocatorias nuevas desde la última vez</h3><ul class="alerts">${nuevas.slice(0,8).map(c=>`<li class="warn"><div><strong>${esc(c.t)}</strong><small>${esc(c.o)} · ${fdate(c.f)}</small></div><span class="when"><a class="btn" target="_blank" rel="noopener" href="${BDNS_WEB}/${encodeURIComponent(c.n)}">Abrir</a></span></li>`).join("")}</ul><div><button class="btn" data-act="ayu-vistas">Marcar como vistas</button></div></section>` : ""}
  <section class="panel"><h3>Buscar convocatorias</h3>
    <div class="toolbar"><input class="grow" type="search" id="ayuQ" placeholder="Ejemplo: maquinaria, regadío, jóvenes, apicultura…" value="${esc(UI.ayuQ)}"><button class="btn primary" data-act="ayu-buscar">Buscar</button><a class="btn" href="${BDNS_WEB}" target="_blank" rel="noopener">Abrir la BDNS</a></div>
    <div id="ayuRes">${ayuMsg ? `<p class="muted">${ayuMsg}</p>` : ayuRes ? (ayuRes.length ? `<ul class="alerts">${ayuRes.map(c=>`<li><div><strong>${esc(c.t)}</strong><small>${esc(c.o)}${c.f?` · registrada el ${fdate(c.f)}`:""} · nº ${esc(c.n)}</small></div><span class="when"><a class="btn" target="_blank" rel="noopener" href="${BDNS_WEB}/${encodeURIComponent(c.n)}">Abrir</a></span></li>`).join("")}</ul>` : `<p class="muted">No hay convocatorias estatales ni de Castilla-La Mancha con esas palabras.</p>`) : `<p class="muted">Busca en la Base de Datos Nacional de Subvenciones, donde se publican todas las convocatorias. Se muestran las del Estado y las de Castilla-La Mancha.</p>`}</div>
    ${vig.length?`<p class="muted" style="font-size:.85rem;margin:0">Te aviso cuando salga algo nuevo de: ${vig.map(v=>`<span class="pill">${esc(v)} <button class="x" style="font-size:.9rem" data-act="ayu-novigilar" data-q="${esc(v)}" aria-label="Dejar de vigilar">×</button></span>`).join(" ")}${ayuCache.t?` · revisado ${new Date(ayuCache.t).toLocaleDateString("es-ES")}`:""}</p>`:""}
  </section>
  <h2>Encajan con tu explotación</h2>
  <div class="ayu-grid">${enc.map(tarjeta).join("") || `<p class="muted">Completa tus parcelas, ganado o colmenas para ver sugerencias.</p>`}</div>
  ${resto.length?`<details><summary class="muted" style="cursor:pointer">Otras líneas (${resto.length})</summary><div class="ayu-grid" style="margin-top:10px">${resto.map(tarjeta).join("")}</div></details>`:""}
  <p class="muted" style="font-size:.82rem">Las sugerencias se basan en lo que tienes apuntado en la app; los requisitos, importes y plazos cambian en cada convocatoria. Confírmalos en la convocatoria oficial o con tu oficina comarcal agraria.</p>`;
}};
async function lanzarBusqueda(q){
  UI.ayuQ = q; ayuRes = null; ayuMsg = "Buscando…"; render();
  try { ayuRes = await buscarBDNS(q); ayuMsg = ""; }
  catch(e) { ayuMsg = `No se ha podido consultar la BDNS desde la app (${navigator.onLine ? "el servicio no responde o no permite consultas desde aplicaciones web" : "sin conexión"}). <a href="${BDNS_WEB}" target="_blank" rel="noopener">Ábrela en el navegador</a> y busca «${esc(q)}».`; }
  if (UI.mod === "seg") render();
}
/* Revisa una vez al día las búsquedas vigiladas y guarda las convocatorias nuevas */
async function vigilarAyudas(){
  const vig = DB._meta.ayudasVigilar || []; if (!vig.length || !navigator.onLine) return;
  if (ayuCache.t && Date.now() - ayuCache.t < 20*3600e3) return;
  const vistas = new Set(ayuCache.vistas || []), nuevas = ayuCache.nuevas || [], antes = nuevas.length, qs = new Set(ayuCache.qs || []);
  // La primera vez que se vigila una búsqueda, lo que ya existe se da por visto
  for (const q of vig) { const primera = !qs.has(q); try { for (const c of await buscarBDNS(q)) if (c.n && !vistas.has(c.n)) { vistas.add(c.n); if (!primera) nuevas.unshift(c); } qs.add(q); } catch(e) { return; } }
  ayuCache = {t:Date.now(), vistas:[...vistas].slice(-2000), nuevas:nuevas.slice(0,30), qs:[...qs]}; ayuSave();
  if (nuevas.length > antes) { try { notificar("Nuevas ayudas", `${nuevas.length} convocatoria${nuevas.length>1?"s":""} que vigilas`, "ayudas"); } catch(e) {} if (UI.mod === "inicio") render(); }
}
ALERTS.push(() => (ayuCache.nuevas||[]).length ? [{lv:"warn", t:`${ayuCache.nuevas.length} convocatoria${ayuCache.nuevas.length>1?"s":""} de ayudas nueva${ayuCache.nuevas.length>1?"s":""}`, s:ayuCache.nuevas[0].t.slice(0,90), d:"", mod:"seg", tab:"ayudas"}] : []);
setTimeout(() => vigilarAyudas().catch(()=>{}), 6000);
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act;
  if (a === "ayu-buscar") { const q = el.dataset.q || $("#ayuQ")?.value.trim(); if (q) lanzarBusqueda(q); }
  else if (a === "ayu-vigilar" || a === "ayu-novigilar") { const v = new Set(DB._meta.ayudasVigilar || []); if (a === "ayu-novigilar" || v.has(el.dataset.q)) v.delete(el.dataset.q); else v.add(el.dataset.q); DB._meta.ayudasVigilar = [...v]; ayuCache.t = 0; save(); render(); if (a === "ayu-vigilar" && v.has(el.dataset.q)) { toast("Te avisaré cuando salgan convocatorias nuevas"); vigilarAyudas().catch(()=>{}); } }
  else if (a === "ayu-vistas") { ayuCache.nuevas = []; ayuSave(); render(); }
  else if (a === "ayu-solicitud") { openForm("solicitudes"); const f = $("#f_ayuda"); if (f) f.value = el.dataset.t; }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "ayuQ") { e.preventDefault(); const q = e.target.value.trim(); if (q) lanzarBusqueda(q); } });
