import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AddressDraft,
  AuthOtpChallenge,
  ClinicCode,
  InvitationPurpose,
  OrganizationInvitation,
  OtpPurpose,
  Patient,
  PatientUserLink,
  RegistrationSession,
} from "@dentalcare/domain";
import {
  isInvitationPurpose,
  isInvitationStatus,
  isOtpDestinationType,
  isOtpPurpose,
} from "@dentalcare/domain";
import type {
  InvitationStore,
  OtpChallengeStore,
  RateLimitBucketStore,
  RegistrationSessionStore,
} from "@dentalcare/application";

function asIso(value: Date): string {
  return value.toISOString();
}

function toInvitation(record: {
  id: string;
  organizationId: string;
  purpose: string;
  tokenHash: string;
  emailHint: string | null;
  status: string;
  expiresAt: Date;
  createdByUserId: string;
  redeemedAt: Date | null;
  redeemedByUserId: string | null;
  maxUses: number;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationInvitation {
  return {
    id: record.id,
    organizationId: record.organizationId,
    purpose: isInvitationPurpose(record.purpose) ? record.purpose : "PATIENT",
    tokenHash: record.tokenHash,
    emailHint: record.emailHint ?? undefined,
    status: isInvitationStatus(record.status) ? record.status : "PENDING",
    expiresAt: asIso(record.expiresAt),
    createdByUserId: record.createdByUserId,
    redeemedAt: record.redeemedAt ? asIso(record.redeemedAt) : undefined,
    redeemedByUserId: record.redeemedByUserId ?? undefined,
    maxUses: record.maxUses,
    useCount: record.useCount,
    createdAt: asIso(record.createdAt),
    updatedAt: asIso(record.updatedAt),
  };
}

function toClinicCode(record: {
  id: string;
  organizationId: string;
  purpose: string;
  codeHash: string;
  label: string | null;
  status: string;
  expiresAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}): ClinicCode {
  return {
    id: record.id,
    organizationId: record.organizationId,
    purpose: "PATIENT",
    codeHash: record.codeHash,
    label: record.label ?? undefined,
    status: record.status === "REVOKED" ? "REVOKED" : "ACTIVE",
    expiresAt: record.expiresAt ? asIso(record.expiresAt) : undefined,
    createdByUserId: record.createdByUserId,
    createdAt: asIso(record.createdAt),
    updatedAt: asIso(record.updatedAt),
  };
}

function toRegistrationSession(record: {
  id: string;
  purpose: string;
  organizationId: string;
  invitationId: string | null;
  clinicCodeId: string | null;
  status: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  addressDraft: Prisma.JsonValue | null;
  expiresAt: Date;
  completedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RegistrationSession {
  return {
    id: record.id,
    purpose: record.purpose === "PRACTITIONER" ? "PRACTITIONER" : "PATIENT",
    organizationId: record.organizationId,
    invitationId: record.invitationId ?? undefined,
    clinicCodeId: record.clinicCodeId ?? undefined,
    status:
      record.status === "COMPLETED" || record.status === "EXPIRED" || record.status === "ABANDONED"
        ? record.status
        : "IN_PROGRESS",
    email: record.email ?? undefined,
    emailVerifiedAt: record.emailVerifiedAt ? asIso(record.emailVerifiedAt) : undefined,
    phone: record.phone ?? undefined,
    phoneVerifiedAt: record.phoneVerifiedAt ? asIso(record.phoneVerifiedAt) : undefined,
    firstName: record.firstName ?? undefined,
    lastName: record.lastName ?? undefined,
    displayName: record.displayName ?? undefined,
    addressDraft: (record.addressDraft as AddressDraft | null) ?? undefined,
    expiresAt: asIso(record.expiresAt),
    completedUserId: record.completedUserId ?? undefined,
    createdAt: asIso(record.createdAt),
    updatedAt: asIso(record.updatedAt),
  };
}

function toOtpChallenge(record: {
  id: string;
  destinationType: string;
  destinationNormalized: string;
  purpose: string;
  codeSalt: string;
  codeHash: string;
  registrationSessionId: string | null;
  organizationId: string | null;
  invitationId: string | null;
  userId: string | null;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  lastSentAt: Date;
  resendCount: number;
  ipHash: string | null;
  createdAt: Date;
}): AuthOtpChallenge {
  return {
    id: record.id,
    destinationType: isOtpDestinationType(record.destinationType)
      ? record.destinationType
      : "EMAIL",
    destinationNormalized: record.destinationNormalized,
    purpose: isOtpPurpose(record.purpose) ? record.purpose : "LOGIN_EMAIL",
    codeSalt: record.codeSalt,
    codeHash: record.codeHash,
    registrationSessionId: record.registrationSessionId ?? undefined,
    organizationId: record.organizationId ?? undefined,
    invitationId: record.invitationId ?? undefined,
    userId: record.userId ?? undefined,
    attempts: record.attempts,
    maxAttempts: record.maxAttempts,
    expiresAt: asIso(record.expiresAt),
    consumedAt: record.consumedAt ? asIso(record.consumedAt) : undefined,
    lastSentAt: asIso(record.lastSentAt),
    resendCount: record.resendCount,
    ipHash: record.ipHash ?? undefined,
    createdAt: asIso(record.createdAt),
  };
}

export class PrismaOtpChallengeStore implements OtpChallengeStore {
  constructor(private readonly prisma: PrismaClient) {}

  async save(challenge: AuthOtpChallenge): Promise<void> {
    await this.prisma.authOtpChallenge.create({
      data: {
        id: challenge.id,
        destinationType: challenge.destinationType,
        destinationNormalized: challenge.destinationNormalized,
        purpose: challenge.purpose,
        codeSalt: challenge.codeSalt,
        codeHash: challenge.codeHash,
        registrationSessionId: challenge.registrationSessionId,
        organizationId: challenge.organizationId,
        invitationId: challenge.invitationId,
        userId: challenge.userId,
        attempts: challenge.attempts,
        maxAttempts: challenge.maxAttempts,
        expiresAt: new Date(challenge.expiresAt),
        consumedAt: challenge.consumedAt ? new Date(challenge.consumedAt) : null,
        lastSentAt: new Date(challenge.lastSentAt),
        resendCount: challenge.resendCount,
        ipHash: challenge.ipHash,
        createdAt: new Date(challenge.createdAt),
      },
    });
  }

  async findById(id: string): Promise<AuthOtpChallenge | null> {
    const record = await this.prisma.authOtpChallenge.findUnique({ where: { id } });
    return record ? toOtpChallenge(record) : null;
  }

  async update(challenge: AuthOtpChallenge): Promise<void> {
    // Atomic consume: only update if still unconsumed when marking consumed.
    if (challenge.consumedAt) {
      const result = await this.prisma.authOtpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: {
          attempts: challenge.attempts,
          consumedAt: new Date(challenge.consumedAt),
          lastSentAt: new Date(challenge.lastSentAt),
          resendCount: challenge.resendCount,
        },
      });
      if (result.count === 0) {
        // Already consumed or missing — still allow attempt-only updates when not newly consuming
        await this.prisma.authOtpChallenge.updateMany({
          where: { id: challenge.id },
          data: {
            attempts: challenge.attempts,
            lastSentAt: new Date(challenge.lastSentAt),
            resendCount: challenge.resendCount,
          },
        });
      }
      return;
    }
    await this.prisma.authOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: challenge.attempts,
        lastSentAt: new Date(challenge.lastSentAt),
        resendCount: challenge.resendCount,
        consumedAt: null,
      },
    });
  }

  async findLatestActive(input: {
    destinationNormalized: string;
    purpose: OtpPurpose;
    registrationSessionId?: string;
    nowIso: string;
  }): Promise<AuthOtpChallenge | null> {
    const record = await this.prisma.authOtpChallenge.findFirst({
      where: {
        destinationNormalized: input.destinationNormalized,
        purpose: input.purpose,
        consumedAt: null,
        expiresAt: { gt: new Date(input.nowIso) },
        ...(input.registrationSessionId
          ? { registrationSessionId: input.registrationSessionId }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return record ? toOtpChallenge(record) : null;
  }

  /** Atomic success consume — returns false if already consumed/expired. */
  async tryConsume(id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.authOtpChallenge.updateMany({
      where: {
        id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    return result.count === 1;
  }
}

export class PrismaRateLimitBucketStore implements RateLimitBucketStore {
  constructor(private readonly prisma: PrismaClient) {}

  async increment(bucketKey: string, windowStartedAtMs: number, _nowMs: number): Promise<number> {
    const windowStartedAt = new Date(windowStartedAtMs);
    const updated = await this.prisma.authRateLimitBucket.upsert({
      where: {
        bucketKey_windowStartedAt: { bucketKey, windowStartedAt },
      },
      create: {
        bucketKey,
        windowStartedAt,
        count: 1,
      },
      update: {
        count: { increment: 1 },
      },
    });
    return updated.count;
  }
}

export class PrismaInvitationStore implements InvitationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async saveInvitation(invite: OrganizationInvitation): Promise<void> {
    await this.prisma.organizationInvitation.create({
      data: {
        id: invite.id,
        organizationId: invite.organizationId,
        purpose: invite.purpose,
        tokenHash: invite.tokenHash,
        emailHint: invite.emailHint,
        status: invite.status,
        expiresAt: new Date(invite.expiresAt),
        createdByUserId: invite.createdByUserId,
        redeemedAt: invite.redeemedAt ? new Date(invite.redeemedAt) : null,
        redeemedByUserId: invite.redeemedByUserId,
        maxUses: invite.maxUses,
        useCount: invite.useCount,
        createdAt: new Date(invite.createdAt),
        updatedAt: new Date(invite.updatedAt),
      },
    });
  }

  async findInvitationById(id: string): Promise<OrganizationInvitation | null> {
    const record = await this.prisma.organizationInvitation.findUnique({ where: { id } });
    return record ? toInvitation(record) : null;
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null> {
    const record = await this.prisma.organizationInvitation.findUnique({ where: { tokenHash } });
    return record ? toInvitation(record) : null;
  }

  async updateInvitation(invite: OrganizationInvitation): Promise<void> {
    await this.prisma.organizationInvitation.update({
      where: { id: invite.id },
      data: {
        status: invite.status,
        useCount: invite.useCount,
        redeemedAt: invite.redeemedAt ? new Date(invite.redeemedAt) : null,
        redeemedByUserId: invite.redeemedByUserId,
        updatedAt: new Date(invite.updatedAt),
      },
    });
  }

  /**
   * Atomically redeem a single-use invitation.
   * Returns null if already redeemed/expired/revoked or purpose mismatch.
   */
  async tryRedeemInvitation(input: {
    tokenHash: string;
    purpose: InvitationPurpose;
    now: Date;
  }): Promise<OrganizationInvitation | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.organizationInvitation.findUnique({
        where: { tokenHash: input.tokenHash },
      });
      if (
        !existing ||
        existing.purpose !== input.purpose ||
        existing.status !== "PENDING" ||
        existing.useCount >= existing.maxUses ||
        existing.expiresAt.getTime() <= input.now.getTime()
      ) {
        return null;
      }
      const useCount = existing.useCount + 1;
      const status = useCount >= existing.maxUses ? "REDEEMED" : "PENDING";
      const updated = await tx.organizationInvitation.updateMany({
        where: {
          id: existing.id,
          status: "PENDING",
          useCount: existing.useCount,
          expiresAt: { gt: input.now },
        },
        data: {
          useCount,
          status,
          redeemedAt: input.now,
          updatedAt: input.now,
        },
      });
      if (updated.count !== 1) {
        return null;
      }
      const record = await tx.organizationInvitation.findUnique({ where: { id: existing.id } });
      return record ? toInvitation(record) : null;
    });
  }

  async saveClinicCode(code: ClinicCode): Promise<void> {
    await this.prisma.clinicCode.create({
      data: {
        id: code.id,
        organizationId: code.organizationId,
        purpose: code.purpose,
        codeHash: code.codeHash,
        label: code.label,
        status: code.status,
        expiresAt: code.expiresAt ? new Date(code.expiresAt) : null,
        createdByUserId: code.createdByUserId,
        createdAt: new Date(code.createdAt),
        updatedAt: new Date(code.updatedAt),
      },
    });
  }

  async findClinicCodeByOrgHash(
    organizationId: string,
    codeHash: string,
  ): Promise<ClinicCode | null> {
    const record = await this.prisma.clinicCode.findUnique({
      where: { organizationId_codeHash: { organizationId, codeHash } },
    });
    return record ? toClinicCode(record) : null;
  }

  async findActiveClinicCodesByHash(codeHash: string): Promise<readonly ClinicCode[]> {
    const records = await this.prisma.clinicCode.findMany({
      where: { codeHash, status: "ACTIVE" },
    });
    return records.map(toClinicCode);
  }

  async findClinicCodeById(id: string): Promise<ClinicCode | null> {
    const record = await this.prisma.clinicCode.findUnique({ where: { id } });
    return record ? toClinicCode(record) : null;
  }

  async updateClinicCode(code: ClinicCode): Promise<void> {
    await this.prisma.clinicCode.update({
      where: { id: code.id },
      data: {
        status: code.status,
        label: code.label,
        expiresAt: code.expiresAt ? new Date(code.expiresAt) : null,
        updatedAt: new Date(code.updatedAt),
      },
    });
  }
}

export class PrismaRegistrationSessionStore implements RegistrationSessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async save(session: RegistrationSession): Promise<void> {
    await this.prisma.registrationSession.create({
      data: {
        id: session.id,
        purpose: session.purpose,
        organizationId: session.organizationId,
        invitationId: session.invitationId,
        clinicCodeId: session.clinicCodeId,
        status: session.status,
        email: session.email,
        emailVerifiedAt: session.emailVerifiedAt ? new Date(session.emailVerifiedAt) : null,
        phone: session.phone,
        phoneVerifiedAt: session.phoneVerifiedAt ? new Date(session.phoneVerifiedAt) : null,
        firstName: session.firstName,
        lastName: session.lastName,
        displayName: session.displayName,
        addressDraft: session.addressDraft
          ? (session.addressDraft as unknown as Prisma.InputJsonValue)
          : undefined,
        expiresAt: new Date(session.expiresAt),
        completedUserId: session.completedUserId,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
      },
    });
  }

  async findById(id: string): Promise<RegistrationSession | null> {
    const record = await this.prisma.registrationSession.findUnique({ where: { id } });
    return record ? toRegistrationSession(record) : null;
  }

  async update(session: RegistrationSession): Promise<void> {
    await this.prisma.registrationSession.update({
      where: { id: session.id },
      data: {
        status: session.status,
        email: session.email,
        emailVerifiedAt: session.emailVerifiedAt ? new Date(session.emailVerifiedAt) : null,
        phone: session.phone,
        phoneVerifiedAt: session.phoneVerifiedAt ? new Date(session.phoneVerifiedAt) : null,
        firstName: session.firstName,
        lastName: session.lastName,
        displayName: session.displayName,
        addressDraft: session.addressDraft
          ? (session.addressDraft as unknown as Prisma.InputJsonValue)
          : undefined,
        completedUserId: session.completedUserId,
        updatedAt: new Date(session.updatedAt),
      },
    });
  }
}

export class PrismaRegistrationSupport {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(input: {
    email: string;
    phone: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    otpIssuer: string;
  }): Promise<{ userId: string }> {
    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        emailVerified: input.emailVerified,
        phoneVerified: input.phoneVerified,
        status: "active",
      },
    });
    await this.prisma.userIdentity.create({
      data: {
        userId: created.id,
        issuer: input.otpIssuer,
        subject: created.id,
      },
    });
    return { userId: created.id };
  }

  async findUserByEmailOrPhone(input: {
    email: string;
    phone: string;
  }): Promise<{ userId: string; email?: string; phone?: string } | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { phone: input.phone }],
      },
    });
    if (!user) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
    };
  }

  async findActiveUserByDestination(input: {
    email?: string;
    phone?: string;
  }): Promise<{ userId: string; email?: string; phone?: string; status: string } | null> {
    if (!input.email && !input.phone) {
      return null;
    }
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(input.email ? [{ email: input.email }] : []),
          ...(input.phone ? [{ phone: input.phone }] : []),
        ],
      },
    });
    if (!user) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      status: user.status,
    };
  }

  async createMembership(input: {
    userId: string;
    organizationId: string;
    roleKey: "PATIENT" | "PRACTITIONER";
  }): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { key: input.roleKey } });
    if (!role) {
      throw new Error("role_missing");
    }
    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          status: "active",
        },
      });
      await tx.membershipRole.create({
        data: { membershipId: membership.id, roleId: role.id },
      });
    });
  }

  async createPatient(input: {
    organizationId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    email: string;
    phone: string;
  }): Promise<Patient> {
    const record = await this.prisma.patient.create({
      data: {
        organizationId: input.organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: new Date(input.dateOfBirth),
        email: input.email,
        phone: input.phone,
        status: "active",
      },
    });
    return {
      id: record.id,
      organizationId: record.organizationId,
      firstName: record.firstName,
      lastName: record.lastName,
      dateOfBirth: record.dateOfBirth.toISOString().slice(0, 10),
      email: record.email ?? undefined,
      phone: record.phone ?? undefined,
      status: "active",
      appointmentNotificationConsent: record.appointmentNotificationConsent,
      appointmentNotificationConsentAt: record.appointmentNotificationConsentAt?.toISOString(),
      appointmentNotificationOptOut: record.appointmentNotificationOptOut,
      appointmentNotificationOptedOutAt: record.appointmentNotificationOptedOutAt?.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async linkPatientUser(input: {
    organizationId: string;
    patientId: string;
    userId: string;
    linkedByUserId?: string;
  }): Promise<PatientUserLink> {
    const record = await this.prisma.patientUserLink.create({
      data: {
        organizationId: input.organizationId,
        patientId: input.patientId,
        userId: input.userId,
        linkedByUserId: input.linkedByUserId,
      },
    });
    return {
      id: record.id,
      organizationId: record.organizationId,
      patientId: record.patientId,
      userId: record.userId,
      linkedAt: record.linkedAt.toISOString(),
      linkedByUserId: record.linkedByUserId ?? undefined,
    };
  }

  async attachAddress(input: {
    owner: "patient" | "practitioner";
    ownerId: string;
    address: AddressDraft;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.create({
        data: {
          line1: input.address.line1,
          line2: input.address.line2,
          city: input.address.city,
          state: input.address.state,
          postalCode: input.address.postalCode,
          country: input.address.country,
          type: input.address.type,
        },
      });
      if (input.owner === "patient") {
        await tx.patientAddress.create({
          data: { patientId: input.ownerId, addressId: address.id, isPrimary: true },
        });
      } else {
        await tx.practitionerAddress.create({
          data: { practitionerId: input.ownerId, addressId: address.id, isPrimary: true },
        });
      }
    });
  }
}
