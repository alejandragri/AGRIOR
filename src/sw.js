const C = "mi-explotacion-__VERSION__";
const F = ["./", "index.html", "manifest.webmanifest", "icon.svg", "vendor/leaflet.js", "vendor/jspdf.umd.min.js", "vendor/jspdf.plugin.autotable.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(F))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith("mi-explotacion-") && x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  // Teselas de mapa: se guardan las que ya has visto para usarlas sin cobertura
  if (/ign\.es|openstreetmap|catastro/.test(u.hostname)) {
    e.respondWith(caches.open("mi-explotacion-mapa").then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok || res.type === "opaque") c.put(e.request, res.clone()); return res; }))));
    return;
  }
  if (u.origin !== location.origin) return;
  // La app: primero la red (para coger actualizaciones), si no hay cobertura, la copia guardada
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(self.clients.matchAll({type:"window"}).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow("./"))); });
