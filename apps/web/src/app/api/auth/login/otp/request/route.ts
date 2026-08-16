import { handlePasswordlessLoginStart } from "@dentalcare/application";
import { identityJsonResponse, readJsonBody } from "../../../../../../infrastructure/identity/http";
import { requireIdentityRuntime } from "../../../../../../infrastructure/identity/require";

export const dynamic = "force-dynamic";

/** Public — passwordless login OTP request (enumeration-safe). */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireIdentityRuntime();
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const result = await handlePasswordlessLoginStart(
    gate.runtime.otp,
    gate.runtime.users,
    body,
    request.headers,
  );
  return identityJsonResponse(result, "login_otp_request");
}
