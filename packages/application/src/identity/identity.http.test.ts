import { describe, expect, it } from "vitest";
import {
  FakeSmsDeliveryAdapter,
  handleInvitationCreate,
  handleInvitationRedeem,
  handleOtpRequest,
  handlePasswordlessLoginStart,
  handlePractitionerVerification,
  InMemoryInvitationStore,
  InMemoryOtpChallengeStore,
  InMemoryRateLimitBucketStore,
  InMemoryRegistrationSessionStore,
  InvitationApplicationService,
  OtpChallengeService,
  PractitionerApplicationService,
} from "../index.js";
import { RbacAuthorizationAdapter } from "../foundation/authz/rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "../foundation/authz/in-memory-directory.js";
import { InMemoryPractitionerRepository } from "../practitioner/in-memory-repository.js";
import {
  InMemoryAppointmentRepository,
  InMemoryBranchLookup,
} from "../appointment/in-memory-repository.js";
import type { NotificationDeliveryPort, NotificationMessage } from "@dentalcare/domain";

const PEPPER = "test-otp-pepper-which-is-at-least-32b!!";

class CapturingEmail implements NotificationDeliveryPort {
  readonly messages: NotificationMessage[] = [];
  async deliver(message: NotificationMessage) {
    this.messages.push(message);
    return { outcome: "accepted" as const, providerMessageId: "email-1" };
  }
}

describe("C3 Phase 4 identity HTTP handlers", () => {
  it("redeems invitation and creates registration session without client org id", async () => {
    const store = new InMemoryInvitationStore();
    const sessions = new InMemoryRegistrationSessionStore();
    const invitations = new InvitationApplicationService(
      PEPPER,
      store,
      sessions,
      new InMemoryRateLimitBucketStore(),
      3600,
      { windowSeconds: 60, maxRequests: 20 },
    );
    const minted = await invitations.createInvitation({
      organizationId: "org_a",
      purpose: "PATIENT",
      createdByUserId: "admin",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const result = await handleInvitationRedeem(invitations, {
      token: minted.token,
      purpose: "PATIENT",
    });
    expect(result.status).toBe(200);
    expect(result.body.registrationSessionId).toBeTruthy();
    expect(result.body).not.toHaveProperty("organizationId");
  });

  it("denies practitioner creating invitations", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser("prac").addOrganization("org_a");
    directory.addMembership({
      userId: "prac",
      organizationId: "org_a",
      roleKeys: ["PRACTITIONER"],
    });
    const invitations = new InvitationApplicationService(
      PEPPER,
      new InMemoryInvitationStore(),
      new InMemoryRegistrationSessionStore(),
      new InMemoryRateLimitBucketStore(),
      3600,
      { windowSeconds: 60, maxRequests: 20 },
    );
    const result = await handleInvitationCreate(
      invitations,
      new RbacAuthorizationAdapter(directory),
      directory,
      {
        userId: "prac",
        issuer: "https://example.test",
        subject: "prac",
        authenticatedAt: "2026-08-15T00:00:00.000Z",
      },
      "org_a",
      { purpose: "PATIENT" },
      3600,
    );
    expect(result.status).toBe(403);
  });

  it("passwordless login start is enumeration-safe when user missing", async () => {
    const otp = new OtpChallengeService(
      {
        pepper: PEPPER,
        length: 6,
        ttlSeconds: 300,
        maxAttempts: 5,
        resendCooldownSeconds: 60,
        maxResends: 5,
        requestRateLimit: { windowSeconds: 60, maxRequests: 20 },
        verifyRateLimit: { windowSeconds: 60, maxRequests: 20 },
      },
      new InMemoryOtpChallengeStore(),
      new InMemoryRateLimitBucketStore(),
      new CapturingEmail(),
      new FakeSmsDeliveryAdapter(),
      { capturePlaintext: true },
    );
    const result = await handlePasswordlessLoginStart(
      otp,
      { findActiveUserByDestination: async () => null },
      { destination: "missing@example.test", channel: "email" },
    );
    expect(result.status).toBe(200);
    expect(result.body.accepted).toBe(true);
    expect(result.body.challengeId).toBeNull();
  });

  it("OTP request handler never returns plaintext code", async () => {
    const otp = new OtpChallengeService(
      {
        pepper: PEPPER,
        length: 6,
        ttlSeconds: 300,
        maxAttempts: 5,
        resendCooldownSeconds: 60,
        maxResends: 5,
        requestRateLimit: { windowSeconds: 60, maxRequests: 20 },
        verifyRateLimit: { windowSeconds: 60, maxRequests: 20 },
      },
      new InMemoryOtpChallengeStore(),
      new InMemoryRateLimitBucketStore(),
      new CapturingEmail(),
      new FakeSmsDeliveryAdapter(),
      { capturePlaintext: true },
    );
    const result = await handleOtpRequest(otp, {
      destinationType: "EMAIL",
      destination: "a@example.test",
      purpose: "REGISTRATION_EMAIL",
    });
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).not.toMatch(/\b\d{6}\b/);
    expect(result.body).not.toHaveProperty("debugCode");
  });

  it("practitioner cannot self-verify via HTTP handler", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser("admin").addUser("self").addOrganization("org_a");
    directory.addMembership({
      userId: "admin",
      organizationId: "org_a",
      roleKeys: ["PRACTICE_ADMIN"],
    });
    directory.addMembership({
      userId: "self",
      organizationId: "org_a",
      roleKeys: ["PRACTITIONER", "PRACTICE_ADMIN"],
    });
    const practitioners = new InMemoryPractitionerRepository();
    const created = await practitioners.createWithAudit(
      { organizationId: "org_a", actorUserId: "admin" },
      { userId: "self", verificationStatus: "pending" },
    );
    const service = new PractitionerApplicationService(
      new RbacAuthorizationAdapter(directory),
      directory,
      practitioners,
      new InMemoryBranchLookup(),
      new InMemoryAppointmentRepository(),
    );
    const result = await handlePractitionerVerification(
      service,
      {
        userId: "self",
        issuer: "https://auth.local/otp",
        subject: "self",
        authenticatedAt: "2026-08-15T00:00:00.000Z",
      },
      "org_a",
      created.id,
      { verificationStatus: "verified" },
    );
    expect(result.status).toBe(403);
  });
});
