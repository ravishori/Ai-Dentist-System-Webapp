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

export function getAuthenticationPort(): AuthenticationPort {
  if (port) {
    return port;
  }
  const config = loadConfig();
  if (config.AUTH_PROVIDER !== "managed") {
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
