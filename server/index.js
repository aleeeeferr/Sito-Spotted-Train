/* eslint-disable no-console */
const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "127.0.0.1";
const app = express();

app.use(cors());

const fetchImpl =
  typeof fetch === "function"
    ? fetch
    : (...args) =>
        import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));

/**
 * Effettua il parsing dell'HTML dei teleindicatori EAV.
 * @param {string} html
 * @returns {Array<{id:string, category:string, destination:string, info:string, track:string, orario:string, ritardo:number}>}
 */
function parseEAVHTML(html) {
  const trains = [];
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let trMatch;
  while ((trMatch = trPattern.exec(html)) !== null) {
    const trContent = trMatch[1];
    const cells = [];
    let tdMatch;

    while ((tdMatch = tdPattern.exec(trContent)) !== null) {
      const text = tdMatch[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim();
      cells.push(text);
    }

    if (cells.length < 7) continue;

    const [number, category, destination, info, track, timeText, delayRaw] = cells;

    if (!number || number.toLowerCase().startsWith("treno")) continue;
    if (!destination || destination.toLowerCase().startsWith("destinazione")) continue;
    if (!timeText.includes(":")) continue;

    const digits = delayRaw.replace(/[^\d-]/g, "");
    let delayMinutes = 0;
    if (digits) {
      const parsed = parseInt(digits, 10);
      if (!Number.isNaN(parsed)) delayMinutes = parsed;
    }

    trains.push({
      id: number,
      category,
      destination,
      info,
      track,
      orario: timeText,
      ritardo: delayMinutes,
    });
  }

  return trains;
}

/**
 * Genera un elenco di treni di fallback per non bloccare l'interfaccia.
 * @param {string} stazione
 * @param {"P"|"A"} tipo
 */
function generateRealisticTrains(stazione, tipo) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const destinazioni = {
    "1": ["Sorrento", "Sarno", "Pompei Scavi", "Castellammare di Stabia"],
    "2": ["Napoli Porta Nolana", "Sarno", "Sorrento"],
    "33": ["Napoli Porta Nolana", "Scafati", "Torre Annunziata"],
  };

  const baseDestinations = destinazioni[stazione] || ["Napoli Porta Nolana", "Sorrento"];

  return Array.from({ length: 6 }).map((_, idx) => {
    const minutesFromNow = idx * 5 + (tipo === "A" ? 2 : 0);
    const date = new Date(now.getTime() + minutesFromNow * 60000);
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    const ritardo = idx === 0 ? Math.max(0, currentMinute % 3) : 0;

    return {
      id: `EAV${currentHour}${currentMinute}${idx}`,
      orario: `${hours}:${minutes}`,
      destinazione: baseDestinations[idx % baseDestinations.length],
      ritardo,
      binario: tipo === "A" ? "—" : `${(idx % 4) + 1}`,
      stato: ritardo > 0 ? "ritardo" : "in_orario",
    };
  });
}

async function fetchTeleindicatori(stazione, tipo) {
  const params = new URLSearchParams();
  if (stazione) params.append("stazione", stazione);
  params.append("tipo", tipo);

  const response = await fetchImpl(
    "https://example.com/teleindicatori/ws_getData.php",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36",
        Referer: "https://example.com/teleindicatori/",
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`EAV ha risposto ${response.status}`);
  }

  const html = await response.text();
  if (html.includes("Lista non disponibile")) {
    return [];
  }

  return parseEAVHTML(html);
}

app.get("/healthz", (_, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get("/api/trains", async (req, res) => {
  const stazione = req.query.stazione || "1";
  const tipo = req.query.tipo === "A" ? "A" : "P";

  try {
    const parsed = await fetchTeleindicatori(stazione, tipo);
    if (parsed.length > 0) {
      const payload = parsed.map((train) => ({
        id: train.id,
        orario: train.orario,
        destinazione: train.destination || train.destinazione || "",
        ritardo: train.ritardo || 0,
        binario: train.track || "",
        stato: train.ritardo > 0 ? "ritardo" : "in_orario",
        categoria: train.category,
        info: train.info,
      }));
      res.json({ source: "live", stazione, tipo, trains: payload });
      return;
    }
    console.log(`[proxy] Lista vuota, uso fallback per stazione ${stazione}`);
  } catch (error) {
    console.error("[proxy] Errore recuperando teleindicatori:", error.message);
  }

  const fallback = generateRealisticTrains(stazione, tipo);
  res.json({ source: "fallback", stazione, tipo, trains: fallback });
});

app.listen(PORT, HOST, () => {
  console.log(`Proxy teleindicatori attivo su http://${HOST}:${PORT}`);
});
