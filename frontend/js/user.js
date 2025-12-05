const storageKey = "eav-user-profile";
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

const demoHistory = [
  { title: "Biglietto ordinario", code: "NA5", price: "€ 4,60", date: "Oggi, 10:12" },
  { title: "Abbonamento mensile", code: "NA5", price: "€ 75,60", date: "01/03/2025" },
];

const demoTracking = ["Napoli Garibaldi → Sorrento", "Pompei → Napoli", "Napoli Porta Nolana → Sarno"];

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    inputs.name.value = saved.name || "";
    inputs.email.value = saved.email || "";
    inputs.lang.value = saved.lang || "it";
    inputs.theme.value = saved.theme || "auto";
    inputs.home.value = saved.home || "";
    inputs.favs.value = saved.favs || "";
    inputs.notifRitardi.checked = Boolean(saved.notifRitardi);
    inputs.notifScadenze.checked = Boolean(saved.notifScadenze);
    inputs.notifMail.checked = Boolean(saved.notifMail);
  } catch (err) {
    console.warn("Profilo non leggibile, riparto vuoto.", err);
  }
}

function saveProfile() {
  const payload = {
    name: inputs.name.value.trim(),
    email: inputs.email.value.trim(),
    lang: inputs.lang.value,
    theme: inputs.theme.value,
    home: inputs.home.value.trim(),
    favs: inputs.favs.value.trim(),
    notifRitardi: inputs.notifRitardi.checked,
    notifScadenze: inputs.notifScadenze.checked,
    notifMail: inputs.notifMail.checked,
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

function renderHistory() {
  if (!historyEl) return;
  historyEl.innerHTML = demoHistory
    .map(
      (item) => `
        <div class="history-card">
          <div>
            <div class="history-title">${item.title}</div>
            <div class="text-muted small">${item.date}</div>
          </div>
          <div class="pill pill-soft">${item.code}</div>
          <div class="history-price">${item.price}</div>
        </div>
      `
    )
    .join("");
}

function renderTracking() {
  if (!trackingEl) return;
  trackingEl.className = "tag-list";
  trackingEl.innerHTML = demoTracking.map((t) => `<span class="pill pill-soft">${t}</span>`).join("");
}

loadProfile();
wireInputs();
renderHistory();
renderTracking();
