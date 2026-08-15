import type { AuthenticatedIdentity } from "@dentalcare/domain";
import type { PractitionerHttpResult } from "@dentalcare/application";
import { getAuthenticationPort } from "../auth/port";
import { readAuthCookies } from "../auth/cookies";
import { requestedOrganizationId } from "../http/organization";
import { logAuthenticationEvent } from "../auth/log";

export async function identityFrom() {
  const cookies = await readAuthCookies();
  return getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie });
}

export async function postPractitionerCommand(
  request: Request,
  event: string,
  handle: (input: {
    identity: AuthenticatedIdentity | null;
    organizationId: string | undefined;
    body: Record<string, unknown>;
  }) => Promise<PractitionerHttpResult>,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handle({
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    body,
  });
  logAuthenticationEvent({
    event,
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : `${event}_denied`,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

export function jsonResponse(result: PractitionerHttpResult, event: string): Response {
  logAuthenticationEvent({
    event,
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : `${event}_denied`,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
