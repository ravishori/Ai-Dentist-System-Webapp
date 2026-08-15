import type { PrismaClient } from "@prisma/client";
import type {
  IdentityRecord,
  LoginTransactionRecord,
  LoginTransactionStore,
  SessionRecord,
  SessionStore,
  UserIdentityDirectory,
} from "@dentalcare/application";

export class PrismaLoginTransactionStore implements LoginTransactionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: LoginTransactionRecord): Promise<void> {
    await this.prisma.authLoginTransaction.create({
      data: {
        stateHash: record.stateHash,
        nonceHash: record.nonceHash,
        redirectUri: record.redirectUri,
        expiresAt: new Date(record.expiresAtMs),
      },
    });
  }

  async consume(stateHash: string, nowMs: number): Promise<LoginTransactionRecord | null> {
    const now = new Date(nowMs);
    const updated = await this.prisma.authLoginTransaction.updateMany({
      where: {
        stateHash,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (updated.count !== 1) {
      return null;
    }
    const record = await this.prisma.authLoginTransaction.findUnique({ where: { stateHash } });
    if (!record) {
      return null;
    }
    return {
      stateHash: record.stateHash,
      nonceHash: record.nonceHash,
      redirectUri: record.redirectUri,
      expiresAtMs: record.expiresAt.getTime(),
      consumedAtMs: record.consumedAt?.getTime(),
    };
  }
}

export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: SessionRecord): Promise<void> {
    await this.prisma.authSession.create({
      data: {
        id: record.id,
        userId: record.userId,
        tokenHash: record.tokenHash,
        subject: record.subject,
        issuer: record.issuer,
        email: record.email,
        emailVerified: record.emailVerified,
        displayName: record.displayName,
        authenticatedAt: new Date(record.authenticatedAt),
        expiresAt: new Date(record.expiresAtMs),
      },
    });
  }

  async findByTokenHash(tokenHash: string, nowMs: number): Promise<SessionRecord | null> {
    const record = await this.prisma.authSession.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= nowMs) {
      return null;
    }
    return toSessionRecord(record);
  }

  async revokeByTokenHash(tokenHash: string, nowMs: number): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(nowMs) },
    });
  }
}

export class PrismaUserIdentityDirectory implements UserIdentityDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIssuerSubject(issuer: string, subject: string): Promise<IdentityRecord | null> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { issuer_subject: { issuer, subject } },
      include: { user: true },
    });
    if (!identity) {
      return null;
    }
    return toIdentity(identity);
  }

  async provisionFromClaims(input: {
    issuer: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
  }): Promise<IdentityRecord> {
    const existing = await this.prisma.userIdentity.findUnique({
      where: { issuer_subject: { issuer: input.issuer, subject: input.subject } },
      include: { user: true },
    });
    if (existing) {
      if (existing.user.status !== "active") {
        return toIdentity(existing);
      }
      const user = await this.prisma.user.update({
        where: { id: existing.userId },
        data: {
          email: input.email ?? existing.user.email,
          emailVerified: input.emailVerified ?? existing.user.emailVerified,
        },
      });
      return {
        userId: user.id,
        status: user.status === "disabled" ? "disabled" : "active",
        email: user.email ?? undefined,
        emailVerified: user.emailVerified,
        issuer: existing.issuer,
        subject: existing.subject,
      };
    }
    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        emailVerified: input.emailVerified ?? false,
        status: "active",
        identities: {
          create: {
            issuer: input.issuer,
            subject: input.subject,
          },
        },
      },
      include: { identities: true },
    });
    return {
      userId: created.id,
      status: "active",
      email: created.email ?? undefined,
      emailVerified: created.emailVerified,
      issuer: input.issuer,
      subject: input.subject,
    };
  }

  async linkIdentity(input: {
    userId: string;
    issuer: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
  }): Promise<IdentityRecord> {
    const existing = await this.prisma.userIdentity.findUnique({
      where: { issuer_subject: { issuer: input.issuer, subject: input.subject } },
      include: { user: true },
    });
    if (existing) {
      return toIdentity(existing);
    }
    const identity = await this.prisma.userIdentity.create({
      data: {
        userId: input.userId,
        issuer: input.issuer,
        subject: input.subject,
      },
      include: { user: true },
    });
    if (input.email !== undefined || input.emailVerified !== undefined) {
      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          email: input.email,
          emailVerified: input.emailVerified ?? false,
        },
      });
      const refreshed = await this.prisma.userIdentity.findUnique({
        where: { issuer_subject: { issuer: input.issuer, subject: input.subject } },
        include: { user: true },
      });
      if (refreshed) {
        return toIdentity(refreshed);
      }
    }
    return toIdentity(identity);
  }
}

function toIdentity(identity: {
  issuer: string;
  subject: string;
  userId: string;
  user: { status: string; email: string | null; emailVerified: boolean };
}): IdentityRecord {
  return {
    userId: identity.userId,
    status: identity.user.status === "disabled" ? "disabled" : "active",
    email: identity.user.email ?? undefined,
    emailVerified: identity.user.emailVerified,
    issuer: identity.issuer,
    subject: identity.subject,
  };
}

function toSessionRecord(record: {
  id: string;
  tokenHash: string;
  userId: string;
  subject: string;
  issuer: string;
  email: string | null;
  emailVerified: boolean | null;
  displayName: string | null;
  authenticatedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}): SessionRecord {
  return {
    id: record.id,
    tokenHash: record.tokenHash,
    userId: record.userId,
    subject: record.subject,
    issuer: record.issuer,
    email: record.email ?? undefined,
    emailVerified: record.emailVerified ?? undefined,
    displayName: record.displayName ?? undefined,
    authenticatedAt: record.authenticatedAt.toISOString(),
    expiresAtMs: record.expiresAt.getTime(),
    revokedAtMs: record.revokedAt?.getTime(),
  };
}
