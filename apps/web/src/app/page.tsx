export default function StatusPage() {
  return (
    <main>
      <h1>DentalCare AI</h1>
      <p>
        Status: <span className="status">ok</span>
      </p>
      <p>
        This is the M7 application shell. Public routes remain available. Authentication uses Amazon
        Cognito User Pools behind AuthenticationPort. Authorization uses application-owned
        organization membership and RBAC. Organization-scoped patient identity, appointments, and
        practitioner management are implemented. Appointment operations follow the approved M6
        lifecycle. Practitioner availability is internal and advisory only. Appointment notification
        delivery remains a disabled-by-default worker with a fake adapter in tests. Real SMTP remains
        off until explicit production configuration is present.
      </p>
      <p>
        Process health: <code>/api/health</code>
      </p>
    </main>
  );
}
