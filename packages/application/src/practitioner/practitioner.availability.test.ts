import { describe, expect, it } from "vitest";
import type { AuthenticatedIdentity } from "@dentalcare/domain";
import { evaluateAvailability, zonedLocalToUtc } from "@dentalcare/domain";
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
  handlePractitionerAssignBranch,
  handlePractitionerAvailability,
  handlePractitionerCreate,
  handlePractitionerCreateSchedule,
  handlePractitionerCreateUnavailability,
  handlePractitionerReplaceSchedule,
} from "./http.js";

const ORG_A = "org_a";
const ADMIN_A = "user_admin_a";
const STAFF_A = "user_staff_a";
const LINK_A = "user_link_a";

const ADA = {
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1815-12-10",
};

function identity(userId: string): AuthenticatedIdentity {
  return {
    userId,
    issuer: "https://example.test",
    subject: `sub-${userId}`,
    authenticatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function harness() {
  const directory = new InMemoryAuthorizationDirectory();
  directory.addUser(ADMIN_A).addUser(STAFF_A).addUser(LINK_A);
  directory.addOrganization(ORG_A);
  directory.addMembership({ userId: ADMIN_A, organizationId: ORG_A, roleKeys: ["PRACTICE_ADMIN"] });
  directory.addMembership({ userId: STAFF_A, organizationId: ORG_A, roleKeys: ["STAFF"] });
  directory.addMembership({ userId: LINK_A, organizationId: ORG_A, roleKeys: ["PRACTITIONER"] });
  const authorization = new RbacAuthorizationAdapter(directory);
  const practitioners = new InMemoryPractitionerRepository();
  const patients = new InMemoryPatientRepository();
  const branches = new InMemoryBranchLookup().add(ORG_A, "branch_a").add(ORG_A, "branch_c");
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
  return { practitioners, patients, appointments, service, appointmentService };
}

async function seedPractitioner(h: ReturnType<typeof harness>) {
  const created = await handlePractitionerCreate(h.service, {
    identity: identity(ADMIN_A),
    organizationId: ORG_A,
    body: { userId: LINK_A, displayName: "Dr Link" },
  });
  const practitionerId = (created.body.practitioner as { id: string }).id;
  await handlePractitionerAssignBranch(h.service, {
    identity: identity(ADMIN_A),
    organizationId: ORG_A,
    practitionerId,
    body: { branchId: "branch_a" },
  });
  return practitionerId;
}

describe("weekly hours and unavailability", () => {
  it("rejects overlapping weekly intervals and overlapping unavailability", async () => {
    const h = harness();
    const practitionerId = await seedPractitioner(h);
    const overlapHours = await handlePractitionerCreateSchedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [
          { weekday: 1, startMinute: 540, endMinute: 720 },
          { weekday: 1, startMinute: 660, endMinute: 1020 },
        ],
      },
    });
    expect(overlapHours.status).toBe(409);

    const created = await handlePractitionerCreateSchedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [
          { weekday: 1, startLocal: "09:00", endLocal: "17:00" },
          { weekday: 2, startLocal: "09:00", endLocal: "12:00" },
        ],
      },
    });
    expect(created.status).toBe(201);
    const scheduleId = (created.body.schedule as { id: string }).id;

    const leave = await handlePractitionerCreateUnavailability(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        kind: "leave",
        startAtUtc: "2026-09-07T08:00:00.000Z",
        endAtUtc: "2026-09-07T12:00:00.000Z",
        timezone: "Europe/London",
      },
    });
    expect(leave.status).toBe(201);
    const overlapLeave = await handlePractitionerCreateUnavailability(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        kind: "break",
        startAtUtc: "2026-09-07T11:00:00.000Z",
        endAtUtc: "2026-09-07T13:00:00.000Z",
        timezone: "Europe/London",
      },
    });
    expect(overlapLeave.status).toBe(409);

    const replaced = await handlePractitionerReplaceSchedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      scheduleId,
      body: {
        timezone: "Europe/London",
        intervals: [{ weekday: 1, startMinute: 480, endMinute: 960 }],
      },
    });
    expect(replaced.status).toBe(200);
    expect((replaced.body.schedule as { intervals: unknown[] }).intervals).toHaveLength(1);
  });

  it("requires a branch assignment before a schedule can be created", async () => {
    const h = harness();
    const created = await handlePractitionerCreate(h.service, {
      identity: identity(ADMIN_A),
      organizationId: ORG_A,
      body: { userId: LINK_A },
    });
    const practitionerId = (created.body.practitioner as { id: string }).id;
    const result = await handlePractitionerCreateSchedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      },
    });
    expect(result.status).toBe(400);
  });
});

describe("advisory availability", () => {
  it("converts Europe/London weekly hours across the 2026 DST spring-forward", () => {
    const before = zonedLocalToUtc("Europe/London", 2026, 3, 23, 9, 0);
    const after = zonedLocalToUtc("Europe/London", 2026, 3, 30, 9, 0);
    expect(before?.toISOString()).toBe("2026-03-23T09:00:00.000Z");
    expect(after?.toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });

  it("returns working hours minus leave and active appointments, and remains advisory", async () => {
    const h = harness();
    const practitionerId = await seedPractitioner(h);
    await handlePractitionerCreateSchedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [{ weekday: 1, startLocal: "09:00", endLocal: "17:00" }],
      },
    });
    const patient = await h.patients.create(ORG_A, ADA);
    const booked = await h.appointmentService.create(identity(STAFF_A), ORG_A, {
      patientId: patient.id,
      practitionerId,
      branchId: "branch_a",
      startAtUtc: "2026-03-23T10:00:00.000Z",
      endAtUtc: "2026-03-23T11:00:00.000Z",
      timezone: "Europe/London",
    });
    expect(booked.ok).toBe(true);

    await handlePractitionerCreateUnavailability(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        kind: "break",
        startAtUtc: "2026-03-23T12:00:00.000Z",
        endAtUtc: "2026-03-23T13:00:00.000Z",
        timezone: "Europe/London",
      },
    });

    const availability = await handlePractitionerAvailability(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      query: new URLSearchParams({
        branchId: "branch_a",
        startAtUtc: "2026-03-23T08:00:00.000Z",
        endAtUtc: "2026-03-23T18:00:00.000Z",
        durationMinutes: "30",
      }),
    });
    expect(availability.status).toBe(200);
    const body = availability.body.availability as {
      advisory: boolean;
      available: Array<{ startAtUtc: string; endAtUtc: string }>;
      unavailable: Array<{ reason: string; startAtUtc: string; endAtUtc: string }>;
      conflicts: Array<{ reason: string }>;
    };
    expect(body.advisory).toBe(true);
    expect(body.available.some((range) => range.startAtUtc === "2026-03-23T09:00:00.000Z")).toBe(
      true,
    );
    expect(body.unavailable.some((range) => range.reason === "appointment")).toBe(true);
    expect(body.unavailable.some((range) => range.reason === "unavailability")).toBe(true);
    expect(body.unavailable.some((range) => range.reason === "outside_hours")).toBe(true);

    const dst = await handlePractitionerAvailability(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      query: new URLSearchParams({
        branchId: "branch_a",
        startAtUtc: "2026-03-30T07:00:00.000Z",
        endAtUtc: "2026-03-30T18:00:00.000Z",
        durationMinutes: "30",
      }),
    });
    const dstBody = dst.body.availability as {
      available: Array<{ startAtUtc: string; endAtUtc: string }>;
    };
    expect(dstBody.available.some((range) => range.startAtUtc === "2026-03-30T08:00:00.000Z")).toBe(
      true,
    );

    const conflict = await h.appointmentService.create(identity(STAFF_A), ORG_A, {
      patientId: patient.id,
      practitionerId,
      branchId: "branch_a",
      startAtUtc: "2026-03-23T10:00:00.000Z",
      endAtUtc: "2026-03-23T11:00:00.000Z",
      timezone: "Europe/London",
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.status).toBe(409);
    }
  });

  it("flags leave covering an existing appointment without mutating it or writing outbox events", async () => {
    const h = harness();
    const practitionerId = await seedPractitioner(h);
    await handlePractitionerCreateSchedule(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        branchId: "branch_a",
        timezone: "Europe/London",
        intervals: [{ weekday: 2, startMinute: 540, endMinute: 1020 }],
      },
    });
    const patient = await h.patients.create(ORG_A, ADA);
    const booked = await h.appointmentService.create(identity(STAFF_A), ORG_A, {
      patientId: patient.id,
      practitionerId,
      branchId: "branch_a",
      startAtUtc: "2026-09-01T09:00:00.000Z",
      endAtUtc: "2026-09-01T10:00:00.000Z",
      timezone: "Europe/London",
    });
    expect(booked.ok).toBe(true);
    if (!booked.ok) {
      throw new Error("booking_failed");
    }
    const outboxBefore = h.appointments.outbox.length;
    const leave = await handlePractitionerCreateUnavailability(h.service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      practitionerId,
      body: {
        kind: "leave",
        startAtUtc: "2026-09-01T08:00:00.000Z",
        endAtUtc: "2026-09-01T12:00:00.000Z",
        timezone: "Europe/London",
      },
    });
    expect(leave.status).toBe(201);
    expect(leave.body.conflicts).toEqual([
      expect.objectContaining({
        appointmentId: booked.data.id,
        reason: "leave_covers_appointment",
      }),
    ]);
    const existing = await h.appointmentService.get(identity(STAFF_A), ORG_A, booked.data.id);
    expect(existing.ok).toBe(true);
    if (existing.ok) {
      expect(existing.data.status).toBe("REQUESTED");
    }
    expect(h.appointments.outbox).toHaveLength(outboxBefore);
    expect(h.practitioners.outbox).toHaveLength(0);
  });

  it("treats inactive and unassigned practitioners as fully unavailable", () => {
    const inactive = evaluateAvailability({
      practitioner: { id: "p1", status: "inactive" },
      assignedBranchIds: ["branch_a"],
      query: {
        branchId: "branch_a",
        startAtUtc: "2026-09-01T08:00:00.000Z",
        endAtUtc: "2026-09-01T18:00:00.000Z",
        durationMinutes: 30,
      },
      schedule: null,
      unavailability: [],
      appointments: [],
    });
    expect(inactive.available).toEqual([]);
    expect(inactive.unavailable[0]?.reason).toBe("practitioner_inactive");

    const unassigned = evaluateAvailability({
      practitioner: { id: "p1", status: "active" },
      assignedBranchIds: [],
      query: {
        branchId: "branch_a",
        startAtUtc: "2026-09-01T08:00:00.000Z",
        endAtUtc: "2026-09-01T18:00:00.000Z",
        durationMinutes: 30,
      },
      schedule: null,
      unavailability: [],
      appointments: [],
    });
    expect(unassigned.unavailable[0]?.reason).toBe("practitioner_unassigned");
  });
});
