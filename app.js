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

btnAnalizar.addEventListener("click", async () => {
  btnAnalizar.disabled = true;
  btnAnalizar.textContent = "Iniciando...";
  analizarMensaje.textContent = "";

  const { data, error } = await supabaseClient.functions.invoke("run-analysis");

  btnAnalizar.disabled = false;
  btnAnalizar.textContent = "Analizar ahora";

  if (error || (data && data.ok === false)) {
    analizarMensaje.textContent = "Error al iniciar. Intenta de nuevo.";
    return;
  }

  analizarMensaje.textContent = "Análisis en curso — tarda unos minutos. Vuelve a entrar en un rato.";
});

// ================== TABS DE DIA ==================
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("tab-activo"));
    tab.classList.add("tab-activo");
    diaActivo = parseInt(tab.dataset.dia);
    cargarPicks(diaActivo);
  });
});

// ================== LEER PICKS DE SUPABASE ==================
function hoyISO(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().split("T")[0];
}

async function cargarPicks(offsetDias = 0) {
  resultadosDiv.innerHTML = '<p class="info-card">Cargando...</p>';
  comboResultadoDiv.innerHTML = "";
  const fechaObjetivo = hoyISO(offsetDias);
  const inicio = fechaObjetivo + "T00:00:00";
  const fin = fechaObjetivo + "T23:59:59";

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
