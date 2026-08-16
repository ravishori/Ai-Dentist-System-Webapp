import { loadConfig } from "@dentalcare/config";
import { createAuthenticationPort, unsetAuthentication } from "@dentalcare/application";
import type { AuthenticationPort } from "@dentalcare/domain";
import {
  createPrismaClient,
  PrismaLoginTransactionStore,
  PrismaSessionStore,
  PrismaUserIdentityDirectory,
} from "@dentalcare/db";

let port: AuthenticationPort | undefined;

/**
 * AuthenticationPort for the web runtime (TDA-ADR-004).
 * AUTH_PROVIDER=unset → fail-closed
 * AUTH_PROVIDER=managed → Cognito OIDC
 * AUTH_PROVIDER=otp → OtpAuthenticationAdapter + dc_session
 */
export function getAuthenticationPort(): AuthenticationPort {
  if (port) {
    return port;
  }
  const config = loadConfig();
  if (config.AUTH_PROVIDER === "unset") {
    port = unsetAuthentication;
    return port;
  }
  const prisma = createPrismaClient();
  port = createAuthenticationPort({
    config,
    identityDirectory: new PrismaUserIdentityDirectory(prisma),
    sessions: new PrismaSessionStore(prisma),
    loginTransactions: new PrismaLoginTransactionStore(prisma),
  });
  return port;
}
