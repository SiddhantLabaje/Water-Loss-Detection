# AI Smart Water Monitoring — Full Stack

> ESP32 → ThingSpeak → Node.js → MongoDB → Python ML → Node.js REST API → Dashboard

---

## Architecture

```
┌──────────────────┐
│   ESP32 / Wokwi  │  Flow, Pressure, Tank Level, Turbidity
└────────┬─────────┘
         │  (HTTP POST fields)
         ▼
┌──────────────────┐
│    ThingSpeak    │  Channel 3445219
└────────┬─────────┘
         │  (axios GET every 15 s)
         ▼
┌──────────────────────────┐
│     NODE.JS BACKEND      │  backend/
│                          │
│  ThingSpeak cron fetcher │  services/cronJob.service.js
│  Express REST API        │  app.js
│  /api/sensors/*          │  routes/sensor.route.js
│  /api/ml-predictions/*   │  routes/mlPrediction.route.js
│  /api/dashboard/*        │  routes/dashboard.route.js
└────────────┬─────────────┘
             │  read/write
             ▼
┌──────────────┐
│   MongoDB    │  water_loss_detection
│              │
│  sensors         ← raw ESP32 data (written by Node.js)
│  ml_predictions  ← ML results    (written by Python)
└──────┬───────┘
       │  (pymongo, read sensors / write ml_predictions)
       ▼
┌──────────────────────────┐
│       PYTHON ML          │  ai-smart-water-ml/
│                          │
│  Random Forest Classifier│  leak detection
│  Isolation Forest × 3   │  anomaly detection
│  Random Forest Regressor │  water loss rate
│  Water Quality Rules     │  turbidity thresholds
│  Severity / Status       │  rule-based analytics
└────────────┬─────────────┘
             │  REST API reads ml_predictions
             ▼
┌──────────────────────────┐
│        DASHBOARD         │  frontend/pages/index.html
│                          │
│  Live Sensor Readings    │  auto-refresh every 10 s
│  Leak Detection          │  probability bar + severity
│  Anomaly Detection       │  per-channel status
│  Water Quality           │  turbidity-based
│  Water Loss Analysis     │  rate + volume
│  System Statistics       │  totals / averages
│  4 Real-time Graphs      │  Chart.js
│  Recent Alerts           │  CRITICAL + WARNING
│  Prediction History Table│  paginated
└──────────────────────────┘
```

---

## Quick Start

### 1 — Start the Node.js backend

```bash
cd backend
npm start
# Server running on http://localhost:5000
```

Configure `backend/.env` first using the secure setup below; the backend will not start without a strong `JWT_SECRET`.

### 2 — Start the Python ML pipeline

```bash
cd ai-smart-water-ml     # (in the mlmodel folder)
python src/pipeline/prediction_pipeline.py
```

Keep this process running alongside the Node.js backend. The backend stores raw sensor readings; this pipeline processes new readings and writes the predictions shown on the dashboard. If the pipeline is stopped, the sensor page may update while the dashboard's predictions remain stale.

> Train first if you haven't yet:
> ```bash
> python src/pipeline/training_pipeline.py
> ```

The Render blueprint deploys the ML pipeline as a background worker. It uses the backend's `MONGO_URI` and the `water_loss_detection` database, so both services read and write the same collections. The five trained `.pkl` model files under `ai-smart-water-ml/models/` must be committed to Git for the worker to load them.

### 3 — Open the dashboard

Open `http://localhost:5000/` after starting the backend. This serves the dashboard and the role-specific login and registration pages.

---

## Backend API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/sensors/sensor-data?limit=100&page=1` | Paginated raw sensors |
| GET | `/api/sensors/latest` | Most recent sensor record |
| GET | `/api/ml-predictions/latest` | Most recent ML prediction |
| GET | `/api/ml-predictions/history?limit=30&page=1` | Paginated prediction history |
| GET | `/api/ml-predictions/stats` | Aggregated statistics |
| GET | `/api/ml-predictions/alerts?limit=10` | Recent CRITICAL/WARNING records |
| GET | `/api/dashboard/latest-analytics` | Latest dashboard analytics doc |
| GET | `/api/dashboard/cleaned-sensor-data` | Today's analytics |
| GET | `/api/dashboard/analytics-history` | Last 14 days analytics |

---

## MongoDB Collections

| Collection | Written by | Purpose |
|-----------|-----------|---------|
| `sensors` | Node.js (ThingSpeak cron) | Raw ESP32 sensor readings |
| `ml_predictions` | Python ML pipeline | ML results per sensor record |
| `dashboard_analytics` | (analytics_pipeline.py) | Aggregated daily stats |

---

## Environment Variables

**backend/.env**
```env
MONGO_URI=mongodb://localhost:27017/water_loss_detection
PORT=5000
CHANNEL_ID=3445219
READ_API_KEY=<your_thingspeak_key>
EMAIL_USER=<your_gmail_address>
EMAIL_PASS=<your_gmail_app_password>
```

**ai-smart-water-ml/.env**
```env
MONGO_URI=mongodb://localhost:27017
MONGO_DATABASE=water_loss_detection
MONGO_COLLECTION=sensors
TRAINING_FILE=data/training/water_sensor_data_water_loss_rate.xlsx
PREDICTION_INTERVAL_SECONDS=10
```

> Both sides must use the same database name: `water_loss_detection`
>
> Configure `EMAIL_USER` and `EMAIL_PASS` with a Gmail account and Google
> App Password. Then enter the owner's name and destination email on the
> Alerts page. The system emails the owner when a new prediction transitions
> the system into CRITICAL status; it does not email for WARNING or repeated
> predictions that remain CRITICAL.

## Admin and plumber operations

The backend also supports a role-protected operations workflow:

- `POST /api/auth/register` creates a pending plumber account and profile.
- `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me` manage sessions.
- Admin operations are under `/api/admin`; plumber operations are under `/api/plumber`.
- A positive leak prediction creates a deduplicated open repair incident.
- Approved plumbers can submit costed proposals; admins assign/reassign through transaction-protected endpoints.
- A plumber completion report does not mark the incident recovered. Admin verification requires a configurable number of fresh, consecutive normal ML predictions after completion.

### Local setup

1. Copy `backend/.env.example` to `backend/.env` and set MongoDB, SMTP and a newly generated `JWT_SECRET` (at least 32 characters). Never commit `.env`.
2. Install dependencies with `cd backend; npm install`.
3. Create the initial administrator once: set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` in the environment, then run `npm run bootstrap-admin`. Do not use a default password; remove the bootstrap password afterward.
4. Ensure indexes exist with `npm run create-indexes`. This creates schema indexes but does not drop existing indexes.
5. Start the backend with `npm start`. The existing Python prediction worker remains a separate process.
6. Visit `/login.html` to sign in, or `/plumber-register.html` to register a plumber. Plumber registration requires working SMTP for email verification and an administrator's approval.

The Render blueprint deliberately leaves `MONGO_URI`, `READ_API_KEY`, SMTP credentials and `JWT_SECRET` as protected service variables. Set them in the `smart-water-monitor` web service's Environment settings before deploying. Generate a strong secret locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and set the result as `JWT_SECRET`; never commit it to Git. The backend binds its port before waiting for MongoDB and other startup services so Render can detect the web service. The Python worker receives the web service's `MONGO_URI` through a Render service reference. MongoDB transactions used by assignment and completion workflows require an Atlas replica set or another MongoDB deployment that supports transactions.

Set `WEB_ORIGINS` to a comma-separated list of additional frontend origins when hosting the browser UI on another domain. If `APP_URL` is set, it is used as the base for emailed links; otherwise Render's service host is normalized to HTTPS automatically.

`RECOVERY_REQUIRED_READINGS` defaults to 3 and `RECOVERY_MAX_AGE_MINUTES` defaults to 5. Recovery uses only the existing ML pipeline's `NORMAL` status and non-leak prediction plus complete, fresh sensor fields; it does not invent physical thresholds. These settings must be chosen for the installation's reading cadence.

Run backend unit tests with `cd backend; npm test`. Database-backed end-to-end tests require a non-production test database and are not run as part of this setup.

This implements the authentication and repair workflow foundation, not every item in the larger product specification. Evidence/file uploads, advanced dashboard visualizations, notification preference/history screens, and comprehensive database-backed integration testing still need implementation.

---

## Dashboard Features

- **Status Banner** — colour-coded NORMAL / WARNING / CRITICAL with blinking on critical
- **Live Sensors** — flow, pressure, tank level, turbidity with anomaly hints
- **Leak Detection** — LEAK/NORMAL label, probability bar, severity badge
- **Anomaly Detection** — per-sensor NORMAL/ABNORMAL with animated indicators
- **Water Quality** — GOOD/MODERATE/POOR based on turbidity NTU value
- **Water Loss** — ML-predicted rate (L/hr), flow loss component, volume per interval
- **Statistics** — total predictions, leak count/rate, critical count, avg water loss
- **4 Charts** — sensor trends, leak prob + water loss, status distribution pie, anomaly bar
- **Alert Feed** — recent CRITICAL/WARNING events with detail
- **History Table** — full paginated prediction log with all ML fields
