import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuthenticatedIdentity, Appointment } from "@dentalcare/domain";
import { NOTIFICATION_MAX_ATTEMPTS, NOTIFICATION_RETRY_DELAYS_MS } from "@dentalcare/domain";
import { testConfig } from "@dentalcare/test-utils";
import { loadConfig } from "@dentalcare/config";
import { RbacAuthorizationAdapter } from "../foundation/authz/rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "../foundation/authz/in-memory-directory.js";
import { InMemoryPatientRepository } from "../patient/in-memory-repository.js";
import {
  InMemoryAppointmentRepository,
  InMemoryBranchLookup,
  InMemoryPractitionerRepository,
} from "../appointment/in-memory-repository.js";
import { AppointmentApplicationService } from "../appointment/service.js";
import { handleAppointmentCancel, handleAppointmentReschedule } from "../appointment/http.js";
import { FakeNotificationAdapter } from "./fake-adapter.js";
import { FailClosedNotificationAdapter } from "./fail-closed-adapter.js";
import { InMemoryNotificationOutboxRepository } from "./in-memory-outbox.js";
import { NotificationOutboxProcessor } from "./processor.js";
import { NotificationApplicationService } from "./service.js";
import { handleNotificationGet } from "./http.js";
import { resolveNotificationDelivery } from "./delivery-config.js";
import { createNotificationDeliveryPort } from "./create-delivery.js";
import { classifySmtpError } from "./smtp-adapter.js";
import { nextRetryAt } from "./retry.js";
import { renderAppointmentEmail } from "./templates.js";

const ORG_A = "org_a";
const ORG_B = "org_b";
const STAFF_A = "user_staff_a";
const STAFF_B = "user_staff_b";
const PATIENT_ROLE = "user_patient_role";
const PLATFORM_ADMIN = "user_platform";

const ADA = {
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1815-12-10",
  email: "ada@example.test",
  phone: "+447700900123",
};

const SLOT_A = {
  startAtUtc: "2026-09-01T09:00:00.000Z",
  endAtUtc: "2026-09-01T10:00:00.000Z",
  timezone: "Europe/London",
};

const SLOT_B = {
  startAtUtc: "2026-09-02T14:00:00.000Z",
  endAtUtc: "2026-09-02T15:00:00.000Z",
  timezone: "Europe/London",
};

const LEAK_MARKERS = [
  "ada@example.test",
  "+447700900123",
  "1815-12-10",
  "Lovelace",
  "SMTP_PASSWORD",
  "super-secret-smtp",
];

function identity(userId: string): AuthenticatedIdentity {
  return {
    userId,
    issuer: "https://example.test",
    subject: `sub-${userId}`,
    authenticatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function silentLogger() {
  const lines: Array<{ message: string; fields?: Record<string, unknown> }> = [];
  return {
    lines,
    info(message: string, fields?: Record<string, unknown>) {
      lines.push({ message, fields });
    },
    warn(message: string, fields?: Record<string, unknown>) {
      lines.push({ message, fields });
    },
    error(message: string, fields?: Record<string, unknown>) {
      lines.push({ message, fields });
    },
  };
}

function expectNoLeak(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const marker of LEAK_MARKERS) {
    expect(serialized).not.toContain(marker);
  }
}

function harness() {
  const directory = new InMemoryAuthorizationDirectory();
  directory.addUser(STAFF_A).addUser(STAFF_B).addUser(PATIENT_ROLE).addUser(PLATFORM_ADMIN);
  directory.addOrganization(ORG_A).addOrganization(ORG_B);
  directory.addMembership({ userId: STAFF_A, organizationId: ORG_A, roleKeys: ["STAFF"] });
  directory.addMembership({ userId: STAFF_B, organizationId: ORG_B, roleKeys: ["STAFF"] });
  directory.addMembership({
    userId: PATIENT_ROLE,
    organizationId: ORG_A,
    roleKeys: ["PATIENT"],
  });
  directory.setPlatformRoles(PLATFORM_ADMIN, ["SYSTEM_ADMIN"]);
  const authorization = new RbacAuthorizationAdapter(directory);
  const patients = new InMemoryPatientRepository();
  const practitioners = new InMemoryPractitionerRepository();
  const branches = new InMemoryBranchLookup();
  const appointments = new InMemoryAppointmentRepository();
  const appointmentService = new AppointmentApplicationService(
    authorization,
    appointments,
    patients,
    practitioners,
    branches,
  );
  const outbox = new InMemoryNotificationOutboxRepository();
  const delivery = new FakeNotificationAdapter();
  const logger = silentLogger();
  let now = new Date("2026-08-15T00:00:00.000Z");
  const processor = new NotificationOutboxProcessor({
    outbox,
    appointments,
    patients,
    delivery,
    logger,
    workerId: "worker_test",
    leaseMs: 120_000,
    now: () => now,
  });
  const notifications = new NotificationApplicationService(authorization, outbox);
  return {
    authorization,
    patients,
    practitioners,
    branches,
    appointments,
    appointmentService,
    outbox,
    delivery,
    logger,
    processor,
    notifications,
    setNow(value: Date) {
      now = value;
    },
    getNow() {
      return now;
    },
  };
}

async function seedEligible(h: ReturnType<typeof harness>, organizationId = ORG_A) {
  const patient = await h.patients.create(organizationId, ADA);
  await h.patients.updateByOrganizationAndId(organizationId, patient.id, {
    appointmentNotificationConsent: true,
  });
  const refreshed = await h.patients.findByOrganizationAndId(organizationId, patient.id);
  const practitioner = await h.practitioners.create(organizationId, `pract_${organizationId}`);
  const branchId = `branch_${organizationId}`;
  h.branches.add(organizationId, branchId);
  const created = await h.appointmentService.create(identity(STAFF_A), organizationId, {
    patientId: patient.id,
    practitionerId: practitioner.id,
    branchId,
    ...SLOT_A,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error("seed_failed");
  }
  return { patient: refreshed ?? patient, appointment: created.data, practitioner, branchId };
}

describe("notification delivery configuration", () => {
  it("defaults to disabled processing and a 60 second poll interval", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
    });
    expect(config.NOTIFICATION_PROCESSING_ENABLED).toBe("false");
    expect(config.NOTIFICATION_PROVIDER).toBe("unset");
    expect(config.NOTIFICATION_ALLOW_REAL_DELIVERY).toBe("false");
    expect(config.NOTIFICATION_POLL_INTERVAL_SECONDS).toBe(60);
    const decision = resolveNotificationDelivery(config);
    expect(decision).toMatchObject({
      processingEnabled: false,
      mode: "disabled",
      pollIntervalSeconds: 60,
    });
  });

  it("fails closed when SMTP is requested without production real-delivery flags", () => {
    const decision = resolveNotificationDelivery(
      testConfig({
        NOTIFICATION_PROCESSING_ENABLED: "true",
        NOTIFICATION_PROVIDER: "smtp",
        SMTP_HOST: "smtp.example.test",
        SMTP_PORT: 587,
        SMTP_USERNAME: "mailer",
        SMTP_PASSWORD: "super-secret-smtp",
        NOTIFICATION_FROM_EMAIL: "noreply@example.test",
        NOTIFICATION_FROM_DOMAIN: "example.test",
      }),
    );
    expect(decision.processingEnabled).toBe(false);
    expect(decision.mode).toBe("disabled");
  });

  it("createNotificationDeliveryPort uses fail-closed when unset", async () => {
    const port = await createNotificationDeliveryPort(testConfig());
    expect(port).toBeInstanceOf(FailClosedNotificationAdapter);
    const result = await port.deliver({
      channel: "email",
      idempotencyKey: "outbox_1",
      toAddress: "ada@example.test",
      subject: "Appointment scheduled",
      textBody: "Hello Ada",
    });
    expect(result).toMatchObject({ outcome: "rejected", errorCategory: "delivery_disabled" });
  });

  it("allows fake adapter only when processing is explicitly enabled outside production", () => {
    const decision = resolveNotificationDelivery(
      testConfig({
        NODE_ENV: "test",
        NOTIFICATION_PROCESSING_ENABLED: "true",
        NOTIFICATION_PROVIDER: "fake",
      }),
    );
    expect(decision).toMatchObject({ processingEnabled: true, mode: "fake" });
    const productionFake = resolveNotificationDelivery(
      testConfig({
        NODE_ENV: "production",
        NOTIFICATION_PROCESSING_ENABLED: "true",
        NOTIFICATION_PROVIDER: "fake",
      }),
    );
    expect(productionFake.processingEnabled).toBe(false);
  });
});

describe("appointment HTTP does not send", () => {
  it("create, reschedule, and cancel write pending intents only", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    await handleAppointmentReschedule(h.appointmentService, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      body: SLOT_B,
    });
    await handleAppointmentCancel(h.appointmentService, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
    });
    expect(h.appointments.outbox.map((row) => row.eventType)).toEqual([
      "appointment.created",
      "appointment.rescheduled",
      "appointment.cancelled",
    ]);
    expect(h.delivery.uniqueSendCount()).toBe(0);
  });
});

describe("outbox processing", () => {
  it("delivers once through the fake adapter for an eligible recipient", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.created",
      now: h.getNow(),
    });
    await h.processor.processBatch();
    expect(h.delivery.uniqueSendCount()).toBe(1);
    expect(h.delivery.deliveries[0]?.subject).toBe("Appointment scheduled");
    expect(h.delivery.deliveries[0]?.textBody).toContain("Ada");
    expect(h.delivery.deliveries[0]?.textBody).not.toMatch(/diagnos|treatment|payment|token/i);
    const stored = [...h.outbox.records.values()][0];
    expect(stored?.status).toBe("sent");
    expect(h.appointments.records.get(seeded.appointment.id)?.status).toBe("REQUESTED");
  });

  it("suppresses missing consent, opt-out, inactive, missing email, and invalid email", async () => {
    const cases: Array<{
      mutate: (h: ReturnType<typeof harness>, patientId: string) => Promise<void>;
      code: string;
    }> = [
      {
        mutate: async () => undefined,
        code: "consent_missing",
      },
      {
        mutate: async (h, patientId) => {
          await h.patients.updateByOrganizationAndId(ORG_A, patientId, {
            appointmentNotificationConsent: true,
            appointmentNotificationOptOut: true,
          });
        },
        code: "opted_out",
      },
      {
        mutate: async (h, patientId) => {
          await h.patients.updateByOrganizationAndId(ORG_A, patientId, {
            appointmentNotificationConsent: true,
            status: "inactive",
          });
        },
        code: "inactive_patient",
      },
      {
        mutate: async (h, patientId) => {
          await h.patients.updateByOrganizationAndId(ORG_A, patientId, {
            appointmentNotificationConsent: true,
            email: null,
          });
        },
        code: "missing_email",
      },
      {
        mutate: async (h, patientId) => {
          await h.patients.updateByOrganizationAndId(ORG_A, patientId, {
            appointmentNotificationConsent: true,
          });
          const current = h.patients.records.get(patientId);
          if (current) {
            h.patients.records.set(patientId, { ...current, email: "not-an-email" });
          }
        },
        code: "invalid_email",
      },
    ];

    for (const scenario of cases) {
      const h = harness();
      const patient = await h.patients.create(ORG_A, ADA);
      const practitioner = await h.practitioners.create(ORG_A, "pract_a");
      h.branches.add(ORG_A, "branch_a");
      const created = await h.appointmentService.create(identity(STAFF_A), ORG_A, {
        patientId: patient.id,
        practitionerId: practitioner.id,
        branchId: "branch_a",
        ...SLOT_A,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await scenario.mutate(h, patient.id);
      h.outbox.createPending({
        organizationId: ORG_A,
        appointmentId: created.data.id,
        eventType: "appointment.created",
        now: h.getNow(),
      });
      await h.processor.processBatch();
      const stored = [...h.outbox.records.values()][0];
      expect(stored?.status).toBe("suppressed");
      expect(stored?.lastErrorCode).toBe(scenario.code);
      expect(h.delivery.uniqueSendCount()).toBe(0);
      expectNoLeak(h.outbox.audit);
      expectNoLeak(h.logger.lines);
    }
  });

  it("does not send twice for duplicate worker execution", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    const intent = h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.rescheduled",
      now: h.getNow(),
    });
    await h.processor.processBatch();
    await h.processor.processClaimed({ ...intent, status: "processing", attemptCount: 2 });
    expect(h.delivery.uniqueSendCount()).toBe(1);
    expect([...h.outbox.records.values()][0]?.status).toBe("sent");
  });

  it("concurrent claims do not duplicate delivery", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.cancelled",
      now: h.getNow(),
    });
    const [first, second] = await Promise.all([
      h.outbox.claimDue({
        limit: 1,
        leaseMs: 120_000,
        workerId: "w1",
        now: h.getNow(),
      }),
      h.outbox.claimDue({
        limit: 1,
        leaseMs: 120_000,
        workerId: "w2",
        now: h.getNow(),
      }),
    ]);
    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(1);
    await h.processor.processClaimed(claimed[0]!);
    expect(h.delivery.uniqueSendCount()).toBe(1);
  });

  it("recovers an expired claim lease without duplicate send after success", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    const intent = h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.created",
      now: h.getNow(),
    });
    const claimed = await h.outbox.claimDue({
      limit: 1,
      leaseMs: 1_000,
      workerId: "w1",
      now: h.getNow(),
    });
    expect(claimed[0]?.id).toBe(intent.id);
    h.setNow(new Date(h.getNow().getTime() + 2_000));
    const recovered = await h.outbox.claimDue({
      limit: 1,
      leaseMs: 1_000,
      workerId: "w2",
      now: h.getNow(),
    });
    expect(recovered).toHaveLength(1);
    await h.processor.processClaimed(recovered[0]!);
    await h.processor.processClaimed(recovered[0]!);
    expect(h.delivery.uniqueSendCount()).toBe(1);
  });

  it("retries transient failures on the approved schedule then terminals", async () => {
    expect(NOTIFICATION_MAX_ATTEMPTS).toBe(5);
    expect([...NOTIFICATION_RETRY_DELAYS_MS]).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000, 21_600_000,
    ]);
    const h = harness();
    const seeded = await seedEligible(h);
    h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.created",
      now: h.getNow(),
    });
    h.delivery.nextOutcome = { outcome: "transient_failure", errorCategory: "provider_transient" };
    const delays = [60_000, 300_000, 1_800_000, 7_200_000];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await h.processor.processBatch();
      const row = [...h.outbox.records.values()][0];
      expect(row?.status).toBe("pending");
      expect(row?.attemptCount).toBe(attempt);
      expect(nextRetryAt(attempt, h.getNow())?.getTime()).toBe(
        h.getNow().getTime() + delays[attempt - 1]!,
      );
      h.setNow(new Date(h.getNow().getTime() + delays[attempt - 1]!));
    }
    await h.processor.processBatch();
    const terminal = [...h.outbox.records.values()][0];
    expect(terminal?.status).toBe("failed_terminal");
    expect(terminal?.attemptCount).toBe(5);
    expect(h.delivery.uniqueSendCount()).toBe(0);
    expect(h.appointments.records.get(seeded.appointment.id)?.status).toBe("REQUESTED");
  });

  it("permanent provider errors are terminal without retry", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.created",
      now: h.getNow(),
    });
    h.delivery.nextOutcome = { outcome: "rejected", errorCategory: "provider_permanent" };
    await h.processor.processBatch();
    const row = [...h.outbox.records.values()][0];
    expect(row?.status).toBe("failed_terminal");
    const again = await h.outbox.claimDue({
      limit: 10,
      leaseMs: 1_000,
      workerId: "w1",
      now: h.getNow(),
    });
    expect(again).toHaveLength(0);
    expect(h.appointments.records.get(seeded.appointment.id)?.status).toBe("REQUESTED");
  });

  it("does not persist recipient email or message body in audit or logs", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.created",
      now: h.getNow(),
    });
    await h.processor.processBatch();
    expectNoLeak(h.outbox.audit);
    expectNoLeak(h.logger.lines);
    const publicBody = await handleNotificationGet(h.notifications, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      outboxId: [...h.outbox.records.keys()][0],
    });
    expectNoLeak(publicBody.body);
    expect(JSON.stringify(publicBody.body)).not.toContain("Hello Ada");
  });
});

describe("notification authorization", () => {
  it("denies cross-tenant notification reads without leaking metadata", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    const intent = h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.created",
      now: h.getNow(),
    });
    const result = await handleNotificationGet(h.notifications, {
      identity: identity(STAFF_B),
      organizationId: ORG_B,
      outboxId: intent.id,
    });
    expect(result.status).toBe(404);
    expectNoLeak(result.body);
  });

  it("PATIENT and SYSTEM_ADMIN cannot read notification metadata", async () => {
    const h = harness();
    const seeded = await seedEligible(h);
    const intent = h.outbox.createPending({
      organizationId: ORG_A,
      appointmentId: seeded.appointment.id,
      eventType: "appointment.created",
      now: h.getNow(),
    });
    await expect(
      h.notifications.get(identity(PATIENT_ROLE), ORG_A, intent.id),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(
      h.notifications.get(identity(PLATFORM_ADMIN), ORG_A, intent.id),
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });
});

describe("templates and SMTP classification", () => {
  it("includes first name and logistics only", () => {
    const appointment = {
      id: "appointment_1",
      organizationId: ORG_A,
      branchId: "branch_a",
      patientId: "patient_1",
      practitionerId: "pract_1",
      startAtUtc: SLOT_A.startAtUtc,
      endAtUtc: SLOT_A.endAtUtc,
      timezone: SLOT_A.timezone,
      status: "REQUESTED",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    } as Appointment;
    const rendered = renderAppointmentEmail({
      eventType: "appointment.cancelled",
      patient: {
        id: "patient_1",
        organizationId: ORG_A,
        firstName: "Ada",
        lastName: "Lovelace",
        dateOfBirth: "1815-12-10",
        email: "ada@example.test",
        status: "active",
        appointmentNotificationConsent: true,
        appointmentNotificationOptOut: false,
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
      appointment,
    });
    expect(rendered.subject).toBe("Appointment cancelled");
    expect(rendered.textBody).toContain("Ada");
    expect(rendered.textBody).not.toContain("Lovelace");
    expect(rendered.textBody).not.toContain("ada@example.test");
    expect(rendered.textBody).not.toContain("1815-12-10");
  });

  it("classifies SMTP timeouts as transient and unknown recipients as permanent", () => {
    expect(classifySmtpError({ code: "ETIMEDOUT" })).toMatchObject({
      outcome: "transient_failure",
      errorCategory: "provider_transient",
    });
    expect(classifySmtpError({ responseCode: 550 })).toMatchObject({
      outcome: "rejected",
      errorCategory: "provider_permanent",
    });
  });
});

describe("M5 schema constraints", () => {
  it("adds consent columns, outbox processing fields, and notification.read without cascade", () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        "packages/db/prisma/migrations/20260815140000_m5_notification_delivery/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("appointmentNotificationConsent");
    expect(sql).toContain("appointmentNotificationOptOut");
    expect(sql).toContain("claimedUntil");
    expect(sql).toContain("notification.read");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).not.toContain("role_system_admin");
  });
});
