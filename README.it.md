# Sito — Spotted Train (Vesuviana)
Demo web di **Spotted Train** per la rete **EAV – Circumvesuviana (Vesuviana)**.

Questa repo contiene:
- **Frontend statico** (HTML/CSS/JS)
- **API locale** in **Node.js / Express**
- **Database** **MongoDB** (persistente su volume Docker)
- **Dati pubblici Vesuviana** (orari, live, avvisi) gestiti su **Firebase Storage + Firestore**
- **Cloud Function** (opzionale) per aggiornare i dati live

Disclaimer: questo progetto **non è affiliato** a EAV, Circumvesuviana o Unico Campania.

> Importante: il progetto è una **demo tecnica**. Alcune parti usano dati reali, altre sono simulate (vedi sezione “Realtà vs Demo”).

---

## TL;DR — Avvio rapido

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

- Sito: http://localhost:8080  
- API: http://localhost:4000/healthz  
- Mongo Express (opz.): http://localhost:8081 (**admin/admin**)  

Nota: per alcune pagine (es. **Avvisi**) serve il file `frontend/js/firebase-config.js`.

---

## Realtà vs Demo (cosa è vero e cosa è simulato)

| Funzionalità | Stato | Note |
|---|---:|---|
| **Tariffe Unico Campania** | Reale | Usa un’API esterna reale per ottenere il **codice tariffa** |
| **Dettagli prezzo (Excel → tariffs.js)** | Reale | Prezzo/dettagli letti da file generato da Excel |
| **Acquisto biglietti** | Simulato | Salvataggio su MongoDB (demo), **non genera biglietti validi** |
| **Credito / storico acquisti** | Simulato | Serve per mostrare il flusso utente |
| **Orari / cache / live Vesuviana** | Reale (dati pubblici) | I JSON sono su **Firebase del progetto** (Storage) |
| **Avvisi** | Reale | Collezione Firestore `avvisi` |
| **Tracking live** | Parziale | Basato su **teleindicatori**: se i dati non arrivano bene, non è affidabile al 100% |

---

## Indice
1. [Architettura](#architettura)
2. [Tecnologie](#tecnologie)
3. [Flusso principale](#flusso-principale)
4. [Requisiti](#requisiti)
5. [Quick Start (Docker)](#quick-start-docker)
6. [Servizi e porte](#servizi-e-porte)
7. [Credenziali Mongo Express](#credenziali-mongo-express)
8. [Configurazione Firebase](#configurazione-firebase)
9. [Dati Vesuviana su Firebase](#dati-vesuviana-su-firebase)
10. [API (Node + Mongo)](#api-node--mongo)
11. [Tariffe (API Unico Campania + Excel)](#tariffe-api-unico-campania--excel)
12. [Proxy teleindicatori EAV (opzionale)](#proxy-teleindicatori-eav-opzionale)
13. [Proxy CORS Firebase Storage (opzionale)](#proxy-cors-firebase-storage-opzionale)
14. [Reset database](#reset-database)
15. [Troubleshooting rapido](#troubleshooting-rapido)

---

## Architettura

**Componenti principali**
- **Frontend**: pagine statiche in `frontend/pages/`  
  Stili in `css/style.css`  
  Logica in `frontend/js/`
- **API**: server Node/Express (container `api`)
- **Database**: MongoDB (container `mongo`, volume `mongo_data`)
- **Firebase Storage**: JSON pubblici Vesuviana (manifest, stazioni, cache/live)
- **Firestore**: collezione `avvisi`
- **Cloud Function (opz.)**: `orchestrateStation` (region `europe-west1`) per aggiornamenti live

**Perché sia Mongo che Firebase?**
- **MongoDB**: dati “applicativi” (utenti, credito, biglietti demo).
- **Firebase**: dati “pubblici” Vesuviana (orari/live/avvisi) serviti al frontend.

---

## Tecnologie

- **Frontend**: HTML/CSS/JS (statico)
- **Backend**: Node.js + Express
- **DB**: MongoDB + Mongo Express (UI)
- **Auth**: JWT (sessionStorage)
- **Container**: Docker + Docker Compose
- **Dati pubblici**: Firebase Storage + Firestore
- **Opzionale**: Cloud Function per aggiornare i JSON live

---

## Flusso principale

### 1) Orari + Live
1. Il frontend scarica JSON pubblici da **Firebase Storage**:
   - `manifest.json`
   - `meta/station_data.json`
   - `stations/<id>/departures.json` (cache)
   - `stations/<id>/_live.json` e `stations/<id>/_live_arrivals.json` (live)
2. Il frontend combina **cache + live** e li mostra in UI.

### 2) Avvisi
- Il frontend legge la collezione Firestore: `avvisi` per mostrare comunicazioni in tempo reale.

### 3) Tracking (teleindicatori)
- Il tracking si basa sui dati dei **teleindicatori** (arrivi/partenze).
- Nota: se la sorgente non invia dati coerenti o completi, il tracking può risultare **incompleto o non affidabile**.

### 4) Login / Registrazione
- Gestiti dall’API locale (JWT).
- Token salvato in `sessionStorage` (chiave `spottedUser`).

**JWT in 2 righe**
JWT = **JSON Web Token**.  
E' il "pass digitale": se hai il token, l'API ti riconosce senza rimandare la password.

### 5) Biglietti (demo)
1. L’utente seleziona una tratta e vede la tariffa.
2. Quando “compra”, il frontend chiama:
   - `POST http://localhost:4000/api/user/tickets`
3. L’API salva il biglietto in MongoDB e scala il credito.
4. L’acquisto è simulato: non emette biglietti reali.

---

## Requisiti

- **Docker** + **Docker Compose**

---

## Quick Start (Docker)

1. Apri il terminale nella cartella del progetto
2. Avvia i container:

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

3. Apri il sito:  
   http://localhost:8080

4. (Opzionale) Apri Mongo Express:  
   http://localhost:8081

5. (Opzionale) Verifica l’API:  
   http://localhost:4000/healthz

---

## Servizi e porte

| Servizio | Tecnologia | Porta |
|---|---|---:|
| frontend | Nginx | 8080 |
| api | Node/Express | 4000 |
| mongo | MongoDB | 27017 |
| mongo-express | UI Mongo | 8081 |

---

## Credenziali Mongo Express

- Username: `admin`
- Password: `admin`

> Solo ambiente dev/demo.

---

## Configurazione Firebase

Il frontend usa la configurazione in:

- `frontend/js/firebase-config.js`

Se il file è **mancante** o **vuoto**, alcune pagine (es. **Avvisi**) mostreranno errore.

### Template (esempio)
Crea `frontend/js/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

---

## Dati Vesuviana su Firebase

- **Firebase Storage**: bucket `spotted-train-221024.firebasestorage.app`
- **Firestore**: collezione `avvisi`
- **Cloud Function**: `orchestrateStation` (region `europe-west1`)

### Esempio fetch da Storage (frontend)

```js
const fileRef = ref(storage, `stations/${stationId}/_live.json`);
const url = await getDownloadURL(fileRef);
const response = await fetch(url);
const data = await response.json();
```

---

## API (Node + Mongo)

L’API principale è avviata dal container `api` e usa MongoDB.
Entry point: `package.json` in root, con server in `frontend/js/index.js`.

### Variabili d’ambiente (già presenti nel docker-compose)
- `MONGODB_URI` → `mongodb://mongo:27017/spottedtrain`
- `JWT_SECRET` → segreto JWT (demo)
- `INITIAL_CREDIT` → credito iniziale (default: `300`)
- `HOST` → `0.0.0.0`
- `PORT` → `4000`

### Endpoints principali
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/user/profile`
- `POST /api/user/tickets`
- `GET /healthz`

> Le richieste protette usano header: `Authorization: Bearer <TOKEN_JWT>`.

---

## Tariffe (API Unico Campania + Excel)

Per calcolare la tariffa il sito usa **due fonti**:

1) **API esterna Unico Campania (reale)** → restituisce il **codice tariffa** per una tratta  
2) **File Excel → `tariffs.js`** → contiene **prezzo e dettagli** per ogni codice

Endpoint esterno (censurato): `https://example.com/unico

### Come funziona
1. Il frontend chiama l’API esterna per ottenere il codice tariffa.
2. Con quel codice, cerca i dettagli in `frontend/js/tariffs.js`.
3. `tariffs.js` è generato da un file Excel.

### Generazione tariffe
- Excel: `tariffario/schema_tariffario.xlsx`
- Script: `scripts/generate_tariffs.py`
- Output: `frontend/js/tariffs.js`

Comando:

```bash
python3 scripts/generate_tariffs.py
```

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

## Proxy CORS Firebase Storage (opzionale)

Se il browser blocca la `fetch` diretta per CORS, puoi usare un proxy.

Variabili supportate lato frontend:
- `window.FORCE_STORAGE_PROXY`
- `window.STORAGE_PROXY_BASE`

---

## Reset database

Nota: questo cancella completamente MongoDB (perde utenti/biglietti demo).

```bash
docker compose -f docker/docker-compose.dev.yml down -v
```

---

## Troubleshooting rapido

- **Avvisi in errore** → controlla `frontend/js/firebase-config.js`
- **CORS Storage bloccato** → configura CORS o usa proxy (`FORCE_STORAGE_PROXY`)
- **Porte occupate** → cambia porte nel `docker-compose.dev.yml` o chiudi processi
- **Seed Mongo non parte** → il volume esiste già: fai reset DB con `down -v`

---

## Note utili

- Il DB Mongo è salvato nel volume `mongo_data` (persistente tra riavvii).
- Seed iniziale: `docker/mongo-init/inizializzazione_db.js` (solo primo avvio con volume vuoto).
- Se il volume esiste già, Mongo **non** riesegue il seed.
- Tracking: basato su teleindicatori → qualità dati variabile.
