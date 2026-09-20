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
    } else if (tab.dataset.vista === "resultados") {
      cargarResultados();
    } else {
      diaActivo = parseInt(tab.dataset.dia);
      cargarPicks(diaActivo);
    }
  });
});

// ================== ESTADISTICAS ==================
let chartInstances = {};
let ligaAbierta = null;

function dibujarChart(id, config) {
  if (chartInstances[id]) chartInstances[id].destroy();
  const el = document.getElementById(id);
  if (!el) return;
  chartInstances[id] = new Chart(el, config);
}

const COLOR_CONFIABLE = "#22c55e";
const COLOR_RADAR_ALTO = "#86efac";
const COLOR_RADAR = "#eab308";
const COLOR_GANO = "#22c55e";
const COLOR_FALLO = "#ef4444";
const COLOR_PENDIENTE = "#cbd5e1";
const COLOR_VALOR = "#2563eb";
const COLOR_NEUTRO = "#94a3b8";

const OPCIONES_BASE_CHART = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { right: 46 } },
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 11 } } },
    y: { grid: { display: false }, ticks: { font: { size: 11.5 } } },
  },
};

// ---------- Aro de progreso (KPI circular, SVG puro) ----------
function svgAro(pct, color, tamano, grosor) {
  tamano = tamano || 96;
  grosor = grosor || 10;
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const relleno = (p / 100) * c;
  return `<svg width="${tamano}" height="${tamano}" viewBox="0 0 ${tamano} ${tamano}">
    <circle cx="${tamano / 2}" cy="${tamano / 2}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${grosor}" />
    <circle cx="${tamano / 2}" cy="${tamano / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${grosor}"
      stroke-dasharray="${relleno} ${c}" stroke-linecap="round"
      transform="rotate(-90 ${tamano / 2} ${tamano / 2})" />
  </svg>`;
}

function aroConNumero(pct, color, etiqueta, tamano) {
  tamano = tamano || 96;
  return `<div class="aro-wrap">${svgAro(pct, color, tamano)}
    <div class="aro-numero" style="font-size:${Math.round(tamano * 0.22)}px">${pct}%${etiqueta ? `<span>${etiqueta}</span>` : ""}</div>
  </div>`;
}

async function cargarEstadisticas() {
  comboResultadoDiv.innerHTML = "";
  resultadosDiv.innerHTML = `<div class="info-card">Cargando estadisticas...</div>`;

  const [picksRes, comboRes] = await Promise.all([
    supabaseClient
      .from("picks")
      .select("liga_nombre, nivel, resultado, fecha_partido, sobre_mediana_liga, partido, goles_local_final, goles_visita_final, cumple_filtro_triple")
      .not("resultado", "is", null),
    supabaseClient
      .from("combinada_resultados")
      .select("fecha, resultado_combinada, cuota_total"),
  ]);

  if (picksRes.error) {
    resultadosDiv.innerHTML = `<div class="info-card">Error: ${picksRes.error.message}</div>`;
    return;
  }

  if (!picksRes.data || picksRes.data.length === 0) {
    resultadosDiv.innerHTML = `<div class="info-card">Todavia no hay picks verificados. Esto se va llenando solo, dia a dia, a medida que se juegan los partidos.</div>`;
    return;
  }

  const combos = (!comboRes.error && comboRes.data) ? comboRes.data : null;
  mostrarEstadisticas(picksRes.data, combos);
}

function resumenAcierto(filas) {
  const total = filas.length;
  const aciertos = filas.filter(f => f.resultado === true).length;
  const pct = total > 0 ? (100 * aciertos / total).toFixed(1) : "0.0";
  return { total, aciertos, fallos: total - aciertos, pct };
}

function mostrarEstadisticas(filas, combos) {
  ligaAbierta = null;
  let html = "";

  // ---------- Resumen general (aro de progreso) ----------
  const general = resumenAcierto(filas);
  html += `<div class="stats-card stats-general stats-general-aro">
    ${aroConNumero(parseFloat(general.pct), COLOR_CONFIABLE, null, 100)}
    <div>
      <p class="stats-titulo">Resumen general</p>
      <p class="stats-detalle">${general.aciertos} aciertos de ${general.total} picks verificados</p>
      <p class="stats-detalle">${general.fallos} fallos</p>
    </div>
  </div>`;

  // ---------- Por nivel de confianza ----------
  const nivelesOrden = ["CONFIABLE", "RADAR_ALTO", "RADAR"];
  const nivelesTexto = { CONFIABLE: "Confiable", RADAR_ALTO: "Alto (poca muestra)", RADAR: "En el radar" };
  const nivelesColor = { CONFIABLE: COLOR_CONFIABLE, RADAR_ALTO: COLOR_RADAR_ALTO, RADAR: COLOR_RADAR };
  const datosNivel = nivelesOrden
    .map(niv => ({ niv, r: resumenAcierto(filas.filter(f => f.nivel === niv)) }))
    .filter(d => d.r.total > 0);

  html += `<div class="stats-section">
    <div class="stats-section-header">
      <span class="stats-section-titulo">Acierto por nivel de confianza</span>
      <span class="stats-section-subtitulo">${datosNivel.reduce((s, d) => s + d.r.total, 0)} picks</span>
    </div>
    <div class="chart-card"><div class="chart-wrap medio"><canvas id="chart-nivel"></canvas></div></div>
    <p class="stats-nota">El nivel Confiable deberia acertar mas seguido que Radar por diseno -- si con el tiempo dejan de verse asi de separados, es una senal para revisar.</p>
  </div>`;

  // ---------- Por liga ----------
  const porLiga = {};
  filas.forEach(f => {
    if (!porLiga[f.liga_nombre]) porLiga[f.liga_nombre] = [];
    porLiga[f.liga_nombre].push(f);
  });
  const datosLiga = Object.keys(porLiga)
    .map(liga => ({ liga, r: resumenAcierto(porLiga[liga]) }))
    .sort((a, b) => parseFloat(b.r.pct) - parseFloat(a.r.pct));

  const altoLiga = Math.max(160, datosLiga.length * 30);
  html += `<div class="stats-section">
    <div class="stats-section-header">
      <span class="stats-section-titulo">Acierto por liga</span>
      <span class="stats-section-subtitulo">${datosLiga.length} ligas con datos</span>
    </div>
    <p class="stats-ayuda">Toca una barra para ver los partidos de esa liga, con marcador</p>
    <div class="chart-card clicable"><div class="chart-wrap" style="height:${altoLiga}px"><canvas id="chart-liga"></canvas></div></div>
    <div id="detalle-liga-panel"></div>
  </div>`;

  // ---------- Evolucion en el tiempo ----------
  const porSemana = {};
  filas.forEach(f => {
    if (!f.fecha_partido) return;
    const d = new Date(f.fecha_partido);
    const inicioSemana = new Date(d);
    inicioSemana.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const clave = inicioSemana.toISOString().split("T")[0];
    if (!porSemana[clave]) porSemana[clave] = [];
    porSemana[clave].push(f);
  });
  const semanasOrdenadas = Object.keys(porSemana).sort();

  html += `<div class="stats-section">
    <div class="stats-section-header">
      <span class="stats-section-titulo">Evolucion del acierto semana a semana</span>
    </div>`;
  if (semanasOrdenadas.length < 2) {
    html += `<div class="chart-card-vacio">Todavia no hay suficientes semanas de datos verificados para dibujar la evolucion -- esto se va a ir llenando solo.</div>`;
  } else {
    html += `<div class="chart-card"><div class="chart-wrap alto"><canvas id="chart-evolucion"></canvas></div></div>`;
  }
  html += `</div>`;

  // ---------- Combinada del dia ----------
  html += `<div class="stats-section">
    <div class="stats-section-header">
      <span class="stats-section-titulo">Combinada del dia</span>
    </div>`;
  if (!combos || combos.length === 0) {
    html += `<div class="chart-card-vacio">Todavia no hay combinadas verificadas, o la vista "combinada_resultados" no esta creada en Supabase.</div>`;
  } else {
    const resueltas = combos.filter(c => c.resultado_combinada !== "PENDIENTE");
    const ganadas = combos.filter(c => c.resultado_combinada === "GANO_COMPLETA").length;
    const falladas = combos.filter(c => c.resultado_combinada === "FALLO").length;
    const pendientes = combos.filter(c => c.resultado_combinada === "PENDIENTE").length;
    const pctCombo = resueltas.length > 0 ? (100 * ganadas / resueltas.length) : 0;

    html += `<div class="stats-card stats-general stats-combo stats-general-aro">
      ${aroConNumero(parseFloat(pctCombo.toFixed(1)), COLOR_VALOR, null, 100)}
      <div>
        <p class="stats-titulo">Acierto historico de la combinada de 2 patas</p>
        <p class="stats-detalle">${ganadas} ganadas completas de ${resueltas.length} verificadas</p>
        <p class="stats-detalle">${falladas} fallidas, ${pendientes} pendientes</p>
      </div>
    </div>`;
    html += `<div class="chart-card"><div class="chart-wrap medio"><canvas id="chart-combo"></canvas></div></div>`;
  }
  html += `</div>`;

  // ---------- Fin de semana (sabado y domingo) ----------
  function diaSemanaColombia(ts) {
    const d = new Date(new Date(ts).getTime() - 5 * 60 * 60 * 1000);
    return d.getUTCDay(); // 0=Domingo ... 6=Sabado
  }
  const conFecha = filas.filter(f => f.fecha_partido);
  const sabado = conFecha.filter(f => diaSemanaColombia(f.fecha_partido) === 6);
  const domingo = conFecha.filter(f => diaSemanaColombia(f.fecha_partido) === 0);
  const finDeSemana = [...sabado, ...domingo];
  const entreSemana = conFecha.filter(f => {
    const d = diaSemanaColombia(f.fecha_partido);
    return d !== 6 && d !== 0;
  });

  html += `<div class="stats-section">
    <div class="stats-section-header">
      <span class="stats-section-titulo">Rendimiento en fin de semana</span>
      <span class="stats-section-subtitulo">${finDeSemana.length} picks (sab+dom)</span>
    </div>`;
  if (finDeSemana.length < 10) {
    html += `<div class="chart-card-vacio">Todavia muy pocos sabados/domingos verificados para sacar algo en limpio -- se va llenando solo cada fin de semana.</div>`;
  } else {
    const rEntreSemana = resumenAcierto(entreSemana);
    const rFinDeSemana = resumenAcierto(finDeSemana);
    const rSabado = resumenAcierto(sabado);
    const rDomingo = resumenAcierto(domingo);
    html += `<p class="stats-ayuda">Entre semana vs fin de semana</p>
    <div class="stats-comparativa">
      <div class="stats-comparativa-item">
        <span class="pill pill-valor-bajo">Entre semana</span>
        ${aroConNumero(parseFloat(rEntreSemana.pct), COLOR_NEUTRO, null, 80)}
        <p class="stats-comparativa-detalle">${rEntreSemana.aciertos}/${rEntreSemana.total} picks</p>
      </div>
      <div class="stats-comparativa-item">
        <span class="pill pill-valor-alto">Fin de semana</span>
        ${aroConNumero(parseFloat(rFinDeSemana.pct), COLOR_VALOR, null, 80)}
        <p class="stats-comparativa-detalle">${rFinDeSemana.aciertos}/${rFinDeSemana.total} picks</p>
      </div>
    </div>
    <p class="stats-ayuda">Sabado vs domingo, por separado</p>
    <div class="stats-comparativa">
      <div class="stats-comparativa-item">
        <span class="pill pill-radar">Sabado</span>
        ${aroConNumero(parseFloat(rSabado.pct), COLOR_RADAR, null, 80)}
        <p class="stats-comparativa-detalle">${rSabado.aciertos}/${rSabado.total} picks</p>
      </div>
      <div class="stats-comparativa-item">
        <span class="pill pill-confiable">Domingo</span>
        ${aroConNumero(parseFloat(rDomingo.pct), COLOR_CONFIABLE, null, 80)}
        <p class="stats-comparativa-detalle">${rDomingo.aciertos}/${rDomingo.total} picks</p>
      </div>
    </div>
    <p class="stats-nota">Esta es la estadistica separada que pediste -- mide solo sabados y domingos, sin mezclarse con el resto de la semana. Con mas fines de semana acumulados, esto se vuelve mas confiable.</p>`;
  }
  html += `</div>`;


  const conMediana = filas.filter(f => f.sobre_mediana_liga === true || f.sobre_mediana_liga === false);
  html += `<div class="stats-section">
    <div class="stats-section-header">
      <span class="stats-section-titulo">Goles esperados vs promedio de su liga</span>
      <span class="stats-section-subtitulo">${conMediana.length} picks con dato</span>
    </div>`;
  if (conMediana.length < 20) {
    html += `<div class="chart-card-vacio">Muestra todavia muy chica (menos de 20 picks) -- este criterio solo esta activo en 11 de las 13 ligas por ahora. No sacar conclusiones todavia, dejar que se acumule.</div>`;
  } else {
    const sobreProm = resumenAcierto(conMediana.filter(f => f.sobre_mediana_liga === true));
    const bajoProm = resumenAcierto(conMediana.filter(f => f.sobre_mediana_liga === false));
    html += `<div class="stats-comparativa">
      <div class="stats-comparativa-item">
        <span class="pill pill-valor-alto">Sobre promedio</span>
        ${aroConNumero(parseFloat(sobreProm.pct), COLOR_VALOR, null, 76)}
        <p class="stats-comparativa-detalle">${sobreProm.aciertos}/${sobreProm.total} picks</p>
      </div>
      <div class="stats-comparativa-item">
        <span class="pill pill-valor-bajo">Bajo promedio</span>
        ${aroConNumero(parseFloat(bajoProm.pct), COLOR_NEUTRO, null, 76)}
        <p class="stats-comparativa-detalle">${bajoProm.aciertos}/${bajoProm.total} picks</p>
      </div>
    </div>
    <p class="stats-nota">Si "Sobre promedio" se mantiene por encima de "Bajo promedio" con el tiempo y con mas muestra, confirma que sirve como criterio de prioridad. Si se empareja o se voltea, hay que revisarlo.</p>`;
  }
  html += `</div>`;

  // ---------- Filtro triple ----------
  const conFiltro = filas.filter(f => f.cumple_filtro_triple === true || f.cumple_filtro_triple === false);
  html += `<div class="stats-section">
    <div class="stats-section-header">
      <span class="stats-section-titulo">Filtro triple (probabilidad + cuota + goles esperados)</span>
      <span class="stats-section-subtitulo">${conFiltro.length} picks con dato</span>
    </div>`;
  if (conFiltro.length < 20) {
    html += `<div class="chart-card-vacio">Muestra todavia muy chica -- este filtro es nuevo, se va llenando desde ahora.</div>`;
  } else {
    const cumple = resumenAcierto(conFiltro.filter(f => f.cumple_filtro_triple === true));
    const noCumple = resumenAcierto(conFiltro.filter(f => f.cumple_filtro_triple === false));
    html += `<div class="stats-comparativa">
      <div class="stats-comparativa-item">
        <span class="pill" style="background:#f5f3ff;color:#6d28d9">Cumple el filtro</span>
        ${aroConNumero(parseFloat(cumple.pct), "#7c3aed", null, 80)}
        <p class="stats-comparativa-detalle">${cumple.aciertos}/${cumple.total} picks</p>
      </div>
      <div class="stats-comparativa-item">
        <span class="pill pill-valor-bajo">No lo cumple</span>
        ${aroConNumero(parseFloat(noCumple.pct), COLOR_NEUTRO, null, 80)}
        <p class="stats-comparativa-detalle">${noCumple.aciertos}/${noCumple.total} picks</p>
      </div>
    </div>
    <p class="stats-nota">Backtest inicial (Sept 2026, 11 de 13 ligas): 71.4% vs 61.7%. Esto mide si esa ventaja se sostiene con datos reales en vivo, dia a dia.</p>`;
  }
  html += `</div>`;

  resultadosDiv.innerHTML = html;

  // ---------- Dibujar las graficas ----------
  const pluginsDisponibles = (typeof ChartDataLabels !== "undefined") ? [ChartDataLabels] : [];

  if (datosNivel.length > 0) {
    dibujarChart("chart-nivel", {
      type: "bar",
      plugins: pluginsDisponibles,
      data: {
        labels: datosNivel.map(d => nivelesTexto[d.niv]),
        datasets: [{
          data: datosNivel.map(d => parseFloat(d.r.pct)),
          backgroundColor: datosNivel.map(d => nivelesColor[d.niv]),
          borderRadius: 6,
        }],
      },
      options: {
        ...OPCIONES_BASE_CHART,
        indexAxis: "y",
        scales: { ...OPCIONES_BASE_CHART.scales, x: { ...OPCIONES_BASE_CHART.scales.x, max: 100, title: { display: true, text: "% de acierto" } } },
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: "end", align: "end", color: "#0f172a", font: { size: 11.5, weight: "600" },
            formatter: (value, ctx) => `${value}% (${datosNivel[ctx.dataIndex].r.aciertos}/${datosNivel[ctx.dataIndex].r.total})`,
          },
        },
      },
    });
  }

  dibujarChart("chart-liga", {
    type: "bar",
    plugins: pluginsDisponibles,
    data: {
      labels: datosLiga.map(d => d.liga),
      datasets: [{
        data: datosLiga.map(d => parseFloat(d.r.pct)),
        backgroundColor: COLOR_CONFIABLE,
        borderRadius: 5,
      }],
    },
    options: {
      ...OPCIONES_BASE_CHART,
      indexAxis: "y",
      scales: { ...OPCIONES_BASE_CHART.scales, x: { ...OPCIONES_BASE_CHART.scales.x, max: 100, title: { display: true, text: "% de acierto" } } },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: "end", align: "end", color: "#0f172a", font: { size: 11, weight: "600" },
          formatter: (value, ctx) => `${value}% (${datosLiga[ctx.dataIndex].r.aciertos}/${datosLiga[ctx.dataIndex].r.total})`,
        },
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const liga = datosLiga[elements[0].index].liga;
        mostrarDetalleLiga(liga, filas);
      },
    },
  });

  if (semanasOrdenadas.length >= 2) {
    const pctsPorSemana = semanasOrdenadas.map(s => parseFloat(resumenAcierto(porSemana[s]).pct));
    dibujarChart("chart-evolucion", {
      type: "line",
      data: {
        labels: semanasOrdenadas.map(s => new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })),
        datasets: [{
          data: pctsPorSemana,
          borderColor: COLOR_CONFIABLE,
          backgroundColor: "rgba(34,197,94,0.1)",
          fill: true,
          tension: 0.25,
          pointRadius: 3,
          pointBackgroundColor: COLOR_CONFIABLE,
        }],
      },
      options: {
        ...OPCIONES_BASE_CHART,
        scales: { ...OPCIONES_BASE_CHART.scales, y: { ...OPCIONES_BASE_CHART.scales.y, min: 0, max: 100, title: { display: true, text: "% de acierto" } } },
      },
    });
  }

  if (combos && combos.length > 0) {
    const ganadas = combos.filter(c => c.resultado_combinada === "GANO_COMPLETA").length;
    const falladas = combos.filter(c => c.resultado_combinada === "FALLO").length;
    const pendientes = combos.filter(c => c.resultado_combinada === "PENDIENTE").length;
    dibujarChart("chart-combo", {
      type: "doughnut",
      plugins: pluginsDisponibles,
      data: {
        labels: ["Gano completa", "Fallo", "Pendiente"],
        datasets: [{
          data: [ganadas, falladas, pendientes],
          backgroundColor: [COLOR_GANO, COLOR_FALLO, COLOR_PENDIENTE],
          borderWidth: 2,
          borderColor: "#ffffff",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11.5 }, boxWidth: 12, padding: 14 } },
          datalabels: {
            color: "#ffffff", font: { size: 12, weight: "700" },
            formatter: (value) => (value > 0 ? value : ""),
          },
        },
      },
    });
  }
}

function mostrarDetalleLiga(liga, filas) {
  const panel = document.getElementById("detalle-liga-panel");
  if (!panel) return;

  if (ligaAbierta === liga) {
    panel.innerHTML = "";
    ligaAbierta = null;
    return;
  }
  ligaAbierta = liga;

  const partidos = filas
    .filter(f => f.liga_nombre === liga)
    .sort((a, b) => new Date(b.fecha_partido) - new Date(a.fecha_partido));

  let html = `<div class="liga-detalle">
    <p class="liga-detalle-titulo">${liga} -- ${partidos.length} picks verificados</p>`;

  partidos.forEach(p => {
    const tieneMarcador = p.goles_local_final !== null && p.goles_local_final !== undefined;
    const marcador = tieneMarcador ? `${p.goles_local_final}-${p.goles_visita_final}` : "s/d";
    const fecha = p.fecha_partido ? new Date(p.fecha_partido).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "";
    const badge = p.resultado === true
      ? '<span class="resultado-badge resultado-acerto">Acerto</span>'
      : '<span class="resultado-badge resultado-fallo">Fallo</span>';
    html += `<div class="liga-detalle-fila">
      <span class="liga-detalle-partido">${p.partido || "?"} <span style="color:#cbd5e1">(${fecha})</span></span>
      <span class="liga-detalle-marcador">${marcador}</span>
      ${badge}
    </div>`;
  });

  html += `</div>`;
  panel.innerHTML = html;
}

// ================== RESULTADOS (marcadores de dias anteriores) ==================
function fechaColombiaDeTimestamp(ts) {
  const d = new Date(new Date(ts).getTime() - 5 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function etiquetaDiaCorta(fechaStr) {
  const d = new Date(fechaStr + "T12:00:00");
  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${diasSemana[d.getDay()]} ${d.getDate()}`;
}

function etiquetaDiaLarga(fechaStr) {
  const d = new Date(fechaStr + "T12:00:00");
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long" });
}

let datosResultadosPorDia = {};
let diaResultadoActivo = null;

async function cargarResultados() {
  resultadosDiv.innerHTML = '<p class="info-card">Cargando...</p>';
  comboResultadoDiv.innerHTML = "";

  const hoy = hoyISO(0);
  const desde = hoyISO(-4);

  const { data, error } = await supabaseClient
    .from("picks")
    .select("*")
    .gte("fecha_partido", desde + "T00:00:00-05:00")
    .lt("fecha_partido", hoy + "T00:00:00-05:00")
    .not("resultado", "is", null)
    .order("fecha_partido", { ascending: false });

  if (error) {
    resultadosDiv.innerHTML = `<div class="info-card">Error leyendo resultados: ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    resultadosDiv.innerHTML = `<div class="info-card">Todavia no hay resultados verificados en los ultimos dias.</div>`;
    return;
  }

  datosResultadosPorDia = {};
  data.forEach(p => {
    const clave = fechaColombiaDeTimestamp(p.fecha_partido);
    if (!datosResultadosPorDia[clave]) datosResultadosPorDia[clave] = [];
    datosResultadosPorDia[clave].push(p);
  });

  const diasOrdenados = Object.keys(datosResultadosPorDia).sort().reverse();
  diaResultadoActivo = diasOrdenados[0];
  renderizarPantallaResultados();
}

function renderizarPantallaResultados() {
  const diasOrdenados = Object.keys(datosResultadosPorDia).sort().reverse();

  let html = '<div class="dias-selector">';
  diasOrdenados.forEach(dia => {
    const picksDia = datosResultadosPorDia[dia];
    const aciertosDia = picksDia.filter(p => p.resultado === true).length;
    const activo = dia === diaResultadoActivo ? " dia-pill-activo" : "";
    html += `<div class="dia-pill${activo}" data-dia="${dia}">
      <span class="dia-pill-fecha">${etiquetaDiaCorta(dia)}</span>
      <span class="dia-pill-detalle">${aciertosDia}/${picksDia.length}</span>
    </div>`;
  });
  html += "</div>";

  const picksDia = datosResultadosPorDia[diaResultadoActivo] || [];
  const aciertosDia = picksDia.filter(p => p.resultado === true).length;
  html += `<div class="dia-header">${etiquetaDiaLarga(diaResultadoActivo)} -- ${aciertosDia}/${picksDia.length} acertados</div>`;

  picksDia.forEach(p => {
    const tieneMarcador = p.goles_local_final !== null && p.goles_local_final !== undefined;
    const marcador = tieneMarcador ? `${p.goles_local_final} - ${p.goles_visita_final}` : "Marcador no disponible";
    const nc = nivelClases(p.nivel);
    const esTriple = p.cumple_filtro_triple === true;
    const badge = p.resultado === true
      ? '<span class="resultado-badge resultado-acerto">Acerto</span>'
      : '<span class="resultado-badge resultado-fallo">Fallo</span>';

    html += `<div class="marcador-card${esTriple ? " partido-card-triple" : ""}">
      ${esTriple ? '<div class="filtro-triple-banner">Cumple el filtro triple -- alta precision historica</div>' : ""}
      <div class="marcador-card-top">
        <span class="marcador-equipos">${p.partido}</span>
        ${badge}
      </div>
      <p class="marcador-final">${marcador}</p>
      <div class="marcador-meta">
        <span class="marcador-meta-izq">${p.liga_nombre} -- <span class="pill ${nc.pill}">${nc.texto}</span></span>
        <span class="marcador-meta-izq">Cuota ${p.cuota}</span>
      </div>
    </div>`;
  });

  resultadosDiv.innerHTML = html;

  document.querySelectorAll(".dia-pill").forEach(el => {
    el.addEventListener("click", () => {
      diaResultadoActivo = el.dataset.dia;
      renderizarPantallaResultados();
    });
  });
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

  // Solo se muestran partidos con señal real (Confiable / Radar Alto /
  // Radar) -- los que salen "Sin señal" o "Muestra insuficiente" se
  // esconden de esta pantalla a proposito: no aportan nada a la hora de
  // elegir un partido, solo eran ruido.
  const conSenal = picks.filter(p => p.nivel === "CONFIABLE" || p.nivel === "RADAR_ALTO" || p.nivel === "RADAR");

  if (conSenal.length === 0) {
    resultadosDiv.innerHTML = `<div class="info-card">Ningun partido con señal clara para este dia (se analizaron ${picks.length}, ninguno califico como Confiable o Radar).</div>`;
    return;
  }

  let html = `<div class="info-card"><strong>${conSenal.length}</strong> partido${conSenal.length === 1 ? "" : "s"} con señal para este dia.</div>`;

  const porLiga = {};
  conSenal.forEach(p => {
    if (!porLiga[p.liga_nombre]) porLiga[p.liga_nombre] = [];
    porLiga[p.liga_nombre].push(p);
  });

  Object.keys(porLiga).sort().forEach(liga => {
    html += `<p class="liga-nombre">${liga}</p>`;
    porLiga[liga].forEach(p => {
      const fecha = new Date(p.fecha_partido);
      const horaStr = fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      const nc = nivelClases(p.nivel);
      const esTriple = p.cumple_filtro_triple === true;
      const claseTriple = esTriple ? " partido-card-triple" : "";

      html += `<div class="partido-card ${nc.borde}${claseTriple}">`;
      if (esTriple) {
        html += `<div class="filtro-triple-banner">Cumple el filtro triple -- alta precision historica</div>`;
      }
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
      if (p.valor_vs_mercado !== null && p.valor_vs_mercado !== undefined) {
        const vpp = (p.valor_vs_mercado * 100).toFixed(1);
        const signo = p.valor_vs_mercado >= 0 ? '+' : '';
        html += `<div class="partido-dato"><span>Valor vs mercado</span><strong>${signo}${vpp}pp</strong></div>`;
      }
      if (p.btts_mercado_pct !== null && p.btts_mercado_pct !== undefined) {
        html += `<div class="partido-dato"><span>BTTS mercado (justo)</span><strong>${p.btts_mercado_pct}%</strong></div>`;
        html += `<div class="partido-dato"><span>Margen del mercado (vig)</span><strong>${p.vig_mercado_pct}%</strong></div>`;
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
        const badge = p.sobre_mediana_liga === true ? '<span class="badge-inline">Sobre promedio de su liga</span>' : '';
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
