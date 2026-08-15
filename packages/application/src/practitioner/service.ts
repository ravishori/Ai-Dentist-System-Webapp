import type {
  AppointmentRepository,
  AuthenticatedIdentity,
  AuthorizationPort,
  BranchLookup,
  OperationalConflict,
  Practitioner,
  PractitionerAvailabilityQuery,
  PractitionerAvailabilityResult,
  PractitionerBranchAssignment,
  PractitionerCreateInput,
  PractitionerCreateScheduleInput,
  PractitionerManagementRepository,
  PractitionerReplaceScheduleInput,
  PractitionerSchedule,
  PractitionerUnavailability,
  PractitionerUnavailabilityCreateInput,
  PractitionerUpdateInput,
} from "@dentalcare/domain";
import {
  PractitionerConflictError,
  PractitionerNotFoundError,
  PractitionerValidationError,
  evaluateAvailability,
  operationalConflicts,
} from "@dentalcare/domain";
import type { AuthorizationDirectory } from "../foundation/authz/types.js";

export type PractitionerServiceFailure = {
  readonly ok: false;
  readonly status: 400 | 401 | 403 | 404 | 409 | 503;
  readonly error:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "invalid_input"
    | "conflict"
    | "unavailable";
  readonly message: string;
};

export type PractitionerServiceSuccess<T> = {
  readonly ok: true;
  readonly status: 200 | 201;
  readonly data: T;
};

export type PractitionerServiceResult<T> = PractitionerServiceSuccess<T> | PractitionerServiceFailure;

export type PractitionerProfileView = {
  readonly practitioner: Practitioner;
  readonly assignments: readonly PractitionerBranchAssignment[];
};

export type PractitionerMutationView = PractitionerProfileView & {
  readonly conflicts: readonly OperationalConflict[];
};

export class PractitionerApplicationService {
  constructor(
    private readonly authorization: AuthorizationPort,
    private readonly directory: AuthorizationDirectory,
    private readonly practitioners: PractitionerManagementRepository,
    private readonly branches: BranchLookup,
    private readonly appointments: AppointmentRepository,
  ) {}

  async create(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    input: PractitionerCreateInput,
  ): Promise<PractitionerServiceResult<PractitionerProfileView>> {
    const gate = await this.gate(identity, organizationId, "practitioner.manage");
    if (!gate.ok) {
      return gate;
    }
    const linked = await this.assertLinkableUser(gate.organizationId, input.userId);
    if (!linked.ok) {
      return linked;
    }
    try {
      const practitioner = await this.practitioners.createWithAudit(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        input,
      );
      return {
        ok: true,
        status: 201,
        data: { practitioner, assignments: [] },
      };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async list(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
  ): Promise<PractitionerServiceResult<readonly PractitionerProfileView[]>> {
    const gate = await this.gate(identity, organizationId, "practitioner.read.tenant");
    if (!gate.ok) {
      return gate;
    }
    try {
      const practitioners = await this.practitioners.listByOrganization(gate.organizationId);
      const views = await Promise.all(
        practitioners.map(async (practitioner) => ({
          practitioner,
          assignments: await this.practitioners.listAssignments(gate.organizationId, practitioner.id),
        })),
      );
      return { ok: true, status: 200, data: views };
    } catch {
      return unavailable();
    }
  }

  async get(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
  ): Promise<PractitionerServiceResult<PractitionerProfileView>> {
    const gate = await this.gate(identity, organizationId, "practitioner.read.tenant");
    if (!gate.ok) {
      return gate;
    }
    return this.loadProfile(gate.organizationId, practitionerId);
  }

  async update(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    input: PractitionerUpdateInput,
  ): Promise<PractitionerServiceResult<PractitionerProfileView>> {
    const gate = await this.gate(identity, organizationId, "practitioner.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const practitioner = await this.practitioners.updateByOrganizationAndId(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        input,
      );
      return this.profileOf(practitioner);
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async deactivate(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
  ): Promise<PractitionerServiceResult<PractitionerMutationView>> {
    return this.setActivation(identity, organizationId, practitionerId, "deactivate");
  }

  async activate(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
  ): Promise<PractitionerServiceResult<PractitionerProfileView>> {
    const gate = await this.gate(identity, organizationId, "practitioner.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const practitioner = await this.practitioners.activateByOrganizationAndId(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
      );
      return this.profileOf(practitioner);
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async assignBranch(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    branchId: string,
  ): Promise<PractitionerServiceResult<PractitionerProfileView>> {
    const gate = await this.gate(identity, organizationId, "practitioner.assignment.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const existing = await this.practitioners.findByOrganizationAndId(gate.organizationId, id);
      if (!existing) {
        return notFound();
      }
      const branch = await this.branches.findByOrganizationAndId(gate.organizationId, branchId);
      if (!branch) {
        return invalid();
      }
      await this.practitioners.assignBranch(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        branchId,
      );
      return this.profileOf(existing);
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async unassignBranch(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    branchId: string | undefined,
  ): Promise<PractitionerServiceResult<PractitionerMutationView>> {
    const gate = await this.gate(identity, organizationId, "practitioner.assignment.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    const assignedBranchId = normalizeId(branchId);
    if (!id || !assignedBranchId) {
      return invalid();
    }
    try {
      const existing = await this.practitioners.findByOrganizationAndId(gate.organizationId, id);
      if (!existing) {
        return notFound();
      }
      await this.practitioners.unassignBranch(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        assignedBranchId,
      );
      const conflicts = await this.conflictsFor(existing);
      const assignments = await this.practitioners.listAssignments(gate.organizationId, existing.id);
      return { ok: true, status: 200, data: { practitioner: existing, assignments, conflicts } };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async createSchedule(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    input: PractitionerCreateScheduleInput,
  ): Promise<PractitionerServiceResult<PractitionerSchedule>> {
    const gate = await this.gate(identity, organizationId, "practitioner.schedule.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const existing = await this.practitioners.findByOrganizationAndId(gate.organizationId, id);
      if (!existing) {
        return notFound();
      }
      const assigned = await this.practitioners.isAssignedToBranch(
        gate.organizationId,
        id,
        input.branchId,
      );
      const branch = await this.branches.findByOrganizationAndId(gate.organizationId, input.branchId);
      if (!branch || !assigned) {
        return invalid();
      }
      const schedule = await this.practitioners.createSchedule(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        input,
      );
      return { ok: true, status: 201, data: schedule };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async replaceSchedule(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    scheduleId: string | undefined,
    input: PractitionerReplaceScheduleInput,
  ): Promise<PractitionerServiceResult<PractitionerSchedule>> {
    const gate = await this.gate(identity, organizationId, "practitioner.schedule.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    const sid = normalizeId(scheduleId);
    if (!id || !sid) {
      return invalid();
    }
    try {
      const existing = await this.practitioners.findByOrganizationAndId(gate.organizationId, id);
      if (!existing) {
        return notFound();
      }
      const schedule = await this.practitioners.replaceSchedule(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        sid,
        input,
      );
      return { ok: true, status: 200, data: schedule };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async createUnavailability(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    input: PractitionerUnavailabilityCreateInput,
  ): Promise<
    PractitionerServiceResult<{
      unavailability: PractitionerUnavailability;
      conflicts: readonly OperationalConflict[];
    }>
  > {
    const gate = await this.gate(identity, organizationId, "practitioner.leave.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const existing = await this.practitioners.findByOrganizationAndId(gate.organizationId, id);
      if (!existing) {
        return notFound();
      }
      const unavailability = await this.practitioners.createUnavailability(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        input,
      );
      const conflicts = await this.conflictsFor(existing);
      return { ok: true, status: 201, data: { unavailability, conflicts } };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async cancelUnavailability(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    intervalId: string | undefined,
  ): Promise<PractitionerServiceResult<PractitionerUnavailability>> {
    const gate = await this.gate(identity, organizationId, "practitioner.leave.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    const uid = normalizeId(intervalId);
    if (!id || !uid) {
      return invalid();
    }
    try {
      const existing = await this.practitioners.findByOrganizationAndId(gate.organizationId, id);
      if (!existing) {
        return notFound();
      }
      const unavailability = await this.practitioners.cancelUnavailability(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        uid,
      );
      return { ok: true, status: 200, data: unavailability };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async availability(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    query: PractitionerAvailabilityQuery,
  ): Promise<PractitionerServiceResult<PractitionerAvailabilityResult>> {
    const gate = await this.gate(identity, organizationId, "practitioner.availability.read");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const practitioner = await this.practitioners.findByOrganizationAndId(gate.organizationId, id);
      if (!practitioner) {
        return notFound();
      }
      const branch = await this.branches.findByOrganizationAndId(gate.organizationId, query.branchId);
      if (!branch) {
        return invalid();
      }
      const [assignments, schedule, unavailability, appointments] = await Promise.all([
        this.practitioners.listAssignments(gate.organizationId, practitioner.id),
        this.practitioners.findScheduleByPractitionerAndBranch(
          gate.organizationId,
          practitioner.id,
          query.branchId,
        ),
        this.practitioners.listUnavailability(gate.organizationId, practitioner.id),
        this.appointments.listByOrganization(gate.organizationId, {
          practitionerId: practitioner.id,
        }),
      ]);
      const result = evaluateAvailability({
        practitioner,
        assignedBranchIds: assignments.map((assignment) => assignment.branchId),
        query,
        schedule,
        unavailability,
        appointments,
      });
      return { ok: true, status: 200, data: result };
    } catch {
      return unavailable();
    }
  }

  private async setActivation(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    practitionerId: string | undefined,
    _mode: "deactivate",
  ): Promise<PractitionerServiceResult<PractitionerMutationView>> {
    const gate = await this.gate(identity, organizationId, "practitioner.manage");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const practitioner = await this.practitioners.deactivateByOrganizationAndId(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
      );
      const assignments = await this.practitioners.listAssignments(
        gate.organizationId,
        practitioner.id,
      );
      const conflicts = await this.conflictsFor(practitioner);
      return { ok: true, status: 200, data: { practitioner, assignments, conflicts } };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  private async loadProfile(
    organizationId: string,
    practitionerId: string | undefined,
  ): Promise<PractitionerServiceResult<PractitionerProfileView>> {
    const id = normalizeId(practitionerId);
    if (!id) {
      return invalid();
    }
    try {
      const practitioner = await this.practitioners.findByOrganizationAndId(organizationId, id);
      if (!practitioner) {
        return notFound();
      }
      return this.profileOf(practitioner);
    } catch {
      return unavailable();
    }
  }

  private async profileOf(
    practitioner: Practitioner,
  ): Promise<PractitionerServiceSuccess<PractitionerProfileView>> {
    const assignments = await this.practitioners.listAssignments(
      practitioner.organizationId,
      practitioner.id,
    );
    return { ok: true, status: 200, data: { practitioner, assignments } };
  }

  private async conflictsFor(practitioner: Practitioner): Promise<readonly OperationalConflict[]> {
    const [assignments, unavailability, appointments] = await Promise.all([
      this.practitioners.listAssignments(practitioner.organizationId, practitioner.id),
      this.practitioners.listUnavailability(practitioner.organizationId, practitioner.id),
      this.appointments.listByOrganization(practitioner.organizationId, {
        practitionerId: practitioner.id,
      }),
    ]);
    return operationalConflicts({
      practitioner,
      assignedBranchIds: assignments.map((assignment) => assignment.branchId),
      unavailability,
      appointments,
    });
  }

  private async assertLinkableUser(
    organizationId: string,
    userId: string,
  ): Promise<{ ok: true } | PractitionerServiceFailure> {
    try {
      const existing = await this.practitioners.findByUserId(userId);
      if (existing) {
        return conflict();
      }
      const [user, membership] = await Promise.all([
        this.directory.getUser(userId),
        this.directory.getMembership(userId, organizationId),
      ]);
      if (!user || user.status !== "active" || !membership || membership.status !== "active") {
        return invalid();
      }
      return { ok: true };
    } catch {
      return unavailable();
    }
  }

  private async gate(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    permission: string,
  ): Promise<{ ok: true; organizationId: string } | PractitionerServiceFailure> {
    if (!identity) {
      return {
        ok: false,
        status: 401,
        error: "unauthenticated",
        message: "Authentication required.",
      };
    }
    try {
      const decision = await this.authorization.authorize({
        principalUserId: identity.userId,
        sessionUserId: identity.userId,
        requestedOrganizationId: organizationId,
        permission,
      });
      if (!decision.allowed || !decision.context?.organizationId) {
        return {
          ok: false,
          status: decision.reason === "unauthenticated" ? 401 : 403,
          error: decision.reason === "unauthenticated" ? "unauthenticated" : "forbidden",
          message:
            decision.reason === "unauthenticated"
              ? "Authentication required."
              : "Authorization denied.",
        };
      }
      return { ok: true, organizationId: decision.context.organizationId };
    } catch {
      return unavailable();
    }
  }
}

function mapWriteError(error: unknown): PractitionerServiceFailure {
  if (error instanceof PractitionerConflictError) {
    return conflict();
  }
  if (error instanceof PractitionerValidationError) {
    return invalid();
  }
  if (error instanceof PractitionerNotFoundError) {
    return notFound();
  }
  return unavailable();
}

function normalizeId(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function notFound(): PractitionerServiceFailure {
  return { ok: false, status: 404, error: "not_found", message: "Practitioner was not found." };
}

function invalid(): PractitionerServiceFailure {
  return {
    ok: false,
    status: 400,
    error: "invalid_input",
    message: "Practitioner input was invalid.",
  };
}

function conflict(): PractitionerServiceFailure {
  return {
    ok: false,
    status: 409,
    error: "conflict",
    message: "Practitioner conflict.",
  };
}

function unavailable(): PractitionerServiceFailure {
  return {
    ok: false,
    status: 503,
    error: "unavailable",
    message: "Practitioner service is temporarily unavailable.",
  };
}

export function toPublicPractitioner(practitioner: Practitioner): Record<string, unknown> {
  return {
    id: practitioner.id,
    organizationId: practitioner.organizationId,
    userId: practitioner.userId,
    displayName: practitioner.displayName ?? null,
    status: practitioner.status,
    createdAt: practitioner.createdAt,
    updatedAt: practitioner.updatedAt,
  };
}

export function toPublicAssignment(assignment: PractitionerBranchAssignment): Record<string, unknown> {
  return {
    id: assignment.id,
    branchId: assignment.branchId,
    createdAt: assignment.createdAt,
  };
}

export function toPublicSchedule(schedule: PractitionerSchedule): Record<string, unknown> {
  return {
    id: schedule.id,
    practitionerId: schedule.practitionerId,
    branchId: schedule.branchId,
    timezone: schedule.timezone,
    intervals: schedule.intervals.map((interval) => ({
      id: interval.id,
      weekday: interval.weekday,
      startMinute: interval.startMinute,
      endMinute: interval.endMinute,
    })),
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

export function toPublicUnavailability(
  record: PractitionerUnavailability,
): Record<string, unknown> {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    startAtUtc: record.startAtUtc,
    endAtUtc: record.endAtUtc,
    timezone: record.timezone,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toPublicAvailability(result: PractitionerAvailabilityResult): Record<string, unknown> {
  return {
    practitionerId: result.practitionerId,
    branchId: result.branchId,
    timezone: result.timezone ?? null,
    durationMinutes: result.durationMinutes,
    windowStartAtUtc: result.windowStartAtUtc,
    windowEndAtUtc: result.windowEndAtUtc,
    available: result.available,
    unavailable: result.unavailable,
    conflicts: result.conflicts,
    advisory: true,
  };
}
