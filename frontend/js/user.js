import "./user-dashboard.js";
import { apiFetch, getToken } from "./user-dashboard.js";

const formatPrice = (value) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);

const getEl = (id) => document.getElementById(id);
const setText = (id, value) => {
    const el = getEl(id);
    if (!el) {
        return;
    }
    el.textContent = value;
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

const buildTicketItem = (ticket) => {
    const wrapper = document.createElement("div");
    wrapper.className = "ticket-compact ticket-divider";

    const info = document.createElement("div");
    info.className = "ticket-compact-info";

    const status = document.createElement("span");
    status.className = ticket.status === "attivo" ? "badge-ok" : "badge-warning";
    status.textContent = ticket.status === "attivo" ? "Attivo" : "Acquistato";

    const title = document.createElement("h3");
    title.textContent = ticket.route || "Tratta selezionata";

    const meta = document.createElement("p");
    meta.textContent = ticket.title || "Biglietto";

    const date = document.createElement("p");
    date.className = "ticket-meta";
    date.textContent = `Totale: ${formatPrice(ticket.price || 0)}`;

    info.append(status, title, meta, date);

    const action = document.createElement("a");
    action.className = "btn-primary btn-small btn-ticket";
    action.href = "biglietto-successo.html";
    action.textContent = "Dettagli";

    wrapper.append(info, action);
    return wrapper;
};

const updateProfile = (user) => {
    setText("area-user-name", user?.name || "Utente");
    setText("area-user-email", user?.email || "");
    const credit = typeof user?.credit === "number" ? user.credit : 0;
    setText("area-user-credit", `Credito: ${formatPrice(credit)}`);
    const avatarEl = getEl("profile-avatar");
    if (!avatarEl) {
        return;
    }
    avatarEl.textContent = getInitials(user?.name || "U");
};

const renderTickets = (tickets = []) => {
    const list = getEl("user-ticket-list");
    const empty = getEl("user-ticket-empty");
    if (list) {
        list.innerHTML = "";
    }
    if (!tickets.length) {
        if (empty) {
            empty.style.display = "block";
        }
        return;
    }
    if (empty) {
        empty.style.display = "none";
    }
    if (list) {
        tickets.forEach((ticket) => list.append(buildTicketItem(ticket)));
    }
};

document.addEventListener("DOMContentLoaded", async () => {
    if (!getToken()) {
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await apiFetch("/api/user/me");
        const user = response?.user || null;
        updateProfile(user);
        renderTickets(user?.tickets || []);
    } catch (err) {
        const empty = getEl("user-ticket-empty");
        if (!empty) return;
        empty.textContent = "Errore nel caricamento dei biglietti.";
        empty.style.display = "block";
    }
});
