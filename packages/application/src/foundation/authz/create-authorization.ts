import type { AuthorizationPort } from "@dentalcare/domain";
import { RbacAuthorizationAdapter } from "./rbac-adapter.js";
import type { AuthorizationDirectory } from "./types.js";

export function createAuthorizationPort(directory: AuthorizationDirectory): AuthorizationPort {
  return new RbacAuthorizationAdapter(directory);
}
