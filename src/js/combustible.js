/* ============ Combustible: repostajes y consumo por hora y por hectárea ============ */
S.repostajes = {title: "Combustible", one: "repostaje", label: r => `${fnum(r.litros)} L · ${refName("maquinaria", r.maquina)}`, help: "Llena el depósito y apunta el horómetro: el consumo en litros por hora se calcula entre dos llenados completos.", fields: [
  {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"maquina", l:"Máquina", t:"ref", ref:"maquinaria", req:1},
  {k:"combustible", l:"Combustible", t:"sel", o:["Gasóleo B (agrícola)","Gasóleo A","Gasolina","AdBlue"], def:"Gasóleo B (agrícola)"},
  {k:"litros", l:"Litros", t:"num", req:1, step:"0.01"}, {k:"horometro", l:"Horas del horómetro", t:"num", help:"Lectura del cuentahoras al repostar"},
  {k:"lleno", l:"Depósito lleno", t:"chk", def:true, help:"Necesario para calcular el consumo"},
  {k:"origen", l:"Origen", t:"sel", o:["Gasolinera o proveedor","Depósito propio"], def:"Gasolinera o proveedor"},
  {k:"prod", l:"Depósito del almacén", t:"ref", ref:"productos", help:"Si repostas de tu depósito, elige el producto de combustible: descuenta los litros del stock y usa su precio"},
  {k:"precio", l:"Precio por litro (€)", t:"num", step:"0.001"}, {k:"importe", l:"Importe (€)", t:"num", step:"0.01", help:"Si lo dejas vacío, litros × precio"},
  {k:"proveedor", l:"Gasolinera o proveedor"}, {k:"albaran", l:"Ticket o albarán"},
  {k:"gasto", l:"Apuntar como gasto en Economía", t:"chk", def:true, help:"No hace falta si el gasóleo sale de tu depósito y ya apuntaste su compra"},
  {k:"notas", l:"Notas", t:"area"}],
  cols: ["fecha", {l:"Máquina", f:r=>refName("maquinaria", r.maquina)}, "combustible", "litros", "horometro",
    {l:"Lleno", f:r=>r.lleno?"Sí":"No"}, {l:"€/L", f:r=>{const p=precioL(r);return p?eur.format(p):"";}, num:1}, {l:"Importe", f:r=>{const i=importeRep(r);return i?eur.format(i):"";}, num:1},
    {l:"Consumo desde el anterior lleno", f:r=>{const t=tramoDe(r);return t?`${fnum(t.lh)} l/h (${fnum(t.litros)} L en ${fnum(t.horas)} h)`:"";}, pill:r=>{const t=tramoDe(r);return !t?"":t.anomalo?"crit":"ok";}}]};
CONSUMO.repostajes = {tipos:["Combustible"], fill:{}};
TIPOS_PROD.includes("Combustible") || TIPOS_PROD.push("Combustible");

function precioL(r){ if (r.precio) return Number(r.precio); if (r.importe && r.litros) return Number(r.importe)/Number(r.litros); if (r.prod) return precioMedio(r.prod); return 0; }
function importeRep(r){ if (r.importe !== "" && r.importe != null) return Number(r.importe); return Number(r.litros||0) * precioL(r); }

/* Tramos entre llenados completos con horómetro: litros repostados después del primero hasta el segundo, entre las horas transcurridas */
function tramos(maqId){
  const R = DB.repostajes.filter(r=>r.maquina===maqId && !/AdBlue/.test(r.combustible||"")).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||"") || Number(a.horometro||0)-Number(b.horometro||0));
  const T = []; let ini = null, litros = 0;
  for (const r of R) {
    if (ini) litros += Number(r.litros||0);
    if (r.lleno && r.horometro !== "" && r.horometro != null) {
      if (ini) { const horas = Number(r.horometro) - Number(ini.horometro); if (horas > 0) T.push({desde:ini, hasta:r, litros, horas, lh: litros/horas}); }
      ini = r; litros = 0;
    }
  }
  const media = mediaLH(T);
  for (const t of T) t.anomalo = T.length >= 3 && media && t.lh > media * 1.3;
  return T;
}
const mediaLH = T => { const h = T.reduce((s,t)=>s+t.horas,0); return h ? T.reduce((s,t)=>s+t.litros,0)/h : 0; };
function tramoDe(r){ if (!r.lleno) return null; return tramos(r.maquina).find(t=>t.hasta.id===r.id) || null; }
/* Consumo medio de una máquina (l/h): media de los tramos completos */
const lhMaquina = id => mediaLH(tramos(id));

/* Al guardar: el depósito propio descuenta del almacén, y el gasto pasa a Economía */
FORM_EXTRA.push({
  html: () => "",
  mount(t){
    if (t !== "repostajes") return;
    const or = $("#f_origen"), g = $("#f_gasto"), pr = $("#f_prod"), sel = $("#f_maquina"), hor = $("#f_horometro");
    const sync = () => { const prop = or.value === "Depósito propio"; pr.closest(".fld").hidden = !prop; if (prop) g.checked = false; };
    or.addEventListener("change", sync); sync();
    pr.addEventListener("change", () => { const p = DB.productos.find(x=>x.id===pr.value); if (p && !$("#f_precio").value) { const pm = precioMedio(p.id); if (pm) $("#f_precio").value = Math.round(pm*1000)/1000; } });
    sel.addEventListener("change", () => { if (hor && !hor.value && sel.value) hor.placeholder = `Estimado: ${fnum(Math.round(horasMaquina(sel.value)*10)/10)} h`; });
  },
  collect(t, rec){
    if (t !== "repostajes") return;
    if (rec.origen !== "Depósito propio") rec.prod = "";
    rec.consumo = rec.prod ? Number(rec.litros||0) : "";
    const ex = DB.economia.find(e=>e.repostaje===rec.id), imp = importeRep(rec);
    if (rec.gasto && imp) { const e = {...(ex||{id:uid()}), fecha:rec.fecha, tipo:"Gasto", modulo:"General", categoria:"Combustible", concepto:`${rec.combustible||"Combustible"}: ${fnum(rec.litros)} L · ${refName("maquinaria", rec.maquina)}${rec.albaran?" ("+rec.albaran+")":""}`, importe:Math.round(imp*100)/100, repostaje:rec.id, _u:now()};
      if (ex) DB.economia = DB.economia.map(x=>x.id===ex.id?e:x); else DB.economia.push(e); }
    else if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); }
  },
  remove(t, rec){ if (t==="repostajes" && rec) { const ex = DB.economia.find(e=>e.repostaje===rec.id); if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); } } }
});
S.repostajes.fields.find(f=>f.k==="prod").filter = p => p.tipo === "Combustible";

/* ---- Consumo estimado de cada parte: horas de máquina × l/h medio ---- */
const litrosParte = p => p.maquina ? horasMaq(p) * lhMaquina(p.maquina) : 0;

UI.combY = UI.combY || String(new Date().getFullYear());
TABS.consumo = {title: "Consumo", render(){
  const y = UI.combY, enY = r => (r.fecha||"").startsWith(y);
  const filas = DB.maquinaria.map(m => {
    const R = DB.repostajes.filter(r=>r.maquina===m.id && enY(r));
    const L = R.filter(r=>!/AdBlue/.test(r.combustible||"")).reduce((s,r)=>s+Number(r.litros||0),0), E = R.reduce((s,r)=>s+importeRep(r),0);
    const T = tramos(m.id), lh = mediaLH(T);
    const P = DB.partes.filter(p=>p.maquina===m.id && enY(p)), hP = P.reduce((s,p)=>s+horasMaq(p),0);
    const PS = P.filter(p=>Number(p.superficie)>0), ha = PS.reduce((s,p)=>s+Number(p.superficie),0), lPS = PS.reduce((s,p)=>s+litrosParte(p),0);
    const precio = L ? E / L : 0;
    return {m, L, E, lh, tr:T.length, hP, ha, lha: ha && lh ? lPS/ha : 0, eh: lh*precio, eha: ha && lh ? lPS/ha*precio : 0, ult:T[T.length-1]};
  }).filter(f => f.L || f.tr || f.hP);
  // Por parcela y tarea, con el consumo estimado de los partes
  const grupos = {};
  for (const p of DB.partes.filter(p=>enY(p) && p.maquina && Number(p.superficie)>0 && lhMaquina(p.maquina))) {
    const k = `${p.parcela}|${p.tarea}`; const g = grupos[k] = grupos[k] || {parcela:p.parcela, tarea:p.tarea, ha:0, l:0, h:0, maq:new Set()};
    g.ha += Number(p.superficie); g.l += litrosParte(p); g.h += horasMaq(p); g.maq.add(refName("maquinaria", p.maquina));
  }
  const G = Object.values(grupos);
  return `<div class="toolbar"><select id="combY" aria-label="Año" style="width:auto">${years().map(v=>`<option ${v===y?"selected":""}>${v}</option>`).join("")}</select>
    <span class="grow"></span><button class="btn primary" data-new="repostajes">+ Repostaje</button></div>
  <div class="stats">
    <div class="stat" style="--mc:var(--taller)"><span class="k">Gasóleo ${y}</span><span class="v">${fnum(Math.round(filas.reduce((s,f)=>s+f.L,0)))} L</span><span class="s">${eur.format(filas.reduce((s,f)=>s+f.E,0))}</span></div>
    <div class="stat" style="--mc:var(--taller)"><span class="k">Horas de máquina ${y}</span><span class="v">${fnum(filas.reduce((s,f)=>s+f.hP,0))} h</span><span class="s">Según los partes de trabajo</span></div>
    <div class="stat" style="--mc:var(--taller)"><span class="k">Superficie trabajada ${y}</span><span class="v">${fnum(filas.reduce((s,f)=>s+f.ha,0))} ha</span><span class="s">Partes con superficie y máquina</span></div>
  </div>
  <section class="panel"><h3>Por máquina</h3>${filas.length ? `<div class="table-wrap"><table><thead><tr><th>Máquina</th><th>Litros</th><th>Coste</th><th>l/h</th><th>€/h</th><th>l/ha</th><th>€/ha</th><th>Último tramo</th></tr></thead><tbody>
    ${filas.map(f=>`<tr style="cursor:default"><td><strong>${esc(f.m.nombre)}</strong><br><span class="muted" style="font-size:.82rem">${f.tr} tramo${f.tr===1?"":"s"} medido${f.tr===1?"":"s"}</span></td><td class="num">${fnum(Math.round(f.L))} L</td><td class="num">${eur.format(f.E)}</td>
      <td class="num"><strong>${f.lh?fnum(f.lh):"—"}</strong></td><td class="num">${f.eh?eur.format(f.eh):"—"}</td><td class="num"><strong>${f.lha?fnum(f.lha):"—"}</strong></td><td class="num">${f.eha?eur.format(f.eha):"—"}</td>
      <td>${f.ult?`<span class="pill ${f.ult.anomalo?"crit":"ok"}">${fnum(f.ult.lh)} l/h</span> <span class="muted" style="font-size:.82rem">${fdate(f.ult.hasta.fecha)}</span>`:"—"}</td></tr>`).join("")}
  </tbody></table></div>` : `<p class="muted">Aún no hay repostajes este año.</p>`}
  <p class="muted" style="font-size:.82rem;margin:0">l/h: litros repostados entre dos llenados completos divididos por las horas del horómetro. l/ha: consumo estimado de los partes de trabajo (horas de máquina × l/h) dividido por las hectáreas trabajadas.</p></section>
  <section class="panel"><h3>Por parcela y tarea</h3>${G.length ? `<div class="table-wrap"><table><thead><tr><th>Parcela</th><th>Tarea</th><th>Máquinas</th><th>Hectáreas</th><th>Horas</th><th>Litros estimados</th><th>l/ha</th><th>ha/h</th></tr></thead><tbody>
    ${G.sort((a,b)=>b.l-a.l).map(g=>`<tr style="cursor:default"><td>${esc(refName("parcelas", g.parcela)||"Sin parcela")}</td><td>${esc(g.tarea||"")}</td><td>${esc([...g.maq].join(", "))}</td><td class="num">${fnum(g.ha)}</td><td class="num">${fnum(g.h)}</td><td class="num">${fnum(Math.round(g.l))}</td><td class="num"><strong>${fnum(g.l/g.ha)}</strong></td><td class="num">${g.h?fnum(g.ha/g.h):"—"}</td></tr>`).join("")}
  </tbody></table></div>` : `<p class="muted">Para ver los l/ha, apunta en los partes la máquina y la superficie trabajada.</p>`}</section>`;
}};
document.addEventListener("change", e => { if (e.target.id === "combY") { UI.combY = e.target.value; render(); } });

/* En los partes, el consumo estimado aparece en la ficha */
S.partes.cols.splice(S.partes.cols.length-1, 0, {l:"Gasóleo est.", f:r=>{const l=litrosParte(r);return l?`${fnum(Math.round(l))} L${Number(r.superficie)>0?` · ${fnum(l/r.superficie)} l/ha`:""}`:"";}, num:1});
/* Y en la ficha de estado del taller */
TALLER_EXTRA.push((m, y) => { const L = DB.repostajes.filter(r=>r.maquina===m.id && (r.fecha||"").startsWith(y) && !/AdBlue/.test(r.combustible||"")).reduce((s,r)=>s+Number(r.litros||0),0), lh = lhMaquina(m.id);
  return L || lh ? `<dt>Gasóleo ${y}</dt><dd>${fnum(Math.round(L))} L${lh?` · <strong>${fnum(lh)} l/h</strong>`:""}</dd>` : ""; });

/* Aviso si el último tramo gasta mucho más de lo normal (posible fuga, avería o robo) */
ALERTS.push(() => DB.maquinaria.flatMap(m => { const T = tramos(m.id), u = T[T.length-1]; if (!u?.anomalo) return [];
  return [{lv:"warn", t:`${m.nombre}: consumo alto de combustible`, s:`${fnum(u.lh)} l/h frente a ${fnum(mediaLH(T))} l/h de media. Revisa fugas, filtros o el registro.`, d:"", mod:"taller", tab:"repostajes"}]; }));

/* Informe PDF: resumen por máquina y detalle de repostajes */
INFORMES.combustible = {t:"Registro de combustible", s:"Repostajes del año y consumo por máquina, en l/h y l/ha", c:"var(--taller)", secs:[]};
{ const _g = generarPDF; generarPDF = k => {
  if (k !== "combustible") return _g(k);
  if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const prev = UI.combY; UI.combY = UI.repY; const box = document.createElement("div"); box.innerHTML = TABS.consumo.render(); UI.combY = prev;
  const tablas = [...box.querySelectorAll("table")].map(tb => [...tb.querySelectorAll("tr")].map(tr => [...tr.children].map(c => c.textContent.replace(/\s+/g," ").trim())));
  const {jsPDF} = window.jspdf, doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51];
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...verde); doc.text("Registro de combustible", 14, 18);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(60); doc.text([T.nombre, T.nif && `NIF ${T.nif}`, `Año ${UI.repY}`, `Emitido el ${fdate(today())}`].filter(Boolean).join(" · "), 14, 25);
  let y = 32;
  const tabla = (titulo, head, body) => { doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...verde); doc.text(titulo, 14, y);
    doc.autoTable({startY:y+2, head:[head], body: body.length ? body : [[{content:"Sin datos", colSpan:head.length, styles:{halign:"center"}}]], theme:"grid", styles:{fontSize:8, cellPadding:1.4}, headStyles:{fillColor:verde}, alternateRowStyles:{fillColor:[243,245,239]}, margin:{left:14, right:14}});
    y = doc.lastAutoTable.finalY + 9; if (y > 175) { doc.addPage(); y = 18; } };
  if (tablas[0]) tabla("Consumo por máquina", tablas[0][0], tablas[0].slice(1));
  if (tablas[1]) tabla("Consumo estimado por parcela y tarea", tablas[1][0], tablas[1].slice(1));
  const R = DB.repostajes.filter(r=>(r.fecha||"").startsWith(UI.repY)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  tabla("Repostajes", ["Fecha","Máquina","Combustible","Litros","Horómetro","Lleno","Origen","€/L","Importe","Proveedor","Ticket","l/h del tramo"],
    R.map(r=>{const t=tramoDe(r);return [fdate(r.fecha), refName("maquinaria",r.maquina), r.combustible||"", fnum(r.litros), r.horometro!==""&&r.horometro!=null?fnum(r.horometro):"", r.lleno?"Sí":"No", r.origen||"", precioL(r)?eur.format(precioL(r)):"", importeRep(r)?eur.format(importeRep(r)):"", r.proveedor||"", r.albaran||"", t?fnum(t.lh):""];}));
  for (let i=1;i<=doc.getNumberOfPages();i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Página ${i} de ${doc.getNumberOfPages()}`, 283, 203, {align:"right"}); }
  try { doc.save(`combustible-${UI.repY}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}; }
SEEDS.push((d, add, D) => {
  const tr = d.maquinaria.find(m=>m.tipo==="Tractor"); if (!tr) return;
  const g = add("productos", {nombre:"Gasóleo B (depósito de la nave)", tipo:"Combustible", unidad:"L", stock_ini:300, stock_min:200, precio:1.02});
  const R = [[-90, 4140, 150, 1.05], [-70, 4157, 205, 1.04], [-45, 4175, 214, 1.02], [-10, 4205, 200, 1.03, false], [-3, 4212, 245, 1.01]];
  R.forEach(([dd, h, l, p, lleno=true], i) => add("repostajes", {fecha:D(dd), maquina:tr.id, combustible:"Gasóleo B (agrícola)", litros:l, horometro:h, lleno, origen: i===4 ? "Depósito propio" : "Gasolinera o proveedor", prod: i===4 ? g : "", consumo: i===4 ? l : "", precio:p, proveedor: i===4 ? "" : "Gasolinera de la cooperativa", gasto:false}));
});
