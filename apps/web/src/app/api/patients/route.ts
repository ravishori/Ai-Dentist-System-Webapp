import { handlePatientCreate, handlePatientList } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../infrastructure/auth/port";
import { readAuthCookies } from "../../../infrastructure/auth/cookies";
import { requestedOrganizationId } from "../../../infrastructure/http/organization";
import { getPatientService } from "../../../infrastructure/patient/service";
import { logAuthenticationEvent } from "../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

async function identityFrom() {
  const cookies = await readAuthCookies();
  return getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie });
}

export async function GET(request: Request): Promise<Response> {
  const result = await handlePatientList(getPatientService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
  });
  logAuthenticationEvent({
    event: "patient_list",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "patient_list_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handlePatientCreate(getPatientService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    body,
  });
  logAuthenticationEvent({
    event: "patient_create",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "patient_create_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
