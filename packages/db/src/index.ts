import { PrismaClient } from "@prisma/client";

export { PrismaClient } from "@prisma/client";
export {
  PrismaLoginTransactionStore,
  PrismaSessionStore,
  PrismaUserIdentityDirectory,
} from "./auth-stores.js";
export { PrismaAuthorizationDirectory } from "./authz-stores.js";

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}
