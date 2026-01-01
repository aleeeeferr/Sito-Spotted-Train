const PROJECT_ID = window.FIREBASE_CONFIG?.projectId;
if (!PROJECT_ID) {
    throw new Error("Firebase config mancante. Verifica frontend/js/firebase-config.js.");
}
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const fetchJson = async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
        return null;
    }
    return response.json();
};

const decodeValue = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(value, "stringValue")) {
        return value.stringValue;
    }
    if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) {
        return value.booleanValue;
    }
    if (Object.prototype.hasOwnProperty.call(value, "integerValue")) {
        return Number(value.integerValue);
    }
    if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) {
        return Number(value.doubleValue);
    }
    if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) {
        return value.timestampValue;
    }
    if (Object.prototype.hasOwnProperty.call(value, "nullValue")) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(value, "arrayValue")) {
        const values = value.arrayValue?.values ?? [];
        return values.map(decodeValue);
    }
    if (Object.prototype.hasOwnProperty.call(value, "mapValue")) {
        return decodeFields(value.mapValue?.fields ?? {});
    }
    return null;
};

const decodeFields = (fields = {}) => {
    return Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])
    );
};

const resolveSection = (data) => {
    if (data.sezione) {
        return data.sezione;
    }
    if (data.isRitardo) {
        return "ritardi";
    }
    if (data.isSoppressione) {
        return "soppressioni";
    }
    if (data.isSciopero) {
        return "scioperi";
    }
    const text = `${data.titolo || ""} ${data.descrizione || ""}`.toLowerCase();
    if (text.includes("soppression")) {
        return "soppressioni";
    }
    if (text.includes("ritard")) {
        return "ritardi";
    }
    if (text.includes("scioper")) {
        return "scioperi";
    }
    return "altri";
};

const normalizeAlert = (data, docName) => {
    const docId = docName?.split("/").pop();
    const publishedAt =
        data.dataPubblicazioneTs ||
        data.dataPubblicazione ||
        data.createdAt ||
        null;
    return {
        id: data.id || docId || `${Math.random()}`,
        title: data.titolo || data.title || "Avviso di servizio",
        description: data.descrizione || data.description || "",
        section: resolveSection(data),
        publishedAt,
        source: data.fonte || data.source || "",
        link: data.link || "",
        sortInDay: typeof data.sortInDay === "number" ? data.sortInDay : null,
    };
};

const extractFromLatest = (doc) => {
    if (!doc?.fields) {
        return null;
    }
    const decoded = decodeFields(doc.fields);
    const listCandidates = [
        decoded.avvisi,
        decoded.alerts,
        decoded.items,
        decoded.lista,
    ].filter(Array.isArray);

    if (listCandidates.length) {
        return listCandidates[0].map((item) => normalizeAlert(item));
    }

    const grouped = [];
    if (Array.isArray(decoded.ritardi)) {
        grouped.push(...decoded.ritardi.map((item) => ({ ...item, sezione: "ritardi" })));
    }
    if (Array.isArray(decoded.soppressioni)) {
        grouped.push(...decoded.soppressioni.map((item) => ({ ...item, sezione: "soppressioni" }))
        );
    }
    if (Array.isArray(decoded.scioperi)) {
        grouped.push(...decoded.scioperi.map((item) => ({ ...item, sezione: "scioperi" })));
    }
    if (Array.isArray(decoded.altri)) {
        grouped.push(...decoded.altri.map((item) => ({ ...item, sezione: "altri" })));
    }

    if (grouped.length) {
        return grouped.map((item) => normalizeAlert(item));
    }
    return null;
};

const fetchAlertsCollection = async () => {
    const data = await fetchJson(`${FIRESTORE_BASE_URL}/avvisi`);
    const documents = data?.documents ?? [];
    return documents
        .filter((doc) => !doc.name?.endsWith("/_keep"))
        .map((doc) => normalizeAlert(decodeFields(doc.fields ?? {}), doc.name));
};

const sortAlerts = (alerts) =>
    alerts.sort((a, b) => {
        const bySort = (b.sortInDay ?? -1) - (a.sortInDay ?? -1);
        if (bySort) return bySort;
        return (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0);
    });

export const fetchAlerts = async () => {
    const collection = await fetchAlertsCollection();
    return sortAlerts(collection);
};
