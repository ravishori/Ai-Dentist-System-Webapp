"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiRequestError, apiFetch } from "../../lib/api";
import {
  AuthGate,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../../components/ui-states";

type Appointment = {
  id: string;
  organizationId: string;
  branchId: string;
  patientId: string;
  practitionerId: string;
  status: string;
  startAtUtc: string;
  endAtUtc: string;
  timezone: string;
};

const STATUS_OPTIONS = [
  "",
  "REQUESTED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export default function AppointmentsPage() {
  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Appointment domain"
          title="Appointments"
          lead="Create visits and list organization-scoped appointments from the M5/M6 APIs. Requires a signed-in membership."
        />
        <AuthGate>
          <AppointmentsWorkspace />
        </AuthGate>
      </div>
    </section>
  );
}

function AppointmentsWorkspace() {
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    branchId: "",
    patientId: "",
    practitionerId: "",
    startAtLocal: "",
    endAtLocal: "",
    timezone: "Asia/Singapore",
  });

  const reload = useCallback(async () => {
    setError(null);
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const body = await apiFetch<{ appointments: Appointment[] }>(`/api/appointments${query}`);
      setItems(body.appointments);
    } catch (err) {
      setItems(null);
      setError(describeError(err));
    }
  }, [status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiFetch("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.branchId.trim(),
          patientId: form.patientId.trim(),
          practitionerId: form.practitionerId.trim(),
          startAtUtc: localInputToIso(form.startAtLocal),
          endAtUtc: localInputToIso(form.endAtLocal),
          timezone: form.timezone.trim(),
        }),
      });
      setForm({
        branchId: "",
        patientId: "",
        practitionerId: "",
        startAtLocal: "",
        endAtLocal: "",
        timezone: form.timezone,
      });
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
        <p className="eyebrow">Create appointment</p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Branch, patient, and practitioner ids must already exist. Availability is advisory only —
          the booking API does not enforce free slots.
        </p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="branchId">Branch id</label>
            <input
              id="branchId"
              required
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="patientId">Patient id</label>
            <input
              id="patientId"
              required
              value={form.patientId}
              onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="practitionerId">Practitioner id</label>
            <input
              id="practitionerId"
              required
              value={form.practitionerId}
              onChange={(e) => setForm((f) => ({ ...f, practitionerId: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone (IANA)</label>
            <input
              id="timezone"
              required
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="startAtLocal">Starts (local browser)</label>
            <input
              id="startAtLocal"
              type="datetime-local"
              required
              value={form.startAtLocal}
              onChange={(e) => setForm((f) => ({ ...f, startAtLocal: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="endAtLocal">Ends (local browser)</label>
            <input
              id="endAtLocal"
              type="datetime-local"
              required
              value={form.endAtLocal}
              onChange={(e) => setForm((f) => ({ ...f, endAtLocal: e.target.value }))}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create appointment"}
        </button>
      </form>

      <div className="toolbar">
        <div className="field" style={{ minWidth: "12rem" }}>
          <label htmlFor="statusFilter">Status filter</label>
          <select id="statusFilter" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All"}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => void reload()}>
          Refresh
        </button>
      </div>

      {error ? <ErrorState title="Appointments request failed" body={error} /> : null}
      {!items && !error ? <LoadingState label="Loading appointments…" /> : null}
      {items && items.length === 0 ? (
        <EmptyState
          title="No appointments"
          body="Create a visit above using known branch, patient, and practitioner ids."
        />
      ) : null}
      {items && items.length > 0 ? (
        <div className="panel table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>Status</th>
                <th>Patient</th>
                <th>Practitioner</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {new Date(item.startAtUtc).toLocaleString()}
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      → {new Date(item.endAtUtc).toLocaleTimeString()} · {item.timezone}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{item.status}</span>
                  </td>
                  <td>
                    <code>{shortId(item.patientId)}</code>
                  </td>
                  <td>
                    <code>{shortId(item.practitionerId)}</code>
                  </td>
                  <td>
                    <Link className="btn btn-ghost" href={`/appointments/${item.id}`}>
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

function localInputToIso(value: string): string {
  return new Date(value).toISOString();
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
