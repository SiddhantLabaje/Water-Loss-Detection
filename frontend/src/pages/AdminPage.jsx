import React, { useEffect, useRef, useState } from "react";
import { api, post, patch, formatDate, number } from "../api";
import { useLoad, useLiveReload, PageHeading, Card, Badge, Loading, Message } from "../App";

// ── helpers ──────────────────────────────────────────────────────────────
const sevColor = (s) =>
  s === "HIGH" ? "var(--danger)" : s === "MEDIUM" ? "var(--warning)" : "var(--success)";

const STATUS_TONE = {
  OPEN_FOR_PROPOSALS: "amber",
  ASSIGNED: "blue",
  REPAIR_IN_PROGRESS: "blue",
  VERIFYING_RECOVERY: "amber",
  RECOVERY_FAILED: "red",
  RECOVERED: "green",
  DETECTED: "gray",
  CANCELLED: "gray",
};

function statusBadge(s) {
  return (
    <Badge tone={STATUS_TONE[s] || "gray"}>{s.replace(/_/g, " ")}</Badge>
  );
}

// ── KPI cards ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = "blue" }) {
  return (
    <div className={`kpi-card kpi-${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value ?? "—"}</div>
      <div className="kpi-unit">{sub}</div>
    </div>
  );
}

// ── Proposals panel ───────────────────────────────────────────────────────
function ProposalsPanel({ incidentId, onAssigned }) {
  const { data, loading, error } = useLoad(
    () => api(`/admin/leaks/${incidentId}/proposals`),
    [incidentId]
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function assign(proposalId) {
    if (!window.confirm("Assign this plumber? All other proposals will be marked as not selected.")) return;
    setBusy(true);
    try {
      await post(`/admin/leaks/${incidentId}/assign`, { proposalId });
      setMsg("Plumber assigned. They will receive an email notification.");
      onAssigned?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="pp-wrap"><Loading text="Loading proposals…" /></div>;
  if (error) return <div className="pp-wrap"><Message>{error}</Message></div>;

  const sorted = [...(data || [])].sort(
    (a, b) => (a.totalEstimatedCharges || 0) - (b.totalEstimatedCharges || 0)
  );

  return (
    <div className="proposals-panel">
      <div className="pp-title">
        📋 {sorted.length} proposal{sorted.length !== 1 ? "s" : ""} received — compare and assign
      </div>
      {msg && (
        <div style={{ padding: "10px 18px" }}>
          <Message kind={msg.includes("Plumber assigned") ? "success" : "error"}>{msg}</Message>
        </div>
      )}
      {sorted.length === 0 ? (
        <div className="pp-empty">No proposals yet — plumbers will see this incident and submit estimates.</div>
      ) : (
        sorted.map((p, i) => {
          const avail = p.earliestAvailability
            ? new Date(p.earliestAvailability).toLocaleDateString()
            : "—";
          return (
            <div className="proposal-row" key={p._id}>
              <div className="pr-left">
                <div className="pr-name">{p.plumberId?.name || "Unknown plumber"}</div>
                <div className="pr-method">{p.repairMethod}</div>
                <div className="pr-costs">
                  <span>Labour: <strong>₹{p.labourCharges}</strong></span>
                  <span>Materials: <strong>₹{p.materialCharges}</strong></span>
                  {p.visitCharges > 0 && <span>Visit: <strong>₹{p.visitCharges}</strong></span>}
                  {p.otherCharges > 0 && <span>Other: <strong>₹{p.otherCharges}</strong></span>}
                  <span>Duration: <strong>{p.estimatedDurationHours} hrs</strong></span>
                  <span>Available: <strong>{avail}</strong></span>
                </div>
                {p.warrantyDetails && (
                  <div className="pr-warranty">Warranty: {p.warrantyDetails}</div>
                )}
                {p.plumberProfile && (
                  <div className="pr-profile">
                    {p.plumberProfile.city}{p.plumberProfile.state ? `, ${p.plumberProfile.state}` : ""} ·{" "}
                    {p.plumberProfile.experienceYears || 0} yrs · Skills:{" "}
                    {(p.plumberProfile.skills || []).join(", ") || "Not specified"}
                  </div>
                )}
              </div>
              <div className="pr-assign-col">
                <div className="pr-total">₹{p.totalEstimatedCharges}</div>
                {i === 0 && sorted.length > 1 && (
                  <div className="pr-best">Lowest cost</div>
                )}
                {p.status === "submitted" ? (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => assign(p._id)}
                    style={{ fontSize: "12px", padding: "6px 12px" }}
                  >
                    Assign this plumber
                  </button>
                ) : (
                  statusBadge(p.status)
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Incident card ─────────────────────────────────────────────────────────
function IncidentCard({ leak, onAction }) {
  const [showProposals, setShowProposals] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOpen = leak.status === "OPEN_FOR_PROPOSALS";
  const sev = (leak.severity || "").toUpperCase();
  const ss = leak.sensorSnapshot || {};
  const isCritical = ss.overallSystemStatus === "CRITICAL";
  const det = ss.detectedAt ? new Date(ss.detectedAt).toLocaleString() : "Unknown";

  async function doAction(action) {
    setBusy(true);
    try {
      if (action === "open") {
        await patch(`/admin/leaks/${leak._id}/status`, {
          status: "OPEN_FOR_PROPOSALS",
          reason: "Administrator opened for proposals.",
        });
      } else if (action === "cancel") {
        if (!window.confirm("Cancel this incident?")) return;
        await patch(`/admin/leaks/${leak._id}/status`, {
          status: "CANCELLED",
          reason: "Cancelled by administrator.",
        });
      } else if (action === "verify") {
        const result = await post(`/repairs/${leak._id}/verify-recovery`, {});
        onAction?.({ message: result.message, ok: result.recovered });
        return;
      } else if (action === "retry-verify") {
        await patch(`/admin/leaks/${leak._id}/status`, {
          status: "VERIFYING_RECOVERY",
          reason: "Admin requested retry.",
        });
        const result = await post(`/repairs/${leak._id}/verify-recovery`, {});
        onAction?.({ message: result.message, ok: result.recovered });
        return;
      }
      onAction?.({ reload: true });
    } catch (e) {
      onAction?.({ message: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  const cardStyle = {
    borderLeft: isOpen && isCritical
      ? "4px solid var(--danger)"
      : isOpen
      ? "4px solid var(--warning)"
      : undefined,
  };

  return (
    <div className="incident-card" style={cardStyle}>
      <div className="ic-head">
        <div>
          <div className="ic-title">
            {leak.incidentId}
            {isCritical && (
              <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 800, marginLeft: 8 }}>
                🚨 CRITICAL ALERT
              </span>
            )}
            &nbsp;
            <span style={{ color: sevColor(sev), fontSize: 13 }}>{sev} severity</span>
          </div>
          <div className="ic-meta">
            <span>🕐 Detected: {det}</span>
            <span>📍 {statusBadge(leak.status)}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {isOpen && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", marginBottom: 4 }}>
              ⚠ Needs plumber assignment
            </div>
          )}
          {statusBadge(leak.status)}
        </div>
      </div>

      <div className="ic-sensors">
        {[
          [ss.flowSensorData, "Flow (L/min)"],
          [ss.pressureSensorData, "Pressure (PSI)"],
          [ss.tankLevelSensorData, "Tank level (%)"],
          [ss.waterLossRate != null ? Number(ss.waterLossRate).toFixed(2) : null, "Water loss (L/hr)"],
        ].map(([val, unit], i) => (
          <div
            className="sensor-box"
            key={unit}
            style={
              i === 3 && sev === "HIGH"
                ? { borderColor: "var(--danger-bd)", background: "var(--danger-bg)" }
                : undefined
            }
          >
            <div
              className="sb-val"
              style={i === 3 && sev === "HIGH" ? { color: "var(--danger)" } : undefined}
            >
              {val ?? "—"}
            </div>
            <div className="sb-unit">{unit}</div>
          </div>
        ))}
      </div>

      <div className="ic-actions">
        {leak.status === "DETECTED" && (
          <button className="btn" disabled={busy} onClick={() => doAction("open")}
            style={{ background: "var(--warning)" }}>
            Open for proposals
          </button>
        )}
        {isOpen && (
          <button className="btn" onClick={() => setShowProposals((v) => !v)}>
            🔧 {showProposals ? "Hide proposals" : "View proposals & assign plumber"}
          </button>
        )}
        {leak.status === "VERIFYING_RECOVERY" && (
          <button className="btn" disabled={busy} onClick={() => doAction("verify")}
            style={{ background: "var(--success)" }}>
            ✔ Verify recovery
          </button>
        )}
        {leak.status === "RECOVERY_FAILED" && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => doAction("retry-verify")}>
            Retry recovery check
          </button>
        )}
        {isOpen && (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => doAction("cancel")}
            style={{ color: "var(--danger)", borderColor: "var(--danger-bd)" }}
          >
            Cancel incident
          </button>
        )}
      </div>

      {showProposals && (
        <ProposalsPanel
          incidentId={leak._id}
          onAssigned={() => {
            setShowProposals(false);
            onAction?.({ reload: true });
          }}
        />
      )}
    </div>
  );
}

// ── Main AdminPage ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const [leakFilter, setLeakFilter] = useState("OPEN_FOR_PROPOSALS");
  const [plumberFilter, setPlumberFilter] = useState("pending");
  const [pageMsg, setPageMsg] = useState({ text: "", ok: false });

  // Dashboard summary
  const { data: dashboard, reload: reloadDash } = useLoad(() => api("/admin/dashboard"));

  // Leaks
  const {
    data: leaksData,
    loading: leaksLoading,
    reload: reloadLeaks,
  } = useLoad(
    () =>
      api(
        `/admin/leaks?limit=100${leakFilter ? `&status=${encodeURIComponent(leakFilter)}` : ""}`
      ),
    [leakFilter]
  );

  // Assignments
  const { data: assignmentsData, reload: reloadAssignments } = useLoad(() =>
    api("/admin/assignments?limit=50")
  );

  // Plumbers
  const { data: plumbersData, reload: reloadPlumbers } = useLoad(
    () => api(`/admin/plumbers?status=${encodeURIComponent(plumberFilter)}`),
    [plumberFilter]
  );

  // Audit log
  const { data: auditData } = useLoad(() => api("/admin/audit-logs?limit=15"));

  // Notification settings
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerMsg, setOwnerMsg] = useState({ text: "", ok: false });

  useEffect(() => {
    api("/notifications/settings")
      .then((s) => {
        setOwnerName(s.ownerName || "");
        setOwnerEmail(s.ownerEmail || "");
      })
      .catch(() => {});
  }, []);

  useLiveReload(() => {
    reloadDash();
    reloadLeaks();
  });

  const c = dashboard?.counts || {};
  const p = dashboard?.latestPrediction;
  const openCount = dashboard?.leaks?.openForProposals || 0;

  async function handlePlumberAction(profileId, action) {
    try {
      if (action === "approve" || action === "reject") {
        await patch(`/admin/plumbers/${profileId}/approval`, {
          status: action === "approve" ? "approved" : "rejected",
        });
      } else {
        await patch(`/admin/plumbers/${profileId}/status`, {
          status: action === "suspend" ? "suspended" : "active",
        });
      }
      setPageMsg({ text: "Updated successfully.", ok: true });
      reloadPlumbers();
      reloadDash();
    } catch (e) {
      setPageMsg({ text: e.message, ok: false });
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const v = Object.fromEntries(new FormData(form));
      const result = await post("/admin/plumbers", {
        ...v,
        serviceRadiusKm: Number(v.serviceRadiusKm) || 25,
        experienceYears: Number(v.experienceYears) || 0,
        skills: v.skillsText
          ? v.skillsText.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      });
      setPageMsg({ text: result.message, ok: true });
      form.reset();
      reloadPlumbers();
    } catch (e) {
      setPageMsg({ text: e.message, ok: false });
    } finally {
      btn.disabled = false;
    }
  }

  async function handleOwnerSave(e) {
    e.preventDefault();
    try {
      const result = await api("/notifications/settings", {
        method: "PUT",
        body: JSON.stringify({ ownerName, ownerEmail }),
      });
      setOwnerMsg({ text: result.message, ok: true });
    } catch (e) {
      setOwnerMsg({ text: e.message, ok: false });
    }
  }

  const ASSIGN_BADGE = {
    assigned: "amber",
    accepted: "blue",
    in_progress: "blue",
    completed: "green",
    reassigned: "gray",
  };

  const STATUS_BADGE_PLUMBER = {
    pending: "amber",
    approved: "green",
    rejected: "gray",
    suspended: "gray",
  };

  return (
    <>
      <PageHeading
        title="Administration"
        description="Leak incidents · Plumber management · Assignments"
        action={
          <button
            className="btn btn-light"
            onClick={() => {
              reloadDash();
              reloadLeaks();
              reloadAssignments();
              reloadPlumbers();
            }}
          >
            ↻ Refresh
          </button>
        }
      />

      {pageMsg.text && (
        <Message kind={pageMsg.ok ? "success" : "error"}>{pageMsg.text}</Message>
      )}

      {/* KPI grid */}
      <div className="g4">
        {[
          ["Sensors", "Total monitored", c.sensors, "blue"],
          ["Leaks", "Total incidents", c.leakIncidents, "red"],
          ["Pending plumbers", "Awaiting approval", c.pendingPlumbers, "amber"],
          ["Open proposals", "Submitted by plumbers", c.submittedProposals, "violet"],
          ["Active assignments", "In progress", c.activeAssignments, "teal"],
          ["Awaiting verification", "Recovery checks needed", c.repairsAwaitingVerification, "amber"],
          ["Recovered", "Successfully resolved", c.recoveredIncidents, "green"],
        ].map(([label, sub, value, color]) => (
          <KpiCard key={label} label={label} sub={sub} value={value} color={color} />
        ))}
        {p && (
          <div className="card" style={{ fontSize: 12, color: "var(--muted)" }}>
            Last prediction:{" "}
            {p.mlProcessedAt ? new Date(p.mlProcessedAt).toLocaleString() : "—"} · Status:{" "}
            <strong>{p.overallSystemStatus}</strong>
          </div>
        )}
      </div>

      {/* Critical banner */}
      {openCount > 0 && (
        <div className="alert-banner">
          <div>
            <h3>🚨 Leak detected — action required</h3>
            <p>
              {openCount} incident{openCount > 1 ? "s are" : " is"} open for proposals. Review
              sensor data below and assign a plumber.
            </p>
          </div>
          <button
            className="btn"
            style={{ background: "var(--danger)", flexShrink: 0 }}
            onClick={() => setLeakFilter("OPEN_FOR_PROPOSALS")}
          >
            View incidents &amp; assign →
          </button>
        </div>
      )}

      {/* Leak incidents */}
      <section>
        <div className="sec-header">
          <span className="sec-title">Leak incidents</span>
          <select
            value={leakFilter}
            onChange={(e) => setLeakFilter(e.target.value)}
            aria-label="Filter incidents"
          >
            <option value="OPEN_FOR_PROPOSALS">Open for proposals</option>
            <option value="">All incidents</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="REPAIR_IN_PROGRESS">In progress</option>
            <option value="VERIFYING_RECOVERY">Verifying recovery</option>
            <option value="RECOVERED">Recovered</option>
            <option value="DETECTED">Detected</option>
          </select>
        </div>
        {leaksLoading ? (
          <Loading />
        ) : (leaksData?.data || []).length === 0 ? (
          <Card>
            <p className="empty">No incidents found for this filter.</p>
          </Card>
        ) : (
          <div className="stack">
            {(leaksData.data || []).map((leak) => (
              <IncidentCard
                key={leak._id}
                leak={leak}
                onAction={({ reload, message, ok } = {}) => {
                  if (message) setPageMsg({ text: message, ok: !!ok });
                  if (reload) {
                    reloadLeaks();
                    reloadAssignments();
                    reloadDash();
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Active assignments */}
      <section>
        <div className="sec-header">
          <span className="sec-title">Active assignments</span>
        </div>
        <div className="stack">
          {(assignmentsData?.data || []).length === 0 ? (
            <Card>
              <p className="empty">No active assignments.</p>
            </Card>
          ) : (
            (assignmentsData.data || []).map((item) => {
              const inc = item.incidentId || {};
              return (
                <div className="assign-card" key={item._id}>
                  <div className="ac-head">
                    <strong>
                      {inc.incidentId || "Incident"} · {(inc.severity || "").toUpperCase()} severity
                    </strong>
                    <Badge tone={ASSIGN_BADGE[item.status] || "gray"}>
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <strong>Plumber:</strong> {item.plumberId?.name || "—"} &nbsp;
                    <strong>Total:</strong> ₹
                    {item.selectedProposalId?.totalEstimatedCharges ?? "—"} &nbsp;
                    <strong>Assigned:</strong>{" "}
                    {item.assignedAt ? new Date(item.assignedAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Plumber management */}
      <section>
        <div className="sec-header">
          <span className="sec-title">Plumber approvals</span>
          <select
            value={plumberFilter}
            onChange={(e) => setPlumberFilter(e.target.value)}
          >
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="stack">
          {(plumbersData?.data || []).length === 0 ? (
            <Card>
              <p className="empty">No plumbers in this status.</p>
            </Card>
          ) : (
            (plumbersData.data || []).map((profile) => {
              const user = profile.userId || {};
              const st = profile.approvalStatus;
              return (
                <div className="plumber-card" key={profile._id}>
                  <div className="pc-info">
                    <h3>
                      {user.name || "—"}{" "}
                      <Badge tone={STATUS_BADGE_PLUMBER[st] || "gray"} style={{ marginLeft: 6 }}>
                        {st}
                      </Badge>
                    </h3>
                    <p>
                      {user.email} · {profile.phone || "—"}
                    </p>
                    <p>
                      {profile.city || ""}, {profile.state || ""} · {profile.experienceYears || 0} yrs ·{" "}
                      {(profile.skills || []).join(", ") || "—"}
                    </p>
                  </div>
                  <div className="pc-actions">
                    {st === "pending" && (
                      <>
                        <button
                          className="btn"
                          style={{ background: "var(--success)" }}
                          onClick={() => handlePlumberAction(profile._id, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ color: "var(--danger)", borderColor: "var(--danger-bd)" }}
                          onClick={() => handlePlumberAction(profile._id, "reject")}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {st === "approved" && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => handlePlumberAction(profile._id, "suspend")}
                      >
                        Suspend
                      </button>
                    )}
                    {st === "suspended" && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => handlePlumberAction(profile._id, "reactivate")}
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Invite plumber */}
      <section>
        <div className="sec-header">
          <span className="sec-title">Invite trusted plumber</span>
        </div>
        <Card>
          <form className="form-grid" onSubmit={handleInvite}>
            {[
              ["Name", "name", "text", true, 2, 100],
              ["Email", "email", "email", true, null, 254],
              ["Phone", "phone", "tel", true, 7, 30],
              ["City", "city", "text", true, null, 100],
              ["State / region", "state", "text", true, null, 100],
              ["Service radius (km)", "serviceRadiusKm", "number", true, null, null],
              ["Experience (years)", "experienceYears", "number", false, null, null],
              ["Skills (comma separated)", "skillsText", "text", false, null, null],
            ].map(([label, name, type, required, min, max]) => (
              <label key={name} style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
                {label}
                <input
                  name={name}
                  type={type}
                  required={required}
                  minLength={min}
                  maxLength={max}
                  defaultValue={name === "serviceRadiusKm" ? 25 : name === "experienceYears" ? 0 : undefined}
                  style={{ padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", font: "inherit" }}
                />
              </label>
            ))}
            <label style={{ gridColumn: "1/-1", display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
              Address
              <input
                name="address"
                maxLength={200}
                style={{ padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", font: "inherit" }}
              />
            </label>
            <button className="btn" type="submit" style={{ gridColumn: "1/-1" }}>
              Send invitation
            </button>
          </form>
        </Card>
      </section>

      {/* Owner email */}
      <section>
        <div className="sec-header">
          <span className="sec-title">Critical alert email recipient</span>
        </div>
        <Card>
          <p style={{ marginBottom: 14, fontSize: 13, color: "var(--muted)" }}>
            This address receives critical leak alerts via email.
          </p>
          <form
            className="form-grid"
            onSubmit={handleOwnerSave}
          >
            <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
              Owner name
              <input
                type="text"
                required
                maxLength={100}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", font: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
              Owner email
              <input
                type="email"
                required
                maxLength={254}
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", font: "inherit" }}
              />
            </label>
            <button className="btn" type="submit" style={{ gridColumn: "1/-1" }}>
              Save
            </button>
          </form>
          {ownerMsg.text && (
            <Message kind={ownerMsg.ok ? "success" : "error"}>{ownerMsg.text}</Message>
          )}
        </Card>
      </section>

      {/* Audit log */}
      <section>
        <div className="sec-header">
          <span className="sec-title">Recent activity</span>
        </div>
        <div className="stack">
          {(auditData?.data || []).length === 0 ? (
            <Card>
              <p className="empty">No audit entries yet.</p>
            </Card>
          ) : (
            (auditData.data || []).map((r) => (
              <Card key={r._id}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>{r.action}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {r.actorUserId?.name || "System"} · {r.entityType || ""} {r.entityId || ""}
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <style>{`
        .stack { display: grid; gap: 12px; }
        .sec-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .sec-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
        .g4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
        @media(max-width:1200px) { .g4 { grid-template-columns: repeat(2,1fr); } }
        @media(max-width:600px)  { .g4 { grid-template-columns: 1fr; } }

        .alert-banner { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:18px 22px; border-radius:8px; border:1.5px solid var(--danger-bd); background:var(--danger-bg); }
        .alert-banner h3 { color:var(--danger); font-size:15px; margin-bottom:3px; }
        .alert-banner p  { color:#7f1d1d; font-size:13px; margin:0; }

        .incident-card { background:#fff; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
        .ic-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:16px 18px 12px; flex-wrap:wrap; }
        .ic-title { font-size:15px; font-weight:700; margin-bottom:4px; }
        .ic-meta  { font-size:12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:12px; }
        .ic-sensors { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:0 18px 14px; }
        .sensor-box { background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:10px 12px; text-align:center; }
        .sb-val  { font-size:18px; font-weight:700; }
        .sb-unit { font-size:10px; color:var(--muted); margin-top:2px; text-transform:uppercase; letter-spacing:.04em; }
        .ic-actions { display:flex; gap:8px; flex-wrap:wrap; padding:10px 18px 14px; border-top:1px solid var(--border); background:var(--surface-2); }
        @media(max-width:600px) { .ic-sensors { grid-template-columns: repeat(2,1fr); } }

        .proposals-panel { border-top:2px solid var(--border); background:#fff; }
        .pp-title { padding:12px 18px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); border-bottom:1px solid var(--border); }
        .pp-empty { padding:24px 18px; font-size:13px; color:var(--muted); }
        .proposal-row { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:start; padding:14px 18px; border-bottom:1px solid var(--border); }
        .proposal-row:last-child { border-bottom:none; }
        .pr-name    { font-weight:700; font-size:14px; margin-bottom:3px; }
        .pr-method  { font-size:13px; color:var(--text-2); margin-bottom:6px; }
        .pr-costs   { display:flex; flex-wrap:wrap; gap:10px 20px; font-size:12px; color:var(--muted); }
        .pr-costs strong { color:var(--text); font-weight:700; }
        .pr-warranty { font-size:12px; color:var(--muted); margin-top:4px; }
        .pr-profile  { font-size:12px; color:var(--muted); margin-top:2px; }
        .pr-assign-col { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
        .pr-total { font-size:16px; font-weight:800; color:var(--success); white-space:nowrap; }
        .pr-best  { font-size:10px; color:var(--success); font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
        @media(max-width:600px) { .proposal-row { grid-template-columns:1fr; } .pr-assign-col { align-items:flex-start; } }

        .assign-card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:16px 18px; }
        .ac-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px; }
        .ac-head strong { font-size:14px; }

        .plumber-card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:16px 18px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
        .pc-info h3   { font-size:14px; font-weight:700; margin-bottom:4px; }
        .pc-info p    { font-size:12px; color:var(--muted); }
        .pc-actions   { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .form-grid    { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
        @media(max-width:600px) { .form-grid { grid-template-columns:1fr; } }
      `}</style>
    </>
  );
}
