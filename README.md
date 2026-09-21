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
node server.js
# Server running on http://localhost:5000
```

### 2 — Start the Python ML pipeline

```bash
cd ai-smart-water-ml     # (in the mlmodel folder)
python src/pipeline/prediction_pipeline.py
```

> Train first if you haven't yet:
> ```bash
> python src/pipeline/training_pipeline.py
> ```

### 3 — Open the dashboard

Open `frontend/pages/index.html` directly in your browser.  
It auto-refreshes every 10 seconds.

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
