/* ============ Trazabilidad con QR: cada lote lleva un código que muestra su origen y sus tratamientos ============ */
/* La ficha viaja dentro del propio enlace (comprimida), así funciona sin servidor y el comprador no necesita la app */
const URL_PUBLICA = "https://alejandragri.github.io/AGRIOR/";
const baseURL = () => /^https?:$/.test(location.protocol) && !/claude|anthropic|localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin + location.pathname : URL_PUBLICA;
const b64url = u8 => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); };
const unb64url = s => { s = s.replace(/-/g,"+").replace(/_/g,"/"); while (s.length % 4) s += "="; const b = atob(s), u = new Uint8Array(b.length); for (let i=0;i<b.length;i++) u[i] = b.charCodeAt(i); return u; };
async function comprimirTxt(txt){
  const u8 = new TextEncoder().encode(txt);
  if (!window.CompressionStream) return "j" + b64url(u8);
  const st = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return "z" + b64url(new Uint8Array(await new Response(st).arrayBuffer()));
}
async function descomprimirTxt(s){
  const u8 = unb64url(s.slice(1));
  if (s[0] === "j") return new TextDecoder().decode(u8);
  const st = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(st).text();
}
/* Datos públicos del lote: origen, fechas y tratamientos (sin clientes ni precios) */
function datosPublicos(cod){
  const F = fichaLote(cod); if (!F) return null;
  const T = DB._meta.titular || {}, l = F.l, p = DB.parcelas.find(x=>x.id===l.parcela), a = DB.apiarios.find(x=>x.id===l.apiario);
  const cu = p ? DB.cultivos.find(c=>c.parcela===p.id && String(c.campana)===l.fecha.slice(0,4)) : null;
  return {v:1, c:l.codigo, p:l.producto, k:Math.round(l.kg), f:l.fecha, t:T.nombre||"", r:p ? "" : (T.rega_api||""),
    o: p ? {n:p.nombre, m:[p.municipio, p.provincia].filter(Boolean).join(", "), s:[p.poligono, p.parcela, p.recinto].filter(x=>x!==""&&x!=null).join("/"), h:Number(p.superficie||0), vr:cu?.variedad||""}
         : {n:a?.nombre||l.origen, m:a?.municipio||"", s:a?.codigo||"", col:a ? DB.colmenas.filter(c=>c.apiario===a.id&&c.estado!=="Muerta"&&c.estado!=="Vendida").length : 0},
    e: F.E.filter(e=>e.tipo !== "Labor").slice(-25).map(e=>[e.fecha, e.tipo, e.txt.slice(0,110), e.nota||"", e.ok?1:0]), g:today()};
}
async function urlLote(cod){ const d = datosPublicos(cod); return d ? `${baseURL()}#lote=${await comprimirTxt(JSON.stringify(d))}` : ""; }
function qrDe(txt){ if (typeof qrcode === "undefined") return null; const q = qrcode(0, "M"); q.addData(txt); q.make(); return q; }
function qrSVG(txt){ const q = qrDe(txt); return q ? q.createSvgTag({cellSize:4, margin:2, scalable:true}) : `<p class="muted">No se ha podido cargar el generador de QR.</p>`; }
/* Dibuja el QR en un PDF de jsPDF con cuadraditos (sin imágenes) */
function qrEnPdf(doc, txt, x, y, lado){
  const q = qrDe(txt); if (!q) return false; const n = q.getModuleCount(), m = lado / (n + 2);
  doc.setFillColor(255,255,255); doc.rect(x, y, lado, lado, "F"); doc.setFillColor(0,0,0);
  for (let r=0;r<n;r++) for (let c=0;c<n;c++) if (q.isDark(r, c)) doc.rect(x + (c+1)*m, y + (r+1)*m, m + 0.01, m + 0.01, "F");
  return true;
}
async function verQR(cod){
  const url = await urlLote(cod), F = fichaLote(cod), dlg = $("#dlg");
  dlg.innerHTML = `<div class="dlg"><header><h2>Código QR del lote ${esc(cod)}</h2><button type="button" class="x" data-act="close" aria-label="Cerrar">×</button></header>
    <div class="body" style="grid-template-columns:1fr;justify-items:center;text-align:center">
      <div class="qr-box">${qrSVG(url)}</div>
      <p style="margin:0"><strong>${esc(F.l.producto)}</strong> · ${fnum(F.l.kg)} kg · ${esc(F.l.origen)}</p>
      <p class="muted" style="margin:0;max-width:52ch">Al escanearlo con el móvil, el comprador o la cooperativa ve el origen, la fecha de cosecha y los tratamientos del lote, sin precios ni clientes. Si cambias algo del lote, vuelve a imprimir la etiqueta.</p>
      <div class="toolbar" style="justify-content:center"><button class="btn" data-act="qr-copiar" data-url="${esc(url)}">Copiar enlace</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Ver la ficha</a><button class="btn primary" data-act="qr-etiquetas" data-cod="${esc(cod)}">Etiquetas para imprimir (PDF)</button></div>
      <p class="muted" style="font-size:.78rem;margin:0">${url.length} caracteres · ${baseURL() === URL_PUBLICA ? "enlace a la app publicada" : "enlace a esta app"}</p></div></div>`;
  dlg.dataset.t = ""; dlg.showModal();
}
async function pdfEtiquetas(cod){
  if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const url = await urlLote(cod), F = fichaLote(cod), T = DB._meta.titular || {}, {jsPDF} = window.jspdf, doc = new jsPDF({unit:"mm", format:"a4"});
  // 3 × 7 etiquetas de 70 × 42 mm
  for (let r=0;r<7;r++) for (let c=0;c<3;c++) { const x = c*70, y = 4 + r*41.5;
    qrEnPdf(doc, url, x + 3, y + 3, 34);
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(30); doc.text(doc.splitTextToSize(F.l.producto, 30), x + 38, y + 8);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.text([`Lote ${cod}`, fdate(F.l.fecha), doc.splitTextToSize(F.l.origen, 30)[0], (T.nombre||"").slice(0, 26), "Escanea para ver el origen"].filter(Boolean), x + 38, y + 20); }
  try { doc.save(`etiquetas-${cod}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act;
  if (a === "traz-qr") verQR(el.dataset.cod);
  else if (a === "qr-etiquetas") pdfEtiquetas(el.dataset.cod);
  else if (a === "qr-copiar") navigator.clipboard?.writeText(el.dataset.url).then(()=>toast("Enlace copiado"), ()=>toast("No se pudo copiar"));
});
/* Botón «Código QR» en la ficha del lote */
{ const _r = TABS.trazabilidad.render; TABS.trazabilidad.render = (...a) => _r(...a).replace(/<button class="btn" data-act="traz-pdf" data-cod="([^"]*)">Ficha en PDF<\/button>/, (m, c) => `<div class="toolbar"><button class="btn primary" data-act="traz-qr" data-cod="${c}">▦ Código QR</button>${m}</div>`); }

/* ---- Vista pública de la ficha (cuando se abre el enlace del QR) ---- */
function fichaPublicaHTML(d){
  const ap = !!d.o.col;
  return `<div class="ficha-pub">
    <div class="eyebrow">Ficha de trazabilidad</div>
    <h1>${esc(d.p)}</h1>
    <p class="muted">Lote <strong>${esc(d.c)}</strong> · ${ap?"extraído":"cosechado"} el ${fdate(d.f)} · ${fnum(d.k)} kg</p>
    <section class="panel"><h3>Origen</h3><dl class="kv">
      ${d.t?`<dt>Productor</dt><dd>${esc(d.t)}</dd>`:""}
      <dt>${ap?"Apiario":"Parcela"}</dt><dd>${esc(d.o.n)}</dd>
      ${d.o.m?`<dt>Municipio</dt><dd>${esc(d.o.m)}</dd>`:""}
      ${d.o.s?`<dt>${ap?"Código":"SIGPAC (pol./par./rec.)"}</dt><dd>${esc(d.o.s)}</dd>`:""}
      ${d.o.h?`<dt>Superficie</dt><dd>${fnum(d.o.h)} ha</dd>`:""}${d.o.vr?`<dt>Variedad</dt><dd>${esc(d.o.vr)}</dd>`:""}
      ${ap?`<dt>Colmenas</dt><dd>${d.o.col}</dd>`:""}${d.r?`<dt>REGA</dt><dd>${esc(d.r)}</dd>`:""}</dl></section>
    <section class="panel"><h3>${ap?"Tratamientos y manejo":"Tratamientos y abonados"} del último año</h3>
      ${d.e.length ? `<ol class="traz-line">${d.e.map(([f,t,x,n,ok])=>`<li class="${ok?"":"bad"}"><strong>${fdate(f)} · ${esc(t)}</strong><span>${esc(x)}${n?` · <em>${esc(n)}</em>`:""}${ok&&/Tratamiento/.test(t)?" · ✓ respetado antes de la cosecha":""}</span></li>`).join("")}</ol>` : `<p class="muted">No constan tratamientos en el año anterior a la cosecha.</p>`}</section>
    <p class="muted" style="font-size:.8rem">Datos declarados por el productor en su cuaderno de explotación. Ficha generada el ${fdate(d.g)} con Mi Explotación.</p></div>`;
}
const LOTE_HASH = location.hash.startsWith("#lote=") ? location.hash.slice(6) : "";
if (LOTE_HASH) {
  document.documentElement.classList.add("modo-ficha");
  render = function(){
    $("#nav").hidden = true; const v = $("#view");
    if (render._d) { v.innerHTML = fichaPublicaHTML(render._d); return; }
    v.innerHTML = `<p class="muted">Cargando ficha…</p>`;
    descomprimirTxt(LOTE_HASH).then(t => { render._d = JSON.parse(t); render(); document.title = `Lote ${render._d.c} · ${render._d.p}`; })
      .catch(() => { v.innerHTML = `<div class="empty">Este código no se puede leer. Pide al productor una etiqueta nueva.</div>`; });
  };
  // Quien abre la ficha no necesita datos de ejemplo ni sincronizar
  save = async () => {}; sincronizar = async () => {}; copiaDiaria = async () => {}; comprobarAvisos = () => {};
}
