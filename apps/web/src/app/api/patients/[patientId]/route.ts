import { handlePatientGet, handlePatientPatch } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { readAuthCookies } from "../../../../infrastructure/auth/cookies";
import { requestedOrganizationId } from "../../../../infrastructure/http/organization";
import { getPatientService } from "../../../../infrastructure/patient/service";
import { logAuthenticationEvent } from "../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

async function identityFrom() {
  const cookies = await readAuthCookies();
  return getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ patientId: string }> },
): Promise<Response> {
  const { patientId } = await context.params;
  const result = await handlePatientGet(getPatientService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    patientId,
  });
  logAuthenticationEvent({
    event: "patient_get",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "patient_get_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ patientId: string }> },
): Promise<Response> {
  const { patientId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handlePatientPatch(getPatientService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    patientId,
    body,
  });
  logAuthenticationEvent({
    event: "patient_update",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "patient_update_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
