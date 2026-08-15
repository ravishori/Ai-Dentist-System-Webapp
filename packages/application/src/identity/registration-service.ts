import type {
  AddressDraft,
  Patient,
  PatientUserLink,
  Practitioner,
  PractitionerManagementRepository,
  RegistrationSession,
} from "@dentalcare/domain";
import type { RegistrationSessionStore } from "./invitation-service.js";
import type { OtpAuthenticationAdapter } from "./otp-auth-adapter.js";
import { normalizeEmail, normalizePhone } from "./otp-crypto.js";

export interface RegistrationCompletionPorts {
  readonly sessions: RegistrationSessionStore;
  readonly createUser: (input: {
    email: string;
    phone: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  }) => Promise<{ userId: string }>;
  readonly findUserByEmailOrPhone: (input: {
    email: string;
    phone: string;
  }) => Promise<{ userId: string; email?: string; phone?: string } | null>;
  readonly createMembership: (input: {
    userId: string;
    organizationId: string;
    roleKey: "PATIENT" | "PRACTITIONER";
  }) => Promise<void>;
  readonly createPatient: (input: {
    organizationId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    email: string;
    phone: string;
  }) => Promise<Patient>;
  readonly linkPatientUser: (input: {
    organizationId: string;
    patientId: string;
    userId: string;
  }) => Promise<PatientUserLink>;
  readonly practitioners: PractitionerManagementRepository;
  readonly attachAddress: (input: {
    owner: "patient" | "practitioner";
    ownerId: string;
    address: AddressDraft;
  }) => Promise<void>;
  readonly otpAuth: OtpAuthenticationAdapter;
  readonly actorUserIdForAudit: string;
}

/**
 * Completes invite-gated registration after dual OTP verification.
 * Organization always comes from the registration session (never client-supplied).
 */
export class RegistrationCompletionService {
  constructor(
    private readonly ports: RegistrationCompletionPorts,
    private readonly options: { readonly now?: () => Date } = {},
  ) {}

  async updateProfile(
    sessionId: string,
    input: {
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      dateOfBirth?: string;
      addressDraft?: AddressDraft;
    },
  ): Promise<RegistrationSession | null> {
    const session = await this.ports.sessions.findById(sessionId);
    if (!session || session.status !== "IN_PROGRESS") {
      return null;
    }
    const updated: RegistrationSession = {
      ...session,
      email: input.email ? normalizeEmail(input.email) : session.email,
      phone: input.phone ? normalizePhone(input.phone) : session.phone,
      firstName: input.firstName ?? session.firstName,
      lastName: input.lastName ?? session.lastName,
      displayName: input.displayName ?? session.displayName,
      addressDraft: input.addressDraft ?? session.addressDraft,
      updatedAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    await this.ports.sessions.update(updated);
    return updated;
  }

  async markEmailVerified(sessionId: string): Promise<RegistrationSession | null> {
    return this.markVerified(sessionId, "email");
  }

  async markPhoneVerified(sessionId: string): Promise<RegistrationSession | null> {
    return this.markVerified(sessionId, "phone");
  }

  async complete(sessionId: string, dateOfBirthForPatient?: string) {
    const now = this.options.now?.() ?? new Date();
    const session = await this.ports.sessions.findById(sessionId);
    if (!session || session.status !== "IN_PROGRESS") {
      return { ok: false as const, error: "invalid_session" as const };
    }
    if (Date.parse(session.expiresAt) <= now.getTime()) {
      await this.ports.sessions.update({
        ...session,
        status: "EXPIRED",
        updatedAt: now.toISOString(),
      });
      return { ok: false as const, error: "expired" as const };
    }
    if (!session.email || !session.emailVerifiedAt || !session.phone || !session.phoneVerifiedAt) {
      return { ok: false as const, error: "otp_incomplete" as const };
    }
    if (
      session.purpose === "PATIENT" &&
      (!session.firstName || !session.lastName || !dateOfBirthForPatient)
    ) {
      return { ok: false as const, error: "profile_incomplete" as const };
    }

    const existing = await this.ports.findUserByEmailOrPhone({
      email: session.email,
      phone: session.phone,
    });
    // Never silently take over an existing account by contact match alone.
    if (existing) {
      return { ok: false as const, error: "identity_conflict" as const };
    }

    const { userId } = await this.ports.createUser({
      email: session.email,
      phone: session.phone,
      emailVerified: true,
      phoneVerified: true,
    });

    const roleKey = session.purpose === "PATIENT" ? "PATIENT" : "PRACTITIONER";
    await this.ports.createMembership({
      userId,
      organizationId: session.organizationId,
      roleKey,
    });

    let patient: Patient | undefined;
    let practitioner: Practitioner | undefined;
    let link: PatientUserLink | undefined;

    if (session.purpose === "PATIENT") {
      patient = await this.ports.createPatient({
        organizationId: session.organizationId,
        firstName: session.firstName!,
        lastName: session.lastName!,
        dateOfBirth: dateOfBirthForPatient!,
        email: session.email,
        phone: session.phone,
      });
      link = await this.ports.linkPatientUser({
        organizationId: session.organizationId,
        patientId: patient.id,
        userId,
      });
      if (session.addressDraft) {
        await this.ports.attachAddress({
          owner: "patient",
          ownerId: patient.id,
          address: session.addressDraft,
        });
      }
    } else {
      practitioner = await this.ports.practitioners.createWithAudit(
        { organizationId: session.organizationId, actorUserId: this.ports.actorUserIdForAudit },
        {
          userId,
          displayName:
            session.displayName ?? `${session.firstName ?? ""} ${session.lastName ?? ""}`.trim(),
          verificationStatus: "pending",
        },
      );
      if (session.addressDraft) {
        await this.ports.attachAddress({
          owner: "practitioner",
          ownerId: practitioner.id,
          address: session.addressDraft,
        });
      }
    }

    const sessionResult = await this.ports.otpAuth.establishSession({
      userId,
      email: session.email,
      emailVerified: true,
      displayName: session.displayName,
    });

    await this.ports.sessions.update({
      ...session,
      status: "COMPLETED",
      completedUserId: userId,
      updatedAt: now.toISOString(),
    });

    return {
      ok: true as const,
      userId,
      patient,
      practitioner,
      link,
      identity: sessionResult.identity,
      cookies: sessionResult.cookies,
    };
  }

  private async markVerified(
    sessionId: string,
    channel: "email" | "phone",
  ): Promise<RegistrationSession | null> {
    const session = await this.ports.sessions.findById(sessionId);
    if (!session || session.status !== "IN_PROGRESS") {
      return null;
    }
    const nowIso = (this.options.now?.() ?? new Date()).toISOString();
    const updated: RegistrationSession = {
      ...session,
      emailVerifiedAt: channel === "email" ? nowIso : session.emailVerifiedAt,
      phoneVerifiedAt: channel === "phone" ? nowIso : session.phoneVerifiedAt,
      updatedAt: nowIso,
    };
    await this.ports.sessions.update(updated);
    return updated;
  }
}
