import { handleSessionGet } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { readAuthCookies, toResponse } from "../../../../infrastructure/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cookies = await readAuthCookies();
  const result = await handleSessionGet(getAuthenticationPort(), {
    sessionCookie: cookies.sessionCookie,
  });
  return toResponse(result);
}
