const storageKey = "eav-user-profile";

const form = document.getElementById("login-form");
const nameInput = document.getElementById("login-name");
const emailInput = document.getElementById("login-email");
const homeInput = document.getElementById("login-home");

prefill();

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      name: (nameInput?.value || "").trim(),
      email: (emailInput?.value || "").trim(),
      home: (homeInput?.value || "").trim(),
      lang: "it",
      theme: "auto",
      favs: "",
      notifRitardi: true,
      notifScadenze: false,
      notifMail: false,
    };

    if (!payload.name || !payload.email) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
      sessionStorage.setItem("eav-user-last-login", payload.name);
    } catch (error) {
      console.warn("Impossibile salvare i dati di accesso demo", error);
    }

    window.location.href = "/pages/utente.html";
  });
}

function prefill() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (saved.name && nameInput) nameInput.value = saved.name;
    if (saved.email && emailInput) emailInput.value = saved.email;
    if (saved.home && homeInput) homeInput.value = saved.home;
  } catch (err) {
    console.warn("Profilo non leggibile", err);
  }
}
