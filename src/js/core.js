"use strict";
/* ============ Utilidades ============ */
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0, 10); };
const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + Number(n || 0)); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const fdate = d => d ? d.split("-").reverse().join("/") : "";
const nf = new Intl.NumberFormat("es-ES", {maximumFractionDigits: 2});
const eur = new Intl.NumberFormat("es-ES", {style: "currency", currency: "EUR"});
const fnum = v => (v === "" || v == null || isNaN(v)) ? "" : nf.format(Number(v));
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }

/* ============ Esquema de datos ============ */
const USOS = ["TA · Tierra arable","OV · Olivar","VI · Viñedo","FS · Frutos secos","FY · Frutales","CI · Cítricos","HU · Huerta","PS · Pastizal","PR · Pasto arbustivo","PA · Pasto con arbolado","FO · Forestal","IM · Improductivo","Otro"];
const ESPECIES = ["Ovino","Caprino","Vacuno","Porcino","Equino","Aves","Conejos","Otro"];
const MODS = {
  inicio: {name: "Inicio", color: "var(--accent)"},
  agri: {name: "Agrícola", color: "var(--agri)", desc: "Parcelas, cultivos y cuaderno de campo", tables: ["parcelas","mapa","cultivos","labores","fitosanitarios","abonados","cosechas","tiempo"]},
  gan: {name: "Ganadero", color: "var(--gan)", desc: "Libro de registro, movimientos y medicamentos", tables: ["animales","movimientos","veterinarios"]},
  api: {name: "Apícola", color: "var(--api)", desc: "Libro de explotación apícola", tables: ["apiarios","mapa","colmenas","revisiones","apitratamientos","alimentacion","producciones","trashumancia"]},
  alm: {name: "Almacén", color: "var(--alm)", desc: "Productos, existencias y caducidades", tables: ["productos","compras"]},
  agenda: {name: "Agenda", color: "var(--agenda)", desc: "Calendario y recordatorios", tables: ["calendario","recordatorios"]},
  guiado: {name: "Guiado GPS", color: "var(--guiado)", desc: "Guiado en paralelo para el tractor", tables: ["guia"]},
  eco: {name: "Economía", color: "var(--eco)", desc: "Gastos, ingresos y rentabilidad", tables: ["economia","rentabilidad"]},
  informes: {name: "Informes", color: "var(--eco)", desc: "Libros oficiales en PDF", tables: ["pdf"]},
  ajustes: {name: "Ajustes", color: "var(--muted)"},
};
/* Pestañas que no son tablas: {title, render(), mount()} */
const TABS = {};
/* Funciones que añaden avisos al inicio: () => [{lv,t,s,d,mod,tab}] */
const ALERTS = [];
/* Funciones que añaden datos de ejemplo: (d, add, D, ids) => void */
const SEEDS = [];
/* Tareas tras guardar (sincronización, copias) */
const AFTER_SAVE = [];
const isTable = t => !!S[t];
/* Extensiones del formulario: {html(t,r), mount(t,r), collect(t,rec), remove(t,rec)} */
const FORM_EXTRA = [];
/* Secciones extra en Ajustes: () => html */
const SETTINGS = [];
const refName = (t, id) => { const r = DB[t]?.find(x => x.id === id); return r ? S[t].label(r) : ""; };

const S = {
  parcelas: {title: "Parcelas", one: "parcela", label: r => r.nombre, fields: [
    {k:"nombre", l:"Nombre o paraje", req:1},
    {k:"municipio", l:"Municipio"}, {k:"provincia", l:"Provincia"},
    {k:"poligono", l:"Polígono", t:"num"}, {k:"parcela", l:"Parcela", t:"num"},
    {k:"recinto", l:"Recinto", t:"num"}, {k:"superficie", l:"Superficie (ha)", t:"num", req:1, step:"0.0001"},
    {k:"uso", l:"Uso SIGPAC", t:"sel", o:USOS}, {k:"riego", l:"Sistema", t:"sel", o:["Secano","Regadío"]},
    {k:"notas", l:"Notas", t:"area"}],
    cols: ["nombre", {l:"SIGPAC (pol/par/rec)", f:r => [r.poligono,r.parcela,r.recinto].filter(x=>x!==""&&x!=null).join("/")}, "municipio", "superficie", "uso", "riego"]},
  cultivos: {title: "Cultivos", one: "cultivo", label: r => `${r.cultivo} ${r.campana || ""}`, fields: [
    {k:"campana", l:"Campaña", t:"num", req:1, def:() => new Date().getFullYear()},
    {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas", req:1},
    {k:"cultivo", l:"Cultivo", req:1}, {k:"variedad", l:"Variedad"},
    {k:"siembra", l:"Fecha de siembra o plantación", t:"date"}, {k:"superficie", l:"Superficie (ha)", t:"num", step:"0.0001"},
    {k:"estado", l:"Estado", t:"sel", o:["En curso","Cosechado","Abandonado"], def:"En curso"},
    {k:"notas", l:"Notas", t:"area"}],
    cols: ["campana","parcela","cultivo","variedad","siembra","superficie",{l:"Estado", f:r => r.estado, pill:r => r.estado==="En curso"?"ok":""}]},
  labores: {title: "Labores", one: "labor", label: r => r.tipo, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas", req:1},
    {k:"tipo", l:"Labor", t:"sel", o:["Laboreo","Siembra","Riego","Poda","Desbroce","Recolección","Otro"], req:1},
    {k:"maquinaria", l:"Maquinaria"}, {k:"horas", l:"Horas", t:"num"}, {k:"coste", l:"Coste (€)", t:"num"},
    {k:"descripcion", l:"Descripción", t:"area"}],
    cols: ["fecha","parcela","tipo","maquinaria","horas","coste",{l:"Descripción", f:r=>r.descripcion, wrap:1}]},
  fitosanitarios: {title: "Tratamientos fitosanitarios", one: "tratamiento", label: r => r.producto, help: "Registro de tratamientos del cuaderno de campo (RD 1311/2012 y RD 1050/2022).", fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas", req:1},
    {k:"cultivo", l:"Cultivo"}, {k:"problema", l:"Plaga, enfermedad o mala hierba", req:1},
    {k:"producto", l:"Producto comercial", req:1}, {k:"registro", l:"Nº de registro"},
    {k:"materia", l:"Materia activa"}, {k:"dosis", l:"Dosis", t:"num"},
    {k:"unidad", l:"Unidad", t:"sel", o:["L/ha","kg/ha","cc/hL","g/hL","%"], def:"L/ha"}, {k:"sup_tratada", l:"Superficie tratada (ha)", t:"num", step:"0.0001"},
    {k:"plazo", l:"Plazo de seguridad (días)", t:"num"}, {k:"aplicador", l:"Aplicador (nombre y carné)"},
    {k:"equipo", l:"Equipo de aplicación (nº ROMA)"}, {k:"eficacia", l:"Eficacia", t:"sel", o:["Buena","Regular","Mala"]},
    {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","parcela","cultivo","problema","producto","registro",{l:"Dosis", f:r=>r.dosis?`${fnum(r.dosis)} ${r.unidad||""}`:""},"sup_tratada",
      {l:"Fin plazo seg.", f:r=> r.plazo?fdate(addDays(r.fecha,r.plazo)):"", pill:r=> r.plazo && addDays(r.fecha,r.plazo) >= today() ? "warn" : ""}, "aplicador"]},
  abonados: {title: "Abonados", one: "abonado", label: r => r.producto, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas", req:1},
    {k:"producto", l:"Producto", req:1}, {k:"tipo", l:"Tipo", t:"sel", o:["Mineral","Orgánico","Enmienda","Foliar"]},
    {k:"riqueza", l:"Riqueza N-P-K", help:"Ejemplo: 8-15-15"}, {k:"cantidad", l:"Cantidad (kg/ha)", t:"num"},
    {k:"superficie", l:"Superficie (ha)", t:"num", step:"0.0001"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","parcela","producto","tipo","riqueza","cantidad","superficie"]},
  cosechas: {title: "Cosechas", one: "cosecha", label: r => r.cultivo, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"parcela", l:"Parcela", t:"ref", ref:"parcelas", req:1},
    {k:"cultivo", l:"Cultivo", req:1}, {k:"cantidad", l:"Cantidad (kg)", t:"num", req:1},
    {k:"precio", l:"Precio (€/kg)", t:"num", step:"0.001"}, {k:"comprador", l:"Comprador o destino"},
    {k:"albaran", l:"Albarán o lote"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","parcela","cultivo","cantidad","precio",{l:"Importe", f:r=> r.precio&&r.cantidad?eur.format(r.precio*r.cantidad):"", num:1},"comprador","albaran"]},

  animales: {title: "Animales", one: "animal", label: r => r.crotal, help: "Libro de registro de la explotación ganadera.", fields: [
    {k:"crotal", l:"Identificación (crotal o lote)", req:1}, {k:"especie", l:"Especie", t:"sel", o:ESPECIES, req:1},
    {k:"raza", l:"Raza"}, {k:"sexo", l:"Sexo", t:"sel", o:["Hembra","Macho","Castrado"]},
    {k:"nacimiento", l:"Fecha de nacimiento", t:"date"}, {k:"madre", l:"Madre (identificación)"},
    {k:"lote", l:"Lote o grupo"}, {k:"alta", l:"Fecha de alta", t:"date", def:today},
    {k:"origen", l:"Origen", t:"sel", o:["Nacido en la explotación","Compra","Otro"]},
    {k:"estado", l:"Estado", t:"sel", o:["Activo","Baja"], def:"Activo"},
    {k:"baja", l:"Fecha de baja", t:"date"}, {k:"motivo_baja", l:"Motivo de baja", t:"sel", o:["Venta","Muerte","Matadero","Traslado","Otro"]},
    {k:"notas", l:"Notas", t:"area"}],
    cols: ["crotal","especie","raza","sexo","nacimiento",{l:"Edad", f:r=>edad(r.nacimiento)},"lote",{l:"Estado", f:r=>r.estado, pill:r=>r.estado==="Activo"?"ok":""}]},
  movimientos: {title: "Movimientos", one: "movimiento", label: r => `${r.tipo} ${r.num||""}`, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"tipo", l:"Tipo", t:"sel", o:["Entrada","Salida"], req:1},
    {k:"motivo", l:"Motivo", t:"sel", o:["Compra","Venta","Nacimiento","Muerte","Matadero","Traslado a pastos","Otro"]},
    {k:"especie", l:"Especie", t:"sel", o:ESPECIES}, {k:"num", l:"Nº de animales", t:"num", req:1},
    {k:"identificacion", l:"Identificaciones o lote"}, {k:"origen_destino", l:"Origen o destino"},
    {k:"rega", l:"REGA origen o destino"}, {k:"documento", l:"Guía o documento de traslado"},
    {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha",{l:"Tipo", f:r=>r.tipo, pill:r=>r.tipo==="Entrada"?"ok":"warn"},"motivo","especie","num","identificacion","origen_destino","rega","documento"]},
  veterinarios: {title: "Medicamentos veterinarios", one: "tratamiento", label: r => r.medicamento, help: "Registro de tratamientos con medicamentos veterinarios y tiempos de espera.", fields: [
    {k:"fecha", l:"Fecha de inicio", t:"date", req:1, def:today}, {k:"animal", l:"Animal o lote", req:1},
    {k:"especie", l:"Especie", t:"sel", o:ESPECIES}, {k:"diagnostico", l:"Diagnóstico o motivo"},
    {k:"medicamento", l:"Medicamento", req:1}, {k:"receta", l:"Nº de receta"},
    {k:"lote_med", l:"Lote del medicamento"}, {k:"dosis", l:"Dosis y pauta"},
    {k:"via", l:"Vía", t:"sel", o:["Oral","Inyectable","Tópica","Intramamaria","Otra"]}, {k:"duracion", l:"Duración (días)", t:"num", def:1},
    {k:"sup_carne", l:"Tiempo de espera carne (días)", t:"num"}, {k:"sup_leche", l:"Tiempo de espera leche (días)", t:"num"},
    {k:"veterinario", l:"Veterinario"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","animal","especie","diagnostico","medicamento","receta",
      {l:"Espera carne hasta", f:r=>finEspera(r,"sup_carne"), pill:r=>enEspera(r,"sup_carne")?"crit":""},
      {l:"Espera leche hasta", f:r=>finEspera(r,"sup_leche"), pill:r=>enEspera(r,"sup_leche")?"crit":""},"veterinario"]},

  apiarios: {title: "Apiarios", one: "apiario", label: r => r.nombre, fields: [
    {k:"nombre", l:"Nombre", req:1}, {k:"codigo", l:"Código de asentamiento o REGA"},
    {k:"municipio", l:"Municipio"}, {k:"poligono", l:"Polígono", t:"num"}, {k:"parcela", l:"Parcela", t:"num"},
    {k:"coordenadas", l:"Coordenadas", help:"Latitud, longitud"}, {k:"flora", l:"Flora principal"},
    {k:"notas", l:"Notas", t:"area"}],
    cols: ["nombre","codigo","municipio",{l:"Pol/Par", f:r=>[r.poligono,r.parcela].filter(Boolean).join("/")},"flora",
      {l:"Colmenas activas", f:r=>DB.colmenas.filter(c=>c.apiario===r.id&&c.estado!=="Muerta"&&c.estado!=="Vendida").length, num:1},
      {l:"Última revisión", f:r=>{const d=ultimaRevision(r.id);return d?fdate(d):"Nunca";}, pill:r=>{const d=ultimaRevision(r.id);return !d||daysBetween(d,today())>21?"warn":"ok";}}]},
  colmenas: {title: "Colmenas", one: "colmena", label: r => r.codigo, fields: [
    {k:"codigo", l:"Código o número", req:1}, {k:"apiario", l:"Apiario", t:"ref", ref:"apiarios", req:1},
    {k:"modelo", l:"Modelo", t:"sel", o:["Layens","Langstroth","Dadant","Perfección","Otro"]}, {k:"alta", l:"Fecha de alta", t:"date", def:today},
    {k:"reina_ano", l:"Año de la reina", t:"num"}, {k:"origen", l:"Origen", t:"sel", o:["Enjambre","División","Compra","Captura"]},
    {k:"estado", l:"Estado", t:"sel", o:["Activa","Débil","Huérfana","Muerta","Vendida"], def:"Activa"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["codigo","apiario","modelo","alta","reina_ano","origen",{l:"Estado", f:r=>r.estado, pill:r=>({Activa:"ok",Débil:"warn",Huérfana:"crit",Muerta:"crit"})[r.estado]||""}]},
  revisiones: {title: "Revisiones", one: "revisión", label: r => `Revisión ${fdate(r.fecha)}`, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"apiario", l:"Apiario", t:"ref", ref:"apiarios", req:1},
    {k:"colmena", l:"Colmena (opcional)", t:"ref", ref:"colmenas", help:"Déjalo vacío si la revisión es de todo el apiario"},
    {k:"fuerza", l:"Fuerza (1 a 5)", t:"sel", o:["1","2","3","4","5"]},
    {k:"cria", l:"Cría", t:"sel", o:["Compacta","Salteada","Sin cría"]}, {k:"reina", l:"Reina", t:"sel", o:["Vista","Huevos frescos","No vista"]},
    {k:"reservas", l:"Reservas", t:"sel", o:["Abundantes","Suficientes","Escasas"]}, {k:"varroa", l:"Varroa (% o ácaros/día)", t:"num"},
    {k:"sintomas", l:"Síntomas o incidencias"}, {k:"acciones", l:"Acciones realizadas"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","apiario","colmena","fuerza","cria","reina","reservas","varroa",{l:"Incidencias", f:r=>r.sintomas, wrap:1}]},
  apitratamientos: {title: "Tratamientos", one: "tratamiento", label: r => r.producto, help: "Registro de tratamientos del libro de explotación apícola.", fields: [
    {k:"fecha", l:"Fecha de aplicación", t:"date", req:1, def:today}, {k:"apiario", l:"Apiario", t:"ref", ref:"apiarios", req:1},
    {k:"colmenas", l:"Nº de colmenas tratadas", t:"num"}, {k:"enfermedad", l:"Enfermedad", t:"sel", o:["Varroosis","Nosemosis","Loque americana","Loque europea","Otra"], def:"Varroosis"},
    {k:"producto", l:"Medicamento", req:1}, {k:"registro", l:"Nº de registro"},
    {k:"lote", l:"Lote"}, {k:"dosis", l:"Dosis (tiras o ml por colmena)"},
    {k:"retirada", l:"Fecha prevista de retirada", t:"date"}, {k:"retirado", l:"Tiras retiradas", t:"chk"},
    {k:"receta", l:"Receta o veterinario"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","apiario","enfermedad","producto","registro","colmenas","dosis","retirada",
      {l:"Estado", f:r=> r.retirado?"Retirado": (r.retirada? (r.retirada<today()?"Retirada atrasada":"Pendiente de retirar"):""), pill:r=> r.retirado?"ok":(r.retirada&&r.retirada<today()?"crit":(r.retirada?"warn":""))}]},
  alimentacion: {title: "Alimentación", one: "registro", label: r => r.tipo, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"apiario", l:"Apiario", t:"ref", ref:"apiarios", req:1},
    {k:"tipo", l:"Tipo", t:"sel", o:["Jarabe","Candy o fondant","Sustituto de polen","Otro"], req:1},
    {k:"cantidad", l:"Cantidad total (kg)", t:"num"}, {k:"colmenas", l:"Nº de colmenas", t:"num"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","apiario","tipo","cantidad","colmenas"]},
  producciones: {title: "Cosechas", one: "cosecha", label: r => r.producto, fields: [
    {k:"fecha", l:"Fecha de extracción", t:"date", req:1, def:today}, {k:"apiario", l:"Apiario", t:"ref", ref:"apiarios", req:1},
    {k:"producto", l:"Producto", t:"sel", o:["Miel","Polen","Cera","Propóleo","Jalea real"], def:"Miel", req:1},
    {k:"kg", l:"Cantidad (kg)", t:"num", req:1}, {k:"colmenas", l:"Nº de colmenas", t:"num"},
    {k:"tipo_miel", l:"Tipo (milflores, romero...)"}, {k:"precio", l:"Precio de venta (€/kg)", t:"num", step:"0.01"}, {k:"lote", l:"Lote"}, {k:"destino", l:"Destino"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","apiario","producto","tipo_miel","kg",{l:"kg/colmena", f:r=>r.colmenas?fnum(r.kg/r.colmenas):"", num:1},"lote","destino"]},
  trashumancia: {title: "Trashumancia", one: "traslado", label: r => `Traslado ${fdate(r.fecha)}`, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today},
    {k:"origen", l:"Apiario de origen", t:"ref", ref:"apiarios", req:1}, {k:"destino", l:"Apiario de destino", t:"ref", ref:"apiarios", req:1},
    {k:"colmenas", l:"Nº de colmenas", t:"num", req:1}, {k:"documento", l:"Documento de movimiento"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha","origen","destino","colmenas","documento"]},

  economia: {title: "Gastos e ingresos", one: "apunte", label: r => r.concepto, fields: [
    {k:"fecha", l:"Fecha", t:"date", req:1, def:today}, {k:"tipo", l:"Tipo", t:"sel", o:["Gasto","Ingreso"], req:1, def:"Gasto"},
    {k:"modulo", l:"Actividad", t:"sel", o:["General","Agrícola","Ganadero","Apícola"], def:"General"},
    {k:"categoria", l:"Categoría", t:"sel", o:["Semillas y plantas","Fitosanitarios","Abonos","Piensos","Veterinario","Combustible","Maquinaria","Mano de obra","Seguros","Ventas","Subvenciones (PAC)","Otros"]},
    {k:"concepto", l:"Concepto", req:1}, {k:"importe", l:"Importe (€)", t:"num", req:1, step:"0.01"},
    {k:"parcela", l:"Asignar a parcela", t:"ref", ref:"parcelas", help:"Opcional, para calcular la rentabilidad"}, {k:"lote", l:"Asignar a lote de ganado", help:"Mismo nombre de lote que en Animales"},
    {k:"apiario", l:"Asignar a apiario", t:"ref", ref:"apiarios"}, {k:"notas", l:"Notas", t:"area"}],
    cols: ["fecha",{l:"Tipo", f:r=>r.tipo, pill:r=>r.tipo==="Ingreso"?"ok":"warn"},"modulo","categoria",{l:"Concepto", f:r=>r.concepto, wrap:1},
      {l:"Importe", f:r=>eur.format((r.tipo==="Gasto"?-1:1)*(r.importe||0)), num:1}]},
};
function edad(n){ if(!n) return ""; const m = Math.floor(daysBetween(n,today())/30.44); return m<24? `${m} meses` : `${Math.floor(m/12)} años`; }
function finEspera(r,k){ if(r[k]===""||r[k]==null) return ""; return fdate(addDays(r.fecha, Number(r.duracion||1)-1 + Number(r[k]))); }
function enEspera(r,k){ if(r[k]===""||r[k]==null) return false; return addDays(r.fecha, Number(r.duracion||1)-1 + Number(r[k])) >= today(); }
function ultimaRevision(apId){ return DB.revisiones.filter(v=>v.apiario===apId).map(v=>v.fecha).sort().pop(); }

/* ============ Almacenamiento (IndexedDB con respaldo) ============ */
let DB = {};
const STORE_KEY = "mi-explotacion-v1";
function blank(){ const d = {_meta:{titular:{}, version:2, del:{}}}; for (const t in S) d[t] = []; return d; }
let _idb = null;
function idb(){ if (_idb) return _idb; _idb = new Promise((res, rej) => { try { const rq = indexedDB.open("mi-explotacion", 2); rq.onupgradeneeded = () => { const db = rq.result; for (const s of ["kv","files","snaps"]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); } catch(e){ rej(e); } }); _idb.catch(()=>{ _idb = null; }); return _idb; }
async function idbGet(store, key){ const db = await idb(); return new Promise((res, rej) => { const rq = db.transaction(store).objectStore(store).get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
async function idbPut(store, key, val){ const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbDel(store, key){ const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbKeys(store){ const db = await idb(); return new Promise((res, rej) => { const rq = db.transaction(store).objectStore(store).getAllKeys(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
const now = () => Date.now();
function tomb(id){ DB._meta.del = DB._meta.del || {}; DB._meta.del[id] = now(); }
async function load(){
  let data = null;
  try { const db = await idb(); data = await new Promise((res, rej) => { const rq = db.transaction("kv").objectStore("kv").get(STORE_KEY); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); } catch(e) {}
  if (!data) { try { const s = localStorage.getItem(STORE_KEY); if (s) data = JSON.parse(s); } catch(e) {} }
  return data;
}
let saveFailed = false;
async function save(){
  const snapshot = JSON.parse(JSON.stringify(DB));
  let ok = false;
  try { await idbPut("kv", STORE_KEY, snapshot); ok = true; } catch(e) {}
  if (!ok) try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot)); ok = true; } catch(e) {}
  if (!ok && !saveFailed) toast("No se pudo guardar en este navegador. Exporta una copia de seguridad.");
  saveFailed = !ok;
  for (const f of AFTER_SAVE) try { f(); } catch(e) { console.warn(e); }
}
function normalize(d){ const b = blank(); for (const t in b) if (Array.isArray(d?.[t])) b[t] = d[t]; if (d?._meta) b._meta = {...b._meta, ...d._meta, titular:{...(d._meta.titular||{})}, del:{...(d._meta.del||{})}}; return b; }

/* ============ Datos de ejemplo ============ */
function seed(){
  const d = blank(), D = n => addDays(today(), n), y = new Date().getFullYear();
  const add = (t, r) => { const x = {id: uid(), _demo: true, ...r}; d[t].push(x); return x.id; };
  const p1 = add("parcelas", {nombre:"La Hoya", municipio:"Villanueva", provincia:"Ejemplo", poligono:4, parcela:112, recinto:1, superficie:6.35, uso:"TA · Tierra arable", riego:"Secano"});
  const p2 = add("parcelas", {nombre:"Olivar del Camino", municipio:"Villanueva", provincia:"Ejemplo", poligono:7, parcela:38, recinto:2, superficie:3.1, uso:"OV · Olivar", riego:"Secano"});
  const p3 = add("parcelas", {nombre:"Prado del Arroyo", municipio:"Villanueva", provincia:"Ejemplo", poligono:4, parcela:120, recinto:1, superficie:8.8, uso:"PS · Pastizal", riego:"Secano"});
  add("cultivos", {campana:y, parcela:p1, cultivo:"Cebada", variedad:"Planet", siembra:D(-30), superficie:6.35, estado:"En curso"});
  add("cultivos", {campana:y, parcela:p2, cultivo:"Olivo", variedad:"Picual", superficie:3.1, estado:"En curso"});
  add("labores", {fecha:D(-35), parcela:p1, tipo:"Laboreo", maquinaria:"Tractor y chísel", horas:5, coste:180, descripcion:"Pase de chísel antes de siembra"});
  add("labores", {fecha:D(-30), parcela:p1, tipo:"Siembra", maquinaria:"Sembradora 3 m", horas:4, coste:150, descripcion:"180 kg/ha de semilla certificada"});
  add("abonados", {fecha:D(-31), parcela:p1, producto:"Complejo 8-15-15", tipo:"Mineral", riqueza:"8-15-15", cantidad:250, superficie:6.35});
  add("fitosanitarios", {fecha:D(-6), parcela:p2, cultivo:"Olivo", problema:"Repilo", producto:"Oxicloruro de cobre 50 WP", registro:"ES-00000", materia:"Oxicloruro de cobre 50%", dosis:3, unidad:"kg/ha", sup_tratada:3.1, plazo:15, aplicador:"Titular (carné básico)", equipo:"ROMA-EJEMPLO", eficacia:"Buena"});
  add("cosechas", {fecha:D(-140), parcela:p1, cultivo:"Trigo", cantidad:21500, precio:0.235, comprador:"Cooperativa local", albaran:"A-2231"});
  add("animales", {crotal:"ES000000000001", especie:"Ovino", raza:"Manchega", sexo:"Hembra", nacimiento:D(-1100), lote:"Lote A", alta:D(-1100), origen:"Nacido en la explotación", estado:"Activo"});
  add("animales", {crotal:"ES000000000002", especie:"Ovino", raza:"Manchega", sexo:"Hembra", nacimiento:D(-800), lote:"Lote A", alta:D(-800), origen:"Nacido en la explotación", estado:"Activo"});
  add("animales", {crotal:"ES000000000003", especie:"Ovino", raza:"Manchega", sexo:"Macho", nacimiento:D(-600), lote:"Sementales", alta:D(-500), origen:"Compra", estado:"Activo"});
  add("animales", {crotal:"ES000000000010", especie:"Caprino", raza:"Murciano-granadina", sexo:"Hembra", nacimiento:D(-700), lote:"Cabras", alta:D(-650), origen:"Compra", estado:"Activo"});
  add("animales", {crotal:"ES000000000004", especie:"Ovino", raza:"Manchega", sexo:"Macho", nacimiento:D(-120), lote:"Corderos", alta:D(-120), origen:"Nacido en la explotación", estado:"Baja", baja:D(-20), motivo_baja:"Venta"});
  add("movimientos", {fecha:D(-20), tipo:"Salida", motivo:"Venta", especie:"Ovino", num:1, identificacion:"ES000000000004", origen_destino:"Tratante", rega:"ES000000000000", documento:"Guía 0001"});
  add("veterinarios", {fecha:D(-3), animal:"Lote A", especie:"Ovino", diagnostico:"Desparasitación interna", medicamento:"Antiparasitario (ejemplo)", receta:"R-0001", dosis:"1 ml/10 kg", via:"Oral", duracion:1, sup_carne:28, sup_leche:7, veterinario:"Veterinario ADS"});
  const a1 = add("apiarios", {nombre:"Los Romerales", codigo:"ES-API-EJEMPLO-1", municipio:"Villanueva", poligono:9, parcela:15, coordenadas:"39.123, -3.456", flora:"Romero y tomillo"});
  const a2 = add("apiarios", {nombre:"Encinar Alto", codigo:"ES-API-EJEMPLO-2", municipio:"Villanueva", poligono:11, parcela:3, flora:"Encina y jara"});
  const cs = [];
  for (let i=1;i<=6;i++) cs.push(add("colmenas", {codigo:`C-${String(i).padStart(2,"0")}`, apiario: i<=4?a1:a2, modelo:"Layens", alta:D(-900+i*20), reina_ano:y-(i%3), origen:i%2?"Enjambre":"División", estado: i===5?"Débil":"Activa"}));
  add("revisiones", {fecha:D(-9), apiario:a1, fuerza:"4", cria:"Compacta", reina:"Huevos frescos", reservas:"Suficientes", varroa:1.5, sintomas:"Sin incidencias"});
  add("revisiones", {fecha:D(-33), apiario:a2, colmena:cs[4], fuerza:"2", cria:"Salteada", reina:"No vista", reservas:"Escasas", varroa:3, sintomas:"Colmena débil, posible orfandad", acciones:"Se le da un cuadro de cría"});
  add("apitratamientos", {fecha:D(-40), apiario:a1, colmenas:4, enfermedad:"Varroosis", producto:"Tiras de amitraz (ejemplo)", registro:"0000 ESP", lote:"L-123", dosis:"2 tiras/colmena", retirada:D(2), receta:"Veterinario ADS"});
  add("alimentacion", {fecha:D(-15), apiario:a2, tipo:"Candy o fondant", cantidad:6, colmenas:2});
  add("producciones", {fecha:D(-110), apiario:a1, producto:"Miel", kg:68, colmenas:4, tipo_miel:"Romero", lote:`M-${y}-01`, destino:"Venta directa", precio:7.5});
  add("economia", {fecha:D(-30), tipo:"Gasto", modulo:"Agrícola", categoria:"Semillas y plantas", concepto:"Semilla de cebada certificada", importe:640, parcela:p1});
  add("economia", {fecha:D(-6), tipo:"Gasto", modulo:"Agrícola", categoria:"Fitosanitarios", concepto:"Cobre para olivar", importe:85.5, parcela:p2});
  add("economia", {fecha:D(-20), tipo:"Ingreso", modulo:"Ganadero", categoria:"Ventas", concepto:"Venta de cordero", importe:120, lote:"Corderos"});
  add("economia", {fecha:D(-110), tipo:"Ingreso", modulo:"Apícola", categoria:"Ventas", concepto:"Venta de miel de romero", importe:510, apiario:a1});
  add("economia", {fecha:D(-15), tipo:"Gasto", modulo:"Apícola", categoria:"Piensos", concepto:"Candy para invernada", importe:24, apiario:a2});
  d._meta.titular = {nombre:"", nif:"", rega_gan:"", rega_api:"", ccaa:""};
  const ids = {p1, p2, p3, a1, a2, cs};
  for (const f of SEEDS) try { f(d, add, D, ids); } catch(e) { console.warn(e); }
  return d;
}
const hasDemo = () => Object.keys(S).some(t => DB[t].some(r => r._demo));

/* ============ Estado de navegación ============ */
const UI = {mod: "inicio", tab: {agri:"parcelas", gan:"animales", api:"apiarios", eco:"economia"}, q: "", year: "todos"};
try { const s = JSON.parse(localStorage.getItem("mi-explotacion-ui") || "null"); if (s) Object.assign(UI, s, {q:""}); } catch(e) {}
const saveUI = () => { try { localStorage.setItem("mi-explotacion-ui", JSON.stringify({mod:UI.mod, tab:UI.tab, year:UI.year})); } catch(e) {} };
function go(mod, tab){ UI.mod = mod; if (tab) UI.tab[mod] = tab; UI.q = ""; saveUI(); render(); window.scrollTo(0,0); }

/* ============ Render ============ */
const ICONS = {
  inicio:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  agri:'<path d="M12 21V9M12 13c-4 0-6-3-6-7 4 0 6 3 6 7zM12 11c0-4 2-7 6-7 0 4-2 7-6 7z"/>',
  gan:'<path d="M5 9c-1.5 0-2-1.5-2-3 1.5 0 3 .5 3 2M19 9c1.5 0 2-1.5 2-3-1.5 0-3 .5-3 2M6 8c0 6 2 12 6 12s6-6 6-12c0-1-1-2-3-2H9C7 6 6 7 6 8zM10 16h4"/>',
  api:'<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z M12 8l3.5 2v4L12 16l-3.5-2v-4z"/>',
  eco:'<path d="M4 19h16M7 16V10M12 16V6M17 16v-4"/>',
  alm:'<path d="M3 9l9-5 9 5v11H3zM7 20v-7h10v7M7 16h10"/>',
  agenda:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  guiado:'<path d="M12 2l7 19-7-4-7 4z"/>',
  informes:'<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8"/>',
  ajustes:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
};
const icon = (k, s=20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

function renderNav(){
  $("#nav").innerHTML = `<div class="brand">${icon("agri",24)} Mi Explotación</div>` +
    Object.entries(MODS).map(([k, m]) => `<button class="nav-btn" data-go="${k}" style="--mc:${m.color}" ${UI.mod===k?'aria-current="page"':""}>${icon(k)}<span>${m.name}</span></button>`).join("");
}

function render(){
  renderNav();
  const v = $("#view");
  v.style.setProperty("--mc", MODS[UI.mod].color);
  if (UI.mod === "inicio") v.innerHTML = viewInicio();
  else if (UI.mod === "ajustes") v.innerHTML = viewAjustes();
  else v.innerHTML = viewModulo(UI.mod);
  const ct = MODS[UI.mod].tables && UI.tab[UI.mod];
  if (ct && TABS[ct]?.mount) try { TABS[ct].mount(); } catch(e) { console.warn(e); }
  const q = $("#q"); if (q && UI._focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); UI._focusQ = false; }
}

function demoBanner(){
  return hasDemo() ? `<div class="banner"><span><strong>Estás viendo datos de ejemplo.</strong> Bórralos cuando quieras empezar con los tuyos.</span><button class="btn" data-act="clear-demo">Borrar datos de ejemplo</button></div>` : "";
}

/* ---- Inicio ---- */
function alertas(){
  const A = [], hoy = today();
  for (const r of DB.fitosanitarios) if (r.plazo) { const fin = addDays(r.fecha, r.plazo); if (fin >= hoy) A.push({lv:"warn", t:`No cosechar en ${refName("parcelas", r.parcela)}`, s:`Plazo de seguridad de ${r.producto}`, d:fin, mod:"agri", tab:"fitosanitarios"}); }
  for (const r of DB.veterinarios) for (const [k, n] of [["sup_carne","carne"],["sup_leche","leche"]]) if (enEspera(r,k)) A.push({lv:"crit", t:`${r.animal}: tiempo de espera de ${n}`, s:`${r.medicamento}. No destinar ${n} a consumo.`, d:addDays(r.fecha, Number(r.duracion||1)-1+Number(r[k])), mod:"gan", tab:"veterinarios"});
  for (const r of DB.apitratamientos) if (r.retirada && !r.retirado) A.push({lv: r.retirada < hoy ? "crit" : (daysBetween(hoy, r.retirada) <= 7 ? "warn" : ""), t:`Retirar ${r.producto}`, s:`${refName("apiarios", r.apiario)}${r.retirada<hoy?" · fecha pasada":""}`, d:r.retirada, mod:"api", tab:"apitratamientos"});
  for (const a of DB.apiarios) { const u = ultimaRevision(a.id); if (!u || daysBetween(u, hoy) > 21) A.push({lv:"warn", t:`Revisar el apiario ${a.nombre}`, s: u ? `Última revisión hace ${daysBetween(u,hoy)} días` : "Sin revisiones registradas", d:"", mod:"api", tab:"revisiones"}); }
  for (const c of DB.colmenas) if (c.estado === "Huérfana") A.push({lv:"crit", t:`Colmena ${c.codigo} huérfana`, s:refName("apiarios", c.apiario), d:"", mod:"api", tab:"colmenas"});
  for (const f of ALERTS) try { A.push(...f()); } catch(e) { console.warn(e); }
  const ord = {crit:0, warn:1, "":2};
  return A.sort((a,b) => ord[a.lv]-ord[b.lv] || (a.d||"9").localeCompare(b.d||"9"));
}
function viewInicio(){
  const y = String(new Date().getFullYear());
  const ha = DB.parcelas.reduce((s,p)=>s+Number(p.superficie||0),0);
  const activos = DB.animales.filter(a=>a.estado!=="Baja");
  const porEsp = ESPECIES.map(e=>[e, activos.filter(a=>a.especie===e).length]).filter(x=>x[1]);
  const colm = DB.colmenas.filter(c=>c.estado!=="Muerta"&&c.estado!=="Vendida").length;
  const eco = DB.economia.filter(r=>(r.fecha||"").startsWith(y));
  const ing = eco.filter(r=>r.tipo==="Ingreso").reduce((s,r)=>s+Number(r.importe||0),0);
  const gas = eco.filter(r=>r.tipo==="Gasto").reduce((s,r)=>s+Number(r.importe||0),0);
  const miel = DB.producciones.filter(r=>r.producto==="Miel"&&(r.fecha||"").startsWith(y)).reduce((s,r)=>s+Number(r.kg||0),0);
  const A = alertas();
  const t = DB._meta.titular||{};
  const recientes = [];
  for (const tb in S) for (const r of DB[tb]) if (r.fecha) recientes.push({tb, r});
  recientes.sort((a,b)=>b.r.fecha.localeCompare(a.r.fecha));
  const modOf = tb => Object.keys(MODS).find(m => MODS[m].tables?.includes(tb)) || "inicio";
  return `${demoBanner()}
  <div class="head"><div><div class="eyebrow">${new Date().toLocaleDateString("es-ES",{weekday:"long", day:"numeric", month:"long", year:"numeric"})}</div>
    <h1>${esc(t.nombre ? t.nombre : "Mi Explotación")}</h1>
    <p>${[t.rega_gan&&`REGA ganadero ${esc(t.rega_gan)}`, t.rega_api&&`REGA apícola ${esc(t.rega_api)}`].filter(Boolean).join(" · ") || `<button class="btn" data-go="ajustes">Añadir datos del titular y códigos REGA</button>`}</p></div></div>
  <div class="stats">
    <button class="stat" data-go="agri" style="--mc:var(--agri);text-align:left;cursor:pointer"><span class="k">Superficie</span><span class="v">${fnum(ha)} ha</span><span class="s">${DB.parcelas.length} parcelas · ${DB.cultivos.filter(c=>c.estado==="En curso").length} cultivos en curso</span></button>
    <button class="stat" data-go="gan" style="--mc:var(--gan);text-align:left;cursor:pointer"><span class="k">Censo</span><span class="v">${activos.length}</span><span class="s">${porEsp.map(([e,n])=>`${n} ${e.toLowerCase()}`).join(" · ") || "Sin animales"}</span></button>
    <button class="stat" data-go="api" style="--mc:var(--api);text-align:left;cursor:pointer"><span class="k">Colmenas</span><span class="v">${colm}</span><span class="s">${DB.apiarios.length} apiarios · ${fnum(miel)} kg de miel en ${y}</span></button>
    <button class="stat" data-go="eco" style="--mc:var(--eco);text-align:left;cursor:pointer"><span class="k">Balance ${y}</span><span class="v">${eur.format(ing-gas)}</span><span class="s">${eur.format(ing)} ingresos · ${eur.format(gas)} gastos</span></button>
  </div>
  <div class="grid2">
    <section class="panel"><h2>Avisos</h2>
      ${A.length ? `<ul class="alerts">${A.map(a=>`<li class="${a.lv}" data-go="${a.mod}" data-tab="${a.tab}" style="cursor:pointer"><div><strong>${esc(a.t)}</strong><small>${esc(a.s)}</small></div>${a.d?`<span class="when">hasta ${fdate(a.d)}</span>`:""}</li>`).join("")}</ul>` : `<p class="muted">No hay avisos pendientes.</p>`}
    </section>
    <section class="panel"><h2>Registrar rápido</h2>
      <div class="toolbar">
        ${[["partes","Parte de trabajo"],["fitosanitarios","Tratamiento fitosanitario"],["labores","Labor"],["veterinarios","Medicamento veterinario"],["movimientos","Movimiento de ganado"],["revisiones","Revisión de colmenas"],["apitratamientos","Tratamiento apícola"],["producciones","Cosecha de miel"],["economia","Gasto o ingreso"]].map(([tb,l])=>`<button class="btn" data-new="${tb}">+ ${l}</button>`).join("")}
      </div>
      <h3 style="margin-top:6px">Última actividad</h3>
      ${recientes.length ? `<ul class="alerts">${recientes.slice(0,6).map(({tb,r})=>`<li data-edit="${tb}" data-id="${r.id}" style="cursor:pointer;border-left-color:${MODS[modOf(tb)].color}"><div><strong>${esc(S[tb].title)}</strong><small>${esc(S[tb].label(r))}${r.parcela&&tb!=="parcelas"?" · "+esc(refName("parcelas",r.parcela)):""}${r.apiario?" · "+esc(refName("apiarios",r.apiario)):""}</small></div><span class="when">${fdate(r.fecha)}</span></li>`).join("")}</ul>` : `<p class="muted">Aún no hay registros.</p>`}
    </section>
  </div>`;
}

/* ---- Módulos ---- */
function cellVal(t, c, r){
  if (typeof c === "object") return c.f(r);
  const f = S[t].fields.find(x=>x.k===c);
  const v = r[c];
  if (!f) return v;
  if (f.t === "date") return fdate(v);
  if (f.t === "ref") return refName(f.ref, v);
  if (f.t === "num") return fnum(v);
  if (f.t === "chk") return v ? "Sí" : "No";
  return v;
}
function colLabel(t, c){ return typeof c === "object" ? c.l : (S[t].fields.find(x=>x.k===c)?.l || c).replace(/\s*\(.*\)$/,"") + (/(ha)\)$/.test(S[t].fields.find(x=>x.k===c)?.l||"") ? " (ha)" : ""); }
function filtered(t){
  const q = UI.q.trim().toLowerCase();
  const hasDate = S[t].fields.some(f=>f.k==="fecha");
  let rows = DB[t].slice();
  if (hasDate && UI.year !== "todos") rows = rows.filter(r => (r.fecha||"").startsWith(UI.year));
  if (t === "cultivos" && UI.year !== "todos") rows = rows.filter(r => String(r.campana) === UI.year);
  if (q) rows = rows.filter(r => S[t].cols.some(c => String(cellVal(t,c,r) ?? "").toLowerCase().includes(q)));
  if (hasDate) rows.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  return rows;
}
function years(){ const s = new Set([String(new Date().getFullYear())]); for (const t in S) for (const r of DB[t]) { if (r.fecha) s.add(r.fecha.slice(0,4)); if (r.campana) s.add(String(r.campana)); } return [...s].sort().reverse(); }

function resumen(mod){
  if (mod === "agri"){
    const usos = {}; for (const p of DB.parcelas) { const u = (p.uso||"Sin uso").split(" · ").pop(); usos[u] = (usos[u]||0) + Number(p.superficie||0); }
    const tot = Object.values(usos).reduce((a,b)=>a+b,0) || 1;
    return Object.keys(usos).length ? `<section class="panel"><h3>Superficie por uso</h3>${Object.entries(usos).sort((a,b)=>b[1]-a[1]).map(([u,h])=>`<div class="bar"><span class="lbl">${esc(u)}</span><span class="track"><span class="fill" style="width:${h/tot*100}%;display:block"></span></span><span class="n">${fnum(h)} ha</span></div>`).join("")}</section>` : "";
  }
  if (mod === "gan"){
    const act = DB.animales.filter(a=>a.estado!=="Baja");
    if (!act.length) return "";
    const rows = ESPECIES.map(e => { const g = act.filter(a=>a.especie===e); return g.length ? `<tr><td>${e}</td><td class="num">${g.filter(a=>a.sexo==="Hembra").length}</td><td class="num">${g.filter(a=>a.sexo!=="Hembra").length}</td><td class="num">${g.filter(a=>a.nacimiento&&daysBetween(a.nacimiento,today())<365).length}</td><td class="num"><strong>${g.length}</strong></td></tr>` : ""; }).join("");
    return `<section class="panel"><h3>Censo actual</h3><div class="table-wrap"><table><thead><tr><th>Especie</th><th>Hembras</th><th>Machos</th><th>Menores de 1 año</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  if (mod === "api"){
    if (!DB.apiarios.length) return "";
    const max = Math.max(1, ...DB.apiarios.map(a=>DB.colmenas.filter(c=>c.apiario===a.id&&c.estado!=="Muerta"&&c.estado!=="Vendida").length));
    return `<section class="panel"><h3>Colmenas activas por apiario</h3>${DB.apiarios.map(a=>{const n=DB.colmenas.filter(c=>c.apiario===a.id&&c.estado!=="Muerta"&&c.estado!=="Vendida").length;return `<div class="bar"><span class="lbl">${esc(a.nombre)}</span><span class="track"><span class="fill" style="width:${n/max*100}%;display:block"></span></span><span class="n">${n}</span></div>`;}).join("")}</section>`;
  }
  if (mod === "eco"){
    const rows = filtered("economia");
    const by = {}; for (const r of rows) { const m = r.modulo||"General"; by[m] = by[m] || {i:0,g:0}; by[m][r.tipo==="Ingreso"?"i":"g"] += Number(r.importe||0); }
    const ent = Object.entries(by); if (!ent.length) return "";
    const T = ent.reduce((a,[,v])=>({i:a.i+v.i, g:a.g+v.g}),{i:0,g:0});
    return `<section class="panel"><h3>Resumen ${UI.year==="todos"?"total":UI.year}</h3><div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Ingresos</th><th>Gastos</th><th>Resultado</th></tr></thead><tbody>${ent.map(([m,v])=>`<tr><td>${esc(m)}</td><td class="num">${eur.format(v.i)}</td><td class="num">${eur.format(v.g)}</td><td class="num">${eur.format(v.i-v.g)}</td></tr>`).join("")}<tr><td><strong>Total</strong></td><td class="num"><strong>${eur.format(T.i)}</strong></td><td class="num"><strong>${eur.format(T.g)}</strong></td><td class="num"><strong>${eur.format(T.i-T.g)}</strong></td></tr></tbody></table></div></section>`;
  }
  return "";
}

function viewModulo(mod){
  const m = MODS[mod], t = UI.tab[mod] && m.tables.includes(UI.tab[mod]) ? UI.tab[mod] : m.tables[0];
  UI.tab[mod] = t;
  const tabsBar = m.tables.length > 1 ? `<div class="tabs" role="tablist">${m.tables.map(x=>`<button class="tab" role="tab" data-go="${mod}" data-tab="${x}" aria-selected="${x===t}">${isTable(x)?S[x].title:TABS[x].title}${isTable(x)?` <span class="muted">${DB[x].length}</span>`:""}</button>`).join("")}</div>` : "";
  if (!isTable(t)) return `${demoBanner()}<div class="head"><div><div class="eyebrow">${m.name}</div><h1>${m.desc}</h1></div></div>${tabsBar}${TABS[t].render(mod)}`;
  const sch = S[t], rows = filtered(t);
  const hasDate = sch.fields.some(f=>f.k==="fecha") || t === "cultivos";
  return `${demoBanner()}
  <div class="head"><div><div class="eyebrow">${m.name}</div><h1>${m.desc}</h1></div></div>
  ${tabsBar}
  ${t === m.tables[0] || mod === "eco" ? resumen(mod) : ""}
  <div class="head"><div><h2>${sch.title}</h2>${sch.help?`<p>${sch.help}</p>`:""}</div></div>
  <div class="toolbar">
    <input class="grow" type="search" id="q" placeholder="Buscar en ${sch.title.toLowerCase()}" value="${esc(UI.q)}" aria-label="Buscar">
    ${hasDate ? `<select id="year" aria-label="Año" style="width:auto">${["todos",...years()].map(y=>`<option value="${y}" ${UI.year===y?"selected":""}>${y==="todos"?"Todos los años":(t==="cultivos"?"Campaña ":"")+y}</option>`).join("")}</select>` : ""}
    <button class="btn" data-act="csv" data-t="${t}" title="Descargar en formato CSV para Excel">Exportar CSV</button>
    <button class="btn primary" data-new="${t}">+ Añadir ${sch.one}</button>
  </div>
  <div class="table-wrap">${rows.length ? `<table><thead><tr>${sch.cols.map(c=>`<th>${esc(colLabel(t,c))}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr data-edit="${t}" data-id="${r.id}" tabindex="0">${sch.cols.map(c=>{
      const v = cellVal(t,c,r), f = typeof c==="string"?sch.fields.find(x=>x.k===c):null;
      const isNum = (f&&f.t==="num") || (typeof c==="object"&&c.num);
      const pl = typeof c==="object"&&c.pill ? c.pill(r) : null;
      const wrap = typeof c==="object"&&c.wrap;
      return `<td class="${isNum?"num":""} ${wrap?"wrap-cell":""}">${pl!=null&&v!==""&&v!=null ? `<span class="pill ${pl}">${esc(v)}</span>` : esc(v)}</td>`;}).join("")}</tr>`).join("")}</tbody></table>`
    : `<div class="empty">${DB[t].length ? "Ningún registro coincide con la búsqueda." : `Aún no hay ${sch.title.toLowerCase()}. <br><br><button class="btn primary" data-new="${t}">+ Añadir ${sch.one}</button>`}</div>`}</div>
  <p class="muted" style="font-size:.85rem">${rows.length} registro${rows.length===1?"":"s"}. Toca una fila para verla o editarla.</p>`;
}

/* ---- Formulario ---- */
function openForm(t, id){
  const sch = S[t], r = id ? DB[t].find(x=>x.id===id) : null;
  if (id && !r) return;
  const val = f => { if (r) return r[f.k] ?? ""; if (f.def!=null) return typeof f.def === "function" ? f.def() : f.def; return ""; };
  const missingRef = sch.fields.find(f => f.t==="ref" && f.req && !DB[f.ref].length);
  const dlg = $("#dlg");
  dlg.innerHTML = `<form class="dlg" id="frm" novalidate>
    <header><h2>${r ? "Editar" : "Nuevo"}: ${esc(sch.one)}</h2><button type="button" class="x" data-act="close" aria-label="Cerrar">×</button></header>
    <div class="body">
      ${missingRef ? `<p class="fld full" style="color:var(--warn)">Antes necesitas dar de alta al menos un registro en ${esc(S[missingRef.ref].title)}.</p>` : ""}
      ${sch.fields.filter(f=>!f.hide).map(f => {
        const v = val(f), idf = `f_${f.k}`, req = f.req ? " *" : "";
        let inp;
        if (f.t === "sel") inp = `<select id="${idf}" name="${f.k}"><option value=""></option>${f.o.map(o=>`<option ${String(v)===o?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
        else if (f.t === "ref") inp = `<select id="${idf}" name="${f.k}"><option value=""></option>${DB[f.ref].map(o=>`<option value="${o.id}" ${v===o.id?"selected":""}>${esc(S[f.ref].label(o))}</option>`).join("")}</select>`;
        else if (f.t === "area") inp = `<textarea id="${idf}" name="${f.k}">${esc(v)}</textarea>`;
        else if (f.t === "chk") return `<div class="fld chk"><input type="checkbox" id="${idf}" name="${f.k}" ${v?"checked":""}><label for="${idf}">${esc(f.l)}</label></div>`;
        else inp = `<input id="${idf}" name="${f.k}" type="${f.t==="num"?"number":f.t==="date"?"date":f.t==="time"?"time":"text"}" ${f.t==="num"?`step="${f.step||"any"}" inputmode="decimal"`:""} value="${esc(v)}">`;
        return `<div class="fld ${f.t==="area"?"full":""}"><label for="${idf}">${esc(f.l)}${req}</label>${inp}${f.help?`<span class="help">${esc(f.help)}</span>`:""}</div>`;
      }).join("")}
      ${FORM_EXTRA.map(f=>f.html(t, r)).join("")}
    </div>
    <footer>
      <div class="left">${r ? `<button type="button" class="btn danger" data-act="ask-del">Eliminar</button><span id="delconf" hidden>¿Seguro? <button type="button" class="btn danger" data-act="del" data-t="${t}" data-id="${r.id}">Sí, eliminar</button></span>` : ""}</div>
      <button type="button" class="btn" data-act="close">Cancelar</button>
      <button type="submit" class="btn primary">Guardar</button>
    </footer></form>`;
  dlg.dataset.t = t; dlg.dataset.id = id || "";
  dlg.showModal();
  for (const f of FORM_EXTRA) try { f.mount?.(t, r); } catch(e) { console.warn(e); }
  const first = dlg.querySelector("input,select,textarea"); if (first && !r) first.focus();
}
function submitForm(e){
  e.preventDefault();
  const dlg = $("#dlg"), t = dlg.dataset.t, id = dlg.dataset.id, sch = S[t], fm = e.target;
  const rec = id ? {...DB[t].find(x=>x.id===id)} : {id: uid()};
  delete rec._demo;
  const faltan = [];
  for (const f of sch.fields) {
    if (f.hide) continue;
    const el = fm.elements[f.k];
    let v = f.t === "chk" ? el.checked : el.value.trim();
    if (f.t === "num" && v !== "") v = Number(v);
    rec[f.k] = v;
    if (f.req && (v === "" || v == null)) { faltan.push(f.l); el.style.borderColor = "var(--crit)"; } else if (el.style) el.style.borderColor = "";
  }
  if (faltan.length) { toast(`Falta: ${faltan.join(", ")}`); return; }
  for (const f of FORM_EXTRA) try { f.collect?.(t, rec); } catch(e) { console.warn(e); }
  rec._u = now();
  if (id) DB[t] = DB[t].map(x => x.id===id ? rec : x); else DB[t].push(rec);
  // Coherencia: un movimiento de baja actualiza el animal si coincide el crotal
  if (t === "animales" && rec.estado === "Baja" && !rec.baja) rec.baja = today();
  save(); dlg.close(); render(); toast(id ? "Cambios guardados" : `${sch.one[0].toUpperCase()+sch.one.slice(1)} añadido`);
}

/* ---- Exportar / importar ---- */
function download(name, content, type){
  try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], {type})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();}, 500); } catch(e) { toast("No se pudo descargar el archivo en este navegador."); }
}
function csv(t){
  const sch = S[t], rows = filtered(t);
  const cols = sch.fields.map(f=>f.k);
  const head = sch.fields.map(f=>f.l);
  const cell = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const lines = [head.map(cell).join(";")].concat(rows.map(r => sch.fields.map(f => {
    const v = r[f.k];
    if (f.t==="ref") return cell(refName(f.ref, v));
    if (f.t==="date") return cell(fdate(v));
    if (f.t==="num") return cell(v===""||v==null?"":String(v).replace(".",","));
    if (f.t==="chk") return v?"Sí":"No";
    return cell(v);
  }).join(";")));
  download(`${t}-${today()}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
}
function backupJSON(){ return JSON.stringify({app:"mi-explotacion", exportado:new Date().toISOString(), datos:DB}, null, 1); }
function viewAjustes(){
  const t = DB._meta.titular || {};
  const tot = Object.keys(S).reduce((s,k)=>s+DB[k].length,0);
  return `${demoBanner()}
  <div class="head"><div><div class="eyebrow">Ajustes</div><h1>Datos de la explotación y copias de seguridad</h1></div></div>
  <div class="grid2">
  <form class="panel" id="titular"><h2>Titular</h2>
    <div class="fld"><label for="t_nombre">Nombre de la explotación o titular</label><input id="t_nombre" name="nombre" type="text" value="${esc(t.nombre)}"></div>
    <div class="fld"><label for="t_nif">NIF</label><input id="t_nif" name="nif" type="text" value="${esc(t.nif)}"></div>
    <div class="fld"><label for="t_rega_gan">Código REGA ganadero</label><input id="t_rega_gan" name="rega_gan" type="text" value="${esc(t.rega_gan)}" placeholder="ES000000000000"></div>
    <div class="fld"><label for="t_rega_api">Código REGA apícola</label><input id="t_rega_api" name="rega_api" type="text" value="${esc(t.rega_api)}"></div>
    <div class="fld"><label for="t_ccaa">Comunidad autónoma</label><input id="t_ccaa" name="ccaa" type="text" value="${esc(t.ccaa)}"></div>
    <div><button class="btn primary" type="submit">Guardar datos</button></div>
  </form>
  <section class="panel"><h2>Copia de seguridad</h2>
    <p class="muted">Tus datos se guardan solo en este dispositivo y navegador (${tot} registros). Descarga una copia de vez en cuando y guárdala en otro sitio, por ejemplo en tu correo o en la nube.</p>
    <div class="toolbar">
      <button class="btn primary" data-act="export">Descargar copia (.json)</button>
      <button class="btn" data-act="copy">Copiar copia al portapapeles</button>
      <label class="btn" for="imp" style="cursor:pointer">Restaurar copia…</label><input type="file" id="imp" accept=".json,application/json" hidden>
    </div>
    <h3>Borrar datos</h3>
    <div class="toolbar">
      ${hasDemo()?`<button class="btn" data-act="clear-demo">Borrar datos de ejemplo</button>`:`<button class="btn" data-act="load-demo">Cargar datos de ejemplo</button>`}
      <button class="btn danger" data-act="ask-wipe">Borrar todo</button>
      <span id="wipeconf" hidden>Se borrarán todos los registros. <button class="btn danger" data-act="wipe">Sí, borrar todo</button></span>
    </div>
  </section>
  </div>
  ${SETTINGS.map(f=>f()).join("")}
  <section class="panel"><h2>Sobre los registros oficiales</h2>
    <p class="muted" style="max-width:70ch">La app sigue la estructura del cuaderno de campo (tratamientos fitosanitarios, abonados y cosechas), el libro de registro de explotación ganadera con sus movimientos y tratamientos veterinarios, y el libro de explotación apícola. Comprueba con tu oficina comarcal agraria o tu ADS qué formato exige tu comunidad autónoma, y usa la exportación CSV para entregar o imprimir los registros.</p>
  </section>`;
}

/* ============ Eventos ============ */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-go],[data-new],[data-edit],[data-act]");
  if (!el) return;
  if (el.dataset.new) return openForm(el.dataset.new);
  if (el.dataset.edit) return openForm(el.dataset.edit, el.dataset.id);
  if (el.dataset.go) return go(el.dataset.go, el.dataset.tab);
  const a = el.dataset.act;
  if (a === "close") $("#dlg").close();
  else if (a === "ask-del") { $("#delconf").hidden = false; el.hidden = true; }
  else if (a === "del") { const t = el.dataset.t; const gone = DB[t].find(x=>x.id===el.dataset.id); DB[t] = DB[t].filter(x=>x.id!==el.dataset.id); tomb(el.dataset.id); for (const f of FORM_EXTRA) try { f.remove?.(t, gone); } catch(e) {} save(); $("#dlg").close(); render(); toast("Registro eliminado"); }
  else if (a === "csv") csv(el.dataset.t);
  else if (a === "export") exportar(false);
  else if (a === "copy") { navigator.clipboard?.writeText(backupJSON()).then(()=>toast("Copia copiada al portapapeles"), ()=>toast("No se pudo copiar. Usa Descargar copia.")); }
  else if (a === "clear-demo") { for (const t in S) { DB[t].filter(r=>r._demo).forEach(r=>tomb(r.id)); DB[t] = DB[t].filter(r=>!r._demo); } save(); render(); toast("Datos de ejemplo borrados"); }
  else if (a === "load-demo") { const s = seed(); for (const t in S) DB[t] = DB[t].concat(s[t]); save(); render(); toast("Datos de ejemplo cargados"); }
  else if (a === "ask-wipe") { $("#wipeconf").hidden = false; el.hidden = true; }
  else if (a === "wipe") { const meta = DB._meta; for (const t in S) DB[t].forEach(r=>tomb(r.id)); DB = blank(); DB._meta = meta; save(); render(); toast("Todos los registros borrados"); }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("tr[data-edit]")) openForm(e.target.dataset.edit, e.target.dataset.id); });
document.addEventListener("input", e => { if (e.target.id === "q") { UI.q = e.target.value; UI._focusQ = true; render(); } });
document.addEventListener("change", e => {
  if (e.target.id === "year") { UI.year = e.target.value; saveUI(); render(); }
  if (e.target.id === "imp") {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const j = JSON.parse(rd.result); const d = j.datos || j; if (!d || typeof d !== "object" || !Object.keys(S).some(k=>Array.isArray(d[k]))) throw 0; DB = normalize(d); for (const t in S) for (const r of DB[t]) r._u = now(); if (j.adjuntos) restaurarAdjuntos(j.adjuntos); save(); render(); toast("Copia restaurada"); } catch(err) { toast("Ese archivo no es una copia válida de Mi Explotación."); } };
    rd.readAsText(f);
  }
});
document.addEventListener("submit", e => {
  if (e.target.id === "frm") submitForm(e);
  if (e.target.id === "titular") { e.preventDefault(); DB._meta.titular = Object.fromEntries(new FormData(e.target)); DB._meta.titular_u = now(); save(); render(); toast("Datos del titular guardados"); }
});

