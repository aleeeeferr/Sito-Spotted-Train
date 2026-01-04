# Spotted Train — Demo Vesuviana

Demo web di **Spotted Train** sulla rete **EAV Circumvesuviana (Vesuviana)**.

Questa repo contiene:
- **Frontend statico** (HTML/CSS/JS)
- **API locale** in **Node.js / Express**
- **MongoDB** (volume Docker persistente)
- **Dati pubblici Vesuviana** (orari, live, avvisi) via **Firebase Storage + Firestore**
- **Cloud Function** (opzionale) per aggiornare i dati live

Importante: il progetto è una **demo tecnica**. Alcune parti usano dati reali, altre sono simulate (vedi "Realtà vs Demo").
Disclaimer: questo progetto **non è affiliato** a EAV, Circumvesuviana o Unico Campania.

---

## TL;DR — Avvio rapido

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

- Sito: http://localhost:8080
- API: http://localhost:4000/healthz
- Mongo Express (opzionale): http://localhost:8081 (admin/admin)

Nota: per alcune pagine (es. **Avvisi**) serve il file `frontend/js/firebase-config.js` (generato da `.env`).

---

## Realtà vs Demo (cosa è vero e cosa è simulato)

| Funzionalità | Stato | Note |
|---|---|---|
| **Tariffe Unico Campania** | Reale | Usa un’API esterna per ottenere il **codice tariffa** |
| **Dettagli prezzo (Excel → tariffs.js)** | Reale | Prezzi/dettagli da file generato da Excel |
| **Acquisto biglietti** | Simulato | Salvato su MongoDB (demo), **nessun biglietto reale** |
| **Credito / storico acquisti** | Simulato | Serve a mostrare il flusso utente |
| **Orari / live Vesuviana** | Reale (dati pubblici) | JSON su **Firebase Storage** del progetto |
| **Avvisi** | Reale | Collezione Firestore `avvisi` |
| **Tracking live** | Parziale | Basato su teleindicatori; dati incompleti possibili |

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
16. [Note](#note)

---

## Architettura

**Componenti principali**
- **Frontend**: pagine statiche in `frontend/pages/`
  - Stili: `css/style.css`
  - Logica: `frontend/js/`
- **API**: server Node/Express (container `api`)
- **Database**: MongoDB (container `mongo`, volume `mongo_data`)
- **Firebase Storage**: JSON pubblici Vesuviana (manifest, stazioni, cache/live)
- **Firestore**: collezione `avvisi`
- **Cloud Function (opzionale)**: `orchestrateStation` (region `europe-west1`)

**Perché sia Mongo che Firebase?**
- **MongoDB**: dati applicativi (utenti, credito, biglietti demo)
- **Firebase**: dati pubblici (orari/live/avvisi) usati dal frontend

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
- Il frontend legge la collezione Firestore `avvisi` per mostrare gli avvisi.

### 3) Tracking (teleindicatori)
- Il tracking si basa sui dati dei **teleindicatori** (arrivi/partenze).
- Nota: se la sorgente è incompleta, il tracking può essere poco affidabile.

### 4) Pagina Mappa
- Pagina: `frontend/pages/mappe.html`
- Logica: `frontend/js/map.js`
- Dati: `frontend/js/map-coords.json` (coordinate stazioni)
- Cosa fa: disegna le linee Vesuviana con **Leaflet**, mostra stazioni, legenda e pannello laterale.
- Interazione: clic su una stazione o sulla lista → popup + apertura percorso su Google Maps.

### 5) Login / Registrazione
- Gestiti dall’API locale (JWT).
- Token salvato in `sessionStorage` (chiave `spottedUser`).

JWT in 2 righe:
JWT = **JSON Web Token**.  
È il "pass" dopo il login: se hai il token, l'API ti riconosce.

### 6) Biglietti (demo)
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

Nota: solo dev/demo.

---

## Configurazione Firebase

Il frontend usa la configurazione in:

- `frontend/js/firebase-config.js` (generato localmente)

Se il file è **mancante** o **vuoto**, alcune pagine (es. **Avvisi**) mostreranno errore.

### Setup
1. Copia `.env.example` in `.env` e compila i valori.
2. Genera il file di config:
   `node scripts/generate-firebase-config.js`

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

### Variabili d’ambiente (da docker-compose)
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

Le richieste protette usano header: `Authorization: Bearer <TOKEN_JWT>`.

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
L’Excel è la fonte dati: lo script Python serve per rigenerare il JS quando l’Excel cambia.
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
`P = partenze`, `A = arrivi`

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

## Note

- Il DB Mongo è salvato nel volume `mongo_data` (persistente tra riavvii).
- Seed iniziale: `docker/mongo-init/inizializzazione_db.js` (solo primo avvio con volume vuoto).
- Se il volume esiste già, Mongo **non** riesegue il seed.
- Il tracking si basa su teleindicatori; la qualità dati può variare.
