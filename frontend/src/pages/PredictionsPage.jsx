import React, { useState } from "react";
import {
  Badge,
  Card,
  DataTable,
  Loading,
  Message,
  Metric,
  PageHeading,
  Pagination,
  useLoad,
} from "../App";
import { api, formatDate, number } from "../api";

export default function PredictionsPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad(
    async () =>
      Promise.all([
        api("/ml-predictions/stats"),
        api(`/ml-predictions/history?limit=50&page=${page}`),
      ]).then(([stats, history]) => ({ stats, history })),
    [page]
  );

  return (
    <>
      <PageHeading
        title="ML predictions"
        description="Leak classification, anomalies, probability, and water-loss estimates."
        action={
          <button className="btn btn-light" onClick={() => reload()}>
            Refresh
          </button>
        }
      />
      <Message>{error}</Message>

      <div className="metric-grid four">
        <Metric label="Total predictions" value={data?.stats?.total} hint="Records" />
        <Metric
          label="Leak events"
          value={data?.stats?.leakCount}
          hint={`${data?.stats?.leakRate ?? 0}%`}
          color="red"
        />
        <Metric
          label="Critical alerts"
          value={data?.stats?.criticalCount}
          hint="Critical system readings"
          color="amber"
        />
        <Metric
          label="Average loss"
          value={number(data?.stats?.avgWaterLossRate, 2)}
          hint="L/hr"
          color="teal"
        />
      </div>

      <Card title="Prediction history">
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={[
                {
                  key: "mlProcessedAt",
                  label: "Timestamp",
                  render: (r) => formatDate(r.mlProcessedAt),
                },
                {
                  key: "flowSensorData",
                  label: "Flow",
                  render: (r) => number(r.flowSensorData),
                },
                {
                  key: "pressureSensorData",
                  label: "Pressure",
                  render: (r) => number(r.pressureSensorData),
                },
                {
                  key: "tankLevelSensorData",
                  label: "Tank",
                  render: (r) => number(r.tankLevelSensorData),
                },
                {
                  key: "mlPredictionData",
                  label: "Leak",
                  render: (r) => (
                    <Badge tone={r.mlPredictionData === 1 ? "red" : "green"}>
                      {r.mlPredictionData === 1 ? "Detected" : "Normal"}
                    </Badge>
                  ),
                },
                {
                  key: "mlProbability",
                  label: "Probability",
                  render: (r) => `${number(r.mlProbability)}%`,
                },
                { key: "mlSeverity", label: "Severity" },
                {
                  key: "overallSystemStatus",
                  label: "Status",
                  render: (r) => (
                    <Badge
                      tone={
                        r.overallSystemStatus === "CRITICAL"
                          ? "red"
                          : r.overallSystemStatus === "WARNING"
                          ? "amber"
                          : "green"
                      }
                    >
                      {r.overallSystemStatus}
                    </Badge>
                  ),
                },
                {
                  key: "waterLossRate",
                  label: "Loss (L/hr)",
                  render: (r) => number(r.waterLossRate, 2),
                },
              ]}
              rows={data?.history?.data || []}
            />
            <Pagination
              page={page}
              pages={data?.history?.pages || 1}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
