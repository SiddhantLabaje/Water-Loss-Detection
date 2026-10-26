import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

// Pages
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import InvitePage from "./pages/InvitePage";
import SetupPage from "./pages/SetupPage";
import AdminPage from "./pages/AdminPage";
import PlumberPage from "./pages/PlumberPage";
import MonitoringPage from "./pages/MonitoringPage";
import SensorsPage from "./pages/SensorsPage";
import PredictionsPage from "./pages/PredictionsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import AlertsPage from "./pages/AlertsPage";
import DashboardDataPage from "./pages/DashboardDataPage";

// Utils
import { api, post } from "./api";

// Styles
import "./style.css";

// Create session context
const SessionContext = createContext(null);

export function useSession() {
  return useContext(SessionContext);
}

// Route aliases for backward compatibility
const aliases = {
  "/": "/login",
  "/sensors": "/sensors",
  "/sensor-data": "/sensor-data",
};

// Page titles
const routeTitles = {
  "/monitoring": ["Water monitoring", "Live status, sensor readings and leak alerts"],
  "/sensors": ["Sensor readings", "Live sensor measurements and history"],
  "/sensor-data": ["Sensor data", "Raw sensor readings"],
  "/predictions": ["ML predictions", "Leak detection, anomalies and prediction history"],
  "/analytics": ["Analytics", "Consumption, loss estimates and system forecasts"],
  "/alerts": ["Alerts", "Critical and warning events"],
  "/admin": ["Administration", "Incidents, proposals, plumbers and assignments"],
  "/plumber": ["Repair workspace", "Requests, proposals and repair assignments"],
  "/dashboard-data": ["Dashboard data", "Latest daily analytics record"],
};

function App() {
  const [session, setSession] = useState({ loading: true, user: null, profile: null });
  const navigate = useNavigate();
  const location = useLocation();

  const refreshSession = async () => {
    try {
      const data = await api("/auth/me");
      setSession({ loading: false, user: data.user, profile: data.profile });
      return data;
    } catch (error) {
      setSession({ loading: false, user: null, profile: null });
      return null;
    }
  };

  useEffect(() => {
    // Handle aliases
    if (aliases[location.pathname] && location.pathname !== aliases[location.pathname]) {
      navigate(aliases[location.pathname], { replace: true });
      return;
    }
    refreshSession();
  }, [location.pathname]);

  const context = useMemo(
    () => ({ ...session, refreshSession }),
    [session]
  );

  return (
    <SessionContext.Provider value={context}>
      <Routes>
        {/* Auth pages */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/accept-invite" element={<InvitePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/setup" element={<SetupPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedLayout />}>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/plumber" element={<PlumberPage />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/sensor-data" element={<SensorsPage raw />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/dashboard-data" element={<DashboardDataPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}

function ProtectedLayout() {
  const { loading, user, profile } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  const adminOnly = ["/admin"].includes(location.pathname);
  const plumberOnly = ["/plumber"].includes(location.pathname);

  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/plumber" replace />;
  }
  if (plumberOnly && user.role !== "plumber") {
    return <Navigate to="/admin" replace />;
  }
  if (
    !adminOnly &&
    !plumberOnly &&
    !["admin", "plumber"].includes(user.role)
  ) {
    return <Navigate to="/login" replace />;
  }

  // Check plumber approval
  if (plumberOnly && profile?.approvalStatus !== "approved") {
    return (
      <AppShell>
        <PlumberPending profile={profile} user={user} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/plumber" element={<PlumberPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/sensors" element={<SensorsPage />} />
        <Route path="/sensor-data" element={<SensorsPage raw />} />
        <Route path="/predictions" element={<PredictionsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/dashboard-data" element={<DashboardDataPage />} />
      </Routes>
    </AppShell>
  );
}

function AppShell({ children }) {
  const { user } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const adminLinks = [
    ["/admin", "🏛️  Administration"],
    ["/monitoring", "📊 Monitoring dashboard"],
    ["/sensors", "📈 Sensors"],
    ["/predictions", "🤖 Predictions"],
    ["/analytics", "📉 Analytics"],
    ["/alerts", "🚨 Alerts"],
  ];

  const plumberLinks =
    user.role === "plumber"
      ? [
          ["/plumber", "🔧 Repair workspace"],
          ...(user.accountStatus === "active"
            ? [
                ["/monitoring", "📊 Monitoring dashboard"],
                ["/sensors", "📈 Sensors"],
                ["/predictions", "🤖 Predictions"],
                ["/analytics", "📉 Analytics"],
                ["/alerts", "🚨 Alerts"],
              ]
            : []),
        ]
      : adminLinks;

  const title = routeTitles[location.pathname] || ["Smart Water", ""];

  async function logout() {
    await post("/auth/logout").catch(() => {});
    navigate("/login", { replace: true });
    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to={user.role === "admin" ? "/admin" : "/plumber"} className="brand">
          <span className="brand-icon">💧</span>
          <span>
            <strong>Smart Water</strong>
            <small>{user.role === "admin" ? "Admin portal" : "Plumber portal"}</small>
          </span>
        </Link>
        <div className="side-label">Workspace</div>
        <nav className="side-nav">
          {plumberLinks.map(([href, label]) => (
            <NavLink
              key={href}
              to={href}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>{user.name}</span>
          <button className="btn btn-outline full" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title[0]}</h1>
            <p>{title[1]}</p>
          </div>
          <span className="session-chip">{user.role}</span>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

export function Loading({ text = "Loading…" }) {
  return (
    <div className="loading-screen">
      <span className="spinner" />
      {text}
    </div>
  );
}

export function Message({ children, kind = "error" }) {
  return children ? (
    <div className={`message ${kind}`} role="status">
      {children}
    </div>
  ) : null;
}

export function PageHeading({ title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Card({ title, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {title && <h3 className="card-title">{title}</h3>}
      {children}
    </section>
  );
}

export function Metric({ label, value, hint, color = "blue" }) {
  return (
    <div className={`metric metric-${color}`}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <small>{hint}</small>
    </div>
  );
}

export function DataTable({ columns, rows, empty = "No records found." }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.length ? (
            rows.map((row, i) => (
              <tr key={row._id || row.incidentId || i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.render ? c.render(row, i) : row[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ children, tone = "gray" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Pagination({ page, pages, onChange }) {
  return (
    <div className="pagination">
      <button
        className="btn btn-light"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {Math.max(pages, 1)}
      </span>
      <button
        className="btn btn-light"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

export function useLoad(loader, dependencies = []) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: "",
  });

  const reload = async () => {
    setState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    try {
      const data = await loader();
      setState({ data, loading: false, error: "" });
      return data;
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.message,
      }));
      throw error;
    }
  };

  useEffect(() => {
    reload().catch(() => {});
  }, dependencies);

  return { ...state, reload };
}

export function useLiveReload(reload) {
  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.addEventListener("snapshot", () => reload().catch(() => {}));
    return () => source.close();
  }, [reload]);
}

export function AuthCard({ title, description, children, width = "narrow" }) {
  return (
    <main className={`auth-page auth-${width}`}>
      <section className="auth-card">
        <Link className="brand auth-brand" to="/login">
          <span className="brand-icon">💧</span>
          <span>
            <strong>Smart Water</strong>
            <small>Leak detection & repair</small>
          </span>
        </Link>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  );
}

export function Field({ label, name, type = "text", ...props }) {
  return (
    <label className="field">
      {label}
      <input name={name} type={type} {...props} />
    </label>
  );
}

function PlumberPending({ user, profile }) {
  const rejected =
    user.accountStatus === "rejected" || profile?.approvalStatus === "rejected";
  return (
    <Card
      title={
        rejected ? "Application not approved" : "Account pending approval"
      }
    >
      <p>
        {rejected
          ? "Contact an administrator for more information."
          : "An administrator must approve your plumber profile before repair requests are available."}
      </p>
    </Card>
  );
}

export default App;
