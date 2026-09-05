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
  cargarLigas();
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

// permite loguear con Enter en vez de solo click
loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnLogin.click();
});

// ================== EL RESTO DE LA APP (igual que antes) ==================
const ligaSelect = document.getElementById("liga-select");
const ligaInfo = document.getElementById("liga-info");
const diasSelect = document.getElementById("dias-select");
const loading = document.getElementById("loading");
const resultadosDiv = document.getElementById("resultados");

async function cargarLigas() {
  try {
    const resp = await fetch(`${API_URL}/leagues`);
    const ligas = await resp.json();
    ligaSelect.innerHTML = '<option value="">Selecciona una liga...</option>';
    ligas.forEach(liga => {
      const opt = document.createElement("option");
      opt.value = liga.league_id;
      opt.textContent = liga.display_name;
      opt.dataset.rate = liga.over25_historical_rate;
      ligaSelect.appendChild(opt);
    });
  } catch (err) {
    ligaSelect.innerHTML = '<option value="">Backend no disponible todavia desde aqui</option>';
  }
}

async function consultarPartidos() {
  const ligaId = ligaSelect.value;
  if (!ligaId) { resultadosDiv.innerHTML = ""; return; }

  const opt = ligaSelect.selectedOptions[0];
  ligaInfo.textContent = `Over 2.5 historico de esta liga: ${(opt.dataset.rate * 100).toFixed(1)}%`;

  const dias = diasSelect.value;
  loading.style.display = "block";
  resultadosDiv.innerHTML = "";

  try {
    const resp = await fetch(`${API_URL}/leagues/${ligaId}/upcoming?days_ahead=${dias}`);
    const data = await resp.json();
    if (!resp.ok) {
      resultadosDiv.innerHTML = `<div class="card resultado nivel-sin-senal"><p>${data.detail || "Error"}</p></div>`;
      return;
    }
    mostrarResultados(data);
  } catch (err) {
    resultadosDiv.innerHTML = `<div class="card resultado nivel-sin-senal"><p>Backend no disponible desde aqui todavia.</p></div>`;
  } finally {
    loading.style.display = "none";
  }
}

function mostrarResultados(data) {
  if (data.total_analizados === 0) {
    resultadosDiv.innerHTML = `<div class="card"><p class="info-text">No hay partidos con cuota disponible en este rango.</p></div>`;
    return;
  }
  const conSenal = data.todos_los_partidos.filter(p => p.califica_como_senal).length;
  let html = `<div class="card"><p class="info-text"><strong>${conSenal}</strong> de ${data.total_analizados} con señal en ${data.liga}.</p></div>`;

  const ordenados = [...data.todos_los_partidos].sort((a, b) => a.fecha_unix - b.fecha_unix);
  let diaActual = null;

  ordenados.forEach(p => {
    const fecha = new Date(p.fecha_unix * 1000);
    const diaKey = fecha.toDateString();
    if (diaKey !== diaActual) {
      diaActual = diaKey;
      html += `<div class="dia-separador">${fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</div>`;
    }
    const horaStr = fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const nivelInfo = {
      CONFIABLE: { clase: "nivel-confiable", texto: "CONFIABLE", badge: "si" },
      RADAR: { clase: "nivel-radar", texto: "EN EL RADAR", badge: "radar" },
    }[p.nivel] || { clase: "nivel-sin-senal", texto: "Sin señal", badge: "no" };

    html += `<div class="card resultado ${nivelInfo.clase}">`;
    html += `<h2>${p.partido}</h2><p class="info-text">${horaStr}</p>`;
    html += `<span class="badge ${nivelInfo.badge}">${nivelInfo.texto}</span>`;
    html += `<div class="dato"><span>Probabilidad</span><strong>${(p.p_final * 100).toFixed(1)}%</strong></div>`;
    html += `<div class="dato"><span>Cuota Over 2.5</span><strong>${p.cuota_over25}</strong></div>`;
    html += `</div>`;
  });
  resultadosDiv.innerHTML = html;
}

ligaSelect.addEventListener("change", consultarPartidos);
diasSelect.addEventListener("change", consultarPartidos);

document.getElementById("btn-combo").addEventListener("click", async () => {
  const btn = document.getElementById("btn-combo");
  const div = document.getElementById("combo-resultado");
  btn.textContent = "Analizando...";
  btn.disabled = true;
  div.innerHTML = "";
  try {
    const resp = await fetch(`${API_URL}/combo-del-dia?days_ahead=2`);
    const data = await resp.json();
    div.innerHTML = `<div class="card"><p class="info-text">${JSON.stringify(data).slice(0, 200)}...</p></div>`;
  } catch (err) {
    div.innerHTML = `<div class="card"><p class="info-text">Backend no disponible desde aqui todavia.</p></div>`;
  } finally {
    btn.textContent = "Traeme la combinada del dia (cuota ~2.0)";
    btn.disabled = false;
  }
});

// ================== ARRANQUE ==================
verificarSesion();
