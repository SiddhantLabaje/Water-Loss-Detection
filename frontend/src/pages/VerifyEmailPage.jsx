import React, { useEffect, useState } from "react";
import { AuthCard, Message } from "../App";
import { post } from "../api";

export default function VerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token) {
      setMessage("Verification token is missing.");
      return;
    }
    post("/auth/verify-email", { token })
      .then((r) => setMessage(r.message))
      .catch((e) => setMessage(e.message));
  }, [token]);

  return (
    <AuthCard
      title="Email verification"
      description={message}
    >
      <a href="/login" className="btn">Continue to sign in</a>
    </AuthCard>
  );
}
