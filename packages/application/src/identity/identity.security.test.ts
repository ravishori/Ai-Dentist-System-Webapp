import { describe, expect, it } from "vitest";
import type { NotificationDeliveryPort, NotificationMessage } from "@dentalcare/domain";
import { RbacAuthorizationAdapter } from "../foundation/authz/rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "../foundation/authz/in-memory-directory.js";
import {
  InMemorySessionStore,
  InMemoryUserIdentityDirectory,
} from "../foundation/auth/in-memory-stores.js";
import { InMemoryPractitionerRepository } from "../practitioner/in-memory-repository.js";
import { PractitionerApplicationService } from "../practitioner/service.js";
import { InMemoryBranchLookup } from "../appointment/in-memory-repository.js";
import { InMemoryAppointmentRepository } from "../appointment/in-memory-repository.js";
import {
  FakeSmsDeliveryAdapter,
  FailClosedSmsDeliveryAdapter,
  InMemoryInvitationStore,
  InMemoryOtpChallengeStore,
  InMemoryRateLimitBucketStore,
  InMemoryRegistrationSessionStore,
  InvitationApplicationService,
  OtpAuthenticationAdapter,
  OtpChallengeService,
  hashOtp,
  verifyOtpHash,
} from "./index.js";

const PEPPER = "test-otp-pepper-which-is-at-least-32b!!";
const ORG_A = "org_a";
const ORG_B = "org_b";
const ADMIN_A = "admin_a";
const PRACTITIONER_USER = "prac_user";

class CapturingEmail implements NotificationDeliveryPort {
  readonly messages: NotificationMessage[] = [];
  async deliver(message: NotificationMessage) {
    this.messages.push(message);
    return { outcome: "accepted" as const, providerMessageId: "email-1" };
  }
}

function otpService(overrides?: {
  email?: NotificationDeliveryPort;
  sms?: FakeSmsDeliveryAdapter | FailClosedSmsDeliveryAdapter;
  capturePlaintext?: boolean;
  now?: () => Date;
  rateMax?: number;
}) {
  const challenges = new InMemoryOtpChallengeStore();
  const rates = new InMemoryRateLimitBucketStore();
  const email = overrides?.email ?? new CapturingEmail();
  const sms = overrides?.sms ?? new FakeSmsDeliveryAdapter();
  const service = new OtpChallengeService(
    {
      pepper: PEPPER,
      length: 6,
      ttlSeconds: 300,
      maxAttempts: 3,
      resendCooldownSeconds: 60,
      maxResends: 2,
      requestRateLimit: { windowSeconds: 60, maxRequests: overrides?.rateMax ?? 5 },
      verifyRateLimit: { windowSeconds: 60, maxRequests: overrides?.rateMax ?? 10 },
    },
    challenges,
    rates,
    email,
    sms,
    {
      capturePlaintext: overrides?.capturePlaintext ?? true,
      now: overrides?.now,
      idFactory: () => `otp_${challenges.records.size + 1}`,
    },
  );
  return { service, challenges, rates, email, sms };
}

describe("C3 OTP crypto", () => {
  it("hashes with pepper+salt and verifies constant-time", () => {
    const salt = "salt_abc";
    const hash = hashOtp(PEPPER, salt, "123456");
    expect(hash).not.toContain("123456");
    expect(verifyOtpHash(PEPPER, salt, "123456", hash)).toBe(true);
    expect(verifyOtpHash(PEPPER, salt, "000000", hash)).toBe(false);
  });
});

describe("C3 OTP challenge security", () => {
  it("rejects expired OTP", async () => {
    let now = new Date("2026-08-15T12:00:00.000Z");
    const { service } = otpService({ now: () => now });
    const issued = await service.request({
      destinationType: "EMAIL",
      destination: "a@example.test",
      purpose: "LOGIN_EMAIL",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    now = new Date("2026-08-15T12:10:00.000Z");
    const verified = await service.verify({ challengeId: issued.challengeId, code: issued.debugCode! });
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.error).toBe("expired");
  });

  it("rejects reused OTP", async () => {
    const { service } = otpService();
    const issued = await service.request({
      destinationType: "EMAIL",
      destination: "a@example.test",
      purpose: "LOGIN_EMAIL",
    });
    if (!issued.ok) throw new Error("issue failed");
    const first = await service.verify({ challengeId: issued.challengeId, code: issued.debugCode! });
    expect(first.ok).toBe(true);
    const second = await service.verify({ challengeId: issued.challengeId, code: issued.debugCode! });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("consumed");
  });

  it("rejects incorrect OTP and invalidates after max attempts", async () => {
    const { service } = otpService();
    const issued = await service.request({
      destinationType: "PHONE",
      destination: "+15551234567",
      purpose: "LOGIN_PHONE",
    });
    if (!issued.ok) throw new Error("issue failed");
    for (let i = 0; i < 2; i += 1) {
      const bad = await service.verify({ challengeId: issued.challengeId, code: "000000" });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error).toBe("invalid_code");
    }
    const last = await service.verify({ challengeId: issued.challengeId, code: "000000" });
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.error).toBe("max_attempts");
    const after = await service.verify({ challengeId: issued.challengeId, code: issued.debugCode! });
    expect(after.ok).toBe(false);
  });

  it("enforces resend cooldown", async () => {
    const { service } = otpService();
    const first = await service.request({
      destinationType: "EMAIL",
      destination: "a@example.test",
      purpose: "REGISTRATION_EMAIL",
    });
    expect(first.ok).toBe(true);
    const second = await service.request({
      destinationType: "EMAIL",
      destination: "a@example.test",
      purpose: "REGISTRATION_EMAIL",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("resend_cooldown");
  });

  it("rate-limits OTP requests", async () => {
    const { service } = otpService({ rateMax: 2 });
    expect(
      (
        await service.request({
          destinationType: "EMAIL",
          destination: "rate@example.test",
          purpose: "LOGIN_EMAIL",
        })
      ).ok,
    ).toBe(true);
    // consume cooldown by using different purposes? same dest - second hits cooldown first.
    // Use IP rate with separate destinations:
    const a = await service.request({
      destinationType: "EMAIL",
      destination: "b@example.test",
      purpose: "LOGIN_EMAIL",
      ip: "1.2.3.4",
    });
    expect(a.ok).toBe(true);
    const b = await service.request({
      destinationType: "EMAIL",
      destination: "c@example.test",
      purpose: "LOGIN_EMAIL",
      ip: "1.2.3.4",
    });
    // first dest request already counted; with max 2, third IP request fails
    const c = await service.request({
      destinationType: "EMAIL",
      destination: "d@example.test",
      purpose: "LOGIN_EMAIL",
      ip: "1.2.3.4",
    });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toBe("rate_limited");
    void b;
  });

  it("does not return plaintext OTP unless capturePlaintext is enabled", async () => {
    const { service } = otpService({ capturePlaintext: false });
    const issued = await service.request({
      destinationType: "EMAIL",
      destination: "a@example.test",
      purpose: "LOGIN_EMAIL",
    });
    expect(issued.ok).toBe(true);
    if (issued.ok) expect(issued.debugCode).toBeUndefined();
  });

  it("fails closed when SMS provider is disabled", async () => {
    const { service } = otpService({ sms: new FailClosedSmsDeliveryAdapter() });
    const issued = await service.request({
      destinationType: "PHONE",
      destination: "+15551234567",
      purpose: "LOGIN_PHONE",
    });
    expect(issued.ok).toBe(false);
    if (!issued.ok) expect(issued.error).toBe("delivery_disabled");
  });
});

describe("C3 invitation security", () => {
  function inviteHarness() {
    const store = new InMemoryInvitationStore();
    const sessions = new InMemoryRegistrationSessionStore();
    const rates = new InMemoryRateLimitBucketStore();
    const service = new InvitationApplicationService(
      PEPPER,
      store,
      sessions,
      rates,
      3600,
      { windowSeconds: 60, maxRequests: 5 },
    );
    return { service, store, sessions };
  }

  it("rejects wrong invitation purpose", async () => {
    const { service } = inviteHarness();
    const { token } = await service.createInvitation({
      organizationId: ORG_A,
      purpose: "PRACTITIONER",
      createdByUserId: ADMIN_A,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const result = await service.redeemInvitation({ token, purpose: "PATIENT" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("wrong_purpose");
  });

  it("rejects expired and reused invitations", async () => {
    const { service } = inviteHarness();
    const { token } = await service.createInvitation({
      organizationId: ORG_A,
      purpose: "PATIENT",
      createdByUserId: ADMIN_A,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const expired = await service.redeemInvitation({ token, purpose: "PATIENT" });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error).toBe("expired");

    const minted = await service.createInvitation({
      organizationId: ORG_A,
      purpose: "PATIENT",
      createdByUserId: ADMIN_A,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const first = await service.redeemInvitation({ token: minted.token, purpose: "PATIENT" });
    expect(first.ok).toBe(true);
    const second = await service.redeemInvitation({ token: minted.token, purpose: "PATIENT" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("redeemed");
  });

  it("binds registration session organization from invitation (not client)", async () => {
    const { service } = inviteHarness();
    const { token } = await service.createInvitation({
      organizationId: ORG_A,
      purpose: "PRACTITIONER",
      createdByUserId: ADMIN_A,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const result = await service.redeemInvitation({ token, purpose: "PRACTITIONER" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.session.organizationId).toBe(ORG_A);
      expect(result.data.session.organizationId).not.toBe(ORG_B);
    }
  });

  it("clinic codes are organization-scoped", async () => {
    const { service } = inviteHarness();
    await service.createClinicCode({
      organizationId: ORG_A,
      plaintextCode: "CLINIC1",
      createdByUserId: ADMIN_A,
    });
    const wrongOrg = await service.redeemClinicCode({
      organizationId: ORG_B,
      plaintextCode: "CLINIC1",
    });
    expect(wrongOrg.ok).toBe(false);
    const rightOrg = await service.redeemClinicCode({
      organizationId: ORG_A,
      plaintextCode: "CLINIC1",
    });
    expect(rightOrg.ok).toBe(true);
  });
});

describe("C3 practitioner verification authorization", () => {
  it("staff-created practitioners are verified; self-reg pending; self-verify denied", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(ADMIN_A).addUser(PRACTITIONER_USER).addOrganization(ORG_A);
    directory.addMembership({
      userId: ADMIN_A,
      organizationId: ORG_A,
      roleKeys: ["PRACTICE_ADMIN"],
    });
    directory.addMembership({
      userId: PRACTITIONER_USER,
      organizationId: ORG_A,
      roleKeys: ["PRACTITIONER"],
    });
    const authz = new RbacAuthorizationAdapter(directory);
    const practitioners = new InMemoryPractitionerRepository();
    const service = new PractitionerApplicationService(
      authz,
      directory,
      practitioners,
      new InMemoryBranchLookup(),
      new InMemoryAppointmentRepository(),
    );

    const staffCreated = await service.create(
      {
        userId: ADMIN_A,
        issuer: "https://example.test",
        subject: "admin",
        authenticatedAt: "2026-08-15T00:00:00.000Z",
      },
      ORG_A,
      { userId: PRACTITIONER_USER, displayName: "Dr Staff" },
    );
    expect(staffCreated.ok).toBe(true);
    if (staffCreated.ok) {
      expect(staffCreated.data.practitioner.verificationStatus).toBe("verified");
    }

    const pending = await practitioners.createWithAudit(
      { organizationId: ORG_A, actorUserId: "system_registration" },
      { userId: "self_reg_user", displayName: "Dr Self", verificationStatus: "pending" },
    );
    expect(pending.verificationStatus).toBe("pending");

    directory.addUser("self_reg_user");
    directory.addMembership({
      userId: "self_reg_user",
      organizationId: ORG_A,
      roleKeys: ["PRACTITIONER"],
    });
    const selfVerify = await service.setVerificationStatus(
      {
        userId: "self_reg_user",
        issuer: "https://auth.local/otp",
        subject: "self_reg_user",
        authenticatedAt: "2026-08-15T00:00:00.000Z",
      },
      ORG_A,
      pending.id,
      "verified",
    );
    expect(selfVerify.ok).toBe(false);
    if (!selfVerify.ok) expect(selfVerify.status).toBe(403);
  });
});

describe("C3 OTP session issuance", () => {
  it("issues dc_session and logout invalidates", async () => {
    const identityDirectory = new InMemoryUserIdentityDirectory();
    const sessions = new InMemorySessionStore();
    const adapter = new OtpAuthenticationAdapter(
      {
        issuer: "https://auth.dentalcare.local/otp",
        sessionSecret: "test-session-secret-which-is-32b-min",
        sessionTtlSeconds: 3600,
        cookieSecure: false,
        appBaseUrl: "http://localhost:3000",
      },
      identityDirectory,
      sessions,
    );
    const established = await adapter.establishSession({
      userId: "user_otp_1",
      email: "otp@example.test",
      emailVerified: true,
    });
    expect(established.cookies[0]?.name).toBe("dc_session");
    const cookie = established.cookies[0]!.value;
    const read = await adapter.readSession({ sessionCookie: cookie });
    expect(read?.userId).toBeTruthy();
    await adapter.logout({ sessionCookie: cookie });
    const after = await adapter.readSession({ sessionCookie: cookie });
    expect(after).toBeNull();
  });
});
