"use client";

import Link from "next/link";
import { AuthGate, PageHeader } from "../../../components/ui-states";

export default function PractitionerPortalPage() {
  return (
    <section className="section">
      <div className="container">
        <AuthGate title="Dentist onboarding">
          <PageHeader
            eyebrow="Dentist · PRACTITIONER"
            title="Professional verification pending"
            lead="Your email and mobile have been verified. Professional verification is still pending."
          />
          <div className="panel stack-lg">
            <p style={{ margin: 0 }}>
              A practice administrator must set your professional verification status before
              scheduling privileges are unlocked. You cannot verify yourself.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Operational status (<code>active</code> / <code>inactive</code>) remains separate from
              professional verification.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-secondary" href="/dashboard">
                Workspace overview
              </Link>
              <Link className="btn btn-ghost" href="/practitioners">
                Practitioner tools
              </Link>
            </div>
          </div>
        </AuthGate>
      </div>
    </section>
  );
}
