import { handleAppointmentReschedule } from "@dentalcare/application";
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
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleAppointmentReschedule(getAppointmentService(), {
    identity: await getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie }),
    organizationId: requestedOrganizationId(request),
    appointmentId,
    body,
  });
  logAuthenticationEvent({
    event: "appointment_reschedule",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "appointment_reschedule_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
