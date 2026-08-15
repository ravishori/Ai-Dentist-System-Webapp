import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuthenticatedIdentity } from "@dentalcare/domain";
import { OUTBOX_EVENT_TYPES, PractitionerValidationError } from "@dentalcare/domain";
import { RbacAuthorizationAdapter } from "../foundation/authz/rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "../foundation/authz/in-memory-directory.js";
import { InMemoryPatientRepository } from "../patient/in-memory-repository.js";
import { AppointmentApplicationService } from "../appointment/service.js";
import {
  InMemoryAppointmentRepository,
  InMemoryBranchLookup,
} from "../appointment/in-memory-repository.js";
import { PractitionerApplicationService } from "./service.js";
import { InMemoryPractitionerRepository } from "./in-memory-repository.js";
import {
  handlePractitionerActivate,
  handlePractitionerAssignBranch,
  handlePractitionerAvailability,
  handlePractitionerCreate,
  handlePractitionerCreateSchedule,
  handlePractitionerCreateUnavailability,
  handlePractitionerDeactivate,
  handlePractitionerGet,
  handlePractitionerList,
  handlePractitionerUnassignBranch,
  handlePractitionerUpdate,
} from "./http.js";
import { parseCreateInput, parseScheduleInput, parseUnavailabilityInput } from "./validation.js";

const ORG_A = "org_a";
const ORG_B = "org_b";
const STAFF_A = "user_staff_a";
const STAFF_B = "user_staff_b";
const PRACTITIONER_A = "user_practitioner_a";
const ADMIN_A = "user_admin_a";
const ADMIN_B = "user_admin_b";
const LINK_A = "user_link_a";
const LINK_B = "user_link_b";
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

const SLOT_A = {
  startAtUtc: "2026-09-01T09:00:00.000Z",
  endAtUtc: "2026-09-01T10:00:00.000Z",
  timezone: "Europe/London",
};

const LEAK_MARKERS = [
  "Ada",
  "Lovelace",
  "ada@example.test",
  "+447700900123",
  "Dr Secret",
  "2026-09-01T09:00:00.000Z",
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
  directory
    .addUser(STAFF_A)
    .addUser(STAFF_B)
    .addUser(PRACTITIONER_A)
    .addUser(ADMIN_A)
    .addUser(ADMIN_B);
  directory.addUser(LINK_A).addUser(LINK_B);
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
    userId: ADMIN_B,
    organizationId: ORG_B,
    roleKeys: ["PRACTICE_ADMIN"],
  });
  directory.addMembership({
    userId: LINK_A,
    organizationId: ORG_A,
    roleKeys: ["PRACTITIONER"],
  });
  directory.addMembership({
    userId: LINK_B,
    organizationId: ORG_B,
    roleKeys: ["PRACTITIONER"],
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
    roleKeys: ["PRACTICE_ADMIN"],
  });
  directory.addMembership({
    userId: PATIENT_ROLE,
    organizationId: ORG_A,
    roleKeys: ["PATIENT"],
  });
  directory.setPlatformRoles(PLATFORM_ADMIN, ["SYSTEM_ADMIN"]);
  const authorization = new RbacAuthorizationAdapter(directory);
  const practitioners = new InMemoryPractitionerRepository();
  const patients = new InMemoryPatientRepository();
  const branches = new InMemoryBranchLookup().add(ORG_A, "branch_a").add(ORG_B, "branch_b");
  const appointments = new InMemoryAppointmentRepository();
  const service = new PractitionerApplicationService(
    authorization,
    directory,
    practitioners,
    branches,
    appointments,
  );
  const appointmentService = new AppointmentApplicationService(
    authorization,
    appointments,
    patients,
    practitioners,
    branches,
  );
  return {
    directory,
    practitioners,
    patients,
    branches,
    appointments,
    service,
    appointmentService,
  };
}

describe("practitioner validation", () => {
  it("rejects unknown fields, unlink attempts, and non-IANA timezones", () => {
    expect(() => parseCreateInput({})).toThrow(PractitionerValidationError);
    expect(() => parseCreateInput({ userId: "u1", status: "inactive" })).toThrow(
      PractitionerValidationError,
    );
    expect(() => parseCreateInput({ userId: "u1", linkedUserId: "u2" })).toThrow(
      PractitionerValidationError,
    );
    expect(() =>
      parseScheduleInput({
        branchId: "branch_a",
        timezone: "IST",
        intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      }),
    ).toThrow(PractitionerValidationError);
    expect(() =>
      parseScheduleInput({
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [{ weekday: 1, startMinute: 1020, endMinute: 540 }],
      }),
    ).toThrow(PractitionerValidationError);
    expect(() =>
      parseUnavailabilityInput({
        kind: "holiday",
        startAtUtc: "2026-09-01T09:00:00.000Z",
        endAtUtc: "2026-09-01T10:00:00.000Z",
        timezone: "Europe/London",
      }),
    ).toThrow(PractitionerValidationError);
  });
});

describe("practitioner lifecycle and assignment", () => {
  it("creates an org-scoped profile linked to a same-organization user", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A, displayName: "Dr Link" },
    });
    expect(created.status).toBe(201);
    expect(created.body.practitioner).toMatchObject({
      organizationId: ORG_A,
      userId: LINK_A,
      displayName: "Dr Link",
      status: "active",
    });
    expect(h.practitioners.audit).toEqual([
      { actorUserId: ADMIN_A, organizationId: ORG_A, action: "practitioner.create" },
    ]);
    expect(h.practitioners.outbox).toHaveLength(0);
  });

  it("rejects a second profile for the same globally unique userId", async () => {
    const h = harness();
    await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A },
    });
    const duplicate = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("conflict");
  });

  it("rejects cross-organization user links without leaking identifiers", async () => {
    const h = harness();
    const result = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_B },
    });
    expect(result.status).toBe(400);
    expectNoLeak(result.body);
  });

  it("updates display name and refuses hard-delete or unlink fields", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A, displayName: "Dr Link" },
    });
    const id = (created.body.practitioner as { id: string }).id;
    const updated = await handlePractitionerUpdate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: { displayName: "Dr Updated" },
    });
    expect(updated.status).toBe(200);
    expect((updated.body.practitioner as { displayName: string }).displayName).toBe("Dr Updated");
    expect((updated.body.practitioner as { userId: string }).userId).toBe(LINK_A);
  });

  it("assigns only same-organization branches and rejects cross-org branches", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A },
    });
    const id = (created.body.practitioner as { id: string }).id;
    const assigned = await handlePractitionerAssignBranch(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: { branchId: "branch_a" },
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.assignments).toEqual([expect.objectContaining({ branchId: "branch_a" })]);
    const cross = await handlePractitionerAssignBranch(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: { branchId: "branch_b" },
    });
    expect(cross.status).toBe(400);
    const duplicate = await handlePractitionerAssignBranch(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: { branchId: "branch_a" },
    });
    expect(duplicate.status).toBe(409);
  });

  it("blocks new appointments for inactive or unassigned practitioners and preserves existing ones", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A, displayName: "Dr Secret" },
    });
    const practitionerId = (created.body.practitioner as { id: string }).id;
    const patient = await h.patients.create(ORG_A, ADA);
    const unassigned = await h.appointmentService.create(identity(STAFF_A), ORG_A, {
      patientId: patient.id,
      practitionerId,
      branchId: "branch_a",
      ...SLOT_A,
    });
    expect(unassigned.ok).toBe(false);
    if (!unassigned.ok) {
      expect(unassigned.status).toBe(400);
    }

    await handlePractitionerAssignBranch(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId,
      body: { branchId: "branch_a" },
    });
    const booked = await h.appointmentService.create(identity(STAFF_A), ORG_A, {
      patientId: patient.id,
      practitionerId,
      branchId: "branch_a",
      ...SLOT_A,
    });
    expect(booked.ok).toBe(true);
    if (!booked.ok) {
      throw new Error("booking_failed");
    }

    const deactivated = await handlePractitionerDeactivate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId,
      body: {},
    });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.conflicts).toEqual([
      expect.objectContaining({
        appointmentId: booked.data.id,
        reason: "practitioner_inactive",
      }),
    ]);
    const existing = await h.appointmentService.get(identity(STAFF_A), ORG_A, booked.data.id);
    expect(existing.ok).toBe(true);
    if (existing.ok) {
      expect(existing.data.status).toBe("REQUESTED");
    }
    const later = await h.appointmentService.create(identity(STAFF_A), ORG_A, {
      patientId: patient.id,
      practitionerId,
      branchId: "branch_a",
      startAtUtc: "2026-09-02T09:00:00.000Z",
      endAtUtc: "2026-09-02T10:00:00.000Z",
      timezone: "Europe/London",
    });
    expect(later.ok).toBe(false);

    await handlePractitionerActivate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId,
      body: {},
    });
    const unassignedExisting = await handlePractitionerUnassignBranch(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId,
      branchId: "branch_a",
      body: {},
    });
    expect(unassignedExisting.status).toBe(200);
    expect(unassignedExisting.body.conflicts).toEqual([
      expect.objectContaining({
        appointmentId: booked.data.id,
        reason: "practitioner_unassigned",
      }),
    ]);
    const stillThere = await h.appointmentService.get(identity(STAFF_A), ORG_A, booked.data.id);
    expect(stillThere.ok).toBe(true);
    expect(h.appointments.outbox).toHaveLength(1);
    expect(h.appointments.outbox[0]?.eventType).toBe("appointment.created");
  });

  it("rolls back profile creation when audit/history fails and writes no outbox", async () => {
    const h = harness();
    h.practitioners.failAudit = true;
    const result = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A, displayName: "Dr Secret" },
    });
    expect(result.status).toBe(503);
    expect(h.practitioners.records.size).toBe(0);
    expect(h.practitioners.history).toHaveLength(0);
    expect(h.practitioners.outbox).toHaveLength(0);
    expect(h.appointments.outbox).toHaveLength(0);
  });
});

describe("practitioner authorization", () => {
  it("denies unauthenticated, disabled, missing, and revoked membership", async () => {
    const h = harness();
    const unauthenticated = await handlePractitionerList(h.service, {
      identity: null,
      organizationId: ORG_A,
    });
    expect(unauthenticated.status).toBe(401);
    for (const userId of [DISABLED, NO_MEMBER, REVOKED]) {
      const result = await handlePractitionerList(h.service, {
        identity: identity(userId),
        organizationId: ORG_A,
      });
      expect(result.status).toBe(403);
      expectNoLeak(result.body);
    }
  });

  it("denies PATIENT and SYSTEM_ADMIN on all practitioner APIs", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A, displayName: "Dr Secret" },
    });
    const id = (created.body.practitioner as { id: string }).id;
    for (const userId of [PATIENT_ROLE, PLATFORM_ADMIN]) {
      const list = await handlePractitionerList(h.service, {
        identity: identity(userId),
        organizationId: ORG_A,
      });
      expect(list.status).toBe(403);
      expectNoLeak(list.body);
      const get = await handlePractitionerGet(h.service, {
        identity: identity(userId),
        organizationId: ORG_A,
        practitionerId: id,
      });
      expect(get.status).toBe(403);
      const availability = await handlePractitionerAvailability(h.service, {
        identity: identity(userId),
        organizationId: ORG_A,
        practitionerId: id,
        query: new URLSearchParams({
          branchId: "branch_a",
          startAtUtc: "2026-09-01T08:00:00.000Z",
          endAtUtc: "2026-09-01T18:00:00.000Z",
          durationMinutes: "30",
        }),
      });
      expect(availability.status).toBe(403);
      expectNoLeak(availability.body);
    }
  });

  it("allows STAFF schedule/leave but denies practitioner self-management and staff profile mutations", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A },
    });
    const id = (created.body.practitioner as { id: string }).id;
    await handlePractitionerAssignBranch(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: { branchId: "branch_a" },
    });

    const staffCreate = await handlePractitionerCreate(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      body: { userId: PRACTITIONER_A },
    });
    expect(staffCreate.status).toBe(403);

    const selfSchedule = await handlePractitionerCreateSchedule(h.service, {
      identity: identity(PRACTITIONER_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: {
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      },
    });
    expect(selfSchedule.status).toBe(403);

    const selfLeave = await handlePractitionerCreateUnavailability(h.service, {
      identity: identity(PRACTITIONER_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: {
        kind: "leave",
        startAtUtc: "2026-09-01T12:00:00.000Z",
        endAtUtc: "2026-09-01T13:00:00.000Z",
        timezone: "Europe/London",
      },
    });
    expect(selfLeave.status).toBe(403);

    const staffSchedule = await handlePractitionerCreateSchedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: {
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      },
    });
    expect(staffSchedule.status).toBe(201);

    const staffLeave = await handlePractitionerCreateUnavailability(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId: id,
      body: {
        kind: "break",
        startAtUtc: "2026-09-01T12:00:00.000Z",
        endAtUtc: "2026-09-01T13:00:00.000Z",
        timezone: "Europe/London",
      },
    });
    expect(staffLeave.status).toBe(201);
  });

  it("returns safe 404 for cross-tenant reads and mutations", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A, displayName: "Dr Secret" },
    });
    const id = (created.body.practitioner as { id: string }).id;
    const get = await handlePractitionerGet(h.service, {
      identity: identity(STAFF_B),
      organizationId: ORG_B,
      practitionerId: id,
    });
    expect(get.status).toBe(404);
    expectNoLeak(get.body);
    const deactivate = await handlePractitionerDeactivate(h.service, {
      identity: identity(ADMIN_B),
      organizationId: ORG_B,
      practitionerId: id,
      body: {},
    });
    expect(deactivate.status).toBe(404);
    expectNoLeak(deactivate.body);
    const availability = await handlePractitionerAvailability(h.service, {
      identity: identity(STAFF_B),
      organizationId: ORG_B,
      practitionerId: id,
      query: new URLSearchParams({
        branchId: "branch_a",
        startAtUtc: "2026-09-01T08:00:00.000Z",
        endAtUtc: "2026-09-01T18:00:00.000Z",
        durationMinutes: "30",
      }),
    });
    expect(availability.status).toBe(404);
    expectNoLeak(availability.body);
  });
});

describe("practitioner schema and notification boundary", () => {
  it("adds additive M7 constraints without rewriting M4 exclusions or outbox types", () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        "packages/db/prisma/migrations/20260815180000_m7_practitioner_availability/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("practitioner_weekly_intervals_excl");
    expect(sql).toContain("practitioner_unavailability_time_excl");
    expect(sql).toContain("practitioner.read.tenant");
    expect(sql).not.toContain("appointments_practitioner_time_excl");
    expect(sql).not.toContain("appointment.created");
    expect(OUTBOX_EVENT_TYPES).toEqual([
      "appointment.created",
      "appointment.rescheduled",
      "appointment.cancelled",
    ]);
    const m4 = readFileSync(
      path.resolve(
        process.cwd(),
        "packages/db/prisma/migrations/20260815120000_m4_appointment_domain/migration.sql",
      ),
      "utf8",
    );
    expect(m4).toContain("appointments_practitioner_time_excl");
  });
});
