"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  getStoredOrganizationId,
  loadAuthCapability,
  setStoredOrganizationId,
  type AuthCapability,
} from "../lib/api";

export function OrgContextBar() {
  const [organizationId, setOrganizationId] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOrganizationId(getStoredOrganizationId());
  }, []);

  return (
    <div className="panel">
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setStoredOrganizationId(organizationId);
          setSaved(true);
        }}
      >
        <div className="field" style={{ flex: "1 1 18rem" }}>
          <label htmlFor="organizationId">Organization context</label>
          <input
            id="organizationId"
            name="organizationId"
            value={organizationId}
            onChange={(event) => {
              setSaved(false);
              setOrganizationId(event.target.value);
            }}
            placeholder="org_…"
            autoComplete="off"
          />
        </div>
        <button className="btn btn-secondary" type="submit">
          Save for this browser
        </button>
      </form>
      <p className="muted" style={{ margin: "0.75rem 0 0", fontSize: "0.9rem" }}>
        Tenant APIs require an organization id via <code>x-organization-id</code>. There is no
        public organization directory API yet, so operators supply the known staging org id.
        {saved ? " Saved locally." : null}
      </p>
    </div>
  );
}

export function AuthGate({
  children,
  title = "Signed-in workspace required",
}: {
  children: ReactNode;
  title?: string;
}) {
  const [auth, setAuth] = useState<AuthCapability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAuthCapability()
      .then((value) => {
        if (!cancelled) {
          setAuth(value);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to determine session state.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="gate" role="alert">
        <h2>{title}</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="state-box" aria-busy="true">
        <div className="skeleton" style={{ width: "40%" }} />
        <div className="skeleton" style={{ width: "70%" }} />
        <div className="skeleton" style={{ width: "55%" }} />
      </div>
    );
  }

  if (!auth.authenticated) {
    return (
      <div className="gate" role="status">
        <h2>{title}</h2>
        {auth.authConfigured === false ? (
          <>
            <p>
              Authentication is currently <strong>unset</strong> in this environment. Live patient,
              appointment, and practitioner APIs remain protected and will return 401 until Cognito
              is provisioned and <code>AUTH_PROVIDER=managed</code>.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {auth.authMessage ?? "Login is fail-closed by design."}
            </p>
            <div className="hero-actions" style={{ marginTop: "0.35rem" }}>
              <Link className="btn btn-secondary" href="/status">
                View system status
              </Link>
              <Link className="btn btn-ghost" href="/dashboard">
                Capability map
              </Link>
            </div>
          </>
        ) : (
          <>
            <p>Sign in to access organization-scoped records for this workspace.</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/api/auth/login">
                Sign in
              </a>
              <Link className="btn btn-ghost" href="/status">
                System status
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <OrgContextBar />
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-box" aria-busy="true" aria-label={label}>
      <div className="skeleton" style={{ width: "35%" }} />
      <div className="skeleton" style={{ width: "80%" }} />
      <div className="skeleton" style={{ width: "60%" }} />
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="state-box">
      <h3>{title}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

export function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <div className="gate" role="alert">
      <h3>{title}</h3>
      <p style={{ margin: 0 }}>{body}</p>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
}) {
  return (
    <div className="section-head">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="page-title">{title}</h1>
      <p className="page-lead">{lead}</p>
    </div>
  );
}
