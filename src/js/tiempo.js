/* ============ Tiempo por parcela y ventanas de tratamiento (Open-Meteo, sin clave) ============ */
const VENTANA = {viento:15, racha:25, probLluvia:30, tmin:5, tmax:28, horasSinLluvia:6};
const wxCache = {};
try { Object.assign(wxCache, JSON.parse(localStorage.getItem("mi-explotacion-tiempo")||"{}")); } catch(e) {}
UI.wx = UI.wx || "";
async function cargarTiempo(lat, lng){
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const c = wxCache[key];
  if (c && Date.now() - c.t < 60*60*1000) return c.d;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration&past_days=7&forecast_days=7&timezone=auto&wind_speed_unit=kmh`;
  try {
    const r = await fetch(u); if (!r.ok) throw new Error(r.status);
    const d = await r.json(); wxCache[key] = {t: Date.now(), d};
    try { localStorage.setItem("mi-explotacion-tiempo", JSON.stringify(wxCache)); } catch(e) {}
    return d;
  } catch(e) { if (c) return {...c.d, _old: c.t}; throw e; }
}
/* Horas aptas para tratar: poco viento, sin lluvia prevista en las 6 h siguientes y temperatura moderada */
function ventanas(d){
  const H = d.hourly, n = H.time.length, ahora = (d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,13))(new Date());
  const ok = [];
  for (let i=0;i<n;i++){
    if (H.time[i].slice(0,13) < ahora) { ok.push(null); continue; }
    let lluvia = 0; for (let j=i;j<Math.min(n,i+VENTANA.horasSinLluvia);j++) lluvia += H.precipitation[j]||0;
    const motivos = [];
    if (H.wind_speed_10m[i] > VENTANA.viento) motivos.push("viento");
    if (H.wind_gusts_10m[i] > VENTANA.racha) motivos.push("rachas");
    if ((H.precipitation_probability[i]??0) > VENTANA.probLluvia || lluvia >= 0.2) motivos.push("lluvia");
    if (H.temperature_2m[i] < VENTANA.tmin || H.temperature_2m[i] > VENTANA.tmax) motivos.push("temperatura");
    const h = Number(H.time[i].slice(11,13));
    if (h < 6 || h > 21) motivos.push("noche");
    ok.push(motivos);
  }
  const W = []; let s = -1;
  for (let i=0;i<=n;i++){ const g = i<n && ok[i] && !ok[i].length; if (g && s<0) s = i; if (!g && s>=0) { if (i-s >= 2) W.push({desde:H.time[s], hasta:H.time[i-1], horas:i-s, viento:Math.max(...H.wind_speed_10m.slice(s,i))}); s = -1; } }
  return {ok, W};
}
const fh = t => `${new Date(t).toLocaleDateString("es-ES",{weekday:"short", day:"numeric"})} ${t.slice(11,13)}h`;
TABS.tiempo = {title: "Tiempo", render(){
  const opts = [...DB.parcelas.filter(p=>p.geo?.length).map(p=>[`parcelas:${p.id}`, `Parcela · ${p.nombre}`]), ...DB.apiarios.filter(a=>apiPos(a)).map(a=>[`apiarios:${a.id}`, `Apiario · ${a.nombre}`])];
  if (!opts.length) return `<div class="empty">Dibuja tus parcelas o sitúa tus apiarios en el <button class="btn" data-go="agri" data-tab="mapa">Mapa</button> para ver su previsión.</div>`;
  if (!opts.some(o=>o[0]===UI.wx)) UI.wx = opts[0][0];
  return `<div class="toolbar"><select id="wxSel" aria-label="Lugar" style="width:auto;max-width:100%">${opts.map(([v,l])=>`<option value="${v}" ${v===UI.wx?"selected":""}>${esc(l)}</option>`).join("")}</select>
    <span class="muted" style="font-size:.85rem">Ventana apta: viento ≤ ${VENTANA.viento} km/h, rachas ≤ ${VENTANA.racha} km/h, sin lluvia en ${VENTANA.horasSinLluvia} h y entre ${VENTANA.tmin} y ${VENTANA.tmax} °C. Lee siempre la etiqueta del producto.</span></div>
    <div id="wxBox"><div class="empty">Cargando previsión…</div></div>`;
}, async mount(){
  const box = $("#wxBox"); if (!box) return;
  const [tipo, id] = UI.wx.split(":"); const pos = posDe(tipo, id); if (!pos) return;
  let d; try { d = await cargarTiempo(pos[0], pos[1]); } catch(e) { box.innerHTML = `<div class="empty">No se ha podido descargar la previsión. Necesitas conexión a internet la primera vez.</div>`; return; }
  if (!$("#wxBox")) return;
  const D = d.daily, hoyI = D.time.indexOf(today());
  const lluvia7 = D.precipitation_sum.slice(0, hoyI<0?7:hoyI).reduce((s,x)=>s+(x||0),0);
  const lluviaP = D.precipitation_sum.slice(hoyI<0?7:hoyI).reduce((s,x)=>s+(x||0),0);
  const {ok, W} = ventanas(d);
  const H = d.hourly, i0 = ok.findIndex(x=>x!==null), horas = H.time.slice(i0, i0+72);
  const MOT = {viento:"Viento", rachas:"Rachas", lluvia:"Lluvia", temperatura:"Temperatura", noche:"Noche"};
  box.innerHTML = `${d._old?`<p class="banner">Sin conexión: datos del ${new Date(d._old).toLocaleString("es-ES")}.</p>`:""}
  <div class="stats">
    <div class="stat" style="--mc:var(--eco)"><span class="k">Lluvia últimos 7 días</span><span class="v">${fnum(lluvia7)} mm</span><span class="s">Registrada por Open-Meteo</span></div>
    <div class="stat" style="--mc:var(--eco)"><span class="k">Lluvia prevista 7 días</span><span class="v">${fnum(lluviaP)} mm</span><span class="s">${D.precipitation_probability_max.slice(hoyI).filter(x=>x>=50).length} días con probabilidad ≥ 50 %</span></div>
    <div class="stat" style="--mc:var(--agri)"><span class="k">Próxima ventana para tratar</span><span class="v" style="font-size:1.25rem">${W[0]?fh(W[0].desde):"Ninguna en 7 días"}</span><span class="s">${W[0]?`${W[0].horas} h seguidas, viento máx. ${fnum(W[0].viento)} km/h`:"Revisa más adelante"}</span></div>
  </div>
  <section class="panel"><h3>Próximas 72 horas</h3>
    <div class="wx-strip">${horas.map((t,k)=>{const m=ok[i0+k]||[];return `<div class="wx-h ${m.length?"no":"si"}" title="${fh(t)} · ${fnum(H.temperature_2m[i0+k])} °C · viento ${fnum(H.wind_speed_10m[i0+k])} km/h · lluvia ${fnum(H.precipitation[i0+k])} mm${m.length?" · No apto: "+m.map(x=>MOT[x]).join(", "):" · Apto"}">${t.slice(11,13)==="00"||k===0?`<b>${new Date(t).toLocaleDateString("es-ES",{weekday:"short"})}</b>`:""}<i></i><small>${t.slice(11,13)}</small></div>`;}).join("")}</div>
    <p class="muted" style="font-size:.82rem;margin:0"><span class="pill ok">Verde</span> apto para tratar · <span class="pill">Gris</span> no apto. Pasa el dedo o el ratón por una hora para ver el motivo.</p>
    ${W.length?`<ul class="alerts">${W.slice(0,6).map(w=>`<li class="ok"><div><strong>${fh(w.desde)} a ${w.hasta.slice(11,13)}:59 h</strong><small>${w.horas} horas · viento máximo ${fnum(w.viento)} km/h</small></div></li>`).join("")}</ul>`:""}
  </section>
  <section class="panel"><h3>Previsión diaria</h3><div class="table-wrap"><table><thead><tr><th>Día</th><th>Máx.</th><th>Mín.</th><th>Lluvia</th><th>Prob.</th><th>Viento máx.</th><th>ET0</th></tr></thead><tbody>
  ${D.time.map((t,k)=>`<tr style="cursor:default;${t<today()?"opacity:.6":""}"><td>${new Date(t+"T12:00").toLocaleDateString("es-ES",{weekday:"short", day:"numeric", month:"short"})}${t===today()?" · hoy":""}</td><td class="num">${fnum(D.temperature_2m_max[k])} °C</td><td class="num">${fnum(D.temperature_2m_min[k])} °C</td><td class="num">${fnum(D.precipitation_sum[k])} mm</td><td class="num">${D.precipitation_probability_max[k]??"—"} %</td><td class="num">${fnum(D.wind_speed_10m_max[k])} km/h</td><td class="num">${fnum(D.et0_fao_evapotranspiration[k])} mm</td></tr>`).join("")}
  </tbody></table></div><p class="muted" style="font-size:.8rem;margin:0">Datos de Open-Meteo.com. ET0 es la evapotranspiración de referencia, útil para calcular el riego.</p></section>`;
}};
document.addEventListener("change", e => { if (e.target.id === "wxSel") { UI.wx = e.target.value; render(); } });

/* ============ Alertas de tiempo: heladas, viento, lluvia fuerte, tormenta y calor en tus parcelas y apiarios ============ */
const WXA_KEY = "mi-explotacion-alertas-tiempo";
const WXA_DEF = {activo:true, helada:0, heladaFuerte:-3, racha:50, lluvia:20, calor:38, dias:3};
const wxaCfg = () => ({...WXA_DEF, ...(DB._meta?.alertasTiempo||{})});
let wxAlertas = [];
try { const c = JSON.parse(localStorage.getItem(WXA_KEY)||"null"); if (c && c.dia === today()) wxAlertas = c.A || []; } catch(e) {}
/* Lugares: una previsión por zona (0,05° ≈ 5 km) para no repetir descargas con parcelas vecinas */
function lugaresTiempo(){
  const Z = {};
  for (const p of DB.parcelas) { if (!p.geo?.length) continue; const c = posDe("parcelas", p.id); if (!c) continue; const k = `${(Math.round(c[0]*20)/20).toFixed(2)},${(Math.round(c[1]*20)/20).toFixed(2)}`; (Z[k] = Z[k] || {pos:c, P:[], A:[]}).P.push(p); }
  for (const a of DB.apiarios) { const c = apiPos(a); if (!c) continue; const k = `${(Math.round(c[0]*20)/20).toFixed(2)},${(Math.round(c[1]*20)/20).toFixed(2)}`; (Z[k] = Z[k] || {pos:c, P:[], A:[]}).A.push(a); }
  return Object.values(Z).slice(0, 8);
}
const nombresLugar = z => [...z.P.map(p=>p.nombre), ...z.A.map(a=>`apiario ${a.nombre}`)];
const listaCorta = L => L.length <= 3 ? L.join(", ") : `${L.slice(0,2).join(", ")} y ${L.length-2} más`;
const diaTxt = d => d === today() ? "hoy" : d === addDays(today(), 1) ? "mañana" : new Date(d+"T12:00").toLocaleDateString("es-ES",{weekday:"long", day:"numeric"});
/* Calcula los avisos de una previsión para un lugar */
function avisosTiempo(d, z, cfg){
  const D = d.daily, A = [], h = today(), lim = addDays(h, cfg.dias - 1), sitio = listaCorta(nombresLugar(z));
  for (let i=0;i<D.time.length;i++){
    const f = D.time[i]; if (f < h || f > lim) continue;
    const tmin = D.temperature_2m_min[i], tmax = D.temperature_2m_max[i], lluvia = D.precipitation_sum[i]||0, racha = D.wind_gusts_10m_max?.[i] ?? D.wind_speed_10m_max[i], wc = D.weather_code?.[i];
    const base = {d:f, mod:"agri", tab:"tiempo", wx:1};
    if (tmin != null && tmin <= cfg.helada) A.push({...base, lv: tmin <= cfg.heladaFuerte ? "crit" : "warn", tipo:"helada", t:`Helada ${diaTxt(f)}: ${fnum(tmin)} °C`, s:`${sitio}. ${z.A.length?"Revisa la alimentación de las colmenas. ":""}Protege lo sensible y no riegues ni trates de madrugada.`});
    if (racha != null && racha >= cfg.racha) A.push({...base, lv: racha >= cfg.racha + 20 ? "crit" : "warn", tipo:"viento", t:`Viento fuerte ${diaTxt(f)}: rachas de ${fnum(Math.round(racha))} km/h`, s:`${sitio}. No pulverices; asegura techos de colmenas y cubiertas.`});
    if (lluvia >= cfg.lluvia) A.push({...base, lv: lluvia >= cfg.lluvia * 2 ? "crit" : "warn", tipo:"lluvia", t:`Lluvia fuerte ${diaTxt(f)}: ${fnum(Math.round(lluvia))} mm`, s:`${sitio}. Evita tratar y abonar antes; puede lavar el producto.`});
    if (wc === 96 || wc === 99) A.push({...base, lv:"crit", tipo:"granizo", t:`Tormenta con posible granizo ${diaTxt(f)}`, s:`${sitio}. Revisa tu seguro agrario y recoge lo que puedas.`});
    else if (wc === 95) A.push({...base, lv:"warn", tipo:"tormenta", t:`Tormenta ${diaTxt(f)}`, s:sitio});
    if (tmax != null && tmax >= cfg.calor) A.push({...base, lv:"warn", tipo:"calor", t:`Calor extremo ${diaTxt(f)}: ${fnum(tmax)} °C`, s:`${sitio}. Agua y sombra para el ganado y las colmenas; trata solo a primera hora.`});
  }
  // Has tratado o abonado hoy y llueve en las próximas 6 horas
  const H = d.hourly, ahora = new Date(Date.now() - new Date().getTimezoneOffset()*6e4).toISOString().slice(0,13), i0 = H.time.findIndex(t=>t.slice(0,13) >= ahora);
  if (i0 >= 0) { const ll = H.precipitation.slice(i0, i0+6).reduce((s,x)=>s+(x||0),0);
    if (ll >= 1) for (const p of z.P) { const tr = [...DB.fitosanitarios, ...DB.abonados].filter(r=>r.parcela===p.id && r.fecha===h); if (tr.length) A.push({d:h, mod:"agri", tab:"fitosanitarios", wx:1, lv:"warn", tipo:"lavado", t:`Lluvia tras el tratamiento en ${p.nombre}`, s:`Se esperan ${fnum(Math.round(ll*10)/10)} mm en las próximas 6 horas. Anota la eficacia y valora repetir.`}); } }
  return A;
}
async function revisarTiempo(){
  const cfg = wxaCfg(); if (!cfg.activo) { wxAlertas = []; return; }
  const Z = lugaresTiempo(); if (!Z.length) { wxAlertas = []; return; }
  const out = []; let ok = 0;
  for (const z of Z) { try { const d = await cargarTiempo(z.pos[0], z.pos[1]); ok++; out.push(...avisosTiempo(d, z, cfg)); } catch(e) {} }
  if (!ok) return; // sin conexión ni datos guardados: se mantienen los avisos de hoy
  // Un aviso por tipo y día: se juntan los lugares
  const M = {}; for (const a of out) { const k = `${a.tipo}|${a.d}|${a.t}`; if (!M[k]) M[k] = a; }
  const antes = JSON.stringify(wxAlertas); wxAlertas = Object.values(M);
  try { localStorage.setItem(WXA_KEY, JSON.stringify({dia:today(), A:wxAlertas})); } catch(e) {}
  if (JSON.stringify(wxAlertas) !== antes) { if (UI.mod === "inicio" && !$("#dlg")?.open) render(); comprobarAvisos(); }
}
ALERTS.push(() => wxaCfg().activo ? wxAlertas : []);
setTimeout(revisarTiempo, 2500);
setInterval(revisarTiempo, 3*60*60*1000);
window.addEventListener("online", () => setTimeout(revisarTiempo, 3000));
AFTER_SAVE.push(() => { clearTimeout(revisarTiempo._t); revisarTiempo._t = setTimeout(revisarTiempo, 5000); });

SETTINGS.push(() => { const c = wxaCfg(); return `<form class="panel" id="wxaF"><h2>Alertas de tiempo</h2>
  <p class="muted" style="margin:0">La app mira cada pocas horas la previsión de tus parcelas dibujadas en el mapa y de tus apiarios, y te avisa en el inicio (y con notificación, si las tienes activadas) de lo que pueda afectar a tratamientos, cosecha o animales en los próximos días.</p>
  <div class="fld chk"><input type="checkbox" id="wxa_activo" ${c.activo?"checked":""}><label for="wxa_activo">Avisarme del tiempo</label></div>
  <div class="grid2">
    <div class="fld"><label for="wxa_helada">Helada: temperatura mínima igual o menor que (°C)</label><input id="wxa_helada" type="number" step="0.5" value="${c.helada}"></div>
    <div class="fld"><label for="wxa_heladaFuerte">Helada fuerte (°C)</label><input id="wxa_heladaFuerte" type="number" step="0.5" value="${c.heladaFuerte}"></div>
    <div class="fld"><label for="wxa_racha">Viento: rachas de (km/h)</label><input id="wxa_racha" type="number" value="${c.racha}"></div>
    <div class="fld"><label for="wxa_lluvia">Lluvia fuerte: más de (mm al día)</label><input id="wxa_lluvia" type="number" value="${c.lluvia}"></div>
    <div class="fld"><label for="wxa_calor">Calor extremo: máxima de (°C)</label><input id="wxa_calor" type="number" value="${c.calor}"></div>
    <div class="fld"><label for="wxa_dias">Días por delante</label><select id="wxa_dias">${[1,2,3,4,5,7].map(n=>`<option ${n===Number(c.dias)?"selected":""}>${n}</option>`).join("")}</select></div>
  </div>
  <div class="toolbar"><button class="btn primary" type="submit">Guardar</button><span class="muted" style="font-size:.85rem">Previsión de Open-Meteo. No sustituye a los avisos oficiales de AEMET.</span></div></form>`; });
document.addEventListener("submit", e => { if (e.target.id !== "wxaF") return; e.preventDefault();
  const v = k => Number($("#wxa_"+k).value);
  DB._meta.alertasTiempo = {activo:$("#wxa_activo").checked, helada:v("helada"), heladaFuerte:v("heladaFuerte"), racha:v("racha"), lluvia:v("lluvia"), calor:v("calor"), dias:v("dias")};
  save(); toast("Alertas de tiempo guardadas"); revisarTiempo(); });
