// ================== CONFIGURACION ==================
const SUPABASE_URL = "https://punuuirjrtnihcgjucji.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1bnV1aXJqcnRuaWhjZ2p1Y2ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzY0OTIsImV4cCI6MjEwNDIxMjQ5Mn0.05iGLyekYZO0Y8wLkKQlnL1rOjlWYBrPpo5sM7QQrPU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // no recordar la sesion al cerrar la app -- pide login cada vez que se abre
  },
});

const C = { acierto: "#0B7A55", fallo: "#B42318", tinta: "#1B1F27", gris: "#8C94A3", grisClaro: "#C5CAD3", linea: "#E9EBEE", apagado: "#5B6270" };
const OBJETIVO_MIN = 1.80;
const OBJETIVO_MAX = 2.00;
const NIVELES_SENAL = ["CONFIABLE", "RADAR_ALTO", "RADAR"];
const MIN_MUESTRA_SOLIDA = 30;   // minimo de picks por grupo para no avisar "muestra chica"
const MIN_PICKS_LIGA = 10;       // por debajo, la fila de una liga se pinta en gris

// ================== ELEMENTOS ==================
const $ = (id) => document.getElementById(id);
const splashScreen = $("splash-screen");
const loginScreen = $("login-screen");
const mainApp = $("main-app");
const loginEmail = $("login-email");
const loginPassword = $("login-password");
const btnLogin = $("btn-login");
const loginError = $("login-error");
const btnLogout = $("btn-logout");
const vistaEl = $("vista");
const builderSlot = $("builder-slot");
const sheetRoot = $("sheet-root");
const navBtns = document.querySelectorAll(".ni");

// ================== UTILIDADES ==================
function esc(s) {
  return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmt(x, d = 1) {
  return x === null || x === undefined || isNaN(x) ? "--" : Number(x).toFixed(d);
}
function signo(x, d = 1) {
  if (x === null || x === undefined || isNaN(x)) return "--";
  return (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(d);
}
function esSenal(p) { return NIVELES_SENAL.includes(p.nivel); }

// Dia calendario de COLOMBIA (UTC-5, sin horario de verano), sin depender de la
// zona horaria del telefono.
function hoyISO(offsetDias = 0) {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}
function fechaColombia(ts) {
  return new Date(new Date(ts).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function diaSemana(fechaStr) { return new Date(fechaStr + "T12:00:00Z").getUTCDay(); } // 0=dom
function esFinDeSemana(fechaStr) { const d = diaSemana(fechaStr); return d === 5 || d === 6 || d === 0; } // vie, sab, dom
function horaCol(ts) {
  return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
}
function etiquetaDiaCorta(f) {
  const n = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${n[diaSemana(f)]} ${parseInt(f.slice(8), 10)}`;
}
function etiquetaDiaLarga(f) {
  return new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function fechaCorta(f) {
  return new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function fechaMini(f) {
  return new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}
function lunesDe(fechaStr) {
  const d = new Date(fechaStr + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// ---------- estadistica base ----------
function resumen(filas) {
  const total = filas.length;
  const aciertos = filas.filter((f) => f.resultado === true).length;
  return { total, aciertos, fallos: total - aciertos, pct: total > 0 ? (100 * aciertos) / total : null };
}
function unidades(filas) {
  return filas.reduce((s, f) => s + (f.resultado === true ? Number(f.cuota) - 1 : -1), 0);
}
function rendimiento(filas) { return filas.length ? (100 * unidades(filas)) / filas.length : null; }
function cuotaProm(filas) { return filas.length ? filas.reduce((s, f) => s + Number(f.cuota), 0) / filas.length : null; }
function probImplicita(filas) { return filas.length ? (100 * filas.reduce((s, f) => s + 1 / Number(f.cuota), 0)) / filas.length : null; }
function ventajaPP(filas) { const r = resumen(filas); const pi = probImplicita(filas); return r.pct === null || pi === null ? null : r.pct - pi; }
function claseSigno(x) { return x === null || x === undefined ? "mut" : x < 0 ? "neg" : x > 0 ? "pos" : ""; }

// ================== GRAFICAS (SVG propio, sin librerias) ==================
let uidSvg = 0;

// Linea con relleno: VERDE por encima de la referencia, ROJO por debajo.
function graficaSplit(vals, ref, o = {}) {
  const W = o.W || 92, H = o.H || 40, padr = o.padr || 0, padl = o.padl === undefined ? 3 : o.padl;
  const margen = o.margen === undefined ? 0.5 : o.margen;
  const minSpan = o.minSpan || 4;
  const pt = o.pt === undefined ? 5 : o.pt;
  const pb = o.xl ? 22 : 5;
  let lo = o.lo, hi = o.hi;
  if (lo === undefined) {
    lo = Math.min(...vals, ref) - margen;
    hi = Math.max(...vals, ref) + margen;
    if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
  }
  const Y = (v) => +(pt + ((hi - v) / (hi - lo)) * (H - pt - pb)).toFixed(1);
  const n = vals.length;
  const X = (i) => +(padl + (n === 1 ? 0 : (i * (W - padl - padr)) / (n - 1))).toFixed(1);
  const pts = vals.map((v, i) => [X(i), Y(v)]);
  const ly = Y(ref);
  const id = ++uidSvg;
  const off = (ly / H).toFixed(3);
  const linea = pts.map((p) => p.join(",")).join(" ");
  const area = `M${pts[0][0]},${ly} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length - 1][0]},${ly} Z`;
  let rej = "";
  (o.yt || []).forEach((t) => {
    rej += `<line x1="0" y1="${Y(t)}" x2="${W - padr + 6}" y2="${Y(t)}" stroke="${C.linea}" stroke-width="1"/><text x="${W - padr + 12}" y="${Y(t) + 4}" font-size="11" fill="${C.apagado}">${o.fmtY ? o.fmtY(t) : t}</text>`;
  });
  let xl = "";
  (o.xl || []).forEach(([i, lab]) => { xl += `<text x="${X(i)}" y="${H - 5}" font-size="11" fill="${C.apagado}" text-anchor="middle">${esc(lab)}</text>`; });
  const ultimo = vals[vals.length - 1] >= ref ? C.acierto : C.fallo;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "Grafica de evolucion")}" style="max-width:100%;height:auto">
    <defs><linearGradient id="g${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="${off}" stop-color="${C.acierto}"/><stop offset="${off}" stop-color="${C.fallo}"/></linearGradient></defs>
    ${rej}<path d="${area}" fill="url(#g${id})" fill-opacity="0.13"/>
    <line x1="0" y1="${ly}" x2="${W - padr + 6}" y2="${ly}" stroke="${C.gris}" stroke-width="1" stroke-dasharray="3 3"/>
    <polyline points="${linea}" fill="none" stroke="url(#g${id})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="${o.W > 200 ? 3.5 : 3}" fill="${ultimo}"/>${xl}</svg>`;
}

// Dos (o mas) lineas de rendimiento acumulado, con etiquetas directas al final.
function graficaLineas(series, nFechas, o = {}) {
  const W = o.W || 350, H = o.H || 150, padl = 6, padr = 52, pt = 10, pb = 22;
  const todos = series.flatMap((s) => s.pts.map((p) => p.y)).concat([0]);
  let lo = Math.min(...todos), hi = Math.max(...todos);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const m = (hi - lo) * 0.12; lo -= m; hi += m;
  const Y = (v) => +(pt + ((hi - v) / (hi - lo)) * (H - pt - pb)).toFixed(1);
  const X = (i) => +(padl + (nFechas <= 1 ? 0 : (i * (W - padl - padr)) / (nFechas - 1))).toFixed(1);
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rendimiento acumulado en unidades" style="max-width:100%;height:auto">`;
  s += `<line x1="0" y1="${Y(0)}" x2="${W - padr + 6}" y2="${Y(0)}" stroke="${C.gris}" stroke-width="1" stroke-dasharray="3 3"/><text x="${W - padr + 12}" y="${Y(0) + 4}" font-size="11" fill="${C.apagado}">0</text>`;
  series.forEach((se) => {
    if (!se.pts.length) return;
    const pts = se.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="${se.color}" stroke-width="${se.w || 2}" stroke-linejoin="round" stroke-linecap="round"${se.dash ? ` stroke-dasharray="${se.dash}"` : ""}/>`;
    const u = se.pts[se.pts.length - 1];
    s += `<circle cx="${X(u.x)}" cy="${Y(u.y)}" r="3.5" fill="${se.color}"/><text x="${X(u.x) + 8}" y="${Y(u.y) + 4}" font-size="11" font-weight="600" fill="${se.color}">${signo(u.y, 1)}</text>`;
  });
  (o.xl || []).forEach(([i, lab]) => { s += `<text x="${X(i)}" y="${H - 5}" font-size="11" fill="${C.apagado}" text-anchor="middle">${esc(lab)}</text>`; });
  return s + "</svg>";
}

// ================== SPLASH / LOGIN / SESION ==================
const DURACION_SPLASH_MS = 6000;

async function terminarSplash() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  splashScreen.style.display = "none";
  if (session) mostrarApp(); else mostrarLogin();
}
setTimeout(terminarSplash, DURACION_SPLASH_MS);

function mostrarLogin() {
  detenerRefrescoResultados();
  cerrarSheet();
  loginScreen.style.display = "flex";
  mainApp.style.display = "none";
}
function mostrarApp() {
  loginScreen.style.display = "none";
  mainApp.style.display = "block";
  ir(vistaActual);
  reiniciarTemporizadorInactividad();
}

btnLogin.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  loginError.textContent = "";
  if (!email || !password) { loginError.textContent = "Pon tu correo y contraseña."; return; }
  btnLogin.disabled = true;
  btnLogin.textContent = "Entrando...";
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btnLogin.disabled = false;
  btnLogin.textContent = "Entrar";
  if (error) { loginError.textContent = "Correo o contraseña incorrectos."; return; }
  mostrarApp();
});
btnLogout.addEventListener("click", async () => { await supabaseClient.auth.signOut(); mostrarLogin(); });
loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") btnLogin.click(); });

const MINUTOS_INACTIVIDAD = 30;
let temporizadorInactividad = null;
function reiniciarTemporizadorInactividad() {
  if (mainApp.style.display === "none") return;
  clearTimeout(temporizadorInactividad);
  temporizadorInactividad = setTimeout(async () => {
    await supabaseClient.auth.signOut();
    mostrarLogin();
    loginError.textContent = "Sesión cerrada por inactividad.";
  }, MINUTOS_INACTIVIDAD * 60 * 1000);
}
["click", "keydown", "touchstart", "scroll"].forEach((ev) => document.addEventListener(ev, reiniciarTemporizadorInactividad));

// ================== NAVEGACION ==================
let vistaActual = "hoy";

function ir(vista) {
  vistaActual = vista;
  detenerRefrescoResultados();
  navBtns.forEach((b) => b.classList.toggle("on", b.dataset.vista === vista));
  cerrarSheet();
  window.scrollTo(0, 0);
  if (vista === "hoy") cargarDia(0);
  else if (vista === "manana") cargarDia(1);
  else if (vista === "resultados") cargarResultados();
  else if (vista === "stats") cargarEstadisticas();
}
navBtns.forEach((b) => b.addEventListener("click", () => ir(b.dataset.vista)));

// ================== HOJAS (plegables desde abajo) ==================
let sheetCierre = null;

function cerrarSheet() {
  sheetRoot.innerHTML = "";
  document.body.style.overflow = "";
  sheetCierre = null;
}

function abrirSheet({ titulo, sub, tagsHtml, body, footer, corto, alCerrar }) {
  sheetRoot.innerHTML = `<div class="dim" id="sh-dim"></div>
    <div class="sheet${corto ? " corto" : ""}" id="sh" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="sh-top" id="sh-top">
        <div class="grab"></div>
        <div class="sh-h"><div>${tagsHtml ? `<div class="tags" style="margin-bottom:8px">${tagsHtml}</div>` : ""}<b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
          <button class="ib" id="sh-x" aria-label="Cerrar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      </div>
      <div class="sh-body" id="sh-body">${body}</div>
      ${footer ? `<div class="sh-f" id="sh-f">${footer}</div>` : ""}
    </div>`;
  document.body.style.overflow = "hidden";
  sheetCierre = alCerrar || null;
  const cerrar = () => { const cb = sheetCierre; cerrarSheet(); if (cb) cb(); };
  $("sh-dim").addEventListener("click", cerrar);
  $("sh-x").addEventListener("click", cerrar);

  // arrastrar hacia abajo para cerrar (desde la cabecera de la hoja)
  const sh = $("sh"), top = $("sh-top");
  let y0 = null, dy = 0;
  top.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; dy = 0; sh.classList.add("arrastrando"); }, { passive: true });
  top.addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    sh.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: true });
  top.addEventListener("touchend", () => {
    if (y0 === null) return;
    sh.classList.remove("arrastrando");
    if (dy > 90) cerrar(); else sh.style.transform = "";
    y0 = null;
  });
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetRoot.innerHTML) { const cb = sheetCierre; cerrarSheet(); if (cb) cb(); } });

// ================== TARJETAS Y ETIQUETAS ==================
function tagNivel(nivel) {
  if (nivel === "CONFIABLE") return '<span class="tag t-conf">Confiable</span>';
  if (nivel === "RADAR_ALTO") return '<span class="tag t-alto">Radar alto</span>';
  if (nivel === "RADAR") return '<span class="tag t-radar">En el radar</span>';
  if (nivel === "MUESTRA_INSUFICIENTE") return '<span class="tag t-muted">Poca muestra</span>';
  return '<span class="tag t-muted">Sin señal</span>';
}
function esValorPositivo(p) { return p.valor_vs_mercado !== null && p.valor_vs_mercado !== undefined && Number(p.valor_vs_mercado) > 0; }
function valorPP(p) { return p.valor_vs_mercado === null || p.valor_vs_mercado === undefined ? null : Number(p.valor_vs_mercado) * 100; }
function tagValor(p) { return esValorPositivo(p) ? `<span class="tag t-gain">Valor ${signo(valorPP(p))} pp</span>` : ""; }
const TAG_TRIPLE = '<span class="tag t-triple">Filtro triple</span>';
const ICO_ARRIBA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6l6 6"/></svg>';
const ICO_CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B7A55" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5l10-10"/></svg>';
const ICO_NO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B42318" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICO_NA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C94A3" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';

function equipos(p) {
  const i = (p.partido || "").indexOf(" vs ");
  return i < 0 ? [p.partido, ""] : [p.partido.slice(0, i), p.partido.slice(i + 4)];
}

// Fila de un equipo con su minigrafica (goles totales de cada uno de sus ultimos 6
// partidos por localia; linea punteada = 2.5; verde sobre 2.5, rojo bajo 2.5).
function filaEquipo(nombre, ctx, anota, recibe, serie) {
  const totales = Array.isArray(serie) ? serie.map((x) => x.total) : [];
  const conGrafica = totales.length >= 2;
  const over = totales.filter((t) => t >= 3).length;
  const cls = conGrafica ? (over / totales.length >= 4 / 6 - 1e-9 ? "hi" : "lo") : "";
  return `<div class="tm">
    <div class="who"><b>${esc(nombre)}</b><small>${esc(ctx)}</small><small>Anota ${fmt(anota, 2)}, recibe ${fmt(recibe, 2)}</small></div>
    ${conGrafica ? graficaSplit(totales, 2.5, { W: 92, H: 40, aria: `Goles totales de los ultimos ${totales.length} partidos de ${nombre}` }) : "<span></span>"}
    <span class="val ${cls}">${conGrafica ? `${over}/${totales.length}` : "--"}</span>
  </div>`;
}

function etiquetaRegla(p) { return p.regla_tipo === "cuota" ? "Histórico de la cuota" : "Histórico de la confianza"; }

function metricas(p) {
  return `<div class="metrics">
    <div class="cell"><small>Probabilidad</small><strong>${fmt(p.probabilidad * 100)}%</strong></div>
    <div class="cell"><small>Cuota Over 2.5</small><strong>${fmt(p.cuota, 2)}</strong></div>
    <div class="cell"><small>${etiquetaRegla(p)}</small><strong>${p.regla_pct !== null && p.regla_pct !== undefined ? fmt(p.regla_pct) + "%" : "--"}</strong></div>
    <div class="cell"><small>Goles esperados</small><strong>${p.goles_esperados !== null && p.goles_esperados !== undefined ? fmt(p.goles_esperados, 2) : "--"}</strong></div>
  </div>`;
}

// ================== HOY / MAÑANA ==================
let diaOffset = 0;
let picksDia = [];
let combMetodoDia = null;
let miCombDia = null;
let seleccion = [];
let ordenDia = "liga";        // "liga" (agrupado, como siempre) | "valor" (ordenado por valor vs mercado)
let combValorDia = null;

async function cargarDia(off) {
  diaOffset = off;
  seleccion = [];
  builderSlot.innerHTML = "";
  const fecha = hoyISO(off);
  vistaEl.innerHTML = titulo(off === 0 ? "Hoy" : "Mañana", etiquetaDiaLarga(fecha), true) + '<div class="cargando">Cargando...</div>';
  bindAnalizar();

  const [pk, cm, mc, cv] = await Promise.all([
    supabaseClient.from("picks").select("*").gte("fecha_partido", fecha + "T00:00:00-05:00").lte("fecha_partido", fecha + "T23:59:59-05:00").order("fecha_partido", { ascending: true }),
    supabaseClient.from("combinada_dia").select("*").eq("fecha", fecha).maybeSingle(),
    supabaseClient.from("mi_combinada").select("*").eq("fecha", fecha).maybeSingle(),
    supabaseClient.from("combinada_valor").select("*").eq("fecha", fecha).maybeSingle(),
  ]);
  if (vistaActual !== (off === 0 ? "hoy" : "manana")) return; // el usuario ya cambio de pantalla
  if (pk.error) {
    vistaEl.innerHTML = titulo(off === 0 ? "Hoy" : "Mañana", etiquetaDiaLarga(fecha), true) + `<div class="vacio">Error leyendo picks: ${esc(pk.error.message)}</div>`;
    bindAnalizar();
    return;
  }
  picksDia = (pk.data || []).filter(esSenal);
  combMetodoDia = !cm.error && cm.data && !cm.data.mensaje ? cm.data : null;
  miCombDia = !mc.error && mc.data ? mc.data : null;
  combValorDia = !cv.error && cv.data ? cv.data : null;
  renderDia();
}

function titulo(t, sub, conAnalizar) {
  return `<div class="ttl"><div><h1>${esc(t)}</h1><p>${esc(sub)}</p></div>${conAnalizar ? '<button class="btn-s" id="btn-analizar">Analizar ahora</button>' : ""}</div>${conAnalizar ? '<p class="estado-analisis" id="analizar-mensaje"></p>' : ""}`;
}

function yaEmpezo(p) { return new Date(p.fecha_partido).getTime() <= Date.now(); }
function estaEnMiCombinada(p) {
  return !!(miCombDia && (miCombDia.patas || []).some((x) => x.liga_id === p.liga_id && x.partido === p.partido));
}

function botonAgregar(p, ctx) {
  const attr = ctx === "hoja" ? `data-add-hoja="${p.id}"` : `data-add="${p.id}"`;
  if (miCombDia) return estaEnMiCombinada(p) ? '<button class="pickb fijo" disabled>En mi combinada</button>' : "<span></span>";
  if (yaEmpezo(p)) return '<button class="pickb fijo" disabled>Ya empezó</button>';
  if (seleccion.some((x) => x.id === p.id)) return `<button class="pickb on" ${attr}>Agregado</button>`;
  if (seleccion.length >= 2) return `<button class="pickb" disabled>Agregar</button>`;
  return `<button class="pickb" ${attr}>Agregar</button>`;
}

function renderDia() {
  const fecha = hoyISO(diaOffset);
  const nTriple = picksDia.filter((p) => p.cumple_filtro_triple === true).length;
  const nValor = picksDia.filter(esValorPositivo).length;
  let html = titulo(diaOffset === 0 ? "Hoy" : "Mañana", etiquetaDiaLarga(fecha), true);

  if (picksDia.length === 0) {
    html += `<div class="vacio">Todavía no hay partidos con señal para este día. El análisis corre cada noche y puedes lanzarlo con "Analizar ahora".</div>`;
    vistaEl.innerHTML = html;
    bindAnalizar();
    renderBuilder();
    return;
  }

  html += `<div class="sec" style="padding-top:14px"><h2>${picksDia.length} partido${picksDia.length === 1 ? "" : "s"} con señal</h2><span>${nTriple} con filtro triple, ${nValor} con valor positivo</span></div>
    <div class="ayuda-fila"><button class="link-btn" data-ayuda="1">Cómo leer esta pantalla</button></div>`;

  // --- combinada del metodo ---
  if (combMetodoDia) {
    const patas = combMetodoDia.picks || [];
    html += `<div class="card"><div class="card-h"><h3>Combinada del método</h3><span>${patas.length} patas, cuota total ${fmt(combMetodoDia.cuota_total, 2)}</span></div>
      ${patas.map((x) => `<div class="legs"><span>${esc(x.partido)}</span><b style="font-weight:600">${fmt(x.cuota_over25, 2)}</b></div>`).join("")}
      <div class="legs resumen"><span>Criterio usado</span><b style="font-weight:500">${combMetodoDia.criterio_usado === "filtro_triple" ? "Filtro triple" : "Normal"}</b></div></div>`;
  } else {
    html += `<div class="card"><div class="card-h"><h3>Combinada del método</h3><span>sin combinada todavía</span></div></div>`;
  }

  // --- combinada por valor ---
  if (combValorDia) {
    const patas = combValorDia.picks || [];
    html += `<div class="card"><div class="card-h"><h3>Combinada por valor</h3><span>${patas.length} patas, cuota total ${fmt(combValorDia.cuota_total, 2)}</span></div>
      ${patas.map((x) => `<div class="legs"><span>${esc(x.partido)}${x.triple ? " " + TAG_TRIPLE : ""}</span><b style="font-weight:600">${fmt(x.cuota, 2)} <small class="${x.valor_pp > 0 ? "pos" : "mut"}">${signo(x.valor_pp)} pp</small></b></div>`).join("")}
      <div class="legs resumen"><span>Valor total</span><b style="font-weight:600" class="${combValorDia.valor_total > 0 ? "pos" : "mut"}">${signo(combValorDia.valor_total)} pp</b></div>
      ${miCombDia ? "" : `<div class="legs accion"><button class="pickb" data-cargar-valor="1" style="width:100%">Cargar estas 2 patas en mi combinada</button></div>`}</div>`;
  } else {
    html += `<div class="card"><div class="card-h"><h3>Combinada por valor</h3><span>sin pareja de valor todavía</span></div></div>`;
  }

  // --- mi combinada confirmada ---
  if (miCombDia) {
    const patas = miCombDia.patas || [];
    html += `<div class="card fuerte"><div class="card-h"><h3>Mi combinada</h3><span>confirmada ${horaCol(miCombDia.confirmada_en)}</span></div>
      ${patas.map((x) => `<div class="legs"><span>${esc(x.partido)}</span><b style="font-weight:600">${fmt(x.cuota, 2)}</b></div>`).join("")}
      <div class="legs resumen"><span>Cuota total${miCombDia.cuota_real_total ? " (real)" : ""}${miCombDia.casa ? ", " + esc(miCombDia.casa) : ""}</span><b style="font-weight:600">${fmt(miCombDia.cuota_real_total || miCombDia.cuota_total, 2)}</b></div></div>`;
  }

  // --- partidos: agrupados por liga, o todos ordenados por valor vs mercado ---
  html += `<div class="sec" style="padding-bottom:8px"><h2>Partidos</h2><span>${ordenDia === "valor" ? "de mayor a menor valor" : "agrupados por liga"}</span></div>
    <div class="seg" style="margin-top:0;margin-bottom:12px"><button data-orden="liga" class="${ordenDia === "liga" ? "on" : ""}">Agrupar por liga</button><button data-orden="valor" class="${ordenDia === "valor" ? "on" : ""}">Ordenar por valor</button></div>`;
  const tarjeta = (p, mostrarLiga) => {
    const [loc, vis] = equipos(p);
    const triple = p.cumple_filtro_triple === true;
    const v = valorPP(p);
    return `<div class="match${triple ? " triple" : ""}" data-abrir="${p.id}" tabindex="0">
        <div class="tags">${tagNivel(p.nivel)}${triple ? TAG_TRIPLE : ""}${tagValor(p)}<span class="hora">${horaCol(p.fecha_partido)}</span></div>
        <div class="teams"><b>${esc(p.partido)}</b>${mostrarLiga ? `<small class="liga-sub">${esc(p.liga_nombre)}</small>` : ""}</div>
        <div style="margin-top:6px">
          ${filaEquipo(loc, "Local, últimos 6 de local", p.forma_local_anota, p.forma_local_recibe, p.ultimos_local)}
          ${filaEquipo(vis, "Visitante, últimos 6 de visitante", p.forma_visita_anota, p.forma_visita_recibe, p.ultimos_visita)}
        </div>
        ${metricas(p)}
        <div class="valor-fila"><span>Valor vs mercado</span><b class="${v === null ? "mut" : v > 0 ? "pos" : "mut"}">${v === null ? "--" : signo(v) + " pp"}</b></div>
        <div class="mrow"><span class="ver">Ver análisis completo ${ICO_ARRIBA}</span>${botonAgregar(p, "lista")}</div>
      </div>`;
  };
  if (ordenDia === "valor") {
    picksDia.slice().sort((a, b) => (valorPP(b) === null ? -999 : valorPP(b)) - (valorPP(a) === null ? -999 : valorPP(a))).forEach((p) => { html += tarjeta(p, true); });
  } else {
    const porLiga = {};
    picksDia.forEach((p) => { (porLiga[p.liga_nombre] = porLiga[p.liga_nombre] || []).push(p); });
    Object.keys(porLiga).sort().forEach((liga) => {
      html += `<div class="band">${esc(liga)}</div>`;
      porLiga[liga].forEach((p) => { html += tarjeta(p, false); });
    });
  }
  html += `<div class="foot">Análisis pre-partido. No garantiza resultados. La gestión de la banca es tu responsabilidad.<br>Diseñado y creado por Jose Torres.</div>`;
  vistaEl.innerHTML = html;
  bindAnalizar();
  renderBuilder();
}

// clics dentro de la lista de partidos
vistaEl.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) { e.stopPropagation(); alternarSeleccion(parseInt(add.dataset.add, 10)); return; }
  const card = e.target.closest("[data-abrir]");
  if (card) abrirPartido(parseInt(card.dataset.abrir, 10));
  const ord = e.target.closest("[data-orden]");
  if (ord) { ordenDia = ord.dataset.orden; renderDia(); return; }
  const cvb = e.target.closest("[data-cargar-valor]");
  if (cvb) { cargarParejaValor(); return; }
  const ay = e.target.closest("[data-ayuda]");
  if (ay) { abrirAyuda(); return; }
  const liga = e.target.closest("[data-liga]");
  if (liga) abrirLiga(liga.dataset.liga);
  const dia = e.target.closest("[data-dia]");
  if (dia) { diaResultadoActivo = dia.dataset.dia; renderResultados(); }
  const f = e.target.closest("[data-filtro]");
  if (f) { filtroDias = f.dataset.filtro; renderEstadisticas(); }
});
vistaEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const card = e.target.closest && e.target.closest("[data-abrir]");
  if (card && e.target === card) abrirPartido(parseInt(card.dataset.abrir, 10));
});

function cargarParejaValor() {
  if (!combValorDia || miCombDia) return;
  const nuevas = [];
  (combValorDia.picks || []).forEach((x) => {
    const p = picksDia.find((q) => q.liga_id === x.liga_id && q.partido === x.partido);
    if (p && !yaEmpezo(p)) nuevas.push(p);
  });
  if (nuevas.length < 2) {
    const m = $("analizar-mensaje");
    if (m) m.textContent = "Uno de los partidos de la combinada por valor ya empezó o no está en la lista. Arma tu combinada a mano.";
    return;
  }
  seleccion = nuevas;
  renderDia();
  window.scrollTo(0, 0);
}

function alternarSeleccion(id) {
  const p = picksDia.find((x) => x.id === id);
  if (!p || miCombDia || yaEmpezo(p)) return;
  const i = seleccion.findIndex((x) => x.id === id);
  if (i >= 0) seleccion.splice(i, 1);
  else if (seleccion.length < 2) seleccion.push(p);
  const y = window.scrollY;
  renderDia();
  window.scrollTo(0, y);
}

// ---------- barra de Mi combinada ----------
function cuotaTotalSel() { return seleccion.length === 2 ? Math.round(seleccion[0].cuota * seleccion[1].cuota * 100) / 100 : null; }

function renderBuilder() {
  if (miCombDia || seleccion.length === 0 || (vistaActual !== "hoy" && vistaActual !== "manana")) { builderSlot.innerHTML = ""; return; }
  const total = cuotaTotalSel();
  const enObjetivo = total !== null && total >= OBJETIVO_MIN && total <= OBJETIVO_MAX;
  builderSlot.innerHTML = `<div class="bld">
    <div class="l"><b style="font-weight:600">Mi combinada</b><span style="flex:0 0 auto">${seleccion.length} de 2 patas</span></div>
    ${seleccion.map((p) => `<div class="l"><span>${esc(p.partido)}</span><b style="font-weight:600;flex:0 0 auto">${fmt(p.cuota, 2)}<button data-quitar="${p.id}">Quitar</button></b></div>`).join("")}
    <div class="t"><div><small>Cuota total</small><br><strong>${total !== null ? fmt(total, 2) : "--"}</strong></div>
      <small>${total === null ? "Elige 2 partidos" : enObjetivo ? `Dentro del objetivo ${fmt(OBJETIVO_MIN, 2)} a ${fmt(OBJETIVO_MAX, 2)}` : `Fuera del objetivo ${fmt(OBJETIVO_MIN, 2)} a ${fmt(OBJETIVO_MAX, 2)}`}</small></div>
    <button class="btn" id="btn-confirmar-abrir" ${seleccion.length < 2 ? "disabled" : ""}>Confirmar apuesta</button>
  </div>`;
  builderSlot.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", () => alternarSeleccion(parseInt(b.dataset.quitar, 10))));
  const bc = $("btn-confirmar-abrir");
  if (bc) bc.addEventListener("click", abrirConfirmar);
}

function probEstimada(picks) {
  const pcts = picks.map((p) => p.regla_pct);
  if (pcts.some((x) => x === null || x === undefined)) return null;
  return Math.round(((pcts[0] * pcts[1]) / 100) * 10) / 10;
}

function leerCuota(txt) {
  if (txt === null || txt === undefined || String(txt).trim() === "") return null;
  const n = parseFloat(String(txt).replace(",", "."));
  return isNaN(n) ? NaN : n;
}

function abrirConfirmar() {
  if (seleccion.length !== 2) return;
  const total = cuotaTotalSel();
  const prob = probEstimada(seleccion);
  const body = `<div class="blk" style="padding-top:8px">
      ${seleccion.map((p, i) => `<div class="legs" style="padding-left:0;padding-right:0"><div><b style="font-weight:600">${esc(p.partido)}</b><br><span style="font-size:12px">Over 2.5, ${horaCol(p.fecha_partido)}. Cuota de referencia ${fmt(p.cuota, 2)}</span></div>
        <input class="inp" id="real-${i}" inputmode="decimal" placeholder="${fmt(p.cuota, 2)}" aria-label="Cuota real que te dieron en ${esc(p.partido)}" autocomplete="off"></div>`).join("")}
      <p class="note" style="margin-top:6px">Cuota real: la que te dio tu casa. Es opcional, pero con ella el rendimiento se mide con lo que de verdad pagan. Pon las dos o ninguna.</p>
      <input class="inp inp-casa" id="casa" type="text" maxlength="60" placeholder="Casa de apuestas (opcional)" aria-label="Casa de apuestas" autocomplete="off">
    </div>
    <div class="g3" style="margin-top:12px">
      <div><small id="lbl-total">Cuota total</small><b id="val-total">${fmt(total, 2)}</b></div>
      <div><small>Prob. estimada</small><b>${prob !== null ? fmt(prob) + "%" : "--"}</b></div>
      <div><small>Equilibrio</small><b id="val-equil">${fmt(100 / total)}%</b></div>
    </div>
    <p class="note note-pad" id="nota-confirmar">La probabilidad estimada multiplica el acierto histórico de la regla de cada pata.</p>
    <div class="blk" style="margin-top:14px"><div class="warn">Al confirmar, la apuesta queda guardada y no se puede editar ni borrar. Es la que se mide contra la combinada del método.</div>
    <p class="err" id="confirmar-error"></p></div>`;
  abrirSheet({
    titulo: "Confirmar apuesta", sub: `Tu combinada de ${diaOffset === 0 ? "hoy" : "mañana"}, ${etiquetaDiaLarga(hoyISO(diaOffset))}`, body, corto: true,
    footer: '<button class="btn" id="btn-confirmar">Confirmar apuesta</button><button class="btn2" id="btn-seguir">Seguir editando</button>',
  });
  const refrescar = () => {
    const a = leerCuota($("real-0").value), b = leerCuota($("real-1").value);
    const ok = a !== null && b !== null && !isNaN(a) && !isNaN(b) && a > 1 && b > 1;
    const t = ok ? Math.round(a * b * 100) / 100 : total;
    $("lbl-total").textContent = ok ? "Cuota total real" : "Cuota total";
    $("val-total").textContent = fmt(t, 2);
    $("val-equil").textContent = fmt(100 / t) + "%";
    const dif = ok ? ((t / total) - 1) * 100 : null;
    let nota = "La probabilidad estimada multiplica el acierto histórico de la regla de cada pata.";
    if (prob !== null && prob < 100 / t) nota += " Está por debajo del equilibrio: según el método, esta combinada pierde a largo plazo.";
    if (dif !== null && dif < -3) nota += ` Tu cuota real es ${fmt(Math.abs(dif), 1)}% menor que la de referencia: la ventaja esperada del valor positivo se reduce o desaparece.`;
    $("nota-confirmar").textContent = nota;
  };
  $("real-0").addEventListener("input", refrescar);
  $("real-1").addEventListener("input", refrescar);
  $("btn-seguir").addEventListener("click", cerrarSheet);
  $("btn-confirmar").addEventListener("click", () => confirmarApuesta(prob));
}

async function confirmarApuesta(prob) {
  const btn = $("btn-confirmar"), errEl = $("confirmar-error");
  errEl.textContent = "";
  const a = leerCuota($("real-0").value), b = leerCuota($("real-1").value);
  const hayA = a !== null, hayB = b !== null;
  if (hayA !== hayB) { errEl.textContent = "Pon la cuota real de las dos patas, o deja las dos vacías."; return; }
  if (hayA && (isNaN(a) || isNaN(b) || a <= 1 || b <= 1 || a > 30 || b > 30)) { errEl.textContent = "La cuota real debe ser un número entre 1.01 y 30."; return; }
  btn.disabled = true; btn.textContent = "Guardando...";
  const patas = seleccion.map((p, i) => {
    const o = { liga_id: p.liga_id, partido: p.partido, fecha_partido: p.fecha_partido, cuota: Number(p.cuota) };
    if (hayA) o.cuota_real = i === 0 ? a : b;
    return o;
  });
  const casa = ($("casa").value || "").trim();
  const fila = { patas, probabilidad_estimada: prob };
  if (casa) fila.casa = casa;
  const { error } = await supabaseClient.from("mi_combinada").insert(fila);
  if (error) {
    btn.disabled = false; btn.textContent = "Confirmar apuesta";
    const m = error.message || "";
    errEl.textContent = /duplicate|unique/i.test(m) ? "Ya confirmaste una combinada para este día. No se puede tener otra." : "No se pudo guardar: " + m;
    return;
  }
  cerrarSheet();
  await cargarDia(diaOffset); // recarga: ahora aparece confirmada y los botones quedan bloqueados
}

// ---------- Guia: como leer cada cosa ----------
function abrirAyuda() {
  const body = `<div class="blk guia">
    <h4>Nivel (Confiable, Radar alto, En el radar)</h4>
    <p>Dice qué tan seguido acertó el método en partidos parecidos. Mide acierto, no ganancia: un partido muy probable suele pagar poco.</p>
    <h4>Filtro triple</h4>
    <p>El partido cumple tres condiciones a la vez: probabilidad del modelo de 60% o más, histórico de su cuota de 60% o más y más de 3 goles esperados. Acierta cerca de 72%, pero con cuotas bajas (cerca de 1.4). En el backtest rindió 0%: sirve para ubicar partidos "seguros", no para encontrar ventaja.</p>
    <h4>Valor vs mercado</h4>
    <p>La probabilidad del modelo menos la que implica la cuota. En verde (positivo), el modelo cree más en el Over de lo que la cuota paga. En el backtest sin fuga de datos (3 años, 12 ligas), los picks con valor positivo rindieron +4.7% y los negativos entre -3% y -8%. Es lo que más separa un partido de otro. Es una hipótesis que esta app sigue midiendo en vivo.</p>
    <h4>Los dos juntos</h4>
    <p>Filtro triple y valor positivo: acierta cerca de 72% y rindió +6.6% (273 picks). Filtro triple sin valor: acierta igual, pero rindió -1.7%. Valor sin filtro triple: acierta cerca de 63% y rindió +6.8%, con más altibajos.</p>
    <h4>Minigráficas y 6/6</h4>
    <p>Muestran los goles de los últimos 6 partidos de cada equipo por rol. Son contexto. En el análisis de rachas no mostraron ventaja por sí solas.</p>
    <h4>Combinada del método y combinada por valor</h4>
    <p>La del método sale por goles esperados y cuota. La de valor es la pareja de cuota total entre 1.80 y 2.10, de ligas distintas, con mayor valor sumado. Las dos se guardan solas cada día y se miden aparte.</p>
    <h4>Cómo armar tu combinada</h4>
    <p>1. Busca cuota total entre 1.80 y 2.10. 2. Prefiere patas con valor positivo. 3. Entre esas, si puedes, las que además cumplen el filtro triple. 4. Pon la cuota real que te dé tu casa: si es más de 4% menor que la de referencia, la ventaja esperada desaparece. 5. Confirma solo cuando estés seguro: no se puede editar.</p>
    <h4>Qué esperar</h4>
    <p>Aun con valor positivo, la ventaja esperada es pequeña y habrá semanas perdiendo. No es una garantía: es una inclinación a tu favor que solo se ve con muchos picks.</p>
  </div>`;
  abrirSheet({ titulo: "Cómo leer esta pantalla", sub: "Qué significa cada número y cómo usarlo", body });
}

// ---------- Hoja de detalle del partido ----------
function bloqueEquipo(nombre, ctx, serie, anota, recibe) {
  if (!Array.isArray(serie) || serie.length === 0) {
    return `<div class="blk team-blk"><div class="cab"><b>${esc(nombre)}</b></div><div class="sub">${esc(ctx)}. Sin detalle guardado para este partido (se llena en los análisis nuevos).</div></div>`;
  }
  const tot = serie.map((x) => x.total);
  const over = tot.filter((t) => t >= 3).length;
  const filas = serie.map((x) => `<div class="gm"><span>${esc(x.rival)}<br><small style="color:${C.apagado};font-size:12px">${fechaCorta(x.fecha)}</small></span><span class="r">${x.favor} - ${x.contra}</span><span class="r">${x.total}</span><span class="ov ${x.total >= 3 ? "o" : "u"}">${x.total >= 3 ? "Over" : "Under"}</span></div>`).join("");
  const grafica = tot.length >= 2 ? graficaSplit(tot, 2.5, { W: 350, H: 120, lo: 0, hi: Math.max(8, ...tot) + 1, yt: [0, 2.5, 5, 8], padr: 40, xl: [[0, "más antiguo"], [tot.length - 1, "último"]], aria: `Goles totales de ${nombre}` }) : "";
  return `<div class="blk team-blk"><div class="cab"><b>${esc(nombre)}</b><span>${over} de ${tot.length} Over</span></div>
    <div class="sub">${esc(ctx)}. Anota ${fmt(anota, 2)} y recibe ${fmt(recibe, 2)} en promedio.</div>
    ${grafica}
    <div class="gm h"><span>Rival</span><span class="r">Marcador</span><span class="r">Goles</span><span class="r">Resultado</span></div>${filas}</div>`;
}

function abrirPartido(id) {
  const p = picksDia.find((x) => x.id === id);
  if (!p) return;
  const [loc, vis] = equipos(p);
  const equil = 100 / Number(p.cuota);
  const triple = p.cumple_filtro_triple === true;

  // condiciones del filtro triple. El % historico de la TABLA DE CUOTA no se guarda por
  // separado: solo se conoce si la regla que decidio el nivel fue la de cuota.
  const cProb = p.probabilidad * 100 >= 60;
  const cGoles = p.goles_esperados !== null && p.goles_esperados !== undefined ? p.goles_esperados > 3.0 : null;
  let cCuota = null, vCuota = "--";
  if (triple) { cCuota = true; vCuota = p.regla_tipo === "cuota" ? fmt(p.regla_pct) + "%" : "mín. 60%"; }
  else if (p.regla_tipo === "cuota") { cCuota = p.regla_pct >= 60; vCuota = fmt(p.regla_pct) + "%"; }
  const chk = (ok, txt, val) => `<div class="chk"><i>${ok === null ? ICO_NA : ok ? ICO_CHECK : ICO_NO}</i><span>${txt}</span><b>${val}</b></div>`;
  const nCumple = [cProb, cGoles, cCuota].filter((x) => x === true).length;

  const body = `
    <h3 class="h3">Lo que decide el método</h3>
    <div class="blk">
      <div class="metrics" style="margin-top:0">
        <div class="cell"><small>Probabilidad</small><strong>${fmt(p.probabilidad * 100)}%</strong></div>
        <div class="cell"><small>Cuota Over 2.5</small><strong>${fmt(p.cuota, 2)}</strong></div>
        <div class="cell"><small>Equilibrio</small><strong>${fmt(equil)}%</strong></div>
        <div class="cell"><small>Goles esperados</small><strong>${p.goles_esperados !== null && p.goles_esperados !== undefined ? fmt(p.goles_esperados, 2) : "--"}</strong></div>
      </div>
      <p class="note">El equilibrio es el acierto mínimo que exige esta cuota para no perder dinero (1 dividido entre la cuota).</p>
      <div style="margin-top:12px">
        <div class="row"><span>Regla que decidió el nivel</span><b>${p.regla_tipo === "cuota" ? "Tabla de cuota" : p.regla_tipo === "confianza" ? "Tabla de confianza" : "--"}</b></div>
        <div class="row"><span>Acierto histórico de esa regla</span><b>${p.regla_pct !== null && p.regla_pct !== undefined ? fmt(p.regla_pct) + "%" : "--"}, N ${p.regla_n !== null && p.regla_n !== undefined ? p.regla_n : "--"}</b></div>
        <div class="row"><span>Valor vs mercado</span><b class="${claseSigno(p.valor_vs_mercado)}">${p.valor_vs_mercado !== null && p.valor_vs_mercado !== undefined ? signo(p.valor_vs_mercado * 100) + " pp" : "--"}</b></div>
        <div class="row"><span>Goles esperados contra la mediana de la liga</span><b>${p.goles_esperados !== null && p.goles_esperados !== undefined ? fmt(p.goles_esperados, 2) : "--"} contra ${p.mediana_goles_liga !== null && p.mediana_goles_liga !== undefined ? fmt(p.mediana_goles_liga, 2) : "--"}</b></div>
      </div>
    </div>
    <h3 class="h3">Filtro triple<small>${triple ? "cumple" : `${nCumple} de 3 condiciones comprobables`}</small></h3>
    <div class="blk">
      ${chk(cProb, "Probabilidad del modelo, mínimo 60%", fmt(p.probabilidad * 100) + "%")}
      ${chk(cCuota, "Histórico de la tabla de cuota, mínimo 60%", vCuota)}
      ${chk(cGoles, "Goles esperados, más de 3.0", p.goles_esperados !== null && p.goles_esperados !== undefined ? fmt(p.goles_esperados, 2) : "--")}
    </div>
    <h3 class="h3">Contexto<small>no decide, solo informa</small></h3>
    ${bloqueEquipo(loc, "Como local", p.ultimos_local, p.forma_local_anota, p.forma_local_recibe)}
    ${bloqueEquipo(vis, "Como visitante", p.ultimos_visita, p.forma_visita_anota, p.forma_visita_recibe)}
    <h3 class="h3">Enfrentamientos directos</h3>
    <div class="blk">${Array.isArray(p.h2h) && p.h2h.length ? `<div class="gm h"><span>Partido</span><span class="r">Marcador</span><span class="r">Goles</span><span class="r">Resultado</span></div>` + p.h2h.map((x) => `<div class="gm"><span>${fechaCorta(x.fecha)}<br><small style="color:${C.apagado};font-size:12px">${esc(x.local)} vs ${esc(x.visita)}</small></span><span class="r">${x.goles_local} - ${x.goles_visita}</span><span class="r">${x.total}</span><span class="ov ${x.total >= 3 ? "o" : "u"}">${x.total >= 3 ? "Over" : "Under"}</span></div>`).join("") : '<div class="vacio" style="margin:0">Sin enfrentamientos directos registrados.</div>'}</div>
    <h3 class="h3">Mercado</h3>
    <div class="blk"><div class="row" style="border-top:0"><span>BTTS del mercado (justo)</span><b>${p.btts_mercado_pct !== null && p.btts_mercado_pct !== undefined ? fmt(p.btts_mercado_pct) + "%" : "--"}</b></div>
      <div class="row"><span>Margen del mercado</span><b>${p.vig_mercado_pct !== null && p.vig_mercado_pct !== undefined ? fmt(p.vig_mercado_pct) + "%" : "--"}</b></div></div>`;

  const footer = () => `<div id="sh-foot-btn">${botonAgregarHoja(p)}</div>`;
  abrirSheet({
    titulo: p.partido, sub: `${p.liga_nombre}, ${horaCol(p.fecha_partido)}`,
    tagsHtml: tagNivel(p.nivel) + (triple ? TAG_TRIPLE : ""), body, footer: footer(),
  });
  enlazarBotonHoja(p);
}

function botonAgregarHoja(p) {
  if (miCombDia) return estaEnMiCombinada(p) ? '<button class="btn" disabled>En mi combinada</button>' : '<button class="btn" disabled>Ya confirmaste tu combinada de este día</button>';
  if (yaEmpezo(p)) return '<button class="btn" disabled>El partido ya empezó</button>';
  if (seleccion.some((x) => x.id === p.id)) return '<button class="btn2" style="margin-top:0" data-add-hoja="' + p.id + '">Quitar de mi combinada</button>';
  if (seleccion.length >= 2) return '<button class="btn" disabled>Ya tienes 2 patas, quita una primero</button>';
  return '<button class="btn" data-add-hoja="' + p.id + '">Agregar a mi combinada</button>';
}
function enlazarBotonHoja(p) {
  const b = document.querySelector("[data-add-hoja]");
  if (!b) return;
  b.addEventListener("click", () => {
    alternarSeleccion(p.id);
    const cont = $("sh-foot-btn");
    if (cont) { cont.innerHTML = botonAgregarHoja(p); enlazarBotonHoja(p); }
  });
}

// ================== BOTON ANALIZAR AHORA ==================
let pollingAnalisis = null;
function bindAnalizar() {
  const btn = $("btn-analizar"), msg = $("analizar-mensaje");
  if (!btn) return;
  if (pollingAnalisis) { btn.disabled = true; btn.textContent = "Analizando..."; }
  btn.addEventListener("click", async () => {
    if (pollingAnalisis) clearInterval(pollingAnalisis);
    btn.disabled = true; btn.textContent = "Iniciando..."; msg.textContent = "";
    const { data, error } = await supabaseClient.functions.invoke("run-analysis");
    if (error || (data && data.ok === false)) {
      btn.disabled = false; btn.textContent = "Analizar ahora";
      msg.textContent = "Error al iniciar. Intenta de nuevo.";
      return;
    }
    const momentoClick = new Date().toISOString();
    let intentos = 0;
    const maxIntentos = 20; // 20 x 15 s = 5 minutos
    btn.textContent = "Analizando...";
    msg.textContent = "Análisis en curso. La pantalla se actualiza sola cuando termine.";
    pollingAnalisis = setInterval(async () => {
      intentos++;
      const { data: nuevos } = await supabaseClient.from("picks").select("id").gt("actualizado_en", momentoClick).limit(1);
      const yaTermino = nuevos && nuevos.length > 0;
      const b2 = $("btn-analizar"), m2 = $("analizar-mensaje");
      if (yaTermino || intentos >= maxIntentos) {
        clearInterval(pollingAnalisis); pollingAnalisis = null;
        if (b2) { b2.disabled = false; b2.textContent = "Analizar ahora"; }
        if (vistaActual === "hoy" || vistaActual === "manana") {
          await cargarDia(diaOffset);
          const m3 = $("analizar-mensaje");
          if (m3) m3.textContent = yaTermino ? "Listo. Partidos actualizados." : "Sigue tardando más de lo normal. Entra en un rato y vuelve a revisar.";
        }
      } else if (m2) {
        m2.textContent = `Analizando... (${intentos}/${maxIntentos})`;
      }
    }, 15000);
  });
}

// ================== RESULTADOS ==================
// Muestra HOY (se va llenando a medida que FootyStats publica cada resultado) y los
// ultimos 4 dias. La pantalla se refresca sola cada minuto mientras esta abierta en "Hoy".
let datosResultadosPorDia = {};
let combMetodoRes = {};
let combValorRes = {};
let miCombRes = {};
let diaResultadoActivo = null;
let resultadosTimer = null;
let resultadosActualizado = null;
const REFRESCO_RESULTADOS_MS = 60 * 1000;

function detenerRefrescoResultados() {
  if (resultadosTimer) { clearInterval(resultadosTimer); resultadosTimer = null; }
}

async function cargarResultados(silencioso) {
  const hoy = hoyISO(0);
  if (!silencioso) {
    vistaEl.innerHTML = titulo("Resultados", "Hoy y los últimos 4 días", false) + '<div class="cargando">Cargando...</div>';
    builderSlot.innerHTML = "";
  }
  const desde = hoyISO(-4);
  const [pk, cm, mc, cv] = await Promise.all([
    supabaseClient.from("picks").select("*").gte("fecha_partido", desde + "T00:00:00-05:00").lte("fecha_partido", hoy + "T23:59:59-05:00").order("fecha_partido", { ascending: true }),
    supabaseClient.from("combinada_dia").select("*").gte("fecha", desde),
    supabaseClient.from("mi_combinada").select("*").gte("fecha", desde),
    supabaseClient.from("combinada_valor").select("*").gte("fecha", desde),
  ]);
  if (vistaActual !== "resultados") return;
  if (pk.error) {
    if (!silencioso) vistaEl.innerHTML = titulo("Resultados", "Hoy y los últimos 4 días", false) + `<div class="vacio">Error leyendo resultados: ${esc(pk.error.message)}</div>`;
    return;
  }

  datosResultadosPorDia = {};
  (pk.data || []).filter(esSenal).forEach((p) => {
    const k = fechaColombia(p.fecha_partido);
    (datosResultadosPorDia[k] = datosResultadosPorDia[k] || []).push(p);
  });
  combMetodoRes = {}; miCombRes = {};
  (cm.data || []).forEach((c) => { if (!c.mensaje && c.picks) combMetodoRes[c.fecha] = c; });
  (mc.data || []).forEach((c) => { miCombRes[c.fecha] = c; });
  combValorRes = {};
  (cv.data || []).forEach((c) => { combValorRes[c.fecha] = c; });
  resultadosActualizado = new Date();

  // al entrar se abre "Hoy"; en un refresco silencioso se respeta el dia que el usuario eligio
  if (!silencioso || !diaResultadoActivo) diaResultadoActivo = hoy;
  renderResultados();

  if (!resultadosTimer) {
    resultadosTimer = setInterval(() => {
      if (vistaActual === "resultados" && diaResultadoActivo === hoyISO(0) && !sheetRoot.innerHTML) cargarResultados(true);
    }, REFRESCO_RESULTADOS_MS);
  }
}

function resultadoPata(liga_id, partido, fecha) {
  const lista = datosResultadosPorDia[fecha] || [];
  const p = lista.find((x) => x.liga_id === liga_id && x.partido === partido);
  return p ? p.resultado : null;
}
function tagPata(r) { return r === true ? '<span class="tag t-gain">Acertó</span>' : r === false ? '<span class="tag t-loss">Falló</span>' : '<span class="tag t-muted">Pendiente</span>'; }
function tagCombinada(rs) {
  if (rs.some((r) => r === false)) return '<span class="tag t-loss">Falló</span>';
  if (rs.length && rs.every((r) => r === true)) return '<span class="tag t-gain">Ganó</span>';
  return '<span class="tag t-muted">Pendiente</span>';
}

function diasDeResultados() {
  const hoy = hoyISO(0);
  const dias = [];
  for (let i = -4; i <= 0; i++) {
    const d = hoyISO(i);
    const lista = datosResultadosPorDia[d] || [];
    if (d === hoy || lista.some((p) => p.resultado !== null)) dias.push(d); // hoy siempre aparece
  }
  return dias; // del mas antiguo al mas reciente: Hoy queda al final (a la derecha)
}

function renderResultados() {
  const hoy = hoyISO(0);
  const esHoy = diaResultadoActivo === hoy;
  const sub = esHoy && resultadosActualizado ? `Actualizado ${resultadosActualizado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" })}, se refresca solo cada minuto` : "Hoy y los últimos 4 días";
  let html = titulo("Resultados", sub, false);

  const dias = diasDeResultados();
  html += '<div class="days">' + dias.map((d) => {
    const lista = datosResultadosPorDia[d] || [];
    const ver = lista.filter((p) => p.resultado !== null);
    const ac = ver.filter((p) => p.resultado === true).length;
    let detalle;
    if (ver.length) detalle = `${ac} de ${ver.length}`;
    else if (lista.length) detalle = `${lista.length} pend.`;
    else detalle = "sin partidos";
    return `<button class="day${d === diaResultadoActivo ? " on" : ""}" data-dia="${d}">${d === hoy ? "Hoy" : etiquetaDiaCorta(d)}<small>${detalle}</small></button>`;
  }).join("") + "</div>";

  const d = diaResultadoActivo;
  const lista = datosResultadosPorDia[d] || [];
  const picks = esHoy ? lista : lista.filter((p) => p.resultado !== null);
  const ver = picks.filter((p) => p.resultado !== null);
  const pend = picks.length - ver.length;
  const ac = ver.filter((p) => p.resultado === true).length;

  // combinadas del dia: metodo y mi criterio
  const cm = combMetodoRes[d], mc = miCombRes[d], cvd = combValorRes[d];
  const bloque = (nombre, patas, cuota, nota) => {
    const rs = patas.map((x) => resultadoPata(x.liga_id, x.partido, d));
    return `<div class="legs resumen"><b style="font-weight:600">${nombre}</b><span>cuota ${fmt(cuota, 2)}${nota ? " " + nota : ""} ${tagCombinada(rs)}</span></div>` +
      patas.map((x, i) => `<div class="legs"><span>${esc(x.partido)}</span>${tagPata(rs[i])}</div>`).join("");
  };
  html += `<div class="sec"><h2>Combinadas del día</h2><span>${esc(etiquetaDiaLarga(d))}</span></div><div class="card">` +
    (cm ? bloque("Método", cm.picks || [], cm.cuota_total) : `<div class="legs resumen"><b style="font-weight:600">Método</b><span>sin combinada ese día</span></div>`) +
    (cvd ? bloque("Por valor", cvd.picks || [], cvd.cuota_total) : `<div class="legs resumen"><b style="font-weight:600">Por valor</b><span>sin pareja de valor ese día</span></div>`) +
    (mc ? bloque("Mi criterio", (mc.patas || []).map((x) => ({ liga_id: x.liga_id, partido: x.partido })), mc.cuota_real_total || mc.cuota_total, mc.cuota_real_total ? "(real)" : "") : `<div class="legs resumen"><b style="font-weight:600">Mi criterio</b><span>sin apuesta confirmada</span></div>`) +
    "</div>";

  const resumenTxt = esHoy
    ? (picks.length ? `${ac} de ${ver.length} acertado${ver.length === 1 ? "" : "s"}, ${pend} pendiente${pend === 1 ? "" : "s"}` : "")
    : `${ac} de ${picks.length} acertado${ac === 1 ? "" : "s"}`;
  html += `<div class="sec"><h2>Partidos con señal</h2><span>${resumenTxt}</span></div>`;

  if (!picks.length) {
    html += `<div class="vacio">${esHoy ? "Hoy no hay partidos con señal." : "No hay partidos con señal verificados este día."}</div>`;
  }

  const porLiga = {};
  picks.forEach((p) => { (porLiga[p.liga_nombre] = porLiga[p.liga_nombre] || []).push(p); });
  Object.keys(porLiga).sort().forEach((liga) => {
    html += `<div class="band">${esc(liga)}</div>`;
    porLiga[liga].forEach((p) => {
      const triple = p.cumple_filtro_triple === true;
      const [loc, vis] = equipos(p);
      const pendiente = p.resultado === null || p.resultado === undefined;
      const tiene = p.goles_local_final !== null && p.goles_local_final !== undefined;
      const porJugar = new Date(p.fecha_partido).getTime() > Date.now();
      const etiqueta = pendiente ? '<span class="tag t-muted" style="margin-left:auto">Pendiente</span>'
        : `<span class="tag ${p.resultado ? "t-gain" : "t-loss"}" style="margin-left:auto">${p.resultado ? "Acertó" : "Falló"}</span>`;
      html += `<div class="match${triple ? " triple" : ""}" style="cursor:default">
        <div class="tags">${tagNivel(p.nivel)}${triple ? TAG_TRIPLE : ""}${etiqueta}</div>
        <div class="res-top"><div class="teams"><b style="font-size:15px;line-height:20px">${esc(loc)}<br>${esc(vis)}</b></div><span class="score">${tiene ? p.goles_local_final + " - " + p.goles_visita_final : "--"}</span></div>
        <div class="kvs"><div>Mercado</div><div class="r">Over 2.5</div><div>Cuota</div><div class="r">${fmt(p.cuota, 2)}</div>
          ${pendiente ? `<div>Estado</div><div class="r">${porJugar ? "Empieza " + horaCol(p.fecha_partido) : "Esperando resultado"}</div>` : `<div>Goles totales</div><div class="r">${tiene ? p.goles_local_final + p.goles_visita_final : "--"}</div>`}</div>
      </div>`;
    });
  });
  html += `<div class="foot">Solo se muestran partidos con señal. Un resultado aislado no cambia las reglas: se evalúa el acumulado.</div>`;
  vistaEl.innerHTML = html;

  // dejar visible el dia elegido dentro de la fila de dias
  const fila = vistaEl.querySelector(".days"), activo = vistaEl.querySelector(".day.on");
  if (fila && activo) fila.scrollLeft = activo.offsetLeft - fila.clientWidth / 2 + activo.clientWidth / 2;
}

// ================== ESTADISTICAS ==================
let filtroDias = "todos"; // "todos" | "finde"
let statsData = null;

async function traerTodos(construir) {
  let todo = [], desde = 0;
  for (;;) {
    const { data, error } = await construir().range(desde, desde + 999);
    if (error) return { error };
    todo = todo.concat(data || []);
    if (!data || data.length < 1000) break;
    desde += 1000;
  }
  return { data: todo };
}

async function cargarEstadisticas() {
  builderSlot.innerHTML = "";
  vistaEl.innerHTML = titulo("Estadísticas", "Cargando...", false) + '<div class="cargando">Cargando...</div>';
  const [pk, cm, mc, cv] = await Promise.all([
    traerTodos(() => supabaseClient.from("picks").select("id, liga_id, liga_nombre, partido, nivel, resultado, fecha_partido, probabilidad, cuota, valor_vs_mercado, cumple_filtro_triple, goles_local_final, goles_visita_final").not("resultado", "is", null).order("fecha_partido", { ascending: true })),
    supabaseClient.from("combinada_resultados").select("fecha, resultado_combinada, cuota_total"),
    supabaseClient.from("mi_combinada_resultados").select("fecha, resultado_combinada, cuota_total, confirmada_en, cuota_real_total, casa"),
    supabaseClient.from("combinada_valor_resultados").select("fecha, resultado_combinada, cuota_total"),
  ]);
  if (vistaActual !== "stats") return;
  if (pk.error) { vistaEl.innerHTML = titulo("Estadísticas", "", false) + `<div class="vacio">Error: ${esc(pk.error.message)}</div>`; return; }
  statsData = { picks: (pk.data || []).filter(esSenal), metodo: cm.error ? [] : cm.data || [], mias: mc.error ? [] : mc.data || [], valor: cv.error ? [] : cv.data || [] };
  renderEstadisticas();
}

function aplicaFiltro(fechaStr) { return filtroDias === "todos" || esFinDeSemana(fechaStr); }
function picksFiltrados() { return statsData.picks.filter((p) => aplicaFiltro(fechaColombia(p.fecha_partido))); }

function unidadesComb(filas) {
  const ver = filas.filter((f) => f.resultado_combinada !== "PENDIENTE");
  const u = ver.reduce((s, f) => s + (f.resultado_combinada === "GANO_COMPLETA" ? Number(f.cuota_real_total || f.cuota_total) - 1 : -1), 0);
  return { ver: ver.length, u, roi: ver.length ? (100 * u) / ver.length : null, ganadas: ver.filter((f) => f.resultado_combinada === "GANO_COMPLETA").length };
}

function seriesAcumuladas(filas, fechas) {
  // rendimiento acumulado (en unidades) de las combinadas ya verificadas, una por dia
  const ver = filas.filter((f) => f.resultado_combinada !== "PENDIENTE").sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acum = 0;
  return ver.map((f) => { acum += f.resultado_combinada === "GANO_COMPLETA" ? Number(f.cuota_real_total || f.cuota_total) - 1 : -1; return { x: fechas.indexOf(f.fecha), y: acum }; });
}

function renderEstadisticas() {
  const todosPicks = picksFiltrados();
  const hoy = hoyISO(0);
  let html = titulo("Estadísticas", `${todosPicks.length} picks verificados`, false);

  html += `<div class="seg"><button data-filtro="todos" class="${filtroDias === "todos" ? "on" : ""}">Todos los días</button><button data-filtro="finde" class="${filtroDias === "finde" ? "on" : ""}">Vie, sáb y dom</button></div>
    <p class="ill" style="padding-top:8px">El método se mide todos los días. El filtro "Vie, sáb y dom" muestra solo los días en que apuestas.</p>`;

  if (!todosPicks.length) {
    vistaEl.innerHTML = html + '<div class="vacio">No hay picks verificados con este filtro todavía.</div>';
    return;
  }

  // ---------- Resumen ----------
  const gen = resumen(todosPicks);
  const roiG = rendimiento(todosPicks);
  html += `<div class="sec" style="padding-bottom:10px"><h2>Resumen</h2><span>picks con señal verificados</span></div>
    <div class="g3"><div><small>Acierto</small><b>${fmt(gen.pct)}%</b></div><div><small>Rendimiento</small><b class="${claseSigno(roiG)}">${signo(roiG)}%</b></div><div><small>Cuota prom.</small><b>${fmt(cuotaProm(todosPicks), 2)}</b></div></div>
    <p class="note note-pad">${gen.aciertos} de ${gen.total} picks acertados. Rendimiento: ${signo(unidades(todosPicks), 2)} unidades apostando 1 a cada pick.</p>`;

  // ---------- Metodo, combinada por valor y mi criterio ----------
  const mias = statsData.mias.filter((f) => aplicaFiltro(f.fecha));
  const diasMios = new Set(mias.map((f) => f.fecha));
  let metodo = statsData.metodo.filter((f) => aplicaFiltro(f.fecha));
  let valorC = statsData.valor.filter((f) => aplicaFiltro(f.fecha));
  if (mias.length) { metodo = metodo.filter((f) => diasMios.has(f.fecha)); valorC = valorC.filter((f) => diasMios.has(f.fecha)); } // solo los dias en que existen las tres
  const uM = unidadesComb(metodo), uY = unidadesComb(mias), uV = unidadesComb(valorC);
  const enDias = todosPicks.filter((p) => diasMios.has(fechaColombia(p.fecha_partido)));
  const lista = resumen(enDias);
  html += `<div class="sec"><h2>Método, valor y mi criterio</h2><span>combinadas de 2 patas</span></div>`;
  if (Math.max(uM.ver, uV.ver, uY.ver) >= 2) {
    const fechas = [...new Set(metodo.concat(mias, valorC).filter((f) => f.resultado_combinada !== "PENDIENTE").map((f) => f.fecha))].sort();
    html += `<div class="chart-wrap">${graficaLineas([
      { name: "Método", color: C.gris, pts: seriesAcumuladas(metodo, fechas) },
      { name: "Por valor", color: C.apagado, dash: "5 3", pts: seriesAcumuladas(valorC, fechas) },
      { name: "Mi criterio", color: C.tinta, w: 2.5, pts: seriesAcumuladas(mias, fechas) },
    ], fechas.length, { xl: fechas.length > 1 ? [[0, fechaMini(fechas[0])], [fechas.length - 1, fechaMini(fechas[fechas.length - 1])]] : [] })}</div>
    <div class="lleg">
      <span><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="${C.tinta}" stroke-width="2.5"/></svg> Mi criterio</span>
      <span><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="${C.apagado}" stroke-width="2" stroke-dasharray="5 3"/></svg> Por valor</span>
      <span><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="${C.gris}" stroke-width="2"/></svg> Método</span></div>
    <p class="ill" style="padding-top:2px">Unidades acumuladas apostando 1 a cada combinada ya verificada.</p>`;
  } else {
    html += `<div class="vacio">Hace falta al menos 2 combinadas verificadas para dibujar la gráfica.${mias.length ? "" : "<br>Cuando confirmes tus combinadas, tu línea aparece junto a las otras dos."}</div>`;
  }
  const fila = (n, ncomb, ganadas, roi) => `<div class="tb c4c"><b style="font-weight:600">${n}</b><span class="r n">${ncomb}</span><span class="r">${ganadas}</span><span class="r ${claseSigno(roi)}">${roi === null ? "--" : signo(roi) + "%"}</span></div>`;
  const mism = mias.length ? " (mismos días)" : "";
  html += `<div style="padding-top:12px"><div class="tb h c4c"><span></span><span class="r">Combinadas</span><span class="r">Ganadas</span><span class="r">Rendim.</span></div>
    ${fila("Método" + mism, metodo.length, uM.ver ? uM.ganadas : "--", uM.roi)}
    ${fila("Por valor" + mism, valorC.length, uV.ver ? uV.ganadas : "--", uV.roi)}
    ${fila("Mi criterio", mias.length, uY.ver ? uY.ganadas : "--", uY.roi)}
    <div class="tb c4c"><span>Promedio de la lista</span><span class="r n">${mias.length ? enDias.length + " picks" : "--"}</span><span class="r n">${mias.length ? fmt(lista.pct) + "%" : "--"}</span><span class="r n">--</span></div></div>
    <p class="note note-pad">Combinadas y rendimiento cuentan solo las ya verificadas. Mi criterio usa la cuota real que pusiste al confirmar (si la dejaste vacía, la de referencia). El promedio de la lista es el acierto por pata de todos los picks del método en esos días: sirve para saber si escoger tú aporta algo sobre escoger al azar dentro de lo que el método ya filtró.</p>`;

  // ---------- Valor vs mercado, en vivo ----------
  const conV = todosPicks.filter((p) => p.valor_vs_mercado !== null && p.valor_vs_mercado !== undefined);
  html += `<div class="sec"><h2>Valor vs mercado</h2><span>${conV.length} picks con dato</span></div>
    <div class="tb h c5v"><span>Grupo</span><span class="r">Picks</span><span class="r">Acierto</span><span class="r">Ventaja</span><span class="r">Rend.</span></div>`;
  const gruposV = [
    ["Valor > 0", (p) => esValorPositivo(p)], ["Valor ≤ 0", (p) => !esValorPositivo(p)],
    ["Triple y valor > 0", (p) => p.cumple_filtro_triple === true && esValorPositivo(p)], ["Triple y valor ≤ 0", (p) => p.cumple_filtro_triple === true && !esValorPositivo(p)],
    ["Sin triple y valor > 0", (p) => p.cumple_filtro_triple === false && esValorPositivo(p)], ["Sin triple y valor ≤ 0", (p) => p.cumple_filtro_triple === false && !esValorPositivo(p)],
  ];
  gruposV.forEach(([n, f], i) => {
    const g = conV.filter(f), r = resumen(g), roi = rendimiento(g), v = ventajaPP(g), chica = g.length < MIN_PICKS_LIGA;
    html += `<div class="tb c5v${chica ? " mut" : ""}${i === 2 ? " sep" : ""}"><span>${n}</span><span class="r n">${g.length}</span><span class="r">${r.pct === null ? "--" : fmt(r.pct) + "%"}</span><span class="r ${chica ? "" : claseSigno(v)}">${v === null ? "--" : signo(v) + " pp"}</span><span class="r ${chica ? "" : claseSigno(roi)}">${roi === null ? "--" : signo(roi) + "%"}</span></div>`;
  });
  html += `<p class="note note-pad" style="margin-top:10px">Ventaja: acierto menos la probabilidad que implica la cuota. Si es positiva, el grupo acierta más de lo que la cuota exige. Referencia del backtest sin fuga de datos (3 años, 12 ligas): valor > 0 rindió +4.7% con 1.075 picks; valor ≤ 0, entre -3% y -8%. Aquí la muestra en vivo todavía es chica: gris es menos de ${MIN_PICKS_LIGA} picks.</p>`;

  // ---------- Rendimiento por cuota ----------
  const rangos = [["Menos de 1.30", 0, 1.3], ["1.30 a 1.40", 1.3, 1.4], ["1.40 a 1.50", 1.4, 1.5], ["1.50 a 1.70", 1.5, 1.7], ["1.70 o más", 1.7, 99]];
  html += `<div class="sec"><h2>Rendimiento por cuota</h2><span>picks con señal</span></div>
    <div class="tb h c5"><span>Rango</span><span class="r">Picks</span><span class="r">Acierto</span><span class="r">Equilibrio</span><span class="r">Rend.</span></div>`;
  rangos.forEach(([n, a, b]) => {
    const f = todosPicks.filter((p) => Number(p.cuota) >= a && Number(p.cuota) < b);
    const r = resumen(f), roi = rendimiento(f), cp = cuotaProm(f);
    const chica = f.length < MIN_PICKS_LIGA;
    html += `<div class="tb c5${chica ? " mut" : ""}"><span>${n}</span><span class="r n">${f.length}</span><span class="r">${r.pct === null ? "--" : fmt(r.pct) + "%"}</span><span class="r n">${cp ? fmt(100 / cp) + "%" : "--"}</span><span class="r ${chica ? "" : claseSigno(roi)}">${roi === null ? "--" : signo(roi) + "%"}</span></div>`;
  });
  html += `<p class="note note-pad" style="margin-top:10px">Gris: menos de ${MIN_PICKS_LIGA} picks, no se interpreta. Equilibrio: acierto mínimo para no perder con esa cuota.</p>`;

  // ---------- Ranking del dia ----------
  const porDia = {};
  todosPicks.forEach((p) => { (porDia[fechaColombia(p.fecha_partido)] = porDia[fechaColombia(p.fecha_partido)] || []).push(p); });
  const top = [], resto = [];
  Object.values(porDia).forEach((arr) => { arr.slice().sort((a, b) => b.probabilidad - a.probabilidad).forEach((p, i) => (i < 2 ? top : resto).push(p)); });
  html += `<div class="sec"><h2>Ranking del día</h2><span>por probabilidad</span></div>
    <div class="tb h c5r"><span>Grupo</span><span class="r">Picks</span><span class="r">Acierto</span><span class="r">Cuota</span><span class="r">Rend.</span></div>`;
  [["Top 2 del día", top], ["Resto", resto]].forEach(([n, f]) => {
    const r = resumen(f), roi = rendimiento(f);
    html += `<div class="tb c5r"><span>${n}</span><span class="r n">${f.length}</span><span class="r">${r.pct === null ? "--" : fmt(r.pct) + "%"}</span><span class="r n">${f.length ? fmt(cuotaProm(f), 2) : "--"}</span><span class="r ${claseSigno(roi)}">${roi === null ? "--" : signo(roi) + "%"}</span></div>`;
  });
  html += `<p class="note note-pad" style="margin-top:10px">Mide si los 2 picks de mayor probabilidad de cada día aciertan más. Su cuota es más baja, por eso se compara también el rendimiento.</p>`;

  // ---------- Por nivel ----------
  html += `<div class="sec"><h2>Por nivel</h2><span>${todosPicks.length} picks</span></div>
    <div class="tb h c4n"><span>Nivel</span><span class="r">Picks</span><span class="r">Acierto</span><span class="r">Rend.</span></div>`;
  NIVELES_SENAL.forEach((niv) => {
    const f = todosPicks.filter((p) => p.nivel === niv);
    if (!f.length) return;
    const r = resumen(f), roi = rendimiento(f);
    html += `<div class="tb c4n"><span>${tagNivel(niv)}</span><span class="r n">${f.length}</span><span class="r">${fmt(r.pct)}%</span><span class="r ${claseSigno(roi)}">${signo(roi)}%</span></div>`;
  });
  html += `<p class="note note-pad" style="margin-top:10px">Confiable debería acertar más que En el radar. Si la diferencia es chica con esta muestra, es una señal para vigilar, no una conclusión.</p>`;

  // ---------- Por liga (filas estilo bolsa) ----------
  const porLiga = {};
  todosPicks.forEach((p) => { (porLiga[p.liga_id] = porLiga[p.liga_id] || { nombre: p.liga_nombre, filas: [] }).filas.push(p); });
  const ligas = Object.keys(porLiga).map((id) => ({ id, nombre: porLiga[id].nombre, filas: porLiga[id].filas, r: resumen(porLiga[id].filas) })).sort((a, b) => b.r.pct - a.r.pct);
  html += `<div class="sec"><h2>Por liga</h2><span>diferencia contra el promedio general</span></div>
    <p class="ill" style="padding-top:0;padding-bottom:10px">Toca una liga para abrir su análisis completo. La línea muestra el acierto acumulado, pick a pick.</p><div class="lista-ligas">`;
  ligas.forEach((l) => {
    const chica = l.r.total < MIN_PICKS_LIGA;
    const d = l.r.pct - gen.pct;
    let acum = 0;
    const serie = l.filas.map((p, i) => { acum += p.resultado ? 1 : 0; return (100 * acum) / (i + 1); }).slice(-12);
    const spark = serie.length >= 2 ? graficaSplit(serie, gen.pct, { W: 92, H: 40, margen: 5, minSpan: 30, aria: `Acierto acumulado de ${l.nombre}` }) : "<span></span>";
    const nombre = l.nombre.replace(/^[^-]+ - /, "");
    const pais = (l.nombre.match(/^([^-]+) - /) || [])[1] || "";
    html += `<button class="lg${chica ? " chica" : ""}" data-liga="${esc(l.id)}"><div class="nm"><b>${esc(nombre)}</b><small>${esc(pais)}${pais ? ", " : ""}${l.r.aciertos} de ${l.r.total} picks</small></div>${spark}<div class="pc"><b>${fmt(l.r.pct)}%</b><span class="bd ${chica ? "n" : d >= 0 ? "g" : "r"}">${signo(d)} pp</span></div></button>`;
  });
  html += `</div><p class="note note-pad" style="margin-top:10px">Gris: menos de ${MIN_PICKS_LIGA} picks, no se interpreta.</p>`;

  // ---------- Evolucion semanal ----------
  const semanas = {};
  todosPicks.forEach((p) => { const k = lunesDe(fechaColombia(p.fecha_partido)); (semanas[k] = semanas[k] || []).push(p); });
  const lunesHoy = lunesDe(hoy);
  const sem = Object.keys(semanas).filter((k) => k < lunesHoy && semanas[k].length >= 5).sort();
  html += `<div class="sec"><h2>Evolución semanal</h2><span>semana en curso excluida</span></div>`;
  if (sem.length >= 2) {
    const vals = sem.map((k) => resumen(semanas[k]).pct);
    html += `<div class="chart-wrap">${graficaSplit(vals, gen.pct, { W: 350, H: 140, lo: 0, hi: 100, yt: [0, 50, 100], fmtY: (t) => t + "%", padr: 40, padl: 20, xl: sem.map((k, i) => [i, fechaMini(k)]), aria: "Acierto por semana" })}</div>
      <p class="note note-pad">La línea punteada es el acierto general. Solo semanas con al menos 5 picks.</p>`;
  } else {
    html += `<div class="vacio">Hacen falta al menos 2 semanas completas con 5 picks o más para dibujar la evolución.</div>`;
  }

  // ---------- Combinada del metodo ----------
  const cmAll = statsData.metodo.filter((f) => aplicaFiltro(f.fecha));
  const gan = cmAll.filter((f) => f.resultado_combinada === "GANO_COMPLETA").length;
  const fal = cmAll.filter((f) => f.resultado_combinada === "FALLO").length;
  const pen = cmAll.filter((f) => f.resultado_combinada === "PENDIENTE").length;
  const verC = gan + fal;
  html += `<div class="sec"><h2>Combinada del método</h2><span>${verC} verificada${verC === 1 ? "" : "s"}</span></div>`;
  if (cmAll.length) {
    html += `<div class="kpi"><div class="n">${verC ? fmt((100 * gan) / verC) + "%" : "--"}</div><p><b>${gan} de ${verC}</b> combinadas<br>ganadas completas</p></div>
      <div class="stack">${gan ? `<i style="flex:${gan};background:${C.acierto}"></i>` : ""}${fal ? `<i style="flex:${fal};background:${C.fallo}"></i>` : ""}${pen ? `<i style="flex:${pen};background:${C.grisClaro}"></i>` : ""}</div>
      <div class="leyenda"><span>${gan} ganadas</span><span>${fal} falladas</span><span>${pen} pendientes</span></div>`;
  } else html += '<div class="vacio">Sin combinadas del método con este filtro todavía.</div>';

  // ---------- Filtro triple (se conserva como referencia) ----------
  const conF = todosPicks.filter((p) => p.cumple_filtro_triple === true || p.cumple_filtro_triple === false);
  const gC = conF.filter((p) => p.cumple_filtro_triple === true), gN = conF.filter((p) => p.cumple_filtro_triple === false);
  const cu = resumen(gC), nc = resumen(gN);
  const celda = (g, r) => r.total ? `<strong>${fmt(r.pct)}%</strong><em>${r.aciertos}/${r.total} picks, cuota ${fmt(cuotaProm(g), 2)}</em><em class="${claseSigno(ventajaPP(g))}">Ventaja ${signo(ventajaPP(g))} pp, rend. ${signo(rendimiento(g))}%</em>` : `<strong>--%</strong><em>0 picks verificados</em>`;
  html += `<div class="sec"><h2>Filtro triple</h2><span>${conF.length} picks con dato</span></div>
    <div class="two"><div><small>Cumple el filtro</small>${celda(gC, cu)}</div><div><small>No lo cumple</small>${celda(gN, nc)}</div></div>`;
  if (cu.total < MIN_MUESTRA_SOLIDA || nc.total < MIN_MUESTRA_SOLIDA) html += `<div style="padding:10px 20px 0"><span class="tag t-triple">Muestra chica, no concluyente</span><p class="note">Se considera sólida desde ${MIN_MUESTRA_SOLIDA} picks verificados en cada grupo.</p></div>`;
  html += `<p class="note note-pad">Backtest sin fuga de datos (3 años, 12 ligas, 1.317 picks): acertó 72.1% con un rendimiento de 0.0%. Acierta mucho, pero su cuota ya lo descuenta: sirve para distinguir partidos "seguros", y su efecto es más claro cuando además hay valor positivo.</p>`;

  html += `<div class="foot">Análisis pre-partido. No garantiza resultados.<br>Diseñado y creado por Jose Torres.</div>`;
  vistaEl.innerHTML = html;
}

// ---------- Hoja de liga ----------
let ligaPeriodo = "todo";

async function abrirLiga(ligaId) {
  ligaPeriodo = "todo";
  const filas = picksFiltrados().filter((p) => p.liga_id === ligaId);
  if (!filas.length) return;
  const nombreCompleto = filas[0].liga_nombre;
  abrirSheet({ titulo: nombreCompleto.replace(/^[^-]+ - /, ""), sub: (nombreCompleto.match(/^([^-]+) - /) || [])[1] || "", body: '<div class="cargando">Cargando...</div>' });
  const { data: res } = await supabaseClient.from("liga_resumen").select("*").eq("liga_id", ligaId).maybeSingle();
  if (!$("sh-body")) return; // la cerraron mientras cargaba
  $("sh-body").innerHTML = cuerpoLiga(ligaId, filas, res ? res.resumen : null);
  enlazarPeriodo(ligaId, filas);
}

function filtrarPeriodo(filas) {
  if (ligaPeriodo === "todo") return filas;
  const dias = ligaPeriodo === "1s" ? 7 : 30;
  const corte = hoyISO(-dias);
  return filas.filter((p) => fechaColombia(p.fecha_partido) >= corte);
}

function graficaLigaHtml(filas) {
  const gen = resumen(picksFiltrados());
  const f = filtrarPeriodo(filas);
  if (f.length < 2) return `<div class="vacio">Muy pocos picks en este periodo para dibujar la gráfica.</div>`;
  let ac = 0;
  const serie = f.map((p, i) => { ac += p.resultado ? 1 : 0; return (100 * ac) / (i + 1); });
  const lo = Math.max(0, Math.min(...serie, gen.pct) - 10), hi = Math.min(100, Math.max(...serie, gen.pct) + 10);
  return `<div class="chart-wrap">${graficaSplit(serie, gen.pct, { W: 350, H: 170, lo, hi, yt: [Math.round(lo / 10) * 10, Math.round(gen.pct), Math.round(hi / 10) * 10], fmtY: (t) => t + "%", padr: 44, xl: [[0, "pick 1"], [serie.length - 1, "pick " + serie.length]], aria: "Acierto acumulado de la liga" })}</div>
    <p class="ill" style="padding-top:2px">Acierto acumulado pick a pick. La línea punteada es el acierto general (${fmt(gen.pct)}%).</p>`;
}

function enlazarPeriodo(ligaId, filas) {
  document.querySelectorAll("[data-per]").forEach((b) => b.addEventListener("click", () => {
    ligaPeriodo = b.dataset.per;
    document.querySelectorAll("[data-per]").forEach((x) => x.classList.toggle("on", x === b));
    $("liga-grafica").innerHTML = graficaLigaHtml(filas);
  }));
}

function rachaActual(filas) {
  if (!filas.length) return "--";
  const ult = filas[filas.length - 1].resultado;
  let n = 0;
  for (let i = filas.length - 1; i >= 0 && filas[i].resultado === ult; i--) n++;
  return `${n} ${ult ? (n === 1 ? "acierto" : "aciertos") : (n === 1 ? "fallo" : "fallos")}`;
}

function etiquetaRangoCuota(b, i, total) {
  if (i === 0) return `${fmt(b.max, 2)} o menos`;
  if (i === total - 1) return `${fmt(b.min, 2)} o más`;
  return `${fmt(b.min, 2)} a ${fmt(b.max, 2)}`;
}

function cuerpoLiga(ligaId, filas, res) {
  const todos = picksFiltrados();
  const gen = resumen(todos);
  const r = resumen(filas);
  const d = r.pct - gen.pct;
  const cp = cuotaProm(filas), roi = rendimiento(filas);
  const cu = filas.filter((p) => p.cumple_filtro_triple === true);
  const reglas = (buckets, esCuota) => (buckets || []).map((b, i, arr) =>
    `<div class="tb c4r"><span>${esCuota ? etiquetaRangoCuota(b, i, arr.length) : esc(b.label)}</span><span class="r n">${b.n}</span><span class="r">${fmt(b.pct)}%</span><span class="r">${tagNivel(b.nivel)}</span></div>`).join("");

  return `
    <div class="blk" style="padding-top:12px"><div class="grande"><span class="n">${fmt(r.pct)}%</span><span class="bd ${r.total < MIN_PICKS_LIGA ? "n" : d >= 0 ? "g" : "r"}" style="margin:0">${signo(d)} pp</span></div>
      <div class="note" style="margin-top:2px">${r.aciertos} de ${r.total} picks acertados. El recuadro compara con el promedio general (${fmt(gen.pct)}%).${r.total < MIN_PICKS_LIGA ? " Menos de " + MIN_PICKS_LIGA + " picks: no se interpreta." : ""}</div></div>
    <div class="per"><button data-per="1s" class="">1S</button><button data-per="1m">1M</button><button data-per="todo" class="on">Todo</button></div>
    <div id="liga-grafica" style="padding-top:4px">${graficaLigaHtml(filas)}</div>
    <h3 class="h3" style="padding-top:16px">Datos de la liga</h3>
    <div class="g3">
      <div><small>Picks</small><b>${r.total}</b></div><div><small>Aciertos</small><b>${r.aciertos}</b></div><div><small>Fallos</small><b>${r.fallos}</b></div>
      <div><small>Cuota prom.</small><b>${fmt(cp, 2)}</b></div><div><small>Equilibrio</small><b>${cp ? fmt(100 / cp) + "%" : "--"}</b></div><div><small>Rendimiento</small><b class="${claseSigno(roi)}">${roi === null ? "--" : signo(roi) + "%"}</b></div>
      <div><small>Racha actual</small><b style="font-size:14px">${rachaActual(filas)}</b></div><div><small>Goles esp. mediana</small><b>${res && res.mediana_goles_esperados !== null && res.mediana_goles_esperados !== undefined ? fmt(res.mediana_goles_esperados, 2) : "--"}</b></div><div><small>Filtro triple</small><b style="font-size:14px">${cu.length ? resumen(cu).aciertos + "/" + cu.length : "--"}</b></div>
    </div>
    ${res ? `<h3 class="h3">Historial de la liga<small>partidos jugados</small></h3>
    <div class="g3"><div><small>Over 2.5, 2 años</small><b>${fmt(res.over25_2y)}%</b></div><div><small>Over 2.5, todo</small><b>${fmt(res.over25_todo)}%</b></div><div><small>Goles por partido</small><b>${fmt(res.goles_partido_2y, 2)}</b></div></div>
    <p class="note note-pad">${res.partidos_2y} partidos en los últimos 2 años, ${res.partidos_todo} en todo el historial. Ventana de validación: ${esc(res.ventana_usada || "--")}.</p>
    <h3 class="h3">Reglas por confianza<small>validadas en el bloque ciego</small></h3>
    <div class="tb h c4r"><span>Rango</span><span class="r">N</span><span class="r">Acierto</span><span class="r">Nivel</span></div>${reglas(res.confidence_buckets, false)}
    <h3 class="h3">Reglas por cuota</h3>
    <div class="tb h c4r"><span>Rango</span><span class="r">N</span><span class="r">Acierto</span><span class="r">Nivel</span></div>${reglas(res.odds_buckets, true)}`
    : `<div class="vacio" style="margin-top:18px">El resumen histórico de esta liga todavía no está disponible.</div>`}
    <h3 class="h3">Picks de la liga<small>${r.total} verificados</small></h3>
    <div class="blk"><div class="gm h h2"><span>Partido</span><span class="r">Marcador</span><span class="r"></span><span class="r">Resultado</span></div>
    ${filas.slice().reverse().map((p) => `<div class="gm h2"><span>${esc(p.partido)}<br><small style="color:${C.apagado};font-size:12px">${fechaCorta(fechaColombia(p.fecha_partido))}, cuota ${fmt(p.cuota, 2)}</small></span><span class="r">${p.goles_local_final !== null && p.goles_local_final !== undefined ? p.goles_local_final + " - " + p.goles_visita_final : "--"}</span><span></span><span class="ov ${p.resultado ? "o" : "u"}">${p.resultado ? "Acertó" : "Falló"}</span></div>`).join("")}</div>`;
}
