/**
 * AdminPage.jsx
 * Complete Admin dashboard — Critical leak alerts, proposals, plumber assignment,
 * active assignments, plumber management, owner settings, audit log.
 */
import React, { useEffect, useState } from "react";
import { api, post, patch, formatDate, number } from "../api";
import {
  useLoad, useLiveReload,
  PageHeading, Card, Badge, Loading, Message, Icon,
} from "../App";

// ── Colour helpers ────────────────────────────────────────────────────────
const SEV_COLOR = { HIGH: "var(--danger)", MEDIUM: "var(--warning)", LOW: "var(--success)" };
const STATUS_TONE = {
  OPEN_FOR_PROPOSALS:       "amber",
  DETECTED:                 "gray",
  ASSIGNED:                 "blue",
  REPAIR_IN_PROGRESS:       "blue",
  REPAIR_REPORTED_COMPLETE: "amber",
  VERIFYING_RECOVERY:       "amber",
  RECOVERED:                "green",
  RECOVERY_FAILED:          "red",
  AWAITING_INSPECTION:      "amber",
  CANCELLED:                "gray",
};

function SeverityBadge({ sev }) {
  const tone = sev === "HIGH" ? "red" : sev === "MEDIUM" ? "amber" : "green";
  return <Badge tone={tone}>{sev}</Badge>;
}
function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || "gray"}>{status.replace(/_/g, " ")}</Badge>;
}

// ── KPI card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = "blue" }) {
  return (
    <div className={`kpi-card kpi-${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value ?? "—"}</div>
      <div className="kpi-unit">{sub}</div>
    </div>
  );
}

// ── Sensor snapshot row ───────────────────────────────────────────────────
function SensorRow({ ss, sev }) {
  const readings = [
    { v: ss.flowSensorData,      u: "L/min",  label: "Flow" },
    { v: ss.pressureSensorData,  u: "PSI",    label: "Pressure" },
    { v: ss.tankLevelSensorData, u: "%",      label: "Tank" },
    { v: ss.waterLossRate,       u: "L/hr",   label: "Loss", highlight: sev === "HIGH" },
  ];
  return (
    <div className="ic-sensors">
      {readings.map(({ v, u, label, highlight }) => (
        <div
          key={label}
          className="sensor-box"
          style={highlight ? { borderColor: "var(--danger-bd)", background: "var(--danger-bg)" } : undefined}
        >
          <div className="sb-val" style={highlight ? { color: "var(--danger)" } : undefined}>
            {v != null ? (typeof v === "number" ? v.toFixed(1) : v) : "—"}
          </div>
          <div className="sb-unit">{label} ({u})</div>
        </div>
      ))}
    </div>
  );
}

// ── Proposals panel ───────────────────────────────────────────────────────
function ProposalsPanel({ incidentId, onAssigned }) {
  const { data, loading, error, reload } = useLoad(
    () => api(`/admin/leaks/${incidentId}/proposals`),
    [incidentId]
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: false });

  async function assign(proposalId) {
    if (!window.confirm("Assign this plumber? Other proposals will be marked as not selected.")) return;
    setBusy(true);
    try {
      await post(`/admin/leaks/${incidentId}/assign`, { proposalId });
      setMsg({ text: "Plumber assigned successfully. They will receive an email notification.", ok: true });
      onAssigned?.();
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}><Loading text="Loading proposals…" /></div>;
  if (error)   return <div style={{ padding: 16 }}><Message>{error}</Message></div>;

  const sorted = [...(data || [])].sort((a, b) =>
    (a.totalEstimatedCharges || 0) - (b.totalEstimatedCharges || 0)
  );

  return (
    <div className="proposals-panel">
      <div className="pp-header">
        <Icon name="clipboard" />
        {sorted.length === 0
          ? "No proposals yet — plumbers will be notified by email to submit estimates."
          : `${sorted.length} proposal${sorted.length !== 1 ? "s" : ""} received — compare and assign`}
      </div>

      {msg.text && (
        <div style={{ padding: "8px 18px" }}>
          <Message kind={msg.ok ? "success" : "error"}>{msg.text}</Message>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="pp-empty">
          Approved plumbers received email notifications. Check back here once they submit estimates.
        </div>
      ) : (
        sorted.map((p, i) => {
          const avail = p.earliestAvailability
            ? new Date(p.earliestAvailability).toLocaleString()
            : "—";
          return (
            <div className={`proposal-row${i === 0 && sorted.length > 1 ? " proposal-best" : ""}`} key={p._id}>
              {i === 0 && sorted.length > 1 && (
                <div className="pr-best-tag">⭐ Lowest cost</div>
              )}
              <div className="pr-body">
                <div className="pr-top">
                  <div>
                    <div className="pr-name">{p.plumberId?.name || "Unknown plumber"}</div>
                    <div className="pr-email">{p.plumberId?.email || ""}</div>
                  </div>
                  <div className="pr-total-col">
                    <div className="pr-total">₹{(p.totalEstimatedCharges || 0).toLocaleString()}</div>
                    <div className="pr-duration">{p.estimatedDurationHours} hrs</div>
                  </div>
                </div>

                <div className="pr-method">{p.repairMethod}</div>

                <div className="pr-costs">
                  <span>Labour <strong>₹{p.labourCharges}</strong></span>
                  <span>Materials <strong>₹{p.materialCharges}</strong></span>
                  {p.visitCharges > 0 && <span>Visit <strong>₹{p.visitCharges}</strong></span>}
                  {p.otherCharges > 0 && <span>Other <strong>₹{p.otherCharges}</strong></span>}
                  <span>Available <strong>{avail}</strong></span>
                </div>

                {p.plumberProfile && (
                  <div className="pr-profile">
                    📍 {[p.plumberProfile.city, p.plumberProfile.state].filter(Boolean).join(", ")}
                    {p.plumberProfile.experienceYears > 0 && ` · ${p.plumberProfile.experienceYears} yrs exp`}
                    {p.plumberProfile.skills?.length > 0 && ` · ${p.plumberProfile.skills.join(", ")}`}
                  </div>
                )}

                {p.warrantyDetails && (
                  <div className="pr-warranty">🛡 {p.warrantyDetails}</div>
                )}

                {p.notes && (
                  <div className="pr-notes">📝 {p.notes}</div>
                )}
              </div>

              <div className="pr-actions">
                {p.status === "submitted" ? (
                  <button
                    className="btn btn-assign"
                    disabled={busy}
                    onClick={() => assign(p._id)}
                  >
                    <Icon name="check" /> Assign this plumber
                  </button>
                ) : (
                  <StatusBadge status={p.status} />
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

  const isOpen    = leak.status === "OPEN_FOR_PROPOSALS";
  const sev       = (leak.severity || "").toUpperCase();
  const ss        = leak.sensorSnapshot || {};
  const isCrit    = ss.overallSystemStatus === "CRITICAL";
  const det       = ss.detectedAt ? new Date(ss.detectedAt).toLocaleString() : "—";

  async function doAction(action) {
    setBusy(true);
    try {
      if (action === "open") {
        await patch(`/admin/leaks/${leak._id}/status`, { status: "OPEN_FOR_PROPOSALS", reason: "Opened by administrator." });
        onAction?.({ reload: true });
      } else if (action === "cancel") {
        if (!window.confirm("Cancel this incident? This cannot be undone.")) return;
        await patch(`/admin/leaks/${leak._id}/status`, { status: "CANCELLED", reason: "Cancelled by administrator." });
        onAction?.({ reload: true });
      } else if (action === "verify") {
        const result = await post(`/repairs/${leak._id}/verify-recovery`, {});
        onAction?.({ message: result.message || (result.recovered ? "Recovery confirmed!" : "Recovery not yet confirmed."), ok: !!result.recovered, reload: true });
      } else if (action === "retry-verify") {
        await patch(`/admin/leaks/${leak._id}/status`, { status: "VERIFYING_RECOVERY", reason: "Admin requested retry." });
        const result = await post(`/repairs/${leak._id}/verify-recovery`, {});
        onAction?.({ message: result.message || (result.recovered ? "Recovery confirmed!" : "Recovery not yet confirmed."), ok: !!result.recovered, reload: true });
      }
    } catch (e) {
      onAction?.({ message: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  const leftBorder = isOpen && isCrit ? "4px solid var(--danger)"
    : isOpen ? "4px solid var(--warning)"
    : leak.status === "RECOVERED" ? "4px solid var(--success)"
    : undefined;

  return (
    <div className="incident-card" style={{ borderLeft: leftBorder }}>
      {/* Header */}
      <div className="ic-head">
        <div className="ic-head-left">
          <div className="ic-title">
            <span className="ic-id">{leak.incidentId}</span>
            {isCrit && isOpen && (
              <span className="ic-crit-tag">🚨 CRITICAL</span>
            )}
          </div>
          <div className="ic-meta">
            <span><Icon name="clock" /> {det}</span>
            <SeverityBadge sev={sev} />
            <StatusBadge status={leak.status} />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Prob: {ss.mlProbability != null ? `${Number(ss.mlProbability).toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>
        {isOpen && (
          <div className="ic-needs-action">
            <Icon name="warning" /> Needs plumber assignment
          </div>
        )}
      </div>

      {/* Sensor readings */}
      <SensorRow ss={ss} sev={sev} />

      {/* Actions */}
      <div className="ic-actions">
        {leak.status === "DETECTED" && (
          <button className="btn btn-warning" disabled={busy} onClick={() => doAction("open")}>
            Open for proposals
          </button>
        )}
        {isOpen && (
          <button
            className={`btn ${showProposals ? "btn-outline-primary" : ""}`}
            onClick={() => setShowProposals(v => !v)}
          >
            <Icon name="clipboard" />
            {showProposals ? "Hide proposals" : "View proposals & assign"}
          </button>
        )}
        {leak.status === "VERIFYING_RECOVERY" && (
          <button className="btn btn-success" disabled={busy} onClick={() => doAction("verify")}>
            <Icon name="check" /> Verify recovery
          </button>
        )}
        {leak.status === "RECOVERY_FAILED" && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => doAction("retry-verify")}>
            Retry recovery check
          </button>
        )}
        {isOpen && (
          <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => doAction("cancel")}>
            Cancel incident
          </button>
        )}
      </div>

      {/* Proposals panel */}
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

// ── Assignment card ───────────────────────────────────────────────────────
function AssignmentCard({ item, onReassign }) {
  const [busy, setBusy] = useState(false);
  const inc  = item.incidentId  || {};
  const prop = item.selectedProposalId || {};
  const plumber = item.plumberId || {};

  const STATUS_MAP = { assigned: "amber", accepted: "blue", in_progress: "blue", completed: "green", reassigned: "gray", cancelled: "gray" };
  const STEPS = ["assigned", "accepted", "in_progress", "completed"];
  const LABELS = ["Assigned", "Accepted", "In progress", "Completed"];
  const current = STEPS.indexOf(item.status);

  async function reassign() {
    const reason = window.prompt("Reason for reassignment (required):");
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await post(`/admin/assignments/${item._id}/reassign`, { reason: reason.trim() });
      onReassign?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assign-card">
      {/* Step pills */}
      <div className="ac-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`ac-step${i < current ? " done" : i === current ? " active" : ""}`}>
            {LABELS[i]}
          </div>
        ))}
      </div>

      <div className="ac-body">
        <div className="ac-head">
          <div>
            <div className="ac-title">
              {inc.incidentId || "Incident"} &nbsp;
              <SeverityBadge sev={(inc.severity || "").toUpperCase()} />
            </div>
            <div className="ac-meta">
              Assigned {item.assignedAt ? new Date(item.assignedAt).toLocaleDateString() : "—"}
            </div>
          </div>
          <Badge tone={STATUS_MAP[item.status] || "gray"}>{item.status.replace(/_/g, " ")}</Badge>
        </div>

        {/* Plumber profile */}
        <div className="ac-plumber">
          <div className="ac-plumber-icon">👷</div>
          <div>
            <div className="ac-plumber-name">{plumber.name || "—"}</div>
            <div className="ac-plumber-email">{plumber.email || "—"}</div>
          </div>
          <div className="ac-amount">
            ₹{(prop.totalEstimatedCharges || 0).toLocaleString()}
          </div>
        </div>

        {prop.repairMethod && (
          <div className="ac-method">{prop.repairMethod}</div>
        )}

        {["assigned", "accepted"].includes(item.status) && (
          <div className="ac-actions">
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={reassign}>
              Reassign plumber
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Plumber management card ───────────────────────────────────────────────
function PlumberCard({ profile, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const user = profile.userId || {};
  const st   = profile.approvalStatus;

  const TONE = { pending: "amber", approved: "green", rejected: "gray", suspended: "gray" };

  async function action(type) {
    setBusy(true);
    try {
      if (type === "approve" || type === "reject") {
        await patch(`/admin/plumbers/${profile._id}/approval`, { status: type === "approve" ? "approved" : "rejected" });
      } else {
        await patch(`/admin/plumbers/${profile._id}/status`, { status: type === "suspend" ? "suspended" : "active" });
      }
      onUpdate?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plumber-card">
      <div className="pc-avatar">👷</div>
      <div className="pc-info">
        <div className="pc-name">
          {user.name || "—"}
          <Badge tone={TONE[st] || "gray"} style={{ marginLeft: 8 }}>{st}</Badge>
        </div>
        <div className="pc-email">{user.email || "—"}</div>
        <div className="pc-details">
          {[profile.phone, profile.city && `${profile.city}, ${profile.state}`, profile.experienceYears != null && `${profile.experienceYears} yrs`].filter(Boolean).join(" · ")}
        </div>
        {profile.skills?.length > 0 && (
          <div className="pc-skills">
            {profile.skills.map(s => <span key={s} className="skill-tag">{s}</span>)}
          </div>
        )}
      </div>
      <div className="pc-actions">
        {st === "pending"    && <><button className="btn btn-success btn-sm" disabled={busy} onClick={() => action("approve")}>Approve</button><button className="btn btn-ghost btn-danger btn-sm" disabled={busy} onClick={() => action("reject")}>Reject</button></>}
        {st === "approved"   && <button className="btn btn-ghost btn-sm"    disabled={busy} onClick={() => action("suspend")}>Suspend</button>}
        {st === "suspended"  && <button className="btn btn-ghost btn-sm"    disabled={busy} onClick={() => action("reactivate")}>Reactivate</button>}
      </div>
    </div>
  );
}

// ── Main AdminPage ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const [leakFilter,    setLeakFilter]    = useState("OPEN_FOR_PROPOSALS");
  const [plumberFilter, setPlumberFilter] = useState("pending");
  const [pageMsg, setPageMsg] = useState({ text: "", ok: false });
  const [ownerName,  setOwnerName]  = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerMsg,   setOwnerMsg]   = useState({ text: "", ok: false });

  const { data: dash,     reload: reloadDash }        = useLoad(() => api("/admin/dashboard"));
  const { data: leaksRes, loading: leaksLoading, reload: reloadLeaks }
    = useLoad(() => api(`/admin/leaks?limit=100${leakFilter ? `&status=${encodeURIComponent(leakFilter)}` : ""}`), [leakFilter]);
  const { data: assignRes, reload: reloadAssign }     = useLoad(() => api("/admin/assignments?limit=50"));
  const { data: plumberRes, reload: reloadPlumbers }  = useLoad(() => api(`/admin/plumbers?status=${encodeURIComponent(plumberFilter)}`), [plumberFilter]);
  const { data: auditRes }                            = useLoad(() => api("/admin/audit-logs?limit=15"));

  useLiveReload(() => { reloadDash(); reloadLeaks(); });

  // Fallback polling every 15 s so new incidents appear even if SSE misses a beat
  useEffect(() => {
    const timer = setInterval(() => {
      reloadDash();
      reloadLeaks();
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api("/notifications/settings").then(s => { setOwnerName(s.ownerName || ""); setOwnerEmail(s.ownerEmail || ""); }).catch(() => {});
  }, []);

  function handleAction({ reload, message, ok } = {}) {
    if (message) setPageMsg({ text: message, ok: !!ok });
    if (reload) { reloadLeaks(); reloadAssign(); reloadDash(); }
  }

  async function saveOwner(e) {
    e.preventDefault();
    try {
      const r = await api("/notifications/settings", { method: "PUT", body: JSON.stringify({ ownerName, ownerEmail }) });
      setOwnerMsg({ text: r.message || "Saved.", ok: true });
    } catch (e) { setOwnerMsg({ text: e.message, ok: false }); }
  }

  async function handleInvite(e) {
    e.preventDefault();
    const btn = e.currentTarget.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const v = Object.fromEntries(new FormData(e.currentTarget));
      const r = await post("/admin/plumbers", {
        ...v,
        serviceRadiusKm: Number(v.serviceRadiusKm) || 25,
        experienceYears: Number(v.experienceYears) || 0,
        skills: v.skillsText ? v.skillsText.split(",").map(s => s.trim()).filter(Boolean) : [],
      });
      setPageMsg({ text: r.message || "Invitation sent.", ok: true });
      e.currentTarget.reset();
      reloadPlumbers();
    } catch (e) { setPageMsg({ text: e.message, ok: false }); }
    finally { btn.disabled = false; }
  }

  const c         = dash?.counts || {};
  const openCount = dash?.leaks?.openForProposals || 0;
  const leaks     = leaksRes?.data || [];
  const assigns   = assignRes?.data || [];
  const plumbers  = plumberRes?.data || [];
  const audits    = auditRes?.data || [];

  return (
    <>
      <PageHeading
        title="Administration"
        description="Critical alerts · Proposals · Plumber assignments · Management"
        action={
          <button className="btn btn-light" onClick={() => { reloadDash(); reloadLeaks(); reloadAssign(); reloadPlumbers(); }}>
            <Icon name="refresh" /> Refresh
          </button>
        }
      />

      {pageMsg.text && (
        <Message kind={pageMsg.ok ? "success" : "error"} onDismiss={() => setPageMsg({ text: "" })}>
          {pageMsg.text}
        </Message>
      )}

      {/* ── KPI metrics ── */}
      <div className="kpi-grid">
        <KpiCard label="Leak incidents"      value={c.leakIncidents}               sub="Total detected"              color="red" />
        <KpiCard label="Open for proposals"  value={c.submittedProposals != null ? openCount : "—"} sub="Awaiting plumber assignment"  color="amber" />
        <KpiCard label="Active assignments"  value={c.activeAssignments}           sub="Repairs in progress"         color="blue" />
        <KpiCard label="Pending plumbers"    value={c.pendingPlumbers}             sub="Awaiting approval"           color="violet" />
        <KpiCard label="Proposals received"  value={c.submittedProposals}          sub="Waiting for review"          color="teal" />
        <KpiCard label="Awaiting verify"     value={c.repairsAwaitingVerification} sub="Recovery checks needed"      color="amber" />
        <KpiCard label="Recovered"           value={c.recoveredIncidents}          sub="Successfully resolved"       color="green" />
      </div>

      {/* ── Critical alert banner ── */}
      {openCount > 0 && (
        <div className="alert-banner">
          <div className="ab-icon">🚨</div>
          <div className="ab-body">
            <div className="ab-title">Critical leak{openCount > 1 ? "s" : ""} require plumber assignment</div>
            <div className="ab-sub">
              {openCount} incident{openCount > 1 ? "s are" : " is"} open for proposals.
              Review sensor data and assign an available plumber.
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => setLeakFilter("OPEN_FOR_PROPOSALS")}>
            View incidents →
          </button>
        </div>
      )}

      {/* ── Leak incidents ── */}
      <section>
        <div className="sec-header">
          <span className="sec-title"><Icon name="alerts" /> Leak incidents</span>
          <select value={leakFilter} onChange={e => setLeakFilter(e.target.value)} className="filter-select">
            <option value="OPEN_FOR_PROPOSALS">Open for proposals</option>
            <option value="">All incidents</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="REPAIR_IN_PROGRESS">In progress</option>
            <option value="VERIFYING_RECOVERY">Verifying recovery</option>
            <option value="RECOVERED">Recovered</option>
            <option value="DETECTED">Detected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        {leaksLoading ? (
          <Loading />
        ) : leaks.length === 0 ? (
          <Card><p className="empty">No incidents found for this filter.</p></Card>
        ) : (
          <div className="stack">
            {leaks.map(leak => (
              <IncidentCard key={leak._id} leak={leak} onAction={handleAction} />
            ))}
          </div>
        )}
      </section>

      {/* ── Active assignments ── */}
      <section>
        <div className="sec-header">
          <span className="sec-title"><Icon name="repair" /> Active assignments</span>
        </div>
        {assigns.length === 0 ? (
          <Card><p className="empty">No active assignments.</p></Card>
        ) : (
          <div className="stack">
            {assigns.map(item => (
              <AssignmentCard key={item._id} item={item} onReassign={() => { reloadAssign(); reloadLeaks(); reloadDash(); }} />
            ))}
          </div>
        )}
      </section>

      {/* ── Plumber approvals ── */}
      <section>
        <div className="sec-header">
          <span className="sec-title">👷 Plumber approvals</span>
          <select value={plumberFilter} onChange={e => setPlumberFilter(e.target.value)} className="filter-select">
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {plumbers.length === 0 ? (
          <Card><p className="empty">No plumbers in this status.</p></Card>
        ) : (
          <div className="stack">
            {plumbers.map(p => (
              <PlumberCard key={p._id} profile={p} onUpdate={() => { reloadPlumbers(); reloadDash(); }} />
            ))}
          </div>
        )}
      </section>

      {/* ── Invite plumber ── */}
      <section>
        <div className="sec-header"><span className="sec-title">📨 Invite trusted plumber</span></div>
        <Card>
          <form className="form-grid" onSubmit={handleInvite}>
            {[["Full name","name","text",true],["Email","email","email",true],["Phone","phone","tel",true],["City","city","text",true],["State / region","state","text",true],["Service radius (km)","serviceRadiusKm","number",true],["Experience (years)","experienceYears","number",false],["Skills (comma-separated)","skillsText","text",false]].map(([label,name,type,req]) => (
              <label key={name} className="form-field">
                {label}
                <input name={name} type={type} required={req}
                  defaultValue={name==="serviceRadiusKm"?25:name==="experienceYears"?0:undefined} />
              </label>
            ))}
            <label className="form-field wide">
              Address
              <input name="address" maxLength={200} />
            </label>
            <button className="btn wide" type="submit">Send invitation</button>
          </form>
        </Card>
      </section>

      {/* ── Owner email ── */}
      <section>
        <div className="sec-header"><span className="sec-title">📧 Critical alert email recipient</span></div>
        <Card>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            This address receives critical leak alert emails when a new incident is detected.
          </p>
          <form className="form-grid" onSubmit={saveOwner}>
            <label className="form-field">
              Owner name
              <input type="text" required maxLength={100} value={ownerName} onChange={e => setOwnerName(e.target.value)} />
            </label>
            <label className="form-field">
              Owner email
              <input type="email" required maxLength={254} value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
            </label>
            <button className="btn wide" type="submit">Save</button>
          </form>
          {ownerMsg.text && <Message kind={ownerMsg.ok ? "success" : "error"}>{ownerMsg.text}</Message>}
        </Card>
      </section>

      {/* ── Audit log ── */}
      <section>
        <div className="sec-header"><span className="sec-title"><Icon name="document" /> Recent activity</span></div>
        {audits.length === 0 ? (
          <Card><p className="empty">No audit entries yet.</p></Card>
        ) : (
          <div className="stack">
            {audits.map(r => (
              <Card key={r._id}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>{r.action}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(r.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {r.actorUserId?.name || "System"} · {r.entityType || ""} {r.entityId || ""}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <AdminStyles />
    </>
  );
}

// ── Scoped styles ─────────────────────────────────────────────────────────
function AdminStyles() {
  return (
    <style>{`
      /* Layout */
      .kpi-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:12px; }
      @media(max-width:1400px){ .kpi-grid{grid-template-columns:repeat(4,1fr);} }
      @media(max-width:900px) { .kpi-grid{grid-template-columns:repeat(2,1fr);} }
      @media(max-width:500px) { .kpi-grid{grid-template-columns:1fr;} }
      .stack { display:grid; gap:12px; }
      .sec-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .sec-title  { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); display:flex; align-items:center; gap:6px; }
      .filter-select { border:1px solid var(--border-2); border-radius:var(--radius); padding:6px 10px; font-size:12px; font-family:inherit; background:var(--surface); cursor:pointer; }

      /* Buttons */
      .btn-warning  { background:var(--warning)!important; }
      .btn-success  { background:var(--success)!important; }
      .btn-danger   { background:var(--danger)!important;  }
      .btn-outline-primary { background:transparent!important; color:var(--primary)!important; border:1.5px solid var(--primary)!important; }
      .btn-ghost.btn-danger { color:var(--danger)!important; border-color:var(--danger-bd)!important; }
      .btn-sm { padding:5px 10px!important; font-size:12px!important; }
      .btn-assign { background:var(--primary); color:#fff; border:none; border-radius:var(--radius); padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; white-space:nowrap; }
      .btn-assign:hover { background:var(--primary-h); }
      .btn-assign:disabled { opacity:.5; cursor:default; }

      /* Alert banner */
      .alert-banner { display:flex; align-items:center; gap:16px; padding:18px 22px; border-radius:8px; border:1.5px solid var(--danger-bd); background:var(--danger-bg); flex-wrap:wrap; }
      .ab-icon  { font-size:28px; flex-shrink:0; }
      .ab-body  { flex:1; min-width:0; }
      .ab-title { font-size:15px; font-weight:700; color:var(--danger); margin-bottom:3px; }
      .ab-sub   { font-size:13px; color:#7f1d1d; }

      /* Incident card */
      .incident-card { background:#fff; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
      .ic-head  { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:16px 18px 10px; flex-wrap:wrap; }
      .ic-head-left {}
      .ic-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
      .ic-id    { font-size:15px; font-weight:700; }
      .ic-crit-tag { background:var(--danger-bg); color:var(--danger); font-size:11px; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid var(--danger-bd); }
      .ic-meta  { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:12px; color:var(--muted); }
      .ic-needs-action { font-size:11px; font-weight:700; color:var(--danger); text-transform:uppercase; letter-spacing:.05em; display:flex; align-items:center; gap:4px; }
      .ic-sensors { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:0 18px 12px; }
      @media(max-width:600px){ .ic-sensors{grid-template-columns:repeat(2,1fr);} }
      .sensor-box  { background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:10px 12px; text-align:center; }
      .sb-val  { font-size:18px; font-weight:700; }
      .sb-unit { font-size:10px; color:var(--muted); margin-top:2px; text-transform:uppercase; letter-spacing:.04em; }
      .ic-actions { display:flex; gap:8px; flex-wrap:wrap; padding:10px 18px 14px; border-top:1px solid var(--border); background:var(--surface-2); }

      /* Proposals panel */
      .proposals-panel { border-top:2px solid var(--border-2); background:#fff; }
      .pp-header { padding:12px 18px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:6px; }
      .pp-empty  { padding:20px 18px; font-size:13px; color:var(--muted); }
      .proposal-row { border-bottom:1px solid var(--border); padding:16px 18px; display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; transition:background .1s; }
      .proposal-row:last-child { border-bottom:none; }
      .proposal-row:hover { background:var(--surface-2); }
      .proposal-best { background:#fffbeb; border-left:3px solid #f59e0b; }
      .pr-best-tag { font-size:11px; font-weight:700; color:#92400e; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:4px; margin-bottom:6px; display:inline-block; }
      .pr-body  { flex:1; min-width:0; }
      .pr-top   { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
      .pr-name  { font-size:14px; font-weight:700; }
      .pr-email { font-size:12px; color:var(--muted); }
      .pr-total-col { text-align:right; flex-shrink:0; }
      .pr-total    { font-size:18px; font-weight:800; color:var(--success); }
      .pr-duration { font-size:12px; color:var(--muted); }
      .pr-method   { font-size:13px; color:var(--text-2); margin-bottom:8px; }
      .pr-costs    { display:flex; flex-wrap:wrap; gap:6px 18px; font-size:12px; color:var(--muted); margin-bottom:6px; }
      .pr-costs strong { color:var(--text); font-weight:700; }
      .pr-profile, .pr-warranty, .pr-notes { font-size:12px; color:var(--muted); margin-top:4px; }
      .pr-actions { display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0; }

      /* Assignment card */
      .assign-card { background:#fff; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
      .ac-steps { display:flex; border-bottom:1px solid var(--border); }
      .ac-step  { flex:1; padding:8px 6px; text-align:center; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; background:var(--surface-2); color:var(--muted); border-right:1px solid var(--border); }
      .ac-step:last-child { border-right:none; }
      .ac-step.done   { background:var(--success-bg); color:var(--success); }
      .ac-step.active { background:var(--primary); color:#fff; }
      .ac-body    { padding:16px 18px; }
      .ac-head    { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .ac-title   { font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .ac-meta    { font-size:12px; color:var(--muted); margin-top:3px; }
      .ac-plumber { display:flex; align-items:center; gap:10px; background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:10px 14px; margin-bottom:10px; }
      .ac-plumber-icon { font-size:20px; flex-shrink:0; }
      .ac-plumber-name  { font-size:14px; font-weight:700; }
      .ac-plumber-email { font-size:12px; color:var(--muted); }
      .ac-amount  { margin-left:auto; font-size:16px; font-weight:700; color:var(--success); flex-shrink:0; }
      .ac-method  { font-size:13px; color:var(--text-2); margin-bottom:8px; }
      .ac-actions { display:flex; gap:8px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--border); margin-top:10px; }

      /* Plumber card */
      .plumber-card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:16px 18px; display:flex; align-items:flex-start; gap:14px; flex-wrap:wrap; }
      .pc-avatar    { font-size:28px; flex-shrink:0; }
      .pc-info      { flex:1; min-width:0; }
      .pc-name      { font-size:14px; font-weight:700; display:flex; align-items:center; flex-wrap:wrap; gap:4px; margin-bottom:3px; }
      .pc-email     { font-size:12px; color:var(--muted); margin-bottom:3px; }
      .pc-details   { font-size:12px; color:var(--muted); margin-bottom:5px; }
      .pc-skills    { display:flex; flex-wrap:wrap; gap:4px; }
      .skill-tag    { background:var(--surface-2); border:1px solid var(--border-2); border-radius:4px; padding:2px 7px; font-size:11px; color:var(--text-2); }
      .pc-actions   { display:flex; gap:8px; align-items:center; flex-shrink:0; flex-wrap:wrap; }

      /* Form */
      .form-grid  { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .form-field { display:grid; gap:5px; font-size:13px; font-weight:600; }
      .form-field input, .form-field select { padding:8px 10px; border:1px solid var(--border-2); border-radius:var(--radius); font:inherit; font-size:13px; }
      .form-field.wide, .wide { grid-column:1/-1; }
      @media(max-width:600px){ .form-grid{grid-template-columns:1fr;} }
    `}</style>
  );
}
