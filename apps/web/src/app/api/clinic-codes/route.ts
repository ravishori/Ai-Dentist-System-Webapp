import { handleClinicCodeCreate } from "@dentalcare/application";
import { getAuthorizationPort } from "../../../infrastructure/authz/port";
import { identityFrom } from "../../../infrastructure/practitioner/http";
import { requestedOrganizationId } from "../../../infrastructure/http/organization";
import { identityJsonResponse, readJsonBody } from "../../../infrastructure/identity/http";
import { requireIdentityRuntime } from "../../../infrastructure/identity/require";

export const dynamic = "force-dynamic";

/** Privileged — PRACTICE_ADMIN clinic code create. */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireIdentityRuntime();
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const result = await handleClinicCodeCreate(
    gate.runtime.invitations,
    getAuthorizationPort(),
    await identityFrom(),
    requestedOrganizationId(request),
    body,
  );
  return identityJsonResponse(result, "clinic_code_create");
}
