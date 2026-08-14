/**
 * Authentication provider port.
 *
 * M0 establishes the boundary only. Provider selection requires the approved
 * identity architecture / ADR before M1 security implementation.
 * Do not implement a custom password system here.
 */
export type AuthProviderId = "unset" | "managed";

export interface AuthenticationPort {
  readonly providerId: AuthProviderId;
}

export const unsetAuthentication: AuthenticationPort = {
  providerId: "unset",
};
