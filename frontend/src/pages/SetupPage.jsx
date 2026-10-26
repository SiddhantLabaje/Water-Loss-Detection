import React, { useState } from "react";
import { AuthCard, Field, Message } from "../App";
import { post } from "../api";

export default function SetupPage() {
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  return (
    <AuthCard
      title={done ? "Admin account created" : "First-time setup"}
      description={
        done
          ? "You can now sign in."
          : "Create the initial administrator account. This only works before an admin exists."
      }
    >
      {done ? (
        <a href="/login" className="btn">
          Go to login
        </a>
      ) : (
        <>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await post(
                  "/auth/bootstrap-admin",
                  Object.fromEntries(new FormData(event.currentTarget))
                );
                setDone(true);
              } catch (e) {
                setMessage(e.message);
              }
            }}
          >
            <Field
              label="Full name"
              name="name"
              required
              minLength={2}
              maxLength={100}
            />
            <Field
              label="Email"
              name="email"
              type="email"
              required
              maxLength={254}
            />
            <Field
              label="Password (12+ characters)"
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              required
            />
            <Field
              label="Setup key"
              name="bootstrapKey"
              type="password"
              required
            />
            <button className="btn">Create admin account</button>
          </form>
          <Message>{message}</Message>
          <p className="notice">
            Remove ADMIN_BOOTSTRAP_KEY from the environment once setup is
            complete.
          </p>
        </>
      )}
    </AuthCard>
  );
}
