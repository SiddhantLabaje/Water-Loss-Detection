# Smart Water Loss Detection

An IoT water-monitoring application that collects sensor readings, predicts leaks and anomalies, estimates water loss, and provides administrator and plumber workflows for repairs.

## How it works

```text
ESP32 / Wokwi
    │ sensor readings
    ▼
ThingSpeak ── every 15 seconds ──► Node.js / Express
                                      ├── Saves readings to MongoDB
                                      ├── Runs the Python ML worker periodically
                                      ├── Serves the web application and REST API
                                      └── Sends email notifications (when configured)
                                                  │
                                                  ▼
                                               MongoDB
                                      sensors · predictions · incidents
                                                  │
                                                  ▼
                                        Browser dashboards
```

The Node.js backend starts the Python worker automatically. For local use, run the backend once; you do not need to start a separate prediction process.

## Features

- Live flow, pressure, tank-level, and turbidity monitoring
- ML-based leak classification, anomaly detection, and water-loss estimates
- Historical predictions, analytics, and alerts
- Admin dashboard for incident management, plumber approvals, proposals, assignments, and recovery verification
- Plumber registration, profile management, repair proposals, assignments, and completion reports
- Each new critical leak alert creates a separate repair request for approved plumbers; the admin reviews proposals and assigns a plumber
- Role-protected pages and API routes

## Requirements

- Node.js with npm
- Python 3 and pip, using versions compatible with `ai-smart-water-ml/requirements.txt`
- MongoDB (Atlas or a local replica-set-enabled deployment)
- ThingSpeak channel credentials for live sensor ingestion

MongoDB transactions are used in parts of the repair and assignment workflow. Use MongoDB Atlas or another deployment configured as a replica set for those operations.

## Local setup

Run commands from the repository root unless a step says otherwise.

### 1. Configure environment variables

Copy `.env.example` to `.env` in the repository root. The backend also supports `backend/.env`, which takes precedence if both files exist. Fill in at least:

```env
MONGO_URI=mongodb://localhost:27017/water_loss_detection
MONGO_DATABASE=water_loss_detection
MONGO_COLLECTION=sensors
PORT=5000
JWT_SECRET=<random secret of at least 32 characters>
CHANNEL_ID=<your ThingSpeak channel ID>
READ_API_KEY=<your ThingSpeak read API key>
```

Generate a JWT secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

For email notifications and plumber email verification, also set `EMAIL_USER` and `EMAIL_PASS` to SMTP credentials. For Gmail, use an App Password. Never commit `.env` or share its secret values.

### 2. Install dependencies

```bash
cd backend
npm install
cd ../frontend
npm install
cd ../ai-smart-water-ml
python -m pip install -r requirements.txt
cd ..
```

Ensure `PYTHON_BIN` points to the Python executable used above if `python` is not available on your `PATH`. The default is `python` on Windows and `python3` on Linux.

### 3. Create the initial admin and database indexes

Set these values in the environment file used by the backend:

```env
ADMIN_NAME=Your Name
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<unique password, 12-128 characters>
```

Then run these commands from `backend/`:

```bash
npm run bootstrap-admin
npm run create-indexes
```

Admin bootstrap is one-time only. Remove the bootstrap credentials from the environment after the admin account is created.

### 4. Start the application

Build the React frontend first, then start the backend:

```bash
cd frontend
npm run build
cd ../backend
npm start
```

For local development with hot-reload, run both in parallel:

```bash
# Terminal 1 — React dev server with API proxy (http://localhost:5173)
cd frontend
npm run dev

# Terminal 2 — Node.js backend (http://localhost:5000)
cd backend
npm start
```

Open [http://localhost:5000](http://localhost:5000). Sign in at `/login.html`; plumbers can register at `/plumber-register.html` and need admin approval before accessing monitoring features.

At startup, the backend connects to MongoDB, polls ThingSpeak every 15 seconds, and launches the Python ML worker on the interval configured by `ML_RUN_INTERVAL_MS` (15 seconds by default).

## Optional: retrain the ML models

Trained model files and the sample training workbook are included in `ai-smart-water-ml/`. Retraining is not required to start the application. To retrain using the included dataset:

```bash
cd ai-smart-water-ml
python src/pipeline/training_pipeline.py
```

The pipeline's default training path is `data/training/water_sensor_data.xlsx`. To use the workbook included in this repository, set `TRAINING_FILE=data/training/water_sensor_data_water_loss_rate.xlsx` in `.env` before running the command. The workbook must contain the sensor feature columns and prediction labels expected by the pipeline.

## Application pages

The frontend is a React single-page application served from `frontend/dist/` after the build step. All routes are handled client-side by React Router.

| Route | Purpose |
| --- | --- |
| `/login` | Sign in |
| `/register` | Plumber registration |
| `/monitoring` | Main monitoring dashboard |
| `/sensors` | Sensor readings |
| `/predictions` | Prediction history |
| `/analytics` | Analytics |
| `/alerts` | Alerts and notification settings |
| `/admin` | Admin operations |
| `/plumber` | Plumber workspace |

Monitoring pages require an approved plumber or administrator account. The admin and plumber pages require their respective roles.

## API overview

All API routes are prefixed with `/api`.

| Route | Description |
| --- | --- |
| `GET /api/health` | Service health check |
| `/api/auth` | Registration, login, logout, email verification, and password reset |
| `/api/sensors` | Sensor history and latest reading |
| `/api/ml-predictions` | Latest prediction, history, statistics, and alerts |
| `/api/dashboard` | Dashboard analytics |
| `/api/admin` | Admin dashboard, plumber approvals, incidents, proposals, assignments, and audit logs |
| `/api/plumber` | Plumber profile, repair requests, proposals, and assignments |
| `/api/repairs` | Repair history and recovery verification |
| `/api/stream` | Authenticated live data stream |
| `/api/notifications` | Admin notification settings |

See the route files in `backend/routes/` for request parameters, validation, and access requirements.

## Configuration reference

| Variable | Purpose | Default / requirement |
| --- | --- | --- |
| `MONGO_URI` | MongoDB connection string | Required |
| `MONGO_DATABASE` | Database used by the ML worker | `water_loss_detection` |
| `MONGO_COLLECTION` | Sensor collection used by the ML worker | `sensors` |
| `PORT` | HTTP server port | `5000` |
| `JWT_SECRET` | Signs authentication tokens | Required; at least 32 characters |
| `CHANNEL_ID` | ThingSpeak channel | Required for ingestion |
| `READ_API_KEY` | ThingSpeak read key | Required for private channels |
| `PYTHON_BIN` | Python executable used by the worker | `python` on Windows; `python3` otherwise |
| `ML_RUN_INTERVAL_MS` | Delay between ML worker runs | `15000` |
| `EMAIL_USER`, `EMAIL_PASS` | SMTP credentials for email | Optional; needed for email features |
| `WEB_ORIGINS` | Comma-separated allowed browser origins | Unset allows all origins; configure in production |
| `APP_URL` | Base URL used for emailed links | Falls back to `RENDER_EXTERNAL_URL`, then localhost |
| `RECOVERY_REQUIRED_READINGS` | Fresh normal readings required to verify recovery | `3` |
| `RECOVERY_MAX_AGE_MINUTES` | Maximum age of a recovery reading | `5` |
| `PREDICTION_INTERVAL_SECONDS` | ML prediction interval setting | `10` |
| `SEVERITY_LOW_MAX`, `SEVERITY_MEDIUM_MAX` | Leak severity boundaries | `0.50`, `0.80` |
| `TURBIDITY_GOOD_MAX`, `TURBIDITY_MODERATE_MAX` | Water-quality boundaries | `30`, `60` |

The root `.env.example` lists the supported variables and example values.

## Deployment

The repository includes a Render blueprint in `render.yaml`. It deploys a single Node.js web service that:

1. Installs Node.js backend dependencies
2. Builds the React frontend (`frontend/dist/`)
3. Installs Python ML dependencies
4. Starts the Node.js server which serves the React app and runs the Python ML worker

Configure the protected values (`MONGO_URI`, `JWT_SECRET`, ThingSpeak credentials, and any email credentials) in the Render service environment before deploying. Do not put production secrets in `render.yaml` or commit them to Git.

## Tests

Run the backend tests from `backend/`:

```bash
npm test
```

## Project structure

```text
backend/          Express API, authentication, MongoDB models, and services
frontend/         Static HTML, CSS, and browser JavaScript
ai-smart-water-ml/ Python prediction worker, training pipeline, models, and data
render.yaml       Render deployment blueprint
```
