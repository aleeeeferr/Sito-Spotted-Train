import { fetchAlerts } from "./firebaseApi.js";

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const SECTION_LABELS = {
    ritardi: "Ritardo",
    soppressioni: "Soppressione",
    scioperi: "Sciopero",
    altri: "Info",
};

const SECTION_CLASSES = {
    ritardi: "avviso-ritardi",
    soppressioni: "avviso-soppressioni",
    scioperi: "avviso-scioperi",
    altri: "avviso-generici",
};

const formatDateTime = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return "In aggiornamento";
    }
    const datePart = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" }).format(date);
    const timePart = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(date);
    return `${datePart} - ${timePart}`;
};

const buildCard = (alert) => {
    const article = document.createElement("article");
    const sectionClass = SECTION_CLASSES[alert.section] || SECTION_CLASSES.altri;
    article.className = `avviso-card ${sectionClass}`;

    const head = document.createElement("div");
    head.className = "avviso-head";

    const title = document.createElement("h4");
    title.textContent = alert.title || "Avviso di servizio";

    const pill = document.createElement("span");
    pill.className = "avviso-pill";
    pill.textContent = alert.source || SECTION_LABELS[alert.section] || "Info";

    head.append(title, pill);

    const date = document.createElement("div");
    date.className = "avviso-data";
    date.textContent = `Aggiornato: ${formatDateTime(alert.publishedAt)}`;

    const description = document.createElement("p");
    description.className = "avviso-breve";
    description.textContent = alert.description || "Dettagli non disponibili.";

    article.append(head, date, description);
    return article;
};

const showPlaceholder = (container, message) => {
    container.innerHTML = `<p class="avviso-vuoto">${message}</p>`;
};

const normalizeAlerts = (alerts) =>
    Array.isArray(alerts) ? alerts : alerts?.items || alerts?.avvisi || [];

const renderAlerts = (alerts) => {
    const containers = qsa("[data-avvisi-section]");
    const normalized = normalizeAlerts(alerts);
    const grouped = normalized.reduce((acc, alert) => {
        const key = alert.section === "altri" ? "soppressioni" : alert.section || "soppressioni";
        (acc[key] ||= []).push(alert);
        return acc;
    }, {});

    containers.forEach((container) => {
        const section = container.dataset.avvisiSection;
        const items = grouped[section] || [];
        const box = container.closest(".avvisi-box");
        if (!items.length) {
            showPlaceholder(container, "Nessun avviso attivo.");
            if (section === "altri") {
                box?.setAttribute("hidden", "hidden");
            } else {
                box?.removeAttribute("hidden");
            }
            return;
        }
        box?.removeAttribute("hidden");
        container.innerHTML = "";
        items.forEach((alert) => container.append(buildCard(alert)));
    });
};

document.addEventListener("DOMContentLoaded", async () => {
    const containers = qsa("[data-avvisi-section]");
    containers.forEach((container) => showPlaceholder(container, "Caricamento avvisi..."));

    try {
        const alerts = await fetchAlerts();
        renderAlerts(alerts);
    } catch (error) {
        containers.forEach((container) => showPlaceholder(container, "Impossibile caricare gli avvisi."));
        console.error("Errore fetch avvisi:", error);
    }
});
