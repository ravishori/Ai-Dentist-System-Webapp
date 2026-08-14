export default function StatusPage() {
  return (
    <main>
      <h1>DentalCare AI</h1>
      <p>
        Status: <span className="status">ok</span>
      </p>
      <p>
        This is the M3 application shell. Public routes remain available. Authentication uses Amazon
        Cognito User Pools behind AuthenticationPort. Authorization uses application-owned
        organization membership and RBAC. Organization-scoped patient identity is implemented.
        Appointment and Notification product workflows are not implemented in this milestone.
      </p>
      <p>
        Process health: <code>/api/health</code>
      </p>
    </main>
  );
}
