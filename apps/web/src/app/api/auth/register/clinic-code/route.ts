import { handleClinicCodeRedeem } from "@dentalcare/application";
import { identityJsonResponse, readJsonBody } from "../../../../../infrastructure/identity/http";
import { requireIdentityRuntime } from "../../../../../infrastructure/identity/require";

export const dynamic = "force-dynamic";

/** Public — redeem clinic code → patient registration session. */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireIdentityRuntime();
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const result = await handleClinicCodeRedeem(gate.runtime.invitations, body, request.headers);
  return identityJsonResponse(result, "clinic_code_redeem");
}
