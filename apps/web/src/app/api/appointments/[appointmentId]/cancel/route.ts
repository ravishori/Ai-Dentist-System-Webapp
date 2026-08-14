import { handleAppointmentCancel } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../../../infrastructure/auth/port";
import { readAuthCookies } from "../../../../../infrastructure/auth/cookies";
import { requestedOrganizationId } from "../../../../../infrastructure/http/organization";
import { getAppointmentService } from "../../../../../infrastructure/appointment/service";
import { logAuthenticationEvent } from "../../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
): Promise<Response> {
  const cookies = await readAuthCookies();
  const { appointmentId } = await context.params;
  const result = await handleAppointmentCancel(getAppointmentService(), {
    identity: await getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie }),
    organizationId: requestedOrganizationId(request),
    appointmentId,
  });
  logAuthenticationEvent({
    event: "appointment_cancel",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "appointment_cancel_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
