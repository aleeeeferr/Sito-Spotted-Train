(function () {
    const fallback = {
        label: "Biglietto demo",
        variant: "DEMO",
        price: 0,
        priceFormatted: "0,00",
        tariff: "DEMO",
        origine: "Tratta",
        destinazione: "Demo",
        timestamp: new Date().toISOString(),
        code: "ST-DEMO",
    };

    let ticket = { ...fallback };

    try {
        const raw =
            sessionStorage.getItem("spotted-last-ticket") ||
            sessionStorage.getItem("spottedLastTicket");
        if (raw) {
            const parsed = JSON.parse(raw);
            ticket = { ...ticket, ...parsed };
        }
    } catch (error) {
        console.warn("Ticket demo non disponibile, uso fallback", error);
    }

    const route =
        ticket.route ||
        (ticket.origine && ticket.destinazione
            ? `${ticket.origine.toUpperCase()} → ${ticket.destinazione.toUpperCase()}`
            : "Tratta demo");
    const priceText = ticket.priceFormatted
        ? `€ ${ticket.priceFormatted}`
        : formatEuro(ticket.price);
    const variant = ticket.variant ? ticket.variant.toUpperCase() : fallback.variant;
    const tariff = ticket.tariff || fallback.tariff;
    const label = ticket.label || fallback.label;

    document.getElementById("ticketLabel").textContent = label;
    document.getElementById("ticketSummary").textContent = route;
    document.getElementById("ticketMeta").textContent = `Codice ${tariff} · ${variant} · ${priceText}`;
    document.getElementById("ticketValidity").textContent = `Codice biglietto ${ticket.code || fallback.code}`;
    document.getElementById("ticketTimestamp").textContent = `Emesso: ${formatDateTime(ticket.timestamp)}`;
    document.getElementById("ticketQr").src = buildPseudoQr(ticket);
})();

function formatEuro(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "€ 0,00";
    return `€ ${num.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value) {
    try {
        const date = value ? new Date(value) : new Date();
        return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date);
    } catch (error) {
        return "Ora locale";
    }
}

function buildPseudoQr(ticket) {
    const text = `${ticket.label || "ticket"}|${ticket.variant || "demo"}|${ticket.tariff || "demo"}|${ticket.origine || ""}-${ticket.destinazione || ""}`;
    let seed = 0;
    for (let i = 0; i < text.length; i += 1) {
        seed = (seed + text.charCodeAt(i) * (i + 1)) % 2147483647;
    }

    const size = 25;
    const modules = new Set();
    const finderOffsets = [
        [0, 0],
        [size - 7, 0],
        [0, size - 7],
    ];

    finderOffsets.forEach(([ox, oy]) => addFinderPattern(modules, ox, oy));

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const key = `${x},${y}`;
            if (modules.has(key) || isInsideFinder(x, y, size)) continue;
            if (randomBit()) {
                modules.add(key);
            }
        }
    }

    const rects = Array.from(modules)
        .map((key) => {
            const [x, y] = key.split(",").map(Number);
            return `<rect x="${x}" y="${y}" width="1" height="1" />`;
        })
        .join("");

    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}' shape-rendering='crispEdges'><rect width='${size}' height='${size}' fill='white'/><g fill='black'>${rects}</g></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    function randomBit() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed % 2 === 0;
    }
}

function addFinderPattern(modules, offsetX, offsetY) {
    for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
            const isBorder = x === 0 || y === 0 || x === 6 || y === 6;
            const isCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
            if (isBorder || isCenter) {
                modules.add(`${offsetX + x},${offsetY + y}`);
            }
        }
    }
}

function isInsideFinder(x, y, size) {
    const zones = [
        [0, 7, 0, 7],
        [size - 7, size, 0, 7],
        [0, 7, size - 7, size],
    ];
    return zones.some(([x0, x1, y0, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
}
