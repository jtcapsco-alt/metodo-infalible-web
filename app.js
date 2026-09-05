// Cuando corras esto LOCAL, el backend vive en localhost:8000.
const API_URL = "http://localhost:8000";

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
    ligaSelect.innerHTML = '<option value="">Error: revisa que el backend este corriendo</option>';
    console.error(err);
  }
}

async function consultarPartidos() {
  const ligaId = ligaSelect.value;
  if (!ligaId) {
    resultadosDiv.innerHTML = "";
    return;
  }

  const opt = ligaSelect.selectedOptions[0];
  ligaInfo.textContent = `Over 2.5 historico de esta liga: ${(opt.dataset.rate * 100).toFixed(1)}%`;

  const dias = diasSelect.value;
  loading.style.display = "block";
  resultadosDiv.innerHTML = "";

  try {
    const resp = await fetch(`${API_URL}/leagues/${ligaId}/upcoming?days_ahead=${dias}`);
    const data = await resp.json();

    if (!resp.ok) {
      resultadosDiv.innerHTML = `<div class="card resultado no-senal"><p>⚠️ ${data.detail || "Error consultando esta liga"}</p></div>`;
      return;
    }

    mostrarResultados(data);
  } catch (err) {
    resultadosDiv.innerHTML = `<div class="card resultado no-senal"><p>⚠️ Error de conexion con el backend</p></div>`;
    console.error(err);
  } finally {
    loading.style.display = "none";
  }
}

function mostrarResultados(data) {
  if (data.total_analizados === 0) {
    resultadosDiv.innerHTML = `<div class="card"><p class="info-text">No hay partidos programados con cuota disponible en este rango de dias (se encontraron ${data.total_partidos_encontrados} partidos en total, pero sin cuota publicada todavia).</p></div>`;
    return;
  }

  const conSenal = data.todos_los_partidos.filter(p => p.califica_como_senal).length;
  let html = `<div class="card"><p class="info-text"><strong>${conSenal}</strong> de ${data.total_analizados} partidos analizados tienen alguna señal (confiable o en el radar) en ${data.liga}.</p></div>`;

  // Orden puramente cronologico
  const ordenados = [...data.todos_los_partidos].sort((a, b) => a.fecha_unix - b.fecha_unix);

  // Agrupar por dia
  let diaActual = null;
  const opcionesFecha = { weekday: "long", day: "numeric", month: "long" };

  ordenados.forEach(p => {
    const fecha = new Date(p.fecha_unix * 1000);
    const diaKey = fecha.toDateString();

    if (diaKey !== diaActual) {
      diaActual = diaKey;
      const diaTexto = fecha.toLocaleDateString("es-ES", opcionesFecha);
      html += `<div class="dia-separador">${diaTexto}</div>`;
    }

    const horaStr = fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const nivelInfo = {
      CONFIABLE: { clase: "nivel-confiable", texto: "🟢 CONFIABLE", badge: "si" },
      RADAR: { clase: "nivel-radar", texto: "🟡 EN EL RADAR", badge: "radar" },
      SIN_SENAL: { clase: "nivel-sin-senal", texto: "— Sin señal", badge: "no" },
      MUESTRA_INSUFICIENTE: { clase: "nivel-sin-senal", texto: "⚪ Muestra insuficiente", badge: "no" },
      SIN_DATOS: { clase: "nivel-sin-senal", texto: "— Sin datos para este rango", badge: "no" },
    }[p.nivel] || { clase: "nivel-sin-senal", texto: "— Sin señal", badge: "no" };

    html += `<div class="card resultado ${nivelInfo.clase}">`;
    html += `<h2>${p.partido}</h2>`;
    html += `<p class="info-text">${horaStr}</p>`;
    html += `<span class="badge ${nivelInfo.badge}">${nivelInfo.texto}</span>`;
    html += `<div class="dato"><span>Probabilidad del sistema</span><strong>${(p.p_final * 100).toFixed(1)}%</strong></div>`;
    html += `<div class="dato"><span>Cuota Over 2.5</span><strong>${p.cuota_over25}</strong></div>`;

    if (p.rango_confianza) {
      const r = p.rango_confianza;
      html += `<div class="dato"><span>Historico por confianza (${r.label})</span><strong>${r.hits}/${r.n} (${r.pct}%)</strong></div>`;
    }
    if (p.rango_cuota) {
      const r = p.rango_cuota;
      html += `<div class="dato"><span>Historico por cuota (${r.min}-${r.max})</span><strong>${r.hits}/${r.n} (${r.pct}%)</strong></div>`;
    }

    if (p.plus_notes && p.plus_notes.length > 0) {
      p.plus_notes.forEach(note => {
        html += `<div class="plus-note">🔸 Plus: ${note.descripcion || note.condition}</div>`;
      });
    }
    html += `</div>`;
  });

  resultadosDiv.innerHTML = html;
}

ligaSelect.addEventListener("change", consultarPartidos);
diasSelect.addEventListener("change", consultarPartidos);

document.getElementById("btn-combo").addEventListener("click", async () => {
  const btn = document.getElementById("btn-combo");
  const div = document.getElementById("combo-resultado");
  btn.textContent = "Analizando las 13 ligas...";
  btn.disabled = true;
  div.innerHTML = "";

  try {
    const resp = await fetch(`${API_URL}/combo-del-dia?days_ahead=2`);
    const data = await resp.json();

    if (data.mensaje) {
      div.innerHTML = `<div class="card"><p class="info-text">${data.mensaje}</p></div>`;
    } else {
      let html = "";
      data.combinadas_por_dia.forEach(c => {
        const fechaObj = new Date(c.dia + "T12:00:00");
        const fechaTexto = fechaObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

        html += `<div class="dia-separador">${fechaTexto}</div>`;

        if (c.mensaje) {
          html += `<div class="card"><p class="info-text">${c.mensaje}</p></div>`;
          return;
        }

        html += `<div class="card resultado nivel-confiable">`;
        html += `<h2>Combinada recomendada</h2>`;
        html += `<div class="dato"><span>Cuota total</span><strong>${c.cuota_total}</strong></div>`;
        html += `<div class="dato"><span>Probabilidad estimada</span><strong>${c.probabilidad_estimada_de_esta_combinada}%</strong></div>`;
        c.picks.forEach(p => {
          html += `<hr style="border-color:#334155;margin:10px 0;">`;
          html += `<p><strong>${p.partido}</strong> (${p.liga})</p>`;
          html += `<div class="dato"><span>Cuota Over 2.5</span><strong>${p.cuota_over25}</strong></div>`;
        });
        html += `</div>`;
      });
      html += `<div class="card"><div class="plus-note">📊 ${data.respaldo_historico}</div></div>`;
      div.innerHTML = html;
    }
  } catch (err) {
    div.innerHTML = `<div class="card"><p class="info-text">⚠️ Error consultando la combinada.</p></div>`;
  } finally {
    btn.textContent = "🎯 Traeme la combinada del día (cuota ~2.0)";
    btn.disabled = false;
  }
});

cargarLigas();
