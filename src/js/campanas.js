/* ============ Comparar campañas ============
   Producción, gastos, ingresos y margen de cada año frente a los anteriores,
   de todas las parcelas juntas, de un cultivo o de una parcela. */
MODS.eco.tables = [...MODS.eco.tables.filter(t => t !== "campanas"), "campanas"];
UI.campVer = UI.campVer || "todo";
/* Las cuentas de cada parcela en un año (reutiliza las de Rentabilidad) */
function campanaParcelas(y){ const prev = UI.year; UI.year = String(y); try { return rentParcelas(); } finally { UI.year = prev; } }
function campanaAnos(){
  const s = new Set();
  for (const t of ["cosechas","labores","fitosanitarios","abonados","economia","partes","ventas"]) for (const r of DB[t] || []) if (r.fecha) s.add(r.fecha.slice(0, 4));
  for (const c of DB.cultivos) if (c.campana) s.add(String(c.campana));
  s.add(String(new Date().getFullYear()));
  return [...s].filter(y => /^\d{4}$/.test(y)).sort();
}
function campanaFila(R){
  const o = R.reduce((a, r) => ({ha: a.ha + r.ha, kg: a.kg + r.kg, ing: a.ing + r.ing, gas: a.gas + r.gas}), {ha:0, kg:0, ing:0, gas:0});
  o.mar = o.ing - o.gas; o.np = R.length; return o;
}
function campanaDatos(ver){
  const [tipo, clave] = ver.split(":");
  return campanaAnos().map(y => {
    let R = campanaParcelas(y);
    if (tipo === "cultivo") R = R.filter(r => facNorm(r.cultivo || "Sin cultivo apuntado") === clave);
    if (tipo === "parcela") R = R.filter(r => r.id === clave);
    // Un año sin nada apuntado en ese cultivo o parcela no cuenta
    R = R.filter(r => r.ing || r.gas || r.kg || tipo === "parcela");
    return {y, ...campanaFila(R), vacio: !R.some(r => r.ing || r.gas || r.kg)};
  }).filter(d => !d.vacio);
}
function campanaVar(a, b){
  if (b == null || !isFinite(a) || !isFinite(b) || b === 0) return "";
  const p = (a - b) / Math.abs(b) * 100; if (Math.abs(p) < 0.5) return `<span class="muted" style="font-size:.78rem">=</span>`;
  return `<span style="font-size:.78rem;color:var(--${p > 0 ? "ok" : "crit"})">${p > 0 ? "▲" : "▼"} ${fnum(Math.round(Math.abs(p)))} %</span>`;
}
function campanaGrafico(D){
  if (D.length < 2) return "";
  const W = 440, H = 190, P = 34, max = Math.max(1, ...D.map(d => Math.max(d.ing, d.gas))), min = Math.min(0, ...D.map(d => d.mar));
  const sx = i => P + (i + 0.5) * (W - P - 8) / D.length, bw = Math.min(26, (W - P) / D.length / 3.4);
  const sy = v => 10 + (H - 40) * (max - v) / (max - min || 1);
  const yTicks = [max, max / 2, 0, ...(min < 0 ? [min] : [])];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos, costes y margen por campaña" style="width:100%;height:auto;max-height:240px;display:block">
    ${yTicks.map(v => `<line x1="${P}" x2="${W - 4}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)" stroke-width="1"/><text x="${P - 4}" y="${sy(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${fnum(Math.round(v / 1000))}k</text>`).join("")}
    ${D.map((d, i) => `
      <rect x="${sx(i) - bw - 1}" y="${sy(d.ing)}" width="${bw}" height="${Math.max(0, sy(0) - sy(d.ing))}" fill="var(--ok)" rx="2"><title>${d.y} ingresos ${eur.format(d.ing)}</title></rect>
      <rect x="${sx(i) + 1}" y="${sy(d.gas)}" width="${bw}" height="${Math.max(0, sy(0) - sy(d.gas))}" fill="var(--warn)" rx="2"><title>${d.y} costes ${eur.format(d.gas)}</title></rect>
      <text x="${sx(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--fg)">${d.y}</text>`).join("")}
    <polyline points="${D.map((d, i) => `${sx(i)},${sy(d.mar)}`).join(" ")}" fill="none" stroke="var(--eco)" stroke-width="2.5"/>
    ${D.map((d, i) => `<circle cx="${sx(i)}" cy="${sy(d.mar)}" r="4" fill="var(--eco)"><title>${d.y} margen ${eur.format(d.mar)}</title></circle>`).join("")}
  </svg>
  <div class="muted" style="font-size:.82rem;display:flex;gap:14px;flex-wrap:wrap"><span><span style="display:inline-block;width:10px;height:10px;background:var(--ok);border-radius:2px"></span> Ingresos</span><span><span style="display:inline-block;width:10px;height:10px;background:var(--warn);border-radius:2px"></span> Costes</span><span><span style="display:inline-block;width:14px;height:3px;background:var(--eco);vertical-align:middle"></span> Margen</span></div>`;
}
/* Tabla cruzada: cada cultivo por año, en margen por hectárea y kilos por hectárea */
function campanaCruce(){
  const A = campanaAnos(), G = {};
  for (const y of A) for (const r of campanaParcelas(y)) {
    if (!(r.ing || r.gas || r.kg)) continue;
    const k = r.cultivo || "Sin cultivo apuntado"; G[k] = G[k] || {}; const g = G[k][y] = G[k][y] || {ha:0, kg:0, mar:0};
    g.ha += r.ha; g.kg += r.kg; g.mar += r.ing - r.gas;
  }
  const C = Object.keys(G).sort(); if (!C.length) return "";
  const AA = A.filter(y => C.some(c => G[c][y]));
  return `<section class="panel"><h3>Cada cultivo, año a año</h3><p class="muted" style="margin:2px 0 8px;font-size:.88rem">Margen por hectárea y, debajo, kilos por hectárea. Sirve para ver qué cultivo te ha dado más en cada campaña.</p>
  <div class="table-wrap"><table><thead><tr><th>Cultivo</th>${AA.map(y => `<th class="num">${y}</th>`).join("")}</tr></thead><tbody>
  ${C.map(c => `<tr style="cursor:default"><td><strong>${esc(c)}</strong></td>${AA.map(y => { const g = G[c][y]; if (!g) return `<td class="num muted">—</td>`;
    const m = g.ha ? g.mar / g.ha : null; return `<td class="num">${m == null ? "—" : `<span class="pill ${m >= 0 ? "ok" : "crit"}">${eur.format(m)}/ha</span>`}<br><span class="muted" style="font-size:.8rem">${g.kg && g.ha ? `${fnum(Math.round(g.kg / g.ha))} kg/ha` : ""}</span></td>`; }).join("")}</tr>`).join("")}
  </tbody></table></div></section>`;
}
TABS.campanas = {title: "Comparar campañas", render(){
  const cultivos = [...new Set(campanaAnos().flatMap(y => campanaParcelas(y).filter(r => r.ing || r.gas || r.kg).map(r => r.cultivo || "Sin cultivo apuntado")))].sort();
  const ver = UI.campVer, D = campanaDatos(ver);
  const nombre = ver === "todo" ? "todas las parcelas" : ver.startsWith("cultivo:") ? (cultivos.find(c => facNorm(c) === ver.slice(8)) || "") : (DB.parcelas.find(p => p.id === ver.slice(8))?.nombre || "");
  const col = (l, f) => ({l, f});
  const C = [
    col("Superficie", d => d.ha ? `${fnum(d.ha)} ha` : "—"),
    col("Producción", d => d.kg ? `${fnum(Math.round(d.kg))} kg` : "—"),
    col("Kilos por ha", d => d.kg && d.ha ? `${fnum(Math.round(d.kg / d.ha))}` : "—"),
    col("Ingresos", d => eur.format(d.ing)), col("Costes", d => eur.format(d.gas)),
    col("Margen", d => `<span class="pill ${d.mar >= 0 ? "ok" : "crit"}">${eur.format(d.mar)}</span>`),
    col("Margen por ha", d => d.ha ? eur.format(d.mar / d.ha) : "—"),
    col("Coste por kg", d => d.kg ? eur.format(d.gas / d.kg) : "—"),
    col("Precio medio cobrado", d => d.kg && d.ing ? `${eur.format(d.ing / d.kg)}/kg` : "—"),
  ];
  const vv = [null, d => d.kg, d => d.ha ? d.kg / d.ha : null, d => d.ing, d => -d.gas, d => d.mar, d => d.ha ? d.mar / d.ha : null, d => d.kg ? -d.gas / d.kg : null, d => d.kg ? d.ing / d.kg : null];
  const ult = D[D.length - 1], ant = D[D.length - 2];
  let frase = "";
  if (ult && ant) {
    const dm = ult.mar - ant.mar;
    frase = `En ${ult.y} has ganado ${eur.format(Math.abs(dm))} ${dm >= 0 ? "más" : "menos"} que en ${ant.y}${ver === "todo" ? "" : ` con ${nombre}`}` +
      (ult.kg && ant.kg ? `, con ${fnum(Math.round(Math.abs(ult.kg - ant.kg)))} kg ${ult.kg >= ant.kg ? "más" : "menos"} de cosecha` : "") +
      ` y ${eur.format(Math.abs(ult.gas - ant.gas))} ${ult.gas >= ant.gas ? "más" : "menos"} de costes.`;
  }
  const mejor = D.length > 1 ? D.reduce((a, b) => (b.ha ? b.mar / b.ha : b.mar) > (a.ha ? a.mar / a.ha : a.mar) ? b : a) : null;
  return `<div class="toolbar">
      <select id="campVer" aria-label="Qué comparar" style="width:auto;max-width:100%">
        <option value="todo" ${ver === "todo" ? "selected" : ""}>Todas las parcelas juntas</option>
        ${cultivos.length ? `<optgroup label="Por cultivo">${cultivos.map(c => `<option value="cultivo:${esc(facNorm(c))}" ${ver === "cultivo:" + facNorm(c) ? "selected" : ""}>${esc(c)}</option>`).join("")}</optgroup>` : ""}
        ${DB.parcelas.length ? `<optgroup label="Por parcela">${DB.parcelas.map(p => `<option value="parcela:${p.id}" ${ver === "parcela:" + p.id ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</optgroup>` : ""}
      </select>
      <label class="fld chk" style="margin:0"><input type="checkbox" id="repGen" ${UI.repGen ? "checked" : ""}> <span>Repartir gastos generales por hectáreas</span></label>
    </div>
    <p class="muted" style="margin:0;font-size:.88rem">Cada campaña es un año natural. Se cuentan las cosechas y facturas, las labores, los productos del almacén, los partes de trabajo y los apuntes de Economía, igual que en Rentabilidad. En «por cultivo» entra cada parcela el año que tuvo ese cultivo.</p>
    ${D.length ? `
    ${frase ? `<section class="panel"><p style="margin:0;font-size:1.02rem">${esc(frase)}${mejor ? ` Tu mejor campaña ha sido ${mejor.y}.` : ""}</p></section>` : ""}
    <section class="panel"><h3>Campaña a campaña: ${esc(nombre)}</h3>
      ${campanaGrafico(D)}
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Campaña</th>${C.map(c => `<th class="num">${c.l}</th>`).join("")}</tr></thead><tbody>
      ${D.slice().reverse().map((d, ri) => { const prev = D[D.length - 2 - ri];
        return `<tr style="cursor:default"><td><strong>${d.y}</strong></td>${C.map((c, i) => `<td class="num">${c.f(d)}${prev && vv[i] ? `<br>${campanaVar(vv[i](d), vv[i](prev))}` : ""}</td>`).join("")}</tr>`; }).join("")}
      </tbody></table></div>
      <p class="muted" style="font-size:.82rem;margin:6px 0 0">Las flechas comparan con la campaña anterior. En costes, la flecha verde quiere decir que has gastado menos.</p>
    </section>` : `<div class="empty">Aún no hay cosechas, gastos ni ingresos apuntados para ${esc(nombre)}.</div>`}
    ${ver === "todo" ? campanaCruce() : ""}`;
}};
document.addEventListener("change", e => { if (e.target.id === "campVer") { UI.campVer = e.target.value; render(); } });

/* Ejemplo: la campaña anterior, para que se vea la comparación */
SEEDS.push((d, add, D, ids) => {
  const y = new Date().getFullYear() - 1, F = (m, dd) => `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  add("cultivos", {campana:y, parcela:ids.p1, cultivo:"Cebada", variedad:"Planet", siembra:F(11, 10), superficie:6.35, estado:"Cosechado"});
  add("cultivos", {campana:y, parcela:ids.p2, cultivo:"Olivo", variedad:"Picual", superficie:3.1, estado:"Cosechado"});
  add("cosechas", {fecha:F(6, 28), parcela:ids.p1, cultivo:"Cebada", cantidad:22800, precio:0.198, comprador:"Cooperativa local", albaran:"A-1907"});
  add("cosechas", {fecha:F(12, 2), parcela:ids.p2, cultivo:"Olivo", cantidad:9300, precio:0.82, comprador:"Almazara"});
  add("labores", {fecha:F(11, 5), parcela:ids.p1, tipo:"Siembra", maquinaria:"Sembradora 3 m", horas:4, coste:150});
  add("economia", {fecha:F(11, 8), tipo:"Gasto", modulo:"Agrícola", categoria:"Semillas y plantas", concepto:"Semilla de cebada", importe:610, parcela:ids.p1});
  add("economia", {fecha:F(2, 20), tipo:"Gasto", modulo:"Agrícola", categoria:"Abonos", concepto:"Abonado de cobertera", importe:980, parcela:ids.p1});
  add("economia", {fecha:F(4, 15), tipo:"Gasto", modulo:"Agrícola", categoria:"Fitosanitarios", concepto:"Herbicida", importe:240, parcela:ids.p1});
  add("economia", {fecha:F(11, 20), tipo:"Gasto", modulo:"Agrícola", categoria:"Mano de obra", concepto:"Vareo y recogida", importe:1450, parcela:ids.p2});
  add("economia", {fecha:F(3, 10), tipo:"Gasto", modulo:"Agrícola", categoria:"Otros", concepto:"Poda", importe:520, parcela:ids.p2});
});
