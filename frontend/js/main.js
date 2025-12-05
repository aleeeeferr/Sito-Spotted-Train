import { fetchStations, fetchDepartures, fetchAlerts } from "./firebaseApi.js";

// --- VARIABILI GLOBALI ---
let stations = [];
let currentStation = null;
let currentDestination = null;
const liveStatusEl = document.getElementById("live-status");
const datasetLabelEl = document.getElementById("dataset-label");
const refreshButton = document.getElementById("refresh-btn");
const stationSelectEl = document.getElementById("station-select");
const destinationSelectEl = document.getElementById("destination-select");

const CATEGORY_LABELS = {
  DD: "Direttissimo",
  A: "Accelerato",
  D: "Diretto",
  EXP: "Campania Express",
  R: "Regionale",
};

// --- INIZIALIZZAZIONE ---
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Caricamento del sito Spotted Train...");
  
  // Carica le stazioni
  await loadStations();
  
  // Imposta gli event listener
  setupEventListeners();
  
  console.log("Sito caricato con successo!");
});

// --- CARICA STAZIONI ---
async function loadStations() {
  try {
    console.log("Caricamento stazioni da Firebase...");
    stations = await fetchStations();
    console.log(`Stazioni caricate: ${stations.length}`);

    // Popola il dropdown delle stazioni
    if (stationSelectEl) {
      stationSelectEl.innerHTML = '<option value="">Seleziona una stazione...</option>';
      stations.forEach((station) => {
        const option = document.createElement("option");
        option.value = station.id;
        option.textContent = station.name || station.id;
        stationSelectEl.appendChild(option);
      });
    }

    // Popola il filtro destinazione (opzionale)
    if (destinationSelectEl) {
      destinationSelectEl.innerHTML = '<option value="">Tutte</option>';
      stations.forEach((station) => {
        const option = document.createElement("option");
        option.value = station.id;
        option.textContent = station.name || station.id;
        destinationSelectEl.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Errore nel caricamento delle stazioni:", error);
    showError("Errore nel caricamento delle stazioni");
    setLiveStatus("Impossibile caricare le stazioni. Riprova.");
  }
}

// --- CARICA PARTENZE ---
async function loadDepartures(stationId, destinationId = null) {
  try {
    if (stationId) {
      setLiveStatus("Carico le partenze in tempo reale...");
    }
    console.log(`Caricamento partenze per stazione: ${stationId}`);
    const result = await fetchDepartures(stationId, { destinationId });
    console.log(
      `Partenze live: ${result.live?.departures.length || 0} | cache: ${result.cache?.departures.length || 0}`
    );
    
    displayDepartures(result);
    updateDatasetLabel(result);
    const refreshedAt = result?.live?.generated_at || result?.cache?.generated_at;
    if (refreshedAt) {
      setLiveStatus(`Ultimo aggiornamento: ${formatTimestamp(refreshedAt)}`);
    } else {
      setLiveStatus("Tabellone aggiornato.");
    }
  } catch (error) {
    console.error("Errore nel caricamento delle partenze:", error);
    showError("Errore nel caricamento delle partenze");
    setLiveStatus("Errore nel caricamento. Riprova.");
  }
}

// --- CARICA AVVISI ---
async function loadAlerts() {
  try {
    console.log("Caricamento avvisi da Firebase...");
    const result = await fetchAlerts();
    console.log(`Avvisi caricati: ${result.items.length}`);
    
    displayAlerts(result.items);
  } catch (error) {
    console.error("Errore nel caricamento degli avvisi:", error);
    showError("Errore nel caricamento degli avvisi");
  }
}

// --- VISUALIZZA PARTENZE ---
function displayDepartures(result) {
  const container = document.getElementById("departures-container");
  if (!container) return;

  const liveSection = renderDepartureSection("Live", result?.live);
  const cacheSection = renderDepartureSection("Cache", result?.cache);

  if (!liveSection && !cacheSection) {
    container.innerHTML = '<p class="text-gray-500">Nessuna partenza disponibile</p>';
    return;
  }

  container.innerHTML = `${liveSection || ""}${cacheSection || ""}`;
  updateDatasetLabel(result);
}

function renderDepartureSection(label, dataset) {
  if (!dataset) return "";

  const departures = dataset.departures || [];
  const timestamp = dataset.generated_at
    ? `Aggiornato: ${formatTimestamp(dataset.generated_at)}`
    : "Aggiornamento non disponibile";

  const body = departures.length
    ? departures.map(renderDepartureCard).join("")
    : `<p class="section-empty">Nessuna partenza ${label.toLowerCase()} disponibile</p>`;

  const sectionType = label.toLowerCase();

  return `
    <section class="departure-section ${sectionType}">
      <div class="section-header">
        <h3 class="section-title">${label}</h3>
        <span class="section-timestamp">${timestamp}</span>
      </div>
      <div class="section-list">
        ${body}
      </div>
    </section>
  `;
}

function getCurrentStationName() {
  const match = stations.find((s) => s.id === currentStation);
  return match?.name || currentStation || "";
}

function renderDepartureCard(dep) {
  const isLive = dep.source === "live";
  const sourceLabel = isLive ? "Live" : "Cache";
  const categoryText = formatCategory(dep.category);
  const trackingKey = buildTrackingKey(dep);
  const originName = getCurrentStationName();
  return `
    <div class="departure-card" data-source="${dep.source || 'cache'}">
      <div class="departure-badges">
        <span class="source-pill ${dep.source || 'cache'}">${sourceLabel}</span>
        ${
          trackingKey
            ? `<button type="button" class="follow-train-btn" data-follow-train data-tracking-key="${escapeHtml(
                trackingKey
              )}" data-destination="${escapeHtml(dep.destination || dep.final_destination || '')}" data-origin="${escapeHtml(
                originName
              )}" data-train-id="${escapeHtml(dep.train_id || '')}">Segui</button>`
            : ""
        }
      </div>
      <div class="departure-time">${dep.time}</div>
      <div class="departure-info">
        <div class="departure-destination">${dep.destination || dep.final_destination}</div>
        <div class="departure-category">${categoryText}</div>
      </div>
      ${renderTrackAndDelay(dep, isLive)}
    </div>
  `;
}

function buildTrackingKey(dep) {
  const trainId = dep.train_id ? dep.train_id.toString().toLowerCase() : "";
  const time = dep.time ? dep.time.toLowerCase() : "";
  const destination = dep.destination ? dep.destination.toLowerCase() : "";
  if (!trainId && !time && !destination) return "";
  return [trainId, time, destination].filter(Boolean).join(" ").trim();
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return match;
    }
  });
}

function renderTrackAndDelay(dep, isLive) {
  if (!isLive) {
    return "";
  }
  return `
    <div class="departure-track">
      <span class="label">Binario:</span>
      <span class="value">${dep.track || "-"}</span>
    </div>
    <div class="departure-delay ${dep.delay > 0 ? 'delay' : 'on-time'}">
      ${dep.delay > 0 ? `Ritardo: +${dep.delay} min` : 'In orario'}
    </div>
  `;
}

function formatCategory(code) {
  if (!code) return "";
  const label = CATEGORY_LABELS[code] || "";
  return label ? `Categoria: ${code} – ${label}` : `Categoria: ${code}`;
}

function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return value;
  }
}

const ALERT_PRIORITY = ["Ritardi", "Soppressioni", "Scioperi", "Avvisi"];

// --- VISUALIZZA AVVISI ---
function displayAlerts(alerts) {
  const container = document.getElementById("alerts-container");
  if (!container) return;
  
  const valid = (alerts || []).filter((alert) => Boolean(alert?.descrizione || alert?.description));

  if (!valid.length) {
    container.innerHTML = '<p class="text-gray-500">Nessun avviso disponibile</p>';
    return;
  }
  
  const groups = groupAlertsByCategory(valid);
  container.innerHTML = groups.map(renderAlertGroup).join("");
}

function groupAlertsByCategory(alerts) {
  const map = new Map();
  alerts.forEach((alert) => {
    const category = deriveAlertCategory(alert);
    const list = map.get(category) || [];
    list.push(alert);
    map.set(category, list);
  });
  return Array.from(map.entries()).sort(([a], [b]) => {
    const ia = ALERT_PRIORITY.indexOf(a);
    const ib = ALERT_PRIORITY.indexOf(b);
    return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
  });
}

function deriveAlertCategory(alert) {
  const explicitCategory = Array.isArray(alert.categorie) && alert.categorie.length
    ? alert.categorie[0]
    : alert.categoria || alert.category;
  if (explicitCategory) {
    const normalized = explicitCategory.toLowerCase();
    if (normalized.includes("ritard")) return "Ritardi";
    if (normalized.includes("soppress")) return "Soppressioni";
    if (normalized.includes("scioper")) return "Scioperi";
  }

  const rawText = `${alert.titolo || ""} ${alert.descrizione || ""}`.toLowerCase();
  if (rawText.includes("scioper")) return "Scioperi";
  if (rawText.includes("soppress")) return "Soppressioni";
  if (rawText.includes("ritard")) return "Ritardi";

  return "Avvisi";
}

function formatCategoryLabel(value) {
  if (!value) return "Altro";
  const label = value.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderAlertGroup([label, alerts]) {
  return `
    <section class="alert-section">
      <h3 class="alert-section-title">${label}</h3>
      <div class="alert-section-list">
        ${alerts.map(renderAlertCard).join("")}
      </div>
    </section>
  `;
}

function renderAlertCard(alert) {
  const description = (alert.descrizione || alert.description || "").trim();
  if (!description) {
    return "";
  }
  const snippet = truncateText(description, 180);
  const date = formatAlertDate(alert.data || alert.date || alert.createdAt);
  const typeClass = (alert.tipo || "info").toLowerCase();

  return `
    <details class="alert-card ${typeClass}">
      <summary>
        <div class="alert-header">
          <h3 class="alert-title">${alert.titolo || alert.title || "Avviso"}</h3>
          <span class="alert-type">${alert.tipo || "info"}</span>
        </div>
        <p class="alert-snippet">${snippet}</p>
        <div class="alert-footer">
          <span class="alert-line">${alert.linea || alert.line || ""}</span>
          <span class="alert-date">${date}</span>
        </div>
      </summary>
      <div class="alert-full">
        <p>${description || "Nessun dettaglio disponibile."}</p>
      </div>
    </details>
  `;
}

function truncateText(text, maxLength = 160) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function formatAlertDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

// --- MOSTRA ERRORE ---
function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

function setLiveStatus(message) {
  if (liveStatusEl) {
    liveStatusEl.textContent = message;
  }
}

function updateDatasetLabel(result) {
  if (!datasetLabelEl) return;
  const live = result?.live?.departures?.length || 0;
  const cache = result?.cache?.departures?.length || 0;

  if (live) {
    datasetLabelEl.textContent = `Live · ${live}`;
    datasetLabelEl.classList.add("success");
  } else if (cache) {
    datasetLabelEl.textContent = `Cache · ${cache}`;
    datasetLabelEl.classList.remove("success");
  } else {
    datasetLabelEl.textContent = "--";
    datasetLabelEl.classList.remove("success");
  }
}

// --- SETUP EVENT LISTENER ---
function setupEventListeners() {
  // Cambio stazione
  if (stationSelectEl) {
    stationSelectEl.addEventListener("change", (e) => {
      currentStation = e.target.value;
      if (currentStation) {
        loadDepartures(currentStation, currentDestination);
        setLiveStatus("Tabellone in aggiornamento...");
      }
    });
  }
  
  // Cambio destinazione
  if (destinationSelectEl) {
    destinationSelectEl.addEventListener("change", (e) => {
      currentDestination = e.target.value;
      if (currentStation) {
        loadDepartures(currentStation, currentDestination);
      }
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      if (!currentStation) {
        setLiveStatus("Seleziona una stazione per vedere gli orari.");
        return;
      }
      loadDepartures(currentStation, currentDestination);
    });
  }

  const departuresContainer = document.getElementById("departures-container");
  if (departuresContainer) {
    departuresContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-follow-train]");
      if (!button) return;

      const key = button.getAttribute("data-tracking-key");
      const trainId = button.getAttribute("data-train-id") || "";
      if (!key && !trainId) return;
      const destination = button.getAttribute("data-destination") || "";
      const origin = button.getAttribute("data-origin") || "";

      const url = new URL("/pages/tracking.html", window.location.origin);
      if (key) {
        url.searchParams.set("key", key);
      }
      if (destination) {
        url.searchParams.set("dest", destination);
      }
      if (origin) {
        url.searchParams.set("origin", origin);
      }
      if (trainId) {
        url.searchParams.set("train", trainId);
      }
      window.open(url.toString(), "_blank");
    });
  }

  // Carica avvisi quando si clicca sulla pagina avvisi
  const alertsTab = document.getElementById("alerts-tab");
  if (alertsTab) {
    alertsTab.addEventListener("click", () => {
      loadAlerts();
    });
  }
  
  // Ricarica automatica ogni 30 secondi
  setInterval(() => {
    if (currentStation) {
      loadDepartures(currentStation, currentDestination);
    }
  }, 30000);
}

// Esporta le funzioni per uso esterno
window.loadDepartures = loadDepartures;
window.loadAlerts = loadAlerts;
