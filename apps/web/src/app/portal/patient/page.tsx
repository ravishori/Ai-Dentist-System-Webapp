"use client";

import Link from "next/link";
import { AuthGate, PageHeader } from "../../../components/ui-states";

export default function PatientPortalPage() {
  return (
    <section className="section">
      <div className="container">
        <AuthGate title="Patient portal">
          <PageHeader
            eyebrow="Patient"
            title="Welcome"
            lead="Your account is linked to your clinic patient record. Continue to the patients workspace for staff tools, or stay here for your portal landing."
          />
          <div className="panel stack-lg">
            <p className="muted" style={{ margin: 0 }}>
              C3 patient registration completed. Clinical features remain organization-scoped and
              permission-gated.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/patients">
                Open patients workspace
              </Link>
              <Link className="btn btn-secondary" href="/dashboard">
                Dashboard
              </Link>
            </div>
          </div>
        </AuthGate>
      </div>
    </section>
  );
}
