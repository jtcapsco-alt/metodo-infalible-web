// ================== CONFIGURACION ==================
const SUPABASE_URL = "https://punuuirjrtnihcgjucji.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1bnV1aXJqcnRuaWhjZ2p1Y2ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzY0OTIsImV4cCI6MjEwNDIxMjQ5Mn0.05iGLyekYZO0Y8wLkKQlnL1rOjlWYBrPpo5sM7QQrPU";

// Esta linea todavia apunta a tu PC -- se reemplaza cuando conectemos
// GitHub Actions + la lectura directa desde Supabase.
const API_URL = "http://localhost:8000";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================== ELEMENTOS ==================
const loginScreen = document.getElementById("login-screen");
const mainApp = document.getElementById("main-app");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const btnLogin = document.getElementById("btn-login");
const loginError = document.getElementById("login-error");
const btnLogout = document.getElementById("btn-logout");

// ================== LOGIN / SESION ==================
async function verificarSesion() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    mostrarApp();
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  loginScreen.style.display = "flex";
  mainApp.style.display = "none";
}

function mostrarApp() {
  loginScreen.style.display = "none";
  mainApp.style.display = "block";
  cargarPicks(parseInt(diaSelector.value));
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

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

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

// ================== LEER PICKS DIRECTO DE SUPABASE ==================
const resultadosDiv = document.getElementById("resultados");
const comboResultadoDiv = document.getElementById("combo-resultado");
const diaSelector = document.getElementById("dia-selector");

function hoyISO(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().split("T")[0];
}

async function cargarPicks(offsetDias = 0) {
  resultadosDiv.innerHTML = '<p class="info-text">Cargando...</p>';
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
    resultadosDiv.innerHTML = `<div class="card resultado nivel-sin-senal"><p>Error leyendo picks: ${error.message}</p></div>`;
    return;
  }

  mostrarResultados(data || []);
  cargarCombinada(fechaObjetivo);
}

function mostrarResultados(picks) {
  if (picks.length === 0) {
    resultadosDiv.innerHTML = `<div class="card"><p class="info-text">Todavia no hay partidos analizados para este dia. El analisis corre una vez al dia -- si acabas de pedirlo, puede que aun no haya corrido.</p></div>`;
    return;
  }

  const conSenal = picks.filter(p => p.nivel === "CONFIABLE" || p.nivel === "RADAR").length;
  let html = `<div class="card"><p class="info-text"><strong>${conSenal}</strong> de ${picks.length} partidos con señal.</p></div>`;

  // Agrupar por liga
  const porLiga = {};
  picks.forEach(p => {
    if (!porLiga[p.liga_nombre]) porLiga[p.liga_nombre] = [];
    porLiga[p.liga_nombre].push(p);
  });

  Object.keys(porLiga).sort().forEach(liga => {
    const partidosLiga = porLiga[liga];
    html += `<div class="liga-separador">${liga}</div>`;

    partidosLiga.forEach(p => {
      const fecha = new Date(p.fecha_partido);
      const horaStr = fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      const nivelInfo = {
        CONFIABLE: { clase: "nivel-confiable", texto: "CONFIABLE", badge: "si" },
        RADAR: { clase: "nivel-radar", texto: "EN EL RADAR", badge: "radar" },
      }[p.nivel] || { clase: "nivel-sin-senal", texto: "Sin señal", badge: "no" };

      html += `<div class="card resultado ${nivelInfo.clase}">`;
      html += `<h2>${p.partido}</h2><p class="info-text">${horaStr}</p>`;
      html += `<span class="badge ${nivelInfo.badge}">${nivelInfo.texto}</span>`;
      html += `<div class="dato"><span>Probabilidad</span><strong>${(p.probabilidad * 100).toFixed(1)}%</strong></div>`;
      html += `<div class="dato"><span>Cuota Over 2.5</span><strong>${p.cuota}</strong></div>`;
      if (p.regla_pct) {
        html += `<div class="dato"><span>Historico (${p.regla_tipo})</span><strong>${p.regla_pct}%</strong></div>`;
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

  if (error || !data) {
    comboResultadoDiv.innerHTML = "";
    return;
  }

  if (data.mensaje) {
    comboResultadoDiv.innerHTML = `<div class="card"><p class="info-text">${data.mensaje}</p></div>`;
    return;
  }

  let html = `<div class="card resultado nivel-confiable">`;
  html += `<h2>Combinada recomendada</h2>`;
  html += `<div class="dato"><span>Cuota total</span><strong>${data.cuota_total}</strong></div>`;
  if (data.probabilidad_estimada) {
    html += `<div class="dato"><span>Probabilidad estimada</span><strong>${data.probabilidad_estimada}%</strong></div>`;
  }
  (data.picks || []).forEach(p => {
    html += `<hr style="border-color:#334155;margin:10px 0;">`;
    html += `<p><strong>${p.partido}</strong> (${p.liga})</p>`;
    html += `<div class="dato"><span>Cuota Over 2.5</span><strong>${p.cuota_over25}</strong></div>`;
  });
  html += `</div>`;
  comboResultadoDiv.innerHTML = html;
}

diaSelector.addEventListener("change", () => {
  cargarPicks(parseInt(diaSelector.value));
});

// ================== ARRANQUE ==================
verificarSesion();
