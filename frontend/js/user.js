const storageKey = "eav-user-profile";
const walletStorageKey = "spotted-demo-wallet";
const inputs = {
  name: document.getElementById("user-name"),
  email: document.getElementById("user-email"),
  lang: document.getElementById("user-lang"),
  theme: document.getElementById("user-theme"),
  home: document.getElementById("user-home"),
  favs: document.getElementById("user-favs"),
  notifRitardi: document.getElementById("notif-ritardi"),
  notifScadenze: document.getElementById("notif-scadenze"),
  notifMail: document.getElementById("notif-mail"),
};

const historyEl = document.getElementById("ticket-history");
const trackingEl = document.getElementById("tracking-saved");
const greetingEl = document.getElementById("user-greeting");
const statusEl = document.getElementById("user-status");
const loginCtaEl = document.getElementById("user-login-cta");
const paymentEl = document.getElementById("payment-info");
const statsTicketsEl = document.getElementById("stats-tickets");
const statsCreditEl = document.getElementById("stats-credit");
const statsLastEl = document.getElementById("stats-last");
const CARD_STORAGE_KEY = "eav-user-card";

const demoTracking = ["Napoli Garibaldi → Sorrento", "Pompei → Napoli", "Napoli Porta Nolana → Sarno"];

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (inputs.name) inputs.name.value = saved.name || "";
    if (inputs.email) inputs.email.value = saved.email || "";
    if (inputs.lang) inputs.lang.value = saved.lang || "it";
    if (inputs.theme) inputs.theme.value = saved.theme || "auto";
    if (inputs.home) inputs.home.value = saved.home || "";
    if (inputs.favs) inputs.favs.value = saved.favs || "";
    if (inputs.notifRitardi) inputs.notifRitardi.checked = Boolean(saved.notifRitardi);
    if (inputs.notifScadenze) inputs.notifScadenze.checked = Boolean(saved.notifScadenze);
    if (inputs.notifMail) inputs.notifMail.checked = Boolean(saved.notifMail);
    updateGreeting(saved.name);
    toggleLoginCta(Boolean(saved.name));
  } catch (err) {
    console.warn("Profilo non leggibile, riparto vuoto.", err);
    updateGreeting("");
    toggleLoginCta(false);
  }
}

function getProfileName() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return saved.name || "";
  } catch {
    return "";
  }
}

function saveProfile() {
  const payload = {
    name: inputs.name?.value?.trim() || "",
    email: inputs.email?.value?.trim() || "",
    lang: inputs.lang?.value || "it",
    theme: inputs.theme?.value || "auto",
    home: inputs.home?.value?.trim() || "",
    favs: inputs.favs?.value?.trim() || "",
    notifRitardi: inputs.notifRitardi?.checked || false,
    notifScadenze: inputs.notifScadenze?.checked || false,
    notifMail: inputs.notifMail?.checked || false,
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function wireInputs() {
  Object.values(inputs)
    .filter(Boolean)
    .forEach((el) => {
      const event = el.type === "checkbox" ? "change" : "input";
      el.addEventListener(event, saveProfile);
    });
}

function updateGreeting(name = "") {
  if (greetingEl) {
    greetingEl.textContent = name ? `Benvenuto, ${name}` : "Benvenuto!";
  }
}

function toggleLoginCta(isLoggedIn) {
  if (statusEl) {
    statusEl.textContent = isLoggedIn ? "Profilo attivo" : "Ospite";
    statusEl.className = isLoggedIn ? "pill pill-live" : "pill pill-soft";
  }
  if (loginCtaEl) {
    loginCtaEl.textContent = isLoggedIn ? "Cambia profilo" : "Accedi";
    loginCtaEl.href = "/pages/login.html";
  }
}

function renderHistory() {
  if (!historyEl) return;
  const wallet = loadWallet();

  if (!wallet.length) {
    historyEl.innerHTML = `
      <div class="wallet-empty">
        <div>
          <strong>Nessun biglietto salvato.</strong>
          <div class="muted">Acquista da "Biglietti" per vedere qui lo storico con QR e dettagli.</div>
        </div>
        <a class="btn btn-outline-light btn-sm" href="/pages/acquista.html">Vai a Biglietti</a>
      </div>
    `;
    return;
  }

  historyEl.innerHTML = wallet.map((item) => renderWalletCard(item)).join("");
}

function loadWallet() {
  try {
    const raw = localStorage.getItem(walletStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Wallet non leggibile:", err);
    return [];
  }
}

function getLatestPurchaseTimestamp(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return null;
  let latest = null;
  entries.forEach((item) => {
    const ts = Number(item.purchaseAt);
    if (Number.isFinite(ts) && (latest === null || ts > latest)) {
      latest = ts;
    }
  });
  return latest;
}

function updateStats() {
  const wallet = loadWallet();
  if (statsTicketsEl) {
    statsTicketsEl.textContent = wallet.length ? String(wallet.length) : "0";
  }
  if (statsCreditEl) {
    const card = loadCard();
    statsCreditEl.textContent = card ? formatPrice(card.credit) : "-";
  }
  if (statsLastEl) {
    const latest = getLatestPurchaseTimestamp(wallet);
    statsLastEl.textContent = latest ? formatPurchaseDate(latest) : "-";
  }
}

function renderWalletCard(item) {
  const isDemo = item.demo;
  const title = item.label || item.title || "Titolo demo";
  const variant = item.variant ? item.variant.toUpperCase() : item.code || "DEMO";
  const price = formatPrice(item.price, item.priceFormatted);
  const route = formatRoute(item.origin, item.destination);
  const purchase = item.purchaseAt ? formatPurchaseDate(item.purchaseAt) : item.date || "";
  const qr = item.qr || "";
  const scopeLabel = item.scope === "passes" ? "ABBONAMENTO" : "BIGLIETTO";
  const metaTags = [variant, item.tariff, scopeLabel].filter(Boolean);

  return `
    <div class="wallet-card">
      <div class="wallet-body">
        <p class="wallet-eyebrow">${isDemo ? "DEMO" : scopeLabel}</p>
        <h4 class="wallet-title">${title}</h4>
        ${route ? `<p class="wallet-route">${route}</p>` : ""}
        <div class="wallet-meta">
          ${metaTags.map((t) => `<span class="pill pill-soft">${t}</span>`).join("")}
          <span class="pill pill-ghost">${isDemo ? "QR demo" : "QR locale"}</span>
        </div>
        <div class="wallet-footer">
          <div class="wallet-price">${price}</div>
          ${purchase ? `<div class="wallet-date">${purchase}</div>` : ""}
        </div>
      </div>
      <div class="wallet-qr">
        ${
          qr
            ? `<img src="${qr}" alt="QR demo non valido" loading="lazy"/>`
            : `<div class="wallet-qr-placeholder">QR demo</div>`
        }
        <div class="wallet-qr-caption">Codice dimostrativo · non valido</div>
      </div>
    </div>
  `;
}

function formatPurchaseDate(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatPrice(value, formatted) {
  if (formatted) return `€ ${formatted}`;
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `€ ${num.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return value || "—";
}

function formatRoute(origin, destination) {
  if (!origin && !destination) return "";
  if (!origin || !destination) return origin || destination || "";
  return `${origin.toUpperCase()} → ${destination.toUpperCase()}`;
}

loadProfile();
wireInputs();
renderHistory();
renderPayment();
updateStats();

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-add-card]")) {
    addDemoCard();
  }
});

function loadCard() {
  try {
    const raw = localStorage.getItem(CARD_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("Carta non leggibile", error);
    return null;
  }
}

function saveCard(card) {
  try {
    localStorage.setItem(CARD_STORAGE_KEY, JSON.stringify(card));
  } catch (error) {
    console.warn("Carta non salvata", error);
  }
}

function renderPayment() {
  if (!paymentEl) return;
  const card = loadCard();
  if (!card) {
    paymentEl.innerHTML = `
      <div>
        <p class="eyebrow mb-1">Metodo di pagamento</p>
        <strong>Nessuna carta salvata</strong>
        <p class="muted mb-0">Aggiungi una carta demo per mostrare il credito disponibile.</p>
      </div>
      <div class="payment-actions">
        <button class="btn btn-outline-light btn-sm" type="button" data-add-card="true">Aggiungi carta demo</button>
      </div>
    `;
    return;
  }

  paymentEl.innerHTML = `
    <div>
      <p class="eyebrow mb-1">Carta ${card.brand || "demo"}</p>
      <strong>${card.owner || "Utente"} · •••• ${card.last4 || "0000"}</strong>
      <p class="muted mb-0">Credito disponibile: ${formatPrice(card.credit)}</p>
    </div>
    <div class="payment-actions">
      <span class="pill pill-soft">Saldo locale</span>
    </div>
  `;
}

function addDemoCard() {
  const name = inputs.name?.value?.trim() || getProfileName() || "Utente";
  const card = {
    brand: "VISA",
    last4: Math.floor(Math.random() * 9000 + 1000).toString(),
    owner: name,
    credit: 50,
  };
  saveCard(card);
  renderPayment();
  updateStats();
}
