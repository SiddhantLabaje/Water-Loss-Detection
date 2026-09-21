# Training Data

Place your Excel training dataset here.

## Expected Filename
`water_sensor_data.xlsx`  
*(You can override this in `.env` with `TRAINING_FILE=path/to/your/file.xlsx`)*

---

## Required Columns — these 6 are all you need

| Column | Type | Description |
|--------|------|-------------|
| `flowSensorData` | float | Flow sensor reading |
| `pressureSensorData` | float | Pressure sensor reading |
| `tankLevelSensorData` | float | Tank level sensor reading (0–100) |
| `turbiditySensorData` | float | Turbidity / water clarity reading |
| `predictionData` | int | Ground truth label — **0 = NORMAL, 1 = LEAK** |
| `createdAt` | datetime | Timestamp of the reading |

> **You do NOT need a `waterLossRate` column.**  
> The water-loss regressor is always trained automatically.  
> The system calculates the training target from `flowSensorData` and `pressureSensorData`  
> using the three hydraulic formulas — no extra column needed.

---

## Optional Column

Only add this if your hardware physically measures water-loss rate:

| Column | Type | Description |
|--------|------|-------------|
| `waterLossRate` | float | Real measured water-loss rate in L/hr |

- If **present and valid** → regressor trains on your real measurements
- If **absent** → system derives the target automatically using the formulas

---

## Example Rows

```
flowSensorData | pressureSensorData | tankLevelSensorData | turbiditySensorData | predictionData | createdAt
72.5           | 68.3               | 80.1                | 18.2                | 0              | 2026-01-01 00:00:00
40.0           | 36.0               | 28.0                | 56.0                | 1              | 2026-01-01 00:05:00
```

---

## Notes
- ~1000–5000 records recommended
- Records are split **chronologically** — 80% oldest → train, 20% newest → test
- Column names are **case-sensitive** — must match exactly as shown above
- `predictionData` must contain **only 0 or 1** — no other values allowed
