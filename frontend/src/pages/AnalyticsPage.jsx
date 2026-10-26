import React from "react";
import {
  Card,
  DataTable,
  Loading,
  Message,
  Metric,
  PageHeading,
  useLoad,
} from "../App";
import { api, number } from "../api";

export default function AnalyticsPage() {
  const { data, loading, error, reload } = useLoad(async () =>
    Promise.all([
      api("/dashboard/latest-analytics").catch(() => null),
      api("/dashboard/analytics-history").catch(() => []),
    ]).then(([latest, history]) => ({ latest, history }))
  );

  const d = data?.latest;

  return (
    <>
      <PageHeading
        title="Analytics"
        description="Daily consumption, leak loss and forecast."
        action={
          <button className="btn btn-light" onClick={() => reload()}>
            Refresh
          </button>
        }
      />
      <Message>{error}</Message>

      {loading && !data ? (
        <Loading />
      ) : !d ? (
        <Card>
          <p className="empty">No analytics data is available yet.</p>
        </Card>
      ) : (
        <>
          <div className="metric-grid four">
            <Metric
              label="Total consumption today"
              value={number(d.consumptionToday?.totalLitres, 2)}
              hint="Litres"
              color="blue"
            />
            <Metric
              label="Estimated loss today"
              value={number(d.consumptionToday?.estimatedLossL, 2)}
              hint="Litres"
              color="red"
            />
            <Metric
              label="Loss percentage"
              value={`${number(d.consumptionToday?.lossPercentage)}%`}
              hint="Of today's consumption"
              color="amber"
            />
            <Metric
              label="Predicted tomorrow"
              value={number(d.forecast?.predictedTomorrowLitres, 2)}
              hint="Litres"
              color="teal"
            />
          </div>

          <div className="metric-grid three">
            <Metric
              label="Leak status"
              value={d.leakAnalysis?.leakStatus}
              hint={
                d.leakAnalysis?.leakDetected
                  ? "Leak detected"
                  : "No leak detected"
              }
              color={d.leakAnalysis?.leakDetected ? "red" : "green"}
            />
            <Metric
              label="Estimated loss rate"
              value={number(d.lossAnalysis?.estimatedLossLPH, 2)}
              hint="Litres per hour"
              color="violet"
            />
            <Metric
              label="Expected loss tomorrow"
              value={number(d.forecast?.expectedLossLitres, 2)}
              hint="Litres"
              color="amber"
            />
          </div>

          <Card title="Recent analytics history">
            <DataTable
              columns={[
                { key: "date", label: "Date" },
                {
                  key: "liveSensor",
                  label: "Flow",
                  render: (r) => number(r.liveSensor?.flowRate),
                },
                { key: "leakAnalysis", label: "Leak", render: (r) => r.leakAnalysis?.leakStatus || "—" },
                {
                  key: "lossAnalysis",
                  label: "Loss (L/hr)",
                  render: (r) => number(r.lossAnalysis?.estimatedLossLPH, 2),
                },
                {
                  key: "consumptionToday",
                  label: "Consumption (L)",
                  render: (r) => number(r.consumptionToday?.totalLitres, 2),
                },
                {
                  key: "forecast",
                  label: "Forecast (L)",
                  render: (r) => number(r.forecast?.predictedTomorrowLitres, 2),
                },
              ]}
              rows={data.history || []}
            />
          </Card>
        </>
      )}
    </>
  );
}
