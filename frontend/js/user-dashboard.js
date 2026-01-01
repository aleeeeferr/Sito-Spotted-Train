const STORAGE_KEY = "spottedUser";
const API_BASE = window.API_BASE || "http://localhost:4000";

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const getEl = (id) => document.getElementById(id);

const readUser = () => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export const getToken = () => {
    const user = readUser();
    return user?.token || null;
};

export const apiFetch = async (path, options = {}) => {
    const { method = "GET", body, headers = {} } = options;
    const base = API_BASE;
    const url = path.startsWith("http") ? path : `${base}${path}`;
    const token = getToken();

    const finalHeaders = { "Content-Type": "application/json" };
    if (headers) {
        Object.assign(finalHeaders, headers);
    }
    if (token) {
        // Token di accesso inviato come Authorization Bearer per le API protette.
        finalHeaders.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || "Errore HTTP");
    }

    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    return response.text();
};

const saveUser = (user) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
};

const clearUser = () => {
    sessionStorage.removeItem(STORAGE_KEY);
};

const titleize = (value) =>
    value
        .trim()
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getInitials = (name = "Utente") =>
    name
        .trim()
        .split(" ")
        .filter((part) => part)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "ST";

const updateNav = (user) => {
    const navSlot = getEl("nav-auth");
    if (!navSlot) {
        return;
    }

    if (!user) {
        navSlot.innerHTML = '<a href="login.html">Accedi</a>';
        return;
    }

    const displayName = user.name?.trim() ? user.name.trim() : "Utente";
    const initials = getInitials(displayName);
    navSlot.innerHTML = `
            <div class="nav-user">
                <button class="nav-user-trigger" type="button" aria-expanded="false">
                    <span class="nav-avatar" aria-hidden="true">${initials}</span>
                    <span class="nav-user-name">${displayName}</span>
                    <span class="nav-caret" aria-hidden="true">▾</span>
                </button>
                <div class="nav-user-menu" role="menu" aria-label="Menu utente">
                    <a href="utente.html" role="menuitem">Area utente</a>
                    <a href="biglietti.html" role="menuitem">Biglietti</a>
                    <div class="nav-separator" role="separator" aria-hidden="true"></div>
                    <button class="nav-logout" type="button" data-logout="true" role="menuitem">Logout</button>
                </div>
            </div>
        `;

    const navUser = qs(".nav-user", navSlot);
    const trigger = qs(".nav-user-trigger", navSlot);
    const menu = qs(".nav-user-menu", navSlot);
    const logoutBtn = qs("[data-logout]", navSlot);

    const closeMenu = () => {
        navUser?.classList.remove("is-open");
        trigger?.setAttribute("aria-expanded", "false");
    };

    trigger?.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = navUser?.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    document.addEventListener("click", (event) => {
        if (navUser && !navUser.contains(event.target)) {
            closeMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
            trigger?.focus();
        }
    });

    menu?.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    logoutBtn?.addEventListener("click", () => {
        clearUser();
        window.location.href = "index.html";
    });
};

const handleLogin = () => {
    const loginBtn = qs(".panel-login .accedi-btn");
    const registerBtn = qs(".panel-registrati .accedi-btn");
    const loginEmail = getEl("login-email");
    const loginPassword = getEl("login-password");
    const regName = getEl("reg-nome");
    const regEmail = getEl("reg-email");
    const regPassword = getEl("reg-password");
    const regPassword2 = getEl("reg-password2");

    const showError = (message) => window.alert(message);
    const authRequest = async (path, payload) => {
        const response = await fetch(`${API_BASE}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.message || "Errore richiesta");
        }
        return data;
    };

    loginBtn?.addEventListener("click", async () => {
        const email = loginEmail?.value.trim() || "";
        const password = loginPassword?.value || "";
        if (!email || !password) {
            showError("Inserisci email e password.");
            return;
        }
        try {
            const data = await authRequest("/api/auth/login", { email, password });
            saveUser({ token: data.token, ...data.user });
            window.location.href = "utente.html";
        } catch (err) {
            showError(err.message || "Errore login");
        }
    });

    registerBtn?.addEventListener("click", async () => {
        const name = titleize(regName?.value || "");
        const email = regEmail?.value.trim() || "";
        const password = regPassword?.value || "";
        const password2 = regPassword2?.value || "";
        if (!name || !email || !password) {
            showError("Compila tutti i campi.");
            return;
        }
        if (password !== password2) {
            showError("Le password non coincidono.");
            return;
        }
        try {
            const data = await authRequest("/api/auth/register", { name, email, password });
            saveUser({ token: data.token, ...data.user });
            window.location.href = "utente.html";
        } catch (err) {
            showError(err.message || "Errore registrazione");
        }
    });
};

const hydrateArea = (user) => {
    const nameEl = getEl("area-user-name");
    const emailEl = getEl("area-user-email");
    if (nameEl && user?.name) {
        nameEl.textContent = user.name;
    }
    if (emailEl && user?.email) {
        emailEl.textContent = user.email;
    }
};

const setupTabs = () => {
    const buttons = qsa(".tab-button[data-tab]");
    const panels = qsa(".tab-panel[data-panel]");
    if (!buttons.length || !panels.length) {
        return;
    }

    const setActive = (tab) => {
        buttons.forEach((btn) => {
            const isActive = btn.dataset.tab === tab;
            btn.classList.toggle("is-active", isActive);
            btn.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        panels.forEach((panel) => {
            panel.classList.toggle("is-active", panel.dataset.panel === tab);
        });
    };

    buttons.forEach((btn) => btn.addEventListener("click", () => setActive(btn.dataset.tab)));
};

const setupTicketQr = () => {
    const toggles = qsa("[data-qr-toggle]");
    if (!toggles.length) {
        return;
    }
    toggles.forEach((toggle) => {
        toggle.addEventListener("click", () => {
            const card = toggle.closest(".ticket-card");
            card?.classList.toggle("is-qr-visible");
        });
    });
};

const setupTicketModal = () => {
    const modal = getEl("ticket-modal");
    if (!modal) {
        return;
    }
    const openButtons = qsa("[data-open-ticket]");
    const closeButtons = qsa("[data-close-modal]", modal);

    const openModal = () => {
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
    };
    const closeModal = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
    };

    openButtons.forEach((btn) => {
        btn.addEventListener("click", openModal);
    });
    closeButtons.forEach((btn) => {
        btn.addEventListener("click", closeModal);
    });
    modal.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.closeModal !== undefined) {
            closeModal();
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal.classList.contains("is-open")) {
            closeModal();
        }
    });
};

const setupMobileNav = () => {
    const nav = qs("nav.barrasup");
    if (!nav) {
        return;
    }
    const navList = qs("ul", nav);
    if (!navList || qs(".nav-toggle", nav)) {
        return;
    }

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "nav-toggle";
    toggleBtn.setAttribute("aria-label", "Apri menu");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.innerHTML = "<span></span><span></span><span></span>";
    nav.appendChild(toggleBtn);

    const closeMenu = () => {
        nav.classList.remove("is-open");
        toggleBtn.setAttribute("aria-expanded", "false");
    };

    toggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = nav.classList.toggle("is-open");
        toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    nav.addEventListener("click", (event) => event.stopPropagation());

    document.addEventListener("click", () => {
        closeMenu();
    });

    navList.addEventListener("click", (event) => {
        const anchor = event.target.closest("a");
        const logout = event.target.closest(".nav-logout");
        if (anchor || logout) {
            closeMenu();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
            closeMenu();
        }
    });
};

document.addEventListener("DOMContentLoaded", () => {
    const user = readUser();
    updateNav(user);
    setupMobileNav();

    if (document.body.classList.contains("pagina-accedi")) {
        if (user) {
            window.location.href = "utente.html";
            return;
        }
        handleLogin();
    }

    if (document.body.classList.contains("pagina-area-utente")) {
        if (!user) {
            window.location.href = "login.html";
            return;
        }
        hydrateArea(user);
        setupTabs();
        setupTicketQr();
        setupTicketModal();
    }
});

window.getToken = getToken;
window.apiFetch = apiFetch;
