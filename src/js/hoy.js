/* ============ Panel «Hoy» en el inicio ============ */
function hoyItems(){
  const h = today(), I = [];
  for (const r of DB.recordatorios) { const p = proxima(r); if (p && p <= h) I.push({t:r.titulo, s: p < h ? `Atrasado desde el ${fdate(p)}` : `${r.hora||""} · ${r.tipo||"Recordatorio"}`, lv: p < h ? "crit" : "warn", hecho:r.id, edit:["recordatorios", r.id]}); }
  for (const e of eventosAuto(h, h)) if (!e.done) I.push({t:e.t, s:"Hoy", lv:"warn", go:e.go, edit:e.edit});
  for (const p of DB.planes||[]) { const x = proximaMant(p); if (x.lv === "crit") I.push({t:`${p.tarea}: ${refName("maquinaria", p.maquina)}`, s:x.txt, lv:"crit", go:["taller","estado"]}); }
  for (const p of DB.partes.filter(p=>p.estado==="Pendiente" && p.fecha<=h)) I.push({t:`Completar parte ${p.numero||""}`, s:`${refName("trabajadores", p.trabajador)} · ${p.tarea||""} · ${fdate(p.fecha)}`, lv:"", edit:["partes", p.id]});
  for (const v of DB.ventas||[]) if (!v.cobrada && v.vencimiento && v.vencimiento <= h) I.push({t:`Cobrar ${v.numero}`, s:`${refName("clientes", v.cliente)} · ${eur.format(totalesVenta(v).total)}`, lv: v.vencimiento < h ? "crit" : "warn", edit:["ventas", v.id]});
  const o = {crit:0, warn:1, "":2}; return I.sort((a,b)=>o[a.lv]-o[b.lv]);
}
function semana(){
  const d1 = addDays(today(), 1), d7 = addDays(today(), 7), E = [];
  for (const r of DB.recordatorios) for (const d of ocurrencias(r, d1, d7)) E.push({d, t:r.titulo, c:"var(--agenda)", edit:["recordatorios", r.id]});
  for (const e of eventosAuto(d1, d7)) if (!e.done) E.push(e);
  for (const p of DB.planes||[]) { const x = proximaMant(p); if (x.lv === "warn") E.push({d:x.fecha && x.fecha <= d7 ? x.fecha : d1, t:`${p.tarea}: ${refName("maquinaria", p.maquina)} (${x.txt})`, c:"var(--taller)", go:["taller","estado"]}); }
  return E.sort((a,b)=>a.d.localeCompare(b.d));
}
function lugarTiempo(){
  const ops = [...DB.parcelas.filter(p=>p.geo?.length).map(p=>`parcelas:${p.id}`), ...DB.apiarios.filter(a=>apiPos(a)).map(a=>`apiarios:${a.id}`)];
  return ops.includes(UI.wx) ? UI.wx : ops[0];
}
const liAttr = i => i.edit ? `data-edit="${i.edit[0]}" data-id="${i.edit[1]}"` : i.go ? `data-go="${i.go[0]}" data-tab="${i.go[1]}"` : "";
function panelHoy(){
  const I = hoyItems(), W = semana(), h = today();
  const partesHoy = DB.partes.filter(p=>p.fecha===h), horas = partesHoy.reduce((s,p)=>s+horasParte(p),0);
  const lt = lugarTiempo();
  return `<section class="panel hoy"><div class="head"><h2>Hoy</h2><div class="toolbar"><button class="btn primary" data-new="partes">+ Parte de hoy</button><button class="btn" data-act="voz-parte">🎙 Parte por voz</button><button class="btn" data-new="recordatorios">+ Recordatorio</button></div></div>
  <div class="hoy-grid">
    <div class="hoy-col"><h3>Para hacer hoy${I.length?` <span class="pill ${I.some(i=>i.lv==="crit")?"crit":"warn"}">${I.length}</span>`:""}</h3>
      ${I.length ? `<ul class="alerts">${I.slice(0,8).map(i=>`<li class="${i.lv}" ${liAttr(i)} style="cursor:pointer"><div><strong>${esc(i.t)}</strong><small>${esc(i.s)}</small></div>${i.hecho?`<span class="when"><button class="btn" data-act="hoy-hecho" data-id="${i.hecho}">✓ Hecho</button></span>`:""}</li>`).join("")}</ul>${I.length>8?`<p class="muted" style="margin:0">Y ${I.length-8} más.</p>`:""}` : `<p class="muted">Nada urgente para hoy.</p>`}
      <p class="muted" style="margin:0;font-size:.88rem">Partes de hoy: <strong>${partesHoy.length}</strong>${horas?` · ${fnum(horas)} h`:""}</p>
    </div>
    <div class="hoy-col"><h3>Tiempo${lt?` · ${esc(lt.startsWith("parcelas")?refName("parcelas", lt.split(":")[1]):refName("apiarios", lt.split(":")[1]))}`:""}</h3><div id="hoyWx">${lt?`<p class="muted">Cargando previsión…</p>`:`<p class="muted">Dibuja una parcela en el <button class="btn" data-go="agri" data-tab="mapa">Mapa</button> para ver el tiempo.</p>`}</div></div>
    <div class="hoy-col"><h3>Próximos 7 días</h3>
      ${W.length ? `<ul class="alerts">${W.slice(0,7).map(e=>`<li ${liAttr(e)} style="cursor:pointer;border-left-color:${e.c}"><div><strong>${esc(e.t)}</strong></div><span class="when">${new Date(e.d+"T12:00").toLocaleDateString("es-ES",{weekday:"short", day:"numeric"})}</span></li>`).join("")}</ul>` : `<p class="muted">Semana tranquila.</p>`}
    </div>
  </div></section>`;
}
async function montarTiempoHoy(){
  const box = $("#hoyWx"), lt = lugarTiempo(); if (!box || !lt) return;
  const [tipo, id] = lt.split(":"), pos = posDe(tipo, id); if (!pos) return;
  let d; try { d = await cargarTiempo(pos[0], pos[1]); } catch(e) { box.innerHTML = `<p class="muted">Sin conexión para descargar la previsión.</p>`; return; }
  if (!$("#hoyWx")) return;
  const D = d.daily, i = D.time.indexOf(today()); if (i < 0) { box.innerHTML = `<p class="muted">Previsión no disponible.</p>`; return; }
  const {W} = ventanas(d), hoyW = W.filter(w=>w.desde.startsWith(today()));
  const ahora = d.hourly.time.findIndex(t => t.slice(0,13) >= new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,13));
  box.innerHTML = `<div class="hoy-wx"><span class="hoy-t">${ahora>=0?fnum(Math.round(d.hourly.temperature_2m[ahora])):"—"} °C</span><dl class="kv">
    <dt>Máx / mín</dt><dd>${fnum(D.temperature_2m_max[i])} / ${fnum(D.temperature_2m_min[i])} °C</dd>
    <dt>Lluvia</dt><dd>${fnum(D.precipitation_sum[i])} mm (${D.precipitation_probability_max[i]??"—"} %)</dd>
    <dt>Viento máx.</dt><dd>${fnum(D.wind_speed_10m_max[i])} km/h</dd>
    <dt>Para tratar</dt><dd>${hoyW.length ? hoyW.map(w=>`<span class="pill ok">${w.desde.slice(11,13)}–${Number(w.hasta.slice(11,13))+1} h</span>`).join(" ") : W[0] ? `Hoy no. Próxima: ${fh(W[0].desde)}` : "Sin ventanas en 7 días"}</dd></dl></div>
    ${d._old?`<p class="muted" style="font-size:.8rem;margin:0">Datos guardados del ${new Date(d._old).toLocaleString("es-ES")}</p>`:""}
    <button class="btn" data-go="agri" data-tab="tiempo">Ver previsión completa</button>`;
}
{ const _vi = viewInicio; viewInicio = () => { const h = _vi(); const i = h.indexOf('<div class="grid2">'); return i < 0 ? h + panelHoy() : h.slice(0, i) + panelHoy() + h.slice(i); }; }
{ const _r = render; render = function(){ _r(); if (UI.mod === "inicio") montarTiempoHoy(); }; }
document.addEventListener("click", e => {
  const el = e.target.closest('[data-act="hoy-hecho"]'); if (!el) return; e.stopPropagation();
  const r = DB.recordatorios.find(x=>x.id===el.dataset.id); if (!r) return;
  if (REPET[r.repetir]) { let d = r.fecha; do { d = sumPeriod(d, REPET[r.repetir]); } while (d <= today()); r.fecha = d; } else r.hecho = true;
  r._u = now(); delete r._demo; save(); render(); toast(REPET[r.repetir] ? `Hecho. Próxima vez: ${fdate(r.fecha)}` : "Hecho");
}, true);
