import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-check.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { fetchStorage } from "./storageProxy.js";
import { stationIdsByName, stationNameMapping, lineStations } from "../data/stations.js";

const TRAINS_ENDPOINT = window.TRAINS_ENDPOINT || window.TRAINS_API_BASE || "";
if (!TRAINS_ENDPOINT) {
  throw new Error("TRAINS_ENDPOINT mancante. Esegui npm run generate-configs.");
}

const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig) {
  throw new Error("Firebase config mancante. Crea frontend/js/firebase-config.js dal file di esempio.");
}

const appCheckDebugToken =
  window.FIREBASE_APPCHECK_DEBUG_TOKEN ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_APPCHECK_DEBUG_TOKEN) ||
  window.APP_CHECK_DEBUG_TOKEN;
if (["localhost", "127.0.0.1"].includes(location.hostname) && appCheckDebugToken) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  window.FORCE_STORAGE_PROXY = true;
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

window.__spottedDB = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "europe-west1");
const orchestrateStationFn = httpsCallable(functions, "orchestrateStation");

// Caricamento file live da Firebase Storage.
const SEED_REFRESH_INTERVAL_MS = 60_000;
let lastSeedRefreshAt = 0;

async function loadStationLiveFile(stationId, filename, { optional = false } = {}) {
  if (!stationId) {
    throw new Error("stationId mancante");
  }
  try {
    const fileRef = ref(storage, `stations/${stationId}/${filename}`);
    const url = await getDownloadURL(fileRef);
    const cacheSafeUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
    const response = await fetchStorage(cacheSafeUrl, { cache: "no-store" });
    return await response.json();
  } catch (error) {
    if (optional) {
      console.info(`File live opzionale ${filename} non disponibile per la stazione ${stationId}`);
      return null;
    }
    throw error;
  }
}

export async function fetchLiveDepartures(stationId) {
  return loadStationLiveFile(stationId, "_live.json", { optional: true });
}

export async function fetchLiveArrivals(stationId) {
  return loadStationLiveFile(stationId, "_live_arrivals.json", { optional: true });
}
async function fetchOriginDepartures() {
  if (!routeStopsWithCodes.length) return [];
  const candidateIds = [
    routeStopsWithCodes[0]?.id,
    selectedLine ? STATION_CODES[selectedLine.origin] : null,
  ].filter(Boolean);

  for (const id of candidateIds) {
    try {
      const payload = await fetchLiveDepartures(id);
      const normalized = normalizeLiveEntries(payload);
      if (normalized.length) {
        return { entries: normalized, fromFallback: id !== routeStopsWithCodes[0]?.id };
      }
    } catch (error) {
      console.warn("fetchOriginDepartures: fallback failed for id", id, error);
    }
  }
  return { entries: [], fromFallback: false };
}

const STATION_CODES = Object.fromEntries(
  Object.entries(stationIdsByName).map(([name, id]) => [name, String(id)])
);

// Lookup stazioni e linee per matching tratte.
const STATION_LOOKUP = Object.keys(STATION_CODES).reduce((acc, name) => {
  acc[name.toLowerCase()] = name;
  return acc;
}, {});
const STATION_BY_ID = Object.entries(STATION_CODES).reduce((acc, [name, id]) => {
  acc[id] = name;
  return acc;
}, {});

// Linee supportate per il tracking live (derivate da stations.js).
const LINES = Object.fromEntries(
  Object.entries(lineStations).map(([id, stops]) => {
    const first = stops[0] || "";
    const last = stops[stops.length - 1] || "";
    return [
      id,
      {
        id,
        origin: first,
        destination: last,
        stops,
      },
    ];
  })
);

const DESTINATION_TO_LINE = {
  Sorrento: "napoli-sorrento",
  "Castellammare Di Stabia": "napoli-sorrento",
  "Torre Annunziata - Oplonti": "napoli-poggiomarino",
  "Pompei Santuario": "napoli-poggiomarino",
  Poggiomarino: "napoli-poggiomarino",
  Barra: "napoli-poggiomarino",
  Sarno: "napoli-sarno",
  "Torre Del Greco": "napoli-torre",
  "San Giorgio a Cremano": "napoli-san-giorgio",
  Baiano: "napoli-baiano",
};

const DEFAULT_LINE_ID = "napoli-sorrento";

// Elementi UI principali.
const progressTrackEl = document.getElementById("progress-track");
const lineStopsEl = document.getElementById("line-stops");
const lineTitleEl = document.getElementById("line-title");
const lineSubtitleEl = document.getElementById("line-subtitle");
const statusEl =
  document.getElementById("tracking-status") ||
  document.getElementById("live-placeholder") ||
  null;
const liveTrainEl = document.getElementById("live-train");
const liveUpdateEl = document.getElementById("live-update");
const liveLastStopEl = document.getElementById("live-last-stop");
const liveNextStopEl = document.getElementById("live-next-stop");
const liveDelayEl = document.getElementById("live-delay");
const debugContentEl = document.getElementById("debug-content");
const clearDebugBtn = document.getElementById("clear-debug");
const trainPickerEl = document.getElementById("train-picker");
const trainPickerEmptyEl = document.getElementById("train-picker-empty");
const openTrainPickerBtn = document.getElementById("open-train-picker");
const stopStatusListEl = document.getElementById("stop-status-list");
const POLL_INTERVAL_MS = 30000;
const TRAIN_PICKER_REFRESH_MS = 30000;

let livePollHandle = null;
let trackedTrainId = null;
let lastKnownRouteIndex = -1;
let lastKnownDelay = 0;
let lastKnownPassedIndex = -1;
let routeStopsWithCodes = [];
let lastTrackingOptions = null;
let trainPickerAutoHandle = null;
let trainPickerLoading = false;
let stopPresence = [];

const queryParams = new URLSearchParams(window.location.search);
const lineParam = queryParams.get("line");
const destinationParam = queryParams.get("dest") || queryParams.get("destination");
const originParam = queryParams.get("origin") || queryParams.get("from");
const trackingKeyParam = (queryParams.get("key") || "").toLowerCase().trim();
const trainIdParam = (queryParams.get("train") || "").toLowerCase().trim();
trackedTrainId = trainIdParam || null;
const stationOptions = Object.keys(STATION_CODES).sort();

const normalizedDestination = normalizeStationName(destinationParam);
const normalizedOrigin = normalizeStationName(originParam);
let selectedLine =
  getLineById(lineParam) ||
  chooseLineByStations(normalizedOrigin, normalizedDestination) ||
  getLineByDestination(normalizedDestination) ||
  LINES[DEFAULT_LINE_ID];

const lineSelectEl =
  document.getElementById("line-select") ||
  document.getElementById("linea");

if (clearDebugBtn && debugContentEl) {
  clearDebugBtn.addEventListener("click", () => {
    debugContentEl.innerHTML = "";
  });
}
if (openTrainPickerBtn) {
  openTrainPickerBtn.addEventListener("click", openTrainPicker);
}

setupStationSelectors({
  origin: normalizedOrigin,
  destination: normalizedDestination,
});
setupLineSelector();
renderLine(selectedLine, {
  origin: normalizedOrigin,
  destination: normalizedDestination,
});

function renderLine(line, targets = {}) {
  if (!line) return;
  const orientation = orientLine(line, targets);
  const lineStops = orientation.stops;
  const effectiveOrigin = orientation.origin;
  const effectiveDestination = orientation.destination;
  const highlightRange = computeHighlightRange(lineStops, effectiveOrigin, effectiveDestination);

  if (lineTitleEl) {
    lineTitleEl.textContent = `Linea ${effectiveOrigin} → ${effectiveDestination}`;
  }
  if (lineSubtitleEl) {
    lineSubtitleEl.textContent =
      highlightRange && highlightRange.indexes?.length
        ? `Tratta evidenziata: ${highlightRange.from.name} → ${highlightRange.to.name}.`
        : "Visuale continua delle fermate principali.";
  }
  renderStops(lineStops, highlightRange);
  setupRouteStops(lineStops, orientation, effectiveOrigin, effectiveDestination);
  toggleLineGroups(line.id);
  updateTimelineStates(routeStopsWithCodes, { currentIndex: -1, delay: 0 });
  updateLivePanel({ currentIndex: -1, delay: 0 }, routeStopsWithCodes, orientation.direction);
  startLiveTracking({
    origin: effectiveOrigin,
    destination: effectiveDestination,
    direction: orientation.direction,
    trackingKey: trackingKeyParam,
  });
}

function setupStationSelectors({ origin, destination }) {
  const originSelect = document.getElementById("origin-select");
  const destinationSelect = document.getElementById("destination-select");
  const clearBtn = document.getElementById("clear-selection");
  const buildStationOptions = () => {
    const lineId = lineSelectEl?.value || selectedLine?.id;
    return lineStations[lineId] || selectedLine?.stops || [];
  };

  if (!originSelect || !destinationSelect) {
    const originInput = document.getElementById("partenza");
    const destinationInput = document.getElementById("arrivo");
    if (!originInput || !destinationInput) return;

    let datalist = document.getElementById("tracking-stations");
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = "tracking-stations";
      document.body.appendChild(datalist);
    }

    datalist.innerHTML = buildStationOptions()
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
    originInput.setAttribute("list", "tracking-stations");
    destinationInput.setAttribute("list", "tracking-stations");
    originInput.value = origin || "";
    destinationInput.value = destination || "";

    const rerender = () => {
      const o = normalizeStationName(originInput.value);
      const d = normalizeStationName(destinationInput.value);
      renderLine(selectedLine, { origin: o, destination: d });
    };

    originInput.addEventListener("input", rerender);
    destinationInput.addEventListener("input", rerender);
    return;
  }

  const buildOptions = () =>
    ["", ...buildStationOptions()].map(
      (name) => `<option value="${escapeHtml(name)}">${name || "(nessuna)"}</option>`
    ).join("");

  originSelect.innerHTML = buildOptions();
  destinationSelect.innerHTML = buildOptions();

  originSelect.value = origin || "";
  destinationSelect.value = destination || "";

  const rerender = () => {
    const o = normalizeStationName(originSelect.value);
    const d = normalizeStationName(destinationSelect.value);
    renderLine(selectedLine, { origin: o, destination: d });
  };

  originSelect.addEventListener("change", rerender);
  destinationSelect.addEventListener("change", rerender);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      originSelect.value = "";
      destinationSelect.value = "";
      if (lineSelectEl && lineSelectEl.value) {
        lineSelectEl.value = selectedLine?.id || "";
      }
      rerender();
    });
  }
}

function setupLineSelector() {
  if (!lineSelectEl) return;
  const options = Object.values(LINES)
    .map(
      (line) =>
        `<option value="${line.id}" ${selectedLine?.id === line.id ? "selected" : ""}>${line.origin} → ${line.destination}</option>`
    )
    .join("");
  lineSelectEl.innerHTML = `<option value="">Seleziona linea</option>${options}`;
  lineSelectEl.value = selectedLine?.id || "";
  lineSelectEl.addEventListener("change", () => {
    const line = getLineById(lineSelectEl.value) || selectedLine;
    if (!line) return;
    selectedLine = line;
    const originSelect = document.getElementById("origin-select");
    const destinationSelect = document.getElementById("destination-select");
    const originInput = document.getElementById("partenza");
    const destinationInput = document.getElementById("arrivo");
    const o = normalizeStationName(originSelect?.value || originInput?.value);
    const d = normalizeStationName(destinationSelect?.value || destinationInput?.value);
    setupStationSelectors({ origin: o, destination: d });
    renderLine(selectedLine, { origin: o, destination: d });
  });
}

function orientLine(line, targets) {
  const baseStops = line.stops || [];
  const originCandidate = resolveStop(baseStops, targets.origin) || line.origin;
  const destinationCandidate =
    resolveStop(baseStops, targets.destination) || line.destination;

  const originIndex = baseStops.findIndex((s) => s === originCandidate);
  const destIndex = baseStops.findIndex((s) => s === destinationCandidate);

  return {
    stops: baseStops,
    origin: originCandidate,
    destination: destinationCandidate,
    direction:
      originIndex !== -1 && destIndex !== -1 && destIndex < originIndex
        ? "reverse"
        : "forward",
  };
}

function setupRouteStops(lineStops, orientation, originName, destinationName) {
  const originIdx = lineStops.findIndex((s) => s === originName);
  const destIdx = lineStops.findIndex((s) => s === destinationName);
  if (originIdx === -1 || destIdx === -1) {
    routeStopsWithCodes = lineStops.map((name, idx) => ({
      name,
      id: STATION_CODES[name] || null,
      displayIndex: idx,
    }));
    renderTimelineGroup(selectedLine?.id, routeStopsWithCodes, `${lineStops[0]} - ${lineStops[lineStops.length - 1]}`);
    stopPresence = routeStopsWithCodes.map(() => ({ present: false, lastSeenAt: 0 }));
    lastKnownPassedIndex = -1;
    return;
  }
  const forward = orientation.direction === "forward";
  const [start, end] =
    forward && originIdx <= destIdx
      ? [originIdx, destIdx]
      : !forward && originIdx >= destIdx
        ? [destIdx, originIdx]
        : [Math.min(originIdx, destIdx), Math.max(originIdx, destIdx)];

  const slice = lineStops.slice(start, end + 1);
  const ordered = forward ? slice : slice.reverse();

  routeStopsWithCodes = ordered.map((name) => {
    const displayIndex = lineStops.indexOf(name);
    return { name, id: STATION_CODES[name] || null, displayIndex };
  });

  renderTimelineGroup(
    selectedLine?.id,
    routeStopsWithCodes,
    `${originName} - ${destinationName}`
  );
  stopPresence = routeStopsWithCodes.map(() => ({ present: false, lastSeenAt: 0 }));
  lastKnownPassedIndex = -1;
  trackedTrainId = trainIdParam || null;
  lastKnownRouteIndex = -1;
  lastKnownDelay = 0;
  updateProgressTrack(routeStopsWithCodes, { currentIndex: -1, delay: 0 });
  renderStopStatusList(routeStopsWithCodes);
  resetTrainPicker();
  startTrainPickerAutoRefresh();
}

function renderStops(stops, highlightRange) {
  if (!lineStopsEl) return;
  const indices =
    highlightRange?.indexes ??
    Array.from({ length: stops.length }, (_, idx) => idx);
  const rangeSet = new Set(indices);

  lineStopsEl.style.width = `max(100%, ${stops.length * 110}px)`;
  lineStopsEl.innerHTML = stops
    .map((name, index) => {
      const isActive = highlightRange ? rangeSet.has(index) : true;
      const isStart = index === 0;
      const isEnd = index === stops.length - 1;
      const classes = [
        "line-stop",
        isActive ? "active" : "",
        isStart ? "is-first" : "",
        isEnd ? "is-last" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <div class="${classes}">
          <span class="line-stop-dot${isActive ? " active" : ""}${isStart ? " start" : ""}${
        isEnd ? " end" : ""
      }"></span>
          <span class="line-stop-label${isActive ? " active" : ""}">${name}</span>
        </div>
      `;
    })
    .join("");
}

function toggleLineGroups(lineId) {
  const groups = Array.from(document.querySelectorAll(".stazioni-gruppo[data-linea]"));
  if (!groups.length) return;
  groups.forEach((group) => {
    group.classList.toggle("nascosto", group.dataset.linea !== lineId);
  });
}

function renderTimelineGroup(lineId, stopsWithCodes, title) {
  if (!lineId) return;
  const group = document.querySelector(`.stazioni-gruppo[data-linea="${lineId}"]`);
  if (!group) return;
  const titleEl = group.querySelector("h3");
  if (titleEl && title) {
    titleEl.textContent = title;
  }
  const listEl = group.querySelector(".timeline");
  if (!listEl) return;
  listEl.innerHTML = stopsWithCodes
    .map(
      (stop) => `
      <li class="timeline-item stato-futuro">
        <span class="timeline-dot"></span>
        <div class="timeline-content">
          <span class="timeline-nome">${stop.name}</span>
          <span class="timeline-meta">Prevista</span>
        </div>
      </li>
    `
    )
    .join("");
}

function updateLivePanel(progress, stopsWithCodes, direction = "forward") {
  if (!liveTrainEl && !liveUpdateEl && !liveLastStopEl && !liveNextStopEl && !liveDelayEl) {
    return;
  }
  const routeIndex =
    progress.currentIndex === -1 ? lastKnownRouteIndex : progress.currentIndex;
  const effectiveDelay =
    progress.currentIndex === -1 ? lastKnownDelay : progress.delay || 0;
  const currentStop = routeIndex >= 0 ? stopsWithCodes[routeIndex]?.name : "—";
  const nextStop =
    routeIndex >= 0 ? stopsWithCodes[routeIndex + 1]?.name || "capolinea" : "—";

  if (liveTrainEl) {
    liveTrainEl.textContent = trackedTrainId ? `EAV ${trackedTrainId}` : "—";
  }
  if (liveUpdateEl) {
    liveUpdateEl.textContent = new Date().toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (liveLastStopEl) {
    liveLastStopEl.textContent = currentStop || "—";
  }
  if (liveNextStopEl) {
    liveNextStopEl.textContent = nextStop || "—";
  }
  if (liveDelayEl) {
    liveDelayEl.textContent = effectiveDelay > 0 ? `+${effectiveDelay} min` : "In orario";
  }
}

function updateTimelineStates(stopsWithCodes, progress) {
  const lineId = selectedLine?.id || lineSelectEl?.value;
  if (!lineId) return;
  const group = document.querySelector(`.stazioni-gruppo[data-linea="${lineId}"]`);
  if (!group) return;
  const items = Array.from(group.querySelectorAll(".timeline-item"));
  const stopIndexByName = new Map(stopsWithCodes.map((s, idx) => [s.name, idx]));
  const currentIndex = progress.currentIndex;
  const passedIndex =
    typeof progress.passedIndex === "number" ? progress.passedIndex : lastKnownPassedIndex;

  items.forEach((item) => {
    item.classList.remove("stato-passato", "stato-attuale", "stato-futuro");
    const name = item.querySelector(".timeline-nome")?.textContent.trim() || "";
    const idx = stopIndexByName.get(name);
    if (idx === undefined) {
      item.classList.add("stato-futuro");
      return;
    }
    if (passedIndex >= 0 && idx <= passedIndex) {
      item.classList.add("stato-passato");
    } else if (currentIndex !== -1 && idx === currentIndex) {
      item.classList.add("stato-attuale");
    } else {
      item.classList.add("stato-futuro");
    }
  });
}

function getLineById(lineId) {
  if (!lineId) return null;
  const key = lineId.toLowerCase();
  return LINES[key] || null;
}

function getLineByDestination(destName) {
  if (!destName) return null;
  const key = destName in DESTINATION_TO_LINE ? destName : capitalizeEachWord(destName);
  const byMap = DESTINATION_TO_LINE[key];
  if (byMap && LINES[byMap]) {
    return LINES[byMap];
  }
  return (
    Object.values(LINES).find((line) =>
      line.stops.some((stop) => stop.toLowerCase() === destName.toLowerCase())
    ) || null
  );
}

function chooseLineByStations(originName, destinationName) {
  const origin = originName?.toLowerCase() || "";
  const dest = destinationName?.toLowerCase() || "";
  let best = null;
  Object.values(LINES).forEach((line) => {
    const stops = line.stops.map((s) => s.toLowerCase());
    const originIdx = origin ? stops.indexOf(origin) : -1;
    const destIdx = dest ? stops.indexOf(dest) : -1;

    if (origin && dest) {
      if (originIdx !== -1 && destIdx !== -1) {
        const span = Math.abs(destIdx - originIdx);
        if (!best || span > best.span) {
          best = { line, span };
        }
      }
      return;
    }
    if (origin && originIdx !== -1 && !best) {
      best = { line, span: 0 };
    }
    if (dest && destIdx !== -1 && !best) {
      best = { line, span: 0 };
    }
  });
  return best?.line || null;
}

function normalizeStationName(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const key = trimmed
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[().]/g, "")
    .trim();
  const mapped = stationNameMapping[key] || trimmed;
  const canonical = STATION_LOOKUP[mapped.toLowerCase()];
  if (canonical) return canonical;
  return capitalizeEachWord(mapped);
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

function capitalizeEachWord(text) {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function resolveStop(stops, candidate) {
  if (!candidate) return null;
  const lowerCandidate = candidate.toLowerCase();
  return (
    stops.find((stop) => stop.toLowerCase() === lowerCandidate) ||
    stops.find((stop) => stop.toLowerCase().includes(lowerCandidate))
  );
}

function computeHighlightRange(stops, originName, destinationName) {
  const originIndex = stops.findIndex((stop) => stop === originName);
  const destinationIndex = stops.findIndex((stop) => stop === destinationName);
  if (originIndex === -1 || destinationIndex === -1) {
    return {
      from: { name: stops[0], index: 0 },
      to: { name: stops[stops.length - 1], index: stops.length - 1 },
      indexes: Array.from({ length: stops.length }, (_, idx) => idx),
    };
  }
  const start = Math.min(originIndex, destinationIndex);
  const end = Math.max(originIndex, destinationIndex);
  const indexes = [];
  for (let i = start; i <= end; i += 1) {
    indexes.push(i);
  }
  return {
    from: { name: stops[start], index: start },
    to: { name: stops[end], index: end },
    indexes,
  };
}

function startLiveTracking(options = {}) {
  if (!routeStopsWithCodes.length) return;
  if (livePollHandle) {
    clearInterval(livePollHandle);
  }
  lastTrackingOptions = options;
  livePollHandle = setInterval(() => {
    refreshLiveProgress(routeStopsWithCodes, lastTrackingOptions);
  }, POLL_INTERVAL_MS);
  refreshLiveProgress(routeStopsWithCodes, lastTrackingOptions);
}

function resetTrainPicker() {
  if (trainPickerEl) {
    trainPickerEl.innerHTML = "";
    trainPickerEl.style.display = "none";
  }
  if (trainPickerEmptyEl) {
    trainPickerEmptyEl.style.display = "none";
  }
}

async function openTrainPicker(options = {}) {
  if (!openTrainPickerBtn) return;
  if (trainPickerLoading) return;
  const silent = Boolean(options.silent);
  trainPickerLoading = true;
  if (!silent) {
    openTrainPickerBtn.disabled = true;
    openTrainPickerBtn.textContent = "Carico...";
  }
  try {
    const { entries, fromFallback } = await fetchOriginDepartures();
    renderTrainPicker(entries || [], { fromFallback });
  } catch (error) {
    console.warn("Impossibile caricare gli orari di partenza:", error);
    resetTrainPicker();
    if (trainPickerEmptyEl) {
      trainPickerEmptyEl.textContent = "Errore nel caricamento degli orari.";
      trainPickerEmptyEl.style.display = "block";
    }
  } finally {
    trainPickerLoading = false;
    if (!silent) {
      openTrainPickerBtn.disabled = false;
      openTrainPickerBtn.textContent = "Apri orari";
    }
  }
}

function renderTrainPicker(entries, { fromFallback = false } = {}) {
  if (!trainPickerEl) return;
  const nowMinutes = getNowMinutes();
  const allowedDestinations = new Set(
    (routeStopsWithCodes || []).map((s) => normalizeStationName(s.name).toLowerCase())
  );
  const allowedIds = new Set(
    (routeStopsWithCodes || [])
      .map((s) => (s.id ? s.id.toString() : ""))
      .filter(Boolean)
  );
  const filtered = fromFallback
    ? entries || []
    : (entries || []).filter((e) => {
        const rawDest = e?.destination || e?.destinationId || "";
        if (!rawDest) return true;
        const destName = STATION_BY_ID[rawDest] || rawDest;
        const destNorm = normalizeStationName(destName).toLowerCase();
        const rawDestId = rawDest.toString();
        const byName = allowedDestinations.size ? allowedDestinations.has(destNorm) : true;
        const byId = allowedIds.size ? allowedIds.has(rawDestId) : true;
        return byName || byId;
      });

  const timeFiltered = (filtered.length ? filtered : entries || []).filter((entry) => {
    const minutes = getEffectiveMinutes(entry);
    if (minutes === null) return true;
    return minutes >= nowMinutes - 2;
  });

  const listEntries = timeFiltered.length ? timeFiltered : entries || [];

  if (trackedTrainId) {
    const stillPresent = listEntries.some(
      (entry) => (entry.trainId || "").toString().toLowerCase() === trackedTrainId
    );
    if (!stillPresent) {
      clearTrackingSelection();
    }
  }
  if (!listEntries.length) {
    trainPickerEl.style.display = "none";
    if (trainPickerEmptyEl) {
      trainPickerEmptyEl.textContent = entries?.length
        ? "Orari trovati ma non compatibili con la tratta."
        : "Nessun orario disponibile al momento.";
      trainPickerEmptyEl.style.display = "block";
    }
    return;
  }
  const list = listEntries
    .filter((e) => e?.trainId || e?.time)
    .slice(0, 20)
    .map((entry) => {
      const delay = Number(entry.delay) || 0;
      const badgeClass = delay > 0 ? "text-bg-warning" : "text-bg-success";
      const badgeText = delay > 0 ? `+${delay} min` : "In orario";
      const destName = STATION_BY_ID[entry.destination] || entry.destination || entry.destinationId || "—";
      return `
        <button type="button" class="list-group-item" data-train="${entry.trainId || ""}" data-time="${entry.time || ""}" data-destination="${destName}">
          <div>
            <div class="fw-bold">Treno ${entry.trainId || "—"}</div>
            <small class="text-muted">${entry.time || "--:--"} → ${destName}</small>
          </div>
          <span class="badge ${badgeClass} rounded-pill">${badgeText}</span>
        </button>
      `;
    })
    .join("");
  trainPickerEl.innerHTML = list;
  trainPickerEl.style.display = "block";
  if (trainPickerEmptyEl) trainPickerEmptyEl.style.display = "none";

  trainPickerEl.querySelectorAll("[data-train]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const trainId = btn.getAttribute("data-train") || "";
      const time = btn.getAttribute("data-time") || "";
      selectTrain(trainId, time);
      trainPickerEl.querySelectorAll(".active").forEach((node) => node.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function selectTrain(trainId, time) {
  if (!trainId) return;
  trackedTrainId = trainId.toString().toLowerCase();
  lastKnownRouteIndex = -1;
  lastKnownDelay = 0;
  if (lineSubtitleEl) {
    lineSubtitleEl.textContent = `Seguendo treno ${trainId}${time ? ` (partenza ${time})` : ""}.`;
  }
  if (routeStopsWithCodes.length) {
    refreshLiveProgress(routeStopsWithCodes, lastTrackingOptions || {});
  }
}

function startTrainPickerAutoRefresh() {
  if (!trainPickerEl && !openTrainPickerBtn) return;
  if (trainPickerAutoHandle) {
    clearInterval(trainPickerAutoHandle);
  }
  const trigger = () => openTrainPicker({ silent: true });
  trigger();
  trainPickerAutoHandle = setInterval(trigger, TRAIN_PICKER_REFRESH_MS);
}

function clearTrackingSelection() {
  trackedTrainId = null;
  lastKnownRouteIndex = -1;
  lastKnownDelay = 0;
  lastKnownPassedIndex = -1;
  stopPresence = routeStopsWithCodes.map(() => ({ present: false, lastSeenAt: 0 }));
  if (lineSubtitleEl) {
    lineSubtitleEl.textContent = `Seleziona un treno da "Apri orari" per avviare il tracking.`;
  }
  if (routeStopsWithCodes.length) {
    updateProgressTrack(routeStopsWithCodes, { currentIndex: -1, delay: 0, events: [] });
  }
}

function getNowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getEffectiveMinutes(entry) {
  const time = entry?.time || "";
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const scheduled = hours * 60 + minutes;
  const delay = Number(entry?.delay) || 0;
  return scheduled + delay;
}

async function refreshLiveProgress(
  stopsWithCodes,
  { destination, trackingKey, direction = "forward" }
) {
  try {
    await refreshLiveSeeds(stopsWithCodes);
    console.debug("[tracking] refreshLiveProgress start", {
      destination,
      trackingKey,
      direction,
      stops: stopsWithCodes.map((s) => s.name),
    });
    const snapshots = [];
    for (const stop of stopsWithCodes) {
      if (!stop.id) {
        snapshots.push({ stop, arrivals: [], departures: [] });
        continue;
      }
      const [arrivals, departures] = await Promise.all([
        fetchLiveArrivals(stop.id),
        fetchLiveDepartures(stop.id),
      ]);
      snapshots.push({
        stop,
        arrivals: normalizeLiveEntries(arrivals),
        departures: normalizeLiveEntries(departures),
      });
    }

    const progress = findTrainPosition(snapshots, {
      destination,
      trackingKey,
    });
    console.debug("[tracking] progress", progress);
    const snapshotSummary = snapshots.map((snap, idx) => {
      const matched = progress.events?.find((e) => e.stopIndex === idx);
      const matchedEntry = matched?.entry;
      return {
        stop: snap.stop.name,
        arrivals: snap.arrivals.length,
        departures: snap.departures.length,
        matched: Boolean(matched),
        delay: matched?.delay || 0,
        board: matched?.board || null,
        matchEntry: matchedEntry || null,
        matchSummary: matchedEntry
          ? `${matchedEntry.trainId || "??"} ${matchedEntry.time || ""} → ${matchedEntry.destination || ""} (${matched?.board || ""})`
          : null,
        sampleArrivals: snap.arrivals.slice(0, 2),
        sampleDepartures: snap.departures.slice(0, 2),
      };
    });
    logDebug("Aggiornamento tracking", {
      trackingKey,
      destination,
      direction,
      currentIndex: progress.currentIndex,
      delay: progress.delay,
      events: progress.events || [],
      stops: snapshotSummary,
    });
    const lines = snapshotSummary.map((s) => {
      if (s.matched && s.matchEntry) {
        return `${s.stop}: OK – ${describeBoardEntry(s.matchEntry, s.board)}`;
      }
      return `${s.stop}: nessun match al momento (${s.arrivals} arr / ${s.departures} part)`;
    });
    logDebug("Esito per fermata", lines.join("\n"));
    if (progress.events?.length) {
      progress.events.forEach((event) => {
        const snap = snapshots[event.stopIndex];
        const label = `${snap.stop.name} (${event.board})`;
        logDebug(`Match: ${label}`, describeBoardEntry(event.entry, event.board));
      });
    } else {
      logDebug("Match", "Nessun match sui tabelloni in questo poll.");
    }
    applyStopStates(stopsWithCodes, { ...progress, direction });
    updateProgressTrack(stopsWithCodes, { ...progress, direction });
    updateSubtitle(progress, stopsWithCodes);
  } catch (error) {
    console.warn("Impossibile aggiornare la posizione del treno:", error);
  }
}

async function refreshLiveSeeds(stopsWithCodes = []) {
  const now = Date.now();
  if (now - lastSeedRefreshAt < SEED_REFRESH_INTERVAL_MS) {
    return;
  }
  lastSeedRefreshAt = now;
  const ids = Array.from(
    new Set(stopsWithCodes.map((s) => s.id).filter(Boolean))
  );
  if (!ids.length) return;
  try {
    await Promise.all(
      ids.map((id) =>
        orchestrateStationFn({ stationId: id }).catch((err) => {
          console.warn("Impossibile aggiornare la stazione", id, err);
        })
      )
    );
    console.info("[tracking] Live seeds aggiornati per", ids.length, "stazioni");
  } catch (err) {
    console.warn("[tracking] Errore nel refresh dei live seeds", err);
  }
}

function normalizeLiveEntries(payload) {
  if (!payload) return [];
  const list = Array.isArray(payload?.arrivals)
    ? payload.arrivals
    : Array.isArray(payload?.departures)
      ? payload.departures
      : Array.isArray(payload?.rows)
        ? payload.rows
        : Array.isArray(payload)
          ? payload
          : [];
  return list
    .map((entry) => {
      if (Array.isArray(entry)) {
        const [
          trainId,
          category,
          destinationId,
          time,
          track,
          info,
          delay,
          arrivalTime,
        ] = entry;
        return {
          trainId: trainId?.toString().trim() || "",
          category: category || "",
          destinationId: destinationId?.toString() || "",
          destination: destinationId?.toString() || "",
          time: time || arrivalTime || "",
          track: track || "",
          info: info || "",
          delay: Number(delay) || 0,
        };
      }
      if (!entry || typeof entry !== "object") return null;
      return {
        trainId:
          entry.trainId ||
          entry.id ||
          entry.train ||
          entry.numero ||
          entry.code ||
          "",
        destination:
          entry.destination ||
          entry.destinazione ||
          entry.finalDestination ||
          entry.to ||
          "",
        time:
          entry.arrivalTime ||
          entry.departureTime ||
          entry.time ||
          entry.orario ||
          entry.orarioArrivo ||
          entry.orarioPartenza ||
          "",
        delay:
          Number(entry.delay ?? entry.ritardo ?? entry.arrivalDelay ?? entry.departureDelay) ||
          0,
        info: entry.info || entry.note || "",
      };
    })
    .filter(Boolean);
}

function matchesTracking(entry, { trackingKey, destination }) {
  const haystack = `${entry.trainId || ""} ${entry.time || ""} ${entry.destination || ""} ${entry.info || ""}`
    .toLowerCase()
    .trim();
  if (trackedTrainId && entry.trainId) {
    return entry.trainId.toString().toLowerCase() === trackedTrainId;
  }
  if (trackingKey && haystack.includes(trackingKey)) {
    trackedTrainId = entry.trainId?.toString().toLowerCase() || trackedTrainId;
    return true;
  }
  if (!trackingKey && destination) {
    const normalizedDest = destination.toLowerCase();
    if ((entry.destination || "").toLowerCase().includes(normalizedDest)) {
      trackedTrainId = entry.trainId?.toString().toLowerCase() || trackedTrainId;
      return true;
    }
  }
  return false;
}

function findTrainPosition(snapshots, options) {
  const now = Date.now();
  const events = [];
  snapshots.forEach((snapshot, index) => {
    const lists = [snapshot.departures, snapshot.arrivals];
    for (const list of lists) {
      const hit = list.find((entry) => matchesTracking(entry, options));
      if (hit) {
        events.push({
          stopIndex: index,
          delay: hit.delay || 0,
          trainId: hit.trainId || null,
          entry: hit,
          board: list === snapshot.departures ? "departures" : "arrivals",
        });
        if (!trackedTrainId && hit.trainId) {
          trackedTrainId = hit.trainId.toString().toLowerCase();
        }
        break;
      }
    }
  });

  const normalizeId = (id) => (id ? id.toString().toLowerCase() : "");
  const wantedId = trackedTrainId ? trackedTrainId.toString().toLowerCase() : "";
  const idEvents = wantedId ? events.filter((e) => normalizeId(e.trainId) === wantedId) : [];
  const relevantEvents = idEvents.length ? idEvents : events;

  if (!stopPresence.length || stopPresence.length !== snapshots.length) {
    stopPresence = snapshots.map(() => ({ present: false, lastSeenAt: 0 }));
  }

  const presentIndices = new Set(relevantEvents.map((e) => e.stopIndex));
  let passedIndex = lastKnownPassedIndex;

  stopPresence = stopPresence.map((state, idx) => {
    const isPresent = presentIndices.has(idx);
    if (isPresent) {
      return { present: true, lastSeenAt: now };
    }
    if (state.present) {
      passedIndex = Math.max(passedIndex, idx);
    }
    return { ...state, present: false };
  });

  let currentIndex = -1;
  let delay = lastKnownDelay || 0;

  if (presentIndices.size) {
    const ordered = Array.from(presentIndices).sort((a, b) => a - b);
    const minAllowed = Math.max(lastKnownRouteIndex, passedIndex + 1, 0);
    let chosen = ordered.find((idx) => idx >= minAllowed);
    if (chosen === undefined) {
      chosen = ordered[ordered.length - 1];
    }
    currentIndex = chosen;
    const match = relevantEvents.find((e) => e.stopIndex === chosen);
    delay = match?.delay || lastKnownDelay || 0;
  }

  return {
    currentIndex,
    delay,
    events: relevantEvents,
    passedIndex,
  };
}

function applyStopStates(stopsWithCodes, progress) {
  const stopElements = lineStopsEl
    ? Array.from(lineStopsEl.querySelectorAll(".line-stop"))
    : [];
  const { currentIndex, delay } = progress;
  const passedIndex =
    typeof progress.passedIndex === "number" ? progress.passedIndex : lastKnownPassedIndex;
  const stickyDelay = currentIndex === -1 ? lastKnownDelay : delay;

  if (currentIndex !== -1) {
    lastKnownRouteIndex = currentIndex;
    lastKnownDelay = delay;
  }
  if (passedIndex >= 0) {
    lastKnownPassedIndex = Math.max(lastKnownPassedIndex, passedIndex);
  }

  stopsWithCodes.forEach((stop, routeIdx) => {
    const el = stopElements[stop.displayIndex];
    if (!el) return;
    el.classList.remove("is-passed", "is-current", "is-upcoming", "is-delayed");
    if (lastKnownPassedIndex >= 0 && routeIdx <= lastKnownPassedIndex) {
      el.classList.add("is-passed");
      updateStopBadge(routeIdx, "passed", stickyDelay);
    } else if (currentIndex !== -1 && routeIdx === currentIndex) {
      el.classList.add("is-current");
      if (stickyDelay > 0) {
        el.classList.add("is-delayed");
      }
      updateStopBadge(routeIdx, stickyDelay > 0 ? "delayed" : "current", stickyDelay);
    } else {
      el.classList.add("is-upcoming");
      updateStopBadge(routeIdx, "upcoming", stickyDelay);
    }
  });

  updateTimelineStates(stopsWithCodes, progress);
  updateLivePanel(progress, stopsWithCodes, progress.direction);
}

function updateProgressTrack(stopsWithCodes, progress = {}) {
  if (!progressTrackEl) return;
  const currentIndex = progress.currentIndex;
  const passedIndex =
    typeof progress.passedIndex === "number" ? progress.passedIndex : lastKnownPassedIndex;
  const effectiveDelay =
    progress.currentIndex === -1 ? lastKnownDelay : progress.delay || 0;

  progressTrackEl.style.width = `max(100%, ${stopsWithCodes.length * 140}px)`;

  const content = stopsWithCodes
    .map((stop, idx) => {
      const state =
        passedIndex >= 0 && idx <= passedIndex
          ? "passed"
          : currentIndex !== -1 && idx === currentIndex
            ? "current"
            : "upcoming";
      const delayed = state === "current" && effectiveDelay > 0;
      return `
        <div class="progress-stop ${state}${delayed ? " delayed" : ""}">
          <div class="progress-dot"></div>
          <div class="progress-label">${stop.name}</div>
          ${delayed ? `<span class="pill pill-soft pill-delay">+${effectiveDelay} min</span>` : ""}
        </div>
      `;
    })
    .join("");
  progressTrackEl.innerHTML = content;

  renderStopStatusList(stopsWithCodes);
}

function updateSubtitle(progress, stopsWithCodes) {
  if (!lineSubtitleEl) return;
  const trainLabel = trackedTrainId ? `Treno ${trackedTrainId}` : "Treno in monitoraggio";
  const { currentIndex, delay } = progress;
  const routeIndex =
    currentIndex === -1 ? lastKnownRouteIndex : currentIndex;

  if (routeIndex === -1) {
    lineSubtitleEl.textContent = `${trainLabel}: in attesa di individuare il treno sui tabelloni live…`;
    return;
  }
  const currentStop = stopsWithCodes[routeIndex]?.name || "—";
  const nextStop = stopsWithCodes[routeIndex + 1]?.name || "capolinea";
  const effectiveDelay = currentIndex === -1 ? lastKnownDelay : delay;
  const delayText = effectiveDelay > 0
    ? `ritardo +${effectiveDelay} min`
    : "in orario";
  lineSubtitleEl.textContent = `${trainLabel}: ultimo passaggio ${currentStop} (${delayText}). Prossima fermata: ${nextStop}.`;
}

function renderStopStatusList(stopsWithCodes = []) {
  if (!stopStatusListEl) return;
  stopStatusListEl.innerHTML = stopsWithCodes
    .map(
      (stop, routeIdx) => `
      <div class="stop-status-item" data-route-idx="${routeIdx}">
        <span class="stop-name">${stop.name}</span>
        <span class="stop-badge upcoming">In attesa</span>
      </div>
    `
    )
    .join("");
}

function updateStopBadge(routeIdx, state, delay = 0) {
  if (!stopStatusListEl) return;
  const row = stopStatusListEl.querySelector(`[data-route-idx="${routeIdx}"] .stop-badge`);
  if (!row) return;
  row.classList.remove("passed", "current", "upcoming", "delayed");
  row.classList.add(state);
  if (state === "passed") {
    row.textContent = "Passato";
  } else if (state === "current") {
    row.textContent = "Corrente";
  } else if (state === "delayed") {
    row.textContent = delay > 0 ? `+${delay} min` : "Corrente";
  } else {
    row.textContent = "In attesa";
  }
}

function setStatus(message, state = "info") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  refreshStops();
  pollInterval = setInterval(refreshStops, pollDelay);
}

async function refreshStops() {
  if (!watchKey) return;
  try {
    const results = await Promise.all(DEFAULT_STOPS.map(fetchStopBoard));
    updateStopIndicators(results);
  } catch (error) {
    console.error("Errore nel polling teleindicatori:", error);
    setStatus("Errore durante l'aggiornamento dei teleindicatori.", "error");
  }
}

async function fetchStopBoard(stop) {
  const params = new URLSearchParams({
    stazione: String(stop.stationId),
    tipo: stop.type,
  });
  const response = await fetch(`${TRAINS_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const trains = payload.trains || [];
  const normalizedKey = watchKey.toLowerCase();
  const match = trains.find((train) => {
    const haystack = `${train.id || ""} ${train.destinazione || ""} ${train.info || ""}`.toLowerCase();
    return haystack.includes(normalizedKey);
  });
  return { stop, found: Boolean(match), match, trains, source: payload.source };
}

function updateStopIndicators(results) {
  lastMatches = results;
  let highestIndex = -1;
  results.forEach((result, idx) => {
    if (result.found) highestIndex = idx;
  });

  const cards = document.querySelectorAll(".stop-card");
  cards.forEach((card, idx) => {
    card.classList.remove("active", "past");
    if (idx < highestIndex) {
      card.classList.add("past");
    } else if (idx === highestIndex) {
      card.classList.add("active");
    }
  });

  if (highestIndex === -1) {
    setStatus("Chiave non trovata sui tabelloni monitorati in questo momento.", "warning");
  } else {
  const location = DEFAULT_STOPS[highestIndex];
  setStatus(`Treno individuato sul tabellone partenze di ${location.name}.`, "success");
}
  const debugSummary = results.map((r) => ({
    stop: r.stop.name,
    type: r.stop.type,
    found: r.found,
    trains: r.trains.length,
    source: r.source,
    match: r.match ? describeBoardEntry(r.match, r.stop.type) : null,
  }));
  logDebug("Teleindicatori", debugSummary);
}

function logDebug(message, data) {
  if (!debugContentEl) return;
  const entry = document.createElement("div");
  entry.className = "debug-entry";
  const title = document.createElement("div");
  title.className = "debug-title";
  title.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  entry.appendChild(title);
  if (data !== undefined) {
    const pre = document.createElement("pre");
    pre.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    entry.appendChild(pre);
  }
  debugContentEl.prepend(entry);
  const MAX = 40;
  while (debugContentEl.children.length > MAX) {
    debugContentEl.removeChild(debugContentEl.lastChild);
  }
}

function describeBoardEntry(entry, board) {
  if (!entry) return "";
  const parts = [
    entry.trainId || "??",
    entry.time || "",
    "→",
    entry.destination || entry.destinazione || "",
  ].filter(Boolean);
  const delay = entry.delay || entry.ritardo || 0;
  const delayText = delay ? `(+${delay}')` : "";
  const info = entry.info ? ` [${entry.info}]` : "";
  return `${parts.join(" ")} ${delayText} ${info} (${board || "board"})`.trim();
}
