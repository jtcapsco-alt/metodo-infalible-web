// ================== CONFIGURACION ==================
const SUPABASE_URL = "https://punuuirjrtnihcgjucji.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1bnV1aXJqcnRuaWhjZ2p1Y2ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzY0OTIsImV4cCI6MjEwNDIxMjQ5Mn0.05iGLyekYZO0Y8wLkKQlnL1rOjlWYBrPpo5sM7QQrPU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // no recordar la sesion al cerrar la app -- pide login cada vez que se abre
  },
});

// ================== ELEMENTOS ==================
const splashScreen = document.getElementById("splash-screen");
const loginScreen = document.getElementById("login-screen");
const mainApp = document.getElementById("main-app");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const btnLogin = document.getElementById("btn-login");
const loginError = document.getElementById("login-error");
const btnLogout = document.getElementById("btn-logout");
const resultadosDiv = document.getElementById("resultados");
const comboResultadoDiv = document.getElementById("combo-resultado");
const tabs = document.querySelectorAll(".tab");

let diaActivo = 0;

// ================== SPLASH ==================
// El splash dura ~6 segundos (logo + texto + barra), y despues decide
// si mostrar login o la app directo, segun si ya habia sesion iniciada.
const DURACION_SPLASH_MS = 6000;

async function terminarSplash() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  splashScreen.style.display = "none";
  if (session) {
    mostrarApp();
  } else {
    mostrarLogin();
  }
}

setTimeout(terminarSplash, DURACION_SPLASH_MS);

// ================== LOGIN / SESION ==================
function mostrarLogin() {
  loginScreen.style.display = "flex";
  mainApp.style.display = "none";
}

function mostrarApp() {
  loginScreen.style.display = "none";
  mainApp.style.display = "block";
  cargarPicks(diaActivo);
  reiniciarTemporizadorInactividad();
}

btnLogin.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  loginError.textContent = "";

  if (!email || !password) {
    loginError.textContent = "Pon tu correo y contrasena.";
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = "Entrando...";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  btnLogin.disabled = false;
  btnLogin.textContent = "Entrar";

  if (error) {
    loginError.textContent = "Correo o contrasena incorrectos.";
    return;
  }

  mostrarApp();
});

btnLogout.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  mostrarLogin();
});

loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnLogin.click();
});

// ================== CIERRE AUTOMATICO POR INACTIVIDAD ==================
const MINUTOS_INACTIVIDAD = 30;
let temporizadorInactividad = null;

function reiniciarTemporizadorInactividad() {
  if (mainApp.style.display === "none") return; // no aplica si no ha logueado
  clearTimeout(temporizadorInactividad);
  temporizadorInactividad = setTimeout(async () => {
    await supabaseClient.auth.signOut();
    mostrarLogin();
    loginError.textContent = "Sesion cerrada por inactividad.";
  }, MINUTOS_INACTIVIDAD * 60 * 1000);
}

["click", "keydown", "touchstart", "scroll"].forEach(evento => {
  document.addEventListener(evento, reiniciarTemporizadorInactividad);
});

// ================== BOTON ANALIZAR AHORA ==================
const btnAnalizar = document.getElementById("btn-analizar");
const analizarMensaje = document.getElementById("analizar-mensaje");

let pollingAnalisis = null;

btnAnalizar.addEventListener("click", async () => {
  if (pollingAnalisis) clearInterval(pollingAnalisis); // por si le da doble clic

  btnAnalizar.disabled = true;
  btnAnalizar.textContent = "Iniciando...";
  analizarMensaje.textContent = "";

  const { data, error } = await supabaseClient.functions.invoke("run-analysis");

  if (error || (data && data.ok === false)) {
    btnAnalizar.disabled = false;
    btnAnalizar.textContent = "Analizar ahora";
    analizarMensaje.textContent = "Error al iniciar. Intenta de nuevo.";
    return;
  }

  // El analisis corre en GitHub Actions en segundo plano (tarda varios
  // minutos) -- en vez de dejar un mensaje estatico y que el usuario tenga
  // que salir y volver a entrar, la app pregunta sola cada 15 segundos si
  // ya hay picks nuevos guardados despues del momento en que se dio clic,
  // y se actualiza sola apenas los encuentra (o despues de 5 minutos, lo
  // que pase primero).
  const momentoClick = new Date().toISOString();
  let intentos = 0;
  const maxIntentos = 20; // 20 x 15s = 5 minutos

  btnAnalizar.textContent = "Analizando...";
  analizarMensaje.textContent = "Análisis en curso — la app se va a actualizar sola cuando termine.";

  pollingAnalisis = setInterval(async () => {
    intentos++;
    const { data: nuevos } = await supabaseClient
      .from("picks")
      .select("id")
      .gt("actualizado_en", momentoClick)
      .limit(1);

    const yaTermino = nuevos && nuevos.length > 0;

    if (yaTermino || intentos >= maxIntentos) {
      clearInterval(pollingAnalisis);
      pollingAnalisis = null;
      btnAnalizar.disabled = false;
      btnAnalizar.textContent = "Analizar ahora";
      analizarMensaje.textContent = yaTermino
        ? "¡Listo! Partidos actualizados."
        : "Sigue tardando más de lo normal -- entra en un rato y dale refrescar.";
      cargarPicks(diaActivo); // refresca automatico la vista actual
    } else {
      analizarMensaje.textContent = `Analizando... (${intentos}/${maxIntentos})`;
    }
  }, 15000);
});

// ================== TABS ==================
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("tab-activo"));
    tab.classList.add("tab-activo");

    if (tab.dataset.vista === "stats") {
      cargarEstadisticas();
    } else {
      diaActivo = parseInt(tab.dataset.dia);
      cargarPicks(diaActivo);
    }
  });
});

// ================== ESTADISTICAS ==================
async function cargarEstadisticas() {
  comboResultadoDiv.innerHTML = "";
  resultadosDiv.innerHTML = `<div class="info-card">Cargando estadisticas...</div>`;

  const { data, error } = await supabaseClient
    .from("picks")
    .select("liga_nombre, nivel, resultado")
    .not("resultado", "is", null);

  if (error) {
    resultadosDiv.innerHTML = `<div class="info-card">Error: ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    resultadosDiv.innerHTML = `<div class="info-card">Todavia no hay picks verificados. Esto se va llenando solo, dia a dia, a medida que se juegan los partidos.</div>`;
    return;
  }

  mostrarEstadisticas(data);
}

function resumenAcierto(filas) {
  const total = filas.length;
  const aciertos = filas.filter(f => f.resultado === true).length;
  const pct = total > 0 ? (100 * aciertos / total).toFixed(1) : "0.0";
  return { total, aciertos, fallos: total - aciertos, pct };
}

function mostrarEstadisticas(filas) {
  let html = "";

  // resumen general
  const general = resumenAcierto(filas);
  html += `<div class="stats-card stats-general">
    <p class="stats-titulo">Resumen general</p>
    <p class="stats-numero">${general.pct}%</p>
    <p class="stats-detalle">${general.aciertos} aciertos de ${general.total} picks verificados (${general.fallos} fallos)</p>
  </div>`;

  // por nivel
  html += `<p class="liga-nombre">Por nivel de confianza</p>`;
  const nivelesOrden = ["CONFIABLE", "RADAR_ALTO", "RADAR"];
  const nivelesTexto = { CONFIABLE: "Confiable", RADAR_ALTO: "Alto (poca muestra)", RADAR: "En el radar" };
  nivelesOrden.forEach(niv => {
    const filasNivel = filas.filter(f => f.nivel === niv);
    if (filasNivel.length === 0) return;
    const r = resumenAcierto(filasNivel);
    const nc = nivelClases(niv);
    html += `<div class="stats-fila">
      <span class="pill ${nc.pill}">${nivelesTexto[niv]}</span>
      <span class="stats-fila-numero">${r.pct}%</span>
      <span class="stats-fila-detalle">${r.aciertos}/${r.total}</span>
    </div>`;
  });

  // por liga
  html += `<p class="liga-nombre">Por liga</p>`;
  const porLiga = {};
  filas.forEach(f => {
    if (!porLiga[f.liga_nombre]) porLiga[f.liga_nombre] = [];
    porLiga[f.liga_nombre].push(f);
  });
  Object.keys(porLiga).sort().forEach(liga => {
    const r = resumenAcierto(porLiga[liga]);
    html += `<div class="stats-fila">
      <span class="stats-fila-liga">${liga}</span>
      <span class="stats-fila-numero">${r.pct}%</span>
      <span class="stats-fila-detalle">${r.aciertos}/${r.total}</span>
    </div>`;
  });

  resultadosDiv.innerHTML = html;
}

// ================== LEER PICKS DE SUPABASE ==================
// Calcula la fecha calendario en COLOMBIA (UTC-5, sin horario de verano),
// SIN depender de la zona horaria del dispositivo/navegador.
//
// ANTES: usaba `new Date().toISOString().split("T")[0]`, que siempre
// convierte a UTC. Eso hacia que, desde las 7:00pm hora Colombia en
// adelante (cuando en UTC ya cruzo la medianoche), la pestana "Hoy"
// mostrara los partidos de MANANA por error -- por eso se veian dos dias
// mezclados dependiendo de a que hora se abriera la app.
//
// AHORA: se resta 5 horas a la hora actual en UTC antes de leer el dia
// calendario, para que la frontera de "hoy" siempre caiga en la
// medianoche real de Colombia, sin importar la zona horaria del telefono.
function hoyISO(offsetDias = 0) {
  const ahoraUTC = new Date();
  const colombiaMs = ahoraUTC.getTime() - 5 * 60 * 60 * 1000; // UTC-5
  const d = new Date(colombiaMs);
  d.setUTCDate(d.getUTCDate() + offsetDias);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function cargarPicks(offsetDias = 0) {
  resultadosDiv.innerHTML = '<p class="info-card">Cargando...</p>';
  comboResultadoDiv.innerHTML = "";
  const fechaObjetivo = hoyISO(offsetDias);

  // Frontera del dia en hora Colombia (UTC-5) de forma EXPLICITA (con el
  // "-05:00" al final). Antes se mandaba sin zona horaria, y Supabase la
  // interpretaba como UTC -- corriendo la frontera del dia 5 horas
  // respecto a la medianoche real de Colombia.
  const inicio = fechaObjetivo + "T00:00:00-05:00";
  const fin = fechaObjetivo + "T23:59:59-05:00";

  const { data, error } = await supabaseClient
    .from("picks")
    .select("*")
    .gte("fecha_partido", inicio)
    .lte("fecha_partido", fin)
    .order("fecha_partido", { ascending: true });

  if (error) {
    resultadosDiv.innerHTML = `<div class="info-card">Error leyendo picks: ${error.message}</div>`;
    return;
  }

  mostrarResultados(data || []);
  cargarCombinada(fechaObjetivo);
}

function nivelClases(nivel) {
  if (nivel === "CONFIABLE") return { borde: "borde-confiable", pill: "pill-confiable", cuota: "cuota-confiable", texto: "Confiable" };
  if (nivel === "RADAR_ALTO") return { borde: "borde-radar-alto", pill: "pill-radar-alto", cuota: "cuota-radar-alto", texto: "Alto (poca muestra)" };
  if (nivel === "RADAR") return { borde: "borde-radar", pill: "pill-radar", cuota: "cuota-radar", texto: "En el radar" };
  return { borde: "borde-ninguno", pill: "pill-ninguno", cuota: "cuota-ninguno", texto: "Sin señal" };
}

function mostrarResultados(picks) {
  if (picks.length === 0) {
    resultadosDiv.innerHTML = `<div class="info-card">Todavia no hay partidos analizados para este dia. El analisis corre una vez al dia.</div>`;
    return;
  }

  const conSenal = picks.filter(p => p.nivel === "CONFIABLE" || p.nivel === "RADAR").length;
  let html = `<div class="info-card"><strong>${conSenal}</strong> de ${picks.length} partidos con señal.</div>`;

  const porLiga = {};
  picks.forEach(p => {
    if (!porLiga[p.liga_nombre]) porLiga[p.liga_nombre] = [];
    porLiga[p.liga_nombre].push(p);
  });

  Object.keys(porLiga).sort().forEach(liga => {
    html += `<p class="liga-nombre">${liga}</p>`;
    porLiga[liga].forEach(p => {
      const fecha = new Date(p.fecha_partido);
      const horaStr = fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      const nc = nivelClases(p.nivel);

      html += `<div class="partido-card ${nc.borde}">`;
      html += `<div class="partido-card-top">`;
      html += `<h3 class="partido-nombre">${p.partido}</h3>`;
      html += `<span class="pill ${nc.pill}">${nc.texto}</span>`;
      html += `</div>`;
      html += `<p class="partido-hora">${horaStr}</p>`;
      html += `<div class="partido-dato"><span>Probabilidad</span><strong>${(p.probabilidad * 100).toFixed(1)}%</strong></div>`;
      html += `<div class="partido-dato"><span>Cuota Over 2.5</span><strong class="${nc.cuota}">${p.cuota}</strong></div>`;
      if (p.regla_pct) {
        html += `<div class="partido-dato"><span>Historico (${p.regla_tipo})</span><strong>${p.regla_pct}%</strong></div>`;
      }
      // Forma reciente por localia -- local anotando/recibiendo DE LOCAL,
      // visitante anotando/recibiendo DE VISITANTE (ultimos 6 partidos en
      // ese rol especifico). Solo se muestra si hay historial suficiente.
      if (p.goles_esperados !== null && p.goles_esperados !== undefined) {
        html += `<div class="partido-forma">`;
        html += `<div class="partido-dato"><span>Local anota de local (últ. 6)</span><strong>${p.forma_local_anota}</strong></div>`;
        html += `<div class="partido-dato"><span>Local recibe de local (últ. 6)</span><strong>${p.forma_local_recibe}</strong></div>`;
        html += `<div class="partido-dato"><span>Visitante anota de visitante</span><strong>${p.forma_visita_anota}</strong></div>`;
        html += `<div class="partido-dato"><span>Visitante recibe de visitante</span><strong>${p.forma_visita_recibe}</strong></div>`;
        const badge = p.sobre_mediana_liga === true ? ' ⭐' : '';
        html += `<div class="partido-dato"><span>Goles esperados</span><strong>${p.goles_esperados}${badge}</strong></div>`;
        html += `</div>`;
      }
      html += `</div>`;
    });
  });

  resultadosDiv.innerHTML = html;
}

async function cargarCombinada(fecha) {
  const { data, error } = await supabaseClient
    .from("combinada_dia")
    .select("*")
    .eq("fecha", fecha)
    .maybeSingle();

  if (error || !data || data.mensaje) {
    comboResultadoDiv.innerHTML = "";
    return;
  }

  const nombres = (data.picks || []).map(p => p.partido).join(" + ");
  const probTexto = data.probabilidad_estimada ? `${data.probabilidad_estimada}% estimado` : "";

  comboResultadoDiv.innerHTML = `
    <div class="combo-card">
      <p class="combo-titulo">Combinada del dia -- cuota ${data.cuota_total}</p>
      <p class="combo-detalle">${nombres} ${probTexto ? "-- " + probTexto : ""}</p>
    </div>`;
}
