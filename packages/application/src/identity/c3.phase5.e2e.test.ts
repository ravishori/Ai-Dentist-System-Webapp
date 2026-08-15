/**
 * C3 Phase 5 — in-process end-to-end integration (no production SMS, no live DB required).
 * Uses fake email/SMS adapters; OTP plaintext only via test-only capturePlaintext / adapter inspection.
 */
import { describe, expect, it } from "vitest";
import type { NotificationDeliveryPort, NotificationMessage, Patient } from "@dentalcare/domain";
import { AUTH_SESSION_COOKIE } from "@dentalcare/domain";
import {
  FakeSmsDeliveryAdapter,
  handleClinicCodeRedeem,
  handleInvitationCreate,
  handleInvitationRedeem,
  handleOtpRequest,
  handleOtpVerify,
  handlePasswordlessLoginStart,
  handlePasswordlessLoginVerify,
  handlePractitionerVerification,
  handleRegistrationComplete,
  handleRegistrationProfile,
  InMemoryInvitationStore,
  InMemoryOtpChallengeStore,
  InMemoryRateLimitBucketStore,
  InMemoryRegistrationSessionStore,
  InvitationApplicationService,
  OtpAuthenticationAdapter,
  OtpChallengeService,
  RegistrationCompletionService,
} from "../index.js";
import {
  InMemorySessionStore,
  InMemoryUserIdentityDirectory,
} from "../foundation/auth/in-memory-stores.js";
import { randomUrlSafe, sha256Hex } from "../foundation/auth/crypto.js";
import { RbacAuthorizationAdapter } from "../foundation/authz/rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "../foundation/authz/in-memory-directory.js";
import { InMemoryPractitionerRepository } from "../practitioner/in-memory-repository.js";
import { PractitionerApplicationService } from "../practitioner/service.js";
import {
  InMemoryAppointmentRepository,
  InMemoryBranchLookup,
} from "../appointment/in-memory-repository.js";
import { normalizeEmail, normalizePhone } from "./otp-crypto.js";

const PEPPER = "phase5-test-otp-pepper-32bytes-min!!";
const ISSUER = "https://auth.dentalcare.test/otp";
const ORG_A = "org_a";
const ORG_B = "org_b";
const ADMIN_A = "admin_a";
const ADMIN_B = "admin_b";

class CapturingEmail implements NotificationDeliveryPort {
  readonly messages: NotificationMessage[] = [];
  async deliver(message: NotificationMessage) {
    this.messages.push(message);
    return { outcome: "accepted" as const, providerMessageId: `email_${this.messages.length}` };
  }
  lastCode(): string | null {
    const last = this.messages[this.messages.length - 1];
    if (!last) return null;
    return last.textBody.match(/\b(\d{4,10})\b/)?.[1] ?? null;
  }
}

function buildHarness(options?: {
  now?: () => Date;
  maxAttempts?: number;
  ttlSeconds?: number;
  requestRateMax?: number;
  verifyRateMax?: number;
  resendCooldownSeconds?: number;
}) {
  const email = new CapturingEmail();
  const sms = new FakeSmsDeliveryAdapter();
  const challenges = new InMemoryOtpChallengeStore();
  const rates = new InMemoryRateLimitBucketStore();
  const inviteStore = new InMemoryInvitationStore();
  const sessions = new InMemoryRegistrationSessionStore();
  const identityDirectory = new InMemoryUserIdentityDirectory();
  const sessionStore = new InMemorySessionStore();
  const practitioners = new InMemoryPractitionerRepository();
  const directory = new InMemoryAuthorizationDirectory();
  directory.addUser(ADMIN_A).addUser(ADMIN_B).addOrganization(ORG_A).addOrganization(ORG_B);
  directory.addMembership({
    userId: ADMIN_A,
    organizationId: ORG_A,
    roleKeys: ["PRACTICE_ADMIN"],
  });
  directory.addMembership({
    userId: ADMIN_B,
    organizationId: ORG_B,
    roleKeys: ["PRACTICE_ADMIN"],
  });

  const users = new Map<
    string,
    { email: string; phone: string; status: string; emailVerified: boolean; phoneVerified: boolean }
  >();
  const memberships = new Map<string, { organizationId: string; roleKey: string }>();
  const patients = new Map<string, Patient>();
  const links = new Map<string, { organizationId: string; patientId: string; userId: string }>();
  let userSeq = 0;
  let patientSeq = 0;
  let idSeq = 0;
  const nextId = (prefix: string) => {
    idSeq += 1;
    return `${prefix}_${idSeq}_${randomUrlSafe(6)}`;
  };

  const createUser = async (input: {
    email: string;
    phone: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  }) => {
    userSeq += 1;
    const userId = `user_${userSeq}`;
    users.set(userId, {
      email: normalizeEmail(input.email),
      phone: normalizePhone(input.phone),
      status: "active",
      emailVerified: input.emailVerified,
      phoneVerified: input.phoneVerified,
    });
    await identityDirectory.linkIdentity!({
      userId,
      issuer: ISSUER,
      subject: userId,
      email: normalizeEmail(input.email),
      emailVerified: input.emailVerified,
    });
    return { userId };
  };

  const findActiveUserByDestination = async (input: { email?: string; phone?: string }) => {
    for (const [userId, record] of users) {
      if (
        (input.email && record.email === input.email) ||
        (input.phone && record.phone === input.phone)
      ) {
        return {
          userId,
          status: record.status,
          email: record.email,
          phone: record.phone,
        };
      }
    }
    return null;
  };

  const otp = new OtpChallengeService(
    {
      pepper: PEPPER,
      length: 6,
      ttlSeconds: options?.ttlSeconds ?? 300,
      maxAttempts: options?.maxAttempts ?? 5,
      resendCooldownSeconds: options?.resendCooldownSeconds ?? 60,
      maxResends: 5,
      requestRateLimit: { windowSeconds: 60, maxRequests: options?.requestRateMax ?? 50 },
      verifyRateLimit: { windowSeconds: 60, maxRequests: options?.verifyRateMax ?? 50 },
    },
    challenges,
    rates,
    email,
    sms,
    { capturePlaintext: true, now: options?.now, idFactory: () => nextId("otp") },
  );

  const invitations = new InvitationApplicationService(
    PEPPER,
    inviteStore,
    sessions,
    rates,
    3600,
    { windowSeconds: 60, maxRequests: 50 },
    { now: options?.now, idFactory: () => nextId("id") },
  );

  const otpAuth = new OtpAuthenticationAdapter(
    {
      issuer: ISSUER,
      sessionSecret: "phase5-session-secret-which-is-32b",
      sessionTtlSeconds: 3600,
      cookieSecure: true,
      appBaseUrl: "https://app.example.test",
    },
    identityDirectory,
    sessionStore,
    options?.now,
  );

  const registration = new RegistrationCompletionService(
    {
      sessions,
      createUser,
      findUserByEmailOrPhone: async (input) => {
        for (const [userId, record] of users) {
          if (record.email === input.email || record.phone === input.phone) {
            return { userId, email: record.email, phone: record.phone };
          }
        }
        return null;
      },
      createMembership: async (input) => {
        memberships.set(`${input.userId}|${input.organizationId}`, {
          organizationId: input.organizationId,
          roleKey: input.roleKey,
        });
        directory.addUser(input.userId);
        directory.addMembership({
          userId: input.userId,
          organizationId: input.organizationId,
          roleKeys: [input.roleKey],
        });
      },
      createPatient: async (input) => {
        patientSeq += 1;
        const patient: Patient = {
          id: `patient_${patientSeq}`,
          organizationId: input.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          email: input.email,
          phone: input.phone,
          status: "active",
          appointmentNotificationConsent: false,
          appointmentNotificationOptOut: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        patients.set(patient.id, patient);
        return patient;
      },
      linkPatientUser: async (input) => {
        const link = {
          id: `link_${links.size + 1}`,
          organizationId: input.organizationId,
          patientId: input.patientId,
          userId: input.userId,
          linkedAt: new Date().toISOString(),
        };
        links.set(link.id, link);
        return link;
      },
      practitioners,
      attachAddress: async () => undefined,
      otpAuth,
      actorUserIdForAudit: "system_registration",
    },
    { now: options?.now },
  );

  const authz = new RbacAuthorizationAdapter(directory);
  const practitionerService = new PractitionerApplicationService(
    authz,
    directory,
    practitioners,
    new InMemoryBranchLookup(),
    new InMemoryAppointmentRepository(),
  );

  return {
    email,
    sms,
    otp,
    invitations,
    registration,
    otpAuth,
    sessionStore,
    users,
    memberships,
    patients,
    links,
    practitioners,
    directory,
    authz,
    practitionerService,
    inviteStore,
    sessions,
    challenges,
    createUser,
    findActiveUserByDestination,
  };
}

async function adminIdentity(userId: string) {
  return {
    userId,
    issuer: "https://example.test",
    subject: userId,
    authenticatedAt: "2026-08-15T00:00:00.000Z",
  };
}

async function mintInvite(
  h: ReturnType<typeof buildHarness>,
  purpose: "PATIENT" | "PRACTITIONER",
  orgId = ORG_A,
  adminId = ADMIN_A,
) {
  return handleInvitationCreate(
    h.invitations,
    h.authz,
    h.directory,
    await adminIdentity(adminId),
    orgId,
    { purpose },
    3600,
  );
}

async function verifyEmailAndPhone(
  h: ReturnType<typeof buildHarness>,
  sessionId: string,
  email: string,
  phone: string,
) {
  const emailReq = await handleOtpRequest(h.otp, {
    destinationType: "EMAIL",
    destination: email,
    purpose: "REGISTRATION_EMAIL",
    registrationSessionId: sessionId,
  });
  expect(emailReq.status).toBe(200);
  const emailCode = h.email.lastCode();
  expect(emailCode).toBeTruthy();
  const emailVerify = await handleOtpVerify(h.otp, h.registration, {
    challengeId: String(emailReq.body.challengeId),
    code: emailCode!,
  });
  expect(emailVerify.status).toBe(200);

  const phoneReq = await handleOtpRequest(h.otp, {
    destinationType: "PHONE",
    destination: phone,
    purpose: "REGISTRATION_PHONE",
    registrationSessionId: sessionId,
  });
  expect(phoneReq.status).toBe(200);
  const phoneCode = h.sms.lastCode();
  expect(phoneCode).toBeTruthy();
  const phoneVerify = await handleOtpVerify(h.otp, h.registration, {
    challengeId: String(phoneReq.body.challengeId),
    code: phoneCode!,
  });
  expect(phoneVerify.status).toBe(200);
}

describe("C3 Phase 5 — patient E2E", () => {
  it("completes invitation → dual OTP → Patient+link+membership+session → logout", async () => {
    const h = buildHarness();
    const minted = await mintInvite(h, "PATIENT");
    expect(minted.status).toBe(201);
    const token = String(minted.body.token);

    const redeemed = await handleInvitationRedeem(h.invitations, {
      token,
      purpose: "PATIENT",
    });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body).not.toHaveProperty("organizationId");
    const sessionId = String(redeemed.body.registrationSessionId);
    const regSession = await h.sessions.findById(sessionId);
    expect(regSession?.organizationId).toBe(ORG_A);

    await handleRegistrationProfile(h.registration, {
      registrationSessionId: sessionId,
      firstName: "Pat",
      lastName: "ient",
      email: "pat@example.test",
      phone: "+15550001111",
      address: {
        line1: "1 Main",
        city: "Austin",
        postalCode: "78701",
        country: "US",
        type: "HOME",
      },
    });
    await verifyEmailAndPhone(h, sessionId, "pat@example.test", "+15550001111");

    const complete = await handleRegistrationComplete(h.registration, {
      registrationSessionId: sessionId,
      dateOfBirth: "1990-01-01",
    });
    expect(complete.status).toBe(201);
    expect(complete.cookies?.[0]?.name).toBe(AUTH_SESSION_COOKIE);
    expect(complete.cookies?.[0]?.httpOnly).toBe(true);
    expect(complete.cookies?.[0]?.secure).toBe(true);
    expect(complete.cookies?.[0]?.sameSite).toBe("lax");
    expect(complete.body).not.toHaveProperty("sessionToken");
    const userId = String(complete.body.userId);
    const patientId = String(complete.body.patientId);
    expect(h.patients.get(patientId)?.organizationId).toBe(ORG_A);
    expect(h.memberships.get(`${userId}|${ORG_A}`)?.roleKey).toBe("PATIENT");
    expect([...h.links.values()].some((l) => l.userId === userId && l.patientId === patientId)).toBe(
      true,
    );

    const cookie = complete.cookies![0]!.value;
    const stored = await h.sessionStore.findByTokenHash(sha256Hex(cookie), Date.now());
    expect(stored?.userId).toBe(userId);
    expect(stored?.tokenHash).toBe(sha256Hex(cookie));
    expect(stored?.tokenHash).not.toBe(cookie);

    const read = await h.otpAuth.readSession({ sessionCookie: cookie });
    expect(read?.userId).toBe(userId);

    // Session persistence (refresh equivalent): same cookie still valid
    const refreshed = await h.otpAuth.readSession({ sessionCookie: cookie });
    expect(refreshed?.userId).toBe(userId);

    await h.otpAuth.logout({ sessionCookie: cookie });
    expect(await h.otpAuth.readSession({ sessionCookie: cookie })).toBeNull();
  });

  it("clinic code binds org server-side and ignores client org spoofing", async () => {
    const h = buildHarness();
    await h.invitations.createClinicCode({
      organizationId: ORG_A,
      plaintextCode: "CLINICA",
      createdByUserId: ADMIN_A,
    });
    const redeemed = await handleClinicCodeRedeem(h.invitations, {
      code: "CLINICA",
      organizationId: ORG_B,
    });
    expect(redeemed.status).toBe(200);
    const session = await h.sessions.findById(String(redeemed.body.registrationSessionId));
    expect(session?.organizationId).toBe(ORG_A);
    expect(session?.organizationId).not.toBe(ORG_B);
  });

  it("rejects expired and inactive clinic codes", async () => {
    const h = buildHarness();
    await h.invitations.createClinicCode({
      organizationId: ORG_A,
      plaintextCode: "EXPIRED1",
      createdByUserId: ADMIN_A,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expired = await handleClinicCodeRedeem(h.invitations, { code: "EXPIRED1" });
    expect([400, 410, 404]).toContain(expired.status);

    const revoked = await h.invitations.createClinicCode({
      organizationId: ORG_A,
      plaintextCode: "REVOKED1",
      createdByUserId: ADMIN_A,
    });
    await h.inviteStore.updateClinicCode({ ...revoked, status: "REVOKED" });
    const revokedRedeem = await handleClinicCodeRedeem(h.invitations, { code: "REVOKED1" });
    expect(revokedRedeem.status).toBe(404);
  });
});

describe("C3 Phase 5 — tenant isolation & invitations", () => {
  it("rejects wrong-purpose, expired, reused, and unauthorized minting", async () => {
    const h = buildHarness();
    const pracInvite = await mintInvite(h, "PRACTITIONER");
    const wrongPurpose = await handleInvitationRedeem(h.invitations, {
      token: String(pracInvite.body.token),
      purpose: "PATIENT",
    });
    expect(wrongPurpose.status).toBe(400);

    const expired = await h.invitations.createInvitation({
      organizationId: ORG_A,
      purpose: "PATIENT",
      createdByUserId: ADMIN_A,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expiredRedeem = await handleInvitationRedeem(h.invitations, {
      token: expired.token,
      purpose: "PATIENT",
    });
    expect(expiredRedeem.status).toBe(410);

    const once = await mintInvite(h, "PATIENT");
    const first = await handleInvitationRedeem(h.invitations, {
      token: String(once.body.token),
      purpose: "PATIENT",
    });
    expect(first.status).toBe(200);
    const second = await handleInvitationRedeem(h.invitations, {
      token: String(once.body.token),
      purpose: "PATIENT",
    });
    expect(second.status).toBe(400);

    h.directory.addUser("patient_u");
    h.directory.addMembership({
      userId: "patient_u",
      organizationId: ORG_A,
      roleKeys: ["PATIENT"],
    });
    const patientMint = await handleInvitationCreate(
      h.invitations,
      h.authz,
      h.directory,
      await adminIdentity("patient_u"),
      ORG_A,
      { purpose: "PATIENT" },
      3600,
    );
    expect(patientMint.status).toBe(403);

    h.directory.addUser("prac_u");
    h.directory.addMembership({
      userId: "prac_u",
      organizationId: ORG_A,
      roleKeys: ["PRACTITIONER"],
    });
    const pracMint = await handleInvitationCreate(
      h.invitations,
      h.authz,
      h.directory,
      await adminIdentity("prac_u"),
      ORG_A,
      { purpose: "PRACTITIONER" },
      3600,
    );
    expect(pracMint.status).toBe(403);
  });

  it("org A invitation cannot create membership in org B", async () => {
    const h = buildHarness();
    const minted = await mintInvite(h, "PATIENT");
    const redeemed = await handleInvitationRedeem(h.invitations, {
      token: String(minted.body.token),
      purpose: "PATIENT",
    });
    const sessionId = String(redeemed.body.registrationSessionId);
    await handleRegistrationProfile(h.registration, {
      registrationSessionId: sessionId,
      firstName: "A",
      lastName: "Only",
      email: "aonly@example.test",
      phone: "+15550002222",
    });
    await verifyEmailAndPhone(h, sessionId, "aonly@example.test", "+15550002222");
    const complete = await handleRegistrationComplete(h.registration, {
      registrationSessionId: sessionId,
      dateOfBirth: "1991-02-02",
    });
    const userId = String(complete.body.userId);
    expect(h.memberships.has(`${userId}|${ORG_A}`)).toBe(true);
    expect(h.memberships.has(`${userId}|${ORG_B}`)).toBe(false);
    const link = [...h.links.values()].find((l) => l.userId === userId);
    expect(link?.organizationId).toBe(ORG_A);
  });
});

describe("C3 Phase 5 — practitioner E2E + verification + M7", () => {
  it("registers pending practitioner, blocks self-verify, allows admin verify/reject", async () => {
    const h = buildHarness();
    const minted = await mintInvite(h, "PRACTITIONER");
    const redeemed = await handleInvitationRedeem(h.invitations, {
      token: String(minted.body.token),
      purpose: "PRACTITIONER",
    });
    const sessionId = String(redeemed.body.registrationSessionId);
    await handleRegistrationProfile(h.registration, {
      registrationSessionId: sessionId,
      firstName: "Dana",
      lastName: "Dentist",
      displayName: "Dr Dentist",
      email: "dentist@example.test",
      phone: "+15550003333",
    });
    await verifyEmailAndPhone(h, sessionId, "dentist@example.test", "+15550003333");
    const complete = await handleRegistrationComplete(h.registration, {
      registrationSessionId: sessionId,
    });
    expect(complete.status).toBe(201);
    expect(complete.body.verificationStatus).toBe("pending");
    const practitionerId = String(complete.body.practitionerId);
    const practitioner = h.practitioners.records.get(practitionerId)!;
    expect(practitioner.userId).toBe(String(complete.body.userId));
    expect(practitioner.organizationId).toBe(ORG_A);
    expect(practitioner.status).toBe("active");
    expect(practitioner.verificationStatus).toBe("pending");
    expect(await h.practitioners.listAssignments(ORG_A, practitionerId)).toHaveLength(0);

    const selfVerify = await handlePractitionerVerification(
      h.practitionerService,
      {
        userId: practitioner.userId,
        issuer: ISSUER,
        subject: practitioner.userId,
        authenticatedAt: "2026-08-15T00:00:00.000Z",
      },
      ORG_A,
      practitionerId,
      { verificationStatus: "verified" },
    );
    expect(selfVerify.status).toBe(403);

    const adminVerify = await handlePractitionerVerification(
      h.practitionerService,
      await adminIdentity(ADMIN_A),
      ORG_A,
      practitionerId,
      { verificationStatus: "verified" },
    );
    expect(adminVerify.status).toBe(200);
    expect(
      (adminVerify.body.practitioner as { verificationStatus: string }).verificationStatus,
    ).toBe("verified");

    // M7: verified practitioner profile readable by PRACTICE_ADMIN
    const profile = await h.practitionerService.get(
      await adminIdentity(ADMIN_A),
      ORG_A,
      practitionerId,
    );
    expect(profile.ok).toBe(true);
    if (profile.ok) {
      expect(profile.data.practitioner.id).toBe(practitionerId);
      expect(profile.data.practitioner.verificationStatus).toBe("verified");
    }

    // Reject path on a second pending practitioner
    const minted2 = await mintInvite(h, "PRACTITIONER");
    const redeemed2 = await handleInvitationRedeem(h.invitations, {
      token: String(minted2.body.token),
      purpose: "PRACTITIONER",
    });
    const session2 = String(redeemed2.body.registrationSessionId);
    await handleRegistrationProfile(h.registration, {
      registrationSessionId: session2,
      firstName: "Rej",
      lastName: "Ected",
      email: "reject@example.test",
      phone: "+15550003334",
    });
    await verifyEmailAndPhone(h, session2, "reject@example.test", "+15550003334");
    const complete2 = await handleRegistrationComplete(h.registration, {
      registrationSessionId: session2,
    });
    const rejectId = String(complete2.body.practitionerId);
    const rejected = await handlePractitionerVerification(
      h.practitionerService,
      await adminIdentity(ADMIN_A),
      ORG_A,
      rejectId,
      { verificationStatus: "rejected" },
    );
    expect(rejected.status).toBe(200);
    expect(
      (rejected.body.practitioner as { verificationStatus: string }).verificationStatus,
    ).toBe("rejected");
  });
});

describe("C3 Phase 5 — passwordless login + session", () => {
  it("email and phone login create HttpOnly session; logout invalidates reuse", async () => {
    const h = buildHarness();
    await h.createUser({
      email: "login@example.test",
      phone: "+15550004444",
      emailVerified: true,
      phoneVerified: true,
    });

    const emailStart = await handlePasswordlessLoginStart(h.otp, h, {
      destination: "login@example.test",
      channel: "email",
    });
    expect(emailStart.status).toBe(200);
    expect(emailStart.body.challengeId).toBeTruthy();
    expect(JSON.stringify(emailStart.body)).not.toMatch(/\b\d{6}\b/);

    const emailCode = h.email.lastCode();
    const emailVerify = await handlePasswordlessLoginVerify(h.otp, h.otpAuth, h, {
      challengeId: String(emailStart.body.challengeId),
      code: emailCode,
    });
    expect(emailVerify.status).toBe(200);
    const cookie = emailVerify.cookies![0]!;
    expect(cookie.name).toBe(AUTH_SESSION_COOKIE);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(JSON.stringify(emailVerify.body)).not.toContain(cookie.value);

    const stored = await h.sessionStore.findByTokenHash(sha256Hex(cookie.value), Date.now());
    expect(stored?.tokenHash).toBe(sha256Hex(cookie.value));

    expect(await h.otpAuth.readSession({ sessionCookie: cookie.value })).toBeTruthy();
    await h.otpAuth.logout({ sessionCookie: cookie.value });
    expect(await h.otpAuth.readSession({ sessionCookie: cookie.value })).toBeNull();

    const phoneStart = await handlePasswordlessLoginStart(h.otp, h, {
      destination: "+15550004444",
      channel: "phone",
    });
    expect(phoneStart.status).toBe(200);
    const phoneCode = h.sms.lastCode();
    const phoneVerify = await handlePasswordlessLoginVerify(h.otp, h.otpAuth, h, {
      challengeId: String(phoneStart.body.challengeId),
      code: phoneCode,
    });
    expect(phoneVerify.status).toBe(200);
    expect(phoneVerify.cookies?.[0]?.httpOnly).toBe(true);
  });

  it("login start is enumeration-safe for unknown destinations", async () => {
    const h = buildHarness();
    const knownShape = await handlePasswordlessLoginStart(h.otp, h, {
      destination: "nobody@example.test",
      channel: "email",
    });
    expect(knownShape.status).toBe(200);
    expect(knownShape.body.accepted).toBe(true);
    expect(knownShape.body.challengeId).toBeNull();
    expect(JSON.stringify(knownShape.body)).not.toMatch(
      /userId|organization|practitioner|patient/i,
    );
  });
});

describe("C3 Phase 5 — OTP abuse matrix", () => {
  it("rejects incorrect, reused, expired, and max-attempt OTPs", async () => {
    let now = new Date("2026-08-15T12:00:00.000Z");
    const h = buildHarness({ now: () => now, maxAttempts: 3, ttlSeconds: 60 });

    const wrong = await h.otp.request({
      destinationType: "EMAIL",
      destination: "abuse@example.test",
      purpose: "LOGIN_EMAIL",
    });
    expect(wrong.ok).toBe(true);
    if (!wrong.ok) return;
    const bad = await h.otp.verify({ challengeId: wrong.challengeId, code: "000000" });
    expect(bad.ok).toBe(false);

    const issued2 = await h.otp.request({
      destinationType: "EMAIL",
      destination: "abuse2@example.test",
      purpose: "LOGIN_EMAIL",
    });
    expect(issued2.ok).toBe(true);
    if (!issued2.ok) return;
    const ok1 = await h.otp.verify({
      challengeId: issued2.challengeId,
      code: issued2.debugCode!,
    });
    expect(ok1.ok).toBe(true);
    const reuse = await h.otp.verify({
      challengeId: issued2.challengeId,
      code: issued2.debugCode!,
    });
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) expect(reuse.error).toBe("consumed");

    const issued3 = await h.otp.request({
      destinationType: "EMAIL",
      destination: "abuse3@example.test",
      purpose: "LOGIN_EMAIL",
    });
    if (!issued3.ok) throw new Error("issue");
    now = new Date("2026-08-15T12:05:00.000Z");
    const expired = await h.otp.verify({
      challengeId: issued3.challengeId,
      code: issued3.debugCode!,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error).toBe("expired");

    now = new Date("2026-08-15T13:00:00.000Z");
    const issued4 = await h.otp.request({
      destinationType: "EMAIL",
      destination: "abuse4@example.test",
      purpose: "LOGIN_EMAIL",
    });
    if (!issued4.ok) throw new Error("issue");
    await h.otp.verify({ challengeId: issued4.challengeId, code: "111111" });
    await h.otp.verify({ challengeId: issued4.challengeId, code: "222222" });
    const last = await h.otp.verify({ challengeId: issued4.challengeId, code: "333333" });
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.error).toBe("max_attempts");
  });

  it("rate-limits excessive OTP requests", async () => {
    const h = buildHarness({ requestRateMax: 2, resendCooldownSeconds: 0 });
    const a = await h.otp.request({
      destinationType: "EMAIL",
      destination: "rate@example.test",
      purpose: "LOGIN_EMAIL",
      ip: "10.0.0.1",
    });
    expect(a.ok).toBe(true);
    const b = await h.otp.request({
      destinationType: "EMAIL",
      destination: "rate2@example.test",
      purpose: "LOGIN_EMAIL",
      ip: "10.0.0.1",
    });
    expect(b.ok).toBe(true);
    const c = await h.otp.request({
      destinationType: "EMAIL",
      destination: "rate3@example.test",
      purpose: "LOGIN_EMAIL",
      ip: "10.0.0.1",
    });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toBe("rate_limited");
  });

  it("concurrent verification allows only one success", async () => {
    const h = buildHarness();
    const issued = await h.otp.request({
      destinationType: "PHONE",
      destination: "+15550005555",
      purpose: "LOGIN_PHONE",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const results = await Promise.all([
      h.otp.verify({ challengeId: issued.challengeId, code: issued.debugCode! }),
      h.otp.verify({ challengeId: issued.challengeId, code: issued.debugCode! }),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
  });

  it("concurrent invitation redemption allows only one success", async () => {
    const h = buildHarness();
    const { token } = await h.invitations.createInvitation({
      organizationId: ORG_A,
      purpose: "PATIENT",
      createdByUserId: ADMIN_A,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const results = await Promise.all([
      h.invitations.redeemInvitation({ token, purpose: "PATIENT" }),
      h.invitations.redeemInvitation({ token, purpose: "PATIENT" }),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
  });

  it("duplicate registration email/phone yields conflict (identity integrity)", async () => {
    const h = buildHarness();
    const a = await mintInvite(h, "PATIENT");
    const b = await mintInvite(h, "PATIENT");
    const redeemA = await handleInvitationRedeem(h.invitations, {
      token: String(a.body.token),
      purpose: "PATIENT",
    });
    const redeemB = await handleInvitationRedeem(h.invitations, {
      token: String(b.body.token),
      purpose: "PATIENT",
    });
    const sessionA = String(redeemA.body.registrationSessionId);
    const sessionB = String(redeemB.body.registrationSessionId);
    const shared = {
      firstName: "Twin",
      lastName: "User",
      email: "twin@example.test",
      phone: "+15550006666",
    };
    await handleRegistrationProfile(h.registration, { registrationSessionId: sessionA, ...shared });
    await handleRegistrationProfile(h.registration, { registrationSessionId: sessionB, ...shared });
    await verifyEmailAndPhone(h, sessionA, shared.email, shared.phone);
    await verifyEmailAndPhone(h, sessionB, shared.email, shared.phone);
    const first = await handleRegistrationComplete(h.registration, {
      registrationSessionId: sessionA,
      dateOfBirth: "1990-01-01",
    });
    expect(first.status).toBe(201);
    const second = await handleRegistrationComplete(h.registration, {
      registrationSessionId: sessionB,
      dateOfBirth: "1990-01-01",
    });
    expect(second.status).toBe(409);
    expect(
      [...h.users.values()].filter((u) => u.email === normalizeEmail(shared.email)),
    ).toHaveLength(1);
  });
});

describe("C3 Phase 5 — Cognito coexistence config", () => {
  it("provider selection is server-side; unset/otp/managed behave as configured", async () => {
    const { loadConfig } = await import("@dentalcare/config");
    expect(
      loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
        AUTH_PROVIDER: "unset",
      }).AUTH_PROVIDER,
    ).toBe("unset");

    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
        AUTH_PROVIDER: "otp",
      }),
    ).toThrow();

    const otp = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
      AUTH_PROVIDER: "otp",
      OTP_ISSUER: "https://auth.example.test/otp",
      OTP_PEPPER: PEPPER,
      AUTH_SESSION_SECRET: "test-session-secret-which-is-32b-min",
      SMS_PROVIDER: "fake",
    });
    expect(otp.AUTH_PROVIDER).toBe("otp");

    const managed = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
      AUTH_PROVIDER: "managed",
      OIDC_ISSUER: "https://cognito.example.test",
      OIDC_CLIENT_ID: "client",
      OIDC_REDIRECT_URI: "https://app.example.test/api/auth/callback",
      AUTH_SESSION_SECRET: "test-session-secret-which-is-32b-min",
    });
    expect(managed.AUTH_PROVIDER).toBe("managed");
  });
});
