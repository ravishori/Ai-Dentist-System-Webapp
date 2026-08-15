import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <section className="hero" aria-label="DentalCare AI">
        <div className="container hero-content">
          <p className="eyebrow">Dental practice operations · Milestone M7</p>
          <p className="hero-brand">DentalCare AI</p>
          <h1 className="hero-title">Clinic workflows for patients, appointments, and practitioners.</h1>
          <p className="hero-copy">
            A calm operations workspace built on the implemented M1–M7 APIs—advisory availability,
            lifecycle appointments, and organization-scoped records.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/dashboard">
              Enter workspace
            </Link>
            <Link className="btn btn-secondary" href="/status">
              System status
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">What is live in the platform</p>
            <h2 className="display">Capabilities already implemented in the API</h2>
            <p className="muted">
              Screens below map only to existing backend routes. Features that need Cognito remain
              gated while authentication is unset.
            </p>
          </div>
          <div className="grid-3">
            <Link className="feature-link" href="/patients">
              <h3>Patients</h3>
              <p>Create, list, update, and archive organization-scoped patient records.</p>
            </Link>
            <Link className="feature-link" href="/appointments">
              <h3>Appointments</h3>
              <p>Schedule, reschedule, cancel, and run the M6 clinic lifecycle commands.</p>
            </Link>
            <Link className="feature-link" href="/practitioners">
              <h3>Practitioners</h3>
              <p>Profiles, branch assignment, schedules, leave, and advisory availability.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container panel">
          <p className="eyebrow">Operating posture</p>
          <h2 className="display" style={{ margin: "0.4rem 0 0.75rem", fontSize: "1.55rem" }}>
            Safe staging defaults
          </h2>
          <div className="grid-2">
            <p className="muted" style={{ margin: 0 }}>
              Authentication uses <code>AUTH_PROVIDER=unset</code> until Cognito is provisioned.
              Protected APIs continue to require a signed-in membership.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Appointment notification delivery stays fail-closed. Process health remains at{" "}
              <code>/api/health</code>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
