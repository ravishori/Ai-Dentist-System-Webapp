"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiRequestError, apiFetch } from "../../../lib/api";
import { PageHeader } from "../../../components/ui-states";

type Purpose = "PATIENT" | "PRACTITIONER";

type Step = "invite" | "details" | "email_otp" | "phone_otp" | "address" | "complete";

export function RegistrationWizard({
  purpose,
  title,
  lead,
}: {
  purpose: Purpose;
  title: string;
  lead: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("invite");
  const [tokenOrCode, setTokenOrCode] = useState("");
  const [useClinicCode, setUseClinicCode] = useState(purpose === "PATIENT");
  const [sessionId, setSessionId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [emailChallengeId, setEmailChallengeId] = useState("");
  const [phoneChallengeId, setPhoneChallengeId] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    type: "HOME" as const,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownHint, setCooldownHint] = useState<string | null>(null);

  const steps = useMemo(() => {
    const base: Step[] = ["invite", "details", "email_otp", "phone_otp", "address", "complete"];
    return base;
  }, []);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (purpose === "PATIENT" && useClinicCode) {
        const result = await apiFetch<{ registrationSessionId: string }>(
          "/api/auth/register/clinic-code",
          { method: "POST", body: JSON.stringify({ code: tokenOrCode }) },
        );
        setSessionId(result.registrationSessionId);
      } else {
        const result = await apiFetch<{ registrationSessionId: string }>(
          "/api/auth/register/invitation",
          {
            method: "POST",
            body: JSON.stringify({ token: tokenOrCode, purpose }),
          },
        );
        setSessionId(result.registrationSessionId);
      }
      setStep("details");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to redeem invite.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/register/profile", {
        method: "POST",
        body: JSON.stringify({
          registrationSessionId: sessionId,
          firstName,
          lastName,
          displayName: displayName || undefined,
          email,
          phone,
        }),
      });
      const issued = await apiFetch<{ challengeId: string }>("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({
          destinationType: "EMAIL",
          destination: email,
          purpose: "REGISTRATION_EMAIL",
          registrationSessionId: sessionId,
        }),
      });
      setEmailChallengeId(issued.challengeId);
      setStep("email_otp");
    } catch (err) {
      setError(mapOtpError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: emailChallengeId, code: emailCode }),
      });
      const issued = await apiFetch<{ challengeId: string }>("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({
          destinationType: "PHONE",
          destination: phone,
          purpose: "REGISTRATION_PHONE",
          registrationSessionId: sessionId,
        }),
      });
      setPhoneChallengeId(issued.challengeId);
      setStep("phone_otp");
    } catch (err) {
      setError(mapOtpError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: phoneChallengeId, code: phoneCode }),
      });
      setStep("address");
    } catch (err) {
      setError(mapOtpError(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAddressAndComplete(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/register/profile", {
        method: "POST",
        body: JSON.stringify({
          registrationSessionId: sessionId,
          address,
        }),
      });
      const result = await apiFetch<{ redirectTo?: string }>("/api/auth/register/complete", {
        method: "POST",
        body: JSON.stringify({
          registrationSessionId: sessionId,
          dateOfBirth: purpose === "PATIENT" ? dateOfBirth : undefined,
        }),
      });
      setStep("complete");
      router.push(
        result.redirectTo ?? (purpose === "PATIENT" ? "/portal/patient" : "/portal/practitioner"),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to complete registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: "40rem" }}>
        <PageHeader eyebrow="Self-registration" title={title} lead={lead} />
        <p className="muted" style={{ marginTop: 0 }}>
          Step {steps.indexOf(step) + 1} of {steps.length}
        </p>
        <div className="panel stack-lg">
          {error ? (
            <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
              {error}
            </p>
          ) : null}
          {cooldownHint ? <p className="muted">{cooldownHint}</p> : null}

          {step === "invite" ? (
            <form className="stack-lg" onSubmit={redeem}>
              {purpose === "PATIENT" ? (
                <div className="field">
                  <label htmlFor="mode">Join with</label>
                  <select
                    id="mode"
                    value={useClinicCode ? "code" : "invite"}
                    onChange={(e) => setUseClinicCode(e.target.value === "code")}
                  >
                    <option value="code">Clinic code</option>
                    <option value="invite">Invitation token</option>
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="token">
                  {purpose === "PRACTITIONER" || !useClinicCode
                    ? "Invitation token"
                    : "Clinic code"}
                </label>
                <input
                  id="token"
                  value={tokenOrCode}
                  onChange={(e) => setTokenOrCode(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : null}

          {step === "details" ? (
            <form className="stack-lg" onSubmit={saveDetails}>
              <div className="field">
                <label htmlFor="firstName">First name</label>
                <input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              {purpose === "PRACTITIONER" ? (
                <div className="field">
                  <label htmlFor="displayName">Display name</label>
                  <input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Dr Example"
                  />
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="dob">Date of birth</label>
                  <input
                    id="dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="phone">Mobile</label>
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="+1…"
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Continue to email verification"}
              </button>
            </form>
          ) : null}

          {step === "email_otp" ? (
            <form className="stack-lg" onSubmit={verifyEmail}>
              <p className="muted">Enter the code sent to your email.</p>
              <div className="field">
                <label htmlFor="emailCode">Email code</label>
                <input
                  id="emailCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Verifying…" : "Verify email"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setCooldownHint("Resend is server-rate-limited. Wait before retrying.");
                  void apiFetch("/api/auth/otp/request", {
                    method: "POST",
                    body: JSON.stringify({
                      destinationType: "EMAIL",
                      destination: email,
                      purpose: "REGISTRATION_EMAIL",
                      registrationSessionId: sessionId,
                    }),
                  })
                    .then((r) => setEmailChallengeId((r as { challengeId: string }).challengeId))
                    .catch((err) => setError(mapOtpError(err)));
                }}
              >
                Resend email code
              </button>
            </form>
          ) : null}

          {step === "phone_otp" ? (
            <form className="stack-lg" onSubmit={verifyPhone}>
              <p className="muted">Enter the code sent to your mobile.</p>
              <div className="field">
                <label htmlFor="phoneCode">Mobile code</label>
                <input
                  id="phoneCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Verifying…" : "Verify mobile"}
              </button>
            </form>
          ) : null}

          {step === "address" ? (
            <form className="stack-lg" onSubmit={saveAddressAndComplete}>
              <div className="field">
                <label htmlFor="line1">Address line 1</label>
                <input
                  id="line1"
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="line2">Address line 2</label>
                <input
                  id="line2"
                  value={address.line2}
                  onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="state">State / region</label>
                <input
                  id="state"
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="postal">Postal code</label>
                <input
                  id="postal"
                  value={address.postalCode}
                  onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="country">Country</label>
                <input
                  id="country"
                  value={address.country}
                  onChange={(e) => setAddress({ ...address, country: e.target.value })}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Finishing…" : "Complete registration"}
              </button>
            </form>
          ) : null}

          <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
            Already registered? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function mapOtpError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.body.error === "resend_cooldown") return "Please wait before requesting another code.";
    if (err.body.error === "rate_limited") return "Too many attempts. Try again later.";
    if (err.body.error === "expired") return "That code expired. Request a new one.";
    if (err.body.error === "max_attempts")
      return "Too many incorrect attempts. Request a new code.";
    if (err.body.error === "delivery_disabled")
      return "SMS delivery is not configured in this environment.";
    return err.message;
  }
  return "Something went wrong.";
}
