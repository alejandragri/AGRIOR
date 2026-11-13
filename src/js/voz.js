/* ============ Dictado por voz: campos de texto y partes completos ============ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let vozActiva = null;
function escuchar(onFinal, onParcial, onFin){
  if (!SR) { toast("Este navegador no permite dictar. Usa Chrome en Android o Safari en iPhone."); return null; }
  if (vozActiva) { try { vozActiva.stop(); } catch(e) {} vozActiva = null; return null; }
  const r = new SR(); r.lang = "es-ES"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  r.onresult = ev => { let fin = "", par = ""; for (const x of ev.results) (x.isFinal ? (fin += x[0].transcript) : (par += x[0].transcript)); if (par && onParcial) onParcial(par); if (fin) onFinal(fin.trim()); };
  r.onerror = ev => toast(ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "Permite el micrófono para dictar" : ev.error === "no-speech" ? "No se ha oído nada" : ev.error === "network" ? "El dictado necesita conexión a internet" : "No se pudo dictar");
  r.onend = () => { vozActiva = null; onFin && onFin(); };
  try { r.start(); vozActiva = r; } catch(e) { toast("No se pudo usar el micrófono"); return null; }
  return r;
}

/* Botón de micrófono junto a cada texto del formulario */
FORM_EXTRA.push({
  html: () => "",
  mount(){
    if (!SR) return;
    for (const el of document.querySelectorAll('#frm .body input[type="text"], #frm .body textarea')) {
      if (el.closest(".lin") || el.list || el.id === "f_numero") continue;
      const b = document.createElement("button"); b.type = "button"; b.className = "mic"; b.title = "Dictar"; b.setAttribute("aria-label", "Dictar"); b.textContent = "🎙";
      const wrap = document.createElement("div"); wrap.className = "con-mic"; el.parentNode.insertBefore(wrap, el); wrap.append(el, b);
      b.addEventListener("click", () => { b.classList.add("on");
        escuchar(t => { el.value = el.tagName === "TEXTAREA" && el.value ? `${el.value.trim()} ${t}` : t; el.dispatchEvent(new Event("input", {bubbles:true})); }, null, () => b.classList.remove("on")) || b.classList.remove("on"); });
    }
  }
});

/* ---- Parte completo por voz ---- */
const NUM = {un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, veinte:20, treinta:30, cuarenta:40, cincuenta:50, media:0.5};
const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function numDe(txt){ const t = norm(txt).trim(); if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", ".")); let n = 0; for (const w of t.split(/\s+y\s+|\s+/)) if (NUM[w] != null) n += NUM[w]; return n || null; }
const NUMRE = "(\\d+(?:[.,]\\d+)?|(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta)(?:\\s+y\\s+(?:media|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?)";
/* Busca el registro cuyo nombre aparece mejor en el texto */
function mejor(lista, nombre, txt){
  let best = null, score = 0; const t = ` ${norm(txt)} `;
  for (const r of lista) { const n = norm(nombre(r)); if (!n) continue;
    if (t.includes(` ${n} `) || t.includes(n)) { if (n.length*2 > score) { best = r; score = n.length*2; } continue; }
    const pal = n.split(/\s+/).filter(w=>w.length>3 && !["parcela","apiario","del","las","los"].includes(w)); const hit = pal.filter(w=>t.includes(` ${w}`)).length;
    if (hit && hit*5 > score) { best = r; score = hit*5; } }
  return best;
}
const TAREA_KEYS = [["Poda", /pod(a|e|ar|ando)/], ["Siembra", /sembr|siembra/], ["Abonado", /abon/], ["Tratamiento fitosanitario", /trat(amiento|ar|e)|sulfat|fumig|pulveriz/], ["Riego", /rieg|regar|regando/], ["Desbroce", /desbro|desbroz/], ["Recolección", /recole|cosech|vendimi|aceitun/], ["Ordeño", /orde[nñ]/], ["Alimentación del ganado", /dar de comer|pienso|alimentar|echar de comer/], ["Manejo del ganado", /ganado|ovejas|cabras|vacas|corderos|pastore|esquil/], ["Limpieza de instalaciones", /limpi/], ["Revisión de colmenas", /colmena|revisar las abejas|revision/], ["Extracción de miel", /miel|extrac|castr/], ["Mantenimiento de maquinaria", /taller|mantenimiento|engras|cambio de aceite|arregl/], ["Transporte", /transport|llevar|acarre/], ["Laboreo", /arar|labor|grada|cultivador|chisel|rotavator|binar/]];
function interpretarParte(txt){
  const t = norm(txt), r = {trabajo: txt.charAt(0).toUpperCase() + txt.slice(1)};
  if (/\bayer\b/.test(t)) r.fecha = addDays(today(), -1); else if (/anteayer|antes de ayer/.test(t)) r.fecha = addDays(today(), -2); else r.fecha = today();
  const w = mejor(DB.trabajadores, x=>x.nombre, txt); if (w) r.trabajador = w.id;
  const p = mejor(DB.parcelas, x=>x.nombre, txt); if (p) { r.parcela = p.id; r.actividad = "Agrícola"; }
  const a = mejor(DB.apiarios, x=>x.nombre, txt); if (a && (!p || /colmen|apiar|abeja|miel/.test(t))) { r.apiario = a.id; r.actividad = "Apícola"; if (!/parcela/.test(t)) delete r.parcela; }
  const m = mejor(DB.maquinaria, x=>`${x.nombre} ${x.tipo||""}`, txt); if (m && /tractor|maquina|pulveriz|abonadora|sembradora|cosechadora|remolque|con el|con la/.test(t)) r.maquina = m.id;
  const lote = [...new Set(DB.animales.map(x=>x.lote).filter(Boolean))].find(l => t.includes(norm(l))); if (lote) { r.lote = lote; r.actividad = "Ganadero"; }
  for (const [tarea, re] of TAREA_KEYS) if (re.test(t)) { r.tarea = tarea; break; }
  if (!r.actividad) r.actividad = /colmen|abeja|miel/.test(t) ? "Apícola" : /ganado|oveja|cabra|vaca|cordero|orden/.test(t) ? "Ganadero" : "Agrícola";
  const rango = t.match(new RegExp(`de(?:sde)?(?: las)? ${NUMRE}(?:[:.](\\d{2}))?(?: y media)? (?:a|hasta)(?: las)? ${NUMRE}(?:[:.](\\d{2}))?(?: y media)?`));
  if (rango) { const hh = (n, mm, media) => { let h = numDe(n); if (h == null) return ""; if (h < 6 && /tarde/.test(t)) h += 12; return `${String(Math.floor(h)).padStart(2,"0")}:${mm || (media || h%1 ? "30" : "00")}`; };
    r.inicio = hh(rango[1], rango[2], /^de(?:sde)?(?: las)? \S+ y media/.test(rango[0])); let fin = numDe(rango[3]); if (fin != null && fin < numDe(rango[1])) fin += 12; r.fin = fin != null ? `${String(Math.floor(fin)).padStart(2,"0")}:${rango[4] || (fin%1 ? "30" : "00")}` : ""; }
  const hs = t.match(new RegExp(`${NUMRE}(?: y media)? horas?`)); if (hs && !rango) { let h = numDe(hs[1]); if (/y media horas?$/.test(hs[0])) h += 0.5; if (h) r.horas = h; }
  if (/media hora/.test(t) && !hs) r.horas = 0.5;
  const ha = t.match(new RegExp(`${NUMRE}(?: y media)? hectareas?`)); if (ha) { let v = numDe(ha[1]); if (/y media hectareas?$/.test(ha[0])) v += 0.5; if (v) r.superficie = v; }
  if (/pendiente|sin terminar|a medias/.test(t)) r.estado = "Pendiente";
  return r;
}
function abrirParteVoz(txt){
  const r = interpretarParte(txt);
  openForm("partes");
  const set = (k, v) => { const f = $(`#f_${k}`); if (f && v != null && v !== "") { f.value = v; f.dispatchEvent(new Event("input", {bubbles:true})); } };
  for (const k of ["fecha","trabajador","tarea","actividad","parcela","apiario","lote","maquina","inicio","fin","horas","superficie","estado","trabajo"]) set(k, r[k]);
  const faltan = [!r.trabajador && "trabajador", !r.tarea && "tarea"].filter(Boolean);
  toast(faltan.length ? `Revisa: falta ${faltan.join(" y ")}` : "Revisa el parte y guarda");
}
let vozBox = null;
function dialogoVoz(){
  if (!SR) return toast("Este navegador no permite dictar. Usa Chrome en Android o Safari en iPhone.");
  if (vozActiva) return vozActiva.stop();
  vozBox = document.createElement("div"); vozBox.className = "voz-box"; vozBox.innerHTML = `<div class="voz-pulse">🎙</div><strong>Escuchando…</strong><p id="vozTxt" class="muted">Ejemplo: «Hoy Juan cinco horas de poda en el Olivar del Camino con el tractor»</p><button class="btn" data-act="voz-stop">Parar</button>`;
  document.body.append(vozBox);
  let dicho = "";
  escuchar(t => { dicho = t; }, p => { const e = $("#vozTxt"); if (e) e.textContent = p; }, () => { vozBox?.remove(); vozBox = null; if (dicho) abrirParteVoz(dicho); });
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "voz-parte") dialogoVoz();
  else if (el.dataset.act === "voz-stop") { try { vozActiva?.stop(); } catch(err) {} }
});
/* Botón «Parte por voz» en la lista de partes */
{ const _vm = viewModulo; viewModulo = mod => { const h = _vm(mod); return mod === "partes" && UI.tab.partes === "partes" ? h.replace('<button class="btn primary" data-new="partes">', '<button class="btn" data-act="voz-parte">🎙 Parte por voz</button><button class="btn primary" data-new="partes">') : h; }; }
