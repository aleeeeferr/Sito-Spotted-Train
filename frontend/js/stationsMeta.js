import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-check.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { fetchStorage } from "./storageProxy.js";
import { stationIdsByName, stationNameMapping } from "../data/stations.js";

// Config Firebase (Storage + Functions) usato per caricare stazioni, linee e live.
const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig) {
  throw new Error("Firebase config mancante. Crea frontend/js/firebase-config.js dal file di esempio.");
}

const debugToken =
  window.FIREBASE_APPCHECK_DEBUG_TOKEN ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_APPCHECK_DEBUG_TOKEN) ||
  window.APP_CHECK_DEBUG_TOKEN;
if (["localhost", "127.0.0.1"].includes(location.hostname) && debugToken) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
}

const app = initializeApp(firebaseConfig);
const appCheckSiteKey =
  window.FIREBASE_APPCHECK_SITE_KEY ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_APPCHECK_SITE_KEY);
if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

const storage = getStorage(app);
const functions = getFunctions(app, "europe-west1");
const orchestrateStationFn = httpsCallable(functions, "orchestrateStation");

// Lookup rapidi tra nome stazione e id.
const STATION_ID_BY_NAME = Object.fromEntries(
  Object.entries(stationIdsByName).map(([name, id]) => [name, String(id)])
);

const STATION_NAME_BY_ID = Object.entries(STATION_ID_BY_NAME).reduce((acc, [name, id]) => {
  acc[id] = name;
  return acc;
}, {});

function normalizeStationName(raw) {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const key = trimmed
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[().]/g, "")
    .trim();
  const mapped = stationNameMapping[key] || trimmed;
  const canonical = STATION_ID_BY_NAME[mapped] ? mapped : "";
  return canonical || mapped;
}

function normalizeStationId(raw) {
  if (!raw) return "";
  const candidate = typeof raw === "object"
    ? raw.id || raw.code || raw.station_id || raw.name
    : raw;
  if (candidate === undefined || candidate === null) return "";
  const candidateStr = String(candidate).trim();
  if (!candidateStr) return "";
  if (/^\d+$/.test(candidateStr)) return candidateStr;
  const canonical = normalizeStationName(candidateStr);
  return STATION_ID_BY_NAME[canonical] || candidateStr;
}

// Fallback statico usato se i file meta non sono disponibili.
const FALLBACK_LINES = [
  {
    id: "nap-sorr",
    stations: [
      "Napoli Porta Nolana",
      "Napoli Garibaldi",
      "San Giorgio a Cremano",
      "Portici Bellavista",
      "Ercolano Scavi",
      "Torre Del Greco",
      "Torre Annunziata - Oplonti",
      "Villa Regina",
      "Pompei Scavi Villa Dei Misteri",
      "Moregine",
      "Pioppaino",
      "Stabia Scavi",
      "Castellammare Di Stabia",
      "Vico Equense",
      "Seiano",
      "Meta",
      "Piano",
      "Sant'Agnello",
      "Sorrento",
    ],
  },
  {
    id: "nap-poggio",
    stations: [
      "Napoli Porta Nolana",
      "Napoli Garibaldi",
      "Via Gianturco",
      "San Giovanni a Teduccio",
      "Barra",
      "Santa Maria Del Pozzo",
      "San Giorgio a Cremano",
      "Cavalli Di Bronzo",
      "Portici Bellavista",
      "Portici Via Libertà",
      "Ercolano Scavi",
      "Ercolano Miglio D'Oro",
      "Torre Del Greco",
      "Via Sant'Antonio",
      "Via Del Monte",
      "Villa Delle Ginestre",
      "Leopardi",
      "Trecase",
      "Torre Annunziata - Oplonti",
      "Boscotrecase",
      "Boscoreale",
      "Pompei Santuario",
      "Scafati",
      "San Pietro",
      "Via Cangiani",
      "Poggiomarino",
    ],
  },
  {
    id: "nap-sarno",
    stations: [
      "Napoli Porta Nolana",
      "Napoli Garibaldi",
      "Via Gianturco",
      "San Giovanni a Teduccio",
      "Barra",
      "Ponticelli",
      "Vesuvio De Meis (SA)",
      "Cercola",
      "Pollena Trocchia",
      "Guindazzi",
      "Madonna Dell'Arco",
      "Sant'Anastasia",
      "Villa Augustea",
      "Somma Vesuviana",
      "Rione Trieste",
      "Ottaviano",
      "S. Leonardo",
      "San Giuseppe",
      "Casilli",
      "Terzigno",
      "Flocco",
      "Poggiomarino",
      "Striano",
      "San Valentino",
      "Sarno",
    ],
  },
  {
    id: "nap-torre",
    stations: [
      "Napoli Porta Nolana",
      "Napoli Garibaldi",
      "Via Gianturco",
      "San Giovanni a Teduccio",
      "Barra",
      "Santa Maria Del Pozzo",
      "San Giorgio a Cremano",
      "Cavalli Di Bronzo",
      "Portici Bellavista",
      "Portici Via Libertà",
      "Ercolano Scavi",
      "Ercolano Miglio D'Oro",
      "Torre Del Greco",
    ],
  },
  {
    id: "nap-sangiorgio",
    stations: [
      "Napoli Porta Nolana",
      "Napoli Garibaldi",
      "Centro Direzionale",
      "Poggiorale",
      "Botteghelle",
      "Madonnelle",
      "Argine - Palasport",
      "Villa Visconti",
      "Vesuvio De Meis (SGV)",
      "Bartolo Longo",
      "San Giorgio a Cremano",
    ],
  },
  {
    id: "nap-baiano",
    stations: [
      "Napoli Porta Nolana",
      "Napoli Garibaldi",
      "Centro Direzionale",
      "Poggiorale",
      "Botteghelle",
      "Volla",
      "Salice",
      "Casalnuovo",
      "La Pigna",
      "Talona",
      "Pratola Ponte",
      "Pomigliano d’arco",
      "Castelcisterna",
      "Brusciano",
      "De Ruggiero",
      "Via Vittorio Veneto",
      "Marigliano",
      "S.Vitaliano",
      "Scisciano",
      "Saviano",
      "Nola",
      "Cimitile",
      "Camposano",
      "Cicciano",
      "Roccarainola",
      "Avella",
      "Baiano",
    ],
  },
];

const STATIONS_META_PATH = "/meta/station_data.json";
const LINES_META_PATH = "/meta/lines_config.json";
const MIN_SEED_REFRESH_MS = 60000; // throttle orchestrator invocations per stazione
const TRACKING_POLL_MS = 12000; // frequenza polling tracking
const lastStationSeedAt = new Map();

let stationsList = [];
let linesList = [];
let lastSearch = { fromId: "", toId: "" };
const lineFilterEl = document.getElementById("lineFilter");
const resultsStatusEl = document.getElementById("risultati-status");
let trackingState = {
  active: false,
  trainId: "",
  fromId: "",
  toId: "",
  route: [],
  currentIndex: 0,
  intervalId: null,
  finished: false,
  lastMessage: "",
  events: [],
  startedAt: 0,
};

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

function populateSelect(selectEl, stations) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.textContent = "Seleziona una stazione...";
  defaultOption.value = "";
  selectEl.appendChild(defaultOption);

  stations
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "it", { sensitivity: "base" }))
    .forEach((station) => {
      const opt = document.createElement("option");
      opt.value = station.id || station.name || "";
      opt.textContent = station.name || station.id || "Stazione";
      selectEl.appendChild(opt);
    });

  const counter = document.getElementById("stat-stations");
  if (counter) {
    counter.textContent = stations.length ? stations.length : "--";
  }
}

function renderLines(fromId, toId) {
  const container = document.getElementById("linesResult");
  if (!container) return;
  const baseClass = "tag-list";

  if (!fromId && !toId) {
    container.className = `${baseClass} text-muted`;
    container.textContent = "Seleziona le stazioni per vedere le linee possibili.";
    return;
  }

  if (fromId && toId && fromId === toId) {
    container.className = `${baseClass} text-danger`;
    container.textContent = "Partenza e arrivo devono essere diverse.";
    return;
  }

  const matches = linesList.filter((line) => {
    if (!Array.isArray(line.stations)) return false;
    const fromIdx = fromId ? line.stations.indexOf(fromId) : -1;
    const toIdx = toId ? line.stations.indexOf(toId) : -1;

    if (fromId && toId) {
      return fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx;
    }
    if (fromId) {
      return fromIdx !== -1;
    }
    if (toId) {
      return toIdx !== -1;
    }
    return false;
  });

  container.innerHTML = "";
  if (!matches.length) {
    container.className = `${baseClass} text-muted`;
    container.textContent = "Nessuna linea trovata per questa selezione.";
    return;
  }

  container.className = baseClass;
  matches.forEach((line) => {
    const badge = document.createElement("span");
    badge.className = "badge rounded-pill text-bg-light border";
    if (line.color) {
      badge.style.borderColor = line.color;
      badge.style.color = line.color;
    }
    badge.textContent = line.name || line.id;
    container.appendChild(badge);
  });

  console.info(`Linee compatibili (${matches.length}):`, matches.map((l) => l.id || l.name));

  const lineCounter = document.getElementById("stat-lines");
  if (lineCounter) {
    lineCounter.textContent = matches.length ? matches.length : "--";
  }
}

async function fetchStationFile(stationId, filename) {
  if (!stationId) return null;
  const path = `stations/${stationId}/${filename}`;
  const fileRef = ref(storage, path);
  const url = await getDownloadURL(fileRef);
  const cacheSafeUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
  const response = await fetchStorage(cacheSafeUrl);
  return response.json();
}

async function refreshSeedsForStations(stationIds = []) {
  const now = Date.now();
  const jobs = stationIds
    .filter(Boolean)
    .map(async (id) => {
      const last = lastStationSeedAt.get(id) || 0;
      if (now - last < MIN_SEED_REFRESH_MS) {
        return;
      }
      lastStationSeedAt.set(id, now);
      try {
        await orchestrateStationFn({ stationId: id });
      } catch (err) {
        console.warn("Impossibile aggiornare il live per la stazione", id, err);
      }
    });
  await Promise.all(jobs);
}

function extractTrains(payload, type = "departure", source = "cache") {
  if (!payload) return [];
  const rows = Array.isArray(payload?.departures)
    ? payload.departures
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload?.arrivals)
        ? payload.arrivals
        : [];

  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        const trainId = row[0];
        const category = row[1];
        const time = row[3];
        const track = row[4];
        const info = row[5];
        const delayRaw = row[6];
        if (!trainId) return null;
        return {
          id: trainId.toString(),
          category: category || "",
          info: info || "",
          delay: Number(delayRaw) || 0,
          departureTime: type === "departure" ? time || "" : "",
          arrivalTime: type === "arrival" ? time || "" : "",
          track: track?.toString() || "",
          arrivalTrack: type === "arrival" ? track?.toString() || "" : "",
          source,
        };
      }
      if (row && typeof row === "object") {
        const trainId = row.train_id || row.trainId || row.id || row.train || row.tripId;
        if (!trainId) return null;
        return {
          id: trainId.toString(),
          category: row.category || row.type || "",
          info: row.info || row.note || "",
          delay: Number(row.delay) || 0,
          departureTime: row.time || row.departureTime || row.departure_time || "",
          arrivalTime: row.arrivalTime || row.arrival_time || row.time || "",
          track: row.track || row.platform || row.binario || "",
          arrivalTrack: row.arrivalTrack || row.arrival_track || row.track || "",
          source,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function parseTimeToTimestamp(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const normalized = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const today = new Date().toISOString().slice(0, 10);
  const iso = `${today}T${normalized}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function filterUpcoming(trains, referenceTs) {
  const now = typeof referenceTs === "number" ? referenceTs : Date.now();
  const graceMs = 5 * 60 * 1000; // tieni gli ultimi 5 minuti
  return trains.filter((t) => {
    const ts = parseTimeToTimestamp(t.departureTime || t.arrivalTime);
    if (!ts) return false;
    return ts >= now - graceMs;
  });
}

function buildArrivalTimeLookup(arrivals = []) {
  const map = new Map();
  arrivals.forEach((arr) => {
    const key = arr?.id?.toString().toLowerCase();
    if (!key || !arr.arrivalTime) return;
    if (arr.source === "cache") {
      map.set(key, arr.arrivalTime);
      return;
    }
    if (!map.has(key)) {
      map.set(key, arr.arrivalTime);
    }
  });
  return map;
}

function matchTrains(departures, arrivals, referenceTs) {
  const upcomingDeps = filterUpcoming(departures, referenceTs);
  const arrivalTimeById = buildArrivalTimeLookup(arrivals);
  const upcomingArrs = filterUpcoming(arrivals, referenceTs);

  // Se non abbiamo arrivi (es. cache parziale), mostra almeno le partenze filtrate per orario.
  if (!upcomingArrs.length) {
    return upcomingDeps.map((dep) => ({
      id: dep.id,
      departureTime: dep.departureTime || "",
      arrivalTime: arrivalTimeById.get(dep.id?.toString().toLowerCase()) || "",
      track: dep.track || "",
      arrivalTrack: "",
      category: dep.category || "",
      info: dep.info || "",
      delay: dep.delay || 0,
      canTrack: dep.source === "live",
    }));
  }

  const arrivalMap = new Map();
  upcomingArrs.forEach((arr) => {
    const key = arr.id?.toString().toLowerCase();
    if (key) arrivalMap.set(key, arr);
  });

  return upcomingDeps
    .map((dep) => {
      const key = dep.id?.toString().toLowerCase();
      const match = key ? arrivalMap.get(key) : null;
      if (!match) return null;
      return {
        id: dep.id,
        departureTime: dep.departureTime || "",
        arrivalTime: arrivalTimeById.get(key) || match.arrivalTime || match.departureTime || "",
        track: dep.track || "",
        arrivalTrack: match.track || match.arrivalTrack || "",
        category: dep.category || match.category || "",
        info: match.info || dep.info || "",
        delay: Number.isFinite(dep.delay) ? dep.delay : (Number(match.delay) || 0),
        canTrack: dep.source === "live" || match.source === "live",
      };
    })
    .filter(Boolean);
}

function setSearchMessage(message, variant = "info") {
  if (resultsStatusEl) {
    resultsStatusEl.textContent = message;
  }
  const listEl = document.querySelector(".risultati-lista");
  if (listEl) {
    listEl.innerHTML = "";
  }
  const box = document.getElementById("searchResults");
  if (!box) return;
  if (variant === "warning" || variant === "danger") {
    box.classList.remove("attivo");
  } else {
    box.classList.add("attivo");
  }
}

function renderSearchResults(results) {
  if (!results.length) {
    setSearchMessage("Non sono disponibili treni per questa tratta.", "warning");
    return;
  }

  if (resultsStatusEl) {
    resultsStatusEl.textContent = `${results.length} treni trovati.`;
  }

  const listEl = document.querySelector(".risultati-lista");
  if (!listEl) return;
  listEl.innerHTML = results.map(renderResultListItem).join("");
  console.info("Risultati incrociati (partenza/arrivo):", results);
}

function renderResultListItem(item) {
  const delay = Number(item.delay) || 0;
  const delayClass = delay > 0 ? "ritardo-positivo" : delay < 0 ? "ritardo-negativo" : "ritardo-zero";
  const delayText = delay > 0 ? `+${delay}'` : delay < 0 ? `${delay}'` : "In orario";
  const trackValue = item.track || item.arrivalTrack || "-";
  const infoText = item.info ? `<span class="dettaglio info">${escapeHtml(item.info)}</span>` : "";

  return `
    <li>
      <div class="risultato-top">
        <span class="treno">Treno ${escapeHtml(item.id || "")}</span>
        <span class="tipo">${escapeHtml(item.category || "EAV")}</span>
        <span class="ritardo ${delayClass}">${delayText}</span>
      </div>
      <div class="risultato-bottom">
        <span class="dettaglio"><strong>Partenza</strong> ${escapeHtml(item.departureTime || "--:--")}</span>
        <span class="dettaglio"><strong>Arrivo</strong> ${escapeHtml(item.arrivalTime || "--:--")}</span>
        <span class="dettaglio"><strong>Binario</strong> ${escapeHtml(trackValue)}</span>
        ${infoText}
      </div>
    </li>
  `;
}

function renderResultCard(item) {
  const delayBadge = buildDelayBadge(item);
  const infoText = item.info ? `<div class="train-info">${escapeHtml(item.info)}</div>` : "";
  const category = item.category
    ? `<span class="pill pill-soft pill-compact">${escapeHtml(item.category)}</span>`
    : "";
  const duration = item.arrivalTime ? formatDuration(item.departureTime, item.arrivalTime) : "";
  const durationText = duration ? `<span class="pill pill-ghost">${duration}</span>` : "";
  const followButton = item.canTrack
    ? `<button class="btn btn-primary btn-follow" data-follow-train="${escapeHtml(item.id || "")}">Apri tracking live</button>`
    : "";
  const arrivalChip = `<span class="meta-chip"><span class="meta-label">Arrivo</span>${escapeHtml(item.arrivalTime || "--:--")}</span>`;
  const trackValue = item.track || item.arrivalTrack || "";
  const trackChip = `<span class="meta-chip"><span class="meta-label">Binario</span>${escapeHtml(trackValue || "--")}</span>`;

  return `
    <div class="train-card">
      <div class="train-card__main">
        <div>
          <div class="train-title">Treno ${escapeHtml(item.id || "")}</div>
          <div class="train-meta">
            <span class="meta-chip"><span class="meta-label">Partenza</span>${escapeHtml(item.departureTime || "--:--")}</span>
            ${arrivalChip}
            ${trackChip}
          </div>
          ${infoText}
        </div>
        <div class="train-card__badges">
          <div class="pill-stack">${category}${delayBadge || ""}${durationText}</div>
          ${followButton}
        </div>
      </div>
    </div>
  `;
}

function buildDelayBadge(item) {
  const info = (item.info || "").toString().toLowerCase();
  const delay = Number(item.delay) || 0;

  if (info.includes("soppress")) {
    return `<span class="pill pill-ghost" style="color:#b91c1c;border-color:#fecdd3;background:#fef2f2;">Soppresso</span>`;
  }
  if (delay > 0 && delay <= 5) {
    return `<span class="pill pill-ghost" style="color:#b45309;border-color:#fcd34d;background:#fffbeb;">+${delay} min</span>`;
  }
  if (delay > 5) {
    return `<span class="pill pill-ghost" style="color:#4b5563;border-color:#e5e7eb;background:#f3f4f6;">+${delay} min</span>`;
  }
  return `<span class="pill pill-ghost" style="color:#166534;border-color:#bbf7d0;background:#ecfdf3;">In orario</span>`;
}

function formatDuration(depTime, arrTime) {
  const depTs = parseTimeToTimestamp(depTime);
  const arrTs = parseTimeToTimestamp(arrTime);
  if (!depTs || !arrTs || arrTs < depTs) return "";
  const minutes = Math.round((arrTs - depTs) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return `Durata ${minutes} min`;
}

async function checkStationsMeta() {
  try {
    const path = STATIONS_META_PATH.startsWith("/")
      ? STATIONS_META_PATH.slice(1)
      : STATIONS_META_PATH;
    const fileRef = ref(storage, path);
    const url = await getDownloadURL(fileRef);
    const cacheSafeUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
    const response = await fetchStorage(cacheSafeUrl);
    const data = await response.json();
    stationsList = Array.isArray(data?.stations) ? data.stations : [];
    const count = stationsList.length;
    console.info(`Stazioni caricate: ${count}`);
    populateSelect(document.getElementById("fromStation"), stationsList);
    populateSelect(document.getElementById("toStation"), stationsList);
    if (count > 0) {
      console.debug("Prime 3 stazioni:", stationsList.slice(0, 3));
    }
  } catch (error) {
    console.error("Errore nel download di meta/station_data.json:", error);
  }
}

async function checkLinesMeta() {
  try {
    const path = LINES_META_PATH.startsWith("/")
      ? LINES_META_PATH.slice(1)
      : LINES_META_PATH;
    const fileRef = ref(storage, path);
    const url = await getDownloadURL(fileRef);
    const cacheSafeUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
    const response = await fetchStorage(cacheSafeUrl);
    const data = await response.json();
    linesList = Array.isArray(data?.lines) ? data.lines : [];
    linesList = linesList.map((line) => ({
      ...line,
      stations: Array.isArray(line?.stations)
        ? line.stations.map((station) => normalizeStationId(station)).filter(Boolean)
        : [],
    }));
    console.info(`Linee caricate: ${linesList.length}`);
    populateLineFilter();
  } catch (error) {
    console.error("Errore nel download di meta/lines_config.json:", error);
    populateLineFilter(true); // fallback
  }
}

function setupSelectionListener() {
  const fromSelect = document.getElementById("fromStation");
  const toSelect = document.getElementById("toStation");
  const swapBtn = document.getElementById("swapStations") || document.querySelector(".swap-btn");
  if (!fromSelect || !toSelect) return;

  const handler = () => {
    const fromId = fromSelect.value;
    const toId = toSelect.value;
    renderLines(fromId, toId);
  };

  fromSelect.addEventListener("change", handler);
  toSelect.addEventListener("change", handler);

  if (swapBtn) {
    swapBtn.addEventListener("click", () => {
      const fromVal = fromSelect.value;
      const toVal = toSelect.value;
      fromSelect.value = toVal;
      toSelect.value = fromVal;
      handler();
    });
  }

  if (lineFilterEl) {
    lineFilterEl.addEventListener("change", () => {
      renderLineStations(lineFilterEl.value);
    });
  }
}

function setupSearchHandler() {
  // Gestisce la ricerca per tratta/orario e mostra i risultati.
  const fromSelect = document.getElementById("fromStation");
  const toSelect = document.getElementById("toStation");
  const searchBtn = document.getElementById("searchBtn");
  const resetBtn = document.getElementById("btn-reset");
  const timeInput = document.getElementById("searchTime") || document.getElementById("ora");
  if (!fromSelect || !toSelect || !searchBtn) return;

  const adjustTimeByMinutes = (deltaMinutes) => {
    if (!timeInput) return;
    const now = new Date();
    const value = timeInput.value || "";
    const hours = Number(value.slice(0, 2));
    const minutes = Number(value.slice(3, 5));
    if (Number.isFinite(hours)) now.setHours(hours);
    if (Number.isFinite(minutes)) now.setMinutes(minutes);
    now.setMinutes(now.getMinutes() + deltaMinutes);
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    timeInput.value = `${hh}:${mm}`;
  };

  if (timeInput && !timeInput.value) {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    timeInput.value = `${hh}:${mm}`;
  }

  const quickButtons = document.querySelectorAll(".btn-rapido");
  quickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.textContent || "";
      const delta = label.includes("-") ? -30 : 30;
      adjustTimeByMinutes(delta);
    });
  });

  searchBtn.addEventListener("click", async () => {
    const fromId = fromSelect.value;
    const toId = toSelect.value;
    const timeValue = timeInput?.value?.trim();
    const referenceTs = timeValue ? parseTimeToTimestamp(timeValue) : null;
    const isPastSearch = referenceTs ? referenceTs < Date.now() - 5 * 60 * 1000 : false;
    console.info("Ricerca tratta selezionata:", { partenza: fromId, arrivo: toId });
    if (!fromId || !toId) {
      setSearchMessage("Seleziona sia la stazione di partenza che quella di arrivo.", "warning");
      return;
    }
    if (fromId === toId) {
      setSearchMessage("Partenza e arrivo devono essere diverse.", "warning");
      return;
    }
    lastSearch = { fromId, toId };
    const defaultLabel = searchBtn.dataset.label || searchBtn.innerHTML;
    searchBtn.dataset.label = defaultLabel;
    searchBtn.disabled = true;
    searchBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Ricerca...`;
    setSearchMessage("Ricerca in corso...", "info");
    try {
      await refreshSeedsForStations([fromId, toId]);
      const optionalFetch = (stationId, file) =>
        fetchStationFile(stationId, file).catch(() => null);

      const departures = [];
      const arrivals = [];

      if (isPastSearch) {
        // Orario nel passato: usa la cache delle partenze.
        const depCache = await optionalFetch(fromId, "departures.json");
        departures.push(...(extractTrains(depCache, "departure", "cache") || []));
      }

      if (!departures.length) {
        // Fallback live se la cache non basta.
        const depLive = await optionalFetch(fromId, "_live.json");
        departures.push(...(extractTrains(depLive, "departure", "live") || []));
      }

      if (!isPastSearch) {
        const arrLive = await optionalFetch(toId, "_live_arrivals.json");
        arrivals.push(...(extractTrains(arrLive, "arrival", "live") || []));
      }

      const matches = matchTrains(departures, arrivals, referenceTs);
      renderSearchResults(matches);
    } catch (error) {
      console.error("Errore nella ricerca dei treni:", error);
      setSearchMessage("Errore nel recupero dei dati. Riprova più tardi.", "danger");
    } finally {
      searchBtn.disabled = false;
      searchBtn.innerHTML = searchBtn.dataset.label || "Cerca";
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      fromSelect.selectedIndex = 0;
      toSelect.selectedIndex = 0;
      setSearchMessage("Seleziona una stazione e premi Cerca.", "info");
      renderLines("", "");
    });
  }
}

async function init() {
  // Avvio: carica metadata, prepara UI e listener.
  await Promise.all([checkStationsMeta(), checkLinesMeta()]);
  setupSelectionListener();
  renderLines("", "");
  setupSearchHandler();
  setupFollowHandler();
}

init();

function populateLineFilter() {
  if (!lineFilterEl) return;
  lineFilterEl.innerHTML = '<option value="">Tutte</option>';
  let source = [...linesList];
  if (!source.length) {
    // Fallback a linee statiche se il manifest non è disponibile.
    source = FALLBACK_LINES.map((line) => ({
      id: line.id,
      name: `${line.id.toUpperCase()} – ${line.stations[0]} → ${line.stations[line.stations.length - 1]}`,
      stations: line.stations
        .map((name) => normalizeStationId(name))
        .filter(Boolean),
    }));
  }
  const sorted = source.sort((a, b) =>
    (a.name || a.id || "").toString().localeCompare((b.name || b.id || "").toString(), "it", { sensitivity: "base" })
  );
  sorted.forEach((line) => {
    const opt = document.createElement("option");
    opt.value = line.id || line.name || "";
    opt.textContent = line.name || line.id || "";
    lineFilterEl.appendChild(opt);
  });
}

function renderLineStations(lineId) {
  const container = document.getElementById("lineStations");
  if (!container) return;
  if (!lineId) {
    container.textContent = "Seleziona una linea per vedere le stazioni.";
    container.className = "tag-list text-muted";
    return;
  }
  const line = linesList.find((l) => (l.id || l.name || "") === lineId);
  if (!line || !Array.isArray(line.stations) || !line.stations.length) {
    container.textContent = "Nessuna stazione trovata per questa linea.";
    container.className = "tag-list text-muted";
    return;
  }
  container.className = "tag-list";
  container.innerHTML = line.stations
    .map((id) => `<span class="pill pill-soft">${escapeHtml(getStationName(id))}</span>`)
    .join("");
}

function setupFollowHandler() {
  const resultsBox = document.getElementById("searchResults");
  if (!resultsBox) return;
  resultsBox.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-follow-train]");
    if (!btn) return;
    const trainId = btn.getAttribute("data-follow-train");
    if (!trainId) return;
    if (!lastSearch.fromId || !lastSearch.toId) {
      setSearchMessage("Prima seleziona una tratta e avvia la ricerca.", "warning");
      return;
    }
    const url = new URL("/pages/tracking.html", window.location.origin);
    url.searchParams.set("train", trainId);
    url.searchParams.set("from", lastSearch.fromId);
    url.searchParams.set("to", lastSearch.toId);
    window.open(url.toString(), "_blank");
  });
}

function startTracking(trainId, fromId, toId) {
  if (!trainId || !fromId || !toId) return;
  clearTracking();

  const route = buildRoute(fromId, toId);
  trackingState = {
    active: true,
    trainId,
    fromId,
    toId,
    route,
    currentIndex: 0,
    intervalId: null,
    finished: false,
    lastMessage: "Tracking avviato.",
    events: [],
    startedAt: Date.now(),
  };
  console.info(
    "Percorso monitorato:",
    route.map((id) => getStationName(id)).join(" → ")
  );
  renderTrackingPanel();
  pollTracking(); // immediate
  trackingState.intervalId = setInterval(pollTracking, TRACKING_POLL_MS);
}

function clearTracking() {
  if (trackingState.intervalId) {
    clearInterval(trackingState.intervalId);
  }
  trackingState = {
    active: false,
    trainId: "",
    fromId: "",
    toId: "",
    route: [],
    currentIndex: 0,
    intervalId: null,
    finished: false,
    lastMessage: "",
    events: [],
    startedAt: 0,
  };
}

function buildRoute(fromId, toId) {
  // 1) linee da manifest (lines_config)
  const configMatch = findRouteInList(linesList, fromId, toId);
  if (configMatch.length) return configMatch;

  // 2) linee fallback statiche
  const fallbackLines = FALLBACK_LINES.map((line) => ({
    id: line.id,
    stations: line.stations
      .map((name) => normalizeStationId(name))
      .filter(Boolean),
  }));
  const fallbackMatch = findRouteInList(fallbackLines, fromId, toId);
  if (fallbackMatch.length) return fallbackMatch;

  // 3) fallback minimo
  return [fromId, toId];
}

function findRouteInList(lines, fromId, toId) {
  for (const line of lines) {
    if (!Array.isArray(line.stations)) continue;
    const startIdx = line.stations.indexOf(fromId);
    const endIdx = line.stations.indexOf(toId);
    if (startIdx !== -1 && endIdx !== -1) {
      if (startIdx < endIdx) {
        return line.stations.slice(startIdx, endIdx + 1);
      }
      if (startIdx > endIdx) {
        return line.stations.slice(endIdx, startIdx + 1).reverse();
      }
    }
  }
  return [];
}

function getStationName(id) {
  const key = String(id);
  const found = stationsList.find((s) => String(s.id) === key);
  if (found?.name) return found.name;
  if (STATION_NAME_BY_ID[key]) return STATION_NAME_BY_ID[key];
  return id;
}

function renderTrackingPanel(message) {
  const panel = document.getElementById("trackingPanel");
  if (!panel) return;
  if (!trackingState.active || !trackingState.route.length) {
    panel.innerHTML = `<div class="alert alert-secondary mb-0">Nessun tracking attivo.</div>`;
    return;
  }

  const statusLine = message || trackingState.lastMessage || "";
  const routeText = trackingState.route
    .map((stationId) => escapeHtml(getStationName(stationId)))
    .join(" → ");
  const history =
    trackingState.events && trackingState.events.length
      ? trackingState.events
          .slice()
          .reverse()
          .map(
            (evt) => `
              <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                <div class="small">
                  <strong>${escapeHtml(evt.stationName)}</strong><br/>
                  <span class="text-muted">${escapeHtml(evt.message)}</span>
                </div>
                <span class="badge text-bg-light text-muted">${escapeHtml(evt.time || "")}</span>
              </div>
            `
          )
          .join("")
      : `<div class="text-muted small">Nessuna cronologia ancora.</div>`;
  const routeList = trackingState.route
    .map((stationId, idx) => {
      const state = computeStationState(idx);
      const badge = buildStateBadge(state);
      return `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <span>${escapeHtml(getStationName(stationId))}</span>
          ${badge}
        </li>
      `;
    })
    .join("");

  panel.innerHTML = `
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div>
            <div class="fw-semibold">Tracking treno ${escapeHtml(trackingState.trainId)}</div>
            <div class="text-muted small">${escapeHtml(getStationName(trackingState.fromId))} → ${escapeHtml(getStationName(trackingState.toId))}</div>
          </div>
          <span class="badge text-bg-primary">Live</span>
        </div>
        <div class="alert alert-light border mb-3 small">${escapeHtml(statusLine)}</div>
        <div class="small text-muted mb-2">Percorso monitorato: ${routeText}</div>
        ${renderTimeline()}
        <ul class="list-group list-group-flush">
          ${routeList}
        </ul>
        <div class="mt-3">
          <div class="fw-semibold mb-1">Cronologia</div>
          <div class="list-group list-group-flush border rounded">
            ${history}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTimeline() {
  const items = trackingState.route
    .map((stationId, idx) => {
      const state = computeStationState(idx);
      const { dotClass, labelClass } = getStateStyles(state);
      return `
        <div class="d-flex flex-column align-items-center text-center position-relative" style="min-width: 110px; z-index: 1;">
          <div class="${dotClass}" style="width: 18px; height: 18px; border-radius: 50%;"></div>
          <div class="${labelClass}" style="font-size: 0.85rem; margin-top: 6px;">
            ${escapeHtml(getStationName(stationId))}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="position-relative mb-3" style="overflow-x: auto;">
      <div class="position-absolute top-0 start-0 end-0 translate-middle-y" style="height: 4px; background: linear-gradient(90deg, #dee2e6, #ced4da); top: 9px; z-index: 0;"></div>
      <div class="d-flex align-items-center gap-3" style="padding: 0 6px; overflow-x: auto;">
      ${items}
      </div>
    </div>
  `;
}

function getStateStyles(state) {
  switch (state) {
    case "arrived":
      return { dotClass: "bg-success border border-success", labelClass: "text-success fw-semibold" };
    case "passed":
      return { dotClass: "bg-success", labelClass: "text-success fw-semibold" };
    case "current":
      return { dotClass: "bg-warning border border-warning", labelClass: "text-warning fw-semibold" };
    default:
      return { dotClass: "bg-secondary opacity-50", labelClass: "text-muted" };
  }
}

function computeStationState(idx) {
  if (trackingState.finished && idx === trackingState.route.length - 1) return "arrived";
  if (idx < trackingState.currentIndex) return "passed";
  if (idx === trackingState.currentIndex) return "current";
  return "pending";
}

function buildStateBadge(state) {
  switch (state) {
    case "arrived":
      return `<span class="badge text-bg-success">Arrivato</span>`;
    case "passed":
      return `<span class="badge text-bg-secondary">Passata</span>`;
    case "current":
      return `<span class="badge text-bg-info text-dark">Corrente</span>`;
    default:
      return `<span class="badge text-bg-light text-muted">In attesa</span>`;
  }
}

async function pollTracking() {
  if (!trackingState.active || !trackingState.route.length) return;
  const stationId = trackingState.route[trackingState.currentIndex];
  const isDestination = stationId === trackingState.toId;
  try {
    const nextStation = trackingState.route[trackingState.currentIndex + 1];
    await refreshSeedsForStations(nextStation ? [stationId, nextStation] : [stationId]);
    const payload = await fetchStationFile(stationId, isDestination ? "_live_arrivals.json" : "_live.json");
    const trains = extractTrains(payload, isDestination ? "arrival" : "departure");
    const match = trains.find((t) => t.id.toString().toLowerCase() === trackingState.trainId.toString().toLowerCase());

    if (match) {
      const statusText = isDestination
        ? `Arrivo previsto alle ${match.arrivalTime || match.departureTime || "--:--"}.`
        : `Treno visto a ${getStationName(stationId)} per le ${match.departureTime || "--:--"}.`;
      trackingState.lastMessage = statusText;
      trackingState.events = [
        ...trackingState.events,
        {
          stationId,
          stationName: getStationName(stationId),
          message: isDestination ? "Arrivo" : "Passaggio",
          time: isDestination ? match.arrivalTime || match.departureTime || "" : match.departureTime || "",
        },
      ];
      renderTrackingPanel(statusText);

      if (isDestination) {
        trackingState.finished = true;
        if (trackingState.intervalId) {
          clearInterval(trackingState.intervalId);
          trackingState.intervalId = null;
        }
      }
      return;
    }

    // non trovato: se non è destinazione, avanza alla prossima stazione
    if (!isDestination && trackingState.currentIndex < trackingState.route.length - 1) {
      trackingState.events = [
        ...trackingState.events,
        {
          stationId,
          stationName: getStationName(stationId),
          message: "Passata (non rilevato al tabellone)",
          time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
        },
      ];
      trackingState.currentIndex += 1;
      trackingState.lastMessage = `Lasciata ${getStationName(stationId)}, monitoro la prossima stazione.`;
      renderTrackingPanel(trackingState.lastMessage);
    } else if (isDestination) {
      trackingState.lastMessage = "In viaggio verso la destinazione, nessun arrivo rilevato ancora.";
      renderTrackingPanel(trackingState.lastMessage);
    }
  } catch (error) {
    console.error("Errore nel tracking:", error);
    trackingState.lastMessage = "Errore nel tracking. Riprovo automaticamente.";
    renderTrackingPanel(trackingState.lastMessage);
  }
}
