/* ============ Mapa de parcelas y apiarios ============ */
S.parcelas.fields.push({k:"geo", l:"Contorno", hide:1});
S.apiarios.fields.push({k:"lat", l:"Latitud", hide:1}, {k:"lng", l:"Longitud", hide:1});
const USO_COLOR = {TA:"#d4a017", OV:"#6b8e23", VI:"#8e3b5c", FS:"#a0522d", FY:"#e07a5f", CI:"#f4a300", HU:"#2a9d8f", PS:"#7fb069", PR:"#9c9a4a", PA:"#4f772d", FO:"#2d6a4f", IM:"#999"};
const usoColor = u => USO_COLOR[(u||"").slice(0,2)] || "#3d6e2f";

/* Superficie en hectáreas de un polígono [[lat,lng],...] (proyección local, error < 0,1 % en parcelas agrícolas) */
function areaHa(pts){
  if (!pts || pts.length < 3) return 0;
  const lat0 = pts.reduce((s,p)=>s+p[0],0)/pts.length * Math.PI/180;
  const R = 6378137, xy = pts.map(([la,lo]) => [lo*Math.PI/180*R*Math.cos(lat0), la*Math.PI/180*R]);
  let a = 0; for (let i=0;i<xy.length;i++){ const [x1,y1]=xy[i], [x2,y2]=xy[(i+1)%xy.length]; a += x1*y2 - x2*y1; }
  return Math.abs(a)/2/10000;
}
function centro(pts){ return pts && pts.length ? [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length] : null; }
function parseCoords(s){ const m = String(s||"").match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/); return m ? [Number(m[1].replace(",",".")), Number(m[2].replace(",","."))] : null; }
function apiPos(a){ if (a.lat!=null && a.lat!=="" ) return [Number(a.lat), Number(a.lng)]; return parseCoords(a.coordenadas); }
/* Coordenadas de referencia de una parcela o apiario (para el tiempo) */
function posDe(tipo, id){ if (tipo==="parcelas") { const p = DB.parcelas.find(x=>x.id===id); return centro(p?.geo); } const a = DB.apiarios.find(x=>x.id===id); return a ? apiPos(a) : null; }

let MAP = null, mapCtl = null, mapLayers = null, draw = null, gpsWatch = null, mePos = null;
TABS.mapa = {title: "Mapa", render(mod){
  const sinGeo = DB.parcelas.filter(p=>!p.geo?.length).length, sinPos = DB.apiarios.filter(a=>!apiPos(a)).length;
  return `<div class="toolbar">
    <select id="mapTarget" aria-label="Qué situar" style="width:auto;max-width:100%">
      <option value="">Dibujar o situar…</option>
      <optgroup label="Parcelas (dibujar contorno)">${DB.parcelas.map(p=>`<option value="parcelas:${p.id}">${esc(p.nombre)}${p.geo?.length?" ✓":""}</option>`).join("")}<option value="parcelas:nueva">+ Parcela nueva</option></optgroup>
      <optgroup label="Apiarios (situar punto)">${DB.apiarios.map(a=>`<option value="apiarios:${a.id}">${esc(a.nombre)}${apiPos(a)?" ✓":""}</option>`).join("")}<option value="apiarios:nuevo">+ Apiario nuevo</option></optgroup>
    </select>
    <button class="btn" data-act="map-me">◎ Mi posición</button>
    <span class="muted" style="font-size:.85rem">${sinGeo?`${sinGeo} parcela${sinGeo>1?"s":""} sin dibujar. `:""}${sinPos?`${sinPos} apiario${sinPos>1?"s":""} sin situar.`:""}</span>
  </div>
  <div class="map-box"><div id="map"></div>
    <div class="map-draw" id="mapDraw" hidden><strong id="mapDrawT"></strong><span id="mapDrawA" class="muted"></span>
      <div class="toolbar"><button class="btn" data-act="map-undo">Deshacer punto</button><button class="btn" data-act="map-gps" id="mapGpsBtn">Recorrer con GPS</button><button class="btn" data-act="map-cancel">Cancelar</button><button class="btn primary" data-act="map-ok">Guardar</button></div></div>
  </div>
  <p class="muted" style="font-size:.85rem">Toca el mapa para marcar las esquinas de la parcela, o pulsa «Recorrer con GPS» y camina o conduce por el borde. La superficie se calcula sola. Capas: ortofoto PNOA del IGN, recintos SIGPAC del FEGA y parcelario del Catastro. Toca un recinto para ver sus datos SIGPAC.</p>`;
}, mount(){ initMap(); }};

function initMap(){
  const el = $("#map"); if (!el) return;
  if (typeof L === "undefined") { el.innerHTML = `<div class="empty">No se ha podido cargar el mapa. Comprueba la conexión.</div>`; return; }
  if (MAP) { MAP.remove(); MAP = null; }
  MAP = L.map(el, {zoomControl:true, attributionControl:true});
  const orto = L.tileLayer("https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}", {maxZoom:20, maxNativeZoom:19, attribution:"PNOA © IGN"});
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"© OpenStreetMap"});
  const cat = L.tileLayer.wms("https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx", {layers:"Catastro", format:"image/png", transparent:true, attribution:"Catastro"});
  orto.addTo(MAP);
  mapCtl = L.control.layers({"Ortofoto": orto, "Mapa": osm}, {"Parcelario Catastro": cat}).addTo(MAP);
  mapLayers = L.layerGroup().addTo(MAP);
  dibujarCapas();
  const b = L.latLngBounds([]);
  DB.parcelas.forEach(p => p.geo?.forEach(q=>b.extend(q))); DB.apiarios.forEach(a => { const q = apiPos(a); if (q) b.extend(q); });
  if (b.isValid()) MAP.fitBounds(b.pad(0.2)); else MAP.setView([40.0, -3.7], 6);
  MAP.on("click", ev => { if (!draw) return; if (draw.tipo === "apiarios") draw.pts = [[ev.latlng.lat, ev.latlng.lng]]; else draw.pts.push([ev.latlng.lat, ev.latlng.lng]); dibujarDraw(); });
  setTimeout(() => MAP && MAP.invalidateSize(), 50);
}
function dibujarCapas(){
  if (!mapLayers) return; mapLayers.clearLayers();
  for (const p of DB.parcelas) if (p.geo?.length > 2 && !(draw && draw.id === p.id)) {
    const c = usoColor(p.uso);
    L.polygon(p.geo, {color:c, weight:2, fillOpacity:.25}).addTo(mapLayers)
      .bindTooltip(`${esc(p.nombre)}<br>${fnum(p.superficie)} ha`, {permanent:true, direction:"center", className:"map-lbl"})
      .bindPopup(`<strong>${esc(p.nombre)}</strong><br>${esc(p.uso||"")}<br>Ficha: ${fnum(p.superficie)} ha · Dibujo: ${fnum(areaHa(p.geo))} ha<br><button class="btn" data-edit="parcelas" data-id="${p.id}">Abrir ficha</button> <button class="btn" data-act="map-redraw" data-id="${p.id}">Redibujar</button>`);
  }
  for (const a of DB.apiarios) { const q = apiPos(a); if (!q || (draw && draw.id === a.id)) continue;
    const n = DB.colmenas.filter(c=>c.apiario===a.id&&c.estado!=="Muerta"&&c.estado!=="Vendida").length;
    L.marker(q, {icon:L.divIcon({className:"map-hive", html:`<span>${n}</span>`, iconSize:[30,30]})}).addTo(mapLayers)
      .bindPopup(`<strong>${esc(a.nombre)}</strong><br>${n} colmenas · ${esc(a.flora||"")}<br>${q[0].toFixed(5)}, ${q[1].toFixed(5)}<br><button class="btn" data-edit="apiarios" data-id="${a.id}">Abrir ficha</button>`);
  }
  if (mePos) L.circleMarker(mePos, {radius:7, color:"#fff", weight:2, fillColor:"#1f6fff", fillOpacity:1}).addTo(mapLayers);
}
let drawLayer = null;
function dibujarDraw(){
  if (drawLayer) { drawLayer.remove(); drawLayer = null; }
  if (!draw) return;
  drawLayer = L.layerGroup().addTo(MAP);
  if (draw.tipo === "parcelas") {
    if (draw.pts.length > 1) L.polygon(draw.pts, {color:"#ffcc00", weight:3, dashArray:"6 4", fillOpacity:.2}).addTo(drawLayer);
    draw.pts.forEach(q => L.circleMarker(q, {radius:5, color:"#ffcc00", fillColor:"#fff", fillOpacity:1, weight:2}).addTo(drawLayer));
    $("#mapDrawA").textContent = draw.pts.length > 2 ? `${draw.pts.length} puntos · ${fnum(areaHa(draw.pts))} ha` : `${draw.pts.length} puntos`;
  } else {
    draw.pts.forEach(q => L.circleMarker(q, {radius:9, color:"#ffcc00", fillColor:"#b8860b", fillOpacity:1, weight:3}).addTo(drawLayer));
    $("#mapDrawA").textContent = draw.pts.length ? `${draw.pts[0][0].toFixed(5)}, ${draw.pts[0][1].toFixed(5)}` : "Toca el mapa o usa el GPS";
  }
}
function empezarDibujo(tipo, id){
  const r = DB[tipo].find(x=>x.id===id);
  draw = {tipo, id, pts: tipo==="parcelas" ? [...(r?.geo||[])] : (apiPos(r)?[apiPos(r)]:[])};
  $("#mapDraw").hidden = false;
  $("#mapDrawT").textContent = tipo === "parcelas" ? `Contorno de ${r.nombre}` : `Situar ${r.nombre}`;
  $("#mapGpsBtn").textContent = tipo === "parcelas" ? "Recorrer con GPS" : "Usar mi posición";
  dibujarCapas(); dibujarDraw();
  if (draw.pts.length) MAP.fitBounds(L.latLngBounds(draw.pts).pad(0.4), {maxZoom:18});
}
function pararGps(){ if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; const b = $("#mapGpsBtn"); if (b && draw?.tipo === "parcelas") b.textContent = "Recorrer con GPS"; }
function acabarDibujo(){ pararGps(); draw = null; if (drawLayer) { drawLayer.remove(); drawLayer = null; } const d = $("#mapDraw"); if (d) d.hidden = true; const s = $("#mapTarget"); if (s) s.value = ""; dibujarCapas(); }

document.addEventListener("change", e => {
  if (e.target.id !== "mapTarget" || !e.target.value) return;
  const [tipo, id] = e.target.value.split(":");
  if (id === "nueva" || id === "nuevo") { e.target.value = ""; openForm(tipo); return; }
  empezarDibujo(tipo, id);
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "map-undo" && draw) { draw.pts.pop(); dibujarDraw(); }
  else if (a === "map-cancel") acabarDibujo();
  else if (a === "map-redraw") { MAP.closePopup(); const s = $("#mapTarget"); if (s) s.value = `parcelas:${el.dataset.id}`; draw = null; empezarDibujo("parcelas", el.dataset.id); draw.pts = []; dibujarDraw(); }
  else if (a === "map-ok" && draw) {
    const r = DB[draw.tipo].find(x=>x.id===draw.id); if (!r) return acabarDibujo();
    if (draw.tipo === "parcelas") {
      if (draw.pts.length < 3) return toast("Marca al menos 3 puntos");
      r.geo = draw.pts.map(([la,lo]) => [Math.round(la*1e7)/1e7, Math.round(lo*1e7)/1e7]);
      const ha = Math.round(areaHa(r.geo)*10000)/10000;
      if (!r.superficie) r.superficie = ha;
      toast(`Contorno guardado: ${fnum(ha)} ha${r.superficie!==ha?` (la ficha dice ${fnum(r.superficie)} ha)`:""}`);
    } else {
      if (!draw.pts.length) return toast("Toca el mapa para situar el apiario");
      r.lat = Math.round(draw.pts[0][0]*1e6)/1e6; r.lng = Math.round(draw.pts[0][1]*1e6)/1e6;
      r.coordenadas = `${r.lat}, ${r.lng}`; toast("Apiario situado");
    }
    r._u = now(); delete r._demo; save(); acabarDibujo(); render();
  }
  else if (a === "map-gps" && draw) {
    if (!navigator.geolocation) return toast("Este dispositivo no tiene GPS disponible");
    if (draw.tipo === "apiarios") { navigator.geolocation.getCurrentPosition(p => { draw.pts = [[p.coords.latitude, p.coords.longitude]]; dibujarDraw(); MAP.setView(draw.pts[0], 17); }, () => toast("No se pudo obtener la posición"), {enableHighAccuracy:true, timeout:20000}); return; }
    if (gpsWatch != null) { pararGps(); return; }
    el.textContent = "■ Parar GPS";
    gpsWatch = navigator.geolocation.watchPosition(p => {
      if (!draw) return pararGps();
      const q = [p.coords.latitude, p.coords.longitude], last = draw.pts[draw.pts.length-1];
      // Añade un punto cada 3 m para no llenar el contorno de ruido
      if (!last || MAP.distance(last, q) > 3) { draw.pts.push(q); dibujarDraw(); MAP.panTo(q); }
      $("#mapDrawA").textContent += ` · precisión ±${Math.round(p.coords.accuracy)} m`;
    }, () => { toast("No se pudo obtener la posición GPS"); pararGps(); }, {enableHighAccuracy:true, maximumAge:0});
  }
  else if (a === "map-me") {
    if (!navigator.geolocation) return toast("Este dispositivo no tiene GPS disponible");
    navigator.geolocation.getCurrentPosition(p => { mePos = [p.coords.latitude, p.coords.longitude]; dibujarCapas(); MAP?.setView(mePos, 16); }, () => toast("No se pudo obtener tu posición. Revisa los permisos de ubicación."), {enableHighAccuracy:true, timeout:20000});
  }
});
/* Al salir de la pestaña, se para el GPS */
const _render0 = render;
render = function(){ if (gpsWatch != null && !(UI.tab[UI.mod] === "mapa")) pararGps(); if (draw && UI.tab[UI.mod] !== "mapa") draw = null; if (MAP && !(isTableTabMapa())) { MAP.remove(); MAP = null; } _render0(); };
function isTableTabMapa(){ return MODS[UI.mod]?.tables && UI.tab[UI.mod] === "mapa"; }

SEEDS.push((d, add, D, ids) => {
  const p = id => d.parcelas.find(x=>x.id===id);
  // Contornos de ejemplo cerca de Villanueva (coordenadas inventadas)
  p(ids.p1).geo = [[39.1200,-3.4600],[39.1200,-3.4571],[39.1177,-3.4571],[39.1177,-3.4600]];
  p(ids.p2).geo = [[39.1170,-3.4600],[39.1170,-3.4580],[39.1154,-3.4580],[39.1154,-3.4600]];
  p(ids.p3).geo = [[39.1200,-3.4560],[39.1200,-3.4529],[39.1170,-3.4529],[39.1170,-3.4560]];
  for (const k of ["p1","p2","p3"]) p(ids[k]).superficie = Math.round(areaHa(p(ids[k]).geo)*100)/100;
  const a = id => d.apiarios.find(x=>x.id===id);
  Object.assign(a(ids.a1), {lat:39.1212, lng:-3.4545, coordenadas:"39.1212, -3.4545"}); Object.assign(a(ids.a2), {lat:39.1148, lng:-3.4520, coordenadas:"39.1148, -3.452"});
});
