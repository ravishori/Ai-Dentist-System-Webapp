import type {
  IdentityRecord,
  LoginTransactionRecord,
  LoginTransactionStore,
  SessionRecord,
  SessionStore,
  UserIdentityDirectory,
} from "./types.js";

export class InMemoryLoginTransactionStore implements LoginTransactionStore {
  private readonly records = new Map<string, LoginTransactionRecord>();

  async save(record: LoginTransactionRecord): Promise<void> {
    this.records.set(record.stateHash, { ...record });
  }

  async consume(stateHash: string, nowMs: number): Promise<LoginTransactionRecord | null> {
    const record = this.records.get(stateHash);
    if (!record) {
      return null;
    }
    if (record.consumedAtMs !== undefined) {
      return null;
    }
    if (record.expiresAtMs <= nowMs) {
      this.records.delete(stateHash);
      return null;
    }
    record.consumedAtMs = nowMs;
    return record;
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  async save(record: SessionRecord): Promise<void> {
    this.records.set(record.tokenHash, { ...record });
  }

  async findByTokenHash(tokenHash: string, nowMs: number): Promise<SessionRecord | null> {
    const record = this.records.get(tokenHash);
    if (!record || record.revokedAtMs !== undefined || record.expiresAtMs <= nowMs) {
      return null;
    }
    return record;
  }

  async revokeByTokenHash(tokenHash: string, nowMs: number): Promise<void> {
    const record = this.records.get(tokenHash);
    if (record && record.revokedAtMs === undefined) {
      record.revokedAtMs = nowMs;
    }
  }
}

export class InMemoryUserIdentityDirectory implements UserIdentityDirectory {
  private readonly byKey = new Map<string, IdentityRecord>();
  private sequence = 0;

  async findByIssuerSubject(issuer: string, subject: string): Promise<IdentityRecord | null> {
    return this.byKey.get(`${issuer}|${subject}`) ?? null;
  }

  async provisionFromClaims(input: {
    issuer: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
  }): Promise<IdentityRecord> {
    const key = `${input.issuer}|${input.subject}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (existing.status !== "active") {
        return existing;
      }
      const updated: IdentityRecord = {
        ...existing,
        email: input.email ?? existing.email,
        emailVerified: input.emailVerified ?? existing.emailVerified,
      };
      this.byKey.set(key, updated);
      return updated;
    }
    this.sequence += 1;
    const created: IdentityRecord = {
      userId: `user_${this.sequence}`,
      status: "active",
      email: input.email,
      emailVerified: input.emailVerified ?? false,
      issuer: input.issuer,
      subject: input.subject,
    };
    this.byKey.set(key, created);
    return created;
  }

  async linkIdentity(input: {
    userId: string;
    issuer: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
  }): Promise<IdentityRecord> {
    const key = `${input.issuer}|${input.subject}`;
    const existing = this.byKey.get(key);
    if (existing) {
      return existing;
    }
    const created: IdentityRecord = {
      userId: input.userId,
      status: "active",
      email: input.email,
      emailVerified: input.emailVerified ?? false,
      issuer: input.issuer,
      subject: input.subject,
    };
    this.byKey.set(key, created);
    return created;
  }

  disable(issuer: string, subject: string): void {
    const key = `${issuer}|${subject}`;
    const existing = this.byKey.get(key);
    if (existing) {
      this.byKey.set(key, { ...existing, status: "disabled" });
    }
  }
}
