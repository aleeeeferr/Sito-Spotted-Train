const MAP_CENTER = [40.85, 14.27];
const MAP_ZOOM = 11;
const STATIONS_COORDS_PATH = "js/map-coords.json";

// Dati statici delle linee vesuviane per mappa e pannello laterale.
const VESUVIANA_LINES = [
  {
    id: "napoli-sorrento",
    name: "Napoli - Sorrento",
    color: "#db4437",
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
    id: "napoli-poggiomarino",
    name: "Napoli - Poggiomarino",
    color: "#0ea5e9",
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
    id: "napoli-sarno",
    name: "Napoli - Sarno",
    color: "#22c55e",
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
    id: "napoli-torre",
    name: "Napoli - Torre del Greco",
    color: "#a855f7",
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
    id: "napoli-baiano",
    name: "Napoli - Baiano",
    color: "#eab308",
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

function formatCoords({ lat, lng }) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Link diretto a Google Maps con destinazione.
function getDirectionsUrl({ lat, lng }, name) {
  const label = name ? ` (${name})` : "";
  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}${label}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildPopupHtml(name, coords, linesForStation = []) {
  const linesHtml = linesForStation.length
    ? linesForStation.map((line) => `<span class="pill pill-soft pill-compact me-1 mb-1 d-inline-block">${line}</span>`).join("")
    : '<span class="text-muted">Linea non indicata</span>';

  return `
    <div class="map-popup">
      <strong>${name}</strong>
      <div class="text-muted small mb-1">${formatCoords(coords)}</div>
      <div class="mb-2">${linesHtml}</div>
      <button class="btn btn-primary btn-sm w-100" data-open-directions="${name}">Apri indicazioni</button>
    </div>
  `;
}

// Legenda con colori e info linee.
function renderLegend(lines) {
  const legend = document.querySelector("#lines-legend");
  if (!legend) return;
  legend.innerHTML = "";

  lines.forEach((line) => {
    const wrapper = document.createElement("div");
    wrapper.className = "legend-item";
    wrapper.innerHTML = `
      <span class="legend-swatch" style="background:${line.color};"></span>
      <div class="flex-grow-1">
        <div class="fw-semibold">${line.name}</div>
        <div class="text-muted small">${line.stations[0]} → ${line.stations[line.stations.length - 1]}</div>
      </div>
      <span class="badge rounded-pill text-bg-light border">${line.stations.length} fermate</span>
    `;
    legend.appendChild(wrapper);
  });
}

// Apre Google Maps dal popup.
function attachDirectionsHandler(marker, coords, name) {
  marker.on("popupopen", (event) => {
    const popupEl = event.popup?.getElement();
    if (!popupEl) return;
    const btn = popupEl.querySelector("[data-open-directions]");
    if (!btn) return;
    btn.addEventListener(
      "click",
      () => {
        window.open(getDirectionsUrl(coords, name), "_blank", "noopener");
      },
      { once: true }
    );
  });
}

// Disegna linee e stazioni sulla mappa e ritorna i riferimenti.
function drawNetwork(map, coords) {
  const statusEl = document.querySelector("#map-status");
  const stationLines = new Map();
  const polylinesById = new Map();
  const markers = new Map();
  const linesById = new Map();

  VESUVIANA_LINES.forEach((line) => {
    const path = [];
    linesById.set(line.id, line);

    line.stations.forEach((station) => {
      const point = coords[station];
      if (!point) {
        console.warn(`Coordinate mancanti per la stazione "${station}"`);
        return;
      }
      path.push([point.lat, point.lng]);

      if (!stationLines.has(station)) {
        stationLines.set(station, new Set());
      }
      stationLines.get(station).add(line.id);

      if (!markers.has(station)) {
        markers.set(station, { coords: point, color: line.color, marker: null });
      }
    });

    if (path.length > 1) {
      const polyline = L.polyline(path, {
        color: line.color,
        weight: 5,
        opacity: 0.85,
        lineCap: "round",
      }).addTo(map);
      polyline.bindTooltip(line.name, { sticky: true });
      polylinesById.set(line.id, polyline);
    }
  });

  markers.forEach((meta, stationName) => {
    const linesForStation = Array.from(stationLines.get(stationName) || []).map(
      (id) => linesById.get(id)?.name || id
    );
    const marker = L.circleMarker([meta.coords.lat, meta.coords.lng], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: meta.color,
      fillOpacity: 0.95,
      className: "vesuviana-marker",
    }).addTo(map);
    meta.marker = marker;
    marker.bindPopup(buildPopupHtml(stationName, meta.coords, linesForStation), { autoPan: true });
    marker.on("click", () => {
      window.open(getDirectionsUrl(meta.coords, stationName), "_blank", "noopener");
    });
    attachDirectionsHandler(marker, meta.coords, stationName);
  });

  const allPoints = Array.from(markers.values()).map((m) => [m.coords.lat, m.coords.lng]);
  if (allPoints.length) {
    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds.pad(0.08));
  }

  if (statusEl) {
    statusEl.textContent = "Pronto: clicca un pallino per aprire il percorso su Google Maps.";
  }

  const countEl = document.querySelector("#stations-count");
  if (countEl) countEl.textContent = markers.size || "--";

  return { stationLines, polylinesById, markers, linesById, map };
}

// Evidenzia la linea selezionata e attenua le altre.
function setActiveLine(lineId, network) {
  const { stationLines, polylinesById, markers } = network;
  const hasSelection = Boolean(lineId);

  polylinesById.forEach((polyline, id) => {
    const isActive = !hasSelection || id === lineId;
    polyline.setStyle({
      opacity: isActive ? 0.95 : 0.2,
      weight: isActive ? 6 : 3,
    });
  });

  markers.forEach((meta, stationName) => {
    const lines = stationLines.get(stationName) || new Set();
    const isActive = !hasSelection || lines.has(lineId);
    meta.marker.setStyle({
      fillOpacity: isActive ? 0.95 : 0.25,
      opacity: isActive ? 0.95 : 0.25,
    });
    meta.marker.setRadius(isActive ? 7 : 5);
  });
}

async function initMap() {
  const mapContainer = document.querySelector("#map");
  if (!mapContainer) return;

  // Inizializza Leaflet e layer di base.
  const map = L.map(mapContainer, { scrollWheelZoom: true }).setView(MAP_CENTER, MAP_ZOOM);

  // Basemap colorata (Carto Voyager) + alternative
  const cartoVoyager = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors & Carto',
  });
  const cartoPositron = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors & Carto',
  });
  const osmStandard = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });
  const esriImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18,
    attribution: "Tiles &copy; Esri",
  });

  cartoVoyager.addTo(map);
  L.control.layers(
    {
      "Carto Voyager (colorata)": cartoVoyager,
      "Carto Positron (chiara)": cartoPositron,
      "OpenStreetMap": osmStandard,
      "Esri Imagery": esriImagery,
    },
    {},
    { position: "topright", collapsed: true }
  ).addTo(map);

  renderLegend(VESUVIANA_LINES);

  try {
    // Carica coordinate stazioni e costruisce la rete.
    const response = await fetch(STATIONS_COORDS_PATH, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const coords = await response.json();
    const network = drawNetwork(map, coords);
    const panel = document.querySelector(".linee-lista");
    const cards = Array.from(document.querySelectorAll(".linea-card[data-linea]"));

    const setActiveCard = (linea) => {
      cards.forEach((card) => {
        const isActive = card.dataset.linea === linea;
        card.classList.toggle("is-active", isActive);
        card.setAttribute("aria-expanded", isActive ? "true" : "false");
      });
    };

    const populateStations = (card, line) => {
      const container = card.querySelector("[data-linea-stazioni]");
      if (!container || !line) {
        return;
      }
      const items = line.stations
        .map(
          (station, index) => `
            <li data-station="${station}">
              <span class="linea-stazioni-index">${index + 1}</span>
              <span>${station}</span>
            </li>
          `
        )
        .join("");
      container.innerHTML = `
        <h4>Fermate (${line.stations.length})</h4>
        <ul class="linea-stazioni-list">${items}</ul>
      `;
    };

    const collapseAllDetails = () => {
      cards.forEach((card) => {
        card.classList.remove("is-expanded");
        card.classList.remove("is-hidden");
        const btn = card.querySelector(".btn-linea");
        if (btn) {
          btn.textContent = "Apri dettagli";
        }
      });
    };

    const expandCard = (card) => {
      const line = network.linesById.get(card.dataset.linea);
      collapseAllDetails();
      cards.forEach((other) => {
        if (other !== card) {
          other.classList.add("is-hidden");
        }
      });
      card.classList.add("is-expanded");
      const btn = card.querySelector(".btn-linea");
      if (btn) {
        btn.textContent = "Chiudi dettagli";
      }
      populateStations(card, line);
    };

    const handleSelect = (linea) => {
      setActiveCard(linea);
      setActiveLine(linea, network);
    };

    if (cards.length) {
      handleSelect(cards[0].dataset.linea);
    }

    // Gestione click nel pannello (stazioni e dettagli).
    panel?.addEventListener("click", (event) => {
      const stationItem = event.target.closest("[data-station]");
      if (stationItem) {
        const name = stationItem.getAttribute("data-station");
        const markerMeta = network.markers.get(name);
        if (markerMeta?.marker) {
          network.map.setView([markerMeta.coords.lat, markerMeta.coords.lng], 14, { animate: true });
          markerMeta.marker.openPopup();
        }
        return;
      }
      const button = event.target.closest(".btn-linea");
      if (button) {
        const card = button.closest(".linea-card");
        if (card) {
          if (card.classList.contains("is-expanded")) {
            collapseAllDetails();
          } else {
            expandCard(card);
          }
        }
        return;
      }
      const card = event.target.closest(".linea-card");
      if (card?.dataset.linea) {
        handleSelect(card.dataset.linea);
      }
    });
    panel?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        const card = event.target.closest(".linea-card");
        if (card?.dataset.linea) {
          event.preventDefault();
          handleSelect(card.dataset.linea);
        }
      }
    });
  } catch (error) {
    console.error("Impossibile caricare le coordinate delle stazioni:", error);
    const statusEl = document.querySelector("#map-status");
    if (statusEl) statusEl.textContent = "Errore nel caricare la mappa: riprova più tardi.";
  }
}

document.addEventListener("DOMContentLoaded", initMap);
