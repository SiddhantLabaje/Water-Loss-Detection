"""
retrain.py
----------
Force a clean retrain of all models on the full dataset,
then immediately validate predictions on live-data-like values.

Run with:
    python retrain.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.metrics import classification_report, confusion_matrix

from src.config.config import (
    TRAINING_FILE, TRAIN_RATIO,
    LEAK_FEATURES, TARGET_COLUMN,
    LEAK_MODEL_PATH, LEAK_METADATA_PATH,
    FLOW_ANOMALY_MODEL_PATH, PRESSURE_ANOMALY_MODEL_PATH, TANK_ANOMALY_MODEL_PATH,
    ANOMALY_FEATURES,
)
from src.data.excel_loader import load_training_data
from src.data.preprocessing import sort_chronologically, time_series_split

print("\n" + "="*60)
print("  RETRAINING ALL MODELS ON FULL DATASET")
print("="*60)

# ── Load & split ───────────────────────────────────────────
df = load_training_data()
print(f"\n  Total records: {len(df)}")
print(f"  Class balance:")
print(df[TARGET_COLUMN].value_counts().to_string())

df = sort_chronologically(df)
df_train, df_test = time_series_split(df, TRAIN_RATIO)

X_train = df_train[LEAK_FEATURES]
y_train = df_train[TARGET_COLUMN].astype(int)
X_test  = df_test[LEAK_FEATURES]
y_test  = df_test[TARGET_COLUMN].astype(int)

print(f"\n  Train: {len(X_train)}  |  Test: {len(X_test)}")
print(f"  Train NORMAL: {(y_train==0).sum()}  LEAK: {(y_train==1).sum()}")
print(f"  Test  NORMAL: {(y_test==0).sum()}   LEAK: {(y_test==1).sum()}")

# ── Train Random Forest Classifier ────────────────────────
print("\n" + "="*60)
print("  Training RandomForestClassifier...")
clf = RandomForestClassifier(n_estimators=200, random_state=42, class_weight="balanced", min_samples_leaf=2)
clf.fit(X_train, y_train)

y_pred = clf.predict(X_test)
print("\n  Classification Report (test set):")
print(classification_report(y_test, y_pred, target_names=["NORMAL","LEAK"]))
print("  Confusion Matrix:")
cm = confusion_matrix(y_test, y_pred)
print(f"              Predicted NORMAL  Predicted LEAK")
print(f"  Actual NORMAL     {cm[0][0]:5d}          {cm[0][1]:5d}")
print(f"  Actual LEAK       {cm[1][0]:5d}          {cm[1][1]:5d}")

print(f"\n  Feature importances:")
for feat, imp in zip(LEAK_FEATURES, clf.feature_importances_):
    print(f"    {feat}: {imp:.4f}")

# ── Save classifier ────────────────────────────────────────
LEAK_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
joblib.dump(clf, LEAK_MODEL_PATH)
print(f"\n  ✓ Classifier saved: {LEAK_MODEL_PATH}")

# ── Train Isolation Forest models ─────────────────────────
print("\n" + "="*60)
print("  Training Isolation Forest models (on NORMAL records only)...")

# Key fix: train anomaly detectors only on NORMAL training records
# so they learn what "normal" looks like cleanly
df_train_normal = df_train[df_train[TARGET_COLUMN] == 0]
print(f"  Using {len(df_train_normal)} NORMAL records for anomaly training")

model_paths = {
    "flow":       FLOW_ANOMALY_MODEL_PATH,
    "pressure":   PRESSURE_ANOMALY_MODEL_PATH,
    "tank_level": TANK_ANOMALY_MODEL_PATH,
}

for channel, cols in ANOMALY_FEATURES.items():
    available = [c for c in cols if c in df_train_normal.columns]
    X_iso = df_train_normal[available].dropna()
    print(f"\n  {channel} ({available}): {len(X_iso)} samples")
    iso = IsolationForest(n_estimators=200, contamination=0.05, random_state=42)
    iso.fit(X_iso)
    path = model_paths[channel]
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(iso, path)
    print(f"  ✓ Saved: {path}")

    # Quick check on test data
    X_test_iso = df_test[available].dropna()
    preds_iso = iso.predict(X_test_iso)
    n_abnormal = (preds_iso == -1).sum()
    print(f"    Test abnormal rate: {n_abnormal}/{len(X_test_iso)} = {n_abnormal/len(X_test_iso)*100:.1f}%")

# ── Validate on live-data-like values ─────────────────────
print("\n" + "="*60)
print("  VALIDATION — Testing model on values similar to your live data")
print("="*60)

test_cases = [
    # Your actual live records
    {"flow": 41,  "pressure": 46,  "tank": 0,   "note": "live record 1"},
    {"flow": 41,  "pressure": 47,  "tank": 68,  "note": "live record 2"},
    {"flow": 3,   "pressure": 16,  "tank": 68,  "note": "live record 4"},
    {"flow": 67,  "pressure": 28,  "tank": 37,  "note": "live record 6"},
    {"flow": 61,  "pressure": 64,  "tank": 65,  "note": "live record 10"},
    {"flow": 18,  "pressure": 72,  "tank": 63,  "note": "live record 12"},
    {"flow": 50,  "pressure": 66,  "tank": 41,  "note": "live record 19"},
    {"flow": 57,  "pressure": 66,  "tank": 24,  "note": "live record 21"},
    {"flow": 40,  "pressure": 36,  "tank": 28,  "note": "latest live record"},
    # What NORMAL looks like in training data
    {"flow": 75,  "pressure": 75,  "tank": 75,  "note": "typical NORMAL (training mean)"},
    {"flow": 68,  "pressure": 70,  "tank": 70,  "note": "typical NORMAL"},
    {"flow": 60,  "pressure": 65,  "tank": 70,  "note": "mid-range"},
]

print(f"\n  {'Flow':>6}  {'Press':>6}  {'Tank':>6}  {'Prediction':>10}  {'Prob':>6}  Note")
print(f"  {'─'*6}  {'─'*6}  {'─'*6}  {'─'*10}  {'─'*6}  {'─'*30}")

for tc in test_cases:
    X = pd.DataFrame([[tc["flow"], tc["pressure"], tc["tank"]]], columns=LEAK_FEATURES)
    pred  = clf.predict(X)[0]
    proba = clf.predict_proba(X)[0][1]
    label = "LEAK" if pred == 1 else "NORMAL"
    flag  = "⚠" if pred == 1 else "✓"
    print(f"  {tc['flow']:6}  {tc['pressure']:6}  {tc['tank']:6}  {flag} {label:>8}  {proba*100:5.1f}%  {tc['note']}")

# ── What the model now considers NORMAL ───────────────────
print(f"\n  Decision boundary scan (0–100 grid, step 5):")
normal_count = 0
total = 0
for flow in range(0, 105, 5):
    for pressure in range(0, 105, 5):
        for tank in range(0, 105, 5):
            total += 1
            X = pd.DataFrame([[flow, pressure, tank]], columns=LEAK_FEATURES)
            if clf.predict(X)[0] == 0:
                normal_count += 1
print(f"  NORMAL: {normal_count}/{total} = {normal_count/total*100:.1f}%")
print(f"  LEAK:   {total-normal_count}/{total} = {(total-normal_count)/total*100:.1f}%")

print(f"\n  ✓ Retrain complete. Models saved to models/")
print(f"  Now run: python src/pipeline/prediction_pipeline.py")
