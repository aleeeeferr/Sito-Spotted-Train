# Sito-Spotted Train 

Demo di **Spotted Train** con:
- **Frontend statico** (HTML/CSS/JS)
- **API locale** in **Node.js / Express**
- **Database** **MongoDB** (persistente su volume Docker)
- **Dati pubblici** (orari, live, avvisi) gestiti su **Firebase Storage + Firestore**
- **Cloud Function** (opzionale) per aggiornare dati live

---

## Architettura

- **Frontend**: pagine statiche in `frontend/pages/`  
  Stili in `frontend/css/style.css`
- **API**: server Node/Express in `frontend/js/index.js`
- **Database**: MongoDB (volume Docker `mongo_data`)
- **Firebase Storage**: JSON pubblici (manifest, stazioni, cache/live)
- **Firestore**: collezione `avvisi`
- **Cloud Function**: `orchestrateStation` per aggiornamenti live (region `europe-west1`)

---

## Come funziona (flusso principale)

1. **Orari**
   - Il frontend scarica i file JSON dal bucket Firebase Storage:
     - `manifest.json`
     - `meta/station_data.json`
     - `stations/<id>/departures.json` (cache)
     - `stations/<id>/_live.json` e `stations/<id>/_live_arrivals.json` (live)

2. **Avvisi**
   - Il frontend legge la collezione Firestore: `avvisi`

3. **Tracking live**
   - Il frontend combina **cache + live** per le stazioni selezionate.
   - La funzione `fetchDepartures()` mostra entrambe le sezioni con etichette.

4. **Login / Registrazione**
   - Gestiti dall’API locale (JWT) e salvati su MongoDB.

5. **Biglietti**
   - L’utente acquista biglietti, il credito viene scalato e lo storico resta salvato su MongoDB.

---

## Requisiti

- Docker + Docker Compose
- (Opzionale) Node.js, se vuoi avviare l’API fuori da Docker

---

## Quick Start (consigliato: Docker)

1. Apri il terminale nella cartella del progetto
2. Avvia i container:

```bash
docker-compose -f docker/docker-compose.dev.yml up
```

3. Apri il sito:  
   **http://localhost:8080**

4. (Opzionale) Apri Mongo Express:  
   **http://localhost:8081**

5. (Opzionale) Verifica l’API:  
   **http://localhost:4000**

---

## Servizi e porte

| Servizio | Tecnologia | Porta |
|---------|------------|------|
| frontend | Nginx | `8080` |
| api | Node/Express | `4000` |
| mongo | MongoDB | `27017` |
| mongo-express | UI Mongo | `8081` |

---

## Credenziali Mongo Express

- Username: `admin`
- Password: `admin`

---

## Configurazione Firebase (obbligatoria per alcune pagine)

Il frontend usa la configurazione in:

- `frontend/js/firebase-config.js`

Se il file è **mancante** o **vuoto**, alcune pagine (es. **Avvisi**) mostreranno errore.

File richiesto:
- `frontend/js/firebase-config.js`

---

## Dati Firebase (uso lato frontend)

- **Firebase Storage**: bucket `spotted-train-221024.firebasestorage.app`
- **Firestore**: collezione `avvisi`
- **Cloud Function**: `orchestrateStation` (region `europe-west1`)

---

## API (Node + Mongo)

L’API principale è in `frontend/js/index.js` (avviata dal container `api`).

Variabili d’ambiente (già presenti nel `docker-compose`):

- `MONGODB_URI` → `mongodb://mongo:27017/spottedtrain`
- `JWT_SECRET` → segreto JWT (demo)
- `INITIAL_CREDIT` → credito iniziale (default: `300`)
- `HOST` → `0.0.0.0`
- `PORT` → `4000`

---

## Avvio API senza Docker (opzionale)

Se vuoi avviare l’API a mano:

```bash
npm install
node frontend/js/index.js
```

Poi:
- servi il frontend con un server statico
- assicurati che il frontend punti all’API su `http://localhost:4000`

---

## Proxy teleindicatori EAV (opzionale)

Endpoint esposto dall’API:

- `GET /api/trains?stazione=<id>&tipo=P|A`  
  Dove `P = partenze`, `A = arrivi`

Avvio rapido:

```bash
cd server
npm install
npm start
```

---

## Proxy CORS per Firebase Storage (opzionale)

Se il browser blocca la `fetch` diretta per CORS, puoi usare un proxy.

Variabili supportate lato frontend:
- `window.FORCE_STORAGE_PROXY`
- `window.STORAGE_PROXY_BASE`

---

## CORS e App Check (se devi modificare Firebase)

### CORS Storage

File: `cors.json`

```bash
gcloud auth login
gcloud config set project spotted-train-221024
gsutil cors set cors.json gs://spotted-train-221024.firebasestorage.app/
```

### App Check (Debug)

App Check usa **reCAPTCHA v3**.  
Su `localhost` puoi usare un token di debug impostando:

- `window.APP_CHECK_DEBUG_TOKEN`

---

## Note utili

- Il database Mongo viene salvato nel volume `mongo_data` (persistente tra i riavvii).
- Non serve importare un database: Mongo parte vuoto e l’app crea i dati quando ti registri o acquisti.
- Le tariffe sono in `frontend/js/tariffs.js`.
- Per rigenerare le tariffe usa `scripts/generate_tariffs.py` (se presente lo script e il file Excel).

---

## Troubleshooting rapido

- **La pagina Avvisi dà errore** → controlla `frontend/js/firebase-config.js`
- **CORS Storage bloccato** → configura CORS o usa il proxy (`FORCE_STORAGE_PROXY`)
- **Porte occupate** → cambia le porte nel `docker-compose.dev.yml` o chiudi i processi che le usano
