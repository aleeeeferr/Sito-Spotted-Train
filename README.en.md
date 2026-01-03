# Spotted Train — Vesuviana Demo

Web demo for **Spotted Train** on the **EAV Circumvesuviana (Vesuviana)** network.

This repo contains:
- **Static frontend** (HTML/CSS/JS)
- **Local API** in **Node.js / Express**
- **MongoDB** (persistent Docker volume)
- **Public Vesuviana data** (timetables, live, alerts) via **Firebase Storage + Firestore**
- **Cloud Function** (optional) to refresh live data

Important: this is a **technical demo**. Some parts use real data, others are simulated (see "Reality vs Demo").
Disclaimer: this project is **not affiliated** with EAV, Circumvesuviana or Unico Campania.

---

## TL;DR — Quick Start

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

- Site: http://localhost:8080
- API: http://localhost:4000/healthz
- Mongo Express (optional): http://localhost:8081 (admin/admin)

Note: some pages (e.g. **Avvisi**) require `frontend/js/firebase-config.js`.

---

## Reality vs Demo (what is real vs simulated)

| Feature | State | Notes |
|---|---|---|
| **Unico Campania fares** | Real | Uses an external API to get the **fare code** |
| **Price details (Excel → tariffs.js)** | Real | Prices/details come from an Excel-generated file |
| **Ticket purchase** | Simulated | Stored in MongoDB (demo), **no real ticket issued** |
| **Credit / purchase history** | Simulated | Used to show user flow |
| **Vesuviana timetables / live** | Real (public data) | JSONs hosted on **project Firebase Storage** |
| **Alerts** | Real | Firestore collection `avvisi` |
| **Live tracking** | Partial | Based on teleindicators; data may be incomplete |

---

## Index
1. [Architecture](#architecture)
2. [Technologies](#technologies)
3. [Main Flow](#main-flow)
4. [Requirements](#requirements)
5. [Quick Start (Docker)](#quick-start-docker)
6. [Services and Ports](#services-and-ports)
7. [Mongo Express Credentials](#mongo-express-credentials)
8. [Firebase Config](#firebase-config)
9. [Vesuviana Data on Firebase](#vesuviana-data-on-firebase)
10. [API (Node + Mongo)](#api-node--mongo)
11. [Fares (Unico Campania API + Excel)](#fares-unico-campania-api--excel)
12. [EAV Teleindicator Proxy (optional)](#eav-teleindicator-proxy-optional)
13. [Firebase Storage CORS Proxy (optional)](#firebase-storage-cors-proxy-optional)
14. [Reset database](#reset-database)
15. [Quick Troubleshooting](#quick-troubleshooting)
16. [Notes](#notes)

---

## Architecture

**Main components**
- **Frontend**: static pages in `frontend/pages/`
  - Styles: `css/style.css`
  - Logic: `frontend/js/`
- **API**: Node/Express server (container `api`)
- **Database**: MongoDB (container `mongo`, volume `mongo_data`)
- **Firebase Storage**: public Vesuviana JSONs (manifest, stations, cache/live)
- **Firestore**: `avvisi` collection
- **Cloud Function (optional)**: `orchestrateStation` (region `europe-west1`)

**Why both Mongo and Firebase?**
- **MongoDB**: app data (users, credit, demo tickets)
- **Firebase**: public data (timetables/live/alerts) used by the frontend

---

## Technologies

- **Frontend**: HTML/CSS/JS (static)
- **Backend**: Node.js + Express
- **DB**: MongoDB + Mongo Express (UI)
- **Auth**: JWT (sessionStorage)
- **Container**: Docker + Docker Compose
- **Public data**: Firebase Storage + Firestore
- **Optional**: Cloud Function to refresh live JSONs

---

## Main Flow

### 1) Timetables + Live
1. Frontend downloads public JSONs from **Firebase Storage**:
   - `manifest.json`
   - `meta/station_data.json`
   - `stations/<id>/departures.json` (cache)
   - `stations/<id>/_live.json` and `stations/<id>/_live_arrivals.json` (live)
2. Frontend merges **cache + live** and renders them in UI.

### 2) Alerts
- Frontend reads Firestore collection `avvisi` to display alerts.

### 3) Tracking (teleindicators)
- Tracking uses **teleindicator** data (arrivals/departures).
- Note: if the source is incomplete, tracking may be unreliable.

### 4) Login / Register
- Handled by the local API (JWT).
- Token stored in `sessionStorage` (`spottedUser`).

JWT in 2 lines:
JWT = **JSON Web Token**.  
It is the "pass" after login: if you have the token, the API recognizes you.

### 5) Tickets (demo)
1. User selects a route and sees the fare.
2. When purchasing, the frontend calls:
   - `POST http://localhost:4000/api/user/tickets`
3. API stores the ticket in MongoDB and subtracts credit.
4. Purchase is simulated; no real ticket is issued.

---

## Requirements

- **Docker** + **Docker Compose**

---

## Quick Start (Docker)

1. Open a terminal in the project folder
2. Start containers:

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

3. Open the site:  
   http://localhost:8080

4. (Optional) Mongo Express:  
   http://localhost:8081

5. (Optional) API health:  
   http://localhost:4000/healthz

---

## Services and Ports

| Service | Tech | Port |
|---|---|---:|
| frontend | Nginx | 8080 |
| api | Node/Express | 4000 |
| mongo | MongoDB | 27017 |
| mongo-express | Mongo UI | 8081 |

---

## Mongo Express Credentials

- Username: `admin`
- Password: `admin`

Note: dev/demo only.

---

## Firebase Config

Frontend reads config from:
- `frontend/js/firebase-config.js`

If the file is missing or empty, some pages (e.g. **Avvisi**) will fail.

### Template (example)
Create `frontend/js/firebase-config.js`:

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

## Vesuviana Data on Firebase

- **Firebase Storage**: bucket `spotted-train-221024.firebasestorage.app`
- **Firestore**: `avvisi` collection
- **Cloud Function**: `orchestrateStation` (region `europe-west1`)

### Storage fetch example (frontend)

```js
const fileRef = ref(storage, `stations/${stationId}/_live.json`);
const url = await getDownloadURL(fileRef);
const response = await fetch(url);
const data = await response.json();
```

---

## API (Node + Mongo)

The main API runs in container `api` and uses MongoDB.
Entry point: root `package.json`, server code in `frontend/js/index.js`.

### Environment variables (from docker-compose)
- `MONGODB_URI` → `mongodb://mongo:27017/spottedtrain`
- `JWT_SECRET` → JWT secret (demo)
- `INITIAL_CREDIT` → starting credit (default: `300`)
- `HOST` → `0.0.0.0`
- `PORT` → `4000`

### Main endpoints
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/user/profile`
- `POST /api/user/tickets`
- `GET /healthz`

Protected requests use header: `Authorization: Bearer <TOKEN_JWT>`.

---

## Fares (Unico Campania API + Excel)

Fare calculation uses **two sources**:

1) **Unico Campania external API (real)** → returns the **fare code** for a route  
2) **Excel → `tariffs.js`** → contains **price and details** for each code

External endpoint (censored): `https://example.com/unico

### How it works
1. Frontend calls the external API to get the fare code.
2. Using that code, it looks up details in `frontend/js/tariffs.js`.
3. `tariffs.js` is generated from an Excel file.

### Tariffs generation
- Excel: `tariffario/schema_tariffario.xlsx`
- Script: `scripts/generate_tariffs.py`
- Output: `frontend/js/tariffs.js`

Command:

```bash
python3 scripts/generate_tariffs.py
```

---

## EAV Teleindicator Proxy (optional)

API endpoint:

- `GET /api/trains?stazione=<id>&tipo=P|A`  
  `P = departures`, `A = arrivals`

Quick start:

```bash
cd server
npm install
npm start
```

---

## Firebase Storage CORS Proxy (optional)

If the browser blocks direct fetch for CORS, the frontend supports:
- `window.FORCE_STORAGE_PROXY`
- `window.STORAGE_PROXY_BASE`

---

## Reset database

Note: this deletes MongoDB completely (users/tickets demo).

```bash
docker compose -f docker/docker-compose.dev.yml down -v
```

---

## Quick Troubleshooting

- **Alerts failing** → check `frontend/js/firebase-config.js`
- **Storage CORS blocked** → use proxy (`FORCE_STORAGE_PROXY`)
- **Ports busy** → edit `docker-compose.dev.yml` or stop processes
- **Mongo seed not running** → volume already exists, reset DB with `down -v`

---

## Notes

- Mongo data is stored in `mongo_data` (persistent across restarts).
- Initial seed: `docker/mongo-init/inizializzazione_db.js` (first run only).
- If the volume exists, Mongo does **not** re-run the seed.
- Tracking relies on teleindicators; data quality can vary.
