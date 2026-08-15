import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../../components/ui-states";

export const metadata: Metadata = {
  title: "Workspace",
};

const AREAS = [
  {
    href: "/patients",
    title: "Patients",
    body: "Organization-scoped identity, contact fields, and notification consent flags.",
    api: "GET/POST /api/patients",
  },
  {
    href: "/appointments",
    title: "Appointments",
    body: "Create, list, reschedule, cancel, and run confirm → check-in → start → complete / no-show.",
    api: "GET/POST /api/appointments + lifecycle commands",
  },
  {
    href: "/practitioners",
    title: "Practitioners",
    body: "Profiles, branch assignment, weekly schedules, dated unavailability, advisory availability.",
    api: "GET/POST /api/practitioners…",
  },
  {
    href: "/status",
    title: "System status",
    body: "Health probe, auth configuration gate, and notification fail-closed posture.",
    api: "GET /api/health · /api/auth/session · /api/auth/login",
  },
] as const;

export default function DashboardPage() {
  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Operations workspace"
          title="DentalCare AI workspace"
          lead="Navigate the M1–M7 surfaces that already exist in the API. Interactive data views require a signed-in membership and an organization id."
        />
        <div className="metrics">
          <div className="metric">
            <strong>M7</strong>
            <span>Current milestone</span>
          </div>
          <div className="metric">
            <strong>Auth unset</strong>
            <span>Cognito not enabled yet</span>
          </div>
          <div className="metric">
            <strong>SMTP off</strong>
            <span>Notifications fail-closed</span>
          </div>
          <div className="metric">
            <strong>Staging</strong>
            <span>Render Singapore</span>
          </div>
        </div>
        <div className="grid-2">
          {AREAS.map((area) => (
            <Link key={area.href} className="feature-link" href={area.href}>
              <h3>{area.title}</h3>
              <p>{area.body}</p>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                {area.api}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
