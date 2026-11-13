/* ============ Ventas, facturación y trazabilidad de lotes ============ */
S.clientes = {title: "Clientes", one: "cliente", label: r => r.nombre, fields: [
  {k:"nombre", l:"Nombre o razón social", req:1}, {k:"nif", l:"NIF o CIF"},
  {k:"tipo", l:"Tipo", t:"sel", o:["Cooperativa","Almazara o bodega","Industria","Tratante o comerciante","Matadero","Tienda","Particular","Otro"]},
  {k:"direccion", l:"Dirección"}, {k:"cp", l:"Código postal"}, {k:"municipio", l:"Municipio"}, {k:"provincia", l:"Provincia"},
  {k:"telefono", l:"Teléfono"}, {k:"email", l:"Correo electrónico"}, {k:"rega", l:"REGA (si compra animales)"}, {k:"notas", l:"Notas", t:"area"}],
  cols: ["nombre","nif","tipo","municipio","telefono",
    {l:"Facturado este año", f:r=>eur.format(DB.ventas.filter(v=>v.cliente===r.id&&(v.fecha||"").startsWith(String(new Date().getFullYear()))).reduce((s,v)=>s+totalesVenta(v).total,0)), num:1},
    {l:"Pendiente de cobro", f:r=>{const p=DB.ventas.filter(v=>v.cliente===r.id&&!v.cobrada).reduce((s,v)=>s+totalesVenta(v).total,0);return p?eur.format(p):"";}, num:1, pill:r=>DB.ventas.some(v=>v.cliente===r.id&&!v.cobrada)?"warn":""}]};
S.ventas = {title: "Facturas", one: "factura", label: r => r.numero, help: "Cada factura apunta el ingreso en Economía y en la rentabilidad de la parcela, el lote o el apiario. Si indicas el lote vendido, queda en la trazabilidad.", fields: [
  {k:"numero", l:"Número", def:()=>siguienteFactura()}, {k:"fecha", l:"Fecha", t:"date", req:1, def:today},
  {k:"cliente", l:"Cliente", t:"ref", ref:"clientes", req:1},
  {k:"actividad", l:"Actividad", t:"sel", o:["Agrícola","Ganadero","Apícola","General"], def:"Agrícola"},
  {k:"parcela", l:"Parcela de origen", t:"ref", ref:"parcelas"}, {k:"lote_gan", l:"Lote de ganado"}, {k:"apiario", l:"Apiario de origen", t:"ref", ref:"apiarios"},
  {k:"pago", l:"Forma de pago", t:"sel", o:["Transferencia","Liquidación de cooperativa","Efectivo","Domiciliación","Pagaré","Otro"], def:"Transferencia"},
  {k:"vencimiento", l:"Vencimiento", t:"date"}, {k:"cobrada", l:"Cobrada", t:"chk"}, {k:"fecha_cobro", l:"Fecha de cobro", t:"date"},
  {k:"notas", l:"Notas en la factura", t:"area"}, {k:"lineas", l:"Líneas", hide:1}],
  cols: ["numero","fecha","cliente",{l:"Concepto", f:r=>(r.lineas||[]).map(l=>l.concepto).filter(Boolean).join(", "), wrap:1},
    {l:"Base", f:r=>eur.format(totalesVenta(r).base), num:1}, {l:"IVA o compensación", f:r=>eur.format(totalesVenta(r).imp), num:1},
    {l:"Total", f:r=>eur.format(totalesVenta(r).total), num:1},
    {l:"Cobro", f:r=>r.cobrada?"Cobrada":r.vencimiento&&r.vencimiento<today()?"Vencida":"Pendiente", pill:r=>r.cobrada?"ok":r.vencimiento&&r.vencimiento<today()?"crit":"warn"}]};

(() => { const e = Object.entries(MODS); for (const [k] of e) delete MODS[k];
  for (const [k, v] of e) { if (k === "eco") MODS.ventas = {name:"Ventas", color:"var(--ventas)", desc:"Ventas, facturas y trazabilidad", tables:["ventas","clientes","trazabilidad"]}; MODS[k] = v; } })();
ICONS.ventas = '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"/>';

/* Datos fiscales: régimen especial agrario (compensación) o régimen general (IVA) */
const fiscal = () => ({regimen:"REAGP", serie:"F", ...(DB._meta.fiscal||{})});
const COMP = {"Agrícola":12, "General":12, "Ganadero":10.5, "Apícola":10.5};
function siguienteFactura(){ const y = new Date().getFullYear(), s = fiscal().serie || "F", pre = `${s}-${y}-`; const n = DB.ventas.filter(v=>String(v.numero||"").startsWith(pre)).map(v=>Number(String(v.numero).slice(pre.length))||0); return pre + String((n.length?Math.max(...n):0)+1).padStart(3,"0"); }
function totalesVenta(v){
  let base = 0, imp = 0;
  for (const l of v.lineas||[]) { const b = Number(l.cantidad||0) * Number(l.precio||0); base += b; imp += b * Number(l.pct||0) / 100; }
  base = Math.round(base*100)/100; imp = Math.round(imp*100)/100;
  return {base, imp, total: Math.round((base+imp)*100)/100};
}
const pctDefecto = act => fiscal().regimen === "REAGP" ? COMP[act||"Agrícola"] : (act === "Apícola" ? 10 : 4);

/* Lotes disponibles para la trazabilidad */
function lotes(){
  const L = [];
  for (const c of DB.cosechas) if (c.albaran) L.push({codigo:c.albaran, tipo:"Cosecha", fecha:c.fecha, producto:c.cultivo, kg:Number(c.cantidad||0), origen:refName("parcelas", c.parcela), ref:["cosechas", c.id], parcela:c.parcela});
  for (const p of DB.producciones) if (p.lote) L.push({codigo:p.lote, tipo:p.producto||"Miel", fecha:p.fecha, producto:`${p.producto||"Miel"}${p.tipo_miel?" de "+p.tipo_miel.toLowerCase():""}`, kg:Number(p.kg||0), origen:refName("apiarios", p.apiario), ref:["producciones", p.id], apiario:p.apiario});
  for (const l of L) { const v = vendidoLote(l.codigo); l.vendido = v; l.queda = l.kg - v; }
  return L.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
}
function lineasDeLote(cod){ const out = []; for (const v of DB.ventas) for (const l of v.lineas||[]) if (l.lote && l.lote === cod) out.push({v, l}); return out; }
function vendidoLote(cod){ return lineasDeLote(cod).reduce((s,{l})=>s+(/^(kg|t)$/.test(l.unidad||"kg") ? Number(l.cantidad||0)*(l.unidad==="t"?1000:1) : 0),0); }

/* ---- Editor de líneas en el formulario ---- */
let lineasEd = null;
function filaLinea(l, i){
  return `<tr data-i="${i}"><td><input type="text" data-f="concepto" value="${esc(l.concepto)}" placeholder="Concepto" aria-label="Concepto"></td>
    <td><input type="text" data-f="lote" value="${esc(l.lote)}" list="lotesDL" placeholder="Lote" aria-label="Lote"></td>
    <td><input type="number" data-f="cantidad" step="any" inputmode="decimal" value="${esc(l.cantidad)}" aria-label="Cantidad"></td>
    <td><select data-f="unidad" aria-label="Unidad">${["kg","t","L","ud","cabezas"].map(u=>`<option ${u===(l.unidad||"kg")?"selected":""}>${u}</option>`).join("")}</select></td>
    <td><input type="number" data-f="precio" step="any" inputmode="decimal" value="${esc(l.precio)}" aria-label="Precio unitario"></td>
    <td><input type="number" data-f="pct" step="any" inputmode="decimal" value="${esc(l.pct)}" aria-label="Porcentaje"></td>
    <td class="num" data-sub>${eur.format(Number(l.cantidad||0)*Number(l.precio||0))}</td>
    <td><button type="button" class="x" data-act="lin-del" data-i="${i}" aria-label="Quitar línea">×</button></td></tr>`;
}
function pintarLineas(){
  const tb = $("#linBody"); if (!tb) return;
  tb.innerHTML = lineasEd.map(filaLinea).join("");
  const t = totalesVenta({lineas:lineasEd}), r = fiscal().regimen === "REAGP";
  $("#linTot").innerHTML = `Base ${eur.format(t.base)} · ${r?"Compensación REAGP":"IVA"} ${eur.format(t.imp)} · <strong>Total ${eur.format(t.total)}</strong>`;
}
FORM_EXTRA.push({
  html(t, r){
    if (t !== "ventas") return "";
    lineasEd = JSON.parse(JSON.stringify(r?.lineas || [{concepto:"", lote:"", cantidad:"", unidad:"kg", precio:"", pct:pctDefecto(r?.actividad)}]));
    const reagp = fiscal().regimen === "REAGP";
    return `<div class="fld full"><label>Líneas de la factura</label>
      <datalist id="lotesDL">${lotes().map(l=>`<option value="${esc(l.codigo)}">${esc(l.producto)} · quedan ${fnum(l.queda)} kg</option>`).join("")}</datalist>
      <div class="table-wrap"><table class="lin"><thead><tr><th>Concepto</th><th>Lote</th><th>Cantidad</th><th>Unidad</th><th>Precio</th><th>${reagp?"% comp.":"% IVA"}</th><th>Importe</th><th></th></tr></thead><tbody id="linBody"></tbody></table></div>
      <div class="toolbar"><button type="button" class="btn" data-act="lin-add">+ Línea</button><span class="grow"></span><span id="linTot"></span></div>
      <span class="help">${reagp?"Régimen especial agrario: compensación del 12 % (agrícola) o 10,5 % (ganadero y apícola).":"Régimen general de IVA."} Cámbialo en Ajustes → Facturación.</span></div>
      ${r?`<div class="fld full"><div class="toolbar"><button type="button" class="btn" data-act="fac-pdf" data-id="${r.id}">Descargar factura en PDF</button></div></div>`:""}`;
  },
  mount(t){
    if (t !== "ventas") return;
    pintarLineas();
    $("#linBody").addEventListener("input", e => { const tr = e.target.closest("tr"), f = e.target.dataset.f; if (!tr || !f) return; lineasEd[tr.dataset.i][f] = e.target.value;
      if (f === "lote") { const l = lotes().find(x=>x.codigo===e.target.value); const c = tr.querySelector('[data-f="concepto"]'); if (l && !c.value) { c.value = l.producto; lineasEd[tr.dataset.i].concepto = l.producto; } }
      tr.querySelector("[data-sub]").textContent = eur.format(Number(lineasEd[tr.dataset.i].cantidad||0)*Number(lineasEd[tr.dataset.i].precio||0));
      const tt = totalesVenta({lineas:lineasEd}); $("#linTot").innerHTML = `Base ${eur.format(tt.base)} · ${fiscal().regimen==="REAGP"?"Compensación REAGP":"IVA"} ${eur.format(tt.imp)} · <strong>Total ${eur.format(tt.total)}</strong>`; });
    $("#f_actividad").addEventListener("change", e => { const p = pctDefecto(e.target.value); lineasEd.forEach(l => l.pct = p); pintarLineas(); });
    $("#f_cobrada").addEventListener("change", e => { if (e.target.checked && !$("#f_fecha_cobro").value) $("#f_fecha_cobro").value = today(); });
    $("#f_parcela").addEventListener("change", e => { if (e.target.value) { $("#f_actividad").value = "Agrícola"; $("#f_actividad").dispatchEvent(new Event("change")); } });
    $("#f_apiario").addEventListener("change", e => { if (e.target.value) { $("#f_actividad").value = "Apícola"; $("#f_actividad").dispatchEvent(new Event("change")); } });
  },
  collect(t, rec){
    if (t !== "ventas") return;
    rec.lineas = (lineasEd||[]).filter(l => l.concepto || l.cantidad || l.precio).map(l => ({...l, cantidad:l.cantidad===""?"":Number(l.cantidad), precio:l.precio===""?"":Number(l.precio), pct:Number(l.pct||0)}));
    lineasEd = null;
    // Ingreso en Economía: en REAGP la compensación es ingreso del agricultor; en régimen general solo la base
    const tt = totalesVenta(rec), imp = fiscal().regimen === "REAGP" ? tt.total : tt.base;
    const ex = DB.economia.find(e=>e.venta===rec.id);
    if (imp) { const e = {...(ex||{id:uid()}), fecha:rec.fecha, tipo:"Ingreso", modulo:rec.actividad||"General", categoria:"Ventas", concepto:`Factura ${rec.numero}: ${refName("clientes", rec.cliente)}`, importe:imp, parcela:rec.parcela||"", lote:rec.lote_gan||"", apiario:rec.apiario||"", venta:rec.id, _u:now()};
      if (ex) DB.economia = DB.economia.map(x=>x.id===ex.id?e:x); else DB.economia.push(e); }
    else if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); }
  },
  remove(t, rec){ if (t==="ventas" && rec) { const ex = DB.economia.find(e=>e.venta===rec.id); if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); } } }
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "lin-add" && lineasEd) { lineasEd.push({concepto:"", lote:"", cantidad:"", unidad:"kg", precio:"", pct:pctDefecto($("#f_actividad")?.value)}); pintarLineas(); }
  else if (a === "lin-del" && lineasEd) { lineasEd.splice(Number(el.dataset.i), 1); pintarLineas(); }
  else if (a === "fac-pdf") pdfFactura(DB.ventas.find(v=>v.id===el.dataset.id));
  else if (a === "traz-pdf") pdfTrazabilidad(el.dataset.cod);
  else if (a === "traz-ver") { UI.traz = el.dataset.cod; render(); }
});

/* Rentabilidad: si una parcela tiene ventas facturadas, sustituyen a la cosecha valorada (para no contar dos veces) */
{ const _p = rentParcelas; rentParcelas = () => _p().map((r, i) => { const pid = DB.parcelas[i]?.id; const fac = DB.economia.some(e=>e.venta && e.parcela===pid && enAno(e)); if (fac && r.det["Cosechas"]) { r.ing -= r.det["Cosechas"]; r.det["Cosechas"] = 0; } return r; }); }

/* Avisos de cobro */
ALERTS.push(() => DB.ventas.filter(v=>!v.cobrada && v.vencimiento && v.vencimiento < today()).map(v => ({lv:"warn", t:`Factura ${v.numero} sin cobrar`, s:`${refName("clientes", v.cliente)} · ${eur.format(totalesVenta(v).total)} · venció el ${fdate(v.vencimiento)}`, d:"", mod:"ventas", tab:"ventas"})));

/* Ajustes de facturación */
SETTINGS.push(() => { const f = fiscal(); return `<form class="panel" id="fiscalF"><h2>Facturación</h2>
  <div class="fld"><label for="fi_reg">Régimen de IVA</label><select id="fi_reg" name="regimen"><option value="REAGP" ${f.regimen==="REAGP"?"selected":""}>Régimen especial agrario (compensación 12 % / 10,5 %)</option><option value="GENERAL" ${f.regimen==="GENERAL"?"selected":""}>Régimen general (IVA)</option></select></div>
  <div class="fld"><label for="fi_serie">Serie de facturas</label><input id="fi_serie" name="serie" type="text" value="${esc(f.serie)}"></div>
  <div class="fld"><label for="fi_dir">Dirección fiscal</label><input id="fi_dir" name="direccion" type="text" value="${esc(f.direccion)}"></div>
  <div class="fld"><label for="fi_loc">Código postal, municipio y provincia</label><input id="fi_loc" name="localidad" type="text" value="${esc(f.localidad)}"></div>
  <div class="fld"><label for="fi_iban">IBAN para transferencias</label><input id="fi_iban" name="iban" type="text" value="${esc(f.iban)}"></div>
  <div class="fld"><label for="fi_pie">Texto al pie de la factura</label><input id="fi_pie" name="pie" type="text" value="${esc(f.pie)}"></div>
  <div><button class="btn primary" type="submit">Guardar datos de facturación</button></div></form>`; });
document.addEventListener("submit", e => { if (e.target.id !== "fiscalF") return; e.preventDefault(); DB._meta.fiscal = Object.fromEntries(new FormData(e.target)); DB._meta.titular_u = now(); save(); render(); toast("Datos de facturación guardados"); });

/* ---- PDF de factura ---- */
function pdfFactura(v){
  if (!v) return; if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const {jsPDF} = window.jspdf, doc = new jsPDF({unit:"mm", format:"a4"}), T = DB._meta.titular || {}, F = fiscal(), c = DB.clientes.find(x=>x.id===v.cliente) || {}, verde = [47,82,51];
  const reagp = F.regimen === "REAGP", tt = totalesVenta(v);
  doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(...verde); doc.text(reagp ? "Factura (REAGP)" : "Factura", 14, 20);
  doc.setFontSize(11); doc.text(`Nº ${v.numero||""}`, 196, 16, {align:"right"}); doc.setFont("helvetica","normal"); doc.setTextColor(60); doc.text(`Fecha: ${fdate(v.fecha)}`, 196, 22, {align:"right"});
  doc.setFontSize(9.5); doc.setTextColor(30);
  doc.setFont("helvetica","bold"); doc.text("Emisor", 14, 34); doc.text("Cliente", 110, 34); doc.setFont("helvetica","normal");
  doc.text([T.nombre||"", T.nif?`NIF ${T.nif}`:"", F.direccion||"", F.localidad||""].filter(Boolean), 14, 40);
  doc.text([c.nombre||"", c.nif?`NIF ${c.nif}`:"", c.direccion||"", [c.cp, c.municipio, c.provincia].filter(Boolean).join(" ")].filter(Boolean), 110, 40);
  doc.autoTable({startY:62, head:[["Concepto","Lote","Cantidad","Precio","Importe", reagp?"% comp.":"% IVA"]],
    body:(v.lineas||[]).map(l=>[l.concepto||"", l.lote||"", `${fnum(l.cantidad)} ${l.unidad||""}`, eur.format(Number(l.precio||0)), eur.format(Number(l.cantidad||0)*Number(l.precio||0)), `${fnum(l.pct)} %`]),
    theme:"grid", styles:{fontSize:9.5, cellPadding:2}, headStyles:{fillColor:verde}, columnStyles:{2:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"}}, margin:{left:14, right:14}});
  let y = doc.lastAutoTable.finalY + 4;
  doc.autoTable({startY:y, body:[["Base imponible", eur.format(tt.base)], [reagp?"Compensación REAGP":"IVA", eur.format(tt.imp)], [{content:"Total", styles:{fontStyle:"bold"}}, {content:eur.format(tt.total), styles:{fontStyle:"bold"}}]], theme:"plain", styles:{fontSize:10.5, cellPadding:1.5, halign:"right"}, tableWidth:80, margin:{left:116}});
  y = doc.lastAutoTable.finalY + 8; doc.setFontSize(9); doc.setTextColor(60);
  const pie = [`Forma de pago: ${v.pago||""}${v.vencimiento?` · Vencimiento: ${fdate(v.vencimiento)}`:""}`, F.iban?`IBAN: ${F.iban}`:"",
    reagp ? "Operación acogida al Régimen Especial de la Agricultura, Ganadería y Pesca (arts. 124 a 134 de la Ley 37/1992 del IVA). Compensación a tanto alzado." : "",
    v.notas||"", F.pie||""].filter(Boolean);
  doc.text(doc.splitTextToSize(pie.join("\n"), 182), 14, y);
  try { doc.save(`factura-${v.numero||v.fecha}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}

/* ---- Trazabilidad ---- */
function fichaLote(cod){
  const l = lotes().find(x=>x.codigo===cod); if (!l) return null;
  const desde = addDays(l.fecha, -365), E = [];
  if (l.parcela) {
    for (const r of DB.fitosanitarios.filter(r=>r.parcela===l.parcela && r.fecha>=desde && r.fecha<=l.fecha)) { const fin = r.plazo ? addDays(r.fecha, r.plazo) : r.fecha; E.push({fecha:r.fecha, tipo:"Tratamiento fitosanitario", txt:`${r.producto}${r.registro?" (Nº "+r.registro+")":""} contra ${r.problema||"—"} · ${fnum(r.dosis)} ${r.unidad||""}`, ok: fin <= l.fecha, nota: r.plazo ? `Plazo de seguridad hasta ${fdate(fin)}` : ""}); }
    for (const r of DB.abonados.filter(r=>r.parcela===l.parcela && r.fecha>=desde && r.fecha<=l.fecha)) E.push({fecha:r.fecha, tipo:"Abonado", txt:`${r.producto} · ${fnum(r.cantidad)} kg/ha`, ok:true});
    for (const r of DB.labores.filter(r=>r.parcela===l.parcela && r.fecha>=desde && r.fecha<=l.fecha)) E.push({fecha:r.fecha, tipo:"Labor", txt:`${r.tipo}${r.descripcion?": "+r.descripcion:""}`, ok:true});
  }
  if (l.apiario) {
    for (const r of DB.apitratamientos.filter(r=>r.apiario===l.apiario && r.fecha>=desde && r.fecha<=l.fecha)) E.push({fecha:r.fecha, tipo:"Tratamiento apícola", txt:`${r.producto}${r.registro?" (Nº "+r.registro+")":""} contra ${r.enfermedad||"—"}`, ok: !!r.retirada && r.retirada <= l.fecha, nota: r.retirada ? `Retirada ${fdate(r.retirada)}` : "Sin fecha de retirada"});
    for (const r of DB.alimentacion.filter(r=>r.apiario===l.apiario && r.fecha>=desde && r.fecha<=l.fecha)) E.push({fecha:r.fecha, tipo:"Alimentación", txt:`${r.tipo} · ${fnum(r.cantidad)} kg`, ok:true});
    for (const r of DB.trashumancia.filter(r=>(r.origen===l.apiario||r.destino===l.apiario) && r.fecha>=desde && r.fecha<=l.fecha)) E.push({fecha:r.fecha, tipo:"Trashumancia", txt:`${refName("apiarios", r.origen)} → ${refName("apiarios", r.destino)} · ${r.colmenas} colmenas`, ok:true});
  }
  E.sort((a,b)=>a.fecha.localeCompare(b.fecha));
  return {l, E, ventas: lineasDeLote(cod)};
}
UI.traz = UI.traz || "";
TABS.trazabilidad = {title: "Trazabilidad", render(){
  const L = lotes();
  if (!L.length) return `<div class="empty">Pon un número de lote en tus cosechas (campo «Albarán o lote») y en las extracciones de miel para seguirlos hasta el comprador.</div>`;
  if (!L.some(l=>l.codigo===UI.traz)) UI.traz = L[0].codigo;
  const F = fichaLote(UI.traz);
  return `<div class="grid2"><section class="panel"><h3>Lotes</h3><div class="table-wrap"><table><thead><tr><th>Lote</th><th>Producto</th><th>Origen</th><th>Fecha</th><th>Producido</th><th>Vendido</th><th>Queda</th></tr></thead><tbody>
    ${L.map(l=>`<tr data-act="traz-ver" data-cod="${esc(l.codigo)}" ${l.codigo===UI.traz?'style="background:var(--surface-2)"':""}><td><strong>${esc(l.codigo)}</strong></td><td>${esc(l.producto)}</td><td>${esc(l.origen)}</td><td>${fdate(l.fecha)}</td><td class="num">${fnum(l.kg)} kg</td><td class="num">${fnum(l.vendido)} kg</td><td class="num"><span class="pill ${l.queda<0?"crit":l.queda>0?"warn":"ok"}">${fnum(l.queda)} kg</span></td></tr>`).join("")}
  </tbody></table></div></section>
  <section class="panel traz"><div class="head"><div><h3>Lote ${esc(F.l.codigo)}</h3><p>${esc(F.l.producto)} · ${fnum(F.l.kg)} kg · ${fdate(F.l.fecha)}</p></div><button class="btn" data-act="traz-pdf" data-cod="${esc(F.l.codigo)}">Ficha en PDF</button></div>
    <ol class="traz-line">
      <li class="o"><strong>Origen</strong><span>${F.l.parcela?`Parcela ${esc(F.l.origen)} ${(()=>{const p=DB.parcelas.find(x=>x.id===F.l.parcela);return p?`(SIGPAC ${[p.poligono,p.parcela,p.recinto].filter(Boolean).join("/")} · ${esc(p.municipio||"")})`:"";})()}`:`Apiario ${esc(F.l.origen)} ${(()=>{const a=DB.apiarios.find(x=>x.id===F.l.apiario);return a?`(${esc(a.codigo||"")} · ${DB.colmenas.filter(c=>c.apiario===a.id&&c.estado!=="Muerta"&&c.estado!=="Vendida").length} colmenas)`:"";})()}`}</span></li>
      ${F.E.map(e=>`<li class="${e.ok?"":"bad"}"><strong>${fdate(e.fecha)} · ${esc(e.tipo)}</strong><span>${esc(e.txt)}${e.nota?` · <em>${esc(e.nota)}</em>`:""}${e.ok?"":" · <b>revisar</b>"}</span></li>`).join("")}
      <li class="o"><strong>${fdate(F.l.fecha)} · ${F.l.parcela?"Cosecha":"Extracción"}</strong><span>${fnum(F.l.kg)} kg</span></li>
      ${F.ventas.length ? F.ventas.map(({v,l})=>`<li class="o"><strong>${fdate(v.fecha)} · Venta</strong><span>${fnum(l.cantidad)} ${esc(l.unidad||"kg")} a ${esc(refName("clientes", v.cliente))} · factura ${esc(v.numero)}</span></li>`).join("") : `<li><strong>Sin ventas</strong><span>Indica este lote en las líneas de la factura.</span></li>`}
    </ol></section></div>`;
}};
function pdfTrazabilidad(cod){
  const F = fichaLote(cod); if (!F) return; if (!window.jspdf) return toast("El generador de PDF no está disponible");
  const {jsPDF} = window.jspdf, doc = new jsPDF({unit:"mm", format:"a4"}), T = DB._meta.titular || {}, verde = [47,82,51];
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...verde); doc.text(`Ficha de trazabilidad · Lote ${cod}`, 14, 20);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(60); doc.text([T.nombre, T.nif&&`NIF ${T.nif}`, T.rega_api&&F.l.apiario&&`REGA ${T.rega_api}`].filter(Boolean).join(" · ") || "", 14, 27);
  doc.autoTable({startY:32, body:[["Producto", F.l.producto], ["Origen", F.l.origen], ["Fecha de cosecha o extracción", fdate(F.l.fecha)], ["Cantidad", `${fnum(F.l.kg)} kg`], ["Vendido", `${fnum(F.l.vendido)} kg`], ["Existencias", `${fnum(F.l.queda)} kg`]], theme:"grid", styles:{fontSize:10}, columnStyles:{0:{fontStyle:"bold", cellWidth:60}}, margin:{left:14, right:14}});
  doc.autoTable({startY:doc.lastAutoTable.finalY+6, head:[["Fecha","Operación","Detalle","Control"]], body:F.E.map(e=>[fdate(e.fecha), e.tipo, e.txt, (e.nota||"") + (e.ok?"":" · REVISAR")]), theme:"grid", styles:{fontSize:8.5}, headStyles:{fillColor:verde}, margin:{left:14, right:14}});
  doc.autoTable({startY:doc.lastAutoTable.finalY+6, head:[["Fecha","Cliente","NIF","Factura","Cantidad"]], body:F.ventas.map(({v,l})=>{const c=DB.clientes.find(x=>x.id===v.cliente)||{};return [fdate(v.fecha), c.nombre||"", c.nif||"", v.numero||"", `${fnum(l.cantidad)} ${l.unidad||""}`];}), theme:"grid", styles:{fontSize:8.5}, headStyles:{fillColor:verde}, margin:{left:14, right:14}});
  try { doc.save(`trazabilidad-${cod}.pdf`); toast("PDF descargado"); } catch(e) { toast("No se pudo descargar el PDF en este navegador"); }
}

SEEDS.push((d, add, D, ids) => {
  const coop = add("clientes", {nombre:"Cooperativa local (ejemplo)", nif:"F00000000", tipo:"Cooperativa", municipio:"Villanueva", provincia:"Ejemplo"});
  const tienda = add("clientes", {nombre:"Tienda de productos de la tierra (ejemplo)", nif:"B00000000", tipo:"Tienda", municipio:"Villanueva"});
  const y = new Date().getFullYear(), miel = d.producciones[0]?.lote || `M-${y}-01`, trigo = d.cosechas[0]?.albaran || "A-2231";
  add("ventas", {numero:`F-${y}-001`, fecha:D(-138), cliente:coop, actividad:"Agrícola", parcela:ids.p1, pago:"Liquidación de cooperativa", vencimiento:D(-100), cobrada:true, fecha_cobro:D(-98), lineas:[{concepto:"Trigo blando", lote:trigo, cantidad:21500, unidad:"kg", precio:0.235, pct:12}]});
  add("ventas", {numero:`F-${y}-002`, fecha:D(-60), cliente:tienda, actividad:"Apícola", apiario:ids.a1, pago:"Transferencia", vencimiento:D(-30), cobrada:false, lineas:[{concepto:"Miel de romero, tarro 1 kg", lote:miel, cantidad:40, unidad:"kg", precio:9, pct:10.5}]});
});
/* Tras crear los ejemplos, los apuntes de Economía de las facturas se generan como si se hubieran guardado */
SEEDS.push(d => { d.economia = d.economia.filter(e => e.concepto !== "Venta de miel de romero"); for (const v of d.ventas) { const tt = (()=>{let b=0,i=0;for(const l of v.lineas){const x=l.cantidad*l.precio;b+=x;i+=x*l.pct/100;}return {b, t:b+i};})();
  d.economia.push({id:uid(), _demo:true, fecha:v.fecha, tipo:"Ingreso", modulo:v.actividad, categoria:"Ventas", concepto:`Factura ${v.numero}`, importe:Math.round(tt.t*100)/100, parcela:v.parcela||"", apiario:v.apiario||"", lote:"", venta:v.id}); } });
