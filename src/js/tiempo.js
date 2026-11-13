/* ============ Tiempo por parcela y ventanas de tratamiento (Open-Meteo, sin clave) ============ */
const VENTANA = {viento:15, racha:25, probLluvia:30, tmin:5, tmax:28, horasSinLluvia:6};
const wxCache = {};
try { Object.assign(wxCache, JSON.parse(localStorage.getItem("mi-explotacion-tiempo")||"{}")); } catch(e) {}
UI.wx = UI.wx || "";
async function cargarTiempo(lat, lng){
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const c = wxCache[key];
  if (c && Date.now() - c.t < 60*60*1000) return c.d;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration&past_days=7&forecast_days=7&timezone=auto&wind_speed_unit=kmh`;
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
