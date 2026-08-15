import type { PrismaClient } from "@prisma/client";
import type {
  Patient,
  PatientCreateInput,
  PatientRepository,
  PatientUpdateInput,
} from "@dentalcare/domain";

export class PrismaPatientRepository implements PatientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(organizationId: string, input: PatientCreateInput): Promise<Patient> {
    const record = await this.prisma.patient.create({
      data: {
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: dateOnly(input.dateOfBirth),
        email: input.email,
        phone: input.phone,
        status: "active",
        appointmentNotificationConsent: false,
        appointmentNotificationOptOut: false,
      },
    });
    return toPatient(record);
  }

  async findByOrganizationAndId(
    organizationId: string,
    patientId: string,
  ): Promise<Patient | null> {
    const record = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId },
    });
    return record ? toPatient(record) : null;
  }

  async listByOrganization(organizationId: string): Promise<readonly Patient[]> {
    const records = await this.prisma.patient.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toPatient);
  }

  async updateByOrganizationAndId(
    organizationId: string,
    patientId: string,
    input: PatientUpdateInput,
  ): Promise<Patient | null> {
    const result = await this.prisma.patient.updateMany({
      where: { id: patientId, organizationId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : undefined,
        email: input.email === null ? null : input.email,
        phone: input.phone === null ? null : input.phone,
        status: input.status,
        appointmentNotificationConsent: input.appointmentNotificationConsent,
        appointmentNotificationConsentAt:
          input.appointmentNotificationConsent === undefined
            ? undefined
            : input.appointmentNotificationConsent
              ? new Date()
              : null,
        appointmentNotificationOptOut: input.appointmentNotificationOptOut,
        appointmentNotificationOptedOutAt:
          input.appointmentNotificationOptOut === undefined
            ? undefined
            : input.appointmentNotificationOptOut
              ? new Date()
              : null,
      },
    });
    if (result.count !== 1) {
      return null;
    }
    return this.findByOrganizationAndId(organizationId, patientId);
  }
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toPatient(record: {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  email: string | null;
  phone: string | null;
  status: string;
  appointmentNotificationConsent: boolean;
  appointmentNotificationConsentAt: Date | null;
  appointmentNotificationOptOut: boolean;
  appointmentNotificationOptedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Patient {
  return {
    id: record.id,
    organizationId: record.organizationId,
    firstName: record.firstName,
    lastName: record.lastName,
    dateOfBirth: record.dateOfBirth.toISOString().slice(0, 10),
    email: record.email ?? undefined,
    phone: record.phone ?? undefined,
    status: record.status === "inactive" ? "inactive" : "active",
    appointmentNotificationConsent: record.appointmentNotificationConsent,
    appointmentNotificationConsentAt: record.appointmentNotificationConsentAt?.toISOString(),
    appointmentNotificationOptOut: record.appointmentNotificationOptOut,
    appointmentNotificationOptedOutAt: record.appointmentNotificationOptedOutAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
