import { handleOtpRequest } from "@dentalcare/application";
import { identityJsonResponse, readJsonBody } from "../../../../../infrastructure/identity/http";
import { requireIdentityRuntime } from "../../../../../infrastructure/identity/require";

export const dynamic = "force-dynamic";

/** Public — registration OTP request (email/phone). */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireIdentityRuntime();
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const result = await handleOtpRequest(gate.runtime.otp, body, request.headers);
  return identityJsonResponse(result, "otp_request");
}
