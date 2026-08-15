import type {
  AuthOtpChallenge,
  ClinicCode,
  OrganizationInvitation,
  RegistrationSession,
} from "@dentalcare/domain";
import type { InvitationStore, RegistrationSessionStore } from "./invitation-service.js";
import type { OtpChallengeStore } from "./otp-service.js";

export class InMemoryOtpChallengeStore implements OtpChallengeStore {
  readonly records = new Map<string, AuthOtpChallenge>();

  async save(challenge: AuthOtpChallenge): Promise<void> {
    this.records.set(challenge.id, challenge);
  }

  async findById(id: string): Promise<AuthOtpChallenge | null> {
    return this.records.get(id) ?? null;
  }

  async update(challenge: AuthOtpChallenge): Promise<void> {
    this.records.set(challenge.id, challenge);
  }

  async findLatestActive(input: {
    destinationNormalized: string;
    purpose: AuthOtpChallenge["purpose"];
    registrationSessionId?: string;
    nowIso: string;
  }): Promise<AuthOtpChallenge | null> {
    const nowMs = Date.parse(input.nowIso);
    const matches = [...this.records.values()]
      .filter(
        (c) =>
          c.destinationNormalized === input.destinationNormalized &&
          c.purpose === input.purpose &&
          !c.consumedAt &&
          Date.parse(c.expiresAt) > nowMs &&
          (input.registrationSessionId
            ? c.registrationSessionId === input.registrationSessionId
            : true),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return matches[0] ?? null;
  }
}

export class InMemoryInvitationStore implements InvitationStore {
  readonly invitations = new Map<string, OrganizationInvitation>();
  readonly invitationsByHash = new Map<string, string>();
  readonly clinicCodes = new Map<string, ClinicCode>();

  async saveInvitation(invite: OrganizationInvitation): Promise<void> {
    this.invitations.set(invite.id, invite);
    this.invitationsByHash.set(invite.tokenHash, invite.id);
  }

  async findInvitationById(id: string): Promise<OrganizationInvitation | null> {
    return this.invitations.get(id) ?? null;
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null> {
    const id = this.invitationsByHash.get(tokenHash);
    return id ? (this.invitations.get(id) ?? null) : null;
  }

  async updateInvitation(invite: OrganizationInvitation): Promise<void> {
    this.invitations.set(invite.id, invite);
    this.invitationsByHash.set(invite.tokenHash, invite.id);
  }

  async saveClinicCode(code: ClinicCode): Promise<void> {
    this.clinicCodes.set(code.id, code);
  }

  async findClinicCodeByOrgHash(
    organizationId: string,
    codeHash: string,
  ): Promise<ClinicCode | null> {
    return (
      [...this.clinicCodes.values()].find(
        (c) => c.organizationId === organizationId && c.codeHash === codeHash,
      ) ?? null
    );
  }

  async findClinicCodeById(id: string): Promise<ClinicCode | null> {
    return this.clinicCodes.get(id) ?? null;
  }

  async updateClinicCode(code: ClinicCode): Promise<void> {
    this.clinicCodes.set(code.id, code);
  }
}

export class InMemoryRegistrationSessionStore implements RegistrationSessionStore {
  readonly sessions = new Map<string, RegistrationSession>();

  async save(session: RegistrationSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findById(id: string): Promise<RegistrationSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async update(session: RegistrationSession): Promise<void> {
    this.sessions.set(session.id, session);
  }
}
