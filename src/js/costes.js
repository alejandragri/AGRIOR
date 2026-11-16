/* ============ Rentabilidad por parcela, lote y apiario ============ */
const enAno = r => UI.year === "todos" || (r.fecha||"").startsWith(UI.year);
/* Coste real de las máquinas en cada parte: gasoil (horas × l/h × €/L) y taller (coste del año repartido por horas) */
function precioLitroMaq(mid, y){
  const R = DB.repostajes.filter(r=>r.maquina===mid && !/AdBlue/.test(r.combustible||""));
  const Ry = y === "todos" ? R : R.filter(r=>(r.fecha||"").startsWith(y)), X = Ry.length ? Ry : R;
  const L = X.reduce((s,r)=>s+Number(r.litros||0),0), E = X.reduce((s,r)=>s+importeRep(r),0);
  return L ? E / L : 0;
}
function tallerHoraMaq(mid, y){
  const en = r => y === "todos" || (r.fecha||"").startsWith(y);
  const c = DB.intervenciones.filter(i=>i.maquina===mid && en(i)).reduce((s,i)=>s+costeInterv(i),0);
  const h = DB.partes.filter(p=>p.maquina===mid && en(p)).reduce((s,p)=>s+horasMaq(p),0);
  return h ? c / h : 0;
}
/* Desglose de un parte: si la máquina tiene «coste por hora» se usa ese; si no, el gasoil y el taller reales */
function costesParte(p, y){
  const w = DB.trabajadores.find(x=>x.id===p.trabajador), m = DB.maquinaria.find(x=>x.id===p.maquina), hm = horasMaq(p);
  const o = {mo: horasParte(p)*Number(w?.coste_hora||0), gasoil:0, taller:0, maq:0, prod: costeConsumo(p)};
  if (m && Number(m.coste_hora)) o.maq = hm * Number(m.coste_hora);
  else if (m) { o.gasoil = litrosParte(p) * precioLitroMaq(m.id, y); o.taller = hm * tallerHoraMaq(m.id, y); }
  return o;
}
/* Gastos de Economía sin parcela, lote ni apiario: los de gasoil y taller ya se reparten por los partes */
function gastosGenerales(){
  return DB.economia.filter(r=>r.tipo==="Gasto" && enAno(r) && !r.compra && !r.parcela && !r.lote && !r.apiario && !r.repostaje && !r.interv && !/^(Combustible|Maquinaria)$/.test(r.categoria||"")).reduce((s,r)=>s+Number(r.importe||0),0);
}
const cultivoAno = (pid, y) => { const C = DB.cultivos.filter(c=>c.parcela===pid && (y==="todos" || String(c.campana)===y)).sort((a,b)=>Number(b.campana||0)-Number(a.campana||0)); return C[0]?.cultivo || ""; };
UI.repGen = UI.repGen ?? false;
function rentParcelas(){
  const y = UI.year, haT = DB.parcelas.reduce((s,p)=>s+Number(p.superficie||0),0), gen = UI.repGen ? gastosGenerales() : 0;
  return DB.parcelas.map(p => {
    const ha = Number(p.superficie||0);
    const venta = DB.cosechas.filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+Number(r.cantidad||0)*Number(r.precio||0),0);
    const kg = DB.cosechas.filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+Number(r.cantidad||0),0);
    const ingE = DB.economia.filter(r=>r.parcela===p.id&&r.tipo==="Ingreso"&&enAno(r)).reduce((s,r)=>s+Number(r.importe||0),0);
    const labores = DB.labores.filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+Number(r.coste||0)+costeConsumo(r),0);
    const insumos = [...DB.fitosanitarios, ...DB.abonados].filter(r=>r.parcela===p.id&&enAno(r)).reduce((s,r)=>s+costeConsumo(r),0);
    const gasE = DB.economia.filter(r=>r.parcela===p.id&&r.tipo==="Gasto"&&enAno(r)&&!r.compra).reduce((s,r)=>s+Number(r.importe||0),0);
    const repartido = haT ? gen * ha / haT : 0;
    const ing = venta + ingE, gas = labores + insumos + gasE + repartido;
    return {id:p.id, n:p.nombre, cultivo:cultivoAno(p.id, y), sub:`${fnum(ha)} ha${cultivoAno(p.id, y)?" · "+cultivoAno(p.id, y):""}`, ha, kg, ing, gas,
      det:{"Cosechas":venta, "Otros ingresos":ingE, "Labores":labores, "Productos":insumos, "Otros gastos":gasE, "Gastos generales":repartido}};
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
function tablaRent(title, rows, unit, unitKey, kgCol){
  if (!rows.length) return `<section class="panel"><h3>${title}</h3><p class="muted">Sin datos todavía.</p></section>`;
  return `<section class="panel"><h3>${title}</h3><div class="table-wrap"><table><thead><tr><th></th><th>Ingresos</th><th>Costes</th><th>Margen</th>${unit?`<th>Margen ${unit}</th>`:""}${kgCol?`<th>Coste por kg</th>`:""}<th>Desglose</th></tr></thead><tbody>
  ${rows.map(r=>{const m=r.ing-r.gas, u=r[unitKey];return `<tr style="cursor:default"><td><strong>${esc(r.n)}</strong><br><span class="muted" style="font-size:.85rem">${esc(r.sub)}</span></td><td class="num">${eur.format(r.ing)}</td><td class="num">${eur.format(r.gas)}</td><td class="num"><span class="pill ${m>=0?"ok":"crit"}">${eur.format(m)}</span></td>${unit?`<td class="num">${u?eur.format(m/u):"—"}</td>`:""}${kgCol?`<td class="num">${r.kg?eur.format(r.gas/r.kg):"—"}</td>`:""}<td class="wrap-cell muted" style="font-size:.82rem">${Object.entries(r.det).filter(([,v])=>v).map(([k,v])=>`${k}: ${eur.format(v)}`).join(" · ")||"—"}</td></tr>`;}).join("")}
  </tbody></table></div></section>`;
}
function porCultivo(R){
  const G = {};
  for (const r of R) { const k = r.cultivo || "Sin cultivo apuntado"; const g = G[k] = G[k] || {n:k, sub:"", ha:0, kg:0, ing:0, gas:0, det:{}, np:0};
    g.ha += r.ha; g.kg += r.kg; g.ing += r.ing; g.gas += r.gas; g.np++; for (const [a,v] of Object.entries(r.det)) g.det[a] = (g.det[a]||0) + v; }
  return Object.values(G).map(g => ({...g, sub:`${g.np} parcela${g.np>1?"s":""} · ${fnum(g.ha)} ha${g.kg?` · ${fnum(g.kg)} kg`:""}`})).sort((a,b)=>(b.ing-b.gas)-(a.ing-a.gas));
}
TABS.rentabilidad = {title: "Rentabilidad", render(){
  const RP = rentParcelas();
  return `<div class="toolbar"><select id="year" aria-label="Año" style="width:auto">${["todos",...years()].map(y=>`<option value="${y}" ${UI.year===y?"selected":""}>${y==="todos"?"Todos los años":y}</option>`).join("")}</select>
  <span class="muted" style="font-size:.88rem">Suma las cosechas y facturas, las labores, los productos del almacén a precio medio, los partes de trabajo (mano de obra, gasoil según el consumo real de cada máquina y taller repartido por horas) y los apuntes de Economía de cada parcela, lote o apiario.</span></div>
  <div class="fld chk"><input type="checkbox" id="repGen" ${UI.repGen?"checked":""}><label for="repGen">Repartir los gastos generales entre las parcelas según sus hectáreas (seguros, cuotas, gestoría…: ${eur.format(gastosGenerales())} este periodo)</label></div>
  ${tablaRent("Por parcela", RP, "/ha", "ha", 1)}
  ${tablaRent("Por cultivo", porCultivo(RP), "/ha", "ha", 1)}
  ${tablaRent("Por lote de ganado", rentLotes(), "/cabeza", "cab")}
  ${tablaRent("Por apiario", rentApiarios(), "/colmena", "cab")}`;
}};
document.addEventListener("change", e => { if (e.target.id === "repGen") { UI.repGen = e.target.checked; render(); } });
