// Default proxy adds `Access-Control-Allow-Origin: *` (AllOrigins). Override via window.STORAGE_PROXY_BASE.
const windowProxyBase = typeof window !== "undefined" ? window.STORAGE_PROXY_BASE : null;
const envProxyBase =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_STORAGE_PROXY_BASE
    ? import.meta.env.VITE_STORAGE_PROXY_BASE
    : null;
const DEFAULT_PROXY_BASE = windowProxyBase || envProxyBase || "https://api.allorigins.win/raw?url=";
const FORCE_PROXY =
  window.FORCE_STORAGE_PROXY === true ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_FORCE_STORAGE_PROXY === "true");
let proxyLogged = false;
let sessionForceProxy = false;

function buildProxyUrl(url) {
  if (!url) return url;
  const encoded = encodeURIComponent(url);
  return DEFAULT_PROXY_BASE.includes("{url}")
    ? DEFAULT_PROXY_BASE.replace("{url}", encoded)
    : `${DEFAULT_PROXY_BASE}${encoded}`;
}

function logProxyOnce() {
  if (proxyLogged) return;
  console.info("ℹ️ Uso del proxy CORS per Firebase Storage (sviluppo).");
  proxyLogged = true;
}

function isRetryableStorageError(err) {
  const status = err?.status;
  const looksLikeCors = err instanceof TypeError || err?.message?.includes("Failed to fetch");
  const retryableStatus = status && [401, 403, 404].includes(Number(status));
  return { looksLikeCors, retryableStatus, status };
}

export function shouldUseStorageProxy() {
  // Di default NON usiamo proxy: serve solo se il bucket non è configurato per il CORS.
  return Boolean(FORCE_PROXY || sessionForceProxy);
}

export function buildProxiedUrl(url) {
  if (!url || !shouldUseStorageProxy()) return url;
  return buildProxyUrl(url);
}

export async function fetchStorage(url, options = {}) {
  const fetchWith = async (finalUrl, viaProxy) => {
    if (viaProxy) logProxyOnce();
    const response = await fetch(finalUrl, { cache: "no-store", mode: "cors", ...options });
    if (!response.ok) {
      const error = new Error(`Storage fetch failed ${response.status}`);
      error.status = response.status;
      error.url = finalUrl;
      try {
        error.body = await response.text();
      } catch (_err) {
        /* ignore body read errors */
      }
      throw error;
    }
    return response;
  };

  const proxyUrl = buildProxyUrl(url);
  const fetchDirect = () => fetchWith(url, false);
  const fetchViaProxy = () => fetchWith(proxyUrl, true);

  // If we already decided (or were forced) to use a proxy, skip direct fetch.
  if (shouldUseStorageProxy()) {
    try {
      return await fetchViaProxy();
    } catch (err) {
      // Se il proxy (AllOrigins) è down o non risponde con CORS, prova comunque diretto.
      const { looksLikeCors, status } = isRetryableStorageError(err);
      const serverError = status && Number(status) >= 500;
      if (!looksLikeCors && !serverError) throw err;
      console.warn("⚠️ Proxy CORS fallito, riprovo senza proxy (forse il bucket è già configurato).");
      sessionForceProxy = false;
      return fetchDirect();
    }
  }

  try {
    return await fetchDirect();
  } catch (err) {
    const { looksLikeCors, retryableStatus } = isRetryableStorageError(err);
    if (!looksLikeCors && !retryableStatus) throw err;
    console.warn("⚠️  Fetch Storage fallita (CORS/network o token scaduto), riprovo via proxy.");
    sessionForceProxy = true; // Evita tentativi diretti successivi nella sessione.
    return fetchViaProxy();
  }
}
