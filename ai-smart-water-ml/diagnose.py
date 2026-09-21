"""
diagnose.py — Model diagnostics
Checks training data distribution vs live data, and model decision boundaries.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import joblib
import numpy as np
import pandas as pd
from src.config.config import TRAINING_FILE, LEAK_MODEL_PATH
from src.data.excel_loader import load_training_data

print("\n" + "="*60)
print("  MODEL DIAGNOSTICS")
print("="*60)

# Load training data
df = load_training_data()
normal = df[df["predictionData"] == 0]
leak   = df[df["predictionData"] == 1]

print(f"\n  Training set: {len(df)} records")
print(f"  NORMAL: {len(normal)}  |  LEAK: {len(leak)}")

print(f"\n  NORMAL sensor ranges (actual training data):")
for col in ["flowSensorData","pressureSensorData","tankLevelSensorData"]:
    print(f"    {col}: min={normal[col].min():.1f}  max={normal[col].max():.1f}  mean={normal[col].mean():.1f}")

print(f"\n  LEAK sensor ranges (actual training data):")
for col in ["flowSensorData","pressureSensorData","tankLevelSensorData"]:
    print(f"    {col}: min={leak[col].min():.1f}  max={leak[col].max():.1f}  mean={leak[col].mean():.1f}")

# Load model
model = joblib.load(LEAK_MODEL_PATH)
print(f"\n  Model: {model}")
print(f"  Feature importances:")
for feat, imp in zip(["flowSensorData","pressureSensorData","tankLevelSensorData"], model.feature_importances_):
    print(f"    {feat}: {imp:.4f}")

# Test on samples that SHOULD be NORMAL based on your training data
print(f"\n  Test predictions on typical NORMAL-looking values:")
test_cases = [
    # flow, pressure, tank  — what the live data is showing
    [41,  46,  0],   # live record 1
    [41,  47,  68],  # live record 2
    [61,  64,  65],  # live record 10 - predicted NORMAL
    [50,  66,  41],  # live record 19 - predicted NORMAL
    [57,  66,  24],  # live record 21 - predicted NORMAL
    # some clearly normal-looking high values
    [80,  80,  80],
    [70,  70,  70],
    [60,  65,  75],
    # boundary checks
    [40,  40,  60],
    [30,  30,  50],
]
features = ["flowSensorData","pressureSensorData","tankLevelSensorData"]
X_test = pd.DataFrame(test_cases, columns=features)
preds = model.predict(X_test)
probas = model.predict_proba(X_test)

for i, (row, pred, proba) in enumerate(zip(test_cases, preds, probas)):
    label = "LEAK" if pred == 1 else "NORMAL"
    print(f"    Flow={row[0]:3d} Pressure={row[1]:3d} Tank={row[2]:3d}  →  {label}  (LEAK prob: {proba[1]*100:.1f}%)")

# Check decision tree paths — what does the model consider NORMAL?
print(f"\n  Scanning what values the model classifies as NORMAL...")
normal_count = 0
total_tested = 0
for flow in range(0, 100, 5):
    for pressure in range(0, 100, 5):
        for tank in range(0, 100, 5):
            total_tested += 1
            X = pd.DataFrame([[flow, pressure, tank]], columns=features)
            if model.predict(X)[0] == 0:
                normal_count += 1

print(f"    Out of {total_tested} grid points, {normal_count} ({normal_count/total_tested*100:.1f}%) classified as NORMAL")
print(f"    Remaining {total_tested - normal_count} ({(total_tested-normal_count)/total_tested*100:.1f}%) classified as LEAK")
print(f"\n  This tells us: the model has learned a {'very biased' if normal_count/total_tested < 0.3 else 'balanced'} decision boundary.")
