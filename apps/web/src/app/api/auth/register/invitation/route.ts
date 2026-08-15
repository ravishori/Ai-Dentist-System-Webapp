import { handleInvitationRedeem } from "@dentalcare/application";
import { identityJsonResponse, readJsonBody } from "../../../../../infrastructure/identity/http";
import { requireIdentityRuntime } from "../../../../../infrastructure/identity/require";

export const dynamic = "force-dynamic";

/** Public — redeem invitation → registration session (org from invite). */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireIdentityRuntime();
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const result = await handleInvitationRedeem(gate.runtime.invitations, body, request.headers);
  return identityJsonResponse(result, "invitation_redeem");
}
