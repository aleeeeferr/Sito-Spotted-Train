(() => {
    const STORAGE_KEY = "spottedUser";
    const API_BASE = window.API_BASE || "http://localhost:4000";

    const qs = (id) => document.getElementById(id);
    const readUser = () => {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };
    const saveUser = (user) => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    };
    const showError = (element, message) => {
        if (!element) {
            window.alert(message);
            return;
        }
        element.textContent = message;
        element.style.display = "block";
    };
    const clearError = (element) => {
        if (!element) return;
        element.textContent = "";
        element.style.display = "none";
    };
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

    const setupLogin = () => {
        const form = qs("login-form");
        const emailInput = qs("login-email");
        const passwordInput = qs("login-password");
        const loginErrorEl = qs("login-error");
        if (!form || !emailInput || !passwordInput) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearError(loginErrorEl);
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            if (!email || !password) {
                showError(loginErrorEl, "Inserisci email e password.");
                return;
            }
            try {
                const data = await authRequest("/api/auth/login", { email, password });
                saveUser({ token: data.token, ...data.user });
                window.location.href = "utente.html";
            } catch (err) {
                showError(loginErrorEl, err.message || "Errore login");
            }
        });
    };

    const setupRegister = () => {
        const form = qs("register-form");
        const nameInput = qs("register-name");
        const emailInput = qs("register-email");
        const passwordInput = qs("register-password");
        const passwordInput2 = qs("register-password2");
        const registerErrorEl = qs("register-error");
        if (!form || !nameInput || !emailInput || !passwordInput || !passwordInput2) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearError(registerErrorEl);
            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const password2 = passwordInput2.value;
            if (!name || !email || !password) {
                showError(registerErrorEl, "Compila tutti i campi.");
                return;
            }
            if (password !== password2) {
                showError(registerErrorEl, "Le password non coincidono.");
                return;
            }
            try {
                const data = await authRequest("/api/auth/register", { name, email, password });
                saveUser({ token: data.token, ...data.user });
                window.location.href = "utente.html";
            } catch (err) {
                showError(registerErrorEl, err.message || "Errore registrazione");
            }
        });
    };

    document.addEventListener("DOMContentLoaded", () => {
        if (readUser()) {
            window.location.href = "utente.html";
            return;
        }
        setupLogin();
        setupRegister();
    });
})();
