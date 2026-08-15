import type {
  ClinicCode,
  InvitationPurpose,
  OrganizationInvitation,
  RegistrationSession,
} from "@dentalcare/domain";
import { randomUrlSafe } from "../foundation/auth/crypto.js";
import { hashSecretToken, normalizeEmail } from "./otp-crypto.js";
import { consumeRateLimit, type RateLimitBucketStore, type RateLimitConfig } from "./rate-limit.js";

export interface InvitationStore {
  saveInvitation(invite: OrganizationInvitation): Promise<void>;
  findInvitationById(id: string): Promise<OrganizationInvitation | null>;
  findInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null>;
  updateInvitation(invite: OrganizationInvitation): Promise<void>;
  saveClinicCode(code: ClinicCode): Promise<void>;
  findClinicCodeByOrgHash(
    organizationId: string,
    codeHash: string,
  ): Promise<ClinicCode | null>;
  findClinicCodeById(id: string): Promise<ClinicCode | null>;
  updateClinicCode(code: ClinicCode): Promise<void>;
}

export interface RegistrationSessionStore {
  save(session: RegistrationSession): Promise<void>;
  findById(id: string): Promise<RegistrationSession | null>;
  update(session: RegistrationSession): Promise<void>;
}

export type InvitationServiceResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error:
        | "forbidden_purpose"
        | "invalid"
        | "expired"
        | "revoked"
        | "redeemed"
        | "not_found"
        | "rate_limited"
        | "wrong_purpose";
      readonly message: string;
    };

export class InvitationApplicationService {
  constructor(
    private readonly pepper: string,
    private readonly store: InvitationStore,
    private readonly sessions: RegistrationSessionStore,
    private readonly rateLimits: RateLimitBucketStore,
    private readonly registrationTtlSeconds: number,
    private readonly redeemRateLimit: RateLimitConfig,
    private readonly options: { readonly now?: () => Date; readonly idFactory?: () => string } = {},
  ) {}

  mintToken(): { plaintext: string; tokenHash: string } {
    const plaintext = randomUrlSafe(32);
    return { plaintext, tokenHash: hashSecretToken(this.pepper, plaintext) };
  }

  async createInvitation(input: {
    organizationId: string;
    purpose: InvitationPurpose;
    createdByUserId: string;
    expiresAt: string;
    emailHint?: string;
    maxUses?: number;
  }): Promise<{ invitation: OrganizationInvitation; token: string }> {
    const { plaintext, tokenHash } = this.mintToken();
    const now = (this.options.now?.() ?? new Date()).toISOString();
    const invitation: OrganizationInvitation = {
      id: this.options.idFactory?.() ?? `inv_${Date.now()}`,
      organizationId: input.organizationId,
      purpose: input.purpose,
      tokenHash,
      emailHint: input.emailHint ? normalizeEmail(input.emailHint) : undefined,
      status: "PENDING",
      expiresAt: input.expiresAt,
      createdByUserId: input.createdByUserId,
      maxUses: input.maxUses ?? 1,
      useCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveInvitation(invitation);
    return { invitation, token: plaintext };
  }

  async createClinicCode(input: {
    organizationId: string;
    plaintextCode: string;
    createdByUserId: string;
    label?: string;
    expiresAt?: string;
  }): Promise<ClinicCode> {
    const now = (this.options.now?.() ?? new Date()).toISOString();
    const normalized = input.plaintextCode.trim().toUpperCase();
    const code: ClinicCode = {
      id: this.options.idFactory?.() ?? `cc_${Date.now()}`,
      organizationId: input.organizationId,
      purpose: "PATIENT",
      codeHash: hashSecretToken(this.pepper, normalized),
      label: input.label,
      status: "ACTIVE",
      expiresAt: input.expiresAt,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveClinicCode(code);
    return code;
  }

  async redeemInvitation(input: {
    token: string;
    purpose: InvitationPurpose;
    ip?: string;
  }): Promise<InvitationServiceResult<{ session: RegistrationSession; invitation: OrganizationInvitation }>> {
    const now = this.options.now?.() ?? new Date();
    const nowMs = now.getTime();
    if (input.ip) {
      const limited = await consumeRateLimit(
        this.rateLimits,
        `invite_redeem:ip:${input.ip}`,
        this.redeemRateLimit,
        nowMs,
      );
      if (!limited.allowed) {
        return { ok: false, error: "rate_limited", message: "Too many redemption attempts." };
      }
    }

    const tokenHash = hashSecretToken(this.pepper, input.token);
    const invitation = await this.store.findInvitationByTokenHash(tokenHash);
    if (!invitation) {
      return { ok: false, error: "not_found", message: "Invitation not found." };
    }
    if (invitation.purpose !== input.purpose) {
      return { ok: false, error: "wrong_purpose", message: "Invitation purpose mismatch." };
    }
    if (invitation.status === "REVOKED") {
      return { ok: false, error: "revoked", message: "Invitation revoked." };
    }
    if (invitation.status === "REDEEMED" || invitation.useCount >= invitation.maxUses) {
      return { ok: false, error: "redeemed", message: "Invitation already used." };
    }
    if (Date.parse(invitation.expiresAt) <= nowMs || invitation.status === "EXPIRED") {
      return { ok: false, error: "expired", message: "Invitation expired." };
    }

    const session: RegistrationSession = {
      id: this.options.idFactory?.() ?? `reg_${Date.now()}`,
      purpose: invitation.purpose,
      organizationId: invitation.organizationId,
      invitationId: invitation.id,
      status: "IN_PROGRESS",
      expiresAt: new Date(nowMs + this.registrationTtlSeconds * 1000).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.sessions.save(session);

    const updated: OrganizationInvitation = {
      ...invitation,
      useCount: invitation.useCount + 1,
      status: invitation.useCount + 1 >= invitation.maxUses ? "REDEEMED" : invitation.status,
      redeemedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.store.updateInvitation(updated);
    return { ok: true, data: { session, invitation: updated } };
  }

  async redeemClinicCode(input: {
    organizationId: string;
    plaintextCode: string;
    ip?: string;
  }): Promise<InvitationServiceResult<{ session: RegistrationSession; clinicCode: ClinicCode }>> {
    const now = this.options.now?.() ?? new Date();
    const nowMs = now.getTime();
    if (input.ip) {
      const limited = await consumeRateLimit(
        this.rateLimits,
        `clinic_code:ip:${input.ip}`,
        this.redeemRateLimit,
        nowMs,
      );
      if (!limited.allowed) {
        return { ok: false, error: "rate_limited", message: "Too many redemption attempts." };
      }
    }

    const codeHash = hashSecretToken(this.pepper, input.plaintextCode.trim().toUpperCase());
    const clinicCode = await this.store.findClinicCodeByOrgHash(input.organizationId, codeHash);
    if (!clinicCode) {
      return { ok: false, error: "not_found", message: "Clinic code not found." };
    }
    if (clinicCode.status !== "ACTIVE") {
      return { ok: false, error: "revoked", message: "Clinic code revoked." };
    }
    if (clinicCode.expiresAt && Date.parse(clinicCode.expiresAt) <= nowMs) {
      return { ok: false, error: "expired", message: "Clinic code expired." };
    }
    if (clinicCode.purpose !== "PATIENT") {
      return { ok: false, error: "wrong_purpose", message: "Clinic code purpose mismatch." };
    }

    const session: RegistrationSession = {
      id: this.options.idFactory?.() ?? `reg_${Date.now()}`,
      purpose: "PATIENT",
      organizationId: clinicCode.organizationId,
      clinicCodeId: clinicCode.id,
      status: "IN_PROGRESS",
      expiresAt: new Date(nowMs + this.registrationTtlSeconds * 1000).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.sessions.save(session);
    return { ok: true, data: { session, clinicCode } };
  }

  async revokeInvitation(
    invitationId: string,
    actorOrganizationId: string,
  ): Promise<InvitationServiceResult<OrganizationInvitation>> {
    const invitation = await this.store.findInvitationById(invitationId);
    if (!invitation || invitation.organizationId !== actorOrganizationId) {
      return { ok: false, error: "not_found", message: "Invitation not found." };
    }
    const updated: OrganizationInvitation = {
      ...invitation,
      status: "REVOKED",
      updatedAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    await this.store.updateInvitation(updated);
    return { ok: true, data: updated };
  }
}
