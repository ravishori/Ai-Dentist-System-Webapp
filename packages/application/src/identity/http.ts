import type {
  AuthCookie,
  AuthenticatedIdentity,
  AuthorizationPort,
  InvitationPurpose,
  PractitionerVerificationStatus,
} from "@dentalcare/domain";
import { isInvitationPurpose, isPractitionerVerificationStatus } from "@dentalcare/domain";
import type { AuthorizationDirectory } from "../foundation/authz/types.js";
import type { InvitationApplicationService } from "./invitation-service.js";
import type { OtpChallengeService } from "./otp-service.js";
import type { OtpAuthenticationAdapter } from "./otp-auth-adapter.js";
import type { RegistrationCompletionService } from "./registration-service.js";
import { normalizeEmail, normalizePhone } from "./otp-crypto.js";
import type { PractitionerApplicationService } from "../practitioner/service.js";

export interface IdentityHttpResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
  readonly cookies?: readonly AuthCookie[];
}

const JSON_HEADERS = { "content-type": "application/json" };

function ok(body: Record<string, unknown>, status = 200): IdentityHttpResult {
  return { status, headers: JSON_HEADERS, body };
}

function fail(status: number, error: string, message: string): IdentityHttpResult {
  return { status, headers: JSON_HEADERS, body: { error, message } };
}

function clientIp(requestHeaders?: Headers): string | undefined {
  const forwarded = requestHeaders?.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }
  return undefined;
}

export async function handleOtpRequest(
  service: OtpChallengeService,
  body: Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<IdentityHttpResult> {
  const destinationType =
    body.destinationType === "PHONE" ? "PHONE" : body.destinationType === "EMAIL" ? "EMAIL" : null;
  const purpose = typeof body.purpose === "string" ? body.purpose : "";
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  if (!destinationType || !destination || !purpose) {
    return fail(400, "invalid_input", "Invalid OTP request.");
  }
  const allowed = [
    "REGISTRATION_EMAIL",
    "REGISTRATION_PHONE",
    "LOGIN_EMAIL",
    "LOGIN_PHONE",
  ] as const;
  if (!(allowed as readonly string[]).includes(purpose)) {
    return fail(400, "invalid_input", "Invalid OTP purpose.");
  }
  const result = await service.request({
    destinationType,
    destination,
    purpose: purpose as (typeof allowed)[number],
    registrationSessionId:
      typeof body.registrationSessionId === "string" ? body.registrationSessionId : undefined,
    organizationId: typeof body.organizationId === "string" ? undefined : undefined, // never trust client org
    ip: clientIp(requestHeaders),
  });
  if (!result.ok) {
    const status =
      result.error === "rate_limited" ? 429 : result.error === "delivery_disabled" ? 503 : 400;
    return fail(status, result.error, result.message);
  }
  return ok({
    challengeId: result.challengeId,
    expiresAt: result.expiresAt,
  });
}

export async function handleOtpVerify(
  service: OtpChallengeService,
  registration: RegistrationCompletionService | null,
  body: Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<IdentityHttpResult> {
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!challengeId || !code) {
    return fail(400, "invalid_input", "Invalid verification request.");
  }
  const result = await service.verify({
    challengeId,
    code,
    ip: clientIp(requestHeaders),
  });
  if (!result.ok) {
    const status = result.error === "rate_limited" ? 429 : 400;
    return fail(status, result.error, result.message);
  }

  if (
    registration &&
    result.challenge.registrationSessionId &&
    (result.challenge.purpose === "REGISTRATION_EMAIL" ||
      result.challenge.purpose === "REGISTRATION_PHONE")
  ) {
    if (result.challenge.purpose === "REGISTRATION_EMAIL") {
      await registration.markEmailVerified(result.challenge.registrationSessionId);
    } else {
      await registration.markPhoneVerified(result.challenge.registrationSessionId);
    }
  }

  return ok({
    verified: true,
    purpose: result.challenge.purpose,
    registrationSessionId: result.challenge.registrationSessionId ?? null,
  });
}

export async function handleInvitationRedeem(
  invitations: InvitationApplicationService,
  body: Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<IdentityHttpResult> {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const purposeRaw = typeof body.purpose === "string" ? body.purpose : "";
  if (!token || !isInvitationPurpose(purposeRaw)) {
    return fail(400, "invalid_input", "Invalid invitation.");
  }
  const result = await invitations.redeemInvitation({
    token,
    purpose: purposeRaw,
    ip: clientIp(requestHeaders),
  });
  if (!result.ok) {
    const status =
      result.error === "rate_limited"
        ? 429
        : result.error === "not_found"
          ? 404
          : result.error === "expired"
            ? 410
            : 400;
    return fail(status, result.error, result.message);
  }
  return ok({
    registrationSessionId: result.data.session.id,
    purpose: result.data.session.purpose,
    expiresAt: result.data.session.expiresAt,
  });
}

export async function handleClinicCodeRedeem(
  invitations: InvitationApplicationService,
  body: Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<IdentityHttpResult> {
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return fail(400, "invalid_input", "Invalid clinic code.");
  }
  const result = await invitations.redeemClinicCode({
    plaintextCode: code,
    ip: clientIp(requestHeaders),
  });
  if (!result.ok) {
    const status =
      result.error === "rate_limited"
        ? 429
        : result.error === "not_found"
          ? 404
          : result.error === "expired"
            ? 410
            : 400;
    return fail(status, result.error, result.message);
  }
  return ok({
    registrationSessionId: result.data.session.id,
    purpose: result.data.session.purpose,
    expiresAt: result.data.session.expiresAt,
  });
}

export async function handleRegistrationProfile(
  registration: RegistrationCompletionService,
  body: Record<string, unknown>,
): Promise<IdentityHttpResult> {
  const sessionId =
    typeof body.registrationSessionId === "string" ? body.registrationSessionId : "";
  if (!sessionId) {
    return fail(400, "invalid_input", "Registration session required.");
  }
  const updated = await registration.updateProfile(sessionId, {
    email: typeof body.email === "string" ? body.email : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    firstName: typeof body.firstName === "string" ? body.firstName : undefined,
    lastName: typeof body.lastName === "string" ? body.lastName : undefined,
    displayName: typeof body.displayName === "string" ? body.displayName : undefined,
    addressDraft:
      body.address && typeof body.address === "object"
        ? (body.address as {
            line1: string;
            line2?: string;
            city: string;
            state?: string;
            postalCode: string;
            country: string;
            type: "HOME" | "WORK" | "BILLING" | "OTHER";
          })
        : undefined,
  });
  if (!updated) {
    return fail(400, "invalid_registration_state", "Registration session is not active.");
  }
  return ok({
    registrationSessionId: updated.id,
    email: updated.email ?? null,
    phone: updated.phone ?? null,
    emailVerified: Boolean(updated.emailVerifiedAt),
    phoneVerified: Boolean(updated.phoneVerifiedAt),
  });
}

export async function handleRegistrationComplete(
  registration: RegistrationCompletionService,
  body: Record<string, unknown>,
): Promise<IdentityHttpResult> {
  const sessionId =
    typeof body.registrationSessionId === "string" ? body.registrationSessionId : "";
  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : undefined;
  if (!sessionId) {
    return fail(400, "invalid_input", "Registration session required.");
  }
  const result = await registration.complete(sessionId, dateOfBirth);
  if (!result.ok) {
    if (result.error === "identity_conflict") {
      return fail(409, "conflict", "Unable to complete registration with the provided details.");
    }
    return fail(400, result.error, "Unable to complete registration.");
  }
  return {
    status: 201,
    headers: JSON_HEADERS,
    cookies: result.cookies,
    body: {
      userId: result.userId,
      purpose: result.patient ? "PATIENT" : "PRACTITIONER",
      patientId: result.patient?.id ?? null,
      practitionerId: result.practitioner?.id ?? null,
      verificationStatus: result.practitioner?.verificationStatus ?? null,
      redirectTo: result.patient ? "/portal/patient" : "/portal/practitioner",
    },
  };
}

export async function handlePasswordlessLoginStart(
  otp: OtpChallengeService,
  users: {
    findActiveUserByDestination: (input: {
      email?: string;
      phone?: string;
    }) => Promise<{ userId: string; status: string } | null>;
  },
  body: Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<IdentityHttpResult> {
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  const channel = body.channel === "phone" ? "phone" : "email";
  if (!destination) {
    return fail(400, "invalid_input", "Destination required.");
  }
  const normalized =
    channel === "email" ? normalizeEmail(destination) : normalizePhone(destination);
  const user = await users.findActiveUserByDestination(
    channel === "email" ? { email: normalized } : { phone: normalized },
  );
  // Enumeration-safe: always return generic success shape; only send OTP if user exists+active.
  if (user && user.status === "active") {
    const result = await otp.request({
      destinationType: channel === "email" ? "EMAIL" : "PHONE",
      destination: normalized,
      purpose: channel === "email" ? "LOGIN_EMAIL" : "LOGIN_PHONE",
      userId: user.userId,
      ip: clientIp(requestHeaders),
    });
    if (result.ok) {
      return ok({
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        accepted: true,
      });
    }
    if (result.error === "rate_limited" || result.error === "resend_cooldown") {
      return fail(result.error === "rate_limited" ? 429 : 400, result.error, result.message);
    }
  }
  return ok({
    accepted: true,
    challengeId: null,
    expiresAt: null,
    message: "If an account exists, a verification code was sent.",
  });
}

export async function handlePasswordlessLoginVerify(
  otp: OtpChallengeService,
  otpAuth: OtpAuthenticationAdapter,
  users: {
    findActiveUserByDestination: (input: {
      email?: string;
      phone?: string;
    }) => Promise<{ userId: string; status: string; email?: string; phone?: string } | null>;
  },
  body: Record<string, unknown>,
  requestHeaders?: Headers,
): Promise<IdentityHttpResult> {
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!challengeId || !code) {
    return fail(400, "invalid_input", "Invalid login verification.");
  }
  const verified = await otp.verify({ challengeId, code, ip: clientIp(requestHeaders) });
  if (!verified.ok) {
    return fail(
      verified.error === "rate_limited" ? 429 : 401,
      verified.error,
      "Authentication failed.",
    );
  }
  if (
    verified.challenge.purpose !== "LOGIN_EMAIL" &&
    verified.challenge.purpose !== "LOGIN_PHONE"
  ) {
    return fail(400, "invalid_input", "Authentication failed.");
  }
  const user =
    (verified.challenge.userId
      ? { userId: verified.challenge.userId, status: "active" as const }
      : null) ??
    (await users.findActiveUserByDestination(
      verified.challenge.destinationType === "EMAIL"
        ? { email: verified.challenge.destinationNormalized }
        : { phone: verified.challenge.destinationNormalized },
    ));
  if (!user || user.status !== "active") {
    return fail(401, "authentication_failure", "Authentication failed.");
  }
  const session = await otpAuth.establishSession({
    userId: user.userId,
    email: "email" in user ? user.email : undefined,
    emailVerified: verified.challenge.destinationType === "EMAIL",
  });
  return {
    status: 200,
    headers: JSON_HEADERS,
    cookies: session.cookies,
    body: {
      userId: session.identity.userId,
      authenticatedAt: session.identity.authenticatedAt,
      redirectTo: "/dashboard",
    },
  };
}

export async function handleInvitationCreate(
  invitations: InvitationApplicationService,
  authorization: AuthorizationPort,
  directory: AuthorizationDirectory,
  identity: AuthenticatedIdentity | null,
  organizationId: string | undefined,
  body: Record<string, unknown>,
  invitationTtlSeconds: number,
): Promise<IdentityHttpResult> {
  if (!identity) {
    return fail(401, "unauthenticated", "Authentication required.");
  }
  if (!organizationId) {
    return fail(400, "invalid_input", "Organization context required.");
  }
  const purposeRaw = typeof body.purpose === "string" ? body.purpose : "";
  if (!isInvitationPurpose(purposeRaw)) {
    return fail(400, "invalid_input", "Invalid invitation purpose.");
  }
  const permission =
    purposeRaw === "PATIENT" ? "invitation.patient.create" : "invitation.practitioner.create";
  const decision = await authorization.authorize({
    principalUserId: identity.userId,
    sessionUserId: identity.userId,
    requestedOrganizationId: organizationId,
    permission,
  });
  if (!decision.allowed) {
    return fail(403, "forbidden", "Not permitted to create this invitation.");
  }
  const org = await directory.getOrganization(organizationId);
  if (!org || org.status !== "active") {
    return fail(404, "not_found", "Organization not found.");
  }
  const expiresAt = new Date(Date.now() + invitationTtlSeconds * 1000).toISOString();
  const minted = await invitations.createInvitation({
    organizationId,
    purpose: purposeRaw as InvitationPurpose,
    createdByUserId: identity.userId,
    expiresAt,
    emailHint: typeof body.emailHint === "string" ? body.emailHint : undefined,
  });
  return ok(
    {
      invitationId: minted.invitation.id,
      purpose: minted.invitation.purpose,
      expiresAt: minted.invitation.expiresAt,
      token: minted.token,
    },
    201,
  );
}

export async function handleClinicCodeCreate(
  invitations: InvitationApplicationService,
  authorization: AuthorizationPort,
  identity: AuthenticatedIdentity | null,
  organizationId: string | undefined,
  body: Record<string, unknown>,
): Promise<IdentityHttpResult> {
  if (!identity) {
    return fail(401, "unauthenticated", "Authentication required.");
  }
  if (!organizationId) {
    return fail(400, "invalid_input", "Organization context required.");
  }
  const decision = await authorization.authorize({
    principalUserId: identity.userId,
    sessionUserId: identity.userId,
    requestedOrganizationId: organizationId,
    permission: "clinic_code.manage",
  });
  if (!decision.allowed) {
    return fail(403, "forbidden", "Not permitted to manage clinic codes.");
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (code.length < 4) {
    return fail(400, "invalid_input", "Clinic code is too short.");
  }
  const created = await invitations.createClinicCode({
    organizationId,
    plaintextCode: code,
    createdByUserId: identity.userId,
    label: typeof body.label === "string" ? body.label : undefined,
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : undefined,
  });
  return ok(
    {
      clinicCodeId: created.id,
      label: created.label ?? null,
      expiresAt: created.expiresAt ?? null,
    },
    201,
  );
}

export async function handlePractitionerVerification(
  practitioners: PractitionerApplicationService,
  identity: AuthenticatedIdentity | null,
  organizationId: string | undefined,
  practitionerId: string | undefined,
  body: Record<string, unknown>,
): Promise<IdentityHttpResult> {
  const statusRaw = typeof body.verificationStatus === "string" ? body.verificationStatus : "";
  if (!isPractitionerVerificationStatus(statusRaw) || statusRaw === "pending") {
    return fail(400, "invalid_input", "verificationStatus must be verified or rejected.");
  }
  const result = await practitioners.setVerificationStatus(
    identity,
    organizationId,
    practitionerId,
    statusRaw as PractitionerVerificationStatus,
  );
  if (!result.ok) {
    return fail(result.status, result.error, result.message);
  }
  return ok({
    practitioner: {
      id: result.data.practitioner.id,
      verificationStatus: result.data.practitioner.verificationStatus,
      status: result.data.practitioner.status,
    },
  });
}

// Re-export login verify for index
export { handlePasswordlessLoginVerify as handlePasswordlessLoginComplete };
