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

export default function SensorsPage({ raw = false }) {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad(
    async () =>
      Promise.all([
        api("/sensors/latest").catch(() => null),
        api(`/sensors/sensor-data?limit=50&page=${page}`),
      ]).then(([latest, history]) => ({ latest, history })),
    [page]
  );

  return (
    <>
      <PageHeading
        title={raw ? "Sensor data" : "Sensor readings"}
        description="Live values and historical sensor records."
        action={
          <button className="btn btn-light" onClick={() => reload()}>
            Refresh
          </button>
        }
      />
      <Message>{error}</Message>

      {!raw && (
        <div className="metric-grid four">
          {[
            ["Flow rate", data?.latest?.flowSensorData, "L/min", "blue"],
            ["Pressure", data?.latest?.pressureSensorData, "PSI", "violet"],
            ["Tank level", data?.latest?.tankLevelSensorData, "%", "teal"],
            ["Turbidity", data?.latest?.turbiditySensorData, "NTU", "amber"],
          ].map(([label, value, unit, color]) => (
            <Metric
              key={label}
              label={label}
              value={number(value)}
              hint={unit}
              color={color}
            />
          ))}
        </div>
      )}

      <Card title="Sensor history">
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={[
                { key: "entryId", label: "Entry" },
                { key: "flowSensorData", label: "Flow (L/min)" },
                { key: "pressureSensorData", label: "Pressure (PSI)" },
                { key: "tankLevelSensorData", label: "Tank (%)" },
                { key: "turbiditySensorData", label: "Turbidity (NTU)" },
                {
                  key: "predictionData",
                  label: "Detection",
                  render: (r) => (
                    <Badge tone={r.predictionData === 1 ? "red" : "green"}>
                      {r.predictionData === 1 ? "Leak" : "Normal"}
                    </Badge>
                  ),
                },
                {
                  key: "createdAt",
                  label: "Recorded",
                  render: (r) => formatDate(r.createdAt),
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
