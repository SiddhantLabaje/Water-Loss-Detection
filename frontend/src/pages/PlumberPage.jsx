/**
 * PlumberPage.jsx
 * Complete Plumber workspace — Critical alert cards, proposal submission,
 * my proposals, assignments with step progress, completion reports.
 */
import React, { useEffect, useState } from "react";
import { api, post, patch, formatDate, number } from "../api";
import {
  useLoad, useLiveReload,
  PageHeading, Card, Badge, Loading, Message, Icon,
} from "../App";

// ── Helpers ───────────────────────────────────────────────────────────────
const SEV_COLOR  = { HIGH: "var(--danger)", MEDIUM: "var(--warning)", LOW: "var(--success)" };
const PROP_TONE  = { submitted: "amber", selected: "green", not_selected: "gray", withdrawn: "gray" };
const STEPS      = ["assigned", "accepted", "in_progress", "completed"];
const STEP_LABELS = ["Assigned", "Accepted", "In progress", "Completed"];

function StepPills({ current }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="ac-steps">
      {STEPS.map((s, i) => (
        <div key={s} className={`ac-step${i < idx ? " done" : i === idx ? " active" : ""}`}>
          {STEP_LABELS[i]}
        </div>
      ))}
    </div>
  );
}

// ── Sensor snapshot ───────────────────────────────────────────────────────
function SensorRow({ ss }) {
  return (
    <div className="rc-sensors">
      {[
        [ss.flowSensorData,      "Flow",      "L/min"],
        [ss.pressureSensorData,  "Pressure",  "PSI"],
        [ss.tankLevelSensorData, "Tank",      "%"],
        [ss.waterLossRate,       "Water loss","L/hr"],
      ].map(([v, label, unit], i) => (
        <div
          key={label}
          className="sensor-box"
          style={i === 3 ? { borderColor: "var(--danger-bd)", background: "var(--danger-bg)" } : undefined}
        >
          <div className="sb-val" style={i === 3 ? { color: "var(--danger)" } : undefined}>
            {v != null ? (typeof v === "number" ? v.toFixed(1) : v) : "—"}
          </div>
          <div className="sb-unit">{label} ({unit})</div>
        </div>
      ))}
    </div>
  );
}

// ── Proposal submission form ──────────────────────────────────────────────
function ProposalForm({ incident, onSubmitted, onCancel }) {
  const [charges, setCharges] = useState({ labour: 0, material: 0, visit: 0, other: 0 });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const total = Object.values(charges).reduce((sum, v) => sum + (Number(v) || 0), 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const v = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await post(`/plumber/repair-requests/${incident._id}/proposals`, {
        repairMethod:           v.repairMethod.trim(),
        labourCharges:          Number(v.labourCharges)   || 0,
        materialCharges:        Number(v.materialCharges) || 0,
        visitCharges:           Number(v.visitCharges)    || 0,
        otherCharges:           Number(v.otherCharges)    || 0,
        estimatedDurationHours: Number(v.estimatedDurationHours) || 1,
        earliestAvailability:   new Date(v.earliestAvailability).toISOString(),
        warrantyDetails:        v.warrantyDetails?.trim() || "",
        notes:                  v.notes?.trim() || "",
      });
      onSubmitted(`Proposal submitted. Total: ₹${(result.totalEstimatedCharges || 0).toLocaleString()}. The admin will review and assign the best plumber.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="proposal-form-wrap">
      <div className="pf-header">
        <div className="pf-title">Submit your repair estimate — {incident.incidentId}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>✕ Cancel</button>
      </div>
      <form onSubmit={submit}>
        <div className="pf-grid">
          <label className="pf-label wide">
            Repair method / approach <span className="req-note">(required, min 10 chars)</span>
            <textarea
              name="repairMethod"
              required
              minLength={10}
              maxLength={1000}
              placeholder="e.g. Excavate and replace 2m of burst copper pipe, apply epoxy seal, pressure test at 60 PSI…"
              className="pf-textarea"
            />
          </label>

          {/* Charges */}
          {[
            ["Labour charges (₹)",          "labourCharges",   true,  "labour"],
            ["Material charges (₹)",         "materialCharges", true,  "material"],
            ["Visit / travel charges (₹)",   "visitCharges",    false, "visit"],
            ["Other charges (₹)",            "otherCharges",    false, "other"],
          ].map(([label, name, req, key]) => (
            <label key={name} className="pf-label">
              {label}
              <input
                name={name}
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                required={req}
                onChange={e => setCharges(p => ({ ...p, [key]: e.target.value }))}
                className="pf-input"
              />
            </label>
          ))}

          <label className="pf-label">
            Duration (hours) <span className="req-note">*</span>
            <input name="estimatedDurationHours" type="number" min={0.5} step={0.5} required placeholder="e.g. 3" className="pf-input" />
          </label>
          <label className="pf-label">
            Earliest availability <span className="req-note">*</span>
            <input name="earliestAvailability" type="datetime-local" required className="pf-input" />
          </label>

          <label className="pf-label wide">
            Warranty details <span className="req-note">(optional)</span>
            <textarea name="warrantyDetails" maxLength={500} placeholder="e.g. 6-month warranty on all replaced parts" className="pf-textarea pf-textarea-sm" />
          </label>
          <label className="pf-label wide">
            Additional notes <span className="req-note">(optional)</span>
            <textarea name="notes" maxLength={1000} className="pf-textarea pf-textarea-sm" />
          </label>

          {/* Live total */}
          <div className="pf-total wide">
            <span>Estimated total:</span>
            <span className="pf-total-amount">₹{total.toLocaleString()}</span>
          </div>

          {err && <div className="pf-error wide">{err}</div>}

          <button className="btn btn-success wide" type="submit" disabled={busy}>
            {busy ? "Submitting…" : <><Icon name="check" /> Submit estimate to admin</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Completion report form ────────────────────────────────────────────────
function CompletionForm({ assignment, proposal, onSubmitted, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const inc = assignment.incidentId || {};

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const v = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await post(`/plumber/assignments/${assignment._id}/completion-report`, {
        workDescription:    v.workDescription.trim(),
        partsUsed:          v.partsUsed?.trim() || "",
        labourCharges:      Number(v.labourCharges)   || 0,
        materialCharges:    Number(v.materialCharges) || 0,
        completionNotes:    v.completionNotes?.trim() || "",
        furtherWorkRequired: e.currentTarget.elements.furtherWorkRequired.checked,
      });
      onSubmitted(result.message || "Completion report submitted. Admin will verify recovery.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="proposal-form-wrap" style={{ borderTopColor: "var(--success)" }}>
      <div className="pf-header">
        <div className="pf-title">Completion report — {inc.incidentId || "incident"}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>✕ Cancel</button>
      </div>
      <form onSubmit={submit}>
        <div className="pf-grid">
          <label className="pf-label wide">
            Work performed <span className="req-note">*</span>
            <textarea name="workDescription" required minLength={10} maxLength={5000} placeholder="Describe all work carried out in detail…" className="pf-textarea" />
          </label>
          <label className="pf-label wide">
            Parts and materials used <span className="req-note">(optional)</span>
            <textarea name="partsUsed" maxLength={2000} placeholder="List part names, quantities, specifications…" className="pf-textarea pf-textarea-sm" />
          </label>
          <label className="pf-label">
            Final labour charges (₹) <span className="req-note">*</span>
            <input name="labourCharges" type="number" min={0} step={1} required placeholder={proposal?.labourCharges || 0} className="pf-input" />
          </label>
          <label className="pf-label">
            Final material charges (₹) <span className="req-note">*</span>
            <input name="materialCharges" type="number" min={0} step={1} required placeholder={proposal?.materialCharges || 0} className="pf-input" />
          </label>
          <label className="pf-label wide">
            Completion notes <span className="req-note">(optional)</span>
            <textarea name="completionNotes" maxLength={3000} placeholder="Notes for the admin about the repair outcome…" className="pf-textarea pf-textarea-sm" />
          </label>
          <label className="pf-check wide">
            <input name="furtherWorkRequired" type="checkbox" />
            Further work is required (e.g. waiting for parts, re-inspection needed)
          </label>
          {err && <div className="pf-error wide">{err}</div>}
          <button className="btn btn-success wide" type="submit" disabled={busy}>
            {busy ? "Submitting…" : <><Icon name="check" /> Submit completion report</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Repair request card ───────────────────────────────────────────────────
function RequestCard({ item, openForm, onToggle, onSubmitted }) {
  const sev = (item.severity || "").toUpperCase();
  const ss  = item.sensorSnapshot || {};
  const det = ss.detectedAt ? new Date(ss.detectedAt).toLocaleString() : "—";
  const isCrit = ss.overallSystemStatus === "CRITICAL";

  return (
    <div className={`request-card${isCrit ? " request-critical" : ""}`}>
      {/* Header */}
      <div className="rc-head">
        <div>
          <div className="rc-title">
            {item.incidentId}
            {isCrit && <span className="crit-chip">🚨 CRITICAL</span>}
            <span style={{ color: SEV_COLOR[sev] || "var(--muted)", fontSize: 12, fontWeight: 700 }}>
              {sev} SEVERITY
            </span>
          </div>
          <div className="rc-meta">
            <span><Icon name="clock" /> {det}</span>
            <span>📉 Loss: <strong>{ss.waterLossRate != null ? Number(ss.waterLossRate).toFixed(2) : "—"} L/hr</strong></span>
            <span>🔬 Prob: <strong>{ss.mlProbability != null ? `${Number(ss.mlProbability).toFixed(1)}%` : "—"}</strong></span>
          </div>
        </div>
        <Badge tone="amber">Open for proposals</Badge>
      </div>

      <SensorRow ss={ss} />

      {/* Action */}
      <div className="rc-foot">
        <button
          className={`btn${openForm ? " btn-outline-primary" : ""}`}
          onClick={() => onToggle(item._id)}
        >
          <Icon name="document" />
          {openForm ? "Hide estimate form" : "Submit cost estimate"}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Review sensor data above, then submit your repair estimate.
        </span>
      </div>

      {/* Proposal form */}
      {openForm && (
        <ProposalForm
          incident={item}
          onSubmitted={msg => { onSubmitted(msg); onToggle(item._id); }}
          onCancel={() => onToggle(item._id)}
        />
      )}
    </div>
  );
}

// ── My proposal card ──────────────────────────────────────────────────────
function ProposalCard({ p, onWithdraw }) {
  const [busy, setBusy] = useState(false);
  const inc = p.incidentId || {};
  async function withdraw() {
    if (!window.confirm("Withdraw this proposal?")) return;
    setBusy(true);
    try {
      await post(`/plumber/proposals/${p._id}/withdraw`, { reason: "Withdrawn by plumber." });
      onWithdraw("Proposal withdrawn.");
    } catch (e) {
      onWithdraw(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prop-card">
      <div className="prop-head">
        <div>
          <div className="prop-title">{inc.incidentId || "Incident"}</div>
          <div className="prop-date">Submitted {new Date(p.createdAt).toLocaleDateString()}</div>
        </div>
        <Badge tone={PROP_TONE[p.status] || "gray"}>{p.status.replace(/_/g, " ")}</Badge>
      </div>
      <div className="prop-method">{p.repairMethod}</div>
      <div className="prop-costs">
        <span>Labour <strong>₹{p.labourCharges}</strong></span>
        <span>Materials <strong>₹{p.materialCharges}</strong></span>
        {p.visitCharges > 0 && <span>Visit <strong>₹{p.visitCharges}</strong></span>}
        <span>Duration <strong>{p.estimatedDurationHours} hrs</strong></span>
        <span className="prop-total">Total <strong>₹{(p.totalEstimatedCharges || 0).toLocaleString()}</strong></span>
      </div>
      {p.status === "selected" && (
        <div className="prop-selected">
          <Icon name="check" /> Your proposal was selected — see your assignment below
        </div>
      )}
      {p.status === "submitted" && (
        <button className="btn btn-ghost btn-danger btn-sm" disabled={busy} onClick={withdraw}>
          Withdraw proposal
        </button>
      )}
    </div>
  );
}

// ── Assignment card ───────────────────────────────────────────────────────
function AssignmentCard({ item, openCompletion, onToggleCompletion, onStatusChange, onCompletionSubmitted }) {
  const [busy, setBusy] = useState(false);
  const inc  = item.incidentId || {};
  const prop = item.selectedProposalId || {};
  const st   = item.status;

  async function changeStatus(status) {
    setBusy(true);
    try {
      await patch(`/plumber/assignments/${item._id}/status`, { status });
      onStatusChange(status === "accepted" ? "Assignment accepted." : "Repair started. Good luck!");
    } catch (e) {
      onStatusChange(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assign-card">
      <StepPills current={st} />
      <div className="ac-body">
        <div className="ac-head">
          <div>
            <div className="ac-title">
              {inc.incidentId || "Incident"}
              {inc.severity && (
                <Badge tone={inc.severity === "HIGH" ? "red" : inc.severity === "MEDIUM" ? "amber" : "green"}>
                  {inc.severity}
                </Badge>
              )}
            </div>
            <div className="ac-amounts">
              Agreed: <strong style={{ color: "var(--primary)" }}>₹{(prop.totalEstimatedCharges || 0).toLocaleString()}</strong>
              &nbsp;·&nbsp;
              Duration: <strong>{prop.estimatedDurationHours || "—"} hrs</strong>
            </div>
          </div>
          <Badge tone={st === "completed" ? "green" : st === "in_progress" ? "blue" : "amber"}>
            {st.replace(/_/g, " ")}
          </Badge>
        </div>

        {prop.repairMethod && (
          <div className="ac-method">{prop.repairMethod}</div>
        )}

        {inc.sensorSnapshot && (
          <div className="ac-sensors">
            <span>Flow: <strong>{inc.sensorSnapshot.flowSensorData ?? "—"}</strong> L/min</span>
            <span>Pressure: <strong>{inc.sensorSnapshot.pressureSensorData ?? "—"}</strong> PSI</span>
            <span>Loss: <strong>{inc.sensorSnapshot.waterLossRate ?? "—"}</strong> L/hr</span>
          </div>
        )}

        <div className="ac-actions">
          {st === "assigned" && (
            <button className="btn btn-success" disabled={busy} onClick={() => changeStatus("accepted")}>
              <Icon name="check" /> Accept assignment
            </button>
          )}
          {st === "accepted" && (
            <button className="btn" disabled={busy} onClick={() => changeStatus("in_progress")}>
              🔧 Start repair
            </button>
          )}
          {st === "in_progress" && (
            <button
              className={`btn btn-ghost${openCompletion ? " btn-outline-primary" : ""}`}
              onClick={() => onToggleCompletion(item._id)}
            >
              <Icon name="clipboard" />
              {openCompletion ? "Hide report form" : "Submit completion report"}
            </button>
          )}
          {st === "completed" && (
            <span className="badge badge-green" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="check" /> Repair submitted — awaiting admin verification
            </span>
          )}
        </div>
      </div>

      {openCompletion && st === "in_progress" && (
        <CompletionForm
          assignment={item}
          proposal={prop}
          onSubmitted={msg => { onCompletionSubmitted(msg); onToggleCompletion(item._id); }}
          onCancel={() => onToggleCompletion(item._id)}
        />
      )}
    </div>
  );
}

// ── Main PlumberPage ──────────────────────────────────────────────────────
export default function PlumberPage() {
  const [pageMsg, setPageMsg]           = useState({ text: "", ok: false });
  const [openForms, setOpenForms]       = useState({});
  const [openCompletions, setOpenCompletions] = useState({});

  const { data, loading, reload } = useLoad(async () => {
    const [requests, proposals, assignments] = await Promise.all([
      api("/plumber/repair-requests"),
      api("/plumber/proposals"),
      api("/plumber/assignments"),
    ]);
    return {
      requests:    Array.isArray(requests)    ? requests    : requests.data    || [],
      proposals:   Array.isArray(proposals)   ? proposals   : proposals.data   || [],
      assignments: Array.isArray(assignments) ? assignments : assignments.data || [],
    };
  });

  useLiveReload(reload);

  // Fallback polling every 15 s so new leak requests appear without SSE
  useEffect(() => {
    const timer = setInterval(() => reload(), 15_000);
    return () => clearInterval(timer);
  }, []);

  function toggleForm(id)       { setOpenForms(p => ({ ...p, [id]: !p[id] })); }
  function toggleCompletion(id) { setOpenCompletions(p => ({ ...p, [id]: !p[id] })); }

  function showMsg(text, isErr = false) {
    setPageMsg({ text, ok: !isErr });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const { requests = [], proposals = [], assignments = [] } = data || {};

  return (
    <>
      <PageHeading
        title="Repair workspace"
        description="Critical alerts · Submit estimates · Manage your assignments"
        action={
          <button className="btn btn-light" onClick={reload}>
            <Icon name="refresh" /> Refresh
          </button>
        }
      />

      {pageMsg.text && (
        <Message kind={pageMsg.ok ? "success" : "error"} onDismiss={() => setPageMsg({ text: "" })}>
          {pageMsg.text}
        </Message>
      )}

      {/* STEP 1: Available repair requests */}
      <section>
        <div className="sec-header">
          <span className="sec-title"><Icon name="alerts" /> Available repair requests</span>
          {requests.length > 0 && (
            <span className="sec-count">{requests.length} open</span>
          )}
        </div>

        {loading && !data ? <Loading /> :
          requests.length === 0 ? (
            <Card>
              <div className="empty-state">
                <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                <p>No open repair requests right now.</p>
                <p style={{ marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
                  You will receive an email notification when a new critical leak is detected.
                </p>
              </div>
            </Card>
          ) : (
            <div className="stack">
              {requests.map(item => (
                <RequestCard
                  key={item._id}
                  item={item}
                  openForm={!!openForms[item._id]}
                  onToggle={toggleForm}
                  onSubmitted={msg => { showMsg(msg); reload(); }}
                />
              ))}
            </div>
          )
        }
      </section>

      {/* STEP 2: My proposals */}
      <section>
        <div className="sec-header">
          <span className="sec-title"><Icon name="clipboard" /> My proposals</span>
          {proposals.length > 0 && <span className="sec-count">{proposals.length}</span>}
        </div>
        {proposals.length === 0 ? (
          <Card><p className="empty">You have not submitted any proposals yet.</p></Card>
        ) : (
          <div className="stack">
            {proposals.map(p => (
              <ProposalCard
                key={p._id}
                p={p}
                onWithdraw={(msg, isErr) => { showMsg(msg, isErr); reload(); }}
              />
            ))}
          </div>
        )}
      </section>

      {/* STEP 3: My assignments */}
      <section>
        <div className="sec-header">
          <span className="sec-title"><Icon name="repair" /> My assignments</span>
          {assignments.length > 0 && <span className="sec-count">{assignments.length}</span>}
        </div>
        {assignments.length === 0 ? (
          <Card><p className="empty">No assignments yet. Submit a proposal and wait for the admin to assign you.</p></Card>
        ) : (
          <div className="stack">
            {assignments.map(item => (
              <AssignmentCard
                key={item._id}
                item={item}
                openCompletion={!!openCompletions[item._id]}
                onToggleCompletion={toggleCompletion}
                onStatusChange={(msg, isErr) => { showMsg(msg, isErr); reload(); }}
                onCompletionSubmitted={msg => { showMsg(msg); reload(); }}
              />
            ))}
          </div>
        )}
      </section>

      <PlumberStyles />
    </>
  );
}

// ── Scoped styles ─────────────────────────────────────────────────────────
function PlumberStyles() {
  return (
    <style>{`
      .stack { display:grid; gap:12px; }
      .sec-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .sec-title  { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); display:flex; align-items:center; gap:6px; }
      .sec-count  { font-size:12px; font-weight:700; color:var(--primary); background:#eff6ff; border:1px solid #bfdbfe; padding:2px 8px; border-radius:20px; }
      .empty-state { text-align:center; padding:24px; color:var(--muted); font-size:13px; }
      .empty { text-align:center; padding:20px; color:var(--muted); font-size:13px; }

      /* Request card */
      .request-card { background:#fff; border:1px solid var(--border); border-radius:8px; overflow:hidden; border-left:4px solid var(--warning); }
      .request-critical { border-left-color:var(--danger)!important; }
      .rc-head  { padding:16px 18px 10px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
      .rc-title { font-size:15px; font-weight:700; margin-bottom:5px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .crit-chip { background:var(--danger-bg); color:var(--danger); font-size:11px; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid var(--danger-bd); }
      .rc-meta  { font-size:12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .rc-sensors { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:0 18px 12px; }
      @media(max-width:600px){ .rc-sensors{grid-template-columns:repeat(2,1fr);} }
      .sensor-box  { background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:10px 12px; text-align:center; }
      .sb-val  { font-size:18px; font-weight:700; }
      .sb-unit { font-size:10px; color:var(--muted); margin-top:2px; text-transform:uppercase; letter-spacing:.04em; }
      .rc-foot { padding:12px 18px 14px; border-top:1px solid var(--border); background:var(--surface-2); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

      /* Proposal form */
      .proposal-form-wrap { background:#f8fafc; border-top:2px solid var(--primary); padding:0; }
      .pf-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px 10px; }
      .pf-title  { font-size:14px; font-weight:700; }
      .pf-grid   { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; padding:0 18px 18px; }
      .pf-label  { display:grid; gap:5px; font-size:13px; font-weight:600; }
      .pf-input  { padding:8px 10px; border:1px solid var(--border-2); border-radius:var(--radius); font:inherit; font-size:13px; }
      .pf-textarea { padding:8px 10px; border:1px solid var(--border-2); border-radius:var(--radius); font:inherit; font-size:13px; min-height:80px; resize:vertical; }
      .pf-textarea-sm { min-height:56px; }
      .pf-total  { display:flex; align-items:center; justify-content:space-between; font-size:14px; font-weight:700; padding:8px 0 4px; color:var(--text); }
      .pf-total-amount { font-size:20px; color:var(--primary); }
      .pf-error  { font-size:13px; color:var(--danger); padding:4px 0; }
      .pf-check  { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:400; cursor:pointer; }
      .req-note  { font-weight:400; color:var(--muted); font-size:11px; }
      .wide { grid-column:1/-1; }
      @media(max-width:600px){ .pf-grid{grid-template-columns:1fr;} }

      /* Proposal card */
      .prop-card  { background:#fff; border:1px solid var(--border); border-radius:8px; padding:16px 18px; }
      .prop-head  { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
      .prop-title { font-size:14px; font-weight:700; }
      .prop-date  { font-size:12px; color:var(--muted); margin-top:2px; }
      .prop-method { font-size:13px; color:var(--text-2); margin-bottom:8px; }
      .prop-costs { display:flex; flex-wrap:wrap; gap:8px 18px; font-size:12px; color:var(--muted); margin-bottom:8px; }
      .prop-costs strong { color:var(--text); font-weight:700; }
      .prop-total strong { font-size:15px; color:var(--primary); }
      .prop-selected { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:var(--success); background:var(--success-bg); border:1px solid var(--success-bd); padding:8px 12px; border-radius:var(--radius); margin-bottom:6px; }

      /* Assignment card */
      .assign-card { background:#fff; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
      .ac-steps { display:flex; border-bottom:1px solid var(--border); }
      .ac-step  { flex:1; padding:8px 6px; text-align:center; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; background:var(--surface-2); color:var(--muted); border-right:1px solid var(--border); }
      .ac-step:last-child { border-right:none; }
      .ac-step.done   { background:var(--success-bg); color:var(--success); }
      .ac-step.active { background:var(--primary); color:#fff; }
      .ac-body    { padding:16px 18px; }
      .ac-head    { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px; flex-wrap:wrap; }
      .ac-title   { font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
      .ac-amounts { font-size:12px; color:var(--muted); }
      .ac-method  { font-size:13px; color:var(--text-2); margin-bottom:8px; }
      .ac-sensors { display:flex; gap:16px; flex-wrap:wrap; font-size:12px; color:var(--muted); margin-bottom:8px; }
      .ac-actions { display:flex; gap:8px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--border); margin-top:10px; }

      /* Shared button extras */
      .btn-success       { background:var(--success)!important; }
      .btn-outline-primary { background:transparent!important; color:var(--primary)!important; border:1.5px solid var(--primary)!important; }
      .btn-ghost.btn-danger { color:var(--danger)!important; border-color:var(--danger-bd)!important; }
      .btn-sm { padding:5px 10px!important; font-size:12px!important; }
    `}</style>
  );
}
