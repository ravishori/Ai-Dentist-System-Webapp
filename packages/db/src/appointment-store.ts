import type { PrismaClient } from "@prisma/client";
import {
  AppointmentConflictError,
  AppointmentNotFoundError,
  AppointmentTransitionError,
  APPOINTMENT_LIFECYCLE_SPECS,
  canApplyLifecycleCommand,
  canCancel,
  canReschedule,
  isAppointmentStatus,
  type Appointment,
  type AppointmentCreateInput,
  type AppointmentLifecycleCommand,
  type AppointmentListFilter,
  type AppointmentRepository,
  type AppointmentWriteContext,
  type BranchLookup,
  type BranchRecord,
  type Practitioner,
  type PractitionerRepository,
} from "@dentalcare/domain";

export class PrismaPractitionerRepository implements PractitionerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(organizationId: string, userId: string): Promise<Practitioner> {
    const record = await this.prisma.practitioner.create({
      data: { organizationId, userId },
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
}

export class PrismaBranchLookup implements BranchLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async findByOrganizationAndId(
    organizationId: string,
    branchId: string,
  ): Promise<BranchRecord | null> {
    const record = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
    });
    return record ? { id: record.id, organizationId: record.organizationId } : null;
  }
}

export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    context: AppointmentWriteContext,
    input: AppointmentCreateInput,
  ): Promise<Appointment> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const created = await tx.appointment.create({
          data: {
            organizationId: context.organizationId,
            branchId: input.branchId,
            patientId: input.patientId,
            practitionerId: input.practitionerId,
            startAtUtc: new Date(input.startAtUtc),
            endAtUtc: new Date(input.endAtUtc),
            timezone: input.timezone,
            status: "REQUESTED",
          },
        });
        await tx.appointmentHistory.create({
          data: {
            appointmentId: created.id,
            organizationId: context.organizationId,
            eventType: "created",
            toStatus: "REQUESTED",
            actorUserId: context.actorUserId,
          },
        });
        await tx.securityEvent.create({
          data: {
            actorUserId: context.actorUserId,
            organizationId: context.organizationId,
            action: "appointment.create",
            outcome: "allowed",
          },
        });
        await tx.notificationOutbox.create({
          data: {
            organizationId: context.organizationId,
            appointmentId: created.id,
            eventType: "appointment.created",
            status: "pending",
          },
        });
        return created;
      });
      return toAppointment(record);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async findByOrganizationAndId(
    organizationId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    const record = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId },
    });
    return record ? toAppointment(record) : null;
  }

  async listByOrganization(
    organizationId: string,
    filter?: AppointmentListFilter,
  ): Promise<readonly Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        organizationId,
        patientId: filter?.patientId,
        practitionerId: filter?.practitionerId,
        branchId: filter?.branchId,
        status: filter?.status,
      },
      orderBy: { startAtUtc: "asc" },
    });
    return records.map(toAppointment);
  }

  async rescheduleByOrganizationAndId(
    context: AppointmentWriteContext,
    appointmentId: string,
    startAtUtc: string,
    endAtUtc: string,
    timezone: string,
  ): Promise<Appointment> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.appointment.findFirst({
          where: { id: appointmentId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new AppointmentNotFoundError();
        }
        if (!isAppointmentStatus(existing.status) || !canReschedule(existing.status)) {
          throw new AppointmentTransitionError();
        }
        const updated = await tx.appointment.update({
          where: { id: existing.id },
          data: {
            startAtUtc: new Date(startAtUtc),
            endAtUtc: new Date(endAtUtc),
            timezone,
          },
        });
        await tx.appointmentHistory.create({
          data: {
            appointmentId: existing.id,
            organizationId: context.organizationId,
            eventType: "rescheduled",
            fromStatus: existing.status,
            toStatus: existing.status,
            actorUserId: context.actorUserId,
          },
        });
        await tx.securityEvent.create({
          data: {
            actorUserId: context.actorUserId,
            organizationId: context.organizationId,
            action: "appointment.reschedule",
            outcome: "allowed",
          },
        });
        await tx.notificationOutbox.create({
          data: {
            organizationId: context.organizationId,
            appointmentId: existing.id,
            eventType: "appointment.rescheduled",
            status: "pending",
          },
        });
        return updated;
      });
      return toAppointment(record);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async cancelByOrganizationAndId(
    context: AppointmentWriteContext,
    appointmentId: string,
  ): Promise<Appointment> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.appointment.findFirst({
          where: { id: appointmentId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new AppointmentNotFoundError();
        }
        if (!isAppointmentStatus(existing.status) || !canCancel(existing.status)) {
          throw new AppointmentTransitionError();
        }
        const updated = await tx.appointment.update({
          where: { id: existing.id },
          data: { status: "CANCELLED" },
        });
        await tx.appointmentHistory.create({
          data: {
            appointmentId: existing.id,
            organizationId: context.organizationId,
            eventType: "cancelled",
            fromStatus: existing.status,
            toStatus: "CANCELLED",
            actorUserId: context.actorUserId,
          },
        });
        await tx.securityEvent.create({
          data: {
            actorUserId: context.actorUserId,
            organizationId: context.organizationId,
            action: "appointment.cancel",
            outcome: "allowed",
          },
        });
        await tx.notificationOutbox.create({
          data: {
            organizationId: context.organizationId,
            appointmentId: existing.id,
            eventType: "appointment.cancelled",
            status: "pending",
          },
        });
        return updated;
      });
      return toAppointment(record);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async applyLifecycleByOrganizationAndId(
    context: AppointmentWriteContext,
    appointmentId: string,
    command: AppointmentLifecycleCommand,
    now: Date,
  ): Promise<Appointment> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.appointment.findFirst({
          where: { id: appointmentId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new AppointmentNotFoundError();
        }
        if (!isAppointmentStatus(existing.status)) {
          throw new AppointmentTransitionError();
        }
        if (
          !canApplyLifecycleCommand(
            command,
            existing.status,
            existing.startAtUtc.toISOString(),
            existing.endAtUtc.toISOString(),
            now,
          )
        ) {
          throw new AppointmentTransitionError();
        }
        const spec = APPOINTMENT_LIFECYCLE_SPECS[command];
        const updated = await tx.appointment.update({
          where: { id: existing.id },
          data: { status: spec.toStatus },
        });
        await tx.appointmentHistory.create({
          data: {
            appointmentId: existing.id,
            organizationId: context.organizationId,
            eventType: spec.historyEvent,
            fromStatus: existing.status,
            toStatus: spec.toStatus,
            actorUserId: context.actorUserId,
          },
        });
        await tx.securityEvent.create({
          data: {
            actorUserId: context.actorUserId,
            organizationId: context.organizationId,
            action: spec.auditAction,
            outcome: "allowed",
          },
        });
        return updated;
      });
      return toAppointment(record);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }
}

function mapPersistenceError(error: unknown): unknown {
  if (
    error instanceof AppointmentConflictError ||
    error instanceof AppointmentTransitionError ||
    error instanceof AppointmentNotFoundError
  ) {
    return error;
  }
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === "23P01" || message.includes("23P01") || message.includes("_time_excl")) {
    return new AppointmentConflictError();
  }
  return error;
}

function toPractitioner(record: {
  id: string;
  organizationId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}): Practitioner {
  return {
    id: record.id,
    organizationId: record.organizationId,
    userId: record.userId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toAppointment(record: {
  id: string;
  organizationId: string;
  branchId: string;
  patientId: string;
  practitionerId: string;
  startAtUtc: Date;
  endAtUtc: Date;
  timezone: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Appointment {
  return {
    id: record.id,
    organizationId: record.organizationId,
    branchId: record.branchId,
    patientId: record.patientId,
    practitionerId: record.practitionerId,
    startAtUtc: record.startAtUtc.toISOString(),
    endAtUtc: record.endAtUtc.toISOString(),
    timezone: record.timezone,
    status: isAppointmentStatus(record.status) ? record.status : "REQUESTED",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
