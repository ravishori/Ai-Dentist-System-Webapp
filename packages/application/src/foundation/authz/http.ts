import type { AuthorizationPort } from "@dentalcare/domain";
import type { AuthenticatedIdentity } from "@dentalcare/domain";

export interface AuthorizationHttpResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

/**
 * Smallest authorization-aware probe.
 * Tenant id is a request, never a trusted client role/permission list.
 */
export async function handleOrganizationAuthorizeGet(
  authorization: AuthorizationPort,
  input: {
    identity: AuthenticatedIdentity | null;
    requestedOrganizationId?: string;
    claimedRoles?: readonly string[];
    claimedPermissions?: readonly string[];
    claimedUserId?: string;
    permission?: string;
  },
): Promise<AuthorizationHttpResult> {
  const json = { "content-type": "application/json" };
  if (!input.identity) {
    return {
      status: 401,
      headers: json,
      body: { error: "unauthenticated", message: "Authentication required." },
    };
  }

  const permission = input.permission ?? "organization.read";
  const decision = await authorization.authorize({
    principalUserId: input.identity.userId,
    sessionUserId: input.claimedUserId ?? input.identity.userId,
    requestedOrganizationId: input.requestedOrganizationId,
    permission,
    claimedRoles: input.claimedRoles,
    claimedPermissions: input.claimedPermissions,
  });

  if (!decision.allowed) {
    const status = decision.reason === "unauthenticated" ? 401 : 403;
    return {
      status,
      headers: json,
      body: {
        error: status === 401 ? "unauthenticated" : "forbidden",
        message: status === 401 ? "Authentication required." : "Authorization denied.",
      },
    };
  }

  return {
    status: 200,
    headers: json,
    body: {
      allowed: true,
      permission,
      organizationId: decision.context?.organizationId,
    },
  };
}
