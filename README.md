# Sito-Spotted-Train-Demo

## Spotted Train – Appunti rapidi (Firebase Storage + CORS + App Check)

Repo: static frontend che legge file JSON da Firebase Storage e usa alcune callable Functions.

## Cosa succede nel frontend
- I file statici stanno in `frontend/` e vengono serviti con Nginx (docker-compose.dev o build Vite).
- Gli script principali che parlano con Firebase Storage:
  - `frontend/js/stationsMeta.js` (demo selezione stazioni)
  - `frontend/js/tracking.js` (tracking live)
  - `frontend/js/firebaseApi.js` (API condivise per departures/arrivals)
  - `frontend/js/home.js` (home semplice)
- Tutti usano `frontend/js/storageProxy.js` per fare fetch ai file di Storage. Di default il proxy è DISATTIVATO: le fetch vanno dirette alla URL firmata di Firebase Storage. Puoi forzare il proxy (solo per debug CORS) con `window.FORCE_STORAGE_PROXY=true` o `VITE_FORCE_STORAGE_PROXY=true` e cambiare base del proxy con `window.STORAGE_PROXY_BASE` o `VITE_STORAGE_PROXY_BASE`.
- App Check:
  - In dev (localhost) l’app imposta `self.FIREBASE_APPCHECK_DEBUG_TOKEN` usando `VITE_APPCHECK_DEBUG_TOKEN` (da `.env.development`) oppure `window.APP_CHECK_DEBUG_TOKEN`.
  - In prod nessun debug token: App Check usa reCAPTCHA V3.
- Le fetch ai file Storage funzionano perché ogni file ha un download token (`token=...`) e la SDK genera un URL firmato con `getDownloadURL`.

## CORS su Firebase Storage
Perché serve: le fetch dal browser devono ricevere `Access-Control-Allow-Origin` dal bucket. Se manca, il browser blocca la risposta.

Bucket di progetto: `gs://spotted-train-221024.firebasestorage.app/`

Policy consigliata (già nel repo come `cors.json`):
```json
[
  {
    "origin": [
      "http://localhost:5173",
      "http://localhost:8080",
      "https://spotted-train-221024.web.app",
      "https://spotted-train-221024.firebaseapp.com",
      "*"
    ],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
```

Come applicarla:
```bash
gcloud auth login
gcloud config set project spotted-train-221024
gsutil cors set cors.json gs://spotted-train-221024.firebasestorage.app/
gsutil cors get gs://spotted-train-221024.firebasestorage.app/
```
Attendere qualche minuto perché la policy sia visibile.

## Come funzionano le fetch in JS
1) Inizializzazione Firebase: ogni modulo importa la SDK da CDN e crea l’app con `firebaseConfig`.
2) App Check: se sei su localhost, setta `FIREBASE_APPCHECK_DEBUG_TOKEN` prima di `initializeAppCheck`. Questo fa emettere token debug per Storage/Functions.
3) Download file:
   - La SDK `getDownloadURL(ref(storage, "meta/station_data.json"))` produce una URL firmata con query `token=...`.
   - `fetchStorage(url)` esegue la fetch con `cache: "no-store"`. Se hai forzato il proxy, incapsula la URL; altrimenti va diretta.
4) Callable Functions: in `stationsMeta.js` e `firebaseApi.js` c’è `orchestrateStation` chiamato via `httpsCallable`. Anche qui App Check applica la protezione; in dev il token debug evita blocchi.

## Variabili utili
- `VITE_APPCHECK_DEBUG_TOKEN` (in `.env.development`): token debug App Check per dev.
- `VITE_FORCE_STORAGE_PROXY` (opzionale): se `true` forza l’uso del proxy CORS; di default è `false` in locale perché il bucket ha CORS.
- `VITE_STORAGE_PROXY_BASE` (opzionale): base del proxy CORS (es. `https://api.allorigins.win/raw?url=`).
- `window.FORCE_STORAGE_PROXY` / `window.STORAGE_PROXY_BASE`: override a runtime per il proxy.

## Avvio rapido con Vite (porta fissa 5173)
Porta configurata in `frontend/vite.config.js` con `strictPort: true` (se 5173 è occupata, Vite fallisce invece di cambiare porta).
```bash
cd frontend
npm install            # solo la prima volta
npm run local:vite     # serve su http://localhost:5173
```
Interrompi con Ctrl+C.

## Uso rapido in locale
```bash
cd frontend
npm run local          # alza nginx statico su :8080 via docker-compose.dev
```
Poi apri `http://localhost:8080`. App Check debug si attiva da solo grazie al token in `.env.development`.

## Quando vedi ancora CORS
- Verifica di aver applicato la CORS policy sul bucket corretto.
- Assicurati che la URL usata sia `https://firebasestorage.googleapis.com/v0/b/spotted-train-221024.firebasestorage.app/...`.
- In dev ora il proxy non è forzato: abilitalo con `VITE_FORCE_STORAGE_PROXY=true` solo se il bucket non risponde con CORS. Se il proxy AllOrigins è down, imposta `VITE_STORAGE_PROXY_BASE` (o `window.STORAGE_PROXY_BASE`) verso un proxy diverso.
