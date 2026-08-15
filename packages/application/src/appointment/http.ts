import type {
  AppointmentLifecycleCommand,
  AppointmentListFilter,
  AuthenticatedIdentity,
} from "@dentalcare/domain";
import { AppointmentValidationError } from "@dentalcare/domain";
import { toPublicAppointment, type AppointmentApplicationService } from "./service.js";
import {
  parseCommandBody,
  parseCreateInput,
  parseListFilter,
  parsePatchInput,
  parseRescheduleInput,
} from "./validation.js";

export interface AppointmentHttpResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

const JSON_HEADERS = { "content-type": "application/json" };

export async function handleAppointmentCreate(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    body: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseCreateInput(input.body);
    const result = await service.create(input.identity, input.organizationId, parsed);
    return toHttpResult(result, (appointment) => ({
      appointment: toPublicAppointment(appointment),
    }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handleAppointmentList(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    query?: URLSearchParams;
  },
): Promise<AppointmentHttpResult> {
  try {
    const filter: AppointmentListFilter | undefined = input.query
      ? parseListFilter(input.query)
      : undefined;
    const result = await service.list(input.identity, input.organizationId, filter);
    return toHttpResult(result, (appointments) => ({
      appointments: appointments.map(toPublicAppointment),
    }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handleAppointmentGet(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
  },
): Promise<AppointmentHttpResult> {
  const result = await service.get(input.identity, input.organizationId, input.appointmentId);
  return toHttpResult(result, (appointment) => ({ appointment: toPublicAppointment(appointment) }));
}

export async function handleAppointmentPatch(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  const existing = await service.requireForUpdate(
    input.identity,
    input.organizationId,
    input.appointmentId,
  );
  if (!existing.ok) {
    return {
      status: existing.status,
      headers: JSON_HEADERS,
      body: { error: existing.error, message: existing.message },
    };
  }
  try {
    parsePatchInput(input.body);
  } catch (error) {
    return validationError(error);
  }
  return {
    status: 400,
    headers: JSON_HEADERS,
    body: { error: "invalid_input", message: "Appointment input was invalid." },
  };
}

export async function handleAppointmentReschedule(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseRescheduleInput(input.body);
    const result = await service.reschedule(
      input.identity,
      input.organizationId,
      input.appointmentId,
      parsed,
    );
    return toHttpResult(result, (appointment) => ({
      appointment: toPublicAppointment(appointment),
    }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handleAppointmentCancel(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
  },
): Promise<AppointmentHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  const result = await service.cancel(input.identity, input.organizationId, input.appointmentId);
  return toHttpResult(result, (appointment) => ({ appointment: toPublicAppointment(appointment) }));
}

export async function handleAppointmentConfirm(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body?: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  return handleLifecycleCommand(service, "confirm", input);
}

export async function handleAppointmentCheckIn(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body?: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  return handleLifecycleCommand(service, "check_in", input);
}

export async function handleAppointmentStart(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body?: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  return handleLifecycleCommand(service, "start", input);
}

export async function handleAppointmentComplete(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body?: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  return handleLifecycleCommand(service, "complete", input);
}

export async function handleAppointmentNoShow(
  service: AppointmentApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body?: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  return handleLifecycleCommand(service, "no_show", input);
}

async function handleLifecycleCommand(
  service: AppointmentApplicationService,
  command: AppointmentLifecycleCommand,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    appointmentId?: string;
    body?: Record<string, unknown>;
  },
): Promise<AppointmentHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    parseCommandBody(input.body ?? {});
  } catch (error) {
    return validationError(error);
  }
  const result = await service[commandMethod(command)](
    input.identity,
    input.organizationId,
    input.appointmentId,
  );
  return toHttpResult(result, (appointment) => ({ appointment: toPublicAppointment(appointment) }));
}

function commandMethod(
  command: AppointmentLifecycleCommand,
): "confirm" | "checkIn" | "start" | "complete" | "noShow" {
  if (command === "check_in") return "checkIn";
  if (command === "no_show") return "noShow";
  return command;
}

function toHttpResult<T>(
  result:
    | { ok: true; status: 200 | 201; data: T }
    | { ok: false; status: number; error: string; message: string },
  map: (data: T) => Record<string, unknown>,
): AppointmentHttpResult {
  if (!result.ok) {
    return {
      status: result.status,
      headers: JSON_HEADERS,
      body: { error: result.error, message: result.message },
    };
  }
  return {
    status: result.status,
    headers: JSON_HEADERS,
    body: map(result.data),
  };
}

function unauthenticated(): AppointmentHttpResult {
  return {
    status: 401,
    headers: JSON_HEADERS,
    body: { error: "unauthenticated", message: "Authentication required." },
  };
}

function validationError(error: unknown): AppointmentHttpResult {
  if (error instanceof AppointmentValidationError) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: { error: "invalid_input", message: "Appointment input was invalid." },
    };
  }
  throw error;
}
