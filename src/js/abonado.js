/* ============ Plan de abonado: necesidades de N, P y K por parcela según cultivo y cosecha esperada ============ */
/* Extracciones orientativas en kg por tonelada de cosecha (N, P2O5, K2O), incluyendo paja o restos cuando se retiran.
   Valores redondeados de la «Guía práctica de la fertilización racional de los cultivos en España» (MAPA). Cada uno puede cambiarlos. */
const EXTRAC = {
  "Trigo blando": [28,11,20, 2.5, 6], "Trigo duro": [32,12,20, 2.5, 6], "Cebada": [24,10,22, 2.5, 6], "Avena": [26,11,27, 2, 5],
  "Centeno": [24,10,25, 1.8, 4], "Triticale": [25,10,22, 2.5, 6], "Maíz": [25,11,24, 0, 12], "Girasol": [45,18,50, 0.9, 2.8], "Colza": [55,25,50, 1.8, 3.5],
  "Leguminosa (guisante, veza, lenteja, garbanzo)": [0,10,20, 1.2, 3], "Alfalfa (t de heno)": [0,6,25, 4, 12], "Forraje (t de materia seca)": [20,8,25, 4, 10],
  "Olivar (t de aceituna)": [15,4,20, 2.5, 8], "Viñedo (t de uva)": [7,3,9, 5, 14], "Almendro (t de pepita)": [60,20,60, 0.3, 1.5], "Pistachero (t con cáscara)": [30,8,35, 0.6, 2],
  "Ajo": [10,4,10, 0, 12], "Cebolla": [3,1.2,4, 0, 60], "Melón": [4,1.5,7, 0, 35], "Patata": [4,1.5,6, 0, 40], "Tomate": [2.5,1,4, 0, 80], "Otro": [0,0,0, 0, 0]
};
const LEGUM = /guisante|veza|lenteja|garbanzo|yero|alfalfa|haba|leguminosa|almorta/i;
S.planabono = {title: "Plan de abonado", one: "plan", label: r => `${refName("parcelas", r.parcela)} ${r.campana}`, fields: [
  {k:"campana", l:"Campaña", t:"num"}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas"}, {k:"cultivo", l:"Cultivo"}, {k:"rend", l:"Cosecha esperada (t/ha)", t:"num"},
  {k:"nsuelo", l:"N que aporta el suelo (kg/ha)", t:"num"}, {k:"abono", l:"Abono"}, {k:"npk", l:"Riqueza"}, {k:"ext", l:"Extracciones", hide:1}], cols: ["campana","parcela","cultivo","rend"]};
{ const t = MODS.agri.tables, i = t.indexOf("abonados"); t.splice(i, 0, "plan_abonado"); }

/* Lee una riqueza «8-15-15» o «N 46%» del texto */
function leerNPK(s){
  s = String(s||""); let m = s.match(/(\d+(?:[.,]\d+)?)\s*[-–\/]\s*(\d+(?:[.,]\d+)?)\s*[-–\/]\s*(\d+(?:[.,]\d+)?)/);
  if (m) return [m[1], m[2], m[3]].map(x=>Number(x.replace(",", ".")));
  if (/urea/i.test(s)) return [46,0,0];
  m = s.match(/(?:nitr[oó]geno|\bN\b)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%/i); if (m) return [Number(m[1].replace(",", ".")), 0, 0];
  if (/nitrato am[oó]nico c[aá]lcico|\bNAC\b/i.test(s)) return [27,0,0];
  if (/sulfato am[oó]nico/i.test(s)) return [21,0,0];
  if (/superfosfato/i.test(s)) return [0,18,0];
  if (/cloruro pot[aá]sico/i.test(s)) return [0,0,60];
  return null;
}
const npkProducto = p => p ? leerNPK(`${p.nombre} ${p.materia||""}`) : null;
const campanaAct = () => Number(today().slice(0,4)) + (Number(today().slice(5,7)) >= 10 ? 1 : 0);
function ventanaCampana(pid, y){
  const c = DB.cultivos.find(x=>x.parcela===pid && Number(x.campana)===y);
  let desde = `${y-1}-09-01`; if (c?.siembra && addDays(c.siembra, -45) > desde) desde = addDays(c.siembra, -45);
  return [desde, `${y}-08-31`];
}
/* Nutrientes ya aplicados en la campaña (abonados del cuaderno con riqueza) */
function aplicado(pid, y){
  const [a, b] = ventanaCampana(pid, y), o = [0,0,0], sin = [];
  for (const r of DB.abonados.filter(r=>r.parcela===pid && r.fecha >= a && r.fecha <= b)) {
    const k = leerNPK(r.riqueza) || leerNPK(r.producto) || npkProducto(DB.productos.find(p=>p.id===r.prod));
    if (!k) { sin.push(r.producto); continue; }
    for (let i=0;i<3;i++) o[i] += Number(r.cantidad||0) * k[i] / 100;
  }
  return {o, sin};
}
function planDe(pid, y){
  let p = DB.planabono.find(x=>x.parcela===pid && Number(x.campana)===y);
  if (p) return p;
  const cu = DB.cultivos.find(x=>x.parcela===pid && Number(x.campana)===y)?.cultivo || cultivoAno(pid, String(y)) || "";
  const raiz = norm(cu).split(" ")[0].slice(0, 4), k = cu ? (Object.keys(EXTRAC).find(n => norm(n) === norm(cu)) || Object.keys(EXTRAC).find(n => raiz.length >= 3 && norm(n).startsWith(raiz)) || "") : "";
  const par = DB.parcelas.find(x=>x.id===pid), e = EXTRAC[k];
  return {parcela:pid, campana:y, cultivo:k, rend: e ? (par?.riego === "Regadío" ? e[4] : e[3]) || e[4] : "", nsuelo:"", abono:"", npk:"", _nuevo:1, _cu:cu};
}
function calcPlan(pl){
  const e = pl.ext || EXTRAC[pl.cultivo] || [0,0,0], r = Number(pl.rend||0);
  const nec = [e[0]*r, e[1]*r, e[2]*r];
  // Si el año anterior hubo leguminosa, deja nitrógeno en el suelo
  const ant = DB.cultivos.find(c=>c.parcela===pl.parcela && Number(c.campana)===pl.campana-1);
  const credito = ant && LEGUM.test(ant.cultivo) ? 30 : 0;
  nec[0] = Math.max(0, nec[0] - Number(pl.nsuelo||0) - credito);
  const ap = aplicado(pl.parcela, pl.campana), falta = nec.map((n,i)=>Math.max(0, n - ap.o[i]));
  const prod = DB.productos.find(p=>p.id===pl.abono), k = leerNPK(pl.npk) || npkProducto(prod);
  let dosis = 0;
  // Un abono con fósforo o potasio (de fondo) se dosifica por ellos; uno solo nitrogenado (cobertera), por el nitrógeno
  if (k) { const pk = [1,2].filter(i=>k[i] && falta[i] > 1).map(i=>falta[i]/k[i]*100);
    dosis = pk.length ? Math.max(...pk) : (k[0] && falta[0] ? falta[0] / k[0] * 100 : 0);
  }
  dosis = Math.round(dosis/5)*5;
  const aporta = k ? k.map(x=>dosis*x/100) : [0,0,0], nCob = Math.max(0, falta[0] - aporta[0]);
  return {nec, ap, falta, k, dosis, aporta, credito, prod, nCob};
}
/* Campaña por defecto: la última con cultivos apuntados (sin pasar de la actual) */
const planYDef = () => Math.max(0, ...DB.cultivos.map(c=>Number(c.campana)).filter(c=>c && c <= campanaAct())) || campanaAct();
const n0 = v => fnum(Math.round(v));
TABS.plan_abonado = {title: "Plan de abonado", render(){
  if (!UI.planY) UI.planY = planYDef();
  const y = Number(UI.planY), P = DB.parcelas;
  if (!P.length) return `<div class="empty">Da de alta tus parcelas para calcular el abono que necesitan.</div>`;
  const abonos = DB.productos.filter(p=>p.tipo==="Abono");
  return `<div class="toolbar"><label class="muted" for="planY">Campaña</label><select id="planY" style="width:auto">${[campanaAct()+1, campanaAct(), campanaAct()-1].map(c=>`<option ${c===y?"selected":""}>${c}</option>`).join("")}</select>
    <span class="muted" style="font-size:.88rem">Cuánto nitrógeno (N), fósforo (P₂O₅) y potasio (K₂O) se lleva la cosecha que esperas, menos lo que ya has echado esta campaña. Elige un abono y te dice cuántos kilos por hectárea echar.</span></div>
  <datalist id="cultivosDL">${Object.keys(EXTRAC).map(k=>`<option value="${esc(k)}">`).join("")}</datalist>
  <div class="plan-list">${P.map(p => { const pl = planDe(p.id, y), c = calcPlan(pl), ha = Number(p.superficie||0);
    const fila = (l, v, cls="") => `<tr class="${cls}"><td>${l}</td>${v.map(x=>`<td class="num">${n0(x)}</td>`).join("")}</tr>`;
    return `<section class="panel plan" data-pid="${p.id}">
      <div class="head"><div><h3>${esc(p.nombre)}</h3><p>${fnum(ha)} ha · ${esc(p.riego||"")}${pl._cu && !pl.cultivo?` · cultivo apuntado: ${esc(pl._cu)}`:""}</p></div></div>
      <div class="plan-in">
        <div class="fld"><label>Cultivo</label><input type="text" list="cultivosDL" data-pf="cultivo" value="${esc(pl.cultivo)}" placeholder="Elige el cultivo"></div>
        <div class="fld"><label>Cosecha esperada (t/ha)</label><input type="number" step="any" inputmode="decimal" data-pf="rend" value="${esc(pl.rend)}"></div>
        <div class="fld"><label>N del suelo (kg/ha)</label><input type="number" step="any" inputmode="decimal" data-pf="nsuelo" value="${esc(pl.nsuelo)}" placeholder="Del análisis, si lo tienes"></div>
        <div class="fld"><label>Abono</label><select data-pf="abono"><option value="">Escribe la riqueza →</option>${abonos.map(a=>`<option value="${a.id}" ${pl.abono===a.id?"selected":""}>${esc(a.nombre)}${npkProducto(a)?"":" (sin riqueza)"}</option>`).join("")}</select></div>
        <div class="fld"><label>Riqueza N-P-K</label><input type="text" data-pf="npk" value="${esc(pl.npk || (c.k && pl.abono ? c.k.join("-") : ""))}" placeholder="Ej.: 8-15-15 o 46-0-0"></div>
      </div>
      ${pl.cultivo && EXTRAC[pl.cultivo] ? `<div class="table-wrap"><table class="plan-t"><thead><tr><th>kg por hectárea</th><th class="num">N</th><th class="num">P₂O₅</th><th class="num">K₂O</th></tr></thead><tbody>
        ${fila("Necesita la cosecha", c.nec)}${fila("Ya echado esta campaña", c.ap.o)}${fila("<strong>Falta</strong>", c.falta, "falta")}
        ${c.k && c.dosis ? fila(`Aporta ${n0(c.dosis)} kg/ha del abono`, c.aporta, "aporta") : ""}</tbody></table></div>
        <div class="toolbar">${c.k && c.dosis ? `<span><strong>${n0(c.dosis)} kg/ha</strong> × ${fnum(ha)} ha = <strong>${n0(c.dosis*ha)} kg</strong> en total${c.prod?` · tienes ${n0(stock(c.prod.id))} ${esc(c.prod.unidad||"")} en el almacén`:""}</span>
          <button class="btn primary" data-act="plan-apuntar" data-pid="${p.id}">Apuntar en el cuaderno</button>` : c.falta.some(x=>x>1) ? `<span class="muted">Elige un abono o escribe su riqueza para calcular la dosis.</span>` : `<span class="pill ok">Las necesidades de la campaña ya están cubiertas</span>`}</div>
        ${c.k && c.dosis && c.nCob > 10 ? `<p class="muted" style="font-size:.85rem;margin:0">Después quedarán unos <strong>${n0(c.nCob)} kg de N/ha</strong> para la cobertera (por ejemplo ${n0(Math.round(c.nCob/0.46/5)*5)} kg/ha de urea o ${n0(Math.round(c.nCob/0.27/5)*5)} kg/ha de nitrato amónico cálcico 27 %).</p>`:""}
        ${c.credito?`<p class="muted" style="font-size:.82rem;margin:0">Se descuentan ${c.credito} kg de N porque el año anterior hubo leguminosa.</p>`:""}
        ${c.ap.sin.length?`<p class="muted" style="font-size:.82rem;margin:0">No se cuentan ${c.ap.sin.map(esc).join(", ")}: pon su riqueza en el abonado.</p>`:""}
        ${c.k && c.dosis && c.aporta.some((v,i)=>v > c.falta[i] + 20) ? `<p class="muted" style="font-size:.82rem;margin:0">Con esta dosis sobra algo de ${["N","P₂O₅","K₂O"].filter((_,i)=>c.aporta[i] > c.falta[i] + 20).join(" y ")}. Si el análisis de suelo da niveles altos, puedes usar un abono con menos.</p>`:""}`
      : `<p class="muted">Elige el cultivo para calcular.</p>`}
    </section>`; }).join("")}</div>
  <p class="muted" style="font-size:.82rem">Cálculo orientativo con extracciones medias por tonelada de cosecha. El fósforo y el potasio dependen mucho del suelo: un análisis cada pocos años ajusta mucho mejor. En zonas vulnerables a nitratos respeta los límites de tu programa de actuación.</p>`;
}};
function guardarPlan(pid, k, v){
  const y = Number(UI.planY); let pl = DB.planabono.find(x=>x.parcela===pid && Number(x.campana)===y);
  if (!pl) { const b = planDe(pid, y); pl = {id:uid(), parcela:pid, campana:y, cultivo:b.cultivo, rend:b.rend, nsuelo:"", abono:"", npk:""}; DB.planabono.push(pl); }
  pl[k] = (k === "rend" || k === "nsuelo") && v !== "" ? Number(v) : v;
  if (k === "cultivo" && EXTRAC[v]) { const e = EXTRAC[v], p = DB.parcelas.find(x=>x.id===pid); pl.rend = (p?.riego === "Regadío" ? e[4] : e[3]) || e[4]; }
  if (k === "abono") { const pr = DB.productos.find(x=>x.id===v), n = npkProducto(pr); pl.npk = n ? n.join("-") : ""; }
  pl._u = now(); save();
}
document.addEventListener("change", e => {
  if (e.target.id === "planY") { UI.planY = Number(e.target.value); render(); return; }
  const f = e.target.dataset?.pf; if (!f) return; const pid = e.target.closest("[data-pid]")?.dataset.pid; if (!pid) return;
  guardarPlan(pid, f, e.target.value.trim()); render();
});
document.addEventListener("click", e => {
  const el = e.target.closest('[data-act="plan-apuntar"]'); if (!el) return;
  const pid = el.dataset.pid, pl = planDe(pid, Number(UI.planY)), c = calcPlan(pl), p = DB.parcelas.find(x=>x.id===pid);
  openForm("abonados");
  const set = (k, v) => { const f = $(`#f_${k}`); if (f && v != null && v !== "") { f.value = v; f.dispatchEvent(new Event("change", {bubbles:true})); } };
  set("parcela", pid); set("tipo", "Mineral"); set("riqueza", c.k.join("-")); set("cantidad", c.dosis); set("superficie", p?.superficie);
  if (c.prod) { set("prod", c.prod.id); set("producto", c.prod.nombre); if (/kg/.test(c.prod.unidad||"kg")) set("consumo", Math.round(c.dosis * Number(p?.superficie||0))); }
  else set("producto", `Abono ${c.k.join("-")}`);
  set("notas", `Según el plan de abonado de la campaña ${UI.planY}: ${pl.cultivo}, ${fnum(pl.rend)} t/ha esperadas.`);
  toast("Revisa la fecha y guarda cuando lo eches");
});
