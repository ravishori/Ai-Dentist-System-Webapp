import { handleAppointmentCreate, handleAppointmentList } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../infrastructure/auth/port";
import { readAuthCookies } from "../../../infrastructure/auth/cookies";
import { requestedOrganizationId } from "../../../infrastructure/http/organization";
import { getAppointmentService } from "../../../infrastructure/appointment/service";
import { logAuthenticationEvent } from "../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

async function identityFrom() {
  const cookies = await readAuthCookies();
  return getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie });
}

export async function GET(request: Request): Promise<Response> {
  const result = await handleAppointmentList(getAppointmentService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    query: new URL(request.url).searchParams,
  });
  logAuthenticationEvent({
    event: "appointment_list",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "appointment_list_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleAppointmentCreate(getAppointmentService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    body,
  });
  logAuthenticationEvent({
    event: "appointment_create",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "appointment_create_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
