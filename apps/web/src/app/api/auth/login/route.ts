import { handleLoginGet } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { toResponse } from "../../../../infrastructure/auth/cookies";
import { logAuthenticationEvent } from "../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await handleLoginGet(getAuthenticationPort());
  logAuthenticationEvent({
    event: "login_start",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "login_start_failed",
  });
  return toResponse(result);
}
