import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from src.data.excel_loader import load_training_data
import numpy as np

df = load_training_data()
print(f"\nColumns: {list(df.columns)}")
print(f"\nFirst 5 rows:")
print(df.head().to_string())
print(f"\nLeak records sample:")
print(df[df["predictionData"]==1][["flowSensorData","pressureSensorData","tankLevelSensorData"]].head(10).to_string())
print(f"\nNormal records sample:")
print(df[df["predictionData"]==0][["flowSensorData","pressureSensorData","tankLevelSensorData"]].head(10).to_string())
print(f"\nFlow stats for LEAK:   min={df[df.predictionData==1].flowSensorData.min():.1f}  max={df[df.predictionData==1].flowSensorData.max():.1f}  mean={df[df.predictionData==1].flowSensorData.mean():.1f}")
print(f"Flow stats for NORMAL: min={df[df.predictionData==0].flowSensorData.min():.1f}  max={df[df.predictionData==0].flowSensorData.max():.1f}  mean={df[df.predictionData==0].flowSensorData.mean():.1f}")
print(f"\nPressure stats for LEAK:   min={df[df.predictionData==1].pressureSensorData.min():.1f}  max={df[df.predictionData==1].pressureSensorData.max():.1f}  mean={df[df.predictionData==1].pressureSensorData.mean():.1f}")
print(f"Pressure stats for NORMAL: min={df[df.predictionData==0].pressureSensorData.min():.1f}  max={df[df.predictionData==0].pressureSensorData.max():.1f}  mean={df[df.predictionData==0].pressureSensorData.mean():.1f}")
