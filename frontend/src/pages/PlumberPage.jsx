import React, { useState } from "react";
import { api, post, patch, number } from "../api";
import { useLoad, useLiveReload, PageHeading, Card, Badge, Loading, Message, Icon } from "../App";

const sevColor = (s) =>
  s === "HIGH" ? "var(--danger)" : s === "MEDIUM" ? "var(--warning)" : "var(--success)";

const PROP_TONE = {
  submitted: "amber",
  selected: "green",
  not_selected: "gray",
  withdrawn: "gray",
};

const STEP_STATES = ["assigned", "accepted", "in_progress", "completed"];
const STEP_LABELS = ["Assigned", "Accepted", "In progress", "Completed"];

function StepPills({ current }) {
  const idx = STEP_STATES.indexOf(current);
  return (
    <div className="ac-steps">
      {STEP_STATES.map((s, i) => (
        <div
          key={s}
          className={`ac-step${i < idx ? " done" : i === idx ? " active" : ""}`}
        >
          {STEP_LABELS[i]}
        </div>
      ))}
    </div>
  );
}

// ── Proposal form embedded in a request card ──────────────────────────────
function ProposalForm({ incident, onSubmitted }) {
  const [labour, setLabour] = useState(0);
  const [material, setMaterial] = useState(0);
  const [visit, setVisit] = useState(0);
  const [other, setOther] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const total = (Number(labour) || 0) + (Number(material) || 0) + (Number(visit) || 0) + (Number(other) || 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const v = Object.fromEntries(new FormData(e.currentTarget));
      const result = await post(`/plumber/repair-requests/${incident._id}/proposals`, {
        repairMethod: v.repairMethod.trim(),
        labourCharges: Number(v.labourCharges) || 0,
        materialCharges: Number(v.materialCharges) || 0,
        visitCharges: Number(v.visitCharges) || 0,
        otherCharges: Number(v.otherCharges) || 0,
        estimatedDurationHours: Number(v.estimatedDurationHours) || 1,
        earliestAvailability: new Date(v.earliestAvailability).toISOString(),
        warrantyDetails: v.warrantyDetails?.trim() || "",
        notes: v.notes?.trim() || "",
      });
      onSubmitted(`Estimate submitted — total ₹${result.totalEstimatedCharges}. The admin will review and assign the best plumber.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="proposal-form-wrap">
      <h4 style={{ marginBottom: 14, fontSize: 14 }}>
        Your repair estimate for {incident.incidentId}
      </h4>
      <form className="pf-grid" onSubmit={submit}>
        <label className="wide pf-label">
          Repair method / approach{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)" }}>(describe what you will do)</span>
          <textarea
            name="repairMethod"
            required
            minLength={10}
            maxLength={1000}
            placeholder="e.g. Excavate and replace 2m of burst pipe, seal joints, pressure test…"
            className="pf-textarea"
          />
        </label>
        {[
          ["Labour charges (₹)", "labourCharges", setLabour],
          ["Material charges (₹)", "materialCharges", setMaterial],
          ["Visit / travel charges (₹)", "visitCharges", setVisit],
          ["Other charges (₹)", "otherCharges", setOther],
        ].map(([label, name, setter]) => (
          <label key={name} className="pf-label">
            {label}
            <input
              name={name}
              type="number"
              min={0}
              step={1}
              defaultValue={0}
              required={name === "labourCharges" || name === "materialCharges"}
              onChange={(e) => setter(e.target.value)}
              className="pf-input"
            />
          </label>
        ))}
        <label className="pf-label">
          Estimated duration (hours)
          <input name="estimatedDurationHours" type="number" min={0.5} step={0.5} required placeholder="e.g. 3" className="pf-input" />
        </label>
        <label className="pf-label">
          Earliest availability
          <input name="earliestAvailability" type="datetime-local" required className="pf-input" />
        </label>
        <label className="wide pf-label">
          Warranty details{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
          <textarea name="warrantyDetails" maxLength={500} placeholder="e.g. 6-month warranty on all replaced parts" className="pf-textarea" />
        </label>
        <label className="wide pf-label">
          Additional notes{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
          <textarea name="notes" maxLength={1000} className="pf-textarea" />
        </label>
        <div className="wide pf-total">Total estimate: ₹{total.toLocaleString()}</div>
        {err && <div className="wide" style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
        <button className="btn wide" type="submit" disabled={busy} style={{ background: "var(--success)" }}>
          {busy ? "Submitting…" : <><Icon name="check" /> Submit estimate to admin</>}
        </button>
      </form>
    </div>
  );
}

// ── Completion report form ────────────────────────────────────────────────
function CompletionForm({ assignment, proposal, onSubmitted }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const v = Object.fromEntries(new FormData(e.currentTarget));
      const result = await post(`/plumber/assignments/${assignment._id}/completion-report`, {
        workDescription: v.workDescription.trim(),
        partsUsed: v.partsUsed?.trim() || "",
        labourCharges: Number(v.labourCharges) || 0,
        materialCharges: Number(v.materialCharges) || 0,
        completionNotes: v.completionNotes?.trim() || "",
        furtherWorkRequired: e.currentTarget.elements.furtherWorkRequired.checked,
      });
      onSubmitted(result.message);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inc = assignment.incidentId || {};

  return (
    <div className="completion-form-wrap">
      <h4 style={{ marginBottom: 14, fontSize: 14 }}>
        Completion report for {inc.incidentId || "this incident"}
      </h4>
      <form className="pf-grid" onSubmit={submit}>
        <label className="wide pf-label">
          Work performed{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)" }}>(describe exactly what was done)</span>
          <textarea name="workDescription" required minLength={10} maxLength={5000} placeholder="Describe all work carried out…" className="pf-textarea" />
        </label>
        <label className="wide pf-label">
          Parts and materials used{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
          <textarea name="partsUsed" maxLength={2000} placeholder="List materials, part numbers, quantities…" className="pf-textarea" />
        </label>
        <label className="pf-label">
          Final labour charges (₹)
          <input name="labourCharges" type="number" min={0} step={1} required placeholder={proposal?.labourCharges || 0} className="pf-input" />
        </label>
        <label className="pf-label">
          Final material charges (₹)
          <input name="materialCharges" type="number" min={0} step={1} required placeholder={proposal?.materialCharges || 0} className="pf-input" />
        </label>
        <label className="wide pf-label">
          Completion notes{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
          <textarea name="completionNotes" maxLength={3000} placeholder="Any notes for the admin about the repair outcome…" className="pf-textarea" />
        </label>
        <label className="wide" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 400, fontSize: 13, cursor: "pointer" }}>
          <input name="furtherWorkRequired" type="checkbox" style={{ width: 16, height: 16 }} />
          Further work is required (e.g. waiting for parts, inspection needed)
        </label>
        {err && <div className="wide" style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
        <button className="btn wide" type="submit" disabled={busy} style={{ background: "var(--success)" }}>
          {busy ? "Submitting…" : <><Icon name="check" /> Submit completion report</>}
        </button>
      </form>
    </div>
  );
}

// ── Main PlumberPage ──────────────────────────────────────────────────────
export default function PlumberPage() {
  const [pageMsg, setPageMsg] = useState({ text: "", ok: false });
  const [openForms, setOpenForms] = useState({});    // proposalForm by incident id
  const [openCompletions, setOpenCompletions] = useState({}); // completionForm by assignment id

  const { data, loading, reload } = useLoad(async () => {
    const [requests, proposals, assignments] = await Promise.all([
      api("/plumber/repair-requests"),
      api("/plumber/proposals"),
      api("/plumber/assignments"),
    ]);
    return {
      requests: requests.data || [],
      proposals: Array.isArray(proposals) ? proposals : proposals.data || [],
      assignments: Array.isArray(assignments) ? assignments : assignments.data || [],
    };
  });

  useLiveReload(reload);

  function toggleForm(id, group, setter) {
    setter((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function changeStatus(assignmentId, status) {
    try {
      await patch(`/plumber/assignments/${assignmentId}/status`, { status });
      setPageMsg({
        text: status === "accepted" ? "Assignment accepted." : "Repair started. Good luck!",
        ok: true,
      });
      reload();
    } catch (e) {
      setPageMsg({ text: e.message, ok: false });
    }
  }

  async function withdrawProposal(proposalId) {
    if (!window.confirm("Withdraw this proposal?")) return;
    try {
      await post(`/plumber/proposals/${proposalId}/withdraw`, { reason: "Withdrawn by plumber." });
      setPageMsg({ text: "Proposal withdrawn.", ok: true });
      reload();
    } catch (e) {
      setPageMsg({ text: e.message, ok: false });
    }
  }

  const { requests = [], proposals = [], assignments = [] } = data || {};

  return (
    <>
      <PageHeading
        title="Repair workspace"
        description="Leak requests · Your proposals · Active assignments"
        action={
          <button className="btn btn-light" onClick={reload}>
            <Icon name="refresh" /> Refresh
          </button>
        }
      />

      {pageMsg.text && (
        <Message kind={pageMsg.ok ? "success" : "error"}>{pageMsg.text}</Message>
      )}

      {/* STEP 1: Available repair requests */}
      <section>
        <div className="sec-header">
          <span className="sec-title">
            <Icon name="alerts" /> Available repair requests
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {requests.length > 0 ? `${requests.length} open` : ""}
          </span>
        </div>

        {loading && !data ? (
          <Loading />
        ) : requests.length === 0 ? (
          <Card>
            <p className="empty">
              No open repair requests right now. You will be notified by email when a new leak is
              detected.
            </p>
          </Card>
        ) : (
          <div className="stack">
            {requests.map((item) => {
              const sev = (item.severity || "").toUpperCase();
              const ss = item.sensorSnapshot || {};
              const det = ss.detectedAt ? new Date(ss.detectedAt).toLocaleString() : "Unknown";
              const isOpen = openForms[item._id];

              return (
                <div className="request-card" key={item._id}>
                  <div className="rc-head">
                    <div>
                      <div className="rc-title">
                        {item.incidentId}
                        {ss.overallSystemStatus === "CRITICAL" && (
                          <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 800, marginLeft: 8 }}>
                            <><Icon name="alerts" /> CRITICAL ALERT</>
                          </span>
                        )}
                        &nbsp;
                        <span style={{ color: sevColor(sev), fontSize: 13, fontWeight: 700 }}>
                          {sev} SEVERITY
                        </span>
                      </div>
                      <div className="rc-meta">
                        <span><Icon name="clock" /> Detected: {det}</span>
                        <span><Icon name="loss" /> Water loss: <strong>{ss.waterLossRate != null ? Number(ss.waterLossRate).toFixed(2) : "—"} L/hr</strong></span>
                      </div>
                    </div>
                    <Badge tone="amber">Open for proposals</Badge>
                  </div>

                  <div className="rc-sensors">
                    {[
                      [ss.flowSensorData, "Flow (L/min)", false],
                      [ss.pressureSensorData, "Pressure (PSI)", false],
                      [ss.tankLevelSensorData, "Tank level (%)", false],
                      [ss.waterLossRate != null ? Number(ss.waterLossRate).toFixed(2) : "0.00", "Water loss (L/hr)", true],
                    ].map(([val, unit, highlight]) => (
                      <div
                        key={unit}
                        className="sensor-box"
                        style={highlight ? { borderColor: "var(--danger-bd)", background: "var(--danger-bg)" } : undefined}
                      >
                        <div className="sb-val" style={highlight ? { color: "var(--danger)" } : undefined}>
                          {val ?? "—"}
                        </div>
                        <div className="sb-unit">{unit}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rc-foot">
                    <button
                      className="btn"
                      onClick={() => toggleForm(item._id, "forms", setOpenForms)}
                    >
                      <><Icon name="document" /> {isOpen ? "Hide estimate form" : "Submit cost estimate"}</>
                    </button>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Review sensor data above and submit your repair estimate
                    </span>
                  </div>

                  {isOpen && (
                    <ProposalForm
                      incident={item}
                      onSubmitted={(msg) => {
                        setPageMsg({ text: msg, ok: true });
                        setOpenForms((prev) => ({ ...prev, [item._id]: false }));
                        reload();
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* STEP 2: My proposals */}
      <section>
        <div className="sec-header">
          <span className="sec-title"><Icon name="clipboard" /> My proposals</span>
        </div>
        {proposals.length === 0 ? (
          <Card>
            <p className="empty">You have not submitted any proposals yet.</p>
          </Card>
        ) : (
          <div className="stack">
            {proposals.map((p) => {
              const inc = p.incidentId || {};
              return (
                <div className="prop-card" key={p._id}>
                  <div className="prop-head">
                    <h3>{inc.incidentId || "Incident"} — your estimate</h3>
                    <Badge tone={PROP_TONE[p.status] || "gray"}>
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="prop-costs">
                    <span>Labour: <strong>₹{p.labourCharges}</strong></span>
                    <span>Materials: <strong>₹{p.materialCharges}</strong></span>
                    {p.visitCharges > 0 && <span>Visit: <strong>₹{p.visitCharges}</strong></span>}
                    <span>Duration: <strong>{p.estimatedDurationHours} hrs</strong></span>
                    <span>Total: <strong style={{ fontSize: 15, color: "var(--primary)" }}>₹{p.totalEstimatedCharges}</strong></span>
                    <span>Submitted: {new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 8 }}>{p.repairMethod}</div>
                  {p.status === "selected" && (
                    <div className="badge badge-green" style={{ display: "inline-flex" }}>
                      <><Icon name="check" /> Your proposal was selected — check assignments below</>
                    </div>
                  )}
                  {p.status === "submitted" && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => withdrawProposal(p._id)}
                      style={{ color: "var(--danger)", borderColor: "var(--danger-bd)" }}
                    >
                      Withdraw proposal
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* STEP 3: My assignments */}
      <section>
        <div className="sec-header">
          <span className="sec-title"><Icon name="repair" /> My assignments</span>
        </div>
        {assignments.length === 0 ? (
          <Card>
            <p className="empty">No assignments yet. Submit a proposal and wait for admin selection.</p>
          </Card>
        ) : (
          <div className="stack">
            {assignments.map((item) => {
              const inc = item.incidentId || {};
              const prop = item.selectedProposalId || {};
              const st = item.status;
              const showCompletion = openCompletions[item._id];

              return (
                <div className="assign-card-plumber" key={item._id}>
                  <StepPills current={st} />
                  <div className="ac-head">
                    <div>
                      <div className="ac-title">{inc.incidentId || "Incident"} — your assignment</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Severity: <strong>{(inc.severity || "").toUpperCase()}</strong> ·
                        Agreed amount: <strong style={{ color: "var(--primary)" }}>₹{prop.totalEstimatedCharges ?? "—"}</strong>
                      </div>
                    </div>
                    <Badge
                      tone={
                        st === "completed"
                          ? "green"
                          : st === "in_progress"
                          ? "blue"
                          : "amber"
                      }
                    >
                      {st.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <div className="ac-body">
                    <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 10 }}>
                      {prop.repairMethod || "—"}
                    </div>
                    {inc.sensorSnapshot && (
                      <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span>Flow: <strong>{inc.sensorSnapshot?.flowSensorData ?? "—"}</strong> L/min</span>
                        <span>Pressure: <strong>{inc.sensorSnapshot?.pressureSensorData ?? "—"}</strong> PSI</span>
                        <span>Water loss: <strong>{inc.sensorSnapshot?.waterLossRate ?? "—"}</strong> L/hr</span>
                      </div>
                    )}
                  </div>

                  <div className="ac-foot">
                    {st === "assigned" && (
                      <button
                        className="btn"
                        style={{ background: "var(--success)" }}
                        onClick={() => changeStatus(item._id, "accepted")}
                      >
                        Accept assignment
                      </button>
                    )}
                    {st === "accepted" && (
                      <button className="btn" onClick={() => changeStatus(item._id, "in_progress")}>
                        Start repair
                      </button>
                    )}
                    {st === "in_progress" && (
                      <button
                        className="btn btn-ghost"
                        onClick={() =>
                          setOpenCompletions((prev) => ({ ...prev, [item._id]: !prev[item._id] }))
                        }
                      >
                        <><Icon name="clipboard" /> {showCompletion ? "Hide report" : "Submit completion report"}</>
                      </button>
                    )}
                    {st === "completed" && (
                      <span className="badge badge-green"><Icon name="check" /> Repair submitted — awaiting admin verification</span>
                    )}
                  </div>

                  {showCompletion && (
                    <CompletionForm
                      assignment={item}
                      proposal={prop}
                      onSubmitted={(msg) => {
                        setPageMsg({ text: msg, ok: true });
                        setOpenCompletions((prev) => ({ ...prev, [item._id]: false }));
                        reload();
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <style>{`
        .stack   { display: grid; gap: 12px; }
        .sec-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .sec-title  { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }

        /* Request card */
        .request-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; border-left: 4px solid var(--danger); }
        .rc-head { padding: 16px 18px 12px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
        .rc-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
        .rc-meta  { font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 10px; }
        .rc-sensors { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; padding: 0 18px 14px; }
        .sensor-box  { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; text-align: center; }
        .sb-val  { font-size: 18px; font-weight: 700; }
        .sb-unit { font-size: 10px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .04em; }
        .rc-foot { padding: 12px 18px; border-top: 1px solid var(--border); background: var(--surface-2); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        @media(max-width:700px) { .rc-sensors { grid-template-columns: repeat(2,1fr); } }

        /* Proposal form */
        .proposal-form-wrap { display: block; background: #f8fafc; border-top: 2px solid var(--primary); padding: 18px; }
        .pf-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
        .pf-label { display: grid; gap: 5px; font-size: 13px; font-weight: 600; }
        .pf-input { padding: 8px 10px; border: 1px solid var(--border-2); border-radius: var(--radius); font: inherit; }
        .pf-textarea { padding: 8px 10px; border: 1px solid var(--border-2); border-radius: var(--radius); font: inherit; min-height: 70px; resize: vertical; }
        .pf-total { font-size: 14px; font-weight: 700; color: var(--primary); padding: 10px 0 4px; }
        .wide { grid-column: 1 / -1; }
        @media(max-width:600px) { .pf-grid { grid-template-columns: 1fr; } }

        /* Completion form */
        .completion-form-wrap { display: block; background: #f8fafc; border-top: 2px solid var(--success); padding: 18px; }

        /* Proposal status card */
        .prop-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; }
        .prop-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
        .prop-head h3 { font-size: 14px; font-weight: 700; }
        .prop-costs { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
        .prop-costs strong { color: var(--text); }

        /* Assignment card */
        .assign-card-plumber { background: #fff; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .ac-steps { display: flex; gap: 0; border-bottom: 1px solid var(--border); }
        .ac-step { flex: 1; padding: 8px 6px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; background: var(--surface-2); color: var(--muted); border-right: 1px solid var(--border); }
        .ac-step:last-child { border-right: none; }
        .ac-step.done   { background: var(--success-bg); color: var(--success); }
        .ac-step.active { background: var(--primary); color: #fff; }
        .ac-head { padding: 16px 18px 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
        .ac-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
        .ac-body  { padding: 0 18px 14px; }
        .ac-foot  { padding: 10px 18px; border-top: 1px solid var(--border); background: var(--surface-2); display: flex; gap: 8px; flex-wrap: wrap; }
      `}</style>
    </>
  );
}
