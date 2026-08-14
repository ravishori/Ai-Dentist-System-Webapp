import type {
  Patient,
  PatientCreateInput,
  PatientUpdateInput,
  PatientRepository,
} from "@dentalcare/domain";

export class InMemoryPatientRepository implements PatientRepository {
  readonly records = new Map<string, Patient>();
  failLookups = false;
  private sequence = 0;

  async create(organizationId: string, input: PatientCreateInput): Promise<Patient> {
    this.assertAvailable();
    this.sequence += 1;
    const now = new Date().toISOString();
    const patient: Patient = {
      id: `patient_${this.sequence}`,
      organizationId,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      email: input.email,
      phone: input.phone,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(patient.id, patient);
    return patient;
  }

  async findByOrganizationAndId(
    organizationId: string,
    patientId: string,
  ): Promise<Patient | null> {
    this.assertAvailable();
    const patient = this.records.get(patientId);
    if (!patient || patient.organizationId !== organizationId) {
      return null;
    }
    return patient;
  }

  async listByOrganization(organizationId: string): Promise<readonly Patient[]> {
    this.assertAvailable();
    return [...this.records.values()].filter(
      (patient) => patient.organizationId === organizationId,
    );
  }

  async updateByOrganizationAndId(
    organizationId: string,
    patientId: string,
    input: PatientUpdateInput,
  ): Promise<Patient | null> {
    this.assertAvailable();
    const existing = await this.findByOrganizationAndId(organizationId, patientId);
    if (!existing) {
      return null;
    }
    const updated: Patient = {
      ...existing,
      firstName: input.firstName ?? existing.firstName,
      lastName: input.lastName ?? existing.lastName,
      dateOfBirth: input.dateOfBirth ?? existing.dateOfBirth,
      email: input.email === null ? undefined : (input.email ?? existing.email),
      phone: input.phone === null ? undefined : (input.phone ?? existing.phone),
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(patientId, updated);
    return updated;
  }

  private assertAvailable(): void {
    if (this.failLookups) {
      throw new Error("patient_repository_unavailable");
    }
  }
}
