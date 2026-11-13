/* ============ Visor SIGPAC dentro del Mapa (servicio WMS público del FEGA) ============ */
const SIGPAC_WMS = "https://sigpac-hubcloud.es/wms";
const SIGPAC_VISOR = "https://sigpac.mapa.gob.es/fega/visor/";
let sigLayer = null, sigUlt = null;
const sigOn = () => !!(MAP && sigLayer && MAP.hasLayer(sigLayer));
const sigRef = d => [d.provincia, d.municipio, d.agregado ?? 0, d.zona ?? 0, d.poligono, d.parcela, d.recinto].map(x => x ?? "").join(":");
const SIG_USOS = {TA:"Tierra arable", OV:"Olivar", VI:"Viñedo", PS:"Pastizal", PR:"Pasto arbustivo", PA:"Pasto con arbolado", FY:"Frutales", FS:"Frutos secos", FL:"Frutos secos y olivar", FO:"Forestal", IM:"Improductivo", CA:"Viales", ED:"Edificaciones", ZU:"Zona urbana", AG:"Corrientes y superficies de agua", TH:"Huerta", CI:"Cítricos", OF:"Olivar-frutal", VF:"Viñedo-frutal", VO:"Viñedo-olivar", ZC:"Zona concentrada", IV:"Invernaderos", MT:"Matorral", FV:"Frutal-viñedo"};
/* Normaliza las propiedades que devuelve el servicio (los nombres pueden variar) */
function sigDatos(pr){
  const g = (...k) => { for (const x of k) for (const y of Object.keys(pr)) if (y.toLowerCase() === x) return pr[y]; return undefined; };
  const sup = Number(g("superficie","dn_surface","area"));
  return {provincia:g("provincia"), municipio:g("municipio"), agregado:g("agregado"), zona:g("zona"), poligono:g("poligono"), parcela:g("parcela"), recinto:g("recinto"),
    superficie: isFinite(sup) && sup ? (sup > 1000 ? sup/10000 : sup) : null, uso:g("uso_sigpac","uso"), pendiente:g("pendiente_media","pendiente"), regadio:g("coef_regadio","coef_regadio_"), admis:g("admisibilidad"), region:g("region"), incid:g("incidencias"), raw:pr};
}
/* Convierte la geometría GeoJSON (EPSG:3857 o grados) a [[lat,lng],...] */
function sigAnillo(geom){
  if (!geom) return null; let c = geom.coordinates; if (!c) return null;
  if (geom.type === "MultiPolygon") c = c.sort((a,b)=>b[0].length-a[0].length)[0];
  const ring = c[0]; if (!ring?.length) return null;
  const merc = Math.abs(ring[0][0]) > 180 || Math.abs(ring[0][1]) > 90;
  return ring.map(([x,y]) => { if (merc) { const ll = L.CRS.EPSG3857.unproject(L.point(x,y)); return [ll.lat, ll.lng]; } return Math.abs(x) > Math.abs(y) ? [x,y] : [y,x]; });
}
function sigUrl(latlng, fmt){
  const sz = MAP.getSize(), b = MAP.getBounds(), sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast()), pt = MAP.latLngToContainerPoint(latlng).round();
  const q = {SERVICE:"WMS", VERSION:"1.3.0", REQUEST:"GetFeatureInfo", LAYERS:"AU.Sigpac:recinto", QUERY_LAYERS:"AU.Sigpac:recinto", STYLES:"", CRS:"EPSG:3857",
    BBOX:[sw.x, sw.y, ne.x, ne.y].join(","), WIDTH:sz.x, HEIGHT:sz.y, I:pt.x, J:pt.y, INFO_FORMAT:fmt, FEATURE_COUNT:1};
  return `${SIGPAC_WMS}?${new URLSearchParams(q)}`;
}
async function sigConsulta(latlng){
  if (!navigator.onLine) { L.popup().setLatLng(latlng).setContent(`<p style="margin:0">Sin conexión: el SIGPAC necesita internet.</p>`).openOn(MAP); return; }
  const pop = L.popup({maxWidth:300}).setLatLng(latlng).setContent(`<p class="muted" style="margin:0">Consultando el SIGPAC…</p>`).openOn(MAP);
  const html = sigUrl(latlng, "text/html");
  try {
    const r = await fetch(sigUrl(latlng, "application/json")); if (!r.ok) throw new Error(r.status);
    const j = await r.json(), f = j.features?.[0];
    if (!f) { pop.setContent(`<p style="margin:0">Aquí no hay ningún recinto SIGPAC.</p>`); return; }
    const d = sigDatos(f.properties || {}); d.geo = sigAnillo(f.geometry); sigUlt = d;
    const uso = d.uso ? `${esc(d.uso)}${SIG_USOS[d.uso]?` · ${SIG_USOS[d.uso]}`:""}` : "—";
    const mia = DB.parcelas.find(p => String(p.poligono) === String(d.poligono) && String(p.parcela) === String(d.parcela) && String(p.recinto||"") === String(d.recinto||""));
    pop.setContent(`<div class="sig-pop"><strong>Recinto SIGPAC</strong><div class="sig-ref">${esc(sigRef(d))}</div>
      <dl class="kv"><dt>Prov./Mun.</dt><dd>${esc(d.provincia??"")} / ${esc(d.municipio??"")}</dd><dt>Pol./Par./Rec.</dt><dd>${esc(d.poligono??"")} / ${esc(d.parcela??"")} / ${esc(d.recinto??"")}</dd>
      <dt>Superficie</dt><dd>${d.superficie?fnum(Math.round(d.superficie*10000)/10000)+" ha":"—"}</dd><dt>Uso</dt><dd>${uso}</dd>
      ${d.pendiente!=null?`<dt>Pendiente</dt><dd>${fnum(Number(d.pendiente)/10)} %</dd>`:""}${d.regadio!=null?`<dt>Coef. regadío</dt><dd>${esc(d.regadio)}</dd>`:""}${d.admis!=null?`<dt>Admisibilidad</dt><dd>${esc(d.admis)}</dd>`:""}${d.region!=null?`<dt>Región</dt><dd>${esc(d.region)}</dd>`:""}${d.incid?`<dt>Incidencias</dt><dd>${esc(d.incid)}</dd>`:""}</dl>
      <div class="toolbar">${mia?`<button class="btn" data-edit="parcelas" data-id="${mia.id}">Ver ${esc(mia.nombre)}</button>${!mia.geo?.length&&d.geo?`<button class="btn" data-act="sig-geo" data-id="${mia.id}">Usar su contorno</button>`:""}`:`<button class="btn primary" data-act="sig-nueva">Añadir como parcela</button>`}
      <button class="btn" data-act="sig-visor">Visor oficial</button></div></div>`);
  } catch(e) {
    pop.setContent(`<p style="margin:0 0 6px">No se pudieron leer los datos aquí.</p><div class="toolbar"><a class="btn" href="${esc(html)}" target="_blank" rel="noopener">Ver ficha del recinto</a><a class="btn" href="${SIGPAC_VISOR}" target="_blank" rel="noopener">Visor oficial</a></div>`);
  }
}
{ const _im = initMap; initMap = function(){ _im(); if (!MAP || typeof L === "undefined") return;
    sigLayer = L.tileLayer.wms(SIGPAC_WMS, {layers:"AU.Sigpac:recinto", styles:"recinto", format:"image/png", transparent:true, version:"1.3.0", maxZoom:20, minZoom:13, attribution:"SIGPAC © FEGA"});
    mapCtl?.addOverlay(sigLayer, "Recintos SIGPAC");
    let on = true; try { on = localStorage.getItem("sigpac-capa") !== "0"; } catch(e) {}
    if (on) sigLayer.addTo(MAP);
    MAP.on("overlayadd overlayremove", ev => { if (ev.layer === sigLayer) try { localStorage.setItem("sigpac-capa", ev.type === "overlayadd" ? "1" : "0"); } catch(e) {} });
    MAP.on("click", ev => { if (draw || !sigOn()) return; if (MAP.getZoom() < 14) { L.popup().setLatLng(ev.latlng).setContent(`<p style="margin:0">Acércate más para consultar un recinto SIGPAC.</p>`).openOn(MAP); return; } sigConsulta(ev.latlng); });
    const nota = document.createElement("div"); nota.className = "sig-off"; nota.id = "sigOff"; nota.textContent = "Sin conexión: la ortofoto y el SIGPAC no se pueden cargar."; nota.hidden = navigator.onLine; $("#map")?.parentNode.append(nota);
  }; }
addEventListener("online", () => { const n = $("#sigOff"); if (n) n.hidden = true; sigLayer?.redraw(); });
addEventListener("offline", () => { const n = $("#sigOff"); if (n) n.hidden = false; });
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act, d = sigUlt;
  if (a === "sig-visor") { if (d) { try { await navigator.clipboard.writeText(sigRef(d)); toast("Referencia SIGPAC copiada: pégala en el buscador del visor"); } catch(err) {} } window.open(SIGPAC_VISOR, "_blank", "noopener"); }
  else if (a === "sig-nueva" && d) {
    MAP?.closePopup(); openForm("parcelas");
    const set = (k, v) => { const f = $(`#f_${k}`); if (!f || v == null || v === "") return; if (f.tagName === "SELECT") { const o = [...f.options].find(o => o.value === v || o.value.startsWith(`${v} `) || o.text.startsWith(`${v} `)); if (!o) return; f.value = o.value; } else f.value = v; f.dispatchEvent(new Event("input", {bubbles:true})); };
    set("nombre", `Pol. ${d.poligono} Par. ${d.parcela}${d.recinto!=null?` Rec. ${d.recinto}`:""}`); set("municipio", String(d.municipio??"")); set("provincia", String(d.provincia??""));
    set("poligono", d.poligono); set("parcela", d.parcela); set("recinto", d.recinto); if (d.superficie) set("superficie", Math.round(d.superficie*10000)/10000); set("uso", d.uso);
    UI.sigGeo = d.geo || null; toast("Revisa los datos y guarda la parcela");
  }
  else if (a === "sig-geo" && d?.geo) { const p = DB.parcelas.find(x=>x.id===el.dataset.id); if (!p) return; p.geo = d.geo; p._u = now(); delete p._demo; save(); MAP?.closePopup(); dibujarCapas(); toast(`Contorno guardado (${fnum(Math.round(areaHa(p.geo)*100)/100)} ha)`); }
});
/* Al guardar una parcela creada desde el SIGPAC, se le pone el contorno del recinto */
FORM_EXTRA.push({html: () => "", mount(t, r){ if (t !== "parcelas" || r) UI.sigGeo = null; },
  collect(t, rec){ if (t === "parcelas" && UI.sigGeo && !rec.geo?.length) rec.geo = UI.sigGeo; UI.sigGeo = null; }});
