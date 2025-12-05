import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDoc, getDocs, doc, collection, getFirestore
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { fetchStorage } from "./storageProxy.js";

const firebaseConfig = {
  apiKey: "AIzaSyAm9xQpOSi2yjBB3vmaBSYH6WCChpoU-Ls",
  authDomain: "spotted-train-221024.firebaseapp.com",
  projectId: "spotted-train-221024",
  storageBucket: "spotted-train-221024.firebasestorage.app",
  messagingSenderId: "333646112601",
  appId: "1:333646112601:web:1df5534513235e75750e48",
  measurementId: "G-XYP5NQQVM9",
};

let db = window.__spottedDB;
if (!db) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  window.__spottedDB = db;
}

const storage = getStorage(db.app);
const functions = getFunctions(db.app, "europe-west1");
const orchestrateStationFn = httpsCallable(functions, "orchestrateStation");

async function refreshStationLiveData(stationId) {
  if (!stationId) return;
  try {
    await orchestrateStationFn({ stationId });
  } catch (error) {
    console.warn("Impossibile sincronizzare i dati live per la stazione", stationId, error);
  }
}

let stationDataPromise = null;
async function getStationMetadata() {
  if (!stationDataPromise) {
    stationDataPromise = (async () => {
      try {
        const stationDataRef = ref(storage, "meta/station_data.json");
        const stationDataUrl = await getDownloadURL(stationDataRef);
        const response = await fetchStorage(stationDataUrl);
        const data = await response.json();
        if (!data || !Array.isArray(data.stations)) {
          return {};
        }
        return data.stations.reduce((acc, station) => {
          acc[station.id] = station;
          return acc;
        }, {});
      } catch (err) {
        console.warn("Impossibile caricare station_data.json:", err);
        return {};
      }
    })();
  }
  return stationDataPromise;
}

// --- STAZIONI (da Firebase Storage) ---
export async function fetchStations() {
  try {
    const manifestRef = ref(storage, "manifest.json");
    const url = await getDownloadURL(manifestRef);
    
    const cacheSafeUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
    const response = await fetchStorage(cacheSafeUrl, { cache: "no-store" });
    const manifest = await response.json();
    const stationMeta = await getStationMetadata();

    const stationsSource = manifest.stations || [];
    if (Array.isArray(stationsSource)) {
      return stationsSource.map(s => ({
        id: s.id,
        name: stationMeta[s.id]?.name || s.name || `Stazione ${s.id}`,
      }));
    }

    // In alcuni manifest Firebase generati dal seed, stations è un oggetto keyed.
    return Object.keys(stationsSource).map(id => ({
      id,
      name: stationMeta[id]?.name || stationsSource[id]?.name || `Stazione ${id}`,
    }));
  } catch (error) {
    console.error("Errore nel caricamento delle stazioni da Storage:", error);
    return [];
  }
}

// --- PARTENZE (da Firebase Storage) ---
export async function fetchDepartures(stationId, { destinationId } = {}) {
  try {
    const stationMeta = await getStationMetadata();
    await refreshStationLiveData(stationId);
    const [cachePayload, livePayload] = await Promise.all([
      loadStationDepartures(stationId, "departures.json"),
      loadStationDepartures(stationId, "_live.json", { optional: true }),
    ]);

    return {
      live: buildDataset(livePayload, stationMeta, destinationId, "live"),
      cache: buildDataset(cachePayload, stationMeta, destinationId, "cache"),
    };
  } catch (error) {
    console.error("Errore nel caricamento delle partenze da Storage:", error);
    return {
      live: { generated_at: null, departures: [] },
      cache: { generated_at: null, departures: [] },
    };
  }
}

async function loadStationDepartures(stationId, filename, { optional = false } = {}) {
  try {
    const fileRef = ref(storage, `stations/${stationId}/${filename}`);
    const url = await getDownloadURL(fileRef);
    const cacheSafeUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
    const response = await fetchStorage(cacheSafeUrl, { cache: "no-store" });
    return await response.json();
  } catch (error) {
    if (optional) {
      console.info(`File opzionale ${filename} non disponibile per la stazione ${stationId}`);
      return null;
    }
    throw error;
  }
}

function mapTripToDeparture(trip) {
  return {
    train_id: trip.trainId || trip.train_id || trip.id || "",
    time: trip.departureTime || trip.time || "--:--",
    destination: trip.destinationName || trip.dest || trip.finalDestination || "",
    display_destination: trip.displayDestination || undefined,
    requested_destination: trip.requestedDestination || undefined,
    category: trip.category || trip.type || "",
    track: trip.track || trip.platform || "",
    delay: Number.isFinite(trip.delay) ? trip.delay : 0,
    info: trip.note || trip.info || "",
    final_destination: trip.finalDestination || "",
    arrival_time: trip.arrivalTime || "",
    arrival_track: trip.arrivalTrack || "",
    arrival_delay: Number.isFinite(trip.arrivalDelay) ? trip.arrivalDelay : 0,
    source: trip.source || "cache",
  };
}

function normalizeRow(row, stationMeta, source = "cache") {
  if (!row || row.length === 0) return null;
  const [trainId, category, destinationIdRaw, time, track, info, delayRaw] = row;

  if (typeof time !== "string" || time.trim() === "" || trainId === "TRENOTrain") {
    return null;
  }

  const destinationId = destinationIdRaw ? destinationIdRaw.toString() : "";
  let destinationName = "";
  if (destinationId) {
    const station = stationMeta[destinationId];
    destinationName = station?.name || station?.city || "";
  }
  if (!destinationName && info) {
    destinationName = formatInfoDestination(info);
  }
  if (!destinationName && destinationId) {
    destinationName = `Stazione ${destinationId}`;
  }
  if (!destinationName) {
    destinationName = `Treno ${trainId || "?"}`;
  }

  return {
    trainId: trainId?.toString() || "",
    category: category?.toString() || "",
    destinationName,
    destinationId,
    time,
    track: track?.toString() || "",
    delay: Number(delayRaw) || 0,
    info: info || "",
    source,
  };
}

function buildDataset(payload, stationMeta, destinationId, sourceLabel) {
  if (!payload) {
    return { generated_at: null, departures: [] };
  }

  const normalized = buildNormalizedList(payload, stationMeta, destinationId, sourceLabel);
  const merged = mergeRowsByTrain(normalized);
  const rows =
    sourceLabel === "cache"
      ? merged
      : merged.filter(item => isUpcomingDeparture(item.time, payload.serviceDate));

  const departures = rows
    .map(d => mapTripToDeparture(d))
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return {
    generated_at: selectTimestamp(payload),
    departures,
  };
}

function buildNormalizedList(payload, stationMeta, destinationId, sourceLabel) {
  if (!payload) return [];

  const rawRows = Array.isArray(payload.departures)
    ? payload.departures
    : Array.isArray(payload.rows)
      ? payload.rows
      : [];

  const normalized = rawRows
    .map(row => normalizeRow(row, stationMeta, sourceLabel))
    .filter(Boolean);

  if (!destinationId) {
    return normalized;
  }

  const q = destinationId.toString().toLowerCase();
  return normalized.filter(item =>
    (item.destinationName || "").toLowerCase().includes(q)
  );
}

function mergeRowsByTrain(rows) {
  const map = new Map();
  rows.forEach(entry => {
    const key = `${entry.trainId}-${entry.time}`;
    const existing = map.get(key);
    map.set(key, existing ? mergeDepartureEntries(existing, entry) : entry);
  });
  return Array.from(map.values());
}

function selectTimestamp(payload) {
  if (!payload) return null;
  return (
    payload.generated_at ||
    payload.generatedAt ||
    payload?.meta?.generatedAt ||
    payload?.meta?.lastLiveAt ||
    null
  );
}

function mergeDepartureEntries(base, incoming) {
  return {
    ...base,
    category: pickValue(base.category, incoming.category),
    destinationName: pickValue(base.destinationName, incoming.destinationName),
    destinationId: pickValue(base.destinationId, incoming.destinationId),
    track: pickValue(base.track, incoming.track),
    delay: pickNumber(base.delay, incoming.delay),
    info: pickValue(base.info, incoming.info),
  };
}

function pickValue(primary, fallback) {
  if (primary && primary !== "-" && primary !== "0") return primary;
  if (fallback && fallback !== "-" && fallback !== "0") return fallback;
  return primary || fallback || "";
}

function pickNumber(primary, fallback) {
  const p = Number(primary);
  const f = Number(fallback);
  if (Number.isFinite(p) && p !== 0) return p;
  if (Number.isFinite(f)) return f;
  return p || f || 0;
}

function formatInfoDestination(info) {
  if (!info) return "";
  const cleaned = info.toString().trim();
  if (!cleaned) return "";
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isUpcomingDeparture(timeStr, serviceDate) {
  if (!timeStr) return false;
  const timestamp = getDepartureTimestamp(timeStr, serviceDate);
  if (!timestamp) {
    return true;
  }
  const now = Date.now();
  const graceMs = 5 * 60 * 1000; // mantiene gli ultimi 5 minuti
  return timestamp >= now - graceMs;
}

function getDepartureTimestamp(timeStr, serviceDate) {
  try {
    const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    const datePart = serviceDate || new Date().toISOString().slice(0, 10);
    const iso = `${datePart}T${normalizedTime}`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  } catch {
    return null;
  }
}

// --- AVVISI ---
export async function fetchAlerts() {
  try {
    const latest = await getDoc(doc(db, "avvisi/latest"));
    if (!latest.exists()) {
      // Se non esiste "latest", prova a leggere direttamente dalla collezione
      const snap = await getDocs(collection(db, "avvisi"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { items };
    }
    const data = latest.data();
    const items = Array.isArray(data.items) ? data.items : [];
    return { items };
  } catch (error) {
    console.error("Errore nel caricamento degli avvisi:", error);
    return { items: [] };
  }
}

// --- STUB per compatibilità ---
export async function login() {
  return { token: "demo", user: { name: "Ospite" } };
}
export function setToken() { }
export function getToken() {
  return null;
}
export async function fetchSession() {
  return { user: { name: "Ospite" } };
}
export async function fetchLines() {
  return [];
}
