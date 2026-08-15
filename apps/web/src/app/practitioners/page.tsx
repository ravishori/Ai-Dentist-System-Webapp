"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiRequestError, apiFetch } from "../../lib/api";
import {
  AuthGate,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../../components/ui-states";

type Practitioner = {
  id: string;
  organizationId: string;
  userId: string;
  displayName: string | null;
  status: string;
};

type Assignment = {
  id: string;
  branchId: string;
  createdAt: string;
};

type PractitionerRow = {
  practitioner: Practitioner;
  assignments: Assignment[];
};

export default function PractitionersPage() {
  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Practitioner domain"
          title="Practitioners"
          lead="Profiles and branch assignments from the M7 APIs. Create requires an existing application user id."
        />
        <AuthGate>
          <PractitionersWorkspace />
        </AuthGate>
      </div>
    </section>
  );
}

function PractitionersWorkspace() {
  const [rows, setRows] = useState<PractitionerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ userId: "", displayName: "" });

  const reload = useCallback(async () => {
    setError(null);
    try {
      const body = await apiFetch<{ practitioners: PractitionerRow[] }>("/api/practitioners");
      setRows(body.practitioners);
    } catch (err) {
      setRows(null);
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiFetch("/api/practitioners", {
        method: "POST",
        body: JSON.stringify({
          userId: form.userId.trim(),
          ...(form.displayName.trim() ? { displayName: form.displayName.trim() } : {}),
        }),
      });
      setForm({ userId: "", displayName: "" });
      await reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack-lg">
      <form className="panel stack" onSubmit={onCreate}>
        <p className="eyebrow">Create practitioner</p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Only <code>userId</code> and optional <code>displayName</code> are accepted. There is no
          public user directory API — supply a known application user id.
        </p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="userId">Linked user id</label>
            <input
              id="userId"
              required
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="displayName">Display name (optional)</label>
            <input
              id="displayName"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create practitioner"}
        </button>
      </form>

      <div className="toolbar">
        <button className="btn btn-secondary" type="button" onClick={() => void reload()}>
          Refresh
        </button>
      </div>

      {error ? <ErrorState title="Practitioners request failed" body={error} /> : null}
      {!rows && !error ? <LoadingState label="Loading practitioners…" /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState title="No practitioners" body="Create a clinician profile linked to a user id." />
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="panel table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Branches</th>
                <th>User</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ practitioner, assignments }) => (
                <tr key={practitioner.id}>
                  <td>{practitioner.displayName ?? "—"}</td>
                  <td>
                    <span
                      className={`badge ${
                        practitioner.status === "active" ? "badge-ok" : "badge-neutral"
                      }`}
                    >
                      {practitioner.status}
                    </span>
                  </td>
                  <td>{assignments.length}</td>
                  <td>
                    <code>{shortId(practitioner.userId)}</code>
                  </td>
                  <td>
                    <Link className="btn btn-ghost" href={`/practitioners/${practitioner.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return `${err.message} (HTTP ${err.status})`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}
