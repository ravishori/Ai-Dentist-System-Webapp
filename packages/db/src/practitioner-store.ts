import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PractitionerConflictError,
  PractitionerNotFoundError,
  PractitionerValidationError,
  isPractitionerStatus,
  isUnavailabilityKind,
  isUnavailabilityStatus,
  isWeekday,
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

export class PrismaPractitionerRepository implements PractitionerManagementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(organizationId: string, userId: string): Promise<Practitioner> {
    const record = await this.prisma.practitioner.create({
      data: { organizationId, userId, status: "active" },
    });
    return toPractitioner(record);
  }

  async findByOrganizationAndId(
    organizationId: string,
    practitionerId: string,
  ): Promise<Practitioner | null> {
    const record = await this.prisma.practitioner.findFirst({
      where: { id: practitionerId, organizationId },
    });
    return record ? toPractitioner(record) : null;
  }

  async isAssignedToBranch(
    organizationId: string,
    practitionerId: string,
    branchId: string,
  ): Promise<boolean> {
    const record = await this.prisma.practitionerBranchAssignment.findFirst({
      where: { organizationId, practitionerId, branchId },
    });
    return Boolean(record);
  }

  async findByUserId(userId: string): Promise<Practitioner | null> {
    const record = await this.prisma.practitioner.findUnique({ where: { userId } });
    return record ? toPractitioner(record) : null;
  }

  async listByOrganization(organizationId: string): Promise<readonly Practitioner[]> {
    const records = await this.prisma.practitioner.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toPractitioner);
  }

  async createWithAudit(
    context: PractitionerWriteContext,
    input: PractitionerCreateInput,
  ): Promise<Practitioner> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const created = await tx.practitioner.create({
          data: {
            organizationId: context.organizationId,
            userId: input.userId,
            displayName: input.displayName,
            status: "active",
          },
        });
        await writeAudit(tx, {
          practitionerId: created.id,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          eventType: "created",
          auditAction: "practitioner.create",
        });
        return created;
      });
      return toPractitioner(record);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerUpdateInput,
  ): Promise<Practitioner> {
    return this.mutate(context, practitionerId, async (tx, existing) => {
      const updated = await tx.practitioner.update({
        where: { id: existing.id },
        data: { displayName: input.displayName },
      });
      await writeAudit(tx, {
        practitionerId: existing.id,
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        eventType: "updated",
        auditAction: "practitioner.update",
      });
      return updated;
    });
  }

  async deactivateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
  ): Promise<Practitioner> {
    return this.mutate(context, practitionerId, async (tx, existing) => {
      const updated = await tx.practitioner.update({
        where: { id: existing.id },
        data: { status: "inactive" },
      });
      await writeAudit(tx, {
        practitionerId: existing.id,
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        eventType: "deactivated",
        auditAction: "practitioner.deactivate",
      });
      return updated;
    });
  }

  async activateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
  ): Promise<Practitioner> {
    return this.mutate(context, practitionerId, async (tx, existing) => {
      const updated = await tx.practitioner.update({
        where: { id: existing.id },
        data: { status: "active" },
      });
      await writeAudit(tx, {
        practitionerId: existing.id,
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        eventType: "activated",
        auditAction: "practitioner.activate",
      });
      return updated;
    });
  }

  async assignBranch(
    context: PractitionerWriteContext,
    practitionerId: string,
    branchId: string,
  ): Promise<PractitionerBranchAssignment> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.practitioner.findFirst({
          where: { id: practitionerId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new PractitionerNotFoundError();
        }
        const created = await tx.practitionerBranchAssignment.create({
          data: {
            organizationId: context.organizationId,
            practitionerId,
            branchId,
          },
        });
        await writeAudit(tx, {
          practitionerId,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          eventType: "assigned",
          auditAction: "practitioner.assignment.assign",
        });
        return toAssignment(created);
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async unassignBranch(
    context: PractitionerWriteContext,
    practitionerId: string,
    branchId: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.practitioner.findFirst({
          where: { id: practitionerId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new PractitionerNotFoundError();
        }
        const removed = await tx.practitionerBranchAssignment.deleteMany({
          where: { organizationId: context.organizationId, practitionerId, branchId },
        });
        if (removed.count !== 1) {
          throw new PractitionerValidationError("branchId");
        }
        await writeAudit(tx, {
          practitionerId,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          eventType: "unassigned",
          auditAction: "practitioner.assignment.unassign",
        });
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async listAssignments(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerBranchAssignment[]> {
    const records = await this.prisma.practitionerBranchAssignment.findMany({
      where: { organizationId, practitionerId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toAssignment);
  }

  async createSchedule(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerCreateScheduleInput,
  ): Promise<PractitionerSchedule> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.practitioner.findFirst({
          where: { id: practitionerId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new PractitionerNotFoundError();
        }
        const created = await tx.practitionerSchedule.create({
          data: {
            organizationId: context.organizationId,
            practitionerId,
            branchId: input.branchId,
            timezone: input.timezone,
            intervals: {
              create: input.intervals.map((interval) => ({
                organizationId: context.organizationId,
                practitionerId,
                branchId: input.branchId,
                weekday: interval.weekday,
                startMinute: interval.startMinute,
                endMinute: interval.endMinute,
              })),
            },
          },
          include: { intervals: true },
        });
        await writeAudit(tx, {
          practitionerId,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          eventType: "schedule_replaced",
          auditAction: "practitioner.schedule.replace",
        });
        return toSchedule(created);
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async replaceSchedule(
    context: PractitionerWriteContext,
    practitionerId: string,
    scheduleId: string,
    input: PractitionerReplaceScheduleInput,
  ): Promise<PractitionerSchedule> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.practitionerSchedule.findFirst({
          where: { id: scheduleId, organizationId: context.organizationId, practitionerId },
          include: { intervals: true },
        });
        if (!existing) {
          throw new PractitionerNotFoundError();
        }
        if (existing.intervals.length > 0) {
          await tx.practitionerWeeklyInterval.deleteMany({
            where: { scheduleId: existing.id },
          });
        }
        const updated = await tx.practitionerSchedule.update({
          where: { id: existing.id },
          data: {
            timezone: input.timezone,
            intervals: {
              create: input.intervals.map((interval) => ({
                organizationId: context.organizationId,
                practitionerId,
                branchId: existing.branchId,
                weekday: interval.weekday,
                startMinute: interval.startMinute,
                endMinute: interval.endMinute,
              })),
            },
          },
          include: { intervals: true },
        });
        await writeAudit(tx, {
          practitionerId,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          eventType: "schedule_replaced",
          auditAction: "practitioner.schedule.replace",
        });
        return toSchedule(updated);
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async findScheduleByOrganizationAndId(
    organizationId: string,
    practitionerId: string,
    scheduleId: string,
  ): Promise<PractitionerSchedule | null> {
    const record = await this.prisma.practitionerSchedule.findFirst({
      where: { id: scheduleId, organizationId, practitionerId },
      include: { intervals: true },
    });
    return record ? toSchedule(record) : null;
  }

  async findScheduleByPractitionerAndBranch(
    organizationId: string,
    practitionerId: string,
    branchId: string,
  ): Promise<PractitionerSchedule | null> {
    const record = await this.prisma.practitionerSchedule.findFirst({
      where: { organizationId, practitionerId, branchId },
      include: { intervals: true },
    });
    return record ? toSchedule(record) : null;
  }

  async listSchedules(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerSchedule[]> {
    const records = await this.prisma.practitionerSchedule.findMany({
      where: { organizationId, practitionerId },
      include: { intervals: true },
      orderBy: { branchId: "asc" },
    });
    return records.map(toSchedule);
  }

  async createUnavailability(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerUnavailabilityCreateInput,
  ): Promise<PractitionerUnavailability> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.practitioner.findFirst({
          where: { id: practitionerId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new PractitionerNotFoundError();
        }
        const created = await tx.practitionerUnavailability.create({
          data: {
            organizationId: context.organizationId,
            practitionerId,
            kind: input.kind,
            status: "active",
            startAtUtc: new Date(input.startAtUtc),
            endAtUtc: new Date(input.endAtUtc),
            timezone: input.timezone,
          },
        });
        await writeAudit(tx, {
          practitionerId,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          eventType: "unavailability_created",
          auditAction: "practitioner.leave.create",
        });
        return toUnavailability(created);
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async cancelUnavailability(
    context: PractitionerWriteContext,
    practitionerId: string,
    intervalId: string,
  ): Promise<PractitionerUnavailability> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.practitionerUnavailability.findFirst({
          where: { id: intervalId, organizationId: context.organizationId, practitionerId },
        });
        if (!existing) {
          throw new PractitionerNotFoundError();
        }
        if (existing.status === "cancelled") {
          throw new PractitionerValidationError("intervalId");
        }
        const updated = await tx.practitionerUnavailability.update({
          where: { id: existing.id },
          data: { status: "cancelled" },
        });
        await writeAudit(tx, {
          practitionerId,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          eventType: "unavailability_cancelled",
          auditAction: "practitioner.leave.cancel",
        });
        return toUnavailability(updated);
      });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async listUnavailability(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerUnavailability[]> {
    const records = await this.prisma.practitionerUnavailability.findMany({
      where: { organizationId, practitionerId },
      orderBy: { startAtUtc: "asc" },
    });
    return records.map(toUnavailability);
  }

  async listHistory(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly { eventType: PractitionerHistoryEvent; actorUserId: string }[]> {
    const records = await this.prisma.practitionerHistory.findMany({
      where: { organizationId, practitionerId },
      orderBy: { createdAt: "asc" },
    });
    return records.map((record) => ({
      eventType: record.eventType as PractitionerHistoryEvent,
      actorUserId: record.actorUserId,
    }));
  }

  private async mutate(
    context: PractitionerWriteContext,
    practitionerId: string,
    fn: (
      tx: Prisma.TransactionClient,
      existing: { id: string; organizationId: string },
    ) => Promise<{
      id: string;
      organizationId: string;
      userId: string;
      displayName: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ): Promise<Practitioner> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.practitioner.findFirst({
          where: { id: practitionerId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new PractitionerNotFoundError();
        }
        return fn(tx, existing);
      });
      return toPractitioner(record);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    practitionerId: string;
    organizationId: string;
    actorUserId: string;
    eventType: PractitionerHistoryEvent;
    auditAction: string;
  },
): Promise<void> {
  await tx.practitionerHistory.create({
    data: {
      practitionerId: input.practitionerId,
      organizationId: input.organizationId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
    },
  });
  await tx.securityEvent.create({
    data: {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      action: input.auditAction,
      outcome: "allowed",
    },
  });
}

function mapPersistenceError(error: unknown): unknown {
  if (
    error instanceof PractitionerConflictError ||
    error instanceof PractitionerNotFoundError ||
    error instanceof PractitionerValidationError
  ) {
    return error;
  }
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (
    code === "P2002" ||
    code === "23P01" ||
    message.includes("23P01") ||
    message.includes("_excl") ||
    message.includes("practitionerId_branchId")
  ) {
    return new PractitionerConflictError();
  }
  return error;
}

function toPractitioner(record: {
  id: string;
  organizationId: string;
  userId: string;
  displayName?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Practitioner {
  return {
    id: record.id,
    organizationId: record.organizationId,
    userId: record.userId,
    displayName: record.displayName ?? undefined,
    status: isPractitionerStatus(record.status) ? record.status : "active",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toAssignment(record: {
  id: string;
  organizationId: string;
  practitionerId: string;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
}): PractitionerBranchAssignment {
  return {
    id: record.id,
    organizationId: record.organizationId,
    practitionerId: record.practitionerId,
    branchId: record.branchId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toSchedule(record: {
  id: string;
  organizationId: string;
  practitionerId: string;
  branchId: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  intervals: Array<{
    id: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
  }>;
}): PractitionerSchedule {
  return {
    id: record.id,
    organizationId: record.organizationId,
    practitionerId: record.practitionerId,
    branchId: record.branchId,
    timezone: record.timezone,
    intervals: record.intervals.map(
      (interval): WeeklyWorkingInterval => ({
        id: interval.id,
        weekday: isWeekday(interval.weekday) ? interval.weekday : 0,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
      }),
    ),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toUnavailability(record: {
  id: string;
  organizationId: string;
  practitionerId: string;
  kind: string;
  status: string;
  startAtUtc: Date;
  endAtUtc: Date;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}): PractitionerUnavailability {
  return {
    id: record.id,
    organizationId: record.organizationId,
    practitionerId: record.practitionerId,
    kind: isUnavailabilityKind(record.kind) ? record.kind : "exception",
    status: isUnavailabilityStatus(record.status) ? record.status : "active",
    startAtUtc: record.startAtUtc.toISOString(),
    endAtUtc: record.endAtUtc.toISOString(),
    timezone: record.timezone,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
