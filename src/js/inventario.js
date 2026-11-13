/* ============ Almacén: productos, compras y consumos ============ */
const TIPOS_PROD = ["Fitosanitario","Abono","Semilla","Pienso","Medicamento veterinario","Medicamento apícola","Alimento apícola","Combustible","Otro"];
S.productos = {title: "Productos", one: "producto", label: r => r.nombre, help: "El stock se calcula con las compras y con lo que gastas en cada tratamiento, abonado o alimentación.", fields: [
  {k:"nombre", l:"Nombre comercial", req:1}, {k:"tipo", l:"Tipo", t:"sel", o:TIPOS_PROD, req:1},
  {k:"registro", l:"Nº de registro"}, {k:"materia", l:"Materia activa o composición"},
  {k:"unidad", l:"Unidad de stock", t:"sel", o:["L","kg","ud","dosis","tiras","sacos"], def:"L"},
  {k:"stock_ini", l:"Stock inicial", t:"num", def:0}, {k:"stock_min", l:"Stock mínimo (aviso)", t:"num"},
  {k:"precio", l:"Precio por unidad (€)", t:"num", step:"0.01", help:"Se usa para calcular costes. Si registras compras, se usa el precio medio de las compras."},
  {k:"lote", l:"Lote actual"}, {k:"caducidad", l:"Caducidad", t:"date"},
  {k:"plazo", l:"Plazo de seguridad o tiempo de espera (días)", t:"num"}, {k:"proveedor", l:"Proveedor"},
  {k:"notas", l:"Notas", t:"area"}],
  cols: ["nombre","tipo","registro",
    {l:"Stock", f:r=>`${fnum(stock(r.id))} ${r.unidad||""}`, num:1, pill:r=> r.stock_min!==""&&r.stock_min!=null&&stock(r.id)<=Number(r.stock_min) ? "crit" : ""},
    {l:"Precio medio", f:r=>{const p=precioMedio(r.id);return p?eur.format(p):"";}, num:1},
    {l:"Valor en almacén", f:r=>{const p=precioMedio(r.id);return p?eur.format(Math.max(0,stock(r.id))*p):"";}, num:1},
    "lote", {l:"Caducidad", f:r=>fdate(r.caducidad), pill:r=> !r.caducidad?"": r.caducidad<today()?"crit": daysBetween(today(),r.caducidad)<=60?"warn":"ok"}]};
S.compras = {title: "Compras", one: "compra", label: r => `${refName("productos", r.producto)} ${fdate(r.fecha)}`, fields: [
  {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"producto", l:"Producto", t:"ref", ref:"productos", req:1},
  {k:"cantidad", l:"Cantidad", t:"num", req:1}, {k:"importe", l:"Importe total (€)", t:"num", step:"0.01"},
  {k:"lote", l:"Lote"}, {k:"caducidad", l:"Caducidad del lote", t:"date"}, {k:"proveedor", l:"Proveedor"},
  {k:"factura", l:"Factura o albarán"}, {k:"gasto", l:"Apuntar también como gasto en Economía", t:"chk", def:true}, {k:"notas", l:"Notas", t:"area"}],
  cols: ["fecha","producto",{l:"Cantidad", f:r=>`${fnum(r.cantidad)} ${DB.productos.find(p=>p.id===r.producto)?.unidad||""}`, num:1},
    {l:"Importe", f:r=>r.importe?eur.format(r.importe):"", num:1},{l:"€/unidad", f:r=>r.importe&&r.cantidad?eur.format(r.importe/r.cantidad):"", num:1},"lote","caducidad","proveedor","factura"]};

/* Tablas que gastan producto del almacén: campo de producto que se rellena y tipos sugeridos */
const CONSUMO = {
  fitosanitarios: {tipos:["Fitosanitario"], fill:{producto:"nombre", registro:"registro", materia:"materia", plazo:"plazo"}},
  abonados: {tipos:["Abono"], fill:{producto:"nombre"}},
  veterinarios: {tipos:["Medicamento veterinario"], fill:{medicamento:"nombre", lote_med:"lote", sup_carne:"plazo"}},
  apitratamientos: {tipos:["Medicamento apícola"], fill:{producto:"nombre", registro:"registro", lote:"lote"}},
  alimentacion: {tipos:["Alimento apícola","Pienso"], fill:{}},
  labores: {tipos:["Semilla","Combustible","Otro"], fill:{}},
};
for (const [t, c] of Object.entries(CONSUMO)) {
  const i = S[t].fields.findIndex(f=>f.t==="area");
  S[t].fields.splice(i < 0 ? S[t].fields.length : i, 0,
    {k:"prod", l:"Producto del almacén", t:"ref", ref:"productos", help:"Opcional. Descuenta del stock y calcula el coste.", filter:p=>c.tipos.includes(p.tipo)||!c.tipos.length},
    {k:"consumo", l:"Cantidad gastada del almacén", t:"num", help:"En la unidad del producto (L, kg, ud...)"});
}
function consumos(pid){ let s = 0; for (const t in CONSUMO) for (const r of DB[t]) if (r.prod===pid) s += Number(r.consumo||0); return s; }
function stock(pid){ const p = DB.productos.find(x=>x.id===pid); if (!p) return 0; return Number(p.stock_ini||0) + DB.compras.filter(c=>c.producto===pid).reduce((s,c)=>s+Number(c.cantidad||0),0) - consumos(pid); }
function precioMedio(pid){
  const cs = DB.compras.filter(c=>c.producto===pid && c.importe && c.cantidad);
  const q = cs.reduce((s,c)=>s+Number(c.cantidad),0);
  if (q) return cs.reduce((s,c)=>s+Number(c.importe),0)/q;
  return Number(DB.productos.find(x=>x.id===pid)?.precio||0);
}
/* Coste de producto de un registro */
const costeConsumo = r => r.prod && r.consumo ? Number(r.consumo) * precioMedio(r.prod) : 0;

/* Al elegir un producto en el formulario, rellena nombre, registro, plazo... si están vacíos */
FORM_EXTRA.push({
  html: () => "",
  mount(t){
    const c = CONSUMO[t]; if (!c) return;
    const sel = $("#f_prod"); if (!sel) return;
    // Ordena: primero los tipos sugeridos
    const f = S[t].fields.find(x=>x.k==="prod");
    [...sel.options].forEach(o => { const p = DB.productos.find(x=>x.id===o.value); if (p && !f.filter(p)) o.textContent += ` (${p.tipo.toLowerCase()})`; });
    sel.addEventListener("change", () => {
      const p = DB.productos.find(x=>x.id===sel.value); if (!p) return;
      for (const [k, src] of Object.entries(c.fill)) { const el = $(`#f_${k}`); if (el && !el.value && p[src]!=null && p[src]!=="") el.value = p[src]; }
      const lab = $('label[for="f_consumo"]'); if (lab) lab.textContent = `Cantidad gastada del almacén (${p.unidad||"ud"}) · quedan ${fnum(stock(p.id))}`;
    });
  },
  collect(t, rec){
    // Una compra marcada como gasto crea o actualiza su apunte en Economía
    if (t !== "compras") return;
    const ex = DB.economia.find(e=>e.compra===rec.id);
    if (rec.gasto && rec.importe) {
      const p = DB.productos.find(x=>x.id===rec.producto);
      const cat = {Fitosanitario:"Fitosanitarios", Abono:"Abonos", Semilla:"Semillas y plantas", Pienso:"Piensos", "Medicamento veterinario":"Veterinario", "Medicamento apícola":"Veterinario", "Alimento apícola":"Piensos", Combustible:"Combustible"}[p?.tipo] || "Otros";
      const mod = {Fitosanitario:"Agrícola", Abono:"Agrícola", Semilla:"Agrícola", Pienso:"Ganadero", "Medicamento veterinario":"Ganadero", "Medicamento apícola":"Apícola", "Alimento apícola":"Apícola"}[p?.tipo] || "General";
      const e = {...(ex||{id:uid()}), fecha:rec.fecha, tipo:"Gasto", modulo:mod, categoria:cat, concepto:`Compra: ${p?.nombre||""}${rec.factura?" ("+rec.factura+")":""}`, importe:Number(rec.importe), compra:rec.id, _u:now()};
      if (ex) DB.economia = DB.economia.map(x=>x.id===ex.id?e:x); else DB.economia.push(e);
    } else if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); }
    // El lote y la caducidad de la última compra pasan al producto
    const p = DB.productos.find(x=>x.id===rec.producto);
    if (p && (rec.lote || rec.caducidad)) { if (rec.lote) p.lote = rec.lote; if (rec.caducidad) p.caducidad = rec.caducidad; p._u = now(); }
  },
  remove(t, rec){ if (t==="compras" && rec) { const ex = DB.economia.find(e=>e.compra===rec.id); if (ex) { DB.economia = DB.economia.filter(x=>x!==ex); tomb(ex.id); } } }
});

ALERTS.push(() => {
  const A = [];
  for (const p of DB.productos) {
    const s = stock(p.id);
    if (p.stock_min!==""&&p.stock_min!=null && s <= Number(p.stock_min)) A.push({lv: s<=0?"crit":"warn", t:`Queda poco ${p.nombre}`, s:`Stock: ${fnum(s)} ${p.unidad||""} (mínimo ${fnum(p.stock_min)})`, d:"", mod:"alm", tab:"productos"});
    if (p.caducidad && s > 0) { const dd = daysBetween(today(), p.caducidad); if (dd < 0) A.push({lv:"crit", t:`${p.nombre} caducado`, s:`Lote ${p.lote||"sin lote"}. Retíralo por un gestor autorizado.`, d:p.caducidad, mod:"alm", tab:"productos"}); else if (dd <= 60) A.push({lv:"warn", t:`${p.nombre} caduca pronto`, s:`Lote ${p.lote||"sin lote"}`, d:p.caducidad, mod:"alm", tab:"productos"}); }
  }
  return A;
});

SEEDS.push((d, add, D) => {
  const cu = add("productos", {nombre:"Oxicloruro de cobre 50 WP", tipo:"Fitosanitario", registro:"ES-00000", materia:"Oxicloruro de cobre 50%", unidad:"kg", stock_ini:0, stock_min:5, lote:"CU-2291", caducidad:D(400), plazo:15, proveedor:"Cooperativa local"});
  const ab = add("productos", {nombre:"Complejo 8-15-15", tipo:"Abono", unidad:"kg", stock_ini:0, stock_min:200, proveedor:"Cooperativa local"});
  const an = add("productos", {nombre:"Antiparasitario (ejemplo)", tipo:"Medicamento veterinario", unidad:"L", stock_ini:0.5, stock_min:0.2, lote:"AP-77", caducidad:D(45), plazo:28});
  const am = add("productos", {nombre:"Tiras de amitraz (ejemplo)", tipo:"Medicamento apícola", unidad:"tiras", stock_ini:20, stock_min:10, lote:"L-123", caducidad:D(300)});
  add("productos", {nombre:"Candy o fondant", tipo:"Alimento apícola", unidad:"kg", stock_ini:15, stock_min:5, precio:2.4});
  add("compras", {fecha:D(-8), producto:cu, cantidad:25, importe:85.5, lote:"CU-2291", caducidad:D(400), proveedor:"Cooperativa local", factura:"F-118"});
  add("compras", {fecha:D(-33), producto:ab, cantidad:1600, importe:1040, proveedor:"Cooperativa local", factura:"F-097"});
  // Enlaza los registros de ejemplo con el almacén
  const link = (t, pid, q) => { const r = d[t][d[t].length-1]; if (r) { r.prod = pid; r.consumo = q; } };
  link("fitosanitarios", cu, 9.3); link("abonados", ab, 1590); link("veterinarios", an, 0.35); link("apitratamientos", am, 8);
});
