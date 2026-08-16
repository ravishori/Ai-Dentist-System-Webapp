import type { IdentityHttpResult } from "@dentalcare/application";
import { applyAuthCookies } from "../auth/cookies";
import { logAuthenticationEvent } from "../auth/log";

export function identityJsonResponse(result: IdentityHttpResult, event: string): Response {
  logAuthenticationEvent({
    event,
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : String(result.body.error ?? event),
  });
  const response = new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
  if (result.cookies?.length) {
    return applyAuthCookies(response, result.cookies);
  }
  return response;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
