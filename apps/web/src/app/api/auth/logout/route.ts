import { handleLogoutPost } from "@dentalcare/application";
import { loadConfig } from "@dentalcare/config";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { readAuthCookies, toResponse } from "../../../../infrastructure/auth/cookies";
import { logAuthenticationEvent } from "../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

async function logout(): Promise<Response> {
  const cookies = await readAuthCookies();
  const result = await handleLogoutPost(getAuthenticationPort(), {
    sessionCookie: cookies.sessionCookie,
    fallbackRedirect: loadConfig().APP_BASE_URL,
  });
  logAuthenticationEvent({
    event: "logout",
    result: "success",
  });
  return toResponse(result);
}

export async function POST(): Promise<Response> {
  return logout();
}

export async function GET(): Promise<Response> {
  return logout();
}
