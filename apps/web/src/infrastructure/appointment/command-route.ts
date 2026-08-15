import type { AuthenticatedIdentity } from "@dentalcare/domain";
import type { AppointmentHttpResult } from "@dentalcare/application";
import { getAuthenticationPort } from "../auth/port";
import { readAuthCookies } from "../auth/cookies";
import { requestedOrganizationId } from "../http/organization";
import { logAuthenticationEvent } from "../auth/log";

export async function postAppointmentCommand(
  request: Request,
  appointmentId: string,
  event: string,
  handle: (input: {
    identity: AuthenticatedIdentity | null;
    organizationId: string | undefined;
    appointmentId: string;
    body: Record<string, unknown>;
  }) => Promise<AppointmentHttpResult>,
): Promise<Response> {
  const cookies = await readAuthCookies();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handle({
    identity: await getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie }),
    organizationId: requestedOrganizationId(request),
    appointmentId,
    body,
  });
  logAuthenticationEvent({
    event,
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : `${event}_denied`,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
