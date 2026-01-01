import { apiFetch, getToken } from "./user-dashboard.js";

const formatPrice = (value) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);

const formatDateTime = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getEl = (id) => document.getElementById(id);
const setText = (id, value) => {
  const el = getEl(id);
  if (el) el.textContent = value;
};
const getInitials = (name = "U") =>
  name
    .trim()
    .split(" ")
    .filter((part) => part)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";

// Crea il blocco HTML per un biglietto attivo.
const buildActiveTicket = (ticket) => {
  const wrapper = document.createElement("div");
  wrapper.className = "ticket-compact ticket-divider";

  const info = document.createElement("div");
  info.className = "ticket-compact-info";

  const status = document.createElement("span");
  status.className = "badge-ok";
  status.textContent = "Attivo";

  const title = document.createElement("h3");
  title.textContent = ticket.title || "Biglietto";

  const route = document.createElement("p");
  route.textContent = ticket.route || "";

  const meta = document.createElement("p");
  meta.className = "ticket-meta";
  meta.textContent = ticket.expiresAt
    ? `Valido fino a: ${formatDateTime(ticket.expiresAt)}`
    : "Valido fino a: —";

  info.append(status, title, route, meta);

  const action = document.createElement("button");
  action.className = "btn-primary btn-small btn-ticket";
  action.type = "button";
  action.textContent = "Apri biglietto";

  wrapper.append(info, action);
  return wrapper;
};

// Crea una riga per la cronologia movimenti del credito.
const buildMovementItem = (movement) => {
  const li = document.createElement("li");

  const badge = document.createElement("span");
  const isTopUp = movement.type === "ricarica";
  badge.className = isTopUp ? "badge-ok" : "badge-warning";
  badge.textContent = isTopUp ? "Ricarica" : "Acquisto";

  const body = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = movement.note || (isTopUp ? "Ricarica credito" : "Acquisto");

  const amount = document.createElement("p");
  const sign = movement.amount > 0 ? "+" : "";
  amount.textContent = `${sign}${formatPrice(movement.amount || 0)}`;

  const when = document.createElement("small");
  when.textContent = formatDateTime(movement.createdAt) || "—";

  body.append(title, amount, when);
  li.append(badge, body);
  return li;
};

// Aggiorna nome, email e avatar nell'header utente.
const updateProfile = (user) => {
  setText("area-user-name", user?.name || "Utente");
  setText("area-user-email", user?.email || "");
  const avatarEl = getEl("profile-avatar");
  if (avatarEl) {
    avatarEl.textContent = getInitials(user?.name || "U");
  }
};

// Mostra il credito attuale.
const updateCredit = (amount) => {
  setText("user-credit", formatPrice(amount || 0));
};

// Render generico di una lista con placeholder "vuoto".
const renderList = (listId, emptyId, items = [], builder) => {
  const list = getEl(listId);
  const empty = getEl(emptyId);
  if (!list) return;
  list.innerHTML = "";
  if (!items.length) {
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";
  items.forEach((item) => list.append(builder(item)));
};

const renderActiveTickets = (tickets = []) =>
  renderList("active-ticket-list", "active-ticket-empty", tickets, buildActiveTicket);

const renderMovements = (movements = []) =>
  renderList("credit-movements", "credit-movements-empty", movements, buildMovementItem);

// Gestisce la ricarica credito dal bottone.
const setupTopUp = () => {
  const input = getEl("ricarica-input");
  const button = document.querySelector(".btn-ricarica");
  if (!input || !button) return;

  button.addEventListener("click", async () => {
    const amount = Number(input.value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Inserisci un importo valido.");
      return;
    }
    try {
      const response = await apiFetch("/api/user/credit", {
        method: "POST",
        body: { amount },
      });
      updateCredit(response?.user?.credit || 0);
      input.value = "";
      const movements = await apiFetch("/api/user/credit/movements");
      renderMovements(movements?.movements || []);
    } catch (err) {
      window.alert(err.message || "Errore ricarica");
    }
  });
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!getToken()) {
    window.location.href = "login.html";
    return;
  }

  try {
    const response = await apiFetch("/api/user/me");
    const user = response?.user || {};
    updateProfile(user);
    updateCredit(user.credit || 0);
    renderActiveTickets(user.tickets || []);

    const movements = await apiFetch("/api/user/credit/movements");
    renderMovements(movements?.movements || []);

    setupTopUp();
  } catch (err) {
    window.alert("Errore nel caricamento dei dati utente.");
  }
});
