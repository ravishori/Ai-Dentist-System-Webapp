import type {
  Appointment,
  AppointmentCreateInput,
  AppointmentListFilter,
  AppointmentRepository,
  AppointmentRescheduleInput,
  AuthenticatedIdentity,
  AuthorizationPort,
  BranchLookup,
  PatientRepository,
  PractitionerRepository,
} from "@dentalcare/domain";
import {
  AppointmentConflictError,
  AppointmentNotFoundError,
  AppointmentTransitionError,
  AppointmentValidationError,
} from "@dentalcare/domain";

export type AppointmentServiceFailure = {
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

export type AppointmentServiceSuccess<T> = {
  readonly ok: true;
  readonly status: 200 | 201;
  readonly data: T;
};

export type AppointmentServiceResult<T> = AppointmentServiceSuccess<T> | AppointmentServiceFailure;

export class AppointmentApplicationService {
  constructor(
    private readonly authorization: AuthorizationPort,
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
    private readonly practitioners: PractitionerRepository,
    private readonly branches: BranchLookup,
  ) {}

  async create(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    input: AppointmentCreateInput,
  ): Promise<AppointmentServiceResult<Appointment>> {
    const gate = await this.gate(identity, organizationId, "appointment.create");
    if (!gate.ok) {
      return gate;
    }
    const related = await this.validateRelations(gate.organizationId, input);
    if (!related.ok) {
      return related;
    }
    try {
      const appointment = await this.appointments.create(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        input,
      );
      return { ok: true, status: 201, data: appointment };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async get(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    appointmentId: string | undefined,
  ): Promise<AppointmentServiceResult<Appointment>> {
    const gate = await this.gate(identity, organizationId, "appointment.read.tenant");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(appointmentId);
    if (!id) {
      return invalid();
    }
    try {
      const appointment = await this.appointments.findByOrganizationAndId(gate.organizationId, id);
      if (!appointment) {
        return notFound();
      }
      return { ok: true, status: 200, data: appointment };
    } catch {
      return unavailable();
    }
  }

  async list(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    filter?: AppointmentListFilter,
  ): Promise<AppointmentServiceResult<readonly Appointment[]>> {
    const gate = await this.gate(identity, organizationId, "appointment.read.tenant");
    if (!gate.ok) {
      return gate;
    }
    try {
      const appointments = await this.appointments.listByOrganization(gate.organizationId, filter);
      return { ok: true, status: 200, data: appointments };
    } catch {
      return unavailable();
    }
  }

  async requireForUpdate(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    appointmentId: string | undefined,
  ): Promise<AppointmentServiceResult<Appointment>> {
    const gate = await this.gate(identity, organizationId, "appointment.update.tenant");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(appointmentId);
    if (!id) {
      return invalid();
    }
    try {
      const appointment = await this.appointments.findByOrganizationAndId(gate.organizationId, id);
      if (!appointment) {
        return notFound();
      }
      return { ok: true, status: 200, data: appointment };
    } catch {
      return unavailable();
    }
  }

  async reschedule(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    appointmentId: string | undefined,
    input: AppointmentRescheduleInput,
  ): Promise<AppointmentServiceResult<Appointment>> {
    const gate = await this.gate(identity, organizationId, "appointment.reschedule");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(appointmentId);
    if (!id) {
      return invalid();
    }
    try {
      const existing = await this.appointments.findByOrganizationAndId(gate.organizationId, id);
      if (!existing) {
        return notFound();
      }
      const related = await this.validateRelations(gate.organizationId, {
        patientId: existing.patientId,
        branchId: existing.branchId,
        practitionerId: existing.practitionerId,
        startAtUtc: input.startAtUtc,
        endAtUtc: input.endAtUtc,
        timezone: input.timezone,
      });
      if (!related.ok) {
        return related;
      }
      const appointment = await this.appointments.rescheduleByOrganizationAndId(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
        input.startAtUtc,
        input.endAtUtc,
        input.timezone,
      );
      return { ok: true, status: 200, data: appointment };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async cancel(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    appointmentId: string | undefined,
  ): Promise<AppointmentServiceResult<Appointment>> {
    const gate = await this.gate(identity, organizationId, "appointment.cancel");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(appointmentId);
    if (!id) {
      return invalid();
    }
    try {
      const appointment = await this.appointments.cancelByOrganizationAndId(
        { organizationId: gate.organizationId, actorUserId: identity!.userId },
        id,
      );
      return { ok: true, status: 200, data: appointment };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  private async validateRelations(
    organizationId: string,
    input: AppointmentCreateInput,
  ): Promise<{ ok: true } | AppointmentServiceFailure> {
    try {
      const [patient, practitioner, branch] = await Promise.all([
        this.patients.findByOrganizationAndId(organizationId, input.patientId),
        this.practitioners.findByOrganizationAndId(organizationId, input.practitionerId),
        this.branches.findByOrganizationAndId(organizationId, input.branchId),
      ]);
      if (!patient || !practitioner || !branch) {
        return invalid();
      }
      if (patient.status !== "active") {
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
  ): Promise<{ ok: true; organizationId: string } | AppointmentServiceFailure> {
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

function mapWriteError(error: unknown): AppointmentServiceFailure {
  if (error instanceof AppointmentConflictError) {
    return {
      ok: false,
      status: 409,
      error: "conflict",
      message: "Appointment scheduling conflict.",
    };
  }
  if (error instanceof AppointmentTransitionError) {
    return {
      ok: false,
      status: 400,
      error: "invalid_input",
      message: "Appointment transition is not allowed.",
    };
  }
  if (error instanceof AppointmentValidationError) {
    return invalid();
  }
  if (error instanceof AppointmentNotFoundError) {
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

function notFound(): AppointmentServiceFailure {
  return { ok: false, status: 404, error: "not_found", message: "Appointment was not found." };
}

function invalid(): AppointmentServiceFailure {
  return {
    ok: false,
    status: 400,
    error: "invalid_input",
    message: "Appointment input was invalid.",
  };
}

function unavailable(): AppointmentServiceFailure {
  return {
    ok: false,
    status: 503,
    error: "unavailable",
    message: "Appointment service is temporarily unavailable.",
  };
}

export function toPublicAppointment(appointment: Appointment): Record<string, unknown> {
  return {
    id: appointment.id,
    organizationId: appointment.organizationId,
    branchId: appointment.branchId,
    patientId: appointment.patientId,
    practitionerId: appointment.practitionerId,
    startAtUtc: appointment.startAtUtc,
    endAtUtc: appointment.endAtUtc,
    timezone: appointment.timezone,
    status: appointment.status,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}
