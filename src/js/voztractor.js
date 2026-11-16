/* ============ Cuaderno por voz en el tractor: dictar el tratamiento al acabar y la parcela sale del GPS ============ */
/* Ejemplos: «Tratado con cobre a dos kilos por hectárea contra repilo», «Abonado con urea a doscientos kilos», «Regado seis horas» */
const UNIDADES_VOZ = [[/litros? por hectarea|l\/ha/, "L/ha"], [/kilos? por hectarea|kilogramos? por hectarea|kg\/ha/, "kg/ha"], [/(centimetros cubicos|cc|mililitros) por (hectolitro|cien litros)/, "cc/hL"], [/gramos? por (hectolitro|cien litros)/, "g/hL"], [/por ciento|%/, "%"]];
const NUM_VOZ = "(\\d+(?:[.,]\\d+)?|(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil)(?:\\s+(?:y\\s+)?(?:media|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|quinientos|mil))*)";
const NUM2 = {sesenta:60, setenta:70, ochenta:80, noventa:90, cien:100, ciento:100, doscientos:200, trescientos:300, cuatrocientos:400, quinientos:500, seiscientos:600, setecientos:700, ochocientos:800, novecientos:900, mil:1000};
function numVoz(txt){
  const t = norm(txt).trim(); if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  let n = 0, hay = false; for (const w of t.split(/\s+/)) { if (w === "y") continue; const v = NUM[w] ?? NUM2[w]; if (v == null) continue; hay = true; if (w === "mil") n = (n || 1) * 1000; else n += v; }
  return hay ? n : null;
}
function interpretarTratamiento(txt){
  const t = norm(txt), r = {};
  r.tipo = /abon|urea|nitrato|complejo|fertiliz|sulfato amonico|cobertera/.test(t) ? "abonados" : /\breg(ado|ar|ue|amos|ando)|riego/.test(t) ? "riegos" : "fitosanitarios";
  if (/\bayer\b/.test(t)) r.fecha = addDays(today(), -1); else r.fecha = today();
  if (r.tipo === "riegos") {
    const h = t.match(new RegExp(`${NUM_VOZ}(?: y media)? horas?`)); if (h) r.horas = (numVoz(h[1]) || 0) + (/y media horas?$/.test(h[0]) || /horas? y media/.test(t) ? 0.5 : 0);
    const m = t.match(new RegExp(`${NUM_VOZ} (?:metros cubicos|m3|metros)`)); if (m) r.m3 = numVoz(m[1]);
    return r;
  }
  // Producto: el del almacén que mejor encaje por nombre o por materia activa
  const tipos = r.tipo === "abonados" ? ["Abono"] : ["Fitosanitario"];
  const P = DB.productos.filter(p=>tipos.includes(p.tipo));
  const p = mejor(P, x=>x.nombre, txt) || mejor(P, x=>(x.materia||"").replace(/\d+\s*%/g, ""), txt);
  if (p) r.prod = p;
  else { const m = t.match(/(?:con|de)\s+(?:el |la |los |las )?([a-z0-9][a-z0-9\s\-]{2,30}?)(?=\s+(?:a|al|contra|para|en|por)\b|\s+\d|$)/); if (m) r.producto = m[1].trim().replace(/^\w/, c=>c.toUpperCase()); }
  // Dosis y unidad
  const dz = t.match(new RegExp(`(?:a|dosis(?: de)?)?\\s*\\b${NUM_VOZ}(?: y medio| y media| coma (\\w+))?\\s*(litros?|kilos?|kilogramos?|kg|centimetros cubicos|cc|mililitros|gramos?|por ciento)([^,.]*)`));
  if (dz) { let v = numVoz(dz[1]); if (/y medi[oa]/.test(dz[0])) v += 0.5; if (dz[2]) { const dec = numVoz(dz[2]); if (dec != null) v = Number(`${Math.floor(v)}.${dec}`); }
    r.dosis = v; const resto = `${dz[3]}${dz[4]}`; r.unidad = (UNIDADES_VOZ.find(([re]) => re.test(resto)) || [, /litro/.test(dz[3]) ? "L/ha" : /gramo/.test(dz[3]) ? "g/hL" : /cc|centimetro|mililitro/.test(dz[3]) ? "cc/hL" : /ciento/.test(dz[3]) ? "%" : "kg/ha"])[1]; }
  const pr = t.match(/(?:contra|para)\s+(?:el |la |los |las )?([a-z\s]{3,40}?)(?=\s+(?:en|con|a|al|por|hoy|ayer)\b|[,.]|$)/); if (pr) r.problema = pr[1].trim().replace(/^\w/, c=>c.toUpperCase());
  const ha = t.match(new RegExp(`${NUM_VOZ}(?: y media)? hectareas?`)); if (ha) r.sup = (numVoz(ha[1]) || 0) + (/y media hectareas?$/.test(ha[0]) ? 0.5 : 0);
  const pn = mejor(DB.parcelas, x=>x.nombre, txt); if (pn) r.parcelaDicha = pn;
  const w = mejor(DB.trabajadores, x=>x.nombre, txt); if (w) r.trab = w;
  return r;
}
/* Aplicador y equipo: los del último tratamiento, o el trabajador con carné */
function ultimoDe(t, k){ return DB[t].filter(r=>r[k]).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""))[0]?.[k] || ""; }
async function abrirTratamientoVoz(txt, pos){
  const r = interpretarTratamiento(txt);
  const enGPS = pos ? parcelaEn(pos[0], pos[1]) : null, parc = r.parcelaDicha || enGPS?.p || null;
  openForm(r.tipo);
  const set = (k, v) => { const f = $(`#f_${k}`); if (f && v != null && v !== "") { f.value = v; f.dispatchEvent(new Event("change", {bubbles:true})); } };
  set("fecha", r.fecha);
  if (parc) set("parcela", parc.id);
  const ha = r.sup || Number(parc?.superficie || 0);
  if (r.tipo === "riegos") { set("horas", r.horas); set("m3", r.m3); }
  else {
    if (r.prod) { set("prod", r.prod.id); set("producto", r.prod.nombre); } else set("producto", r.producto);
    if (r.tipo === "fitosanitarios") {
      set("problema", r.problema); set("dosis", r.dosis); set("unidad", r.unidad); set("sup_tratada", ha || "");
      const cu = parc ? DB.cultivos.filter(c=>c.parcela===parc.id).sort((a,b)=>Number(b.campana)-Number(a.campana))[0] : null; if (cu) set("cultivo", cu.cultivo);
      const w = r.trab || DB.trabajadores.find(x=>x.activo && x.carne && x.carne !== "No tiene");
      set("aplicador", w ? `${w.nombre}${w.carne && w.carne !== "No tiene" ? " · carné " + w.carne.toLowerCase() : ""}` : ultimoDe("fitosanitarios", "aplicador"));
      set("equipo", ultimoDe("fitosanitarios", "equipo"));
      // Gasto del almacén: dosis × hectáreas cuando la unidad coincide
      if (r.prod && r.dosis && ha) { const u = (r.prod.unidad||"").toLowerCase(); if ((r.unidad === "L/ha" && u === "l") || (r.unidad === "kg/ha" && u === "kg")) set("consumo", Math.round(r.dosis * ha * 100) / 100); }
    } else {
      set("tipo", "Mineral"); set("cantidad", r.dosis); set("superficie", ha || "");
      const k = npkProducto(r.prod) || leerNPK(r.producto); if (k) set("riqueza", k.join("-"));
      if (r.prod && r.dosis && ha && /kg/i.test(r.prod.unidad||"kg")) set("consumo", Math.round(r.dosis * ha));
    }
  }
  set("notas", `Dictado: «${txt}»${pos ? ` · GPS ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}` : ""}`);
  const falta = [!parc && "parcela", r.tipo !== "riegos" && !r.prod && !r.producto && "producto", r.tipo !== "riegos" && !r.dosis && "dosis"].filter(Boolean);
  const dondeTxt = parc ? (r.parcelaDicha ? `Parcela ${parc.nombre} (dicha)` : enGPS?.dentro ? `Estás en ${parc.nombre}` : `Cerca de ${parc.nombre} (${enGPS.m} m)`) : pos ? "No estás dentro de ninguna parcela dibujada" : "Sin GPS";
  toast(`${dondeTxt}.${falta.length ? ` Revisa: falta ${falta.join(", ")}` : " Revisa y guarda"}`);
}
function dialogoTratamientoVoz(){
  if (!SR) return toast("Este navegador no permite dictar. Usa Chrome en Android o Safari en iPhone.");
  if (vozActiva) return vozActiva.stop();
  let pos = null, dicho = "";
  miPosicion().then(p => { pos = p; const e = $("#vozGps"); if (e) { const q = parcelaEn(p[0], p[1]); e.textContent = q ? `📍 ${q.dentro ? "En" : "Cerca de"} ${q.p.nombre}` : "📍 Fuera de tus parcelas dibujadas"; } }).catch(() => { const e = $("#vozGps"); if (e) e.textContent = "📍 Sin GPS: di el nombre de la parcela"; });
  vozBox = document.createElement("div"); vozBox.className = "voz-box";
  vozBox.innerHTML = `<div class="voz-pulse">🎙</div><strong>Dicta el tratamiento</strong><p id="vozGps" class="muted" style="margin:0">📍 Buscando parcela…</p><p id="vozTxt" class="muted">Ejemplo: «Tratado con cobre a dos kilos por hectárea contra repilo»</p><button class="btn" data-act="voz-stop">Parar</button>`;
  document.body.append(vozBox);
  escuchar(t => { dicho = t; }, p => { const e = $("#vozTxt"); if (e) e.textContent = p; }, async () => {
    vozBox?.remove(); vozBox = null; if (!dicho) return;
    if (!pos) pos = await Promise.race([miPosicion().catch(() => null), new Promise(r => setTimeout(() => r(null), 4000))]);
    abrirTratamientoVoz(dicho, pos);
  });
}
document.addEventListener("click", e => { if (e.target.closest('[data-act="voz-trat"]')) dialogoTratamientoVoz(); });
/* Botones: en Tratamientos y Abonados, en el panel Hoy y en el guiado GPS */
{ const _vm = viewModulo; viewModulo = mod => { let h = _vm(mod); const t = UI.tab[mod];
  if (mod === "agri" && ["fitosanitarios","abonados","riegos"].includes(t)) h = h.replace(`<button class="btn primary" data-new="${t}">`, `<button class="btn" data-act="voz-trat">🎙 Dictar con GPS</button><button class="btn primary" data-new="${t}">`);
  return h; }; }
{ const _ph = panelHoy; panelHoy = () => _ph().replace('<button class="btn" data-act="voz-parte">🎙 Parte por voz</button>', '<button class="btn" data-act="voz-parte">🎙 Parte por voz</button><button class="btn" data-act="voz-trat">🎙 Tratamiento por voz</button>'); }
