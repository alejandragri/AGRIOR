/* ============ Control del riego: riegos, agua gastada y dotación de la concesión ============ */
S.concesiones = {title: "Concesiones de agua", one: "concesión", label: r => r.nombre, help: "La dotación es el agua que te permite gastar tu concesión o comunidad de regantes en un año hidrológico. Asigna cada parcela de regadío a su concesión desde la ficha de la parcela.", fields: [
  {k:"nombre", l:"Nombre (pozo, toma, comunidad…)", req:1},
  {k:"organismo", l:"Confederación o comunidad de regantes", t:"sel", o:["C. H. del Guadiana","C. H. del Tajo","C. H. del Júcar","C. H. del Segura","C. H. del Guadalquivir","Comunidad de regantes","Otro"]},
  {k:"expediente", l:"Nº de expediente o inscripción"},
  {k:"dotacion", l:"Volumen máximo al año (m³)", t:"num", help:"Si tu concesión lo fija por hectárea, deja esto vacío y rellena el siguiente"},
  {k:"dotacion_ha", l:"Dotación por hectárea (m³/ha y año)", t:"num"},
  {k:"inicio", l:"Empieza el año hidrológico", t:"sel", o:["Octubre","Enero"], def:"Octubre"},
  {k:"aviso", l:"Avisar al llegar al (%)", t:"num", def:80},
  {k:"precio", l:"Coste del agua o la energía (€/m³)", t:"num", step:"0.001", help:"Opcional, para la rentabilidad"},
  {k:"notas", l:"Notas", t:"area"}],
  cols: ["nombre","organismo","expediente",
    {l:"Dotación", f:r=>{const d=dotacionDe(r);return d?`${fnum(Math.round(d))} m³`:"";}, num:1},
    {l:"Gastado este año", f:r=>`${fnum(Math.round(gastadoConcesion(r.id)))} m³`, num:1},
    {l:"Usado", f:r=>{const d=dotacionDe(r);return d?`${fnum(Math.round(gastadoConcesion(r.id)/d*100))} %`:"";}, pill:r=>{const d=dotacionDe(r); if(!d) return ""; const p=gastadoConcesion(r.id)/d*100; return p>=100?"crit":p>=Number(r.aviso||80)?"warn":"ok";}}]};
S.riegos = {title: "Riegos", one: "riego", label: r => `Riego ${fdate(r.fecha)}`, help: "Apunta cada riego con las horas y el caudal, o con el volumen o las lecturas del contador. La app suma el agua de cada parcela y de cada concesión.", fields: [
  {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas", req:1},
  {k:"metodo", l:"Sistema", t:"sel", o:["Goteo","Aspersión","Pívot","Cañón","Inundación","Otro"]},
  {k:"horas", l:"Horas de riego", t:"num"}, {k:"caudal", l:"Caudal (m³/h)", t:"num"},
  {k:"lectura_ini", l:"Lectura del contador al empezar (m³)", t:"num"}, {k:"lectura_fin", l:"Lectura del contador al acabar (m³)", t:"num"},
  {k:"m3", l:"Agua gastada (m³)", t:"num", help:"Si lo dejas vacío se calcula con el contador o con horas × caudal"},
  {k:"fertirriego", l:"Con abono (fertirrigación)", t:"chk"},
  {k:"notas", l:"Notas", t:"area"}],
  cols: ["fecha","parcela","metodo","horas",{l:"Agua (m³)", f:r=>fnum(Math.round(m3Riego(r))), num:1},
    {l:"Lámina (mm)", f:r=>{const p=DB.parcelas.find(x=>x.id===r.parcela);return p?.superficie?fnum(Math.round(m3Riego(r)/Number(p.superficie)/10*10)/10):"";}, num:1},
    {l:"Concesión", f:r=>refName("concesiones", DB.parcelas.find(x=>x.id===r.parcela)?.concesion)}]};
S.parcelas.fields.splice(S.parcelas.fields.findIndex(f=>f.k==="notas"), 0, {k:"concesion", l:"Concesión de agua", t:"ref", ref:"concesiones", help:"Solo si es de regadío"});
{ const t = MODS.agri.tables, i = t.indexOf("abonados"); t.splice(i + 1, 0, "riegos", "concesiones"); }

function m3Riego(r){
  if (r.m3 !== "" && r.m3 != null) return Number(r.m3);
  if (r.lectura_fin !== "" && r.lectura_fin != null && r.lectura_ini !== "" && r.lectura_ini != null) return Math.max(0, Number(r.lectura_fin) - Number(r.lectura_ini));
  return Number(r.horas||0) * Number(r.caudal||0);
}
/* Año hidrológico en curso de una concesión: de octubre a septiembre (o de enero a diciembre) */
function anoHidro(c, ref = today()){
  if (c?.inicio === "Enero") { const y = ref.slice(0,4); return [`${y}-01-01`, `${y}-12-31`]; }
  const y = Number(ref.slice(0,4)), m = Number(ref.slice(5,7)), y0 = m >= 10 ? y : y - 1;
  return [`${y0}-10-01`, `${y0+1}-09-30`];
}
function parcelasConcesion(cid){ return DB.parcelas.filter(p=>p.concesion===cid); }
function dotacionDe(c){
  if (c.dotacion !== "" && c.dotacion != null && Number(c.dotacion)) return Number(c.dotacion);
  if (Number(c.dotacion_ha)) return Number(c.dotacion_ha) * parcelasConcesion(c.id).reduce((s,p)=>s+Number(p.superficie||0),0);
  return 0;
}
function gastadoConcesion(cid, ref){
  const c = DB.concesiones.find(x=>x.id===cid); if (!c) return 0;
  const [a, b] = anoHidro(c, ref), ps = new Set(parcelasConcesion(cid).map(p=>p.id));
  return DB.riegos.filter(r=>ps.has(r.parcela) && r.fecha >= a && r.fecha <= b).reduce((s,r)=>s+m3Riego(r),0);
}
/* Al rellenar el formulario: propone el caudal y el sistema del último riego de la parcela y calcula el agua */
FORM_EXTRA.push({ html: () => "", mount(t, r){
  if (t !== "riegos") return;
  const calc = () => { const v = m3Riego({horas:$("#f_horas").value, caudal:$("#f_caudal").value, lectura_ini:$("#f_lectura_ini").value, lectura_fin:$("#f_lectura_fin").value, m3:""});
    const h = $("#f_m3")?.parentNode.querySelector(".help"); if (h) h.textContent = v ? `Calculado: ${fnum(Math.round(v))} m³ (déjalo vacío para usar este valor)` : "Si lo dejas vacío se calcula con el contador o con horas × caudal"; };
  $("#f_parcela").addEventListener("change", e => { if (r) return; const u = DB.riegos.filter(x=>x.parcela===e.target.value).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];
    if (u) { if (!$("#f_caudal").value && u.caudal) $("#f_caudal").value = u.caudal; if (!$("#f_metodo").value && u.metodo) $("#f_metodo").value = u.metodo; if (!$("#f_lectura_ini").value && u.lectura_fin) $("#f_lectura_ini").value = u.lectura_fin; }
    const p = DB.parcelas.find(x=>x.id===e.target.value); if (p && p.riego !== "Regadío") toast("Esta parcela figura como secano. Cámbiala a regadío en su ficha."); calc(); });
  for (const k of ["horas","caudal","lectura_ini","lectura_fin"]) $(`#f_${k}`).addEventListener("input", calc);
  calc();
}});
/* Coste del agua en la rentabilidad de la parcela */
{ const _p = rentParcelas; rentParcelas = () => _p().map(r => {
  const p = DB.parcelas.find(x=>x.id===r.id), c = DB.concesiones.find(x=>x.id===p?.concesion);
  if (!c || !Number(c.precio)) return r;
  const agua = DB.riegos.filter(x=>x.parcela===r.id && enAno(x)).reduce((s,x)=>s+m3Riego(x),0) * Number(c.precio);
  if (agua) { r.gas += agua; r.det["Agua de riego"] = agua; } return r; }); }

/* Resumen encima de la lista de riegos */
{ const _vm = viewModulo; viewModulo = mod => { const h = _vm(mod); if (mod !== "agri" || UI.tab.agri !== "riegos") return h; return h.replace('<div class="head"><div><h2>Riegos</h2>', resumenRiego() + '<div class="head"><div><h2>Riegos</h2>'); }; }
function resumenRiego(){
  const C = DB.concesiones; if (!C.length && !DB.riegos.length) return "";
  const barras = C.map(c => { const d = dotacionDe(c), g = gastadoConcesion(c.id), p = d ? g/d*100 : 0, [a, b] = anoHidro(c);
    return `<div class="riego-c"><div class="bar"><span class="lbl" title="${esc(c.nombre)}">${esc(c.nombre)}</span><span class="track"><span class="fill" style="width:${Math.min(100,p)}%;display:block;background:${p>=100?"var(--crit)":p>=Number(c.aviso||80)?"var(--warn)":"var(--eco)"}"></span></span><span class="n">${d?fnum(Math.round(p))+" %":"—"}</span></div>
      <small class="muted">${fnum(Math.round(g))} de ${d?fnum(Math.round(d)):"¿?"} m³ · año hidrológico ${fdate(a)} a ${fdate(b)}${d && p < 100 ? ` · quedan ${fnum(Math.round(d - g))} m³` : ""}${!d?" · falta la dotación":""}</small></div>`; }).join("");
  const y = today().slice(0,4), P = DB.parcelas.filter(p=>DB.riegos.some(r=>r.parcela===p.id && r.fecha.startsWith(y)));
  return `<section class="panel"><h3>Agua gastada</h3>${barras || `<p class="muted">Da de alta tu concesión en la pestaña «Concesiones de agua» para ver cuánto te queda.</p>`}
    ${P.length ? `<div class="table-wrap"><table><thead><tr><th>Parcela ${y}</th><th class="num">Riegos</th><th class="num">m³</th><th class="num">m³/ha</th><th class="num">mm</th></tr></thead><tbody>${P.map(p=>{const R=DB.riegos.filter(r=>r.parcela===p.id&&r.fecha.startsWith(y)), m=R.reduce((s,r)=>s+m3Riego(r),0), ha=Number(p.superficie||0);return `<tr style="cursor:default"><td>${esc(p.nombre)}</td><td class="num">${R.length}</td><td class="num">${fnum(Math.round(m))}</td><td class="num">${ha?fnum(Math.round(m/ha)):"—"}</td><td class="num">${ha?fnum(Math.round(m/ha/10)):"—"}</td></tr>`;}).join("")}</tbody></table></div>` : ""}</section>`;
}
ALERTS.push(() => DB.concesiones.flatMap(c => { const d = dotacionDe(c); if (!d) return []; const p = gastadoConcesion(c.id)/d*100;
  if (p >= 100) return [{lv:"crit", t:`Dotación de agua superada: ${c.nombre}`, s:`Has gastado el ${fnum(Math.round(p))} % del agua de este año hidrológico`, d:"", mod:"agri", tab:"riegos"}];
  if (p >= Number(c.aviso||80)) return [{lv:"warn", t:`Te acercas a la dotación de ${c.nombre}`, s:`Llevas el ${fnum(Math.round(p))} %: quedan ${fnum(Math.round(d - gastadoConcesion(c.id)))} m³`, d:anoHidro(c)[1], mod:"agri", tab:"riegos"}];
  return []; }));

SEEDS.push((d, add, D) => {
  const p = add("parcelas", {nombre:"Huerta del Pozo", municipio:"Villanueva", provincia:"Ejemplo", poligono:5, parcela:41, recinto:1, superficie:2.4, uso:"TA · Tierra arable", riego:"Regadío"});
  const c = add("concesiones", {nombre:"Pozo de la Huerta", organismo:"C. H. del Guadiana", expediente:"Ejemplo-0001", dotacion_ha:2000, inicio:"Octubre", aviso:80, precio:0.06});
  d.parcelas.find(x=>x.id===p).concesion = c;
  add("cultivos", {campana:new Date().getFullYear(), parcela:p, cultivo:"Maíz", variedad:"", superficie:2.4, estado:"En curso"});
  let lect = 15200; for (let i = 0; i < 6; i++) { const m = 280 + i*15; add("riegos", {fecha:D(-6 - i*9), parcela:p, metodo:"Goteo", horas:8, caudal:Math.round(m/8), lectura_ini:lect, lectura_fin:lect+m}); lect += m; }
});
