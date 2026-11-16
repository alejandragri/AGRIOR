/* ============ Sincronización en la nube (Supabase) y copias automáticas ============ */
const SYNC_KEY = "mi-explotacion-sync";
let SY = {url:"", key:"", email:"", session:null, last:0, auto:true};
try { Object.assign(SY, JSON.parse(localStorage.getItem(SYNC_KEY)||"{}")); } catch(e) {}
/* Proyecto de Supabase de la explotación (URL y clave publicable, nunca la service_role) */
const SY_DEFAULT = {url:"https://jytxhoceopxfewsmkisx.supabase.co", key:"sb_publishable_gdettVGSu-gCPGL1EHcOSA_Btn5hVrx"};
if (!SY.url && SY_DEFAULT.url) { SY.url = SY_DEFAULT.url; SY.key = SY_DEFAULT.key; }
const sySave = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(SY)); } catch(e) {} };
let syBusy = false, syTimer = null, syMsg = "";

async function sbFetch(path, opt={}, auth=true){
  const h = {apikey: SY.key, "Content-Type":"application/json", ...(opt.headers||{})};
  if (auth && SY.session) h.Authorization = `Bearer ${SY.session.access_token}`;
  let r = await fetch(SY.url.replace(/\/$/,"") + path, {...opt, headers:h});
  if (r.status === 401 && auth && SY.session?.refresh_token) {
    await sbAuth("refresh_token", {refresh_token: SY.session.refresh_token});
    h.Authorization = `Bearer ${SY.session.access_token}`;
    r = await fetch(SY.url.replace(/\/$/,"") + path, {...opt, headers:h});
  }
  if (!r.ok) { let m = ""; try { const j = await r.json(); m = j.msg || j.message || j.error_description || j.error || ""; } catch(e) {} throw new Error(m || `Error ${r.status}`); }
  return r.status === 204 ? null : r.json().catch(()=>null);
}
async function sbAuth(grant, body){
  const j = await sbFetch(`/auth/v1/token?grant_type=${grant}`, {method:"POST", body:JSON.stringify(body)}, false);
  SY.session = {access_token:j.access_token, refresh_token:j.refresh_token, user:j.user?.id || SY.session?.user, email:j.user?.email || SY.email}; sySave();
}

/* Mezcla registro a registro: gana la versión editada más tarde; los borrados se respetan */
function mezclar(local, remoto){
  const out = blank();
  const del = {...(remoto._meta?.del||{}), ...(local._meta?.del||{})};
  for (const k in remoto._meta?.del||{}) del[k] = Math.max(del[k]||0, remoto._meta.del[k]);
  for (const t in S) {
    const m = new Map();
    for (const r of remoto[t]||[]) m.set(r.id, r);
    for (const r of local[t]||[]) { const o = m.get(r.id); if (!o || (r._u||0) >= (o._u||0)) m.set(r.id, r); }
    out[t] = [...m.values()].filter(r => !(del[r.id] && del[r.id] >= (r._u||0)));
  }
  const lt = local._meta?.titular_u||0, rt = remoto._meta?.titular_u||0;
  out._meta = {...(remoto._meta||{}), ...(local._meta||{}), del, titular: lt >= rt ? local._meta?.titular||{} : remoto._meta?.titular||{}, titular_u: Math.max(lt, rt)};
  // Los borrados de más de 180 días ya no hacen falta
  const lim = now() - 180*864e5; for (const k in out._meta.del) if (out._meta.del[k] < lim) delete out._meta.del[k];
  return out;
}
async function sincronizar(manual){
  if (!SY.url || !SY.key || !SY.session) { if (manual) toast("Configura la sincronización en Ajustes"); return; }
  if (syBusy) return; if (!navigator.onLine) { syMsg = "Sin conexión. Se sincronizará al volver la cobertura."; return; }
  syBusy = true;
  try {
    const rows = await sbFetch(`/rest/v1/explotacion?select=data,updated_at&user_id=eq.${SY.session.user}`);
    const remoto = rows?.[0]?.data ? normalize(rows[0].data) : null;
    const local = JSON.parse(JSON.stringify(DB));
    if (remoto && hasDemoIn(local) && !hasDemoIn(remoto) && Object.keys(S).some(t=>remoto[t].length)) { for (const t in S) local[t] = local[t].filter(r=>!r._demo); }
    const m = remoto ? mezclar(local, remoto) : local;
    await sbFetch(`/rest/v1/explotacion`, {method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify({user_id:SY.session.user, data:m, updated_at:new Date().toISOString()})});
    const cambio = JSON.stringify(m) !== JSON.stringify(DB);
    DB = normalize(m); SY.last = now(); sySave(); syMsg = "";
    if (cambio) { await idbPut("kv", STORE_KEY, JSON.parse(JSON.stringify(DB))).catch(()=>{}); if (!$("#dlg").open) render(); }
    if (manual) { toast("Sincronizado"); render(); }
  } catch(e) { syMsg = `No se pudo sincronizar: ${e.message}`; if (manual) { toast(syMsg); render(); } }
  finally { syBusy = false; }
}
const hasDemoIn = d => Object.keys(S).some(t => (d[t]||[]).some(r=>r._demo));
AFTER_SAVE.push(() => { if (SY.auto && SY.session) { clearTimeout(syTimer); syTimer = setTimeout(() => sincronizar(false), 4000); } });
window.addEventListener("online", () => sincronizar(false));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && SY.session && now() - SY.last > 60000) sincronizar(false); });

/* ---- Copias automáticas en el dispositivo: una por día, se guardan 14 ---- */
async function copiaDiaria(){
  try {
    const k = today(); const ks = (await idbKeys("snaps")).sort();
    if (!ks.includes(k)) await idbPut("snaps", k, JSON.parse(JSON.stringify(DB)));
    for (const old of ks.slice(0, Math.max(0, ks.length - 13))) await idbDel("snaps", old);
  } catch(e) {}
}
AFTER_SAVE.push(() => { clearTimeout(copiaDiaria._t); copiaDiaria._t = setTimeout(copiaDiaria, 2000); });

/* ---- Exportar e importar con fotos y audios ---- */
async function exportar(conAdj){
  const j = {app:"mi-explotacion", exportado:new Date().toISOString(), datos:DB};
  if (conAdj) { toast("Preparando copia con fotos…"); j.adjuntos = await adjuntosParaCopia(); }
  download(`mi-explotacion-copia-${today()}.json`, JSON.stringify(j), "application/json");
}

const SQL = `create table explotacion (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table explotacion enable row level security;
create policy "Cada usuario ve solo su explotación" on explotacion
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;

SETTINGS.push(() => `<section class="panel" id="syncPanel"><h2>Sincronización en la nube</h2>
  ${SY.session ? `<p><span class="pill ok">Conectado</span> como <strong>${esc(SY.session.email||SY.email)}</strong>. ${SY.last?`Última sincronización: ${new Date(SY.last).toLocaleString("es-ES")}.`:""}</p>
    ${syMsg?`<p class="pill crit" style="white-space:normal">${esc(syMsg)}</p>`:""}
    <div class="fld chk"><input type="checkbox" id="syAuto" ${SY.auto?"checked":""}><label for="syAuto">Sincronizar automáticamente al guardar</label></div>
    <div class="toolbar"><button class="btn primary" data-act="sy-now">Sincronizar ahora</button><button class="btn" data-act="sy-out">Cerrar sesión</button></div>
    <p class="muted" style="font-size:.85rem;margin:0">Entra con la misma cuenta en el móvil y en el ordenador para tener los mismos datos. Las fotos y notas de voz se quedan en cada dispositivo; inclúyelas en la copia de seguridad.</p>`
  : `<p class="muted" style="margin:0">Guarda tus datos en tu propio proyecto gratuito de Supabase y úsalos en varios dispositivos. Además de servir de copia de seguridad, funciona sin cobertura y se pone al día cuando vuelve la conexión.</p>
    <details><summary style="cursor:pointer;font-weight:600">Cómo prepararlo (5 minutos, una sola vez)</summary>
      <ol style="padding-left:20px;margin:8px 0;display:flex;flex-direction:column;gap:4px">
        <li>Crea una cuenta gratuita en <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> y un proyecto nuevo (elige la región de Europa).</li>
        <li>Abre <em>SQL Editor</em>, pega este código y pulsa <em>Run</em>:<pre class="code" id="sqlTxt">${esc(SQL)}</pre><button class="btn" data-act="sy-sql">Copiar código</button></li>
        <li>En <em>Project Settings → API</em> copia la <em>Project URL</em> y la clave publicable (<em>anon</em> o <em>publishable</em>) y pégalas aquí abajo.</li>
        <li>Pulsa «Crear cuenta» con tu correo y una contraseña. Si Supabase te pide confirmar el correo, hazlo y luego pulsa «Entrar».</li>
      </ol></details>
    <div class="fld"><label for="syUrl">Project URL</label><input id="syUrl" type="text" placeholder="https://xxxx.supabase.co" value="${esc(SY.url)}"></div>
    <div class="fld"><label for="syKey">Clave publicable</label><input id="syKey" type="text" value="${esc(SY.key)}" autocomplete="off"></div>
    <div class="fld"><label for="syMail">Correo</label><input id="syMail" type="text" inputmode="email" autocomplete="username" value="${esc(SY.email)}"></div>
    <div class="fld"><label for="syPass">Contraseña</label><input id="syPass" type="password" autocomplete="current-password"></div>
    <div class="toolbar"><button class="btn primary" data-act="sy-in">Entrar</button><button class="btn" data-act="sy-up">Crear cuenta</button></div>
    ${syMsg?`<p class="pill crit" style="white-space:normal">${esc(syMsg)}</p>`:""}`}
</section>
<section class="panel"><h2>Copias automáticas en este dispositivo</h2>
  <p class="muted" style="margin:0">La app guarda una copia al día de los últimos 14 días. Si algo sale mal, puedes volver a una de ellas.</p>
  <div class="toolbar"><select id="snapSel" style="width:auto"><option value="">Cargando…</option></select><button class="btn" data-act="snap-ask">Restaurar esta copia</button><span id="snapConf" hidden>Se sustituirán los datos actuales. <button class="btn danger" data-act="snap-go">Sí, restaurar</button></span></div>
  <div class="toolbar"><button class="btn" data-act="export-adj">Descargar copia con fotos y audios</button></div>
</section>`);

/* Lista de copias al abrir Ajustes */
const _render2 = render;
render = function(){ _render2(); if (UI.mod === "ajustes") idbKeys("snaps").then(ks => { const s = $("#snapSel"); if (s) s.innerHTML = ks.length ? ks.sort().reverse().map(k=>`<option value="${k}">${fdate(k)}</option>`).join("") : `<option value="">Aún no hay copias</option>`; }).catch(()=>{ const s = $("#snapSel"); if (s) s.innerHTML = `<option value="">No disponible</option>`; }); };

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "sy-in" || a === "sy-up") {
    SY.url = $("#syUrl").value.trim(); SY.key = $("#syKey").value.trim(); SY.email = $("#syMail").value.trim(); const pass = $("#syPass").value;
    if (!/^https:\/\/.+/.test(SY.url) || !SY.key || !SY.email || !pass) { syMsg = "Rellena la URL, la clave, el correo y la contraseña."; return render(); }
    sySave(); syMsg = "";
    try {
      if (a === "sy-up") { const j = await sbFetch("/auth/v1/signup", {method:"POST", body:JSON.stringify({email:SY.email, password:pass})}, false); if (!j?.access_token) { syMsg = "Cuenta creada. Confirma el correo que te ha enviado Supabase y pulsa «Entrar»."; return render(); } SY.session = {access_token:j.access_token, refresh_token:j.refresh_token, user:j.user.id, email:SY.email}; sySave(); }
      else await sbAuth("password", {email:SY.email, password:pass});
      toast("Sesión iniciada"); await sincronizar(true);
    } catch(err) { syMsg = /Invalid login/i.test(err.message) ? "Correo o contraseña incorrectos." : /relation|explotacion/i.test(err.message) ? "Falta crear la tabla: ejecuta el código SQL del paso 2." : `No se pudo conectar: ${err.message}`; render(); }
  }
  else if (a === "sy-now") sincronizar(true);
  else if (a === "sy-out") { SY.session = null; sySave(); render(); toast("Sesión cerrada. Los datos siguen en este dispositivo."); }
  else if (a === "sy-sql") navigator.clipboard?.writeText(SQL).then(()=>toast("Código copiado"), ()=>toast("Selecciona el código y cópialo a mano"));
  else if (a === "snap-ask") { if ($("#snapSel").value) { $("#snapConf").hidden = false; el.hidden = true; } }
  else if (a === "snap-go") { const k = $("#snapSel").value; try { const d = await idbGet("snaps", k); if (!d) throw 0; const prev = DB; DB = normalize(d); for (const t in S) for (const r of prev[t]) if (!DB[t].some(x=>x.id===r.id)) tomb(r.id); for (const t in S) for (const r of DB[t]) r._u = now(); save(); render(); toast(`Restaurada la copia del ${fdate(k)}`); } catch(err) { toast("No se pudo restaurar esa copia"); } }
  else if (a === "export-adj") exportar(true);
});
document.addEventListener("change", e => { if (e.target.id === "syAuto") { SY.auto = e.target.checked; sySave(); } });

/* ============ Uso sin cobertura: aviso, cambios pendientes de subir, mapas descargados y almacenamiento ============ */
let syPend = false;
try { syPend = localStorage.getItem("mi-explotacion-pend") === "1"; } catch(e) {}
const setPend = v => { syPend = v; try { localStorage.setItem("mi-explotacion-pend", v ? "1" : "0"); } catch(e) {} barraRed(); };
AFTER_SAVE.push(() => { if (SY.session) setPend(true); });
{ const _s = sincronizar; sincronizar = async function(manual){ const antes = SY.last; await _s(manual); if (SY.last !== antes) setPend(false); }; }
function barraRed(){
  let b = $("#netBar");
  if (!b) { b = document.createElement("div"); b.id = "netBar"; b.className = "netbar no-print"; b.setAttribute("role", "status"); document.body.appendChild(b); }
  const off = !navigator.onLine;
  if (off) b.innerHTML = `<strong>Sin cobertura.</strong> Puedes seguir apuntando: se guarda en este dispositivo${SY.session ? " y se subirá solo al volver la conexión" : ""}.${syPend && SY.session ? " <span class=\"pill warn\">Cambios por subir</span>" : ""}`;
  b.hidden = !off; document.body.style.paddingTop = off ? `${b.offsetHeight}px` : "";
}
window.addEventListener("online", () => { barraRed(); toast(syPend && SY.session ? "Conexión recuperada. Subiendo cambios…" : "Conexión recuperada"); });
window.addEventListener("offline", barraRed);
setTimeout(barraRed, 0);

/* Descarga de las teselas de ortofoto alrededor de parcelas y apiarios (zoom 12 a 17) para verlas en el campo sin datos */
const tile = (lat, lng, z) => { const n = 2 ** z, x = Math.floor((lng + 180) / 360 * n), r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1/Math.cos(r)) / Math.PI) / 2 * n); return [x, y]; };
function teselasExplotacion(zMax = 17, limite = 3000){
  const B = [];
  for (const p of DB.parcelas) if (p.geo?.length) { const la = p.geo.map(q=>q[0]), lo = p.geo.map(q=>q[1]); B.push([Math.min(...la), Math.min(...lo), Math.max(...la), Math.max(...lo)]); }
  for (const a of DB.apiarios) { const q = apiPos(a); if (q) B.push([q[0], q[1], q[0], q[1]]); }
  const U = new Set();
  for (let z = 12; z <= zMax; z++) for (const [s, w, n, e] of B) {
    const m = 0.003; const [x0, y0] = tile(n + m, w - m, z), [x1, y1] = tile(s - m, e + m, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) U.add(`${z}/${x}/${y}`);
    if (U.size > limite) return {T:[...U].slice(0, limite), cortado:true, zonas:B.length};
  }
  return {T:[...U], cortado:false, zonas:B.length};
}
const urlOrto = (z, x, y) => `https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix=${z}&tilerow=${y}&tilecol=${x}`;
let descargaMapa = null;
async function bajarMapas(){
  if (descargaMapa) return;
  if (!navigator.onLine) return toast("Necesitas conexión para descargar los mapas");
  if (!("caches" in window)) return toast("Este navegador no permite guardar mapas");
  const {T, cortado, zonas} = teselasExplotacion();
  if (!zonas) return toast("Dibuja tus parcelas o sitúa tus apiarios en el Mapa primero");
  descargaMapa = {hechas:0, total:T.length, fallos:0}; render();
  const c = await caches.open("mi-explotacion-mapa");
  let i = 0;
  const trabajo = async () => { while (i < T.length) { const [z, x, y] = T[i++].split("/"); const u = urlOrto(z, x, y);
    try { if (!(await c.match(u))) { const r = await fetch(u, {mode:"no-cors"}); if (r.ok || r.type === "opaque") await c.put(u, r); else descargaMapa.fallos++; } } catch(e) { descargaMapa.fallos++; }
    descargaMapa.hechas++; const el = $("#mapaProg"); if (el) el.textContent = `${descargaMapa.hechas} de ${descargaMapa.total}`; } };
  await Promise.all([1,2,3,4].map(trabajo));
  const r = descargaMapa; descargaMapa = null;
  try { localStorage.setItem("mi-explotacion-mapas", JSON.stringify({fecha:today(), n:r.total - r.fallos})); } catch(e) {}
  toast(r.fallos ? `Mapas guardados con ${r.fallos} fallos. Vuelve a intentarlo con mejor conexión.` : `Mapas guardados${cortado ? " (solo los más cercanos: hay muchas parcelas)" : ""}`);
  render();
}
async function infoAlmacen(){
  const el = $("#almInfo"); if (!el) return;
  let txt = [];
  try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); txt.push(`Ocupa ${fnum(Math.round((e.usage||0)/1048576))} MB en este dispositivo`); } } catch(e) {}
  try { if (navigator.storage?.persisted) txt.push(await navigator.storage.persisted() ? "guardado protegido: el navegador no lo borrará para liberar espacio" : "guardado sin proteger"); } catch(e) {}
  try { const sw = await navigator.serviceWorker?.getRegistration(); txt.push(sw?.active ? "la app está guardada para abrirse sin conexión" : "la app aún no está guardada para usarse sin conexión (ábrela una vez con cobertura desde la dirección instalada)"); } catch(e) {}
  el.textContent = txt.join(" · ") + ".";
}
SETTINGS.push(() => { let m = null; try { m = JSON.parse(localStorage.getItem("mi-explotacion-mapas")||"null"); } catch(e) {}
  return `<section class="panel"><h2>Uso sin cobertura</h2>
  <p class="muted" style="margin:0">Todo lo que apuntas se guarda primero en este dispositivo, así que la app funciona en el campo sin internet. Al volver la cobertura se sincroniza sola${SY.session ? "" : " (si activas la sincronización en la nube)"}.</p>
  <p id="almInfo" class="muted" style="font-size:.88rem;margin:0">Comprobando…</p>
  <div class="toolbar"><button class="btn" data-act="persist">Proteger los datos de este dispositivo</button></div>
  <h3>Mapas para el campo</h3>
  <p class="muted" style="margin:0">Descarga la ortofoto de alrededor de tus parcelas y apiarios para verla sin datos. Hazlo con wifi: pueden ser varios cientos de imágenes.${m ? ` Última descarga: ${fdate(m.fecha)} (${fnum(m.n)} imágenes).` : ""}</p>
  <div class="toolbar">${descargaMapa ? `<span class="pill warn">Descargando… <span id="mapaProg">${descargaMapa.hechas} de ${descargaMapa.total}</span></span>` : `<button class="btn primary" data-act="mapas-off">Descargar mapas de mi explotación</button><span class="muted" style="font-size:.85rem">Unas ${fnum(teselasExplotacion().T.length)} imágenes</span>`}</div>
  <p class="muted" style="font-size:.82rem;margin:0">La previsión del tiempo y los avisos usan la última descarga cuando no hay conexión.</p></section>`; });
{ const _r = render; render = function(){ _r(); if (UI.mod === "ajustes") infoAlmacen(); }; }
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "mapas-off") bajarMapas();
  else if (el.dataset.act === "persist") { try { const ok = await navigator.storage?.persist?.(); toast(ok ? "Datos protegidos" : "El navegador no lo permite; instala la app en la pantalla de inicio"); } catch(err) { toast("Este navegador no lo permite"); } infoAlmacen(); }
});
/* Al instalarse en la pantalla de inicio se pide que no se borren los datos */
window.addEventListener("appinstalled", () => { try { navigator.storage?.persist?.(); } catch(e) {} });
