/* ============ Arranque ============ */
(async () => {
  const d = await load();
  DB = d ? normalize(d) : seed();
  if (!d) save();
  render();
  try { if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !/claude|anthropic/.test(location.hostname)) navigator.serviceWorker.register("sw.js").catch(()=>{}); } catch(e) {}
  setTimeout(() => { comprobarAvisos(); copiaDiaria(); sincronizar(false); }, 1500);
})();
