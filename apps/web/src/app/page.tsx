export default function StatusPage() {
  return (
    <main>
      <h1>DentalCare AI</h1>
      <p>
        Status: <span className="status">ok</span>
      </p>
      <p>
        This is the M0 application shell. It confirms that the web process starts, loads validated
        configuration, and exposes a technical status page.
      </p>
      <p>
        Patient, Appointment, and Notification product workflows are not implemented in this
        milestone.
      </p>
      <p>
        Process health: <code>/api/health</code>
      </p>
    </main>
  );
}
