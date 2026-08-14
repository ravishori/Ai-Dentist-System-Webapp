import { cookies } from "next/headers";
import type { AuthCookie } from "@dentalcare/domain";
import { AUTH_LOGIN_COOKIE, AUTH_SESSION_COOKIE } from "@dentalcare/domain";

export async function readAuthCookies(): Promise<{ loginCookie?: string; sessionCookie?: string }> {
  const store = await cookies();
  return {
    loginCookie: store.get(AUTH_LOGIN_COOKIE)?.value,
    sessionCookie: store.get(AUTH_SESSION_COOKIE)?.value,
  };
}

export function applyAuthCookies(response: Response, authCookies: readonly AuthCookie[]): Response {
  for (const cookie of authCookies) {
    const parts = [
      `${cookie.name}=${cookie.cleared ? "" : cookie.value}`,
      `Path=${cookie.path}`,
      `Max-Age=${cookie.maxAgeSeconds}`,
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (cookie.secure) {
      parts.push("Secure");
    }
    if (cookie.cleared) {
      parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
    response.headers.append("set-cookie", parts.join("; "));
  }
  return response;
}

export function toResponse(result: {
  status: number;
  headers: Record<string, string>;
  cookies: readonly AuthCookie[];
  body?: Record<string, unknown>;
  redirectTo?: string;
}): Response {
  const headers = new Headers(result.headers);
  const response = result.body
    ? new Response(JSON.stringify(result.body), { status: result.status, headers })
    : new Response(null, { status: result.status, headers });
  return applyAuthCookies(response, result.cookies);
}
