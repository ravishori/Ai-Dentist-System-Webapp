import { PrismaClient } from "@prisma/client";

export { PrismaClient } from "@prisma/client";
export {
  PrismaLoginTransactionStore,
  PrismaSessionStore,
  PrismaUserIdentityDirectory,
} from "./auth-stores.js";
export { PrismaAuthorizationDirectory } from "./authz-stores.js";
export { PrismaPatientRepository } from "./patient-store.js";
export { PrismaAppointmentRepository, PrismaBranchLookup } from "./appointment-store.js";
export { PrismaPractitionerRepository } from "./practitioner-store.js";
export { PrismaNotificationOutboxRepository } from "./notification-store.js";
export {
  PrismaOtpChallengeStore,
  PrismaRateLimitBucketStore,
  PrismaInvitationStore,
  PrismaRegistrationSessionStore,
  PrismaRegistrationSupport,
} from "./identity-stores.js";

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}
