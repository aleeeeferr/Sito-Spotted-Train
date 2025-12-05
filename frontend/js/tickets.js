import { TARIFFS } from "./tariffs.js";

const API_ENDPOINT = "https://example.com/unico";
const PREFETCH_ENDPOINT = "https://example.com/unico";

function normalizeName(value) {
  return value
    ? value
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase()
    : "";
}

// Fermate EAV ammesse per le ricerche tariffarie (maiucolate per match diretto con il prefetch)
const EAV_STATIONS = [
  "NAPOLI PORTA NOLANA",
  "NAPOLI GARIBALDI",
  "NAPOLI",
  "SAN GIOVANNI",
  "VIA GIANTURCO",
  "SAN GIOVANNI A TEDUCCIO",
  "BARRA",
  "PONTICELLI",
  "POLLENA TROCCHIA",
  "CERCOLA",
  "POLLENA",
  "GUINDAZZI",
  "MADONNA DELL'ARCO",
  "SANT'ANASTASIA",
  "VILLA AUGUSTEA",
  "SOMMA VESUVIANA",
  "RIONE TRIESTE",
  "OTTAVIANO",
  "S. LEONARDO",
  "SAN LEONARDO",
  "SAN GIUSEPPE",
  "SAN GIUSEPPE VESUVIANO",
  "CASILLI",
  "TERZIGNO",
  "FLOCCO",
  "POGGIOMARINO",
  "STRIANO",
  "SAN VALENTINO",
  "SARNO",
  "SANTA MARIA DEL POZZO",
  "SAN GIORGIO A CREMANO",
  "CAVALLI DI BRONZO",
  "PORTICI BELLAVISTA",
  "PORTICI VIA LIBERTÀ",
  "ERCOLANO SCAVI",
  "ERCOLANO MIGLIO D'ORO",
  "TORRE DEL GRECO",
  "VIA SANT'ANTONIO",
  "VIA DEL MONTE",
  "VILLA DELLE GINESTRE",
  "LEOPARDI",
  "TRECASE",
  "TORRE ANNUNZIATA - OPLONTI",
  "TORRE ANNUNZIATA OPLONTI",
  "BOSCOTRECASE",
  "BOSCOREALE",
  "VILLA REGINA",
  "POMPEI SANTUARIO",
  "SCAFATI",
  "SAN PIETRO",
  "VIA CANGIANI",
  "POMPEI SCAVI VILLA DEI MISTERI",
  "MOREGINE",
  "PIOPPAINO",
  "VIA NOCERA",
  "CASTELLAMMARE DI STABIA",
  "VICO EQUENSE",
  "SEIANO",
  "META",
  "PIANO",
  "PIANO DI SORRENTO",
  "SANT'AGNELLO",
  "SORRENTO",
  "POGGIORALE",
  "BOTTEGHELLE",
  "CASALNUOVO",
  "TALONA",
  "PRATOLA PONTE",
  "POMIGLIANO D'ARCO",
  "VOLLA",
  "CASTELCISTERNA",
  "BRUSCIANO",
  "VIA VITTORIO VENETO",
  "MARIGLIANO",
  "S.VITALIANO",
  "SAN VITALIANO",
  "SCISCIANO",
  "SAVIANO",
  "NOLA",
  "CIMITILE",
  "CAMPOSANO",
  "CICCIANO",
  "ROCCARAINOLA",
  "AVELLA",
  "BAIANO",
  "LA PIGNA",
  "DE RUGGIERO",
  "CENTRO DIREZIONALE",
  "BARTOLO LONGO",
  "VESUVIO DE MEIS (SGV)",
  "VESUVIO DE MEIS (SA)",
  "VILLA VISCONTI",
  "ARGINE - PALASPORT",
  "VESUVIO DE MEIS",
  "MADONNELLE",
  "SALICE",
  "POZZUOLI",
  "QUARTO",
];
const EAV_LOOKUP = new Set(EAV_STATIONS.map((s) => normalizeName(s)));

const form = document.getElementById("ticket-form");
const statusEl = document.getElementById("ticket-status");
const resultEl = document.getElementById("ticket-result");
const submitButton = document.getElementById("ticket-submit");
const cartEl = document.getElementById("ticket-cart");
const previewEl = document.getElementById("ticket-preview");
const paymentModal = document.getElementById("payment-modal");
const paymentForm = document.getElementById("payment-form");
const paymentSummaryEl = document.getElementById("payment-summary");
const paymentFeedbackEl = document.getElementById("payment-feedback");

const KNOWN_FIELDS = [
  { key: "tariffa", label: "Codice tariffa" },
  { key: "tariffa_e", label: "Tariffa EAV" },
  { key: "tariffa_u", label: "Tariffa U" },
  { key: "prezzo", label: "Prezzo" },
  { key: "importo", label: "Importo" },
  { key: "valore", label: "Valore" },
  { key: "valuta", label: "Valuta" },
  { key: "km", label: "Km" },
  { key: "origine", label: "Origine (payload)" },
  { key: "destinazione", label: "Destinazione (payload)" },
  { key: "status", label: "Stato" },
  { key: "descrizione", label: "Descrizione" },
  { key: "tipo", label: "Tipo" },
  { key: "categoria", label: "Categoria" },
  { key: "data", label: "Data aggiornamento" },
  { key: "id_tariffe", label: "ID tariffa" },
];

const PRIMARY_TICKET_PRIORITY = ["ordinario", "single", "giornaliero", "settimanale"];
let ticketCardCounter = 0;
const cartState = {
  items: [],
};
let lastTrip = { origine: "", destinazione: "" };
let pendingTrip = { origine: "", destinazione: "" };

if (paymentForm) {
  paymentForm.addEventListener("submit", handlePaymentSubmit);
}

prefetchStations();

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearResult();

    const origineInfo = normalizeStationInput(form.origine.value);
    const destinazioneInfo = normalizeStationInput(form.destinazione.value);
    const ppnInput = form.querySelector("input[name='ppn']");
    const ppn = ppnInput ? ppnInput.checked : false;

    if (!origineInfo.id || !destinazioneInfo.id) {
      setStatus("Inserisci origine e destinazione prima di calcolare la tariffa.", "error");
      return;
    }
    if (origineInfo.id === destinazioneInfo.id) {
      setStatus("Origine e destinazione devono essere diverse.", "warning");
      return;
    }

    form.origine.value = origineInfo.label;
    form.destinazione.value = destinazioneInfo.label;
    pendingTrip = { origine: origineInfo.label, destinazione: destinazioneInfo.label };

    setLoading(true);
    setStatus("Richiesta della tariffa in corso...", "info");

    try {
      const url = buildEndpointUrl({ origine: origineInfo.id, destinazione: destinazioneInfo.id, ppn });
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Risposta non valida (${response.status})`);
      }

      const data = await response.json();
      const enhanced = decorateWithTariffTable(data, { ppn });
      renderResult(enhanced);
      setStatus("Tariffa caricata correttamente.", "success");
    } catch (error) {
      console.error("Errore nel recupero della tariffa:", error);
      setStatus("Impossibile recuperare la tariffa. Riprova più tardi.", "error");
    } finally {
      setLoading(false);
    }
  });
}

renderCart();
renderPreview();

function buildEndpointUrl({ origine, destinazione, ppn }) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set("origine", origine);
  url.searchParams.set("destinazione", destinazione);
  url.searchParams.set("ppn", ppn ? "true" : "false");
  return url;
}

function setStatus(message, type) {
  if (!statusEl) return;
  statusEl.textContent = message;
  const variant =
    type === "success" ? "success" :
    type === "error" ? "danger" :
    type === "warning" ? "warning" : "info";
  statusEl.className = `alert alert-${variant} mt-3`;
}

function clearResult() {
  if (resultEl) {
    resultEl.innerHTML = "";
  }
}

function renderResult(payload) {
  if (!resultEl) {
    return;
  }

  if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
    resultEl.innerHTML = `<p class="text-muted">Nessun dato disponibile per la combinazione selezionata.</p>`;
    return;
  }

  if (Array.isArray(payload)) {
    resultEl.innerHTML = payload.length
      ? payload.map((item, idx) => renderCard(item, idx + 1)).join("")
      : `<p class="text-muted">Nessuna tariffa disponibile.</p>`;
    return;
  }

  resultEl.innerHTML = renderCard(payload);
  lastTrip = {
    origine: pendingTrip.origine || form?.origine?.value?.trim() || "",
    destinazione: pendingTrip.destinazione || form?.destinazione?.value?.trim() || "",
  };
  pendingTrip = { origine: "", destinazione: "" };
}

async function prefetchStations() {
  const datalistId = "station-options";
  const datalist = document.getElementById(datalistId);
  if (!datalist) return;
  try {
    const response = await fetch(PREFETCH_ENDPOINT);
    if (!response.ok) throw new Error(`Prefetch HTTP ${response.status}`);
    const payload = await response.json();
    const normalized = Array.from(
      new Set(
        (Array.isArray(payload) ? payload : [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
    const filtered = normalized.filter((name) => EAV_LOOKUP.has(name));
    const usable = filtered.length ? filtered : normalized;
    const sorted = usable.sort((a, b) => a.localeCompare(b));
    datalist.innerHTML = sorted.map((name) => `<option value="${name}"></option>`).join("");
    const inputs = [form?.origine, form?.destinazione].filter(Boolean);
    inputs.forEach((input) => input.setAttribute("list", datalistId));
  } catch (error) {
    console.warn("Prefetch stazioni UnicoCampania non disponibile:", error);
  }
}

function renderCard(data, index = null) {
  const title = data.tariffa_e || data.tariffa || data.nome || data.titolo || (index ? `Tariffa #${index}` : "Tariffa");
  const price = extractPrice(data);
  const routeLabel = formatRouteLabel();
  const tableEntry = getTariffTableEntry(data);
  const tableLabel = formatTableLabel(tableEntry);
  const breakdownId = `ticket-${++ticketCardCounter}`;
  const tariffCode = resolveTariffCode(data) || title;
  const breakdown = tableEntry ? renderBreakdown(tableEntry, breakdownId, tariffCode) : "";
  const showPpn = Boolean(data.ppnApplied);
  const hasBreakdown = Boolean(breakdown);
  const typeLabel = data.prezzo_tipo ? data.prezzo_tipo.toUpperCase() : "";

  return `
    <article class="ticket-card ${hasBreakdown ? "" : "ticket-card--compact"}">
      <div class="ticket-card-left">
        <div class="ticket-card-chip">
          <strong>${tariffCode}</strong>
          ${tableLabel ? `<span>${tableLabel}</span>` : ""}
        </div>
        ${routeLabel ? `<p class="ticket-route">${routeLabel}</p>` : ""}
        <div class="ticket-price-block">
          <span class="ticket-price-symbol">€</span>
          <span class="ticket-price-main">${price || "-"}</span>
          ${typeLabel ? `<span class="ticket-price-type">${typeLabel}</span>` : ""}
        </div>
        ${showPpn ? `<p class="ppn-note">Con passaggio su Napoli</p>` : ""}
        <p class="ticket-title">${title}</p>
      </div>
      ${
        hasBreakdown
          ? `<div class="ticket-card-right" data-breakdown-wrapper="${breakdownId}">${breakdown}</div>`
          : ""
      }
    </article>
  `;
}

function extractImportantFields(data) {
  return KNOWN_FIELDS
    .filter(({ key }) => data[key] !== undefined && data[key] !== null && data[key] !== "")
    .map(({ key, label }) => ({ key, label, value: data[key] }));
}

function renderFieldList(fields) {
  return `
    <dl class="field-grid">
      ${fields
        .map(
          ({ label, value }) => `
            <div>
              <dt>${label}</dt>
              <dd>${formatValue(value)}</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `;
}

function formatRouteLabel() {
  const origine = pendingTrip.origine || lastTrip.origine;
  const destinazione = pendingTrip.destinazione || lastTrip.destinazione;
  if (!origine || !destinazione) return "";
  return `${origine} → ${destinazione}`;
}

function formatValue(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
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

function setLoading(isLoading) {
  if (!submitButton) return;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Caricamento..." : "Calcola tariffa";
}

function extractPrice(payload) {
  const raw =
    payload.prezzo_calcolato ??
    payload.prezzo ??
    payload.importo ??
    payload.price ??
    payload.valore ??
    null;
  if (raw === null || raw === undefined || raw === "") return null;

  const normalized = raw.toString().replace("€", "").replace(",", ".").trim();
  const num = Number(normalized);
  if (Number.isFinite(num)) {
    return num.toFixed(2);
  }
  return raw;
}

function decorateWithTariffTable(payload, meta = {}) {
  if (!payload) return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => enhanceTariffEntry(item, meta));
  }
  return enhanceTariffEntry(payload, meta);
}

function enhanceTariffEntry(entry, meta = {}) {
  const code = resolveTariffCode(entry);
  if (!code) return entry;

  const tableEntry = TARIFFS[code];
  if (!tableEntry) {
    return {
      ...entry,
      ppnApplied: meta.ppn,
      tariff_table_code: code,
    };
  }

  const preferIntegrato = Boolean(meta.ppn);
  const primaryTicket = pickPrimaryTicket(tableEntry.tickets);
  let prezzoCalcolato = entry.prezzo_calcolato;
  let prezzoTipo = entry.prezzo_tipo;

  if (primaryTicket) {
    const priceValue = preferIntegrato
      ? primaryTicket.integrato ?? primaryTicket.aziendale
      : primaryTicket.aziendale ?? primaryTicket.integrato;

    if (priceValue !== null && priceValue !== undefined) {
      prezzoCalcolato = Number(priceValue).toFixed(2);
      prezzoTipo =
        preferIntegrato && primaryTicket.integrato !== null && primaryTicket.integrato !== undefined
          ? "Integrato"
          : "Aziendale";
    }
  }

  return {
    ...entry,
    prezzo_calcolato: prezzoCalcolato ?? entry.prezzo_calcolato,
    prezzo_tipo: prezzoTipo ?? entry.prezzo_tipo,
    ppnApplied: meta.ppn,
    tariff_table_code: code,
  };
}

function resolveTariffCode(payload = {}) {
  const raw =
    payload.tariff_table_code ||
    payload.tariffa ||
    payload.tariffa_e ||
    payload.tariffa_u ||
    payload.code ||
    payload.codice ||
    "";

  return raw
    .toString()
    .trim()
    .replace(/[^0-9a-z]/gi, "")
    .toUpperCase();
}

function getTariffTableEntry(payload) {
  const code = resolveTariffCode(payload);
  if (!code) return null;
  return TARIFFS[code] || null;
}

function pickPrimaryTicket(tickets = {}) {
  for (const key of PRIMARY_TICKET_PRIORITY) {
    if (tickets[key] && hasPrice(tickets[key])) {
      return tickets[key];
    }
  }
  const values = Object.values(tickets).filter(hasPrice);
  return values.length ? values[0] : null;
}

function hasPrice(entry) {
  if (!entry) return false;
  return (
    entry.aziendale !== null && entry.aziendale !== undefined
  ) || (
    entry.integrato !== null && entry.integrato !== undefined
  );
}

function renderBreakdown(tableEntry, breakdownId, tariffCode) {
  const scopes = [
    buildScopeData("tickets", "Biglietti", tableEntry?.tickets, tariffCode),
    buildScopeData("passes", "Abbonamenti", tableEntry?.abbonamenti, tariffCode),
  ].filter(Boolean);

  if (!scopes.length) return "";

  const tabs = scopes.length > 1 ? renderScopeTabs(scopes) : "";
  const panels = scopes.map((scope, index) => renderScopePanel(scope, index === 0, tariffCode)).join("");

  return `
    <div class="ticket-breakdown" data-breakdown="${breakdownId}">
      ${tabs}
      ${panels}
    </div>
  `;
}

function buildScopeData(key, title, entries = {}, tariffCode) {
  const list = Object.entries(entries || {})
    .map(([entryKey, value]) => ({
      key: entryKey,
      label: value.label || entryKey,
      data: value,
    }))
    .filter(({ data }) => hasPrice(data));

  if (!list.length) return null;
  return { key, title, entries: list, tariffCode };
}

function renderScopeTabs(scopes) {
  return `
    <div class="ticket-scope-tabs" role="tablist">
      ${scopes
        .map(
          (scope, index) => `
            <button
              type="button"
              class="ticket-scope-button ${index === 0 ? "active" : ""}"
              data-scope-toggle="${scope.key}"
              aria-selected="${index === 0}"
            >
              ${scope.title}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderScopePanel(scope, isActive, tariffCode) {
  const exclusive = scope.key === "passes" && scope.entries.length > 1;
  const categoryTabs = exclusive ? renderCategoryTabs(scope) : "";
  const cards = scope.entries
    .map((entry, index) => renderEntryCard(scope.key, entry, !exclusive || index === 0, exclusive, tariffCode))
    .join("");

  return `
    <section class="ticket-scope-panel ${isActive ? "active" : ""}" data-scope-panel="${scope.key}">
      ${categoryTabs}
      <div class="ticket-detail-grid" data-category-grid="${scope.key}" data-exclusive="${exclusive}">
        ${cards}
      </div>
    </section>
  `;
}

function renderCategoryTabs(scope) {
  return `
    <div class="ticket-category-tabs">
      ${scope.entries
        .map(
          (entry, index) => `
            <button
              type="button"
              class="ticket-category-button ${index === 0 ? "active" : ""}"
              data-category-toggle="${scope.key}:${entry.key}"
            >
              ${entry.label}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEntryCard(scopeKey, entry, isActive, exclusive, tariffCode) {
  const variants = buildVariants(entry.data);
  if (!variants.length) return "";

  const classes = ["ticket-detail-card"];
  if (exclusive) {
    classes.push("ticket-detail-card--exclusive");
    if (isActive) {
      classes.push("active");
    }
  }

  return `
    <article class="${classes.join(" ")}" data-category-card="${scopeKey}:${entry.key}">
      <header>
        <p class="ticket-detail-tag">${scopeKey === "passes" ? "ABBONAMENTO" : "BIGLIETTO"}</p>
        <h5>${entry.label}</h5>
      </header>
      <div class="ticket-variant-grid">
        ${variants
          .map((variant) => renderVariantCard({ scopeKey, entry, variant, tariffCode }))
          .join("")}
      </div>
    </article>
  `;
}

function buildVariants(entryData = {}) {
  const variants = [];
  if (entryData.aziendale !== null && entryData.aziendale !== undefined) {
    variants.push({ key: "aziendale", label: "Aziendale", price: entryData.aziendale });
  }
  if (entryData.integrato !== null && entryData.integrato !== undefined) {
    variants.push({ key: "integrato", label: "Integrato", price: entryData.integrato });
  }
  return variants;
}

function renderVariantCard({ scopeKey, entry, variant, tariffCode }) {
  return `
    <div class="ticket-variant-card">
      <p class="ticket-variant-label">${variant.label}</p>
      <p class="ticket-variant-price">€ ${formatEuroValue(variant.price)}</p>
      <button
        type="button"
        class="ticket-variant-cta"
        data-add-to-cart="true"
        data-tariff="${tariffCode}"
        data-scope="${scopeKey}"
        data-category="${entry.key}"
        data-label="${entry.label}"
        data-variant="${variant.key}"
        data-price="${variant.price}"
      >
        Aggiungi al carrello
      </button>
    </div>
  `;
}

function renderPriceChip(label, value) {
  if (value === null || value === undefined) return "";
  return `<span class="ticket-price-chip"><span>${label}</span><strong>€ ${formatEuroValue(value)}</strong></span>`;
}

function formatEuroValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTableLabel(entry) {
  if (!entry) return "";
  if (entry.tipo) {
    return `${entry.label} · Tipo ${entry.tipo}`;
  }
  return entry.label;
}

function normalizeStationInput(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { id: "", label: "" };
  }
  const upper = trimmed.toUpperCase();
  return { id: upper, label: trimmed };
}

function handleAddToCart(button) {
  const price = Number(button.getAttribute("data-price"));
  if (!Number.isFinite(price)) return;

  const item = {
    tariff: button.getAttribute("data-tariff") || "",
    scope: button.getAttribute("data-scope") || "",
    category: button.getAttribute("data-category") || "",
    label: button.getAttribute("data-label") || "",
    variant: button.getAttribute("data-variant") || "",
    price,
    origine: lastTrip.origine,
    destinazione: lastTrip.destinazione,
  };

  cartState.items.push(item);
  renderCart();
  renderPreview(item);
}

function handleRemoveFromCart(index) {
  if (Number.isNaN(index)) return;
  cartState.items.splice(index, 1);
  renderCart();
  const lastItem = cartState.items[cartState.items.length - 1] || null;
  renderPreview(lastItem);
}

function renderCart() {
  if (!cartEl) return;

  if (!cartState.items.length) {
    cartEl.innerHTML = `
      <h3>Carrello</h3>
      <p class="ticket-cart-empty">Nessun titolo selezionato.</p>
    `;
    return;
  }

  const items = cartState.items
    .map((item, index) => `
      <li class="cart-item">
        <div class="cart-item-info">
          <h4>${item.label}</h4>
          <p class="cart-item-meta">${item.variant.toUpperCase()} · ${item.scope === "passes" ? "Abbonamento" : "Biglietto"} · ${item.tariff}</p>
        </div>
        <div class="cart-item-amount">€ ${formatEuroValue(item.price)}</div>
        <button type="button" class="cart-remove" data-remove-cart="${index}">Rimuovi</button>
      </li>
    `)
    .join("");

  const total = cartState.items.reduce((sum, item) => sum + (item.price || 0), 0);

  cartEl.innerHTML = `
    <h3>Carrello</h3>
    <ul class="cart-items-list">
      ${items}
    </ul>
    <div class="cart-summary">
      <span>Totale</span>
      <span>€ ${formatEuroValue(total)}</span>
    </div>
    <button type="button" class="cart-checkout" data-checkout="true">Procedi al pagamento</button>
  `;
}

function renderPreview(item = null) {
  if (!previewEl) return;

  if (!item) {
    previewEl.innerHTML = `<p class="ticket-preview-empty">Seleziona un biglietto o un abbonamento per vedere l'anteprima.</p>`;
    return;
  }

  const route = item.origine && item.destinazione ? `${item.origine} → ${item.destinazione}` : "";
  const type = item.scope === "passes" ? "Abbonamento" : "Biglietto";

  previewEl.innerHTML = `
    <div class="ticket-pass">
      <div class="ticket-pass-header">
        <div>
          <p class="ticket-pass-type">${type} · ${item.variant.toUpperCase()}</p>
          <h4>${item.label}</h4>
        </div>
        <div class="ticket-pass-price">€ ${formatEuroValue(item.price)}</div>
      </div>
      ${route ? `<p class="ticket-pass-route">${route}</p>` : ""}
      <div class="ticket-pass-row">
        <span>Codice tariffa</span>
        <strong>${item.tariff}</strong>
      </div>
      <div class="ticket-pass-row">
        <span>Validità</span>
        <strong>${item.label}</strong>
      </div>
    </div>
    <div class="ticket-pass-qr" aria-hidden="true"></div>
  `;
}

function handleCheckout() {
  if (!cartState.items.length) return;
  openPaymentModal();
}

function openPaymentModal() {
  if (!paymentModal) return;
  updatePaymentSummary();
  if (paymentForm) {
    paymentForm.reset();
  }
  setPaymentFeedback("");
  paymentModal.classList.add("open");
  paymentModal.setAttribute("aria-hidden", "false");
}

function closePaymentModal() {
  if (!paymentModal) return;
  paymentModal.classList.remove("open");
  paymentModal.setAttribute("aria-hidden", "true");
}

function updatePaymentSummary() {
  if (!paymentSummaryEl) return;
  if (!cartState.items.length) {
    paymentSummaryEl.innerHTML = `<p>Aggiungi almeno un titolo al carrello prima di procedere.</p>`;
    return;
  }

  const rows = cartState.items
    .map(
      (item) => `
        <li>
          <span>${item.label} · ${item.variant.toUpperCase()}</span>
          <strong>€ ${formatEuroValue(item.price)}</strong>
        </li>
      `
    )
    .join("");
  const total = cartState.items.reduce((sum, item) => sum + (item.price || 0), 0);

  paymentSummaryEl.innerHTML = `
    <ul>
      ${rows}
    </ul>
    <div class="payment-summary-total">
      <span>Totale</span>
      <strong>€ ${formatEuroValue(total)}</strong>
    </div>
  `;
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  if (!cartState.items.length) {
    setPaymentFeedback("Aggiungi un titolo al carrello prima di pagare.", "error");
    return;
  }

  const submitButton = paymentForm?.querySelector(".payment-submit");
  if (submitButton) submitButton.disabled = true;
  setPaymentFeedback("Elaborazione pagamento demo...", "info");

  // Simulazione di una chiamata verso il backend / Firebase per registrare il pagamento
  await new Promise((resolve) => setTimeout(resolve, 1500));

  setPaymentFeedback("Pagamento registrato! Invio ricevuta in corso...", "success");

  cartState.items = [];
  renderCart();
  renderPreview();

  // Qui potrai agganciare Firebase o un vero gateway per inviare email di conferma.

  setTimeout(() => {
    closePaymentModal();
    setPaymentFeedback("");
  }, 1500);

  if (paymentForm) paymentForm.reset();
  if (submitButton) submitButton.disabled = false;
}

function setPaymentFeedback(message, type = "info") {
  if (!paymentFeedbackEl) return;
  paymentFeedbackEl.textContent = message;
  paymentFeedbackEl.dataset.type = type;
}

document.addEventListener("click", (event) => {
  const closePayment = event.target.closest("[data-close-payment]");
  if (closePayment) {
    closePaymentModal();
    return;
  }

  const scopeButton = event.target.closest("[data-scope-toggle]");
  if (scopeButton) {
    handleScopeToggle(scopeButton);
    return;
  }

  const categoryButton = event.target.closest("[data-category-toggle]");
  if (categoryButton) {
    handleCategoryToggle(categoryButton);
    return;
  }

  const addToCartButton = event.target.closest("[data-add-to-cart]");
  if (addToCartButton) {
    handleAddToCart(addToCartButton);
    return;
  }

  const removeButton = event.target.closest("[data-remove-cart]");
  if (removeButton) {
    handleRemoveFromCart(Number(removeButton.getAttribute("data-remove-cart")));
    return;
  }

  const checkoutButton = event.target.closest("[data-checkout]");
  if (checkoutButton) {
    handleCheckout();
  }
});

function handleScopeToggle(button) {
  const container = button.closest(".ticket-breakdown");
  if (!container) return;

  const target = button.getAttribute("data-scope-toggle");
  container
    .querySelectorAll("[data-scope-toggle]")
    .forEach((btn) => btn.classList.toggle("active", btn === button));
  container
    .querySelectorAll("[data-scope-panel]")
    .forEach((panel) => panel.classList.toggle("active", panel.getAttribute("data-scope-panel") === target));
}

function handleCategoryToggle(button) {
  const identifier = button.getAttribute("data-category-toggle");
  if (!identifier) return;

  const [scopeKey] = identifier.split(":");
  const panel = button.closest(`[data-scope-panel="${scopeKey}"]`);
  if (!panel) return;

  panel
    .querySelectorAll("[data-category-toggle]")
    .forEach((btn) => btn.classList.toggle("active", btn === button));

  panel
    .querySelectorAll("[data-category-card]")
    .forEach((card) => {
      const isTarget = card.getAttribute("data-category-card") === identifier;
      card.classList.toggle("active", isTarget);
    });
}
