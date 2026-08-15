"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiRequestError, apiFetch } from "../../../lib/api";
import { AuthGate, ErrorState, LoadingState, PageHeader } from "../../../components/ui-states";

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string;
  phone?: string;
  status: string;
  appointmentNotificationConsent: boolean;
  appointmentNotificationOptOut: boolean;
};

export default function PatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Patient detail"
          title="Patient record"
          lead="View and update fields exposed by PATCH /api/patients/:id."
        />
        <AuthGate>
          <PatientDetail patientId={params.patientId} />
        </AuthGate>
      </div>
    </section>
  );
}

function PatientDetail({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const body = await apiFetch<{ patient: Patient }>(`/api/patients/${patientId}`);
      setPatient(body.patient);
    } catch (err) {
      setPatient(null);
      setError(describeError(err));
    }
  }, [patientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!patient) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = await apiFetch<{ patient: Patient }>(`/api/patients/${patientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          email: patient.email ?? null,
          phone: patient.phone ?? null,
          status: patient.status,
          appointmentNotificationConsent: patient.appointmentNotificationConsent,
          appointmentNotificationOptOut: patient.appointmentNotificationOptOut,
        }),
      });
      setPatient(body.patient);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  if (!patient && !error) {
    return <LoadingState />;
  }
  if (error && !patient) {
    return <ErrorState title="Patient not available" body={error} />;
  }
  if (!patient) {
    return null;
  }

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <Link className="btn btn-ghost" href="/patients">
          ← Patients
        </Link>
        <span className="badge badge-neutral">{patient.id}</span>
      </div>
      {error ? <ErrorState title="Update failed" body={error} /> : null}
      <form className="panel stack" onSubmit={onSave}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              value={patient.firstName}
              onChange={(e) => setPatient({ ...patient, firstName: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              value={patient.lastName}
              onChange={(e) => setPatient({ ...patient, lastName: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              type="date"
              value={patient.dateOfBirth}
              onChange={(e) => setPatient({ ...patient, dateOfBirth: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={patient.status}
              onChange={(e) => setPatient({ ...patient, status: e.target.value })}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={patient.email ?? ""}
              onChange={(e) => setPatient({ ...patient, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              value={patient.phone ?? ""}
              onChange={(e) => setPatient({ ...patient, phone: e.target.value })}
            />
          </div>
        </div>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={patient.appointmentNotificationConsent}
              onChange={(e) =>
                setPatient({ ...patient, appointmentNotificationConsent: e.target.checked })
              }
            />{" "}
            Appointment notification consent
          </span>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={patient.appointmentNotificationOptOut}
              onChange={(e) =>
                setPatient({ ...patient, appointmentNotificationOptOut: e.target.checked })
              }
            />{" "}
            Appointment notification opt-out
          </span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
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
