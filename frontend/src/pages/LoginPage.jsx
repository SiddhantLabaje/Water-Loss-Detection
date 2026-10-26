import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../App";
import { AuthCard, Field, Message } from "../App";
import { post } from "../api";

export default function LoginPage() {
  const { user, loading, refreshSession } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate(user.role === "admin" ? "/admin" : "/plumber", {
        replace: true,
      });
    }
  }, [loading, user]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await post("/auth/login", Object.fromEntries(new FormData(event.currentTarget)));
      const data = await refreshSession();
      navigate(data?.user.role === "admin" ? "/admin" : "/plumber", {
        replace: true,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your Smart Water Monitor portal."
    >
      <form className="form-stack" onSubmit={submit}>
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <button className="btn full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <Message>{error}</Message>
      <div className="auth-links">
        <a href="/register">Register as a plumber</a>
        <a href="/reset-password">Forgot password?</a>
        <a href="/setup">First-time setup</a>
      </div>
    </AuthCard>
  );
}
