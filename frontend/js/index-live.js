import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { fetchStorage } from "./storageProxy.js";

const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig) {
  throw new Error("Firebase config mancante. Crea frontend/js/firebase-config.js dal file di esempio.");
}

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const fromSelect = document.getElementById("fromStation");
const toSelect = document.getElementById("toStation");
const searchButton = document.getElementById("search-button");
const statusBox = document.getElementById("status-box");
const resultBox = document.getElementById("result-box");
const linesList = document.getElementById("lines-list");
const form = document.getElementById("search-form");

function setStatus(message, variant = "info") {
  if (!statusBox) return;
  statusBox.className = `alert alert-${variant} mb-4`;
  statusBox.textContent = message;
}

function toggleForm(enabled) {
  [fromSelect, toSelect, searchButton].forEach((el) => {
    if (!el) return;
    el.disabled = !enabled;
  });
}

async function fetchJsonFromStorage(path) {
  const url = await getDownloadURL(ref(storage, path));
  const response = await fetchStorage(url, { cache: "no-store" });
  return response.json();
}

function normalizeStations(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.stations)) return payload.stations;
  if (Array.isArray(payload?.data?.stations)) return payload.data.stations;
  if (payload && typeof payload === "object") {
    const values = Object.values(payload).filter((item) => item && typeof item === "object");
    if (values.length) return values;
  }
  return [];
}

function normalizeLines(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.lines)) return payload.lines;
  if (payload && typeof payload === "object") {
    const values = Object.values(payload).filter((item) => item && typeof item === "object");
    if (values.length) return values;
  }
  return [];
}

function formatStationLabel(station) {
  const primary = station.name || station.title || station.id || "Stazione";
  const city = station.city || station.province || station.region;
  return city ? `${primary} – ${city}` : primary;
}

function populateStations(stations) {
  const sorted = [...stations].sort((a, b) => {
    const left = (a.name || a.title || a.id || "").toString();
    const right = (b.name || b.title || b.id || "").toString();
    return left.localeCompare(right, "it", { sensitivity: "base" });
  });

  [fromSelect, toSelect].forEach((select) => {
    if (!select) return;
    select.innerHTML = '<option value="">Seleziona una stazione...</option>';
    sorted.forEach((station) => {
      const option = document.createElement("option");
      option.value = station.id || station.code || station.station_id || station.name || "";
      option.textContent = formatStationLabel(station);
      select.appendChild(option);
    });
  });
}

function renderLines(lines) {
  if (!linesList) return;
  linesList.innerHTML = "";

  if (!lines.length) {
    linesList.innerHTML = '<span class="text-muted small">Nessuna linea trovata</span>';
    return;
  }

  lines.forEach((line) => {
    const badge = document.createElement("span");
    badge.className = "badge rounded-pill badge-line";
    const color = (line.color || line.colour || "").toString().trim();
    if (color.startsWith("#") && (color.length === 4 || color.length === 7)) {
      badge.style.borderColor = color;
      badge.style.backgroundColor = `${color}1A`;
    }
    badge.textContent = line.name || line.label || line.id || "Linea";
    linesList.appendChild(badge);
  });
}

function updateButtonState() {
  if (!searchButton) return;
  searchButton.disabled = !(fromSelect?.value && toSelect?.value);
}

async function loadData() {
  setStatus("Carico stazioni e linee...", "info");
  toggleForm(false);

  try {
    const [stationsPayload, linesPayload] = await Promise.all([
      fetchJsonFromStorage("meta/stations_list.json"),
      fetchJsonFromStorage("meta/lines.json"),
    ]);

    const stations = normalizeStations(stationsPayload);
    const lines = normalizeLines(linesPayload);

    if (!stations.length) {
      throw new Error("Nessuna stazione trovata nel bucket");
    }

    populateStations(stations);
    renderLines(lines);
    toggleForm(true);
    updateButtonState();
    setStatus("Tutto pronto: seleziona partenza e arrivo.", "success");
  } catch (error) {
    console.error("Impossibile caricare i dati dallo Storage:", error);
    setStatus("Errore nel caricare i dati dal bucket. Riprova più tardi.", "danger");
    toggleForm(false);
  }
}

function showResult() {
  if (!resultBox) return;
  const fromLabel = fromSelect.options[fromSelect.selectedIndex]?.textContent || "";
  const toLabel = toSelect.options[toSelect.selectedIndex]?.textContent || "";
  resultBox.className = "alert alert-secondary mt-4";
  resultBox.textContent = `Percorso selezionato: ${fromLabel} → ${toLabel}.`;
  resultBox.classList.remove("d-none");
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!fromSelect?.value || !toSelect?.value) {
      setStatus("Seleziona sia la partenza sia l'arrivo per procedere.", "warning");
      return;
    }
    showResult();
  });
}

fromSelect?.addEventListener("change", updateButtonState);
toSelect?.addEventListener("change", updateButtonState);

loadData();
