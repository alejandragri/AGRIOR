/* ============ Fotos y notas de voz en los registros ============ */
const CON_ADJ = ["parcelas","labores","fitosanitarios","cosechas","animales","veterinarios","movimientos","apiarios","colmenas","revisiones","apitratamientos","producciones","productos","compras","economia","recordatorios"];
let adjPend = null; // {keep:[ids], add:[{id, blob, mime, kind}], del:[ids]}
let rec = null;

function blobToDataURL(b){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
async function dataURLToBlob(u){ return (await fetch(u)).blob(); }
/* Reduce las fotos a 1600 px para que no ocupen demasiado */
async function comprimir(file){
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width*k); c.height = Math.round(bmp.height*k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", 0.8));
  } catch(e) { return file; }
}
const urlCache = new Map();
async function adjURL(id){ if (urlCache.has(id)) return urlCache.get(id); let f = null; try { f = await idbGet("files", id); } catch(e) {} if (!f) return null; const u = URL.createObjectURL(f.blob); urlCache.set(id, u); return u; }

function adjItem(a, pend){
  const kind = a.kind || (a.mime||"").split("/")[0];
  const pdf = kind === "pdf" || /pdf/.test(a.mime||"");
  return `<div class="adj" data-adj="${a.id}">${kind==="image" ? `<img alt="Foto" data-src="${a.id}" ${pend?`src="${a.url}"`:""}>` : pdf ? `<a class="btn" target="_blank" rel="noopener" data-src="${a.id}" ${pend?`href="${a.url}"`:""}>📄 Ver PDF</a>` : `<audio controls preload="none" data-src="${a.id}" ${pend?`src="${a.url}"`:""}></audio>`}<button type="button" class="x" data-act="adj-del" data-id="${a.id}" aria-label="Quitar">×</button></div>`;
}
FORM_EXTRA.push({
  html(t, r){
    if (!CON_ADJ.includes(t)) return "";
    adjPend = {keep:[...(r?._adj||[])], add:[], del:[]};
    return `<div class="fld full"><label>Fotos y notas de voz</label>
      <div class="adj-list" id="adjList">${adjPend.keep.map(id=>adjItem({id})).join("")}</div>
      <div class="toolbar"><label class="btn" for="adjFoto" style="cursor:pointer">📷 Añadir foto</label><input type="file" id="adjFoto" accept="image/*" capture="environment" multiple hidden>
      <button type="button" class="btn" data-act="adj-rec" id="adjRec">🎙 Grabar nota de voz</button><span class="muted" id="adjRecT"></span></div></div>`;
  },
  async mount(t){
    if (!CON_ADJ.includes(t)) return;
    for (const el of document.querySelectorAll("#adjList [data-src]")) { const u = await adjURL(el.dataset.src); if (u) { if (el.tagName === "A") el.href = u; else el.src = u; } else el.closest(".adj").insertAdjacentHTML("beforeend", `<small class="muted">No está en este dispositivo</small>`); }
    // Las fotos guardadas sin audio se muestran por tipo real
    for (const id of adjPend.keep) { try { const f = await idbGet("files", id); if (f && f.kind !== "image") { const box = document.querySelector(`#adjList [data-adj="${id}"]`); if (box && box.querySelector("img")) box.outerHTML = adjItem({id, kind:f.kind, url:await adjURL(id)}, true); } } catch(e) {} }
  },
  collect(t, r){
    if (!CON_ADJ.includes(t) || !adjPend) return;
    for (const a of adjPend.add) idbPut("files", a.id, {blob:a.blob, mime:a.mime, kind:a.kind, created:now()}).catch(()=>toast("No se pudo guardar un adjunto"));
    for (const id of adjPend.del) idbDel("files", id).catch(()=>{});
    r._adj = [...adjPend.keep, ...adjPend.add.map(a=>a.id)];
    if (!r._adj.length) delete r._adj;
    adjPend = null;
  },
  remove(t, r){ for (const id of r?._adj||[]) idbDel("files", id).catch(()=>{}); }
});
function adjAdd(blob, kind){
  const a = {id: uid(), blob, mime: blob.type, kind, url: URL.createObjectURL(blob)};
  adjPend.add.push(a); $("#adjList").insertAdjacentHTML("beforeend", adjItem(a, true));
}
document.addEventListener("change", async e => {
  if (e.target.id !== "adjFoto") return;
  for (const f of e.target.files) adjAdd(await comprimir(f), "image");
  e.target.value = "";
});
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "adj-del") {
    const id = el.dataset.id;
    if (adjPend.keep.includes(id)) { adjPend.keep = adjPend.keep.filter(x=>x!==id); adjPend.del.push(id); }
    adjPend.add = adjPend.add.filter(x=>x.id!==id);
    el.closest(".adj").remove();
  }
  if (el.dataset.act === "adj-rec") {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const chunks = []; rec = new MediaRecorder(stream); const t0 = Date.now();
      rec.ondataavailable = ev => chunks.push(ev.data);
      rec.onstop = () => { stream.getTracks().forEach(t=>t.stop()); clearInterval(rec._i); rec = null; el.textContent = "🎙 Grabar nota de voz"; $("#adjRecT").textContent = ""; if (adjPend && chunks.length) adjAdd(new Blob(chunks, {type: chunks[0].type || "audio/webm"}), "audio"); };
      rec.start(); el.textContent = "■ Parar grabación";
      rec._i = setInterval(() => { const s = Math.round((Date.now()-t0)/1000); const t = $("#adjRecT"); if (t) t.textContent = `Grabando ${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; if (s > 300) rec?.stop(); }, 500);
    } catch(err) { toast("No se puede usar el micrófono aquí. Revisa los permisos del navegador."); }
  }
});
/* Si se cierra el formulario sin guardar, se descartan las fotos nuevas */
document.addEventListener("close", e => { if (e.target.id === "dlg") { if (rec) rec.stop(); adjPend = null; } }, true);

/* Icono de adjuntos en las tablas */
const _cellVal = cellVal;
cellVal = function(t, c, r){ const v = _cellVal(t, c, r); return (c === S[t].cols[0] && r._adj?.length) ? `${v ?? ""} 📎${r._adj.length}` : v; };

/* Copia de seguridad con adjuntos */
async function adjuntosParaCopia(){ const out = {}; for (const k of await idbKeys("files")) { const f = await idbGet("files", k); out[k] = {mime:f.mime, kind:f.kind, data:await blobToDataURL(f.blob)}; } return out; }
async function restaurarAdjuntos(obj){ for (const [k, f] of Object.entries(obj||{})) await idbPut("files", k, {blob:await dataURLToBlob(f.data), mime:f.mime, kind:f.kind, created:now()}); urlCache.clear(); }
