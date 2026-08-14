import { handleCallbackGet } from "@dentalcare/application";
import { loadConfig } from "@dentalcare/config";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { readAuthCookies, toResponse } from "../../../../infrastructure/auth/cookies";
import { logAuthenticationEvent } from "../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cookies = await readAuthCookies();
  const result = await handleCallbackGet(getAuthenticationPort(), {
    code: url.searchParams.get("code") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
    error: url.searchParams.get("error") ?? undefined,
    redirectUri: url.searchParams.get("redirect_uri") ?? undefined,
    loginCookie: cookies.loginCookie,
    successRedirect: loadConfig().APP_BASE_URL,
  });
  logAuthenticationEvent({
    event: "login_callback",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "login_callback_failed",
    correlationId: request.headers.get("x-request-id") ?? undefined,
  });
  return toResponse(result);
}
