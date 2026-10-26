import React from "react";
import {
  Badge,
  Card,
  Loading,
  Message,
  Metric,
  PageHeading,
  useLoad,
  useLiveReload,
} from "../App";
import { api, formatDate, number } from "../api";

export default function MonitoringPage() {
  const { data, loading, error, reload } = useLoad(async () => {
    const results = await Promise.all([
      api("/ml-predictions/latest").catch(() => null),
      api("/sensors/latest").catch(() => null),
      api("/ml-predictions/stats").catch(() => null),
      api("/ml-predictions/alerts?limit=8").catch(() => []),
    ]);
    return {
      latest: results[0],
      sensor: results[1],
      stats: results[2],
      alerts: results[3],
    };
  });

  useLiveReload(reload);

  if (loading && !data) return <Loading />;

  const d = data || {};
  const p = d.latest || {};
  const sensor = d.sensor || p;
  const critical = p.overallSystemStatus === "CRITICAL" && p.mlPredictionData === 1;

  return (
    <>
      <PageHeading
        title="Live monitoring"
        description="Current sensor values and ML detection status."
        action={
          <button className="btn btn-light" onClick={() => reload()}>
            Refresh
          </button>
        }
      />
      <Message>{error}</Message>

      {p.overallSystemStatus && (
        <div
          className={`alert-strip ${
            critical
              ? "alert-critical"
              : p.overallSystemStatus === "WARNING"
              ? "alert-warning"
              : "alert-normal"
          }`}
        >
          <strong>
            {critical ? "CRITICAL LEAK ALERT" : `${p.overallSystemStatus} SYSTEM STATUS`}
          </strong>
          <span>
            Leak {p.mlPredictionData === 1 ? "detected" : "not detected"} · Probability{" "}
            {number(p.mlProbability)}% · Loss {number(p.waterLossRate, 2)} L/hr · Updated{" "}
            {formatDate(p.mlProcessedAt)}
          </span>
        </div>
      )}

      <div className="metric-grid four">
        <Metric
          label="Flow rate"
          value={number(sensor?.flowSensorData)}
          hint="Litres per minute"
          color="blue"
        />
        <Metric
          label="Pressure"
          value={number(sensor?.pressureSensorData)}
          hint="PSI"
          color="violet"
        />
        <Metric
          label="Tank level"
          value={number(sensor?.tankLevelSensorData)}
          hint="Percent full"
          color="teal"
        />
        <Metric
          label="Turbidity"
          value={number(sensor?.turbiditySensorData)}
          hint="NTU"
          color="amber"
        />
      </div>

      <div className="metric-grid three">
        <Metric label="Predictions" value={d.stats?.total} hint="Total records" />
        <Metric
          label="Leak events"
          value={d.stats?.leakCount}
          hint={`${d.stats?.leakRate ?? 0}% of records`}
          color="red"
        />
        <Metric
          label="Average loss"
          value={number(d.stats?.avgWaterLossRate, 2)}
          hint="Litres per hour"
          color="teal"
        />
      </div>

      <Card title="Recent alerts">
        <AlertList items={d.alerts || []} />
      </Card>
    </>
  );
}

function AlertList({ items }) {
  return items.length ? (
    <div className="list-stack">
      {items.map((a, i) => (
        <div className="list-row" key={a._id || i}>
          <Badge tone={a.overallSystemStatus === "CRITICAL" ? "red" : "amber"}>
            {a.overallSystemStatus}
          </Badge>
          <span>
            {a.mlPredictionData === 1 ? "Leak detected" : "System warning"}
          </span>
          <span>{number(a.mlProbability)}% probability</span>
          <time>{formatDate(a.mlProcessedAt)}</time>
        </div>
      ))}
    </div>
  ) : (
    <p className="empty">No alerts found.</p>
  );
}
