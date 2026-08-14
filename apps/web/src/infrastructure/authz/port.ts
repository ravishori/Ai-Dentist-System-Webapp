import { loadConfig } from "@dentalcare/config";
import { createAuthorizationPort } from "@dentalcare/application";
import type { AuthorizationPort } from "@dentalcare/domain";
import { createPrismaClient, PrismaAuthorizationDirectory } from "@dentalcare/db";

let port: AuthorizationPort | undefined;

export function getAuthorizationPort(): AuthorizationPort {
  if (port) {
    return port;
  }
  const prisma = createPrismaClient();
  loadConfig();
  port = createAuthorizationPort(new PrismaAuthorizationDirectory(prisma));
  return port;
}
