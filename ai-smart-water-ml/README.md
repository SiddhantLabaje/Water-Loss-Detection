# AI Smart Water Monitoring ML System

> An end-to-end Machine Learning system for IoT-based smart water monitoring.  
> Trains on historical Excel sensor data, then continuously monitors MongoDB for live ESP32 readings and writes ML predictions back automatically — no manual input required.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Project Structure](#3-project-structure)
4. [Requirements](#4-requirements)
5. [Installation](#5-installation)
6. [Configuration](#6-configuration)
7. [Training Dataset Format](#7-training-dataset-format)
8. [How to Train](#8-how-to-train)
9. [How to Run Real-Time Monitoring](#9-how-to-run-real-time-monitoring)
10. [How to Test with Last MongoDB Record](#10-how-to-test-with-last-mongodb-record)
11. [All Commands](#11-all-commands)
12. [ML Models](#12-ml-models)
13. [Water Loss Formulas](#13-water-loss-formulas)
14. [Prediction Output Fields](#14-prediction-output-fields)
15. [Overall System Status Rules](#15-overall-system-status-rules)
16. [Sample MongoDB Output Document](#16-sample-mongodb-output-document)
17. [Results and Plots](#17-results-and-plots)
18. [Limitations](#18-limitations)

---

## 1. Project Overview

This system provides automated water leak detection, anomaly detection, water quality monitoring, and water loss rate estimation for an IoT smart water management pipeline.

**Two-stage operation:**

| Stage | What happens |
|-------|-------------|
| **Training** | Load Excel dataset → train ML models → save to `models/` |
| **Prediction** | Poll MongoDB every N seconds → predict → write results back |

Python is responsible **only** for ML and MongoDB. No REST API, no manual sensor entry, no Flask/FastAPI.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   DATA FLOW                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ESP32 / Wokwi Simulator                               │
│          │                                              │
│          ▼                                              │
│      ThingSpeak                                         │
│          │                                              │
│          ▼                                              │
│   Node.js + Express  ──────────────────────────────┐   │
│          │                                         │   │
│          ▼                                         │   │
│       MongoDB  ◄── Python reads unprocessed docs   │   │
│          │                                         │   │
│          ▼                                         │   │
│   Python ML System                                 │   │
│    ├── Leak Detection   (RandomForestClassifier)   │   │
│    ├── Anomaly Detection(IsolationForest × 3)      │   │
│    ├── Water Loss Rate  (RandomForestRegressor)    │   │
│    └── Analytics        (thresholds + rules)       │   │
│          │                                         │   │
│          ▼                                         │   │
│       MongoDB  ◄── Python writes ML results back   │   │
│          │                                         │   │
│          ▼                                         │   │
│       Dashboard  ◄─────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Project Structure

```
ai-smart-water-ml/
│
├── data/
│   └── training/
│       └── README.md                   ← dataset placement guide
│
├── models/                             ← saved after training
│   ├── leak_detection/
│   │   ├── current_model.pkl           ← RandomForestClassifier
│   │   └── metadata.json
│   ├── anomaly_detection/
│   │   ├── flow_model.pkl              ← IsolationForest (flow)
│   │   ├── pressure_model.pkl          ← IsolationForest (pressure)
│   │   └── tank_level_model.pkl        ← IsolationForest (tank level)
│   └── water_loss/
│       └── current_model.pkl           ← RandomForestRegressor
│
├── results/                            ← saved after training
│   └── leak_detection/
│       ├── confusion_matrix.png
│       ├── feature_importance.png
│       ├── eda_sensor_distributions.png
│       ├── eda_boxplots_by_class.png
│       ├── eda_correlation_heatmap.png
│       ├── eda_class_distribution.png
│       └── eda_turbidity_distribution.png
│
├── notebooks/
│   └── water_monitoring_eda.ipynb      ← interactive EDA notebook
│
├── src/
│   ├── config/
│   │   └── config.py                   ← all settings, loaded from .env
│   │
│   ├── data/
│   │   ├── excel_loader.py             ← load + validate Excel dataset
│   │   ├── mongo_loader.py             ← MongoDB read/write
│   │   └── preprocessing.py            ← shared feature extraction
│   │
│   ├── leak_detection/
│   │   ├── train.py                    ← train RandomForestClassifier
│   │   ├── evaluate.py                 ← metrics + confusion matrix
│   │   └── predict.py                  ← predict on single record
│   │
│   ├── anomaly_detection/
│   │   ├── train.py                    ← train 3 IsolationForest models
│   │   └── predict.py                  ← predict anomaly per channel
│   │
│   ├── water_loss/
│   │   ├── train.py                    ← train RandomForestRegressor
│   │   └── predict.py                  ← predict L/hr using formulas
│   │
│   ├── analytics/
│   │   ├── severity.py                 ← LOW / MEDIUM / HIGH
│   │   ├── water_quality.py            ← GOOD / MODERATE / POOR
│   │   ├── water_loss_volume.py        ← rate × time
│   │   └── overall_status.py          ← NORMAL / WARNING / CRITICAL
│   │
│   └── pipeline/
│       ├── training_pipeline.py        ← run to train all models
│       └── prediction_pipeline.py      ← run to start monitoring
│
├── run_once_predict.py                 ← test on last MongoDB record
├── diagnose.py                         ← model diagnostics
├── check_mongo.py                      ← check MongoDB collection
├── .env.example                        ← copy to .env and configure
├── requirements.txt
├── README.md
└── .gitignore
```

---

## 4. Requirements

| Library | Version | Purpose |
|---------|---------|---------|
| pandas | 2.2.2 | Data loading and manipulation |
| numpy | 1.26.4 | Numerical operations |
| scikit-learn | 1.5.1 | ML models |
| pymongo | 4.8.0 | MongoDB integration |
| openpyxl | 3.1.5 | Excel file reading |
| joblib | 1.4.2 | Model serialization |
| python-dotenv | 1.0.1 | Environment configuration |
| matplotlib | 3.9.1 | Plotting |
| seaborn | 0.13.2 | Statistical visualization |

**Python 3.12+ required.**

---

## 5. Installation

```bash
# 1. Navigate to project folder
cd d:\mlmodel\ai-smart-water-ml

# 2. (Optional) Create a virtual environment
python -m venv venv
venv\Scripts\activate

# 3. Install all dependencies
pip install -r requirements.txt
```

---

## 6. Configuration

```bash
# Copy the example file
copy .env.example .env
```

Open `.env` and fill in your values:

```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017
MONGO_DATABASE=water_loss_detection
MONGO_COLLECTION=sensors

# Training Data (path relative to project root)
TRAINING_FILE=data/training/water_sensor_data.xlsx

# Real-Time Monitoring — how often to check for new records (seconds)
PREDICTION_INTERVAL_SECONDS=10

# Leak Severity Thresholds
SEVERITY_LOW_MAX=0.50       # probability < 50%  → LOW
SEVERITY_MEDIUM_MAX=0.80    # probability < 80%  → MEDIUM
                            # probability ≥ 80%  → HIGH

# Turbidity / Water Quality Thresholds
TURBIDITY_GOOD_MAX=30       # 0–30   → GOOD
TURBIDITY_MODERATE_MAX=60   # 31–60  → MODERATE
                            # > 60   → POOR
```

> **Never commit your `.env` file.** It is already in `.gitignore`.

---

## 7. Training Dataset Format

Place your Excel file at:
```
data/training/water_sensor_data.xlsx
```

### Required columns — these 6 are all you need

| Column | Type | Description |
|--------|------|-------------|
| `flowSensorData` | float | Flow sensor reading |
| `pressureSensorData` | float | Pressure sensor reading |
| `tankLevelSensorData` | float | Tank level sensor reading (0–100) |
| `turbiditySensorData` | float | Turbidity / water clarity reading |
| `predictionData` | int | Ground truth — **0 = NORMAL**, **1 = LEAK** |
| `createdAt` | datetime | Timestamp (used for chronological train/test split) |

> **You do NOT need a `waterLossRate` column.**
> The system derives it automatically from `flowSensorData` and `pressureSensorData`
> using the three hydraulic formulas. Nothing extra required in your Excel file.

### If you have real measured water-loss data (optional)

Only add this column if your hardware actually measures water-loss rate:

| Column | Type | Description |
|--------|------|-------------|
| `waterLossRate` | float | Real measured water-loss rate in L/hr |

If this column is **present and valid** → the regressor trains on your real measurements.  
If this column is **absent** → the system derives the target automatically. No action needed.

### Example row

```
flowSensorData | pressureSensorData | tankLevelSensorData | turbiditySensorData | predictionData | createdAt
40.0           | 36.0               | 28.0                | 56.0                | 1              | 2026-08-27T12:09:46
72.5           | 68.3               | 80.1                | 18.2                | 0              | 2026-08-27T12:09:56
```

### Notes
- ~1000–5000 records recommended
- Records are split **chronologically** — 80% oldest → train, 20% newest → test
- Do not shuffle the dataset — the pipeline handles ordering automatically
- Column names are **case-sensitive** — must match exactly as shown above

---

## 8. How to Train

```bash
python src/pipeline/training_pipeline.py
```

### What the training pipeline does

```
Step 1  → Load Excel dataset
Step 2  → Display dataset size and column names
Step 3  → Check missing values
Step 4  → Check duplicate records
Step 5  → Check sensor value ranges
Step 6  → Validate predictionData (only 0 and 1 allowed)
Step 7  → Check class distribution (NORMAL vs LEAK)
Step 8  → Clean the dataset
Step 9  → Run EDA — save 5 plots to results/leak_detection/
Step 10 → Sort chronologically by createdAt
Step 11 → Split: 80% oldest = train | 20% newest = test
Step 12 → Train RandomForestClassifier (leak detection)
Step 13 → Evaluate: Recall, F1, Precision, Accuracy + confusion matrix
Step 14 → Train 3 × IsolationForest (flow, pressure, tank anomaly)
Step 15 → Train RandomForestRegressor (water loss in L/hr)
Step 16 → Save all models to models/
Step 17 → Save model metadata to models/leak_detection/metadata.json
Step 18 → Print final summary
```

### Expected training output

```
============================================================
  TRAINING COMPLETE — FINAL SUMMARY
============================================================

  Leak Detection Model
    Recall    : 0.9359
    F1-Score  : 0.9279
    Precision : 0.9210
    Accuracy  : 0.9380

  Anomaly Detection Models : ['flow', 'pressure', 'tank_level']

  Water Loss Regressor
    R²   : 0.8751
    MAE  : 2.91 L/hr
    RMSE : 7.39 L/hr

  Models saved to : models/
  Plots saved to  : results/
```

---

## 9. How to Run Real-Time Monitoring

> Train the models first (Step 8) before running this.

```bash
python src/pipeline/prediction_pipeline.py
```

The pipeline runs **forever** until you press `Ctrl+C`.

### What it does every polling interval

```
1. Connect to MongoDB
2. Load all trained models (once at startup)
3. Poll collection every PREDICTION_INTERVAL_SECONDS
4. For each NEW unprocessed document:
     a. Read sensor values from MongoDB
     b. Validate all required fields
     c. Run leak classifier        → mlPredictionData, mlProbability
     d. Calculate severity         → mlSeverity
     e. Run 3 anomaly detectors    → flowAnomaly, pressureAnomaly, tankLevelAnomaly
     f. Calculate water quality    → waterQualityStatus
     g. Predict water loss rate    → waterLossRate (L/hr)
     h. Calculate volume lost      → waterLossVolume (Litres)
     i. Calculate overall status   → overallSystemStatus
     j. Write ALL results back to MongoDB
     k. Mark document as processed (mlProcessedAt timestamp)
5. When no new records: display latest document status
6. Wait → repeat
```

### Example console output

```
17:03:40  INFO  MongoDB connected: water_loss_detection / sensors
[2026-08-27 17:03:40]  Found 1 new record(s).
  [2026-08-27 17:03:40]  Flow=40  Pressure=36  Tank=28  Turbidity=56
  → Prediction: LEAK  Prob: 100.0%  Severity: HIGH
  | FlowA: NORMAL  PressA: NORMAL  TankA: ABNORMAL
  | WQ: MODERATE  | WaterLoss: 51.08 L/hr  | Status: CRITICAL

[2026-08-27 17:03:50]  [NO NEW DATA — showing latest]
  createdAt=2026-08-27 12:09:46  Flow=40  Pressure=36  Tank=28  Turbidity=56
  → Prediction: LEAK  Prob: 100.0%  Severity: HIGH  | Status: CRITICAL
```

### MongoDB failure handling

If the connection is lost:
- The error is caught and displayed
- The pipeline waits `PREDICTION_INTERVAL_SECONDS` and retries
- It **never** crashes or terminates permanently

---

## 10. How to Test with Last MongoDB Record

Use this to verify the full pipeline is working without waiting for new ESP32 data:

```bash
python run_once_predict.py
```

Reads the most recent document from MongoDB, runs prediction, writes results back, and prints the full breakdown including formula steps.

---

## 11. All Commands

| Purpose | Command |
|---------|---------|
| Install packages | `pip install -r requirements.txt` |
| **Train all models** | `python src/pipeline/training_pipeline.py` |
| **Start live monitoring** | `python src/pipeline/prediction_pipeline.py` |
| Test on last MongoDB record | `python run_once_predict.py` |
| Check MongoDB collection | `python check_mongo.py` |
| Diagnose model behaviour | `python diagnose.py` |

---

## 12. ML Models

### Leak Detection — RandomForestClassifier

| Property | Value |
|----------|-------|
| Algorithm | `RandomForestClassifier` |
| n_estimators | 100 |
| random_state | 42 |
| class_weight | `"balanced"` |
| Features | `flowSensorData`, `pressureSensorData`, `tankLevelSensorData` |
| Target | `predictionData` — 0 = NORMAL, 1 = LEAK |
| Output | `mlPredictionData` + `mlProbability` (0–100%) |

The `balanced` class weight prevents the model from ignoring rare leak events by automatically up-weighting the minority class.

Probability is extracted via `model.predict_proba()` — specifically the probability of class 1 (LEAK).

---

### Anomaly Detection — IsolationForest × 3

Three completely independent models, one per sensor channel:

| Model | Input | Output field |
|-------|-------|-------------|
| Flow | `flowSensorData` | `flowAnomaly` |
| Pressure | `pressureSensorData` | `pressureAnomaly` |
| Tank Level | `tankLevelSensorData` | `tankLevelAnomaly` |

Output: `"NORMAL"` or `"ABNORMAL"`

IsolationForest is **unsupervised** — it learns the normal sensor distribution from training data and flags deviations. It does not use `predictionData` labels.

---

### Water Loss Regressor — RandomForestRegressor

Predicts water-loss rate in **L/hr** using the three hydraulic formulas as training targets.

| Property | Value |
|----------|-------|
| Algorithm | `RandomForestRegressor` |
| n_estimators | 200 |
| random_state | 42 |
| Output | `waterLossRate` in L/hr |
| R² (test set) | 0.875 |
| MAE (test set) | 2.91 L/hr |

---

## 13. Water Loss Formulas

The water-loss regressor is trained on targets derived from these three formulas:

```
┌─────────────────────────────────────────────────────────────┐
│  Formula 1 — Flow Loss                                      │
│                                                             │
│  LeakRatio = (NormalFlow − flowSensorData) / NormalFlow     │
│              clamped to [0, 1]                              │
│                                                             │
│  FlowLoss  = flowSensorData × LeakRatio × 3.6              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Formula 2 — Pressure Loss                                  │
│                                                             │
│              NormalPressure − ActualPressure                │
│  PressLoss = ExpectedFlow × ─────────────────────           │
│                                 NormalPressure              │
│              clamped to ≥ 0                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Formula 3 — Total Water Loss Rate                          │
│                                                             │
│  TotalRate (L/hr) = 0.7 × FlowLoss + 0.3 × PressureLoss   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Reference constants** (derived from NORMAL records in training data):

| Constant | Value | Source |
|----------|-------|--------|
| NormalFlow | 67.8 | Mean `flowSensorData` of NORMAL records |
| NormalPressure | 69.8 | Mean `pressureSensorData` of NORMAL records |
| ExpectedFlow | 67.8 | Same as NormalFlow |

### Example calculation — Flow=40, Pressure=36

```
LeakRatio    = (67.8 − 40.0) / 67.8 = 0.4100
FlowLoss     = 40.0 × 0.4100 × 3.6  = 59.04 L/hr

PressureLoss = 67.8 × (69.8 − 36.0) / 69.8 = 32.83 L/hr

TotalRate    = 0.7 × 59.04 + 0.3 × 32.83 = 51.18 L/hr
ML Predicted = 51.08 L/hr
```

---

## 14. Prediction Output Fields

Every field the system writes back to MongoDB:

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `mlPredictionData` | int | **ML** | 0 = NORMAL, 1 = LEAK |
| `mlProbability` | float | **ML** | Leak confidence 0.0–100.0% |
| `mlSeverity` | string | Calculated | LOW / MEDIUM / HIGH |
| `flowAnomaly` | string | **ML** | NORMAL / ABNORMAL |
| `pressureAnomaly` | string | **ML** | NORMAL / ABNORMAL |
| `tankLevelAnomaly` | string | **ML** | NORMAL / ABNORMAL |
| `waterQualityStatus` | string | Calculated | GOOD / MODERATE / POOR / UNKNOWN |
| `waterLossRate` | float | **ML** | Predicted rate in L/hr |
| `waterLossFlowLoss` | float | Formula | Flow Loss component (L/hr) |
| `waterLossVolumePerHour` | float | Formula | Same as rate, dashboard label (L/hr) |
| `waterLossVolume` | float | Calculated | Litres lost in polling interval |
| `waterLossUnit` | string | Fixed | `"L/hr"` |
| `overallSystemStatus` | string | Rule-based | NORMAL / WARNING / CRITICAL |
| `mlProcessedAt` | string | Pipeline | UTC ISO timestamp |

Original sensor fields and `predictionData` are **never overwritten**.

### Which outputs are ML vs Calculated

| Output | Source |
|--------|--------|
| `mlPredictionData`, `mlProbability` | RandomForestClassifier |
| `flowAnomaly`, `pressureAnomaly`, `tankLevelAnomaly` | IsolationForest |
| `waterLossRate` | RandomForestRegressor |
| `mlSeverity` | Probability threshold |
| `waterQualityStatus` | Turbidity threshold |
| `waterLossVolume` | rate ÷ 3600 × seconds |
| `overallSystemStatus` | Decision rules |

---

## 15. Overall System Status Rules

Rules are applied in order — first match wins.

### CRITICAL when any of:
- Leak detected **AND** severity = HIGH
- Leak detected **AND** severity = MEDIUM **AND** any sensor anomaly
- 2 or more sensor anomalies simultaneously
- Water quality = POOR **AND** leak detected

### WARNING when any of:
- Leak detected **AND** severity = LOW
- Leak detected **AND** severity = MEDIUM (all sensors normal)
- Exactly 1 sensor anomaly
- Water quality = POOR (no leak)
- Water quality = MODERATE **AND** leak detected

### NORMAL:
- Everything else

---

## 16. Sample MongoDB Output Document

```json
{
  "flowSensorData":          40,
  "pressureSensorData":      36,
  "tankLevelSensorData":     28,
  "turbiditySensorData":     56,
  "createdAt":               "2026-08-27T12:09:46.374Z",

  "mlPredictionData":        1,
  "mlProbability":           100.0,
  "mlSeverity":              "HIGH",

  "flowAnomaly":             "NORMAL",
  "pressureAnomaly":         "NORMAL",
  "tankLevelAnomaly":        "ABNORMAL",

  "waterQualityStatus":      "MODERATE",

  "waterLossRate":           51.08,
  "waterLossFlowLoss":       59.04,
  "waterLossVolumePerHour":  51.08,
  "waterLossVolume":         0.1419,
  "waterLossUnit":           "L/hr",

  "overallSystemStatus":     "CRITICAL",
  "mlProcessedAt":           "2026-08-27T17:03:47.378Z"
}
```

---

## 17. Results and Plots

After training, the following plots are saved to `results/leak_detection/`:

| File | Description |
|------|-------------|
| `confusion_matrix.png` | Actual vs Predicted (NORMAL / LEAK) |
| `feature_importance.png` | Which sensor matters most |
| `eda_sensor_distributions.png` | Histogram of each sensor |
| `eda_boxplots_by_class.png` | Sensor values split by NORMAL / LEAK |
| `eda_correlation_heatmap.png` | Feature correlations |
| `eda_class_distribution.png` | NORMAL vs LEAK record count |
| `eda_turbidity_distribution.png` | Turbidity with quality thresholds |

---

## 18. Limitations

| Limitation | Detail |
|------------|--------|
| Water loss formula | Based on training data means (67.8 / 69.8). Update `NORMAL_FLOW_MEAN` and `NORMAL_PRESSURE_MEAN` in `src/water_loss/train.py` if your sensor calibration differs. |
| Turbidity | Threshold-based only. No ML classifier — `UNKNOWN` if field is missing. |
| Anomaly detection | IsolationForest is unsupervised. Sensitivity depends on the contamination parameter. Tune in `config.py` if needed. |
| Water loss volume | Calculated as `rate ÷ 3600 × interval_seconds`. Accuracy depends on polling frequency. |
| No REST API | Python communicates exclusively through MongoDB. HTTP handling is done by the separate Node.js layer. |
| Time-series split | Uses `createdAt` for ordering. If missing, original Excel row order is used. |
| Overall status | Rule-based, not ML. Update `src/analytics/overall_status.py` if your business logic changes. |

---

## Quick Reference

```bash
# Install
pip install -r requirements.txt

# Configure
copy .env.example .env
# → edit .env with your MongoDB details

# Train (run once per dataset)
python src/pipeline/training_pipeline.py

# Monitor (run continuously)
python src/pipeline/prediction_pipeline.py

# Test on latest MongoDB record
python run_once_predict.py
```
