import {
  PractitionerConflictError,
  PractitionerNotFoundError,
  PractitionerValidationError,
  weeklyIntervalsOverlap,
  type Practitioner,
  type PractitionerBranchAssignment,
  type PractitionerCreateInput,
  type PractitionerCreateScheduleInput,
  type PractitionerManagementRepository,
  type PractitionerReplaceScheduleInput,
  type PractitionerSchedule,
  type PractitionerUnavailability,
  type PractitionerUnavailabilityCreateInput,
  type PractitionerUpdateInput,
  type PractitionerWriteContext,
  type PractitionerHistoryEvent,
  type WeeklyWorkingInterval,
} from "@dentalcare/domain";

function assignmentKey(practitionerId: string, branchId: string): string {
  return `${practitionerId}|${branchId}`;
}

export class InMemoryPractitionerRepository implements PractitionerManagementRepository {
  readonly records = new Map<string, Practitioner>();
  readonly assignments = new Map<string, PractitionerBranchAssignment>();
  readonly schedules = new Map<string, PractitionerSchedule>();
  readonly unavailability = new Map<string, PractitionerUnavailability>();
  readonly history: Array<{
    practitionerId: string;
    organizationId: string;
    eventType: PractitionerHistoryEvent;
    actorUserId: string;
  }> = [];
  readonly audit: Array<{ actorUserId: string; organizationId: string; action: string }> = [];
  readonly outbox: Array<Record<string, string>> = [];
  failLookups = false;
  failHistory = false;
  failAudit = false;
  private sequence = 0;
  private chain: Promise<unknown> = Promise.resolve();

  async create(organizationId: string, userId: string): Promise<Practitioner> {
    this.assertAvailable();
    if ([...this.records.values()].some((record) => record.userId === userId)) {
      throw new PractitionerConflictError();
    }
    const practitioner = this.buildPractitioner(organizationId, { userId });
    this.records.set(practitioner.id, practitioner);
    return practitioner;
  }

  async findByOrganizationAndId(
    organizationId: string,
    practitionerId: string,
  ): Promise<Practitioner | null> {
    this.assertAvailable();
    const practitioner = this.records.get(practitionerId);
    if (!practitioner || practitioner.organizationId !== organizationId) {
      return null;
    }
    return practitioner;
  }

  async isAssignedToBranch(
    organizationId: string,
    practitionerId: string,
    branchId: string,
  ): Promise<boolean> {
    this.assertAvailable();
    const assignment = this.assignments.get(assignmentKey(practitionerId, branchId));
    return Boolean(assignment && assignment.organizationId === organizationId);
  }

  async findByUserId(userId: string): Promise<Practitioner | null> {
    this.assertAvailable();
    return [...this.records.values()].find((record) => record.userId === userId) ?? null;
  }

  async listByOrganization(organizationId: string): Promise<readonly Practitioner[]> {
    this.assertAvailable();
    return [...this.records.values()].filter((record) => record.organizationId === organizationId);
  }

  /** Test-only assignment without audit (appointment seed helper). */
  assignToBranch(practitionerId: string, branchId: string): PractitionerBranchAssignment {
    const practitioner = this.records.get(practitionerId);
    if (!practitioner) {
      throw new PractitionerNotFoundError();
    }
    const key = assignmentKey(practitionerId, branchId);
    if (this.assignments.has(key)) {
      throw new PractitionerConflictError();
    }
    this.sequence += 1;
    const now = new Date().toISOString();
    const assignment: PractitionerBranchAssignment = {
      id: `assignment_${this.sequence}`,
      organizationId: practitioner.organizationId,
      practitionerId,
      branchId,
      createdAt: now,
      updatedAt: now,
    };
    this.assignments.set(key, assignment);
    return assignment;
  }

  async createWithAudit(
    context: PractitionerWriteContext,
    input: PractitionerCreateInput,
  ): Promise<Practitioner> {
    return this.exclusive(async () => {
      this.assertAvailable();
      if ([...this.records.values()].some((record) => record.userId === input.userId)) {
        throw new PractitionerConflictError();
      }
      const practitioner = this.buildPractitioner(context.organizationId, input);
      this.commitSideEffects({
        practitioner,
        actorUserId: context.actorUserId,
        eventType: "created",
        auditAction: "practitioner.create",
      });
      this.records.set(practitioner.id, practitioner);
      return practitioner;
    });
  }

  async setVerificationStatus(
    context: PractitionerWriteContext,
    practitionerId: string,
    verificationStatus: import("@dentalcare/domain").PractitionerVerificationStatus,
  ): Promise<Practitioner> {
    return this.exclusive(async () => {
      const existing = await this.require(context.organizationId, practitionerId);
      const updated: Practitioner = {
        ...existing,
        verificationStatus,
        updatedAt: new Date().toISOString(),
      };
      this.commitSideEffects({
        practitioner: updated,
        actorUserId: context.actorUserId,
        eventType: "verification_updated",
        auditAction: "practitioner.verify",
      });
      this.records.set(updated.id, updated);
      return updated;
    });
  }

  async updateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerUpdateInput,
  ): Promise<Practitioner> {
    return this.exclusive(async () => {
      const existing = await this.require(context.organizationId, practitionerId);
      const updated: Practitioner = {
        ...existing,
        displayName: input.displayName,
        updatedAt: new Date().toISOString(),
      };
      this.commitSideEffects({
        practitioner: updated,
        actorUserId: context.actorUserId,
        eventType: "updated",
        auditAction: "practitioner.update",
      });
      this.records.set(updated.id, updated);
      return updated;
    });
  }

  async deactivateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
  ): Promise<Practitioner> {
    return this.setStatus(
      context,
      practitionerId,
      "inactive",
      "deactivated",
      "practitioner.deactivate",
    );
  }

  async activateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
  ): Promise<Practitioner> {
    return this.setStatus(context, practitionerId, "active", "activated", "practitioner.activate");
  }

  async assignBranch(
    context: PractitionerWriteContext,
    practitionerId: string,
    branchId: string,
  ): Promise<PractitionerBranchAssignment> {
    return this.exclusive(async () => {
      const practitioner = await this.require(context.organizationId, practitionerId);
      const key = assignmentKey(practitionerId, branchId);
      if (this.assignments.has(key)) {
        throw new PractitionerConflictError();
      }
      this.sequence += 1;
      const now = new Date().toISOString();
      const assignment: PractitionerBranchAssignment = {
        id: `assignment_${this.sequence}`,
        organizationId: context.organizationId,
        practitionerId,
        branchId,
        createdAt: now,
        updatedAt: now,
      };
      this.commitSideEffects({
        practitioner,
        actorUserId: context.actorUserId,
        eventType: "assigned",
        auditAction: "practitioner.assignment.assign",
      });
      this.assignments.set(key, assignment);
      return assignment;
    });
  }

  async unassignBranch(
    context: PractitionerWriteContext,
    practitionerId: string,
    branchId: string,
  ): Promise<void> {
    return this.exclusive(async () => {
      const practitioner = await this.require(context.organizationId, practitionerId);
      const key = assignmentKey(practitionerId, branchId);
      const existing = this.assignments.get(key);
      if (!existing || existing.organizationId !== context.organizationId) {
        throw new PractitionerValidationError("branchId");
      }
      this.commitSideEffects({
        practitioner,
        actorUserId: context.actorUserId,
        eventType: "unassigned",
        auditAction: "practitioner.assignment.unassign",
      });
      this.assignments.delete(key);
    });
  }

  async listAssignments(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerBranchAssignment[]> {
    this.assertAvailable();
    return [...this.assignments.values()].filter(
      (assignment) =>
        assignment.organizationId === organizationId &&
        assignment.practitionerId === practitionerId,
    );
  }

  async createSchedule(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerCreateScheduleInput,
  ): Promise<PractitionerSchedule> {
    return this.exclusive(async () => {
      const practitioner = await this.require(context.organizationId, practitionerId);
      const existing = [...this.schedules.values()].find(
        (schedule) =>
          schedule.organizationId === context.organizationId &&
          schedule.practitionerId === practitionerId &&
          schedule.branchId === input.branchId,
      );
      if (existing) {
        throw new PractitionerConflictError();
      }
      this.assertWeeklyNonOverlap(input.intervals);
      const schedule = this.buildSchedule(context.organizationId, practitionerId, input);
      this.commitSideEffects({
        practitioner,
        actorUserId: context.actorUserId,
        eventType: "schedule_replaced",
        auditAction: "practitioner.schedule.replace",
      });
      this.schedules.set(schedule.id, schedule);
      return schedule;
    });
  }

  async replaceSchedule(
    context: PractitionerWriteContext,
    practitionerId: string,
    scheduleId: string,
    input: PractitionerReplaceScheduleInput,
  ): Promise<PractitionerSchedule> {
    return this.exclusive(async () => {
      const practitioner = await this.require(context.organizationId, practitionerId);
      const existing = this.schedules.get(scheduleId);
      if (
        !existing ||
        existing.organizationId !== context.organizationId ||
        existing.practitionerId !== practitionerId
      ) {
        throw new PractitionerNotFoundError();
      }
      this.assertWeeklyNonOverlap(input.intervals);
      const updated: PractitionerSchedule = {
        ...existing,
        timezone: input.timezone,
        intervals: this.buildIntervals(input.intervals),
        updatedAt: new Date().toISOString(),
      };
      this.commitSideEffects({
        practitioner,
        actorUserId: context.actorUserId,
        eventType: "schedule_replaced",
        auditAction: "practitioner.schedule.replace",
      });
      this.schedules.set(updated.id, updated);
      return updated;
    });
  }

  async findScheduleByOrganizationAndId(
    organizationId: string,
    practitionerId: string,
    scheduleId: string,
  ): Promise<PractitionerSchedule | null> {
    this.assertAvailable();
    const schedule = this.schedules.get(scheduleId);
    if (
      !schedule ||
      schedule.organizationId !== organizationId ||
      schedule.practitionerId !== practitionerId
    ) {
      return null;
    }
    return schedule;
  }

  async findScheduleByPractitionerAndBranch(
    organizationId: string,
    practitionerId: string,
    branchId: string,
  ): Promise<PractitionerSchedule | null> {
    this.assertAvailable();
    return (
      [...this.schedules.values()].find(
        (schedule) =>
          schedule.organizationId === organizationId &&
          schedule.practitionerId === practitionerId &&
          schedule.branchId === branchId,
      ) ?? null
    );
  }

  async listSchedules(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerSchedule[]> {
    this.assertAvailable();
    return [...this.schedules.values()]
      .filter(
        (schedule) =>
          schedule.organizationId === organizationId && schedule.practitionerId === practitionerId,
      )
      .sort((left, right) => left.branchId.localeCompare(right.branchId));
  }

  async createUnavailability(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerUnavailabilityCreateInput,
  ): Promise<PractitionerUnavailability> {
    return this.exclusive(async () => {
      const practitioner = await this.require(context.organizationId, practitionerId);
      const next = {
        startMs: new Date(input.startAtUtc).getTime(),
        endMs: new Date(input.endAtUtc).getTime(),
      };
      for (const existing of this.unavailability.values()) {
        if (
          existing.practitionerId !== practitionerId ||
          existing.organizationId !== context.organizationId ||
          existing.status !== "active"
        ) {
          continue;
        }
        const current = {
          startMs: new Date(existing.startAtUtc).getTime(),
          endMs: new Date(existing.endAtUtc).getTime(),
        };
        if (next.startMs < current.endMs && current.startMs < next.endMs) {
          throw new PractitionerConflictError();
        }
      }
      this.sequence += 1;
      const now = new Date().toISOString();
      const record: PractitionerUnavailability = {
        id: `unavailability_${this.sequence}`,
        organizationId: context.organizationId,
        practitionerId,
        kind: input.kind,
        status: "active",
        startAtUtc: input.startAtUtc,
        endAtUtc: input.endAtUtc,
        timezone: input.timezone,
        createdAt: now,
        updatedAt: now,
      };
      this.commitSideEffects({
        practitioner,
        actorUserId: context.actorUserId,
        eventType: "unavailability_created",
        auditAction: "practitioner.leave.create",
      });
      this.unavailability.set(record.id, record);
      return record;
    });
  }

  async cancelUnavailability(
    context: PractitionerWriteContext,
    practitionerId: string,
    intervalId: string,
  ): Promise<PractitionerUnavailability> {
    return this.exclusive(async () => {
      const practitioner = await this.require(context.organizationId, practitionerId);
      const existing = this.unavailability.get(intervalId);
      if (
        !existing ||
        existing.organizationId !== context.organizationId ||
        existing.practitionerId !== practitionerId
      ) {
        throw new PractitionerNotFoundError();
      }
      if (existing.status === "cancelled") {
        throw new PractitionerValidationError("intervalId");
      }
      const updated: PractitionerUnavailability = {
        ...existing,
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      };
      this.commitSideEffects({
        practitioner,
        actorUserId: context.actorUserId,
        eventType: "unavailability_cancelled",
        auditAction: "practitioner.leave.cancel",
      });
      this.unavailability.set(updated.id, updated);
      return updated;
    });
  }

  async listUnavailability(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerUnavailability[]> {
    this.assertAvailable();
    return [...this.unavailability.values()].filter(
      (record) =>
        record.organizationId === organizationId && record.practitionerId === practitionerId,
    );
  }

  async listHistory(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly { eventType: PractitionerHistoryEvent; actorUserId: string }[]> {
    return this.history.filter(
      (record) =>
        record.organizationId === organizationId && record.practitionerId === practitionerId,
    );
  }

  private async setStatus(
    context: PractitionerWriteContext,
    practitionerId: string,
    status: "active" | "inactive",
    eventType: "activated" | "deactivated",
    auditAction: "practitioner.activate" | "practitioner.deactivate",
  ): Promise<Practitioner> {
    return this.exclusive(async () => {
      const existing = await this.require(context.organizationId, practitionerId);
      const updated: Practitioner = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
      };
      this.commitSideEffects({
        practitioner: updated,
        actorUserId: context.actorUserId,
        eventType,
        auditAction,
      });
      this.records.set(updated.id, updated);
      return updated;
    });
  }

  private buildPractitioner(organizationId: string, input: PractitionerCreateInput): Practitioner {
    this.sequence += 1;
    const now = new Date().toISOString();
    return {
      id: `practitioner_${this.sequence}`,
      organizationId,
      userId: input.userId,
      displayName: input.displayName,
      status: "active",
      verificationStatus: input.verificationStatus ?? "verified",
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildSchedule(
    organizationId: string,
    practitionerId: string,
    input: PractitionerCreateScheduleInput,
  ): PractitionerSchedule {
    this.sequence += 1;
    const now = new Date().toISOString();
    return {
      id: `schedule_${this.sequence}`,
      organizationId,
      practitionerId,
      branchId: input.branchId,
      timezone: input.timezone,
      intervals: this.buildIntervals(input.intervals),
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildIntervals(
    intervals: PractitionerCreateScheduleInput["intervals"],
  ): WeeklyWorkingInterval[] {
    return intervals.map((interval) => {
      this.sequence += 1;
      return {
        id: `interval_${this.sequence}`,
        weekday: interval.weekday,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
      };
    });
  }

  private assertWeeklyNonOverlap(intervals: PractitionerCreateScheduleInput["intervals"]): void {
    for (let i = 0; i < intervals.length; i += 1) {
      for (let j = i + 1; j < intervals.length; j += 1) {
        if (weeklyIntervalsOverlap(intervals[i]!, intervals[j]!)) {
          throw new PractitionerConflictError();
        }
      }
    }
  }

  private async require(organizationId: string, practitionerId: string): Promise<Practitioner> {
    this.assertAvailable();
    const practitioner = await this.findByOrganizationAndId(organizationId, practitionerId);
    if (!practitioner) {
      throw new PractitionerNotFoundError();
    }
    return practitioner;
  }

  private commitSideEffects(input: {
    practitioner: Practitioner;
    actorUserId: string;
    eventType: PractitionerHistoryEvent;
    auditAction: string;
  }): void {
    if (this.failHistory || this.failAudit) {
      throw new Error("practitioner_side_effect_failed");
    }
    this.history.push({
      practitionerId: input.practitioner.id,
      organizationId: input.practitioner.organizationId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
    });
    this.audit.push({
      actorUserId: input.actorUserId,
      organizationId: input.practitioner.organizationId,
      action: input.auditAction,
    });
  }

  private assertAvailable(): void {
    if (this.failLookups) {
      throw new Error("practitioner_repository_unavailable");
    }
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
