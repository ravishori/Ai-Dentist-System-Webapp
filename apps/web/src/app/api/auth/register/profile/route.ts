import { handleRegistrationProfile } from "@dentalcare/application";
import { identityJsonResponse, readJsonBody } from "../../../../../infrastructure/identity/http";
import { requireIdentityRuntime } from "../../../../../infrastructure/identity/require";

export const dynamic = "force-dynamic";

/** Public — update registration profile on an active registration session. */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireIdentityRuntime();
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const result = await handleRegistrationProfile(gate.runtime.registration, body);
  return identityJsonResponse(result, "registration_profile");
}
