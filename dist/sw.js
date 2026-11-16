const C = "mi-explotacion-202611161529";
const F = ["./", "index.html", "manifest.webmanifest", "icon.svg", "vendor/leaflet.js", "vendor/jspdf.umd.min.js", "vendor/jspdf.plugin.autotable.min.js"];
const MAPA = "mi-explotacion-mapa", FUENTES = "mi-explotacion-fuentes";
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(F))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith("mi-explotacion-") && x !== C && x !== MAPA && x !== FUENTES).map(x => caches.delete(x))))); self.clients.claim(); });
/* Con poca cobertura la red puede tardar mucho: si no responde en 4 s se usa la copia guardada */
const conLimite = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("lento")), ms); p.then(r => { clearTimeout(t); res(r); }, e => { clearTimeout(t); rej(e); }); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  // Teselas de mapa: se guardan las que ya has visto (o descargado) para usarlas sin cobertura
  if (/ign\.es|openstreetmap|catastro|sigpac-hubcloud/.test(u.hostname)) {
    e.respondWith(caches.open(MAPA).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok || res.type === "opaque") c.put(e.request, res.clone()); return res; }))));
    return;
  }
  // Tipos de letra: la copia guardada al momento y se renueva por detrás
  if (/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) {
    e.respondWith(caches.open(FUENTES).then(c => c.match(e.request).then(r => { const red = fetch(e.request).then(res => { if (res.ok || res.type === "opaque") c.put(e.request, res.clone()); return res; }).catch(() => r); return r || red; })));
    return;
  }
  if (u.origin !== location.origin) return;
  // La app: primero la red (para coger actualizaciones); sin cobertura o si tarda, la copia guardada
  const red = fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return res; });
  e.respondWith(conLimite(red, 4000).catch(() => caches.match(e.request).then(r => r || caches.match("index.html") || red)));
});
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(self.clients.matchAll({type:"window"}).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow("./"))); });
