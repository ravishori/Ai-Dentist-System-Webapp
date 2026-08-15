import { handleNotificationGet } from "@dentalcare/application";
import { getAuthenticationPort } from "../../../../infrastructure/auth/port";
import { readAuthCookies } from "../../../../infrastructure/auth/cookies";
import { requestedOrganizationId } from "../../../../infrastructure/http/organization";
import { getNotificationService } from "../../../../infrastructure/notification/service";
import { logAuthenticationEvent } from "../../../../infrastructure/auth/log";

export const dynamic = "force-dynamic";

async function identityFrom() {
  const cookies = await readAuthCookies();
  return getAuthenticationPort().readSession({ sessionCookie: cookies.sessionCookie });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ outboxId: string }> },
): Promise<Response> {
  const { outboxId } = await context.params;
  const result = await handleNotificationGet(getNotificationService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    outboxId,
  });
  logAuthenticationEvent({
    event: "notification_get",
    result: result.status < 400 ? "success" : "failure",
    category: result.status < 400 ? undefined : "notification_get_denied",
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}
