export default function StatusPage() {
  return (
    <main>
      <h1>DentalCare AI</h1>
      <p>
        Status: <span className="status">ok</span>
      </p>
      <p>
        This is the M5 application shell. Public routes remain available. Authentication uses Amazon
        Cognito User Pools behind AuthenticationPort. Authorization uses application-owned
        organization membership and RBAC. Organization-scoped patient identity and appointments are
        implemented. Appointment notification delivery is implemented as a disabled-by-default
        worker with a fake adapter in tests. Real SMTP remains off until explicit production
        configuration is present.
      </p>
      <p>
        Process health: <code>/api/health</code>
      </p>
    </main>
  );
}
