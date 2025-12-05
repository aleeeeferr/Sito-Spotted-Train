# Sito-Spotted-Train-Demo

Demo statica di Spotted Train: orari e avvisi letti da Firebase (Storage + Firestore), aggiornamento live tramite una Cloud Function, e un piccolo proxy Node per i teleindicatori EAV come fallback.

## Architettura in breve
- Frontend statico in `frontend/`, servibile con Nginx (`docker-compose.dev.yml`) o con qualsiasi web server.
- Firebase Storage: bucket `spotted-train-221024.firebasestorage.app` con `manifest.json`, `meta/station_data.json` e per ogni stazione `stations/<id>/departures.json`, `_live.json`, `_live_arrivals.json`.
- Cloud Functions: callable `orchestrateStation` (region `europe-west1`) che forza l'aggiornamento dei file live della stazione prima di leggerli.
- Firestore: collezione `avvisi` (documento `avvisi/latest` come fonte principale) per gli avvisi pubblici.
- App Check: reCAPTCHA V3 in produzione, token di debug attivato automaticamente su `localhost`.
- Proxy opzionale in `server/`: espone `/api/trains` per leggere i teleindicatori EAV e fornire un JSON pronto all'uso (con fallback simulato).
- Tariffe statiche in `frontend/js/tariffs.js`, generate da `scripts/generate_tariffs.py` a partire da `frontend/tariffario/schema_tariffario.xlsx`.

## Flussi dati principali
### Stazioni
`fetchStations()` (in `frontend/js/firebaseApi.js`) legge `manifest.json` dal bucket, risolve i nomi delle stazioni da `meta/station_data.json` e popola i menu a tendina.

### Partenze e arrivi live
- `fetchDepartures(stationId, { destinationId })` chiama `orchestrateStation` per forzare la generazione dei file live, poi scarica `stations/<id>/departures.json` (cache) e `stations/<id>/_live.json` (live, opzionale). I dati vengono normalizzati e uniti; l'interfaccia mostra sia la sezione Live sia Cache con etichette chiare.
- `storageProxy.js` gestisce il CORS su Storage: di default prova la fetch diretta; se fallisce per CORS o se forzato con `VITE_FORCE_STORAGE_PROXY` / `window.FORCE_STORAGE_PROXY`, usa un proxy (AllOrigins o quello definito da `VITE_STORAGE_PROXY_BASE` / `window.STORAGE_PROXY_BASE`).

### Tracking in tempo reale
`frontend/js/tracking.js` legge `_live.json` e `_live_arrivals.json` per la stazione selezionata e ricostruisce la tratta. Usa:
- App Check reCAPTCHA V3 (chiave in codice) con token di debug su `localhost` da `VITE_APPCHECK_DEBUG_TOKEN` o `window.APP_CHECK_DEBUG_TOKEN`.
- Tabelle locali di mapping linea/stazione per collegare i codici EAV alle stazioni leggibili.

### Avvisi
`fetchAlerts()` legge `avvisi/latest` su Firestore; se il documento manca, fa fallback alla collezione `avvisi` intera. I risultati popolano `frontend/pages/avvisi.html`.

### Tariffe
`frontend/js/tariffs.js` contiene il tariffario precompilato. Se modifichi `frontend/tariffario/schema_tariffario.xlsx`, rigenera con:
```bash
python scripts/generate_tariffs.py
```
e committa il nuovo file JS.

### Proxy teleindicatori EAV
`server/index.js` espone:
- `GET /healthz`
- `GET /api/trains?stazione=<id>&tipo=P|A` (P=partenze, A=arrivi). Effettua un POST a `https://example.com/teleindicatori/ws_getData.php`, estrae i treni dalla tabella HTML e restituisce JSON. Se il feed è vuoto o in errore, genera un elenco realistico di fallback.

Avvio rapido del proxy:
```bash
cd server
npm install   # se necessario
npm start     # ascolta su http://127.0.0.1:4000
```
Il frontend può puntare qui impostando `window.STORAGE_PROXY_BASE` se vuoi testare fetch via proxy per CORS.

## CORS e App Check su Firebase Storage
- Applica la policy CORS del file `cors.json` al bucket `spotted-train-221024.firebasestorage.app`:
```bash
gcloud auth login
gcloud config set project spotted-train-221024
gsutil cors set cors.json gs://spotted-train-221024.firebasestorage.app/
gsutil cors get gs://spotted-train-221024.firebasestorage.app/
```
- In produzione App Check usa reCAPTCHA V3. In sviluppo su `localhost` il token di debug viene applicato automaticamente se presenti `VITE_APPCHECK_DEBUG_TOKEN` o `window.APP_CHECK_DEBUG_TOKEN`.

## Come provarlo in locale
- Frontend statico: `docker-compose -f docker-compose.dev.yml up` e apri `http://localhost:8080` (serve i file di `frontend/` con Nginx).
- Proxy teleindicatori (opzionale): avvialo come sopra e punta il frontend all'endpoint se vuoi testare dati live o fallback.
- Nessuna build Vite richiesta: gli asset JS/CSS sono già pronti e caricati via CDN (Firebase SDK).

## Note utili
- Bucket Storage: `gs://spotted-train-221024.firebasestorage.app/`.
- Callable Cloud Function: `orchestrateStation` (region `europe-west1`).
- Variabili runtime per il proxy CORS: `window.FORCE_STORAGE_PROXY`, `window.STORAGE_PROXY_BASE`, `VITE_FORCE_STORAGE_PROXY`, `VITE_STORAGE_PROXY_BASE`.

## Avviare il sito (rapido)
1. Installa Docker.
2. Da root del repo lancia: `docker-compose -f docker-compose.dev.yml up`
3. Apri `http://localhost:8080` per vedere il sito servito da Nginx con i file in `frontend/`.
4. Se vuoi testare anche il proxy teleindicatori, in un secondo terminale:
   ```bash
   cd server
   npm install   # prima volta
   npm start     # espone http://127.0.0.1:4000/api/trains
   ```
   Puoi puntare il frontend al proxy impostando `window.STORAGE_PROXY_BASE` se ti serve un proxy per CORS.
