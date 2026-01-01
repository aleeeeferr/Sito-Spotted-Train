/* eslint-disable no-console */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
require("dotenv").config();

// Config base server e database.
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/spotted";
const JWT_SECRET = process.env.JWT_SECRET || "spotted-dev-secret";
const INITIAL_CREDIT = Number(process.env.INITIAL_CREDIT || 300);
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Schemi Mongo per utenti, biglietti e movimenti credito.
const ticketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    route: { type: String, required: true },
    scope: { type: String, default: "" },
    category: { type: String, default: "" },
    variant: { type: String, default: "" },
    tariff: { type: String, default: "" },
    status: {
      type: String,
      enum: ["da_attivare", "attivo"],
      default: "da_attivare",
    },
    price: { type: Number, default: 0 },
    purchasedAt: { type: Date, default: Date.now },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

const creditMovementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["ricarica", "acquisto"], required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);


const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    credit: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Ticket = mongoose.model("Ticket", ticketSchema);
const CreditMovement = mongoose.model("CreditMovement", creditMovementSchema);

// Fetch compatibile con Node 18+ o fallback.
const fetchImpl =
  typeof fetch === "function"
    ? fetch
    : (...args) =>
        import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));


// Calcola la scadenza in base al tipo di titolo.
function resolveExpiryDate({ category = "", scope = "", purchasedAt = new Date() }) {
  const normalized = String(category || "").toLowerCase();
  const base =
    purchasedAt instanceof Date && !Number.isNaN(purchasedAt.getTime())
      ? purchasedAt
      : new Date();
  let days = 0;

  if (normalized.startsWith("annuale")) {
    days = 365;
  } else if (normalized === "mensile") {
    days = 30;
  } else if (normalized === "settimanale") {
    days = 7;
  } else if (normalized === "giornaliero") {
    days = 1;
  } else if (normalized === "ordinario") {
    days = 1;
  } else if (String(scope || "").toLowerCase() === "passes") {
    days = 30;
  } else {
    return null;
  }

  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}


// Parsing dell'HTML dei teleindicatori EAV.
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

// Chiamata al servizio teleindicatori EAV.
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

// Healthcheck.
app.get("/healthz", (_, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Payload utente completo con biglietti.
async function buildUserPayload(user) {
  const tickets = await Ticket.find({ userId: user._id }).sort({ purchasedAt: -1 });
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    credit: user.credit || 0,
    tickets: tickets.map((ticket) => ({
      id: ticket._id.toString(),
      title: ticket.title,
      route: ticket.route,
      status: ticket.status,
      price: ticket.price,
      scope: ticket.scope || "",
      category: ticket.category || "",
      variant: ticket.variant || "",
      tariff: ticket.tariff || "",
      purchasedAt: ticket.purchasedAt,
      activatedAt: ticket.activatedAt || null,
      expiresAt: ticket.expiresAt || null,
    })),
  };
}

// Auth middleware basato su JWT.
function getTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ message: "Token mancante" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token non valido" });
  }
}

// Endpoint auth: registrazione e login.
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    res.status(400).json({ message: "Nome, email e password sono obbligatori" });
    return;
  }
  try {
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      res.status(409).json({ message: "Email già registrata" });
      return;
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash,
      credit: Number.isFinite(INITIAL_CREDIT) ? Math.max(0, INITIAL_CREDIT) : 0,
    });
    if (user.credit > 0) {
      await CreditMovement.create({
        userId: user._id,
        amount: user.credit,
        type: "ricarica",
        note: "Credito iniziale",
      });
    }
    const token = jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: await buildUserPayload(user) });
  } catch (err) {
    console.error("Errore registrazione:", err);
    res.status(500).json({ message: "Errore durante la registrazione" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ message: "Email e password obbligatorie" });
    return;
  }
  try {
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      res.status(401).json({ message: "Credenziali non valide" });
      return;
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      res.status(401).json({ message: "Credenziali non valide" });
      return;
    }
    const token = jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: await buildUserPayload(user) });
  } catch (err) {
    console.error("Errore login:", err);
    res.status(500).json({ message: "Errore durante il login" });
  }
});


// Endpoint utente: profilo, movimenti, credito e biglietti.
app.get("/api/user/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ message: "Utente non trovato" });
      return;
    }
    res.json({ user: await buildUserPayload(user) });
  } catch (err) {
    console.error("Errore recupero utente:", err);
    res.status(500).json({ message: "Errore recupero utente" });
  }
});


app.get("/api/user/credit/movements", authMiddleware, async (req, res) => {
  try {
    const movements = await CreditMovement.find({ userId: req.userId }).sort({
      createdAt: -1,
    });
    res.json({
      movements: movements.map((movement) => ({
        id: movement._id.toString(),
        amount: movement.amount,
        type: movement.type,
        note: movement.note || "",
        createdAt: movement.createdAt,
      })),
    });
  } catch (err) {
    console.error("Errore recupero movimenti credito:", err);
    res.status(500).json({ message: "Errore recupero movimenti credito" });
  }
});

app.put("/api/user/me", authMiddleware, async (req, res) => {
  const { name } = req.body || {};
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ message: "Utente non trovato" });
      return;
    }
    if (name !== undefined) user.name = String(name).trim();
    await user.save();
    res.json({ user: await buildUserPayload(user) });
  } catch (err) {
    console.error("Errore aggiornamento profilo:", err);
    res.status(500).json({ message: "Errore aggiornamento profilo" });
  }
});

app.post("/api/user/credit", authMiddleware, async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ message: "Importo non valido" });
    return;
  }
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ message: "Utente non trovato" });
      return;
    }
    user.credit = Math.max(0, (user.credit || 0) + amount);
    await CreditMovement.create({
      userId: user._id,
      amount,
      type: "ricarica",
      note: "Ricarica credito",
    });
    await user.save();
    res.json({ user: await buildUserPayload(user) });
  } catch (err) {
    console.error("Errore ricarica credito:", err);
    res.status(500).json({ message: "Errore ricarica credito" });
  }
});

app.post("/api/user/tickets", authMiddleware, async (req, res) => {
  const { title, route, price, scope, category, variant, tariff } = req.body || {};
  if (!title || !route) {
    res.status(400).json({ message: "Titolo e tratta obbligatori" });
    return;
  }
  const numericPrice = Number(price || 0);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    res.status(400).json({ message: "Prezzo non valido" });
    return;
  }
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ message: "Utente non trovato" });
      return;
    }
    if (numericPrice > 0 && (user.credit || 0) < numericPrice) {
      res.status(400).json({ message: "Credito insufficiente" });
      return;
    }
    if (numericPrice > 0) {
      user.credit = Math.max(0, (user.credit || 0) - numericPrice);
      await CreditMovement.create({
        userId: user._id,
        amount: -numericPrice,
        type: "acquisto",
        note: `Acquisto ${title}`,
      });
    }
    const expiresAt = resolveExpiryDate({
      category: String(category || ""),
      scope: String(scope || ""),
      purchasedAt: new Date(),
    });
    await Ticket.create({
      userId: user._id,
      title: String(title).trim(),
      route: String(route).trim(),
      price: numericPrice,
      scope: String(scope || "").trim(),
      category: String(category || "").trim(),
      variant: String(variant || "").trim(),
      tariff: String(tariff || "").trim(),
      status: "attivo",
      activatedAt: new Date(),
      expiresAt,
    });
    await user.save();
    res.json({ user: await buildUserPayload(user) });
  } catch (err) {
    console.error("Errore creazione biglietto:", err);
    res.status(500).json({ message: "Errore creazione biglietto" });
  }
});

app.patch("/api/user/tickets/:ticketId/activate", authMiddleware, async (req, res) => {
  const { ticketId } = req.params;
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ message: "Utente non trovato" });
      return;
    }
    const ticket = await Ticket.findOne({ _id: ticketId, userId: user._id });
    if (!ticket) {
      res.status(404).json({ message: "Biglietto non trovato" });
      return;
    }
    if (ticket.expiresAt && ticket.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ message: "Biglietto scaduto" });
      return;
    }
    if (ticket.status !== "attivo") {
      ticket.status = "attivo";
      ticket.activatedAt = new Date();
      await ticket.save();
    }
    res.json({ user: await buildUserPayload(user) });
  } catch (err) {
    console.error("Errore attivazione biglietto:", err);
    res.status(500).json({ message: "Errore attivazione biglietto" });
  }
});

// Endpoint pubblico: treni da teleindicatori (solo live).
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
    res.json({ source: "live", stazione, tipo, trains: [] });
  } catch (error) {
    console.error("[proxy] Errore recuperando teleindicatori:", error.message);
    res.status(502).json({ message: "Errore nel recupero dei treni live" });
  }
});

// Connessione Mongo e avvio server.
async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Mongo connesso");
  } catch (err) {
    console.error("Errore connessione Mongo:", err.message);
  }

  app.listen(PORT, HOST, () => {
    console.log(`API attiva su http://${HOST}:${PORT}`);
  });
}

start();
