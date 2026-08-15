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

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string;
  phone?: string;
  status: string;
};

export default function PatientsPage() {
  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Patient domain"
          title="Patients"
          lead="Organization-scoped patient identity from the M3 APIs. Requires a signed-in membership."
        />
        <AuthGate>
          <PatientsWorkspace />
        </AuthGate>
      </div>
    </section>
  );
}

function PatientsWorkspace() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    email: "",
    phone: "",
  });

  const reload = useCallback(async () => {
    setError(null);
    try {
      const body = await apiFetch<{ patients: Patient[] }>("/api/patients");
      setPatients(body.patients);
    } catch (err) {
      setPatients(null);
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
      await apiFetch("/api/patients", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          dateOfBirth: form.dateOfBirth,
          ...(form.email ? { email: form.email } : {}),
          ...(form.phone ? { phone: form.phone } : {}),
        }),
      });
      setForm({ firstName: "", lastName: "", dateOfBirth: "", email: "", phone: "" });
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
        <p className="eyebrow">Create patient</p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              required
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              type="date"
              required
              value={form.dateOfBirth}
              onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email (optional)</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create patient"}
        </button>
      </form>

      {error ? <ErrorState title="Patients request failed" body={error} /> : null}
      {!patients && !error ? <LoadingState /> : null}
      {patients && patients.length === 0 ? (
        <EmptyState
          title="No patients yet"
          body="Create the first patient for this organization."
        />
      ) : null}
      {patients && patients.length > 0 ? (
        <div className="panel table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date of birth</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td>
                    {patient.firstName} {patient.lastName}
                  </td>
                  <td>{patient.dateOfBirth}</td>
                  <td>
                    <span
                      className={`badge ${patient.status === "active" ? "badge-ok" : "badge-neutral"}`}
                    >
                      {patient.status}
                    </span>
                  </td>
                  <td>
                    <Link className="btn btn-ghost" href={`/patients/${patient.id}`}>
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

function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return `${err.message} (HTTP ${err.status})`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}
