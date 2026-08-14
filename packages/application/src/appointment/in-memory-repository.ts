import {
  AppointmentConflictError,
  AppointmentNotFoundError,
  AppointmentTransitionError,
  canCancel,
  canReschedule,
  isActiveSchedulingStatus,
  type Appointment,
  type AppointmentCreateInput,
  type AppointmentListFilter,
  type AppointmentRepository,
  type AppointmentWriteContext,
  type BranchLookup,
  type BranchRecord,
  type Practitioner,
  type PractitionerRepository,
} from "@dentalcare/domain";

export class InMemoryPractitionerRepository implements PractitionerRepository {
  readonly records = new Map<string, Practitioner>();
  failLookups = false;
  private sequence = 0;

  async create(organizationId: string, userId: string): Promise<Practitioner> {
    this.assertAvailable();
    this.sequence += 1;
    const now = new Date().toISOString();
    const practitioner: Practitioner = {
      id: `practitioner_${this.sequence}`,
      organizationId,
      userId,
      createdAt: now,
      updatedAt: now,
    };
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

  private assertAvailable(): void {
    if (this.failLookups) {
      throw new Error("practitioner_repository_unavailable");
    }
  }
}

export class InMemoryBranchLookup implements BranchLookup {
  readonly records = new Map<string, BranchRecord>();
  failLookups = false;

  add(organizationId: string, branchId: string): this {
    this.records.set(branchId, { id: branchId, organizationId });
    return this;
  }

  async findByOrganizationAndId(
    organizationId: string,
    branchId: string,
  ): Promise<BranchRecord | null> {
    if (this.failLookups) {
      throw new Error("branch_lookup_unavailable");
    }
    const branch = this.records.get(branchId);
    if (!branch || branch.organizationId !== organizationId) {
      return null;
    }
    return branch;
  }
}

export class InMemoryAppointmentRepository implements AppointmentRepository {
  readonly records = new Map<string, Appointment>();
  readonly history: Array<Record<string, string | undefined>> = [];
  readonly audit: Array<Record<string, string>> = [];
  readonly outbox: Array<Record<string, string>> = [];
  failLookups = false;
  failHistory = false;
  failAudit = false;
  failOutbox = false;
  private sequence = 0;
  private chain: Promise<unknown> = Promise.resolve();

  async create(context: AppointmentWriteContext, input: AppointmentCreateInput): Promise<Appointment> {
    return this.exclusive(async () => {
      this.assertAvailable();
      this.assertNoOverlap(context.organizationId, input.patientId, input.practitionerId, input.startAtUtc, input.endAtUtc);
      const appointment = this.build(context.organizationId, input);
      this.commitSideEffects("created", appointment, context.actorUserId, undefined, "REQUESTED");
      this.records.set(appointment.id, appointment);
      return appointment;
    });
  }

  async findByOrganizationAndId(
    organizationId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    this.assertAvailable();
    const appointment = this.records.get(appointmentId);
    if (!appointment || appointment.organizationId !== organizationId) {
      return null;
    }
    return appointment;
  }

  async listByOrganization(
    organizationId: string,
    filter?: AppointmentListFilter,
  ): Promise<readonly Appointment[]> {
    this.assertAvailable();
    return [...this.records.values()].filter((appointment) => {
      if (appointment.organizationId !== organizationId) return false;
      if (filter?.patientId && appointment.patientId !== filter.patientId) return false;
      if (filter?.practitionerId && appointment.practitionerId !== filter.practitionerId) return false;
      if (filter?.branchId && appointment.branchId !== filter.branchId) return false;
      if (filter?.status && appointment.status !== filter.status) return false;
      return true;
    });
  }

  async rescheduleByOrganizationAndId(
    context: AppointmentWriteContext,
    appointmentId: string,
    startAtUtc: string,
    endAtUtc: string,
    timezone: string,
  ): Promise<Appointment> {
    return this.exclusive(async () => {
      this.assertAvailable();
      const existing = await this.findByOrganizationAndId(context.organizationId, appointmentId);
      if (!existing) {
        throw new AppointmentNotFoundError();
      }
      if (!canReschedule(existing.status)) {
        throw new AppointmentTransitionError();
      }
      this.assertNoOverlap(
        context.organizationId,
        existing.patientId,
        existing.practitionerId,
        startAtUtc,
        endAtUtc,
        existing.id,
      );
      const updated: Appointment = {
        ...existing,
        startAtUtc,
        endAtUtc,
        timezone,
        updatedAt: new Date().toISOString(),
      };
      this.commitSideEffects("rescheduled", updated, context.actorUserId, existing.status, existing.status);
      this.records.set(updated.id, updated);
      return updated;
    });
  }

  async cancelByOrganizationAndId(
    context: AppointmentWriteContext,
    appointmentId: string,
  ): Promise<Appointment> {
    return this.exclusive(async () => {
      this.assertAvailable();
      const existing = await this.findByOrganizationAndId(context.organizationId, appointmentId);
      if (!existing) {
        throw new AppointmentNotFoundError();
      }
      if (!canCancel(existing.status)) {
        throw new AppointmentTransitionError();
      }
      const updated: Appointment = {
        ...existing,
        status: "CANCELLED",
        updatedAt: new Date().toISOString(),
      };
      this.commitSideEffects("cancelled", updated, context.actorUserId, existing.status, "CANCELLED");
      this.records.set(updated.id, updated);
      return updated;
    });
  }

  private build(organizationId: string, input: AppointmentCreateInput): Appointment {
    this.sequence += 1;
    const now = new Date().toISOString();
    return {
      id: `appointment_${this.sequence}`,
      organizationId,
      branchId: input.branchId,
      patientId: input.patientId,
      practitionerId: input.practitionerId,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      timezone: input.timezone,
      status: "REQUESTED",
      createdAt: now,
      updatedAt: now,
    };
  }

  private assertNoOverlap(
    organizationId: string,
    patientId: string,
    practitionerId: string,
    startAtUtc: string,
    endAtUtc: string,
    ignoreId?: string,
  ): void {
    const start = new Date(startAtUtc).getTime();
    const end = new Date(endAtUtc).getTime();
    for (const appointment of this.records.values()) {
      if (appointment.organizationId !== organizationId) continue;
      if (ignoreId && appointment.id === ignoreId) continue;
      if (!isActiveSchedulingStatus(appointment.status)) continue;
      const otherStart = new Date(appointment.startAtUtc).getTime();
      const otherEnd = new Date(appointment.endAtUtc).getTime();
      const overlaps = start < otherEnd && otherStart < end;
      if (!overlaps) continue;
      if (appointment.practitionerId === practitionerId || appointment.patientId === patientId) {
        throw new AppointmentConflictError();
      }
    }
  }

  private commitSideEffects(
    eventType: string,
    appointment: Appointment,
    actorUserId: string,
    fromStatus: string | undefined,
    toStatus: string,
  ): void {
    if (this.failHistory || this.failAudit || this.failOutbox) {
      throw new Error("appointment_side_effect_failed");
    }
    this.history.push({
      appointmentId: appointment.id,
      organizationId: appointment.organizationId,
      eventType,
      fromStatus,
      toStatus,
      actorUserId,
    });
    this.audit.push({
      actorUserId,
      organizationId: appointment.organizationId,
      action: `appointment.${eventType === "created" ? "create" : eventType === "rescheduled" ? "reschedule" : "cancel"}`,
    });
    this.outbox.push({
      organizationId: appointment.organizationId,
      appointmentId: appointment.id,
      eventType: `appointment.${eventType === "created" ? "created" : eventType}`,
      status: "pending",
    });
  }

  private assertAvailable(): void {
    if (this.failLookups) {
      throw new Error("appointment_repository_unavailable");
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
