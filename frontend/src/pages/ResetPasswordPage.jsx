import React, { useState } from "react";
import { AuthCard, Field, Message } from "../App";
import { post } from "../api";

export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("success");

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    try {
      const result = await post(
        token ? "/auth/reset-password" : "/auth/forgot-password",
        {
          ...(token ? { token } : {}),
          ...Object.fromEntries(new FormData(form)),
        }
      );
      setMessage(result.message);
    } catch (error) {
      setKind("error");
      setMessage(error.message);
    }
  }

  return (
    <AuthCard
      title="Password reset"
      description="Request a single-use reset link or choose a new password from your email link."
    >
      <form className="form-stack" onSubmit={submit}>
        {token ? (
          <Field
            label="New password (12+ characters)"
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
          />
        ) : (
          <Field
            label="Email"
            name="email"
            type="email"
            maxLength={254}
            required
          />
        )}
        <button className="btn">
          {token ? "Reset password" : "Request reset link"}
        </button>
      </form>
      <Message kind={kind}>{message}</Message>
      <a href="/login">Back to sign in</a>
    </AuthCard>
  );
}
