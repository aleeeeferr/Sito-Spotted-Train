// Base del proxy CORS (fallback AllOrigins).
const DEFAULT_PROXY_BASE = window.STORAGE_PROXY_BASE || "https://api.allorigins.win/raw?url=";
const FORCE_PROXY = window.FORCE_STORAGE_PROXY === true;
let useProxy = false;
let logged = false;

const buildProxyUrl = (url) => {
  if (!url) return url;
  const encoded = encodeURIComponent(url);
  return DEFAULT_PROXY_BASE.includes("{url}")
    ? DEFAULT_PROXY_BASE.replace("{url}", encoded)
    : `${DEFAULT_PROXY_BASE}${encoded}`;
};

const logOnce = () => {
  if (logged) return;
  console.info("ℹ️ Uso del proxy CORS per Firebase Storage (sviluppo).");
  logged = true;
};

export const shouldUseStorageProxy = () => FORCE_PROXY || useProxy;

export const buildProxiedUrl = (url) => (shouldUseStorageProxy() ? buildProxyUrl(url) : url);

// Prova diretto, se fallisce passa al proxy.
export async function fetchStorage(url, options = {}) {
  const fetchWith = async (finalUrl, viaProxy) => {
    if (viaProxy) logOnce();
    const response = await fetch(finalUrl, { cache: "no-store", mode: "cors", ...options });
    if (!response.ok) {
      const error = new Error(`Storage fetch failed ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response;
  };

  const proxyUrl = buildProxyUrl(url);
  const fetchDirect = () => fetchWith(url, false);
  const fetchViaProxy = () => fetchWith(proxyUrl, true);

  if (shouldUseStorageProxy()) {
    try {
      return await fetchViaProxy();
    } catch (err) {
      // Se il proxy fallisce, riprova diretto.
      useProxy = false;
      return fetchDirect();
    }
  }

  try {
    return await fetchDirect();
  } catch (err) {
    // Se fallisce diretto (CORS o auth), riprova via proxy.
    useProxy = true;
    return fetchViaProxy();
  }
}
