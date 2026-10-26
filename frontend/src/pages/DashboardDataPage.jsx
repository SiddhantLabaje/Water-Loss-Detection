import React from "react";
import { Card, Loading, Message, PageHeading, useLoad } from "../App";
import { api } from "../api";

export default function DashboardDataPage() {
  const { data, loading, error, reload } = useLoad(() =>
    api("/dashboard/latest-analytics")
  );

  return (
    <>
      <PageHeading
        title="Dashboard Data"
        description="Latest daily analytics record."
        action={
          <button className="btn btn-light" onClick={() => reload()}>
            Refresh
          </button>
        }
      />
      <Message>{error}</Message>

      {loading && !data ? (
        <Loading />
      ) : (
        <Card title="Latest Analytics">
          <pre style={{ fontSize: "12px", overflow: "auto" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>
      )}
    </>
  );
}
