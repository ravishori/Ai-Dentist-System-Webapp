import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuthenticatedIdentity } from "@dentalcare/domain";
import { AppointmentValidationError } from "@dentalcare/domain";
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
  handleAppointmentCancel,
  handleAppointmentCreate,
  handleAppointmentGet,
  handleAppointmentList,
  handleAppointmentPatch,
  handleAppointmentReschedule,
} from "./http.js";
import { parseCreateInput, parsePatchInput, parseRescheduleInput } from "./validation.js";

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

const SLOT_ADJACENT = {
  startAtUtc: "2026-09-01T10:00:00.000Z",
  endAtUtc: "2026-09-01T11:00:00.000Z",
  timezone: "Europe/London",
};

const SLOT_B = {
  startAtUtc: "2026-09-02T14:00:00.000Z",
  endAtUtc: "2026-09-02T15:00:00.000Z",
  timezone: "Europe/London",
};

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

function harness() {
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

describe("appointment domain validation", () => {
  it("rejects missing required fields and non-IANA timezones", () => {
    expect(() => parseCreateInput({ ...SLOT_A })).toThrow(AppointmentValidationError);
    expect(() =>
      parseCreateInput({
        patientId: "patient_1",
        branchId: "branch_1",
        practitionerId: "practitioner_1",
        ...SLOT_A,
        timezone: "IST",
      }),
    ).toThrow(AppointmentValidationError);
    expect(() =>
      parseCreateInput({
        patientId: "patient_1",
        branchId: "branch_1",
        practitionerId: "practitioner_1",
        ...SLOT_A,
        timezone: "EST",
      }),
    ).toThrow(AppointmentValidationError);
  });

  it("rejects end at or before start", () => {
    expect(() =>
      parseCreateInput({
        patientId: "patient_1",
        branchId: "branch_1",
        practitionerId: "practitioner_1",
        startAtUtc: SLOT_A.startAtUtc,
        endAtUtc: SLOT_A.startAtUtc,
        timezone: SLOT_A.timezone,
      }),
    ).toThrow(AppointmentValidationError);
  });

  it("rejects tenant ownership fields and PATCH mutation bodies", () => {
    expect(() =>
      parseCreateInput({
        patientId: "patient_1",
        branchId: "branch_1",
        practitionerId: "practitioner_1",
        ...SLOT_A,
        organizationId: ORG_B,
      }),
    ).toThrow(AppointmentValidationError);
    expect(() => parsePatchInput({ status: "CONFIRMED" })).toThrow(AppointmentValidationError);
    expect(() => parsePatchInput({ startAtUtc: SLOT_B.startAtUtc })).toThrow(
      AppointmentValidationError,
    );
    expect(() => parseRescheduleInput({ ...SLOT_B, status: "CONFIRMED" })).toThrow(
      AppointmentValidationError,
    );
  });
});

describe("appointment authorization and BOLA", () => {
  it("unauthenticated create is denied", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    await expect(h.service.create(null, ORG_A, createBody(seed))).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("HTTP create requires a session", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const result = await handleAppointmentCreate(h.service, {
      identity: null,
      organizationId: ORG_A,
      body: createBody(seed),
    });
    expect(result.status).toBe(401);
    expectNoLeak(result.body);
  });

  it("STAFF in organization A can create, read, list, reschedule, and cancel", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created).toMatchObject({ ok: true, status: 201, data: { status: "REQUESTED" } });
    if (!created.ok) return;
    expect(created.data.organizationId).toBe(ORG_A);
    const read = await h.service.get(identity(STAFF_A), ORG_A, created.data.id);
    expect(read).toMatchObject({ ok: true, data: { id: created.data.id } });
    const list = await h.service.list(identity(STAFF_A), ORG_A);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data).toHaveLength(1);
    const rescheduled = await h.service.reschedule(
      identity(STAFF_A),
      ORG_A,
      created.data.id,
      SLOT_B,
    );
    expect(rescheduled).toMatchObject({ ok: true, data: { startAtUtc: SLOT_B.startAtUtc } });
    const cancelled = await h.service.cancel(identity(STAFF_A), ORG_A, created.data.id);
    expect(cancelled).toMatchObject({ ok: true, data: { status: "CANCELLED" } });
    expect(h.appointments.history.map((row) => row.eventType)).toEqual([
      "created",
      "rescheduled",
      "cancelled",
    ]);
    expect(h.appointments.audit.map((row) => row.action)).toEqual([
      "appointment.create",
      "appointment.reschedule",
      "appointment.cancel",
    ]);
    expect(h.appointments.outbox.map((row) => row.eventType)).toEqual([
      "appointment.created",
      "appointment.rescheduled",
      "appointment.cancelled",
    ]);
  });

  it("PRACTITIONER and PRACTICE_ADMIN can create appointments", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    await expect(
      h.service.create(identity(PRACTITIONER_A), ORG_A, createBody(seed)),
    ).resolves.toMatchObject({ ok: true, status: 201 });
    await expect(
      h.service.create(identity(ADMIN_A), ORG_A, createBody(seed, SLOT_B, seed.alan.id)),
    ).resolves.toMatchObject({ ok: true, status: 201 });
  });

  it("staff in organization A cannot read organization B appointment", async () => {
    const h = harness();
    const seedB = await seedOrg(h, ORG_B);
    const created = await h.service.create(identity(STAFF_B), ORG_B, createBody(seedB));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const crossGet = await h.service.get(identity(STAFF_A), ORG_A, created.data.id);
    expect(crossGet).toMatchObject({ ok: false, status: 404, error: "not_found" });
    expectNoLeak(crossGet);
  });

  it("forged appointment id from another tenant is not found on GET/PATCH/cancel/reschedule", async () => {
    const h = harness();
    const seedB = await seedOrg(h, ORG_B);
    const created = await h.service.create(identity(STAFF_B), ORG_B, createBody(seedB));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const get = await handleAppointmentGet(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: created.data.id,
    });
    const patch = await handleAppointmentPatch(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: created.data.id,
      body: { status: "CONFIRMED" },
    });
    const cancel = await handleAppointmentCancel(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: created.data.id,
    });
    const reschedule = await handleAppointmentReschedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: created.data.id,
      body: SLOT_B,
    });
    expect(get.status).toBe(404);
    expect(patch.status).toBe(404);
    expect(cancel.status).toBe(404);
    expect(reschedule.status).toBe(404);
    expectNoLeak(get.body);
    expectNoLeak(patch.body);
    expectNoLeak(cancel.body);
    expectNoLeak(reschedule.body);
  });

  it("tampered organization header does not grant access", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await h.service.get(identity(STAFF_A), ORG_B, created.data.id);
    expect(result).toMatchObject({ ok: false, status: 403, error: "forbidden" });
    expectNoLeak(result);
  });

  it("cross-tenant list does not include foreign appointments", async () => {
    const h = harness();
    const seedA = await seedOrg(h, ORG_A);
    const seedB = await seedOrg(h, ORG_B);
    await h.service.create(identity(STAFF_A), ORG_A, createBody(seedA));
    await h.service.create(identity(STAFF_B), ORG_B, createBody(seedB, SLOT_B));
    const listA = await handleAppointmentList(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
    });
    expect(listA.status).toBe(200);
    expect(listA.body.appointments).toHaveLength(1);
    expect(JSON.stringify(listA.body)).not.toContain(SLOT_B.startAtUtc);
  });

  it("authenticated user without membership cannot create", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    await expect(
      h.service.create(identity(NO_MEMBER), ORG_A, createBody(seed)),
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("revoked membership cannot read appointments", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(h.service.get(identity(REVOKED), ORG_A, created.data.id)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("disabled user cannot create appointments", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    await expect(
      h.service.create(identity(DISABLED), ORG_A, createBody(seed)),
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("PATIENT role cannot use tenant appointment APIs", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      h.service.create(identity(PATIENT_ROLE), ORG_A, createBody(seed, SLOT_B, seed.alan.id)),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(
      h.service.get(identity(PATIENT_ROLE), ORG_A, created.data.id),
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("SYSTEM_ADMIN without membership cannot access appointments", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      h.service.get(identity(PLATFORM_ADMIN), ORG_A, created.data.id),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(
      h.service.create(identity(PLATFORM_ADMIN), ORG_A, createBody(seed, SLOT_B, seed.alan.id)),
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("foreign patient, branch, and practitioner are rejected without leaking fields", async () => {
    const h = harness();
    const seedA = await seedOrg(h, ORG_A);
    const seedB = await seedOrg(h, ORG_B);
    const foreignPatient = await h.service.create(identity(STAFF_A), ORG_A, {
      ...createBody(seedA),
      patientId: seedB.ada.id,
    });
    const foreignBranch = await h.service.create(identity(STAFF_A), ORG_A, {
      ...createBody(seedA),
      branchId: seedB.branchId,
    });
    const foreignPractitioner = await h.service.create(identity(STAFF_A), ORG_A, {
      ...createBody(seedA),
      practitionerId: seedB.practitioner.id,
    });
    expect(foreignPatient).toMatchObject({ ok: false, status: 400 });
    expect(foreignBranch).toMatchObject({ ok: false, status: 400 });
    expect(foreignPractitioner).toMatchObject({ ok: false, status: 400 });
    expectNoLeak(foreignPatient);
    expectNoLeak(foreignBranch);
    expectNoLeak(foreignPractitioner);
  });

  it("inactive patient cannot receive a new appointment; historical appointments remain readable", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await h.patients.updateByOrganizationAndId(ORG_A, seed.ada.id, { status: "inactive" });
    const historical = await h.service.get(identity(STAFF_A), ORG_A, created.data.id);
    expect(historical).toMatchObject({ ok: true, data: { id: created.data.id } });
    const next = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_B, seed.ada.id),
    );
    expect(next).toMatchObject({ ok: false, status: 400 });
  });

  it("PATCH has no mutable fields after a scoped lookup", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await handleAppointmentPatch(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId: created.data.id,
      body: { status: "CONFIRMED", startAtUtc: SLOT_B.startAtUtc },
    });
    expect(result.status).toBe(400);
    const unchanged = await h.service.get(identity(STAFF_A), ORG_A, created.data.id);
    expect(unchanged).toMatchObject({
      ok: true,
      data: { status: "REQUESTED", startAtUtc: SLOT_A.startAtUtc },
    });
  });

  it("malformed appointment id is invalid", async () => {
    const h = harness();
    await seedOrg(h, ORG_A);
    await expect(h.service.get(identity(STAFF_A), ORG_A, "   ")).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("nonexistent appointment in the authorized org is not found", async () => {
    const h = harness();
    await seedOrg(h, ORG_A);
    await expect(h.service.get(identity(STAFF_A), ORG_A, "missing")).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("repository failure fails closed", async () => {
    const h = harness();
    await seedOrg(h, ORG_A);
    h.appointments.failLookups = true;
    await expect(h.service.list(identity(STAFF_A), ORG_A)).resolves.toMatchObject({
      ok: false,
      status: 503,
      error: "unavailable",
    });
  });

  it("authorization lookup failure fails closed", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    h.directory.failLookups = true;
    await expect(
      h.service.create(identity(STAFF_A), ORG_A, createBody(seed)),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("appointment lifecycle and scheduling integrity", () => {
  it("rejects cancel and reschedule after cancellation", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const created = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      h.service.cancel(identity(STAFF_A), ORG_A, created.data.id),
    ).resolves.toMatchObject({ ok: true, data: { status: "CANCELLED" } });
    await expect(
      h.service.cancel(identity(STAFF_A), ORG_A, created.data.id),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      h.service.reschedule(identity(STAFF_A), ORG_A, created.data.id, SLOT_B),
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it("rejects overlapping practitioner appointments", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const first = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(first.ok).toBe(true);
    const conflict = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_OVERLAP, seed.alan.id, seed.practitioner.id),
    );
    expect(conflict).toMatchObject({ ok: false, status: 409, error: "conflict" });
    expectNoLeak(conflict);
  });

  it("rejects overlapping patient appointments", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const first = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(first.ok).toBe(true);
    const conflict = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_OVERLAP, seed.ada.id, seed.otherPractitioner.id),
    );
    expect(conflict).toMatchObject({ ok: false, status: 409, error: "conflict" });
    expectNoLeak(conflict);
  });

  it("allows adjacent slots and cancelled-slot reuse", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const first = await h.service.create(identity(STAFF_A), ORG_A, createBody(seed));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const adjacent = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_ADJACENT, seed.alan.id, seed.practitioner.id),
    );
    expect(adjacent).toMatchObject({ ok: true, status: 201 });
    await h.service.cancel(identity(STAFF_A), ORG_A, first.data.id);
    const reused = await h.service.create(
      identity(STAFF_A),
      ORG_A,
      createBody(seed, SLOT_A, seed.ada.id, seed.practitioner.id),
    );
    expect(reused).toMatchObject({ ok: true, status: 201 });
  });

  it("concurrent conflicting creates do not double-book", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const [first, second] = await Promise.all([
      h.service.create(identity(STAFF_A), ORG_A, createBody(seed)),
      h.service.create(
        identity(STAFF_A),
        ORG_A,
        createBody(seed, SLOT_OVERLAP, seed.alan.id, seed.practitioner.id),
      ),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const list = await h.service.list(identity(STAFF_A), ORG_A);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data).toHaveLength(1);
  });

  it("history, audit, and outbox failures roll back the appointment", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    h.appointments.failHistory = true;
    await expect(
      h.service.create(identity(STAFF_A), ORG_A, createBody(seed)),
    ).resolves.toMatchObject({ ok: false, status: 503 });
    expect(h.appointments.records.size).toBe(0);
    expect(h.appointments.history).toHaveLength(0);
    h.appointments.failHistory = false;
    h.appointments.failAudit = true;
    await expect(
      h.service.create(identity(STAFF_A), ORG_A, createBody(seed)),
    ).resolves.toMatchObject({ ok: false, status: 503 });
    expect(h.appointments.records.size).toBe(0);
    h.appointments.failAudit = false;
    h.appointments.failOutbox = true;
    await expect(
      h.service.create(identity(STAFF_A), ORG_A, createBody(seed)),
    ).resolves.toMatchObject({ ok: false, status: 503 });
    expect(h.appointments.records.size).toBe(0);
    expect(h.appointments.outbox).toHaveLength(0);
  });

  it("does not call a notification provider during create, reschedule, or cancel", async () => {
    const h = harness();
    const seed = await seedOrg(h, ORG_A);
    const { FakeNotificationAdapter } = await import("../notification/fake-adapter.js");
    const adapter = new FakeNotificationAdapter();
    const created = await handleAppointmentCreate(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      body: createBody(seed),
    });
    expect(created.status).toBe(201);
    const appointmentId = (created.body.appointment as { id: string }).id;
    await handleAppointmentReschedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId,
      body: SLOT_B,
    });
    await handleAppointmentCancel(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      appointmentId,
    });
    expect(h.appointments.outbox.map((row) => row.eventType)).toEqual([
      "appointment.created",
      "appointment.rescheduled",
      "appointment.cancelled",
    ]);
    expect(h.appointments.outbox.every((row) => row.status === "pending")).toBe(true);
    expect(adapter.uniqueSendCount()).toBe(0);
  });
});

describe("M4 schema constraints", () => {
  it("adds exclusion constraints, RESTRICT FKs, and appointment permissions", async () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        "packages/db/prisma/migrations/20260815120000_m4_appointment_domain/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "appointments"');
    expect(sql).toContain('CREATE TABLE "practitioners"');
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS btree_gist");
    expect(sql).toContain("appointments_practitioner_time_excl");
    expect(sql).toContain("appointments_patient_time_excl");
    expect(sql).toContain('tstzrange("startAtUtc", "endAtUtc", \'[)\')');
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).toContain("appointment.create");
    expect(sql).toContain("appointment.read.tenant");
    expect(sql).not.toContain("appointment.read.self");
    expect(sql).not.toContain("role_system_admin");
    expect(sql).not.toContain("ON DELETE CASCADE");
  });
});

describe("appointment HTTP isolation from delivery", () => {
  it("appointment handlers and store do not import a delivery port or SMTP library", () => {
    const files = [
      "packages/application/src/appointment/service.ts",
      "packages/application/src/appointment/http.ts",
      "packages/db/src/appointment-store.ts",
    ];
    for (const file of files) {
      const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain("NotificationDeliveryPort");
      expect(source).not.toContain("nodemailer");
      expect(source).not.toContain("SmtpNotificationAdapter");
      expect(source).not.toContain("FakeNotificationAdapter");
    }
  });
});
