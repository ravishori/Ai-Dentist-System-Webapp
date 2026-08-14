import { handleAppointmentGet, handleAppointmentPatch } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { readAuthCookies } from "../../../../infrastructure/auth/cookies";
import { requestedOrganizationId } from "../../../../infrastructure/http/organization";
import { getAppointmentService } from "../../../../infrastructure/appointment/service";
import { logAuthenticationEvent } from "../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

async function identityFrom() {
  const cookies = await readAuthCookies();
  return getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
): Promise<Response> {
  const { appointmentId } = await context.params;
  const result = await handleAppointmentGet(getAppointmentService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    appointmentId,
  });
  logAuthenticationEvent({
    event: "appointment_get",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "appointment_get_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
): Promise<Response> {
  const { appointmentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleAppointmentPatch(getAppointmentService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    appointmentId,
    body,
  });
  logAuthenticationEvent({
    event: "appointment_patch",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "appointment_patch_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
