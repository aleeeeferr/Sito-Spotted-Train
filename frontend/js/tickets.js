import { TARIFFS } from "./tariffs.js";
import { apiFetch, getToken } from "./user-dashboard.js";

const API_ENDPOINT = "https://example.com/unico";
const PREFETCH_ENDPOINT = "https://example.com/unico";
const LAST_TICKET_KEY = "spotted-last-ticket";

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
    "PORTICI VIA LIBERTA'",
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
const previewEl = document.getElementById("ticket-preview");
const cartEl = document.getElementById("ticket-cart");
const datalistEl = document.getElementById("station-options");
const riepilogoTratta = document.getElementById("riepilogo-tratta");
const riepilogoTrattaTesto = document.getElementById("riepilogo-tratta-testo");
const riepilogoPrezzo = document.getElementById("riepilogo-prezzo");
const paymentModal = document.getElementById("payment-modal");
const paymentSummaryEl = document.getElementById("payment-summary");
const paymentFeedbackEl = document.getElementById("payment-feedback");
const paypalButtonEl = document.getElementById("paypal-button-container");

const cartState = [];
let lastTrip = { origine: "", destinazione: "" };

const formatEuro = (value) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value) || 0);

const setText = (el, text) => {
    if (!el) return;
    el.textContent = text;
};

const setHtml = (el, html) => {
    if (!el) return;
    el.innerHTML = html;
};

const toggleClass = (el, className, enabled) => {
    if (!el) return;
    el.classList.toggle(className, enabled);
};

const setStatus = (title, message) => {
    if (!statusEl) return;
    setText(statusEl.querySelector("h3"), title);
    setText(statusEl.querySelector("p"), message);
};

const setResultsVisible = (visible) => {
    toggleClass(resultEl, "is-visible", visible);
    toggleClass(riepilogoTratta, "is-visible", visible);
    toggleClass(statusEl, "is-hidden", visible);
};

const fetchStations = async () => {
    const response = await fetch(PREFETCH_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Prefetch HTTP ${response.status}`);
    }
    const payload = await response.json();
    const normalized = Array.from(
        new Set(
            (Array.isArray(payload) ? payload : [])
                .map((name) => normalizeName(name))
                .filter(Boolean)
        )
    );
    const filtered = normalized.filter((name) => EAV_LOOKUP.has(name));
    return filtered.length ? filtered : normalized;
};

const fillStations = (stations) => {
    if (!datalistEl) return;
    const sorted = stations.slice().sort((a, b) => a.localeCompare(b));
    setHtml(datalistEl, sorted.map((name) => `<option value="${name}"></option>`).join(""));
};

const normalizeStationInput = (value) => {
    const trimmed = (value || "").trim();
    if (!trimmed) {
        return { id: "", label: "" };
    }
    return { id: trimmed.toUpperCase(), label: trimmed };
};

const buildEndpointUrl = ({ origine, destinazione, ppn }) => {
    const url = new URL(API_ENDPOINT);
    url.searchParams.set("origine", origine);
    url.searchParams.set("destinazione", destinazione);
    url.searchParams.set("ppn", ppn ? "true" : "false");
    return url;
};

const resolveTariffCode = (payload = {}) => {
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
};

const extractPrice = (payload) => {
    const raw =
        payload.prezzo_calcolato ??
        payload.prezzo ??
        payload.importo ??
        payload.price ??
        payload.valore ??
        null;
    if (raw === null || raw === undefined || raw === "") {
        return null;
    }
    const normalized = raw.toString().replace("€", "").replace(",", ".").trim();
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
};

const buildTicketCard = ({ label, variant, price, scope }) => {
    const card = document.createElement("article");
    card.className = "biglietto-card";
    card.dataset.label = label;
    card.dataset.variant = variant;
    card.dataset.price = String(price);
    card.dataset.scope = scope;

    card.innerHTML = `
        <div class="biglietto-top">
            <div>
                <h2>${label}</h2>
                <p class="biglietto-validita">${scope === "abbonamenti" ? "Abbonamento" : "Biglietto"}</p>
            </div>
            <div class="biglietto-prezzo">
                <span class="prezzo">${formatEuro(price)}</span>
                <span class="tipo">${variant}</span>
            </div>
        </div>
        <div class="biglietto-dettagli">
            <div class="biglietto-meta">
                <div>
                    <span>Validita</span>
                    <strong>Standard</strong>
                </div>
                <div>
                    <span>Tipo</span>
                    <strong>${variant}</strong>
                </div>
            </div>
            <div class="quantita">
                <button class="stepper-btn" type="button" data-step="-" aria-label="Diminuisci quantita">-</button>
                <span class="stepper-value" data-qty>1</span>
                <button class="stepper-btn" type="button" data-step="+" aria-label="Aumenta quantita">+</button>
            </div>
            <button class="btn-secondario btn-add-cart" type="button" data-add="true">Aggiungi al carrello</button>
        </div>
    `;

    return card;
};

const groupAbbonamenti = (entries = {}) => {
    const groups = { mensile: [], annuale: [], studenti: [], altri: [] };
    Object.values(entries).forEach((entry) => {
        const label = (entry?.label || "").toLowerCase();
        const key = label.includes("studente")
            ? "studenti"
            : label.includes("mensile")
                ? "mensile"
                : label.includes("annuale")
                    ? "annuale"
                    : "altri";
        groups[key].push(entry);
    });
    return groups;
};

const renderTicketOptions = (tariffEntry) => {
    if (!previewEl) {
        return;
    }

    const bigliettiGrid = previewEl.querySelector("[data-ticket-grid='biglietti']");
    const abbonamentiGrid = previewEl.querySelector("[data-ticket-grid='abbonamenti']");
    if (bigliettiGrid) {
        bigliettiGrid.innerHTML = "";
    }
    if (abbonamentiGrid) {
        abbonamentiGrid.innerHTML = "";
    }

    const addEntries = (entries, scope, target) => {
        if (!entries || !target) return;
        Object.values(entries).forEach((entry) => {
            if (typeof entry?.aziendale === "number") {
                target.append(buildTicketCard({ label: entry.label, variant: "Aziendale", price: entry.aziendale, scope }));
            }
            if (typeof entry?.integrato === "number") {
                target.append(buildTicketCard({ label: entry.label, variant: "Integrato", price: entry.integrato, scope }));
            }
        });
    };

    addEntries(tariffEntry?.tickets, "biglietti", bigliettiGrid);

    if (abbonamentiGrid) {
        abbonamentiGrid.innerHTML = "";
        const grouped = groupAbbonamenti(tariffEntry?.abbonamenti || {});
        const order = [
            { key: "mensile", label: "Mensile" },
            { key: "annuale", label: "Annuale" },
            { key: "studenti", label: "Studenti" },
            { key: "altri", label: "Altri" },
        ];

        order.forEach((section) => {
            const items = grouped[section.key] || [];
            if (!items.length) {
                return;
            }
            const title = document.createElement("h3");
            title.className = "biglietti-sottosezione";
            title.textContent = section.label;
            abbonamentiGrid.append(title);
            items.forEach((entry) => {
                if (typeof entry?.aziendale === "number") {
                    abbonamentiGrid.append(
                        buildTicketCard({
                            label: entry.label,
                            variant: "Aziendale",
                            price: entry.aziendale,
                            scope: "abbonamenti",
                        })
                    );
                }
                if (typeof entry?.integrato === "number") {
                    abbonamentiGrid.append(
                        buildTicketCard({
                            label: entry.label,
                            variant: "Integrato",
                            price: entry.integrato,
                            scope: "abbonamenti",
                        })
                    );
                }
            });
        });
    }
};

const renderCart = () => {
    if (!cartEl) return;
    cartEl.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = "Riepilogo ordine";
    cartEl.append(title);

    if (!cartState.length) {
        const empty = document.createElement("p");
        empty.className = "biglietti-vuoto";
        empty.textContent = "Nessun titolo selezionato.";
        cartEl.append(empty);
        return;
    }

    const list = document.createElement("div");
    list.className = "riepilogo-lista";
    let total = 0;

    cartState.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "riepilogo-item";
        const label = document.createElement("span");
        label.textContent = item.label;

        const qty = document.createElement("span");
        qty.textContent = `x${item.qty}`;

        const actions = document.createElement("div");
        actions.className = "riepilogo-actions";

        const price = document.createElement("strong");
        price.textContent = formatEuro(item.price * item.qty);

        const remove = document.createElement("button");
        remove.className = "btn-remove";
        remove.type = "button";
        remove.textContent = "–";
        remove.dataset.removeIndex = String(index);

        actions.append(price, remove);
        row.append(label, qty, actions);

        total += item.price * item.qty;
        list.append(row);
    });

    cartEl.append(list);

    const totalRow = document.createElement("div");
    totalRow.className = "riepilogo-totale";
    totalRow.innerHTML = `<span>Totale</span><strong>${formatEuro(total)}</strong>`;
    cartEl.append(totalRow);

    const checkout = document.createElement("button");
    checkout.className = "btn-principale btn-checkout";
    checkout.type = "button";
    checkout.dataset.checkout = "true";
    checkout.textContent = "Vai al pagamento";
    cartEl.append(checkout);
};

const updatePaymentSummary = (items) => {
    if (!paymentSummaryEl) return;
    const list = items
        .map(
            (item) => `
                <div class="riepilogo-item">
                    <span>${item.label} (${item.variant})</span>
                    <strong>${formatEuro(item.price * item.qty)}</strong>
                </div>
            `
        )
        .join("");
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    setHtml(
        paymentSummaryEl,
        `${list}<div class="riepilogo-totale"><span>Totale</span><strong>${formatEuro(total)}</strong></div>`
    );
};

const togglePayment = (open) => {
    if (!paymentModal) return;
    paymentModal.classList.toggle("is-open", open);
    paymentModal.setAttribute("aria-hidden", open ? "false" : "true");
};

const saveTickets = (ticket) => {
    sessionStorage.setItem(LAST_TICKET_KEY, JSON.stringify(ticket));
};

const createTicketsInDb = async (routeText) => {
    const created = [];
    for (const item of cartState) {
        const qty = Number(item.qty) || 1;
        for (let i = 0; i < qty; i += 1) {
            const payload = {
                title: item.label || "Biglietto",
                route: routeText,
                price: Number(item.price) || 0,
                variant: item.variant || "",
                tariff: "",
                category: (item.label || "").toLowerCase(),
                scope: "",
            };
            await apiFetch("/api/user/tickets", { method: "POST", body: payload });
            created.push(payload);
        }
    }
    return created;
};

const finalizePurchase = async () => {
    if (!cartState.length) {
        setText(paymentFeedbackEl, "Carrello vuoto.");
        return;
    }

    if (!getToken()) {
        window.location.href = "login.html";
        return;
    }

    const total = cartState.reduce((sum, item) => sum + item.price * item.qty, 0);
    const routeText = [lastTrip.origine, lastTrip.destinazione].filter(Boolean).join(" → ");
    const items = cartState.map((item) => ({
        label: item.label,
        qty: item.qty,
        variant: item.variant,
    }));

    setText(paymentFeedbackEl, "Sto creando il biglietto...");
    try {
        await createTicketsInDb(routeText);
    } catch (error) {
        setText(paymentFeedbackEl, error?.message || "Errore durante la creazione del biglietto.");
        return;
    }

    const ticket = {
        code: `ST-${Date.now()}`,
        route: routeText,
        items,
        total: formatEuro(total),
        priceFormatted: formatEuro(total),
        timestamp: new Date().toISOString(),
    };
    saveTickets(ticket);
    window.location.href = "biglietto-successo.html";
};

const handlePreviewClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    const card = target.closest(".biglietto-card");
    if (!card) {
        return;
    }

    const qtyEl = card.querySelector("[data-qty]");
    if (!qtyEl) {
        return;
    }

    if (target.dataset.step === "+") {
        qtyEl.textContent = String((Number(qtyEl.textContent) || 1) + 1);
        return;
    }
    if (target.dataset.step === "-") {
        qtyEl.textContent = String(Math.max(1, (Number(qtyEl.textContent) || 1) - 1));
        return;
    }

    if (target.dataset.add) {
        const label = card.dataset.label || "Biglietto";
        const variant = card.dataset.variant || "Aziendale";
        const price = Number(card.dataset.price) || 0;
        const qty = Number(qtyEl.textContent) || 1;

        cartState.push({
            label,
            variant,
            price,
            qty,
        });
        renderCart();
    }
};

const handleCartClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }
    if (target.dataset.removeIndex) {
        const index = Number(target.dataset.removeIndex);
        if (!Number.isNaN(index)) {
            cartState.splice(index, 1);
            renderCart();
        }
        return;
    }
    if (target.dataset.checkout) {
        if (!getToken()) {
            window.location.href = "login.html";
            return;
        }
        updatePaymentSummary(cartState);
        if (paypalButtonEl) {
            paypalButtonEl.innerHTML = "<button class=\"btn-confirm\" type=\"button\" id=\"demo-pay\">Conferma pagamento</button>";
            const demoBtn = document.getElementById("demo-pay");
            demoBtn?.addEventListener("click", finalizePurchase);
        }
        togglePayment(true);
    }
};

const handlePaymentClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }
    if (target.dataset.closePayment !== undefined) {
        togglePayment(false);
    }
};

const handleFormSubmit = async (event) => {
    event.preventDefault();
    const origineInfo = normalizeStationInput(form?.origine?.value || "");
    const destinazioneInfo = normalizeStationInput(form?.destinazione?.value || "");
    const ppn = Boolean(form?.ppn?.checked);

    if (!origineInfo.id || !destinazioneInfo.id) {
        setStatus("Inserisci la tratta", "Seleziona origine e destinazione.");
        setResultsVisible(false);
        return;
    }

    if (origineInfo.id === destinazioneInfo.id) {
        setStatus("Tratta non valida", "Origine e destinazione devono essere diverse.");
        setResultsVisible(false);
        return;
    }

    setStatus("Calcolo tariffa", "Sto recuperando la tariffa..." );
    setResultsVisible(false);

    try {
        const url = buildEndpointUrl({
            origine: origineInfo.id,
            destinazione: destinazioneInfo.id,
            ppn,
        });
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const code = resolveTariffCode(data);
        const tariffEntry = code ? TARIFFS[code] : null;

        lastTrip = { origine: origineInfo.label, destinazione: destinazioneInfo.label };
        if (riepilogoTrattaTesto) {
            const suffix = ppn ? " (PPN)" : "";
            riepilogoTrattaTesto.textContent = `${origineInfo.label} - ${destinazioneInfo.label}${suffix}`;
        }
        if (riepilogoPrezzo) {
            const price = extractPrice(data);
            riepilogoPrezzo.textContent = price !== null ? formatEuro(price) : "-";
        }

        if (tariffEntry) {
            renderTicketOptions(tariffEntry);
            renderCart();
            setResultsVisible(true);
            setStatus("Tariffa caricata", "Seleziona i biglietti per la tua tratta.");
        } else {
            setResultsVisible(true);
            setStatus("Tariffa non disponibile", "Mostro il tariffario standard.");
            const fallback = TARIFFS[Object.keys(TARIFFS)[0]];
            renderTicketOptions(fallback);
            renderCart();
        }
    } catch (error) {
        console.error("Errore tariffa:", error);
        setStatus("Errore", "Impossibile recuperare la tariffa.");
        setResultsVisible(false);
    }
};

previewEl?.addEventListener("click", handlePreviewClick);
cartEl?.addEventListener("click", handleCartClick);
paymentModal?.addEventListener("click", handlePaymentClick);
form?.addEventListener("submit", handleFormSubmit);

(async () => {
    try {
        const stations = await fetchStations();
        fillStations(stations);
        setStatus("Inserisci la tratta", "Le stazioni sono pronte per la ricerca.");
    } catch (error) {
        console.warn("Prefetch stazioni non disponibile:", error);
        setStatus("Stazioni non disponibili", "Riprova piu tardi.");
    }
})();
