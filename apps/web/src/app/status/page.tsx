"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, apiFetch, loadAuthCapability, type AuthCapability } from "../../lib/api";
import { ErrorState, LoadingState, PageHeader } from "../../components/ui-states";

type HealthResponse = {
  status: string;
  service: string;
  milestone: string;
  timestamp: string;
};

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [auth, setAuth] = useState<AuthCapability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [healthBody, authBody] = await Promise.all([
          apiFetch<HealthResponse>("/api/health"),
          loadAuthCapability(),
        ]);
        if (!cancelled) {
          setHealth(healthBody);
          setAuth(authBody);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Status probe failed.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Observability"
          title="System status"
          lead="Public health plus authentication and notification posture for this staging deployment."
        />
        {error ? <ErrorState title="Unable to load status" body={error} /> : null}
        {!error && (!health || !auth) ? <LoadingState label="Loading system status" /> : null}
        {health && auth ? (
          <div className="grid-2">
            <div className="panel stack">
              <p className="eyebrow">Process health</p>
              <div>
                <span className={`badge ${health.status === "ok" ? "badge-ok" : "badge-warn"}`}>
                  {health.status}
                </span>
              </div>
              <p style={{ margin: 0 }}>
                Service <strong>{health.service}</strong> · milestone{" "}
                <strong>{health.milestone}</strong>
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                Checked at {new Date(health.timestamp).toLocaleString()}
              </p>
            </div>
            <div className="panel stack">
              <p className="eyebrow">Authentication</p>
              <div>
                <span
                  className={`badge ${
                    auth.authenticated
                      ? "badge-ok"
                      : auth.authConfigured === false
                        ? "badge-warn"
                        : "badge-neutral"
                  }`}
                >
                  {auth.authenticated
                    ? "signed in"
                    : auth.authConfigured === false
                      ? "provider unset"
                      : "signed out"}
                </span>
              </div>
              <p style={{ margin: 0 }}>
                {auth.authenticated
                  ? `Session user ${auth.session?.userId}`
                  : auth.authConfigured === false
                    ? "AUTH_PROVIDER is unset. Login remains fail-closed."
                    : "Ready for Cognito sign-in when configured."}
              </p>
              {auth.authMessage ? (
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  {auth.authMessage}
                </p>
              ) : null}
            </div>
            <div className="panel stack">
              <p className="eyebrow">Notifications</p>
              <div>
                <span className="badge badge-warn">processing disabled</span>
              </div>
              <p style={{ margin: 0 }}>
                Staging keeps <code>NOTIFICATION_PROCESSING_ENABLED=false</code> and real SMTP
                delivery off. Outbox rows may exist after appointment events, but no mail is sent.
              </p>
            </div>
            <div className="panel stack">
              <p className="eyebrow">Protected API sample</p>
              <UnauthProbe />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function UnauthProbe() {
  const [result, setResult] = useState<string>("Checking…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await apiFetch("/api/patients");
        if (!cancelled) {
          setResult("Unexpected success — session may already be authenticated.");
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiRequestError) {
            setResult(
              `Patients API correctly returned HTTP ${error.status} (${error.body.error ?? "error"}).`,
            );
          } else {
            setResult("Probe failed unexpectedly.");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <p style={{ margin: 0 }}>{result}</p>;
}
