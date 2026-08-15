import type {
  AuthenticatedIdentity,
  AuthorizationPort,
  Patient,
  PatientCreateInput,
  PatientRepository,
  PatientUpdateInput,
} from "@dentalcare/domain";
import { PatientValidationError } from "@dentalcare/domain";

export type PatientServiceFailure = {
  readonly ok: false;
  readonly status: 400 | 401 | 403 | 404 | 503;
  readonly error: "unauthenticated" | "forbidden" | "not_found" | "invalid_input" | "unavailable";
  readonly message: string;
};

export type PatientServiceSuccess<T> = {
  readonly ok: true;
  readonly status: 200 | 201;
  readonly data: T;
};

export type PatientServiceResult<T> = PatientServiceSuccess<T> | PatientServiceFailure;

export class PatientApplicationService {
  constructor(
    private readonly authorization: AuthorizationPort,
    private readonly patients: PatientRepository,
  ) {}

  async create(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    input: PatientCreateInput,
  ): Promise<PatientServiceResult<Patient>> {
    const gate = await this.gate(identity, organizationId, "patient.create");
    if (!gate.ok) {
      return gate;
    }
    try {
      const patient = await this.patients.create(gate.organizationId, input);
      return { ok: true, status: 201, data: patient };
    } catch {
      return unavailable();
    }
  }

  async get(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    patientId: string | undefined,
  ): Promise<PatientServiceResult<Patient>> {
    const gate = await this.gate(identity, organizationId, "patient.read.tenant");
    if (!gate.ok) {
      return gate;
    }
    const id = normalizeId(patientId);
    if (!id) {
      return invalid();
    }
    try {
      const patient = await this.patients.findByOrganizationAndId(gate.organizationId, id);
      if (!patient) {
        return notFound();
      }
      return { ok: true, status: 200, data: patient };
    } catch {
      return unavailable();
    }
  }

  async list(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
  ): Promise<PatientServiceResult<readonly Patient[]>> {
    const gate = await this.gate(identity, organizationId, "patient.read.tenant");
    if (!gate.ok) {
      return gate;
    }
    try {
      const patients = await this.patients.listByOrganization(gate.organizationId);
      return { ok: true, status: 200, data: patients };
    } catch {
      return unavailable();
    }
  }

  async update(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    patientId: string | undefined,
    input: PatientUpdateInput,
  ): Promise<PatientServiceResult<Patient>> {
    const permissions = requiredUpdatePermissions(input);
    let verifiedOrganizationId: string | undefined;
    for (const permission of permissions) {
      const gate = await this.gate(identity, organizationId, permission);
      if (!gate.ok) {
        return gate;
      }
      verifiedOrganizationId = gate.organizationId;
    }
    const id = normalizeId(patientId);
    if (!verifiedOrganizationId || !id) {
      return invalid();
    }
    try {
      const patient = await this.patients.updateByOrganizationAndId(
        verifiedOrganizationId,
        id,
        input,
      );
      if (!patient) {
        return notFound();
      }
      return { ok: true, status: 200, data: patient };
    } catch {
      return unavailable();
    }
  }

  private async gate(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    permission: string,
  ): Promise<{ ok: true; organizationId: string } | PatientServiceFailure> {
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

function requiredUpdatePermissions(input: PatientUpdateInput): string[] {
  const permissions: string[] = [];
  if (
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.dateOfBirth !== undefined ||
    input.email !== undefined ||
    input.phone !== undefined ||
    input.appointmentNotificationConsent !== undefined ||
    input.appointmentNotificationOptOut !== undefined
  ) {
    permissions.push("patient.update.tenant");
  }
  if (input.status !== undefined) {
    permissions.push("patient.archive");
  }
  return permissions;
}

function normalizeId(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function notFound(): PatientServiceFailure {
  return { ok: false, status: 404, error: "not_found", message: "Patient was not found." };
}

function invalid(): PatientServiceFailure {
  return { ok: false, status: 400, error: "invalid_input", message: "Patient input was invalid." };
}

function unavailable(): PatientServiceFailure {
  return {
    ok: false,
    status: 503,
    error: "unavailable",
    message: "Patient service is temporarily unavailable.",
  };
}

export function toPublicPatient(patient: Patient): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: patient.id,
    organizationId: patient.organizationId,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    status: patient.status,
    appointmentNotificationConsent: patient.appointmentNotificationConsent,
    appointmentNotificationOptOut: patient.appointmentNotificationOptOut,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
  if (patient.email) {
    body.email = patient.email;
  }
  if (patient.phone) {
    body.phone = patient.phone;
  }
  if (patient.appointmentNotificationConsentAt) {
    body.appointmentNotificationConsentAt = patient.appointmentNotificationConsentAt;
  }
  if (patient.appointmentNotificationOptedOutAt) {
    body.appointmentNotificationOptedOutAt = patient.appointmentNotificationOptedOutAt;
  }
  return body;
}

export { PatientValidationError };
