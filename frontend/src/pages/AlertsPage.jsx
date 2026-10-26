import React, { useState } from "react";
import {
  Badge,
  Card,
  Loading,
  Message,
  PageHeading,
  useLoad,
} from "../App";
import { api, formatDate, number } from "../api";
import { useSession } from "../App";

export default function AlertsPage() {
  const { user } = useSession();
  const [limit, setLimit] = useState(25);
  const { data, error, reload } = useLoad(
    async () =>
      Promise.all([
        api(`/ml-predictions/alerts?limit=${limit}`),
        user.role === "admin"
          ? api("/notifications/settings").catch(() => ({}))
          : Promise.resolve({}),
      ]).then(([alerts, settings]) => ({ alerts, settings })),
    [limit, user.role]
  );

  const [message, setMessage] = useState("");

  return (
    <>
      <PageHeading
        title="Alerts"
        description="Critical and warning events from the ML pipeline."
        action={
          <>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="btn btn-light"
            >
              <option value={10}>Last 10</option>
              <option value={25}>Last 25</option>
              <option value={50}>Last 50</option>
              <option value={100}>Last 100</option>
            </select>
            <button className="btn btn-light" onClick={() => reload()}>
              Refresh
            </button>
          </>
        }
      />
      <Message>{error}</Message>
      <Message kind="success">{message}</Message>

      <Card title="Recent alerts">
        {data?.alerts ? (
          <div className="list-stack">
            {data.alerts.map((alert, i) => (
              <div className="alert-item" key={alert._id || i}>
                <Badge
                  tone={
                    alert.overallSystemStatus === "CRITICAL"
                      ? "red"
                      : alert.overallSystemStatus === "WARNING"
                      ? "amber"
                      : "green"
                  }
                >
                  {alert.overallSystemStatus}
                </Badge>
                <span>
                  {alert.mlPredictionData === 1 ? "🚨 Leak detected" : "⚠️  Warning"}
                </span>
                <span>Probability: {number(alert.mlProbability)}%</span>
                <span>Loss: {number(alert.waterLossRate, 2)} L/hr</span>
                <time>{formatDate(alert.mlProcessedAt)}</time>
              </div>
            ))}
          </div>
        ) : (
          <Loading />
        )}
      </Card>
    </>
  );
}
