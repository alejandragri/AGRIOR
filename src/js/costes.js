/* ============ Rentabilidad por parcela, lote y apiario ============ */
const enAno = r => UI.year === "todos" || (r.fecha||"").startsWith(UI.year);
function rentParcelas(){
  return DB.parcelas.map(p => {
    const ha = Number(p.superficie||0);
    const venta = DB.cosechas.filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+Number(r.cantidad||0)*Number(r.precio||0),0);
    const kg = DB.cosechas.filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+Number(r.cantidad||0),0);
    const ingE = DB.economia.filter(r=>r.parcela===p.id&&r.tipo==="Ingreso"&&enAno(r)).reduce((s,r)=>s+Number(r.importe||0),0);
    const labores = DB.labores.filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+Number(r.coste||0)+costeConsumo(r),0);
    const insumos = [...DB.fitosanitarios, ...DB.abonados].filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+costeConsumo(r),0);
    const gasE = DB.economia.filter(r=>r.parcela===p.id&&r.tipo==="Gasto"&&enAno(r)&&!r.compra).reduce((s,r)=>s+Number(r.importe||0),0);
    const ing = venta + ingE, gas = labores + insumos + gasE;
    return {n:p.nombre, sub:`${fnum(ha)} ha`, ha, kg, ing, gas, det:{"Cosechas":venta, "Otros ingresos":ingE, "Labores":labores, "Productos":insumos, "Otros gastos":gasE}};
  });
}
function rentLotes(){
  const lotes = [...new Set([...DB.animales.map(a=>a.lote), ...DB.economia.map(e=>e.lote)].filter(Boolean))];
  return lotes.map(l => {
    const n = DB.animales.filter(a=>a.lote===l&&a.estado!=="Baja").length;
    const ing = DB.economia.filter(r=>r.lote===l&&r.tipo==="Ingreso"&&enAno(r)).reduce((s,r)=>s+Number(r.importe||0),0);
    const vet = DB.veterinarios.filter(r=>enAno(r)&&(r.animal===l||DB.animales.some(a=>a.lote===l&&a.crotal===r.animal))).reduce((s,r)=>s+costeConsumo(r),0);
    const gasE = DB.economia.filter(r=>r.lote===l&&r.tipo==="Gasto"&&enAno(r)&&!r.compra).reduce((s,r)=>s+Number(r.importe||0),0);
    return {n:l, sub:`${n} animales activos`, cab:n, ing, gas:vet+gasE, det:{"Ventas y otros ingresos":ing, "Medicamentos":vet, "Otros gastos":gasE}};
  });
}
function rentApiarios(){
  return DB.apiarios.map(a => {
    const nc = DB.colmenas.filter(c=>c.apiario===a.id&&c.estado!=="Muerta"&&c.estado!=="Vendida").length;
    const prod = DB.producciones.filter(r=>r.apiario===a.id&&enAno(r));
    const venta = prod.reduce((s,r)=>s+Number(r.kg||0)*Number(r.precio||0),0);
    const ingE = DB.economia.filter(r=>r.apiario===a.id&&r.tipo==="Ingreso"&&enAno(r)).reduce((s,r)=>s+Number(r.importe||0),0);
    const trat = DB.apitratamientos.filter(r=>r.apiario===a.id&&enAno(r)).reduce((s,r)=>s+costeConsumo(r),0);
    const alim = DB.alimentacion.filter(r=>r.apiario===a.id&&enAno(r)).reduce((s,r)=>s+costeConsumo(r),0);
    const gasE = DB.economia.filter(r=>r.apiario===a.id&&r.tipo==="Gasto"&&enAno(r)&&!r.compra).reduce((s,r)=>s+Number(r.importe||0),0);
    // Si la venta de la miel ya está en Economía, no se cuenta dos veces: se usa el mayor de los dos
    const ing = Math.max(venta, ingE);
    return {n:a.nombre, sub:`${nc} colmenas · ${fnum(prod.reduce((s,r)=>s+Number(r.kg||0),0))} kg`, cab:nc, ing, gas:trat+alim+gasE, det:{"Producción valorada":venta, "Ingresos apuntados":ingE, "Tratamientos":trat, "Alimentación":alim, "Otros gastos":gasE}};
  });
}
function tablaRent(title, rows, unit, unitKey){
  if (!rows.length) return `<section class="panel"><h3>${title}</h3><p class="muted">Sin datos todavía.</p></section>`;
  return `<section class="panel"><h3>${title}</h3><div class="table-wrap"><table><thead><tr><th></th><th>Ingresos</th><th>Costes</th><th>Margen</th>${unit?`<th>Margen ${unit}</th>`:""}<th>Desglose</th></tr></thead><tbody>
  ${rows.map(r=>{const m=r.ing-r.gas, u=r[unitKey];return `<tr style="cursor:default"><td><strong>${esc(r.n)}</strong><br><span class="muted" style="font-size:.85rem">${esc(r.sub)}</span></td><td class="num">${eur.format(r.ing)}</td><td class="num">${eur.format(r.gas)}</td><td class="num"><span class="pill ${m>=0?"ok":"crit"}">${eur.format(m)}</span></td>${unit?`<td class="num">${u?eur.format(m/u):"—"}</td>`:""}<td class="wrap-cell muted" style="font-size:.82rem">${Object.entries(r.det).filter(([,v])=>v).map(([k,v])=>`${k}: ${eur.format(v)}`).join(" · ")||"—"}</td></tr>`;}).join("")}
  </tbody></table></div></section>`;
}
TABS.rentabilidad = {title: "Rentabilidad", render(){
  return `<div class="toolbar"><select id="year" aria-label="Año" style="width:auto">${["todos",...years()].map(y=>`<option value="${y}" ${UI.year===y?"selected":""}>${y==="todos"?"Todos los años":y}</option>`).join("")}</select>
  <span class="muted" style="font-size:.88rem">Suma las cosechas valoradas, los costes de labores, el producto gastado del almacén a precio medio y los apuntes de Economía asignados a cada parcela, lote o apiario.</span></div>
  ${tablaRent("Por parcela", rentParcelas(), "/ha", "ha")}
  ${tablaRent("Por lote de ganado", rentLotes(), "/cabeza", "cab")}
  ${tablaRent("Por apiario", rentApiarios(), "/colmena", "cab")}`;
}};
