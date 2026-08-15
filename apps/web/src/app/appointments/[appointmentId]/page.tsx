"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, apiFetch } from "../../../lib/api";
import { AuthGate, ErrorState, LoadingState, PageHeader } from "../../../components/ui-states";

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

const ACTIONS = [
  { key: "confirm", label: "Confirm" },
  { key: "check-in", label: "Check in" },
  { key: "start", label: "Start" },
  { key: "complete", label: "Complete" },
  { key: "no-show", label: "No-show" },
  { key: "cancel", label: "Cancel" },
] as const;

export default function AppointmentDetailPage() {
  const params = useParams<{ appointmentId: string }>();
  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Appointment detail"
          title="Visit actions"
          lead="Drive lifecycle transitions and reschedule against existing appointment endpoints."
        />
        <AuthGate>
          <AppointmentDetail appointmentId={params.appointmentId} />
        </AuthGate>
      </div>
    </section>
  );
}

function AppointmentDetail({ appointmentId }: { appointmentId: string }) {
  const [item, setItem] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState({
    startAtLocal: "",
    endAtLocal: "",
    timezone: "Asia/Singapore",
  });

  const reload = useCallback(async () => {
    setError(null);
    try {
      const body = await apiFetch<{ appointment: Appointment }>(
        `/api/appointments/${appointmentId}`,
      );
      setItem(body.appointment);
      setReschedule((current) => ({
        ...current,
        timezone: body.appointment.timezone || current.timezone,
      }));
    } catch (err) {
      setItem(null);
      setError(describeError(err));
    }
  }, [appointmentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runAction(action: string) {
    setBusy(action);
    setError(null);
    try {
      const body = await apiFetch<{ appointment: Appointment }>(
        `/api/appointments/${appointmentId}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      setItem(body.appointment);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  async function onReschedule(event: FormEvent) {
    event.preventDefault();
    setBusy("reschedule");
    setError(null);
    try {
      const body = await apiFetch<{ appointment: Appointment }>(
        `/api/appointments/${appointmentId}/reschedule`,
        {
          method: "POST",
          body: JSON.stringify({
            startAtUtc: new Date(reschedule.startAtLocal).toISOString(),
            endAtUtc: new Date(reschedule.endAtLocal).toISOString(),
            timezone: reschedule.timezone.trim(),
          }),
        },
      );
      setItem(body.appointment);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  if (!item && !error) {
    return <LoadingState label="Loading appointment…" />;
  }
  if (error && !item) {
    return <ErrorState title="Appointment not available" body={error} />;
  }
  if (!item) {
    return null;
  }

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <Link className="btn btn-ghost" href="/appointments">
          ← Appointments
        </Link>
        <span className="badge badge-neutral">{item.status}</span>
      </div>
      {error ? <ErrorState title="Action failed" body={error} /> : null}

      <div className="panel stack">
        <p className="eyebrow">Visit {item.id}</p>
        <div className="grid-2">
          <p style={{ margin: 0 }}>
            <strong>Starts</strong>
            <br />
            {new Date(item.startAtUtc).toLocaleString()}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Ends</strong>
            <br />
            {new Date(item.endAtUtc).toLocaleString()}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Timezone</strong>
            <br />
            {item.timezone}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Branch</strong>
            <br />
            <code>{item.branchId}</code>
          </p>
          <p style={{ margin: 0 }}>
            <strong>Patient</strong>
            <br />
            <Link href={`/patients/${item.patientId}`}>{item.patientId}</Link>
          </p>
          <p style={{ margin: 0 }}>
            <strong>Practitioner</strong>
            <br />
            <Link href={`/practitioners/${item.practitionerId}`}>{item.practitionerId}</Link>
          </p>
        </div>
      </div>

      <div className="panel stack">
        <p className="eyebrow">Lifecycle actions</p>
        <div className="row-actions">
          {ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`btn ${action.key === "cancel" ? "btn-danger" : "btn-secondary"}`}
              disabled={busy !== null}
              onClick={() => void runAction(action.key)}
            >
              {busy === action.key ? "Working…" : action.label}
            </button>
          ))}
        </div>
      </div>

      <form className="panel stack" onSubmit={onReschedule}>
        <p className="eyebrow">Reschedule</p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Allowed for REQUESTED and CONFIRMED only. Practitioner cannot be changed via this API.
        </p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="startAtLocal">New start (local browser)</label>
            <input
              id="startAtLocal"
              type="datetime-local"
              required
              value={reschedule.startAtLocal}
              onChange={(e) => setReschedule((f) => ({ ...f, startAtLocal: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="endAtLocal">New end (local browser)</label>
            <input
              id="endAtLocal"
              type="datetime-local"
              required
              value={reschedule.endAtLocal}
              onChange={(e) => setReschedule((f) => ({ ...f, endAtLocal: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <input
              id="timezone"
              required
              value={reschedule.timezone}
              onChange={(e) => setReschedule((f) => ({ ...f, timezone: e.target.value }))}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy !== null}>
          {busy === "reschedule" ? "Rescheduling…" : "Reschedule"}
        </button>
      </form>
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return `${err.message} (HTTP ${err.status})`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}
