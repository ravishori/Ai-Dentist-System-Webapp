"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiRequestError, apiFetch } from "../../lib/api";
import { PageHeader } from "../../components/ui-states";

type Step = "destination" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("destination");
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [destination, setDestination] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function requestOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await apiFetch<{
        challengeId: string | null;
        accepted?: boolean;
        message?: string;
      }>("/api/auth/login/otp/request", {
        method: "POST",
        body: JSON.stringify({ destination, channel }),
      });
      setChallengeId(result.challengeId);
      setInfo(result.message ?? "If an account exists, a verification code was sent.");
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to request a code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeId) {
      setError("Request a verification code first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ redirectTo?: string }>("/api/auth/login/otp/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId, code }),
      });
      router.push(result.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: "34rem" }}>
        <PageHeader
          eyebrow="Passwordless access"
          title="Sign in"
          lead="Use your verified email or mobile number. No passwords."
        />
        <div className="panel stack-lg">
          {step === "destination" ? (
            <form className="stack-lg" onSubmit={requestOtp}>
              <div className="field">
                <label htmlFor="channel">Sign in with</label>
                <select
                  id="channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as "email" | "phone")}
                >
                  <option value="email">Email</option>
                  <option value="phone">Mobile</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="destination">
                  {channel === "email" ? "Email" : "Mobile number"}
                </label>
                <input
                  id="destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                  autoComplete={channel === "email" ? "email" : "tel"}
                  placeholder={channel === "email" ? "you@clinic.example" : "+15551234567"}
                />
              </div>
              {error ? (
                <p className="muted" role="alert" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              ) : null}
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send verification code"}
              </button>
            </form>
          ) : (
            <form className="stack-lg" onSubmit={verifyOtp}>
              {info ? <p className="muted">{info}</p> : null}
              <div className="field">
                <label htmlFor="code">Verification code</label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  pattern="[0-9]{4,10}"
                />
              </div>
              {error ? (
                <p className="muted" role="alert" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              ) : null}
              <div className="hero-actions">
                <button className="btn btn-primary" type="submit" disabled={busy || !challengeId}>
                  {busy ? "Verifying…" : "Verify and continue"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep("destination");
                    setCode("");
                    setChallengeId(null);
                  }}
                >
                  Start over
                </button>
              </div>
            </form>
          )}
          <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
            New here? <Link href="/register/patient">Register as patient</Link>
            {" · "}
            <Link href="/register/dentist">Register as dentist</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
