import { handleOrganizationAuthorizeGet } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { getAuthorizationPort } from "../../../../infrastructure/authz/port";
import { readAuthCookies } from "../../../../infrastructure/auth/cookies";
import { requestedOrganizationId } from "../../../../infrastructure/http/organization";
import { logAuthenticationEvent } from "../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const cookies = await readAuthCookies();
  const identity = await getAuthenticationPort().readSession({
    sessionCookie: cookies.sessionCookie,
  });
  const url = new URL(request.url);
  const result = await handleOrganizationAuthorizeGet(getAuthorizationPort(), {
    identity,
    requestedOrganizationId: requestedOrganizationId(request),
    permission: url.searchParams.get("action") ?? "organization.read",
  });
  logAuthenticationEvent({
    event: "authorization_probe",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "authorization_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
