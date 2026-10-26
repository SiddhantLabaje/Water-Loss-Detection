import React, { useState } from "react";
import { AuthCard, Field, Message } from "../App";

export default function InvitePage() {
  const [message, setMessage] = useState("");
  const token = new URLSearchParams(window.location.search).get("token");

  return (
    <AuthCard
      title="Activate plumber account"
      description="Set a password to accept your administrator invitation."
    >
      {!token ? (
        <Message>Invitation token is missing.</Message>
      ) : (
        <>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage(
                "The invitation activation endpoint is not available on this server version."
              );
            }}
          >
            <Field
              label="Password (12+ characters)"
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              required
            />
            <button className="btn">Activate account</button>
          </form>
          <Message>{message}</Message>
        </>
      )}
      <a href="/login">Sign in</a>
    </AuthCard>
  );
}
