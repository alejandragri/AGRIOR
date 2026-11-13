/* ============ Guiado GPS en paralelo (líneas AB) ============ */
S.lineas = {title: "Líneas AB", one: "línea AB", label: r => r.nombre, fields: [
  {k:"nombre", l:"Nombre", req:1}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas"}, {k:"ancho", l:"Ancho de trabajo (m)", t:"num", req:1},
  {k:"a", l:"Punto A", hide:1}, {k:"b", l:"Punto B", hide:1}], cols:["nombre","parcela","ancho"]};

const G = {A:null, B:null, ancho:12, parcela:"", gps:null, sim:false, simT:null, run:false, aplicando:false,
  pos:null, prev:null, hdg:0, vel:0, acc:null, t0:null, track:[], cells:new Set(), bruto:0, zoom:3, follow:true, pasadas:new Set(), wake:null, lineaId:""};
try { const s = JSON.parse(localStorage.getItem("mi-explotacion-guiado")||"null"); if (s) Object.assign(G, {ancho:s.ancho||12, parcela:s.parcela||"", A:s.A||null, B:s.B||null, lineaId:s.lineaId||""}); } catch(e) {}
const gSave = () => { try { localStorage.setItem("mi-explotacion-guiado", JSON.stringify({ancho:G.ancho, parcela:G.parcela, A:G.A, B:G.B, lineaId:G.lineaId})); } catch(e) {} };

/* Proyección local en metros alrededor del punto A */
const R0 = 6378137;
function toXY(lat, lng){ const o = G.A || G.pos?.ll || [lat, lng]; return [(lng-o[1])*Math.PI/180*R0*Math.cos(o[0]*Math.PI/180), (lat-o[0])*Math.PI/180*R0]; }
function toLL(x, y){ const o = G.A; return [o[0] + y/R0*180/Math.PI, o[1] + x/(R0*Math.cos(o[0]*Math.PI/180))*180/Math.PI]; }
function ejes(){ if (!G.A || !G.B) return null; const b = toXY(...G.B); const L = Math.hypot(b[0], b[1]); if (L < 1) return null; const u = [b[0]/L, b[1]/L]; return {u, n:[-u[1], u[0]], L}; }
/* Desvío respecto a la pasada más cercana: k = número de pasada, e = metros a la izquierda de esa línea */
function desvio(p){ const E = ejes(); if (!E || !p) return null; const d = p[0]*E.n[0] + p[1]*E.n[1]; const k = Math.round(d / G.ancho); const s = p[0]*E.u[0] + p[1]*E.u[1]; return {k, e: d - k*G.ancho, s, E}; }

/* Cobertura: celdas de ancho/4 marcadas a lo largo de cada tramo aplicado */
const celda = () => Math.max(0.5, G.ancho/4);
function cubrir(p, q){
  const dx = q[0]-p[0], dy = q[1]-p[1], L = Math.hypot(dx, dy); if (L < 0.05 || L > 60) return;
  G.bruto += L * G.ancho;
  const c = celda(), ux = dx/L, uy = dy/L, nx = -uy, ny = ux;
  for (let s = 0; s <= L; s += c/2) for (let w = -G.ancho/2 + c/2; w <= G.ancho/2; w += c/2) {
    const x = p[0] + ux*s + nx*w, y = p[1] + uy*s + ny*w; G.cells.add(`${Math.floor(x/c)},${Math.floor(y/c)}`);
  }
}
const haCubiertas = () => G.cells.size * celda()**2 / 10000;

function nuevaPos(lat, lng, acc, vel){
  const p = toXY(lat, lng);
  if (G.pos) {
    const d = Math.hypot(p[0]-G.pos.xy[0], p[1]-G.pos.xy[1]);
    if (d > 0.8) { G.hdg = Math.atan2(p[0]-G.pos.xy[0], p[1]-G.pos.xy[1]); if (G.aplicando) cubrir(G.pos.xy, p); G.track.push(p); if (G.track.length > 20000) G.track.shift(); }
    else if (d < 0.8 && G.pos) { G.acc = acc; G.vel = vel ?? G.vel; pintar(); return; }
  }
  G.pos = {xy:p, ll:[lat, lng]}; G.acc = acc; if (vel != null) G.vel = vel;
  const dv = desvio(p); if (dv && G.aplicando) G.pasadas.add(dv.k);
  pintar();
}

/* ---- Simulación para probar sin moverse ---- */
function simular(){
  if (!G.A || !G.B) lineaEjemplo();
  const E = ejes(); if (!E) return toast("Marca primero los puntos A y B");
  let k = 0, dir = 1, s = -8, t = 0;
  G.sim = true; G.run = true; G.aplicando = true; G.t0 = Date.now(); G.pos = null; G.track = []; G.cells = new Set(); G.bruto = 0; G.pasadas = new Set();
  clearInterval(G.simT);
  G.simT = setInterval(() => {
    const v = 2.4; t += 0.25; s += dir * v * 0.5; // 8,6 km/h, paso de 0,5 s
    if (s > E.L + 8 || s < -8) { k++; dir = -dir; s = dir > 0 ? -8 : E.L + 8; }
    const ruido = Math.sin(t*0.9)*0.35 + Math.sin(t*2.3)*0.12 + (Math.random()-0.5)*0.08;
    const x = E.u[0]*s + E.n[0]*(k*G.ancho + ruido), y = E.u[1]*s + E.n[1]*(k*G.ancho + ruido);
    const ll = toLL(x, y); nuevaPos(ll[0], ll[1], 1.5, v);
  }, 500);
  render();
}
function lineaEjemplo(){
  const p = DB.parcelas.find(x=>x.id===G.parcela && x.geo?.length>2) || DB.parcelas.find(x=>x.geo?.length>2);
  if (p) { G.parcela = p.id; G.A = p.geo[0]; G.B = p.geo[1]; }
  else { G.A = [39.12, -3.46]; G.B = [39.12, -3.457]; }
  gSave();
}

function startGPS(){
  if (!navigator.geolocation) return toast("Este dispositivo no tiene GPS disponible");
  pararGuiado(true);
  G.run = true; G.t0 = G.t0 || Date.now();
  G.gps = navigator.geolocation.watchPosition(p => nuevaPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.speed), err => { toast(err.code === 1 ? "Permite el acceso a la ubicación para usar el guiado" : "Sin señal GPS"); }, {enableHighAccuracy:true, maximumAge:0, timeout:30000});
  try { navigator.wakeLock?.request("screen").then(w => G.wake = w).catch(()=>{}); } catch(e) {}
  render();
}
function pararGuiado(silencio){
  if (G.gps != null) navigator.geolocation.clearWatch(G.gps); G.gps = null;
  clearInterval(G.simT); G.simT = null; G.sim = false; G.run = false;
  try { G.wake?.release(); } catch(e) {} G.wake = null;
  if (!silencio) render();
}
function marcar(cual){
  const tomar = ll => { if (cual === "A") { G.A = ll; G.track = []; G.cells = new Set(); G.bruto = 0; G.pos = null; } else { G.B = ll; } G.lineaId = ""; gSave(); toast(`Punto ${cual} marcado`); render(); };
  if (G.pos && G.run) return tomar(G.pos.ll);
  if (!navigator.geolocation) return toast("Este dispositivo no tiene GPS disponible");
  toast("Buscando posición…");
  navigator.geolocation.getCurrentPosition(p => tomar([p.coords.latitude, p.coords.longitude]), () => toast("No se pudo obtener la posición"), {enableHighAccuracy:true, timeout:30000});
}
function rumbo(){
  const v = Number(($("#gRumbo")?.value || "").replace(",", "."));
  if (!G.A) return toast("Marca primero el punto A");
  if (isNaN(v)) return toast("Escribe el rumbo en grados (0 = norte, 90 = este)");
  const r = v*Math.PI/180; G.B = toLL(Math.sin(r)*200, Math.cos(r)*200); G.lineaId = ""; gSave(); toast(`Línea a ${v}° creada`); render();
}

/* ---- Dibujo ---- */
function pintar(){
  const cv = $("#gCanvas"); if (!cv) return;
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w*dpr)) { cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr); }
  const c = cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0);
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
  c.fillStyle = col("--g-bg"); c.fillRect(0,0,w,h);
  const sc = G.zoom; const ctr = G.pos?.xy || [0,0];
  const P = (x, y) => [w/2 + (x-ctr[0])*sc, h*0.62 - (y-ctr[1])*sc];
  // Parcela
  const parc = DB.parcelas.find(p=>p.id===G.parcela);
  if (parc?.geo?.length > 2 && G.A) { c.beginPath(); parc.geo.forEach((q,i)=>{ const [x,y] = P(...toXY(q[0],q[1])); i?c.lineTo(x,y):c.moveTo(x,y); }); c.closePath(); c.fillStyle = col("--g-field"); c.fill(); c.strokeStyle = col("--g-edge"); c.lineWidth = 2; c.stroke(); }
  // Cobertura
  const cs = celda(); c.fillStyle = col("--g-cov");
  for (const k of G.cells) { const [i,j] = k.split(",").map(Number); const [x,y] = P(i*cs, (j+1)*cs); c.fillRect(x, y, cs*sc+0.6, cs*sc+0.6); }
  // Líneas guía
  const E = ejes(), dv = desvio(G.pos?.xy || [0,0]);
  if (E) {
    const span = Math.hypot(w, h)/sc, k0 = dv ? dv.k : 0, s0 = dv ? dv.s : 0, nVis = Math.ceil(span/G.ancho/2)+1;
    for (let k = k0-nVis; k <= k0+nVis; k++) {
      const ox = E.n[0]*k*G.ancho, oy = E.n[1]*k*G.ancho;
      const [x1,y1] = P(ox + E.u[0]*(s0-span), oy + E.u[1]*(s0-span)), [x2,y2] = P(ox + E.u[0]*(s0+span), oy + E.u[1]*(s0+span));
      c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2);
      c.strokeStyle = k === k0 ? col("--g-line-on") : col("--g-line"); c.lineWidth = k === k0 ? 3 : 1.2; c.setLineDash(k === k0 ? [] : [8,6]); c.stroke(); c.setLineDash([]);
    }
    for (const [lbl, ll] of [["A", G.A], ["B", G.B]]) { const [x,y] = P(...toXY(ll[0], ll[1])); c.fillStyle = col("--g-line-on"); c.beginPath(); c.arc(x,y,9,0,7); c.fill(); c.fillStyle = col("--g-bg"); c.font = "bold 11px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(lbl, x, y+0.5); }
  }
  // Rastro
  if (G.track.length > 1) { c.beginPath(); G.track.forEach((q,i)=>{ const [x,y] = P(q[0],q[1]); i?c.lineTo(x,y):c.moveTo(x,y); }); c.strokeStyle = col("--g-track"); c.lineWidth = 1.5; c.stroke(); }
  // Vehículo y apero
  if (G.pos) {
    const [x,y] = P(...G.pos.xy); c.save(); c.translate(x,y); c.rotate(G.hdg);
    c.fillStyle = G.aplicando ? col("--g-cov-on") : "rgba(128,128,128,.35)"; c.fillRect(-G.ancho/2*sc, 4, G.ancho*sc, 6);
    c.fillStyle = col("--g-car"); c.beginPath(); c.moveTo(0,-16); c.lineTo(10,12); c.lineTo(0,7); c.lineTo(-10,12); c.closePath(); c.fill(); c.strokeStyle = col("--g-bg"); c.lineWidth = 2; c.stroke(); c.restore();
  } else { c.fillStyle = col("--g-muted"); c.font = "15px system-ui"; c.textAlign = "center"; c.fillText(G.run ? "Esperando señal GPS…" : "Pulsa «Empezar» o «Probar en simulación»", w/2, h/2); }
  // Escala
  const m = [1,2,5,10,20,50,100,200].find(v => v*sc > 60) || 200; c.fillStyle = col("--g-muted"); c.fillRect(12, h-18, m*sc, 3); c.font = "11px system-ui"; c.textAlign = "left"; c.fillText(`${m} m`, 12, h-24);
  barra(dv);
}
function barra(dv){
  const bar = $("#gBar"); if (!bar) return;
  let txt = "—", cls = "", leds = Array(15).fill("");
  if (dv && G.pos) {
    const sentido = Math.sin(G.hdg)*dv.E.u[0] + Math.cos(G.hdg)*dv.E.u[1] >= 0 ? 1 : -1;
    const izq = dv.e * sentido; // metros a la izquierda de la línea, según el avance
    const cm = Math.round(Math.abs(izq)*100), paso = 0.08;
    // Las luces se encienden en el lado hacia el que te has desviado
    const m = Math.max(-7, Math.min(7, Math.round(izq/paso)));
    leds = Array.from({length:15}, (_, i) => { const j = i - 7; if (j === 0) return "c"; const on = (m > 0 && j < 0 && -j <= m) || (m < 0 && j > 0 && j <= -m); return on ? (Math.abs(j) > 4 ? "r" : "a") : ""; });
    txt = cm <= 10 ? `En línea · ${cm} cm` : izq > 0 ? `${cm} cm · gira a la derecha ▶` : `◀ gira a la izquierda · ${cm} cm`;
    cls = cm <= 10 ? "ok" : cm <= 40 ? "warn" : "crit";
  }
  bar.innerHTML = `<div class="g-leds">${leds.map(v=>`<i class="${v}"></i>`).join("")}</div><div class="g-txt ${cls}">${txt}</div>`;
  const st = $("#gStats"); if (!st) return;
  const min = G.t0 ? (Date.now()-G.t0)/60000 : 0, ha = haCubiertas(), solape = G.bruto ? Math.max(0, 1 - ha*10000/G.bruto) : 0;
  st.innerHTML = [["Pasada", dv && G.pos ? (dv.k >= 0 ? dv.k+1 : dv.k) : "—"], ["Velocidad", `${fnum((G.vel||0)*3.6)} km/h`], ["Trabajado", `${fnum(ha)} ha`], ["Solape", `${Math.round(solape*100)} %`], ["Tiempo", `${Math.floor(min/60)}:${String(Math.floor(min%60)).padStart(2,"0")} h`], ["Precisión GPS", G.acc!=null?`±${fnum(G.acc)} m`:"—"]]
    .map(([k,v])=>`<div><span>${k}</span><b ${k==="Precisión GPS"&&G.acc>5?'class="g-bad"':""}>${v}</b></div>`).join("");
}

TABS.guia = {title: "Guiado", render(){
  const lineas = DB.lineas;
  return `<div class="g-wrap">
    <div class="g-bar" id="gBar"></div>
    <div class="g-view"><canvas id="gCanvas" aria-label="Vista de guiado"></canvas>
      <div class="g-zoom"><button class="btn" data-act="g-zoom" data-z="1.5" aria-label="Acercar">+</button><button class="btn" data-act="g-zoom" data-z="0.667" aria-label="Alejar">−</button></div></div>
    <div class="g-stats" id="gStats"></div>
    <div class="toolbar">
      ${G.run ? `<button class="btn ${G.aplicando?"primary":""}" data-act="g-apl">${G.aplicando?"■ Apero trabajando":"▶ Apero levantado"}</button><button class="btn danger" data-act="g-stop">Parar</button>` : `<button class="btn primary" data-act="g-start">Empezar con GPS</button><button class="btn" data-act="g-sim">Probar en simulación</button>`}
      <button class="btn" data-act="g-save" ${G.cells.size?"":"disabled"}>Guardar como labor</button>
      <button class="btn" data-act="g-reset" ${G.cells.size?"":"disabled"}>Borrar cobertura</button>
    </div>
  </div>
  <div class="grid2">
    <section class="panel"><h3>Línea de guiado</h3>
      <div class="fld"><label for="gAncho">Ancho de trabajo del apero (m)</label><input id="gAncho" type="number" step="0.1" min="0.5" inputmode="decimal" value="${G.ancho}"></div>
      <div class="fld"><label for="gParc">Parcela</label><select id="gParc"><option value="">Sin parcela</option>${DB.parcelas.map(p=>`<option value="${p.id}" ${p.id===G.parcela?"selected":""}>${esc(p.nombre)}</option>`).join("")}</select></div>
      <div class="toolbar"><button class="btn" data-act="g-A">Marcar A aquí</button><button class="btn" data-act="g-B" ${G.A?"":"disabled"}>Marcar B aquí</button></div>
      <div class="toolbar"><input id="gRumbo" type="text" inputmode="decimal" placeholder="Rumbo en grados" style="width:150px" aria-label="Rumbo en grados"><button class="btn" data-act="g-rumbo" ${G.A?"":"disabled"}>A + rumbo</button></div>
      <p class="muted" style="font-size:.85rem;margin:0">${G.A&&G.B?`Línea activa: ${fnum(Math.round((Math.atan2(...toXY(...G.B))*180/Math.PI+360)%360))}° · ${G.lineaId?esc(refName("lineas",G.lineaId)):"sin guardar"}`:"Recorre la primera pasada: marca A al empezar y B al final, o marca A y escribe el rumbo."}</p>
      ${G.A&&G.B&&!G.lineaId?`<div class="toolbar"><input id="gNom" type="text" placeholder="Nombre de la línea" style="flex:1 1 140px" aria-label="Nombre de la línea"><button class="btn" data-act="g-guardar-linea">Guardar línea</button></div>`:""}
    </section>
    <section class="panel"><h3>Líneas guardadas</h3>
      ${lineas.length?`<ul class="alerts">${lineas.map(l=>`<li style="border-left-color:var(--guiado)"><div><strong>${esc(l.nombre)}</strong><small>${esc(refName("parcelas",l.parcela)||"Sin parcela")} · ${fnum(l.ancho)} m</small></div><span class="when"><button class="btn" data-act="g-usar" data-id="${l.id}">Usar</button> <button class="btn" data-act="g-borrar-linea" data-id="${l.id}" aria-label="Borrar">×</button></span></li>`).join("")}</ul>`:`<p class="muted">Guarda tus líneas AB para repetir las mismas pasadas en cada labor.</p>`}
      <p class="muted" style="font-size:.82rem;margin:0">La precisión depende del GPS: un móvil da unos 2 a 5 m, suficiente para abonar o tratar con apero ancho. Para sembrar o trabajar con anchos pequeños hace falta un receptor externo con corrección RTK o SBAS.</p>
    </section>
  </div>`;
}, mount(){ pintar(); }};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (!a.startsWith("g-")) return;
  if (a === "g-start") startGPS();
  else if (a === "g-sim") simular();
  else if (a === "g-stop") pararGuiado();
  else if (a === "g-apl") { G.aplicando = !G.aplicando; render(); }
  else if (a === "g-A") marcar("A");
  else if (a === "g-B") marcar("B");
  else if (a === "g-rumbo") rumbo();
  else if (a === "g-zoom") { G.zoom = Math.max(0.2, Math.min(40, G.zoom * Number(el.dataset.z))); pintar(); }
  else if (a === "g-reset") { G.cells = new Set(); G.bruto = 0; G.track = []; G.pasadas = new Set(); G.t0 = G.run ? Date.now() : null; render(); }
  else if (a === "g-guardar-linea") { const nom = $("#gNom").value.trim() || `Línea ${DB.lineas.length+1}`; const l = {id:uid(), nombre:nom, parcela:G.parcela, ancho:G.ancho, a:G.A, b:G.B, _u:now()}; DB.lineas.push(l); G.lineaId = l.id; gSave(); save(); render(); toast("Línea guardada"); }
  else if (a === "g-usar") { const l = DB.lineas.find(x=>x.id===el.dataset.id); if (!l) return; Object.assign(G, {A:l.a, B:l.b, ancho:Number(l.ancho), parcela:l.parcela||"", lineaId:l.id, pos:null, track:[], cells:new Set(), bruto:0}); gSave(); render(); toast(`Usando ${l.nombre}`); }
  else if (a === "g-borrar-linea") { DB.lineas = DB.lineas.filter(x=>x.id!==el.dataset.id); tomb(el.dataset.id); if (G.lineaId === el.dataset.id) G.lineaId = ""; save(); render(); }
  else if (a === "g-save") {
    const ha = haCubiertas(), h = G.t0 ? (Date.now()-G.t0)/3600000 : 0, sol = G.bruto ? Math.round(Math.max(0, 1-ha*10000/G.bruto)*100) : 0;
    const desc = `Guiado GPS${G.sim?" (simulación)":""}: ${fnum(ha)} ha trabajadas, ancho ${fnum(G.ancho)} m, ${G.pasadas.size} pasadas, solape ${sol} %`;
    openForm("labores");
    const set = (k, v) => { const f = $(`#f_${k}`); if (f) f.value = v; };
    set("parcela", G.parcela); set("horas", Math.round(h*100)/100); set("descripcion", desc);
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "gAncho") { const v = Number(e.target.value); if (v > 0) { G.ancho = v; gSave(); pintar(); } }
  if (e.target.id === "gParc") { G.parcela = e.target.value; gSave(); pintar(); }
});
window.addEventListener("resize", () => { if ($("#gCanvas")) pintar(); });
/* Al salir del módulo se para el GPS */
const _render1 = render;
render = function(){ if (UI.mod !== "guiado" && G.run) pararGuiado(true); _render1(); };
