import { AuthenticationError } from "@dentalcare/domain";
import type { IdentityRecord, UserIdentityDirectory } from "./types.js";

export async function mapProviderIdentity(
  directory: UserIdentityDirectory,
  claims: {
    issuer: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
  },
): Promise<IdentityRecord> {
  const record = await directory.provisionFromClaims(claims);
  if (record.status !== "active") {
    throw new AuthenticationError("account_disabled", "user_disabled");
  }
  return record;
}
