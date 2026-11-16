/* ============ Satélite: vigor del cultivo (NDVI de Sentinel-2) en cada parcela, cada pocos días ============ */
/* Imágenes Sentinel-2 (Copernicus, gratuitas) servidas por el catálogo público de Microsoft Planetary Computer, sin clave.
   El satélite pasa cada 2-5 días; con nubes la imagen no sirve y se descarta. */
const PC = "https://planetarycomputer.microsoft.com";
const SAT_KEY = "mi-explotacion-satelite";
const EXPRS = [{e:"(B08-B04)/(B08+B04)", extra:"&asset_as_band=True"}, {e:"(B08_b1-B04_b1)/(B08_b1+B04_b1)", extra:"&assets=B08&assets=B04"}];
let satCache = {}; try { satCache = JSON.parse(localStorage.getItem(SAT_KEY) || "{}"); } catch(e) {}
const satSave = () => { try { localStorage.setItem(SAT_KEY, JSON.stringify(satCache)); } catch(e) {} };
const satExpr = () => EXPRS[satCache._v || 0];
const geoJSON = p => ({type:"Polygon", coordinates:[[...p.geo.map(([la, lo]) => [lo, la]), [p.geo[0][1], p.geo[0][0]]]]});
const huella = p => p.geo.map(q=>q.map(x=>x.toFixed(5)).join(",")).join(";");
function conTiempo(url, opt = {}, ms = 25000){ const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(url, {...opt, signal:c.signal}).finally(() => clearTimeout(t)); }
/* Imágenes de los últimos meses con pocas nubes sobre la parcela (una por día) */
async function buscarImagenes(p, dias = 150){
  const body = {collections:["sentinel-2-l2a"], intersects:geoJSON(p), datetime:`${addDays(today(), -dias)}T00:00:00Z/${today()}T23:59:59Z`, query:{"eo:cloud_cover":{lt:40}}, sortby:[{field:"datetime", direction:"desc"}], limit:60};
  const r = await conTiempo(`${PC}/api/stac/v1/search`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  if (!r.ok) throw new Error(`catálogo ${r.status}`);
  const j = await r.json(), porDia = {};
  for (const f of j.features || []) { const d = (f.properties?.datetime || "").slice(0,10), cc = f.properties?.["eo:cloud_cover"] ?? 100; if (!porDia[d] || cc < porDia[d].cc) porDia[d] = {id:f.id, f:d, cc}; }
  return Object.values(porDia).sort((a,b)=>b.f.localeCompare(a.f));
}
/* Estadística del NDVI dentro del contorno de la parcela */
function buscaStats(o){ if (!o || typeof o !== "object") return null; if (typeof o.mean === "number") return o; for (const v of Object.values(o)) { const s = buscaStats(v); if (s) return s; } return null; }
async function statsNDVI(p, img){
  const feat = {type:"Feature", properties:{}, geometry:geoJSON(p)};
  for (let k = 0; k < EXPRS.length; k++) {
    const i = ((satCache._v || 0) + k) % EXPRS.length, x = EXPRS[i];
    const u = `${PC}/api/data/v1/item/statistics?collection=sentinel-2-l2a&item=${encodeURIComponent(img.id)}&expression=${encodeURIComponent(x.e)}${x.extra}&nodata=0&histogram_bins=24&histogram_range=-0.2,1`;
    let r; try { r = await conTiempo(u, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(feat)}); } catch(e) { throw e; }
    if (r.status >= 400 && r.status < 500) continue;
    if (!r.ok) throw new Error(`estadística ${r.status}`);
    const s = buscaStats(await r.json()); if (!s) continue;
    if (satCache._v !== i) { satCache._v = i; satSave(); }
    // Parte de la parcela claramente más floja que la media (0,15 de NDVI por debajo)
    let weak = 0; const h = s.histogram; if (Array.isArray(h) && h.length === 2) { const [cnt, ed] = h, tot = cnt.reduce((a,b)=>a+b,0) || 1; for (let j=0;j<cnt.length;j++) if (ed[j+1] <= s.mean - 0.15) weak += cnt[j]; weak = weak / tot * 100; }
    return {mean:s.mean, min:s.min, max:s.max, p10:s.percentile_2 ?? s.min, weak:Math.round(weak), valid:s.valid_percent ?? 100};
  }
  throw new Error("formato no reconocido");
}
/* Actualiza las imágenes de una parcela (solo calcula las nuevas) */
async function actualizarSat(p, max = 10, onProg){
  const h = huella(p), c = satCache[p.id]?.h === h ? satCache[p.id] : {h, imgs:[]};
  const imgs = await buscarImagenes(p), hechas = new Map(c.imgs.map(i=>[i.id, i]));
  const nuevas = imgs.slice(0, max).filter(i=>!hechas.has(i.id));
  let n = 0;
  for (const img of nuevas) { try { const s = await statsNDVI(p, img); hechas.set(img.id, {...img, ...s}); } catch(e) { if (!n && !hechas.size) throw e; } n++; onProg && onProg(n, nuevas.length); }
  c.imgs = [...hechas.values()].filter(i=>typeof i.mean === "number").sort((a,b)=>b.f.localeCompare(a.f)).slice(0, 30); c.t = Date.now();
  satCache[p.id] = c; satSave(); return c;
}
/* Una imagen con nubes o sombra baja mucho el NDVI de golpe: se marca como dudosa si cae y la siguiente se recupera */
function imgsLimpias(L){
  const out = L.filter(i=>i.valid >= 60);
  return out.map((i, k) => { const ant = out[k+1], sig = out[k-1]; const dudosa = i.cc > 15 && ant && sig && i.mean < ant.mean - 0.12 && sig.mean > i.mean + 0.1; return {...i, dudosa}; });
}
const nivelVigor = v => v < 0.2 ? ["Suelo desnudo o rastrojo", ""] : v < 0.35 ? ["Vigor bajo", "warn"] : v < 0.55 ? ["Vigor medio", ""] : ["Vigor alto", "ok"];
function lecturaSat(p, L){
  const ok = L.filter(i=>!i.dudosa), u = ok[0], a = ok[1]; if (!u) return null;
  const leñoso = /OV|VI|FS|FY/.test((p.uso||"").slice(0,2)), out = [];
  const [nv, cls] = nivelVigor(u.mean);
  out.push({lv:cls, t:`${nv}: NDVI ${fnum(Math.round(u.mean*100)/100)} el ${fdate(u.f)}`});
  if (a) { const d = u.mean - a.mean; if (d <= -0.08) out.push({lv:"warn", t:`Ha bajado ${fnum(Math.round(-d*100)/100)} desde el ${fdate(a.f)}`, s:"Si no es por cosecha, siega o labor, conviene mirar la parcela: sequía, plaga, helada o falta de abono."}); else if (d >= 0.08) out.push({lv:"ok", t:`Ha subido ${fnum(Math.round(d*100)/100)} desde el ${fdate(a.f)}`}); else out.push({lv:"", t:`Estable desde el ${fdate(a.f)}`}); }
  if (u.weak >= 15) out.push({lv:"warn", t:`Un ${u.weak} % de la parcela va más flojo que el resto`, s:"Son las zonas en rojo o naranja del mapa. Revisa si coinciden con manchas de suelo, encharcamiento, fallos de siembra o de riego."});
  if (leñoso) out.push({lv:"", t:"En olivar, viñedo y frutos secos el suelo entre filas baja el NDVI: compara la parcela consigo misma, no con un cereal."});
  return out;
}
function graficoNDVI(L){
  const pts = L.slice().reverse(); if (pts.length < 2) return "";
  const xs = pts.map(i=>new Date(i.f).getTime()), x0 = Math.min(...xs), x1 = Math.max(...xs), W = 340, H = 110, Y = v => H - Math.max(0, Math.min(1, v)) * H, X = t => (t - x0) / (x1 - x0 || 1) * W;
  return `<svg viewBox="-24 -6 ${W+30} ${H+22}" class="sat-g" role="img" aria-label="Evolución del vigor">
    ${[0, 0.25, 0.5, 0.75].map(v=>`<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="-4" y="${Y(v)+3}" text-anchor="end" font-size="9" fill="var(--muted)">${String(v).replace(".", ",")}</text>`).join("")}
    <polyline fill="none" stroke="var(--agri)" stroke-width="2" points="${pts.filter(i=>!i.dudosa).map(i=>`${X(new Date(i.f).getTime()).toFixed(1)},${Y(i.mean).toFixed(1)}`).join(" ")}"/>
    ${pts.map(i=>`<circle cx="${X(new Date(i.f).getTime()).toFixed(1)}" cy="${Y(i.mean).toFixed(1)}" r="3.5" fill="${i.dudosa?"var(--surface)":"var(--agri)"}" stroke="var(--agri)"><title>${fdate(i.f)} · NDVI ${fnum(Math.round(i.mean*100)/100)}${i.dudosa?" (posible nube)":""}</title></circle>`).join("")}
    <text x="0" y="${H+16}" font-size="9" fill="var(--muted)">${fdate(pts[0].f)}</text><text x="${W}" y="${H+16}" font-size="9" text-anchor="end" fill="var(--muted)">${fdate(pts[pts.length-1].f)}</text></svg>`;
}
UI.satP = UI.satP || ""; UI.satImg = UI.satImg || ""; UI.satCapa = UI.satCapa || "ndvi";
let satMsg = "", SATMAP = null;
TABS.satelite = {title: "Satélite", render(){
  const P = DB.parcelas.filter(p=>p.geo?.length > 2);
  if (!P.length) return `<div class="empty">Dibuja el contorno de tus parcelas en la pestaña <button class="btn" data-go="agri" data-tab="mapa">Mapa</button> (o impórtalo de la PAC) para ver su vigor desde el satélite.</div>`;
  if (!P.some(p=>p.id===UI.satP)) UI.satP = P[0].id;
  const p = P.find(x=>x.id===UI.satP), c = satCache[p.id]?.h === huella(p) ? satCache[p.id] : null, L = c ? imgsLimpias(c.imgs) : [];
  if (!L.some(i=>i.id===UI.satImg)) UI.satImg = L.find(i=>!i.dudosa)?.id || L[0]?.id || "";
  const lec = lecturaSat(p, L), cen = centro(p.geo);
  return `<div class="toolbar"><select id="satP" aria-label="Parcela" style="width:auto">${P.map(x=>`<option value="${x.id}" ${x.id===p.id?"selected":""}>${esc(x.nombre)}${satCache[x.id]?.imgs?.length?"":" · sin datos"}</option>`).join("")}</select>
    <button class="btn primary" data-act="sat-act">${c ? "Buscar imágenes nuevas" : "Ver el vigor de esta parcela"}</button>
    <button class="btn" data-act="sat-todas">Actualizar todas</button>
    <a class="btn" target="_blank" rel="noopener" href="https://browser.dataspace.copernicus.eu/?zoom=15&lat=${cen[0].toFixed(5)}&lng=${cen[1].toFixed(5)}&datasetId=S2_L2A_CDAS&layerId=3_NDVI">Visor de Copernicus</a></div>
  <p id="satMsg" class="muted" style="margin:0">${satMsg || (c ? `Última consulta: ${new Date(c.t).toLocaleString("es-ES")}. ${L.length} imágenes sin nubes en los últimos 5 meses.` : "El NDVI mide lo verde y activo que está el cultivo: de 0 (suelo) a casi 1 (cultivo muy vigoroso). Se calcula con las imágenes del satélite Sentinel-2.")}</p>
  ${L.length ? `<div class="grid2">
    <section class="panel"><h3>Cómo va ${esc(p.nombre)}</h3>
      ${lec ? `<ul class="alerts">${lec.map(a=>`<li class="${a.lv}"><div><strong>${esc(a.t)}</strong>${a.s?`<small>${esc(a.s)}</small>`:""}</div></li>`).join("")}</ul>` : ""}
      ${graficoNDVI(L)}
      <div class="sat-dias">${L.map(i=>`<button class="btn ${i.id===UI.satImg?"primary":""}" data-act="sat-img" data-id="${esc(i.id)}" title="Nubes en la escena: ${Math.round(i.cc)} %">${fdate(i.f).slice(0,5)} · ${fnum(Math.round(i.mean*100)/100)}${i.dudosa?" ☁":""}</button>`).join("")}</div>
      <div class="toolbar"><button class="btn" data-act="sat-revisar" data-pid="${p.id}">+ Recordatorio para ir a mirarla</button></div>
    </section>
    <section class="panel"><div class="head"><h3>Mapa de vigor</h3><select id="satCapa" style="width:auto" aria-label="Capa"><option value="ndvi" ${UI.satCapa==="ndvi"?"selected":""}>Vigor (NDVI)</option><option value="color" ${UI.satCapa==="color"?"selected":""}>Color real</option></select></div>
      <div id="satMap"></div>
      <p class="muted" style="font-size:.82rem;margin:0"><span class="sat-ley"></span> Rojo: poco vigor · amarillo: medio · verde: mucho. Cada cuadradito son 10 × 10 m. Imagen del ${fdate(L.find(i=>i.id===UI.satImg)?.f)}.</p></section></div>` : ""}
  <p class="muted" style="font-size:.82rem">Imágenes Sentinel-2 del programa Copernicus de la Unión Europea, servidas gratis por Microsoft Planetary Computer. Necesita conexión. Las nubes y sus sombras falsean el dato: las imágenes que parecen afectadas se marcan con ☁ y no cuentan en los avisos.</p>`;
}, mount(){ montarSatMapa(); }};
function montarSatMapa(){
  const el = $("#satMap"); if (!el || typeof L === "undefined") return;
  const p = DB.parcelas.find(x=>x.id===UI.satP), img = UI.satImg; if (!p || !img) return;
  if (SATMAP) { SATMAP.remove(); SATMAP = null; }
  SATMAP = L.map(el, {zoomControl:true, attributionControl:true});
  L.tileLayer("https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}", {maxZoom:19, attribution:"PNOA © IGN"}).addTo(SATMAP);
  const x = satExpr(), base = `${PC}/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=sentinel-2-l2a&item=${encodeURIComponent(img)}`;
  const url = UI.satCapa === "color" ? `${base}&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0` : `${base}&expression=${encodeURIComponent(x.e)}${x.extra}&rescale=0,0.85&colormap_name=rdylgn&nodata=0`;
  const capa = L.tileLayer(url, {maxZoom:19, maxNativeZoom:16, opacity:0.85, attribution:"Copernicus Sentinel-2 · Planetary Computer"}).addTo(SATMAP);
  capa.on("tileerror", () => { const m = $("#satMsg"); if (m && !m.dataset.err) { m.dataset.err = 1; m.textContent = "No se ha podido dibujar la imagen del satélite sobre el mapa. Los datos de vigor siguen siendo válidos; puedes ver la imagen en el visor de Copernicus."; } });
  // Oscurece lo que queda fuera de la parcela para centrar la vista
  const mundo = [[85,-180],[85,180],[-85,180],[-85,-180]];
  L.polygon([mundo, p.geo], {stroke:false, fillColor:"#000", fillOpacity:0.45, interactive:false}).addTo(SATMAP);
  const pol = L.polygon(p.geo, {color:"#fff", weight:2, fill:false}).addTo(SATMAP);
  SATMAP.fitBounds(pol.getBounds().pad(0.15));
  setTimeout(() => SATMAP && SATMAP.invalidateSize(), 50);
}
async function satActualizar(ids){
  const P = DB.parcelas.filter(p=>ids.includes(p.id) && p.geo?.length > 2); let ok = 0, err = "";
  for (const [k, p] of P.entries()) {
    satMsg = `Consultando el satélite${P.length>1?` (${k+1} de ${P.length}: ${p.nombre})`:""}…`; const m = $("#satMsg"); if (m) m.textContent = satMsg;
    try { await actualizarSat(p, 10, (n, t) => { const e = $("#satMsg"); if (e) e.textContent = `${satMsg} imagen ${n} de ${t}`; }); ok++; }
    catch(e) { err = e.name === "AbortError" ? "el servicio tarda demasiado" : e.message; }
  }
  satMsg = err && !ok ? `No se ha podido consultar el satélite (${navigator.onLine ? err : "sin conexión"}). Inténtalo más tarde o usa el visor de Copernicus.` : "";
  if (UI.mod === "agri" && UI.tab.agri === "satelite") render();
}
document.addEventListener("change", e => {
  if (e.target.id === "satP") { UI.satP = e.target.value; UI.satImg = ""; satMsg = ""; render(); }
  if (e.target.id === "satCapa") { UI.satCapa = e.target.value; montarSatMapa(); }
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act;
  if (a === "sat-act") satActualizar([UI.satP]);
  else if (a === "sat-todas") satActualizar(DB.parcelas.filter(p=>p.geo?.length > 2).map(p=>p.id));
  else if (a === "sat-img") { UI.satImg = el.dataset.id; render(); }
  else if (a === "sat-revisar") { const p = DB.parcelas.find(x=>x.id===el.dataset.pid); openForm("recordatorios"); const set = (k, v) => { const f = $(`#f_${k}`); if (f) f.value = v; };
    set("titulo", `Mirar las zonas flojas de ${p?.nombre||"la parcela"} (satélite)`); set("fecha", addDays(today(), 1)); set("tipo", "Labor"); set("modulo", "Agrícola"); }
});
{ const t = MODS.agri.tables, i = t.indexOf("mapa"); t.splice(i + 1, 0, "satelite"); }
/* Revisión automática semanal de todas las parcelas dibujadas, cuando hay conexión */
async function revisarSatelite(){
  if (!navigator.onLine || UI.mod === "agri" && UI.tab.agri === "satelite") return;
  if (satCache._auto && Date.now() - satCache._auto < 6*864e5) return;
  const P = DB.parcelas.filter(p=>p.geo?.length > 2 && !p._demo).slice(0, 12); if (!P.length) return;
  satCache._auto = Date.now(); satSave();
  for (const p of P) { try { await actualizarSat(p, 3); } catch(e) { return; } }
  if (UI.mod === "inicio") render();
}
setTimeout(() => revisarSatelite().catch(()=>{}), 12000);
ALERTS.push(() => DB.parcelas.flatMap(p => {
  const c = satCache[p.id]; if (!c || !p.geo || c.h !== huella(p)) return [];
  const L = imgsLimpias(c.imgs).filter(i=>!i.dudosa), u = L[0], a = L[1]; if (!u || daysBetween(u.f, today()) > 20) return [];
  const A = [];
  if (a && u.mean - a.mean <= -0.1) A.push({lv:"warn", t:`El vigor de ${p.nombre} ha bajado`, s:`NDVI ${fnum(Math.round(a.mean*100)/100)} → ${fnum(Math.round(u.mean*100)/100)} según el satélite`, d:"", mod:"agri", tab:"satelite"});
  if (u.weak >= 20 && u.mean >= 0.25) A.push({lv:"warn", t:`Zonas flojas en ${p.nombre}`, s:`Un ${u.weak} % de la parcela va peor que el resto (satélite del ${fdate(u.f)})`, d:"", mod:"agri", tab:"satelite"});
  return A;
}));
