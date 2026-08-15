import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuthenticatedIdentity } from "@dentalcare/domain";
import {
  APPOINTMENT_LIFECYCLE_COMMANDS,
  CHECK_IN_LEAD_MS,
  OUTBOX_EVENT_TYPES,
  canApplyLifecycleCommand,
  canCancel,
} from "@dentalcare/domain";
import { RbacAuthorizationAdapter } from "../foundation/authz/rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "../foundation/authz/in-memory-directory.js";
import { InMemoryPatientRepository } from "../patient/in-memory-repository.js";
import { AppointmentApplicationService } from "./service.js";
import {
  InMemoryAppointmentRepository,
  InMemoryBranchLookup,
  InMemoryPractitionerRepository,
} from "./in-memory-repository.js";
import {
  handleAppointmentCheckIn,
  handleAppointmentComplete,
  handleAppointmentConfirm,
  handleAppointmentNoShow,
  handleAppointmentStart,
} from "./http.js";
import { parseCommandBody } from "./validation.js";
import { AppointmentValidationError } from "@dentalcare/domain";

const ORG_A = "org_a";
const ORG_B = "org_b";
const STAFF_A = "user_staff_a";
const STAFF_B = "user_staff_b";
const PRACTITIONER_A = "user_practitioner_a";
const ADMIN_A = "user_admin_a";
const DISABLED = "user_disabled";
const NO_MEMBER = "user_nomember";
const REVOKED = "user_revoked";
const PATIENT_ROLE = "user_patient_role";
const PLATFORM_ADMIN = "user_platform";

const ADA = {
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1815-12-10",
  email: "ada@example.test",
  phone: "+447700900123",
};

const ALAN = {
  firstName: "Alan",
  lastName: "Turing",
  dateOfBirth: "1912-06-23",
  email: "alan@example.test",
  phone: "+447700900124",
};

const SLOT_A = {
  startAtUtc: "2026-09-01T09:00:00.000Z",
  endAtUtc: "2026-09-01T10:00:00.000Z",
  timezone: "Europe/London",
};

const SLOT_OVERLAP = {
  startAtUtc: "2026-09-01T09:30:00.000Z",
  endAtUtc: "2026-09-01T10:30:00.000Z",
  timezone: "Europe/London",
};

const AT_START = new Date("2026-09-01T09:00:00.000Z");
const THIRTY_BEFORE = new Date("2026-09-01T08:30:00.000Z");
const THIRTY_ONE_BEFORE = new Date("2026-09-01T08:29:59.000Z");
const AT_END = new Date("2026-09-01T10:00:00.000Z");
const AFTER_END = new Date("2026-09-01T10:00:01.000Z");
const BEFORE_START = new Date("2026-09-01T08:59:59.000Z");

const LEAK_MARKERS = [
  "Ada",
  "Lovelace",
  "ada@example.test",
  "+447700900123",
  "1815-12-10",
  "Alan",
  "Turing",
  "2026-09-01T09:00:00.000Z",
  "Europe/London",
];

function identity(userId: string): AuthenticatedIdentity {
  return {
    userId,
    issuer: "https://example.test",
    subject: `sub-${userId}`,
    authenticatedAt: "2026-08-14T00:00:00.000Z",
  };
}

function expectNoLeak(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const marker of LEAK_MARKERS) {
    expect(serialized).not.toContain(marker);
  }
}

function harness(clock = () => AT_START) {
  const directory = new InMemoryAuthorizationDirectory();
  directory.addUser(STAFF_A).addUser(STAFF_B).addUser(PRACTITIONER_A).addUser(ADMIN_A);
  directory.addUser(DISABLED, "disabled").addUser(NO_MEMBER).addUser(REVOKED);
  directory.addUser(PATIENT_ROLE).addUser(PLATFORM_ADMIN);
  directory.addOrganization(ORG_A).addOrganization(ORG_B);
  directory.addMembership({ userId: STAFF_A, organizationId: ORG_A, roleKeys: ["STAFF"] });
  directory.addMembership({ userId: STAFF_B, organizationId: ORG_B, roleKeys: ["STAFF"] });
  directory.addMembership({
    userId: PRACTITIONER_A,
    organizationId: ORG_A,
    roleKeys: ["PRACTITIONER"],
  });
  directory.addMembership({
    userId: ADMIN_A,
    organizationId: ORG_A,
    roleKeys: ["PRACTICE_ADMIN"],
  });
  directory.addMembership({
    userId: DISABLED,
    organizationId: ORG_A,
    roleKeys: ["STAFF"],
  });
  directory.addMembership({
    userId: REVOKED,
    organizationId: ORG_A,
    status: "revoked",
    roleKeys: ["STAFF"],
  });
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
  const service = new AppointmentApplicationService(
    authorization,
    appointments,
    patients,
    practitioners,
    branches,
    clock,
  );
  return { directory, patients, practitioners, branches, appointments, service };
}

async function seedOrg(h: ReturnType<typeof harness>, organizationId: string) {
  const ada = await h.patients.create(organizationId, ADA);
  const alan = await h.patients.create(organizationId, ALAN);
  const practitioner = await h.practitioners.create(
    organizationId,
    `user_pract_profile_${organizationId}`,
  );
  const otherPractitioner = await h.practitioners.create(
    organizationId,
    `user_pract_profile2_${organizationId}`,
  );
  const branchId = `branch_${organizationId}`;
  h.branches.add(organizationId, branchId);
  h.practitioners.assignToBranch(practitioner.id, branchId);
  h.practitioners.assignToBranch(otherPractitioner.id, branchId);
  return { ada, alan, practitioner, otherPractitioner, branchId };
}

function createBody(
  seed: Awaited<ReturnType<typeof seedOrg>>,
  slot: typeof SLOT_A = SLOT_A,
  patientId = seed.ada.id,
  practitionerId = seed.practitioner.id,
) {
  return {
    patientId,
    branchId: seed.branchId,
    practitionerId,
    ...slot,
  };
}

async function createRequested(
  h: ReturnType<typeof harness>,
  seed: Awaited<ReturnType<typeof seedOrg>>,
) {
  const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("expected create");
  return created.data;
}

describe("M6 domain time and cancel rules", () => {
  it("allows check-in from 30 minutes before start through scheduled end", () => {
    expect(CHECK_IN_LEAD_MS).toBe(30 * 60_000);
    expect(
      canApplyLifecycleCommand(
        "check_in",
        "CONFIRMED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        THIRTY_BEFORE,
      ),
    ).toBe(true);
    expect(
      canApplyLifecycleCommand(
        "check_in",
        "CONFIRMED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        AT_START,
      ),
    ).toBe(true);
    expect(
      canApplyLifecycleCommand("check_in", "CONFIRMED", SLOT_A.startAtUtc, SLOT_A.endAtUtc, AT_END),
    ).toBe(true);
    expect(
      canApplyLifecycleCommand(
        "check_in",
        "CONFIRMED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        THIRTY_ONE_BEFORE,
      ),
    ).toBe(false);
    expect(
      canApplyLifecycleCommand(
        "check_in",
        "CONFIRMED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        AFTER_END,
      ),
    ).toBe(false);
  });

  it("allows no-show from CONFIRMED at or after scheduled start only", () => {
    expect(
      canApplyLifecycleCommand(
        "no_show",
        "CONFIRMED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        AT_START,
      ),
    ).toBe(true);
    expect(
      canApplyLifecycleCommand(
        "no_show",
        "CONFIRMED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        AFTER_END,
      ),
    ).toBe(true);
    expect(
      canApplyLifecycleCommand(
        "no_show",
        "CONFIRMED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        BEFORE_START,
      ),
    ).toBe(false);
    expect(
      canApplyLifecycleCommand(
        "no_show",
        "REQUESTED",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        AT_START,
      ),
    ).toBe(false);
  });

  it("places no extra clock rule on start or complete besides status", () => {
    expect(
      canApplyLifecycleCommand(
        "start",
        "CHECKED_IN",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        THIRTY_ONE_BEFORE,
      ),
    ).toBe(true);
    expect(
      canApplyLifecycleCommand(
        "complete",
        "IN_PROGRESS",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        AFTER_END,
      ),
    ).toBe(true);
    expect(
      canApplyLifecycleCommand("start", "CONFIRMED", SLOT_A.startAtUtc, SLOT_A.endAtUtc, AT_START),
    ).toBe(false);
    expect(
      canApplyLifecycleCommand(
        "complete",
        "CHECKED_IN",
        SLOT_A.startAtUtc,
        SLOT_A.endAtUtc,
        AT_START,
      ),
    ).toBe(false);
  });

  it("allows cancel through CHECKED_IN and denies after IN_PROGRESS", () => {
    expect(canCancel("REQUESTED")).toBe(true);
    expect(canCancel("CONFIRMED")).toBe(true);
    expect(canCancel("CHECKED_IN")).toBe(true);
    expect(canCancel("IN_PROGRESS")).toBe(false);
    expect(canCancel("COMPLETED")).toBe(false);
    expect(canCancel("NO_SHOW")).toBe(false);
    expect(canCancel("CANCELLED")).toBe(false);
  });
});

describe("M6 approved transitions", () => {
  it("walks REQUESTED → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    const confirmed = await h.service.confirm(identity(STAFF_A), ORG_A, appointment.id);
    expect(confirmed).toMatchObject({ ok: true, data: { status: "CONFIRMED" } });
    const checkedIn = await h.service.checkIn(identity(STAFF_A), ORG_A, appointment.id);
    expect(checkedIn).toMatchObject({ ok: true, data: { status: "CHECKED_IN" } });
    const started = await h.service.start(identity(STAFF_A), ORG_A, appointment.id);
    expect(started).toMatchObject({ ok: true, data: { status: "IN_PROGRESS" } });
    const completed = await h.service.complete(identity(STAFF_A), ORG_A, appointment.id);
    expect(completed).toMatchObject({ ok: true, data: { status: "COMPLETED" } });
    expect(h.appointments.history.map((row) => row.eventType)).toEqual([
      "created",
      "confirmed",
      "checked_in",
      "started",
      "completed",
    ]);
    expect(h.appointments.audit.map((row) => row.action)).toEqual([
      "appointment.create",
      "appointment.confirm",
      "appointment.check_in",
      "appointment.start",
      "appointment.complete",
    ]);
    expect(h.appointments.outbox.map((row) => row.eventType)).toEqual(["appointment.created"]);
  });

  it("records no-show from CONFIRMED", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    await h.service.confirm(identity(STAFF_A), ORG_A, appointment.id);
    const noShow = await h.service.noShow(identity(STAFF_A), ORG_A, appointment.id);
    expect(noShow).toMatchObject({ ok: true, data: { status: "NO_SHOW" } });
    expect(h.appointments.history.at(-1)).toMatchObject({
      eventType: "no_show",
      fromStatus: "CONFIRMED",
      toStatus: "NO_SHOW",
      actorUserId: STAFF_A,
    });
    expect(h.appointments.audit.at(-1)).toMatchObject({ action: "appointment.no_show" });
  });

  it("allows PRACTITIONER and PRACTICE_ADMIN to confirm", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const first = await createRequested(h, seed);
    await expect(
      h.service.confirm(identity(PRACTITIONER_A), ORG_A, first.id),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "CONFIRMED" },
    });
    const second = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_OVERLAP, seed.alan.id, seed.otherPractitioner.id),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await expect(
      h.service.confirm(identity(ADMIN_A), ORG_A, second.data.id),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "CONFIRMED" },
    });
  });
});

describe("M6 prohibited transitions and reopen", () => {
  it("rejects skipped and reverse transitions", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    await expect(
      h.service.checkIn(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "invalid_input",
    });
    await expect(h.service.start(identity(STAFF_A), ORG_A, appointment.id)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    await expect(
      h.service.complete(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    await expect(h.service.noShow(identity(STAFF_A), ORG_A, appointment.id)).resolves.toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    await h.service.confirm(identity(STAFF_A), ORG_A, appointment.id);
    await expect(h.service.start(identity(STAFF_A), ORG_A, appointment.id)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    await expect(
      h.service.complete(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    await expect(
      h.service.confirm(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("does not reopen COMPLETED, NO_SHOW, or CANCELLED", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const completed = await createRequested(h, seed);
    await h.service.confirm(identity(STAFF_A), ORG_A, completed.id);
    await h.service.checkIn(identity(STAFF_A), ORG_A, completed.id);
    await h.service.start(identity(STAFF_A), ORG_A, completed.id);
    await h.service.complete(identity(STAFF_A), ORG_A, completed.id);
    for (const command of [
      () => h.service.confirm(identity(STAFF_A), ORG_A, completed.id),
      () => h.service.checkIn(identity(STAFF_A), ORG_A, completed.id),
      () => h.service.start(identity(STAFF_A), ORG_A, completed.id),
      () => h.service.complete(identity(STAFF_A), ORG_A, completed.id),
      () => h.service.noShow(identity(STAFF_A), ORG_A, completed.id),
      () => h.service.cancel(identity(STAFF_A), ORG_A, completed.id),
    ]) {
      await expect(command()).resolves.toMatchObject({
        ok: false,
        status: 400,
        error: "invalid_input",
      });
    }

    const noShow = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_A, seed.alan.id, seed.otherPractitioner.id),
    );
    expect(noShow.ok).toBe(true);
    if (!noShow.ok) return;
    await h.service.confirm(identity(STAFF_A), ORG_A, noShow.data.id);
    await h.service.noShow(identity(STAFF_A), ORG_A, noShow.data.id);
    await expect(
      h.service.confirm(identity(STAFF_A), ORG_A, noShow.data.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
    });

    const cancelled = await createRequested(h, seed);
    await h.service.cancel(identity(STAFF_A), ORG_A, cancelled.id);
    await expect(h.service.confirm(identity(STAFF_A), ORG_A, cancelled.id)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("M6 timing", () => {
  it("rejects check-in before the 30-minute window and after scheduled end", async () => {
    let now = THIRTY_ONE_BEFORE;
    const h = harness(() => now);
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    await h.service.confirm(identity(STAFF_A), ORG_A, appointment.id);
    await expect(
      h.service.checkIn(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "invalid_input",
    });
    now = THIRTY_BEFORE;
    await expect(
      h.service.checkIn(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "CHECKED_IN" },
    });

    let late = AFTER_END;
    const lateH = harness(() => late);
    const lateSeed = await seedOrg(lateH, ORG_A);
    const lateAppointment = await createRequested(lateH, lateSeed);
    await lateH.service.confirm(identity(STAFF_A), ORG_A, lateAppointment.id);
    await expect(
      lateH.service.checkIn(identity(STAFF_A), ORG_A, lateAppointment.id),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    late = AT_END;
    const onTime = await lateH.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(lateSeed, SLOT_A, lateSeed.alan.id, lateSeed.otherPractitioner.id),
    );
    expect(onTime.ok).toBe(true);
    if (!onTime.ok) return;
    await lateH.service.confirm(identity(STAFF_A), ORG_A, onTime.data.id);
    await expect(
      lateH.service.checkIn(identity(STAFF_A), ORG_A, onTime.data.id),
    ).resolves.toMatchObject({ ok: true, data: { status: "CHECKED_IN" } });
  });

  it("rejects no-show before scheduled start", async () => {
    const h = harness(() => BEFORE_START);
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    await h.service.confirm(identity(STAFF_A), ORG_A, appointment.id);
    await expect(h.service.noShow(identity(STAFF_A), ORG_A, appointment.id)).resolves.toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
  });

  it("allows start only after check-in and complete only after in-progress, including after scheduled end", async () => {
    const h = harness(() => AFTER_END);
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    await h.service.confirm(identity(STAFF_A), ORG_A, appointment.id);
    await expect(h.service.start(identity(STAFF_A), ORG_A, appointment.id)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    const onTime = harness();
    const onTimeSeed = await seedOrg(onTime, ORG_A);
    const walk = await createRequested(onTime, onTimeSeed);
    await onTime.service.confirm(identity(STAFF_A), ORG_A, walk.id);
    await onTime.service.checkIn(identity(STAFF_A), ORG_A, walk.id);
    await expect(onTime.service.complete(identity(STAFF_A), ORG_A, walk.id)).resolves.toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    await onTime.service.start(identity(STAFF_A), ORG_A, walk.id);
    await expect(onTime.service.complete(identity(STAFF_A), ORG_A, walk.id)).resolves.toMatchObject(
      {
        ok: true,
        data: { status: "COMPLETED" },
      },
    );
  });
});

describe("M6 cancel and slot release", () => {
  it("cancels through CHECKED_IN and denies cancel after IN_PROGRESS", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const checkedIn = await createRequested(h, seed);
    await h.service.confirm(identity(STAFF_A), ORG_A, checkedIn.id);
    await h.service.checkIn(identity(STAFF_A), ORG_A, checkedIn.id);
    await expect(h.service.cancel(identity(STAFF_A), ORG_A, checkedIn.id)).resolves.toMatchObject({
      ok: true,
      data: { status: "CANCELLED" },
    });

    const inProgress = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_A, seed.alan.id, seed.otherPractitioner.id),
    );
    expect(inProgress.ok).toBe(true);
    if (!inProgress.ok) return;
    await h.service.confirm(identity(STAFF_A), ORG_A, inProgress.data.id);
    await h.service.checkIn(identity(STAFF_A), ORG_A, inProgress.data.id);
    await h.service.start(identity(STAFF_A), ORG_A, inProgress.data.id);
    await expect(
      h.service.cancel(identity(STAFF_A), ORG_A, inProgress.data.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "invalid_input",
    });
  });

  it("releases practitioner and patient overlap after COMPLETED, NO_SHOW, and CANCELLED", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const completed = await createRequested(h, seed);
    await h.service.confirm(identity(STAFF_A), ORG_A, completed.id);
    await h.service.checkIn(identity(STAFF_A), ORG_A, completed.id);
    await h.service.start(identity(STAFF_A), ORG_A, completed.id);
    await h.service.complete(identity(STAFF_A), ORG_A, completed.id);
    await expect(
      h.service.create(identity(STAFF_A), ORG_A, createBody(seed, SLOT_OVERLAP)),
    ).resolves.toMatchObject({ ok: true, status: 201 });

    const noShowH = harness();
    const noShowSeed = await seedOrg(noShowH, ORG_A);
    const noShow = await createRequested(noShowH, noShowSeed);
    await noShowH.service.confirm(identity(STAFF_A), ORG_A, noShow.id);
    await noShowH.service.noShow(identity(STAFF_A), ORG_A, noShow.id);
    await expect(
      noShowH.service.create(identity(STAFF_A), ORG_A, createBody(noShowSeed, SLOT_OVERLAP)),
    ).resolves.toMatchObject({ ok: true, status: 201 });

    const cancelH = harness();
    const cancelSeed = await seedOrg(cancelH, ORG_A);
    const cancelled = await createRequested(cancelH, cancelSeed);
    await cancelH.service.cancel(identity(STAFF_A), ORG_A, cancelled.id);
    await expect(
      cancelH.service.create(identity(STAFF_A), ORG_A, createBody(cancelSeed, SLOT_OVERLAP)),
    ).resolves.toMatchObject({ ok: true, status: 201 });
  });
});

describe("M6 history, audit, and notification boundary", () => {
  it("writes history and security events once and never a new outbox type", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    const beforeOutbox = h.appointments.outbox.length;
    await h.service.confirm(identity(STAFF_A), ORG_A, appointment.id);
    expect(h.appointments.history.filter((row) => row.eventType === "confirmed")).toHaveLength(1);
    expect(h.appointments.audit.filter((row) => row.action === "appointment.confirm")).toHaveLength(
      1,
    );
    expect(h.appointments.outbox).toHaveLength(beforeOutbox);
    expect(OUTBOX_EVENT_TYPES).toEqual([
      "appointment.created",
      "appointment.rescheduled",
      "appointment.cancelled",
    ]);
    for (const command of APPOINTMENT_LIFECYCLE_COMMANDS) {
      expect(OUTBOX_EVENT_TYPES as readonly string[]).not.toContain(`appointment.${command}`);
    }
  });

  it("rolls back the status change if history or audit persistence fails", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    h.appointments.failHistory = true;
    await expect(
      h.service.confirm(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
    expect(h.appointments.records.get(appointment.id)?.status).toBe("REQUESTED");
    expect(h.appointments.history.filter((row) => row.eventType === "confirmed")).toHaveLength(0);
    h.appointments.failHistory = false;
    h.appointments.failAudit = true;
    await expect(
      h.service.confirm(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
    expect(h.appointments.records.get(appointment.id)?.status).toBe("REQUESTED");
    h.appointments.failAudit = false;
    h.appointments.failOutbox = true;
    await expect(
      h.service.confirm(identity(STAFF_A), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "CONFIRMED" },
    });
    expect(h.appointments.outbox.map((row) => row.eventType)).toEqual(["appointment.created"]);
  });
});

describe("M6 authorization and tenancy", () => {
  it("denies unauthenticated, disabled, missing-membership, revoked, PATIENT, and SYSTEM_ADMIN", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    const unauthenticated = await handleAppointmentConfirm(h.service, {
      identity: null,
      organizationId: ORG_A,
      appointmentId: appointment.id,
      body: {},
    });
    expect(unauthenticated.status).toBe(401);
    expectNoLeak(unauthenticated.body);
    await expect(
      h.service.confirm(identity(DISABLED), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(
      h.service.confirm(identity(NO_MEMBER), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(
      h.service.confirm(identity(REVOKED), ORG_A, appointment.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(
      h.service.confirm(identity(PATIENT_ROLE), ORG_A, appointment.id),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(
      h.service.confirm(identity(PLATFORM_ADMIN), ORG_A, appointment.id),
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("returns safe 404 for cross-tenant confirm, check-in, start, complete, and no-show", async () => {
    const h = harness();
    const seedB = await seedOrg(h, ORG_B);
    const created = await h.service.create(identity(STAFF_B), ORG_B, createBody(seedB));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const handlers = [
      handleAppointmentConfirm,
      handleAppointmentCheckIn,
      handleAppointmentStart,
      handleAppointmentComplete,
      handleAppointmentNoShow,
    ];
    for (const handle of handlers) {
      const result = await handle(h.service, {
        identity: identity(STAFF_A),
        organizationId: ORG_A,
        appointmentId: created.data.id,
        body: {},
      });
      expect(result.status).toBe(404);
      expect(result.body.error).toBe("not_found");
      expectNoLeak(result.body);
    }
  });

  it("rejects client-supplied status, actor, and tenant fields on command bodies", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const appointment = await createRequested(h, seed);
    expect(() => parseCommandBody({ status: "COMPLETED" })).toThrow(AppointmentValidationError);
    const tampered = await handleAppointmentConfirm(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: appointment.id,
      body: {
        status: "COMPLETED",
        userId: PLATFORM_ADMIN,
        organizationId: ORG_B,
        actorUserId: "forged",
      },
    });
    expect(tampered.status).toBe(400);
    expect(h.appointments.records.get(appointment.id)?.status).toBe("REQUESTED");
    const ok = await handleAppointmentConfirm(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: appointment.id,
      body: {},
    });
    expect(ok.status).toBe(200);
    expect((ok.body.appointment as { status: string }).status).toBe("CONFIRMED");
  });
});

describe("M6 schema and isolation", () => {
  it("adds only the approved M6 permission seeds", () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        "packages/db/prisma/migrations/20260815160000_m6_appointment_operations/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("appointment.confirm");
    expect(sql).toContain("appointment.check_in");
    expect(sql).toContain("appointment.start");
    expect(sql).toContain("appointment.complete");
    expect(sql).toContain("appointment.no_show");
    expect(sql).toContain("'role_staff'");
    expect(sql).toContain("'role_practitioner'");
    expect(sql).toContain("'role_practice_admin'");
    expect(sql).not.toContain("role_patient");
    expect(sql).not.toContain("role_system_admin");
    expect(sql).not.toContain("appointment.created");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).not.toContain('ALTER TABLE "appointments"');
  });

  it("does not add clinical, billing, calendar, or portal behavior", () => {
    const files = [
      "packages/application/src/appointment/service.ts",
      "packages/application/src/appointment/http.ts",
      "packages/db/src/appointment-store.ts",
      "packages/domain/src/appointment/lifecycle.ts",
    ];
    for (const file of files) {
      const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain("clinical");
      expect(source).not.toContain("invoice");
      expect(source).not.toContain("calendar");
      expect(source).not.toContain("patient portal");
      expect(source).not.toContain("appointment.confirmed");
      expect(source).not.toContain("NotificationDeliveryPort");
    }
  });
});
