import { handleInvitationCreate } from "@dentalcare/application";
import { createPrismaClient, PrismaAuthorizationDirectory } from "@dentalcare/db";
import { getAuthorizationPort } from "../../../infrastructure/authz/port";
import { identityFrom } from "../../../infrastructure/practitioner/http";
import { requestedOrganizationId } from "../../../infrastructure/http/organization";
import { identityJsonResponse, readJsonBody } from "../../../infrastructure/identity/http";
import { requireIdentityRuntime } from "../../../infrastructure/identity/require";

export const dynamic = "force-dynamic";

/** Privileged — mint invitation (org from authenticated membership context). */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireIdentityRuntime();
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const prisma = createPrismaClient();
  const result = await handleInvitationCreate(
    gate.runtime.invitations,
    getAuthorizationPort(),
    new PrismaAuthorizationDirectory(prisma),
    await identityFrom(),
    requestedOrganizationId(request),
    body,
    gate.runtime.config.INVITATION_TTL_SECONDS,
  );
  return identityJsonResponse(result, "invitation_create");
}
