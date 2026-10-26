import React, { useState } from "react";
import { AuthCard, Field, Message } from "../App";
import { post } from "../api";

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("error");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) {
      setMessage("Passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const result = await post("/auth/register", {
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
        businessName: values.businessName,
        address: values.address,
        city: values.city,
        state: values.state,
        serviceRadiusKm: Number(values.serviceRadiusKm),
        experienceYears: Number(values.experienceYears),
        skills: values.skillsText
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
        workingHours: values.workingHours,
        termsAccepted: values.terms === "on",
      });
      event.currentTarget.reset();
      setKind("success");
      setMessage(result.message);
    } catch (error) {
      setKind("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      width="wide"
      title="Plumber registration"
      description="Your account remains pending until an administrator approves your profile."
    >
      <form className="form-grid" onSubmit={submit}>
        <Field
          label="Full name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
        />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          required
          minLength={7}
          maxLength={30}
          autoComplete="tel"
        />
        <Field
          label="Business name (optional)"
          name="businessName"
          maxLength={120}
        />
        <Field
          label="Password (12+ characters)"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
        <Field
          label="Street address"
          name="address"
          required
          minLength={3}
          maxLength={200}
        />
        <Field label="City" name="city" required minLength={2} maxLength={100} />
        <Field
          label="State / region"
          name="state"
          required
          minLength={2}
          maxLength={100}
        />
        <Field
          label="Service radius (km)"
          name="serviceRadiusKm"
          type="number"
          min={1}
          max={500}
          defaultValue={25}
          required
        />
        <Field
          label="Experience (years)"
          name="experienceYears"
          type="number"
          min={0}
          max={80}
          defaultValue={0}
          required
        />
        <Field
          label="Skills (comma separated)"
          name="skillsText"
          required
          placeholder="Leak repair, pipe fitting"
        />
        <Field
          label="Working hours (optional)"
          name="workingHours"
          maxLength={200}
        />
        <label className="check-field span-all">
          <input name="terms" type="checkbox" required /> I agree to the
          platform terms and privacy policy.
        </label>
        <button className="btn span-all" disabled={busy}>
          {busy ? "Creating account…" : "Create plumber account"}
        </button>
      </form>
      <Message kind={kind}>{message}</Message>
      <a href="/login">Already registered? Sign in</a>
    </AuthCard>
  );
}
