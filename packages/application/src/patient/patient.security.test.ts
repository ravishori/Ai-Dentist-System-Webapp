import { describe, expect, it } from "vitest";
import type { AuthenticatedIdentity } from "@dentalcare/domain";
import { PatientValidationError } from "@dentalcare/domain";
import { RbacAuthorizationAdapter } from "../foundation/authz/rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "../foundation/authz/in-memory-directory.js";
import { PatientApplicationService } from "./service.js";
import { InMemoryPatientRepository } from "./in-memory-repository.js";
import {
  handlePatientCreate,
  handlePatientGet,
  handlePatientList,
  handlePatientPatch,
} from "./http.js";
import { parseCreateInput } from "./validation.js";

const ORG_A = "org_a";
const ORG_B = "org_b";
const STAFF_A = "user_staff_a";
const STAFF_B = "user_staff_b";
const ADMIN_A = "user_admin_a";
const DISABLED = "user_disabled";
const NO_MEMBER = "user_nomember";
const REVOKED = "user_revoked";
const PATIENT_ROLE = "user_patient_role";
const PLATFORM_ADMIN = "user_platform";

const SAMPLE = {
  firstName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: "1815-12-10",
  email: "ada@example.test",
  phone: "+447700900123",
};

function identity(userId: string): AuthenticatedIdentity {
  return {
    userId,
    issuer: "https://example.test",
    subject: `sub-${userId}`,
    authenticatedAt: "2026-08-14T00:00:00.000Z",
  };
}

function harness() {
  const directory = new InMemoryAuthorizationDirectory();
  directory.addUser(STAFF_A).addUser(STAFF_B).addUser(ADMIN_A);
  directory.addUser(DISABLED, "disabled").addUser(NO_MEMBER).addUser(REVOKED);
  directory.addUser(PATIENT_ROLE).addUser(PLATFORM_ADMIN);
  directory.addOrganization(ORG_A).addOrganization(ORG_B);
  directory.addMembership({ userId: STAFF_A, organizationId: ORG_A, roleKeys: ["STAFF"] });
  directory.addMembership({ userId: STAFF_B, organizationId: ORG_B, roleKeys: ["STAFF"] });
  directory.addMembership({
    userId: ADMIN_A,
    organizationId: ORG_A,
    roleKeys: ["PRACTICE_ADMIN"],
  });
  directory.addMembership({
    userId: DISABLED,
    organizationId: ORG_A,
    roleKeys: ["STAFF"],
  });
  directory.addMembership({
    userId: REVOKED,
    organizationId: ORG_A,
    status: "revoked",
    roleKeys: ["STAFF"],
  });
  directory.addMembership({
    userId: PATIENT_ROLE,
    organizationId: ORG_A,
    roleKeys: ["PATIENT"],
  });
  directory.setPlatformRoles(PLATFORM_ADMIN, ["SYSTEM_ADMIN"]);
  const authorization = new RbacAuthorizationAdapter(directory);
  const patients = new InMemoryPatientRepository();
  const service = new PatientApplicationService(authorization, patients);
  return { directory, patients, service, authorization };
}

describe("patient domain validation", () => {
  it("rejects missing names and future dates", () => {
    expect(() => parseCreateInput({ lastName: "Lovelace", dateOfBirth: "1815-12-10" })).toThrow(
      PatientValidationError,
    );
    expect(() =>
      parseCreateInput({ firstName: "Ada", lastName: "Lovelace", dateOfBirth: "2999-01-01" }),
    ).toThrow(PatientValidationError);
  });

  it("rejects malformed email and phone", () => {
    expect(() => parseCreateInput({ ...SAMPLE, email: "not-an-email" })).toThrow(
      PatientValidationError,
    );
    expect(() => parseCreateInput({ ...SAMPLE, phone: "abc" })).toThrow(PatientValidationError);
  });

  it("rejects tenant ownership fields in the body", () => {
    expect(() =>
      parseCreateInput({
        ...SAMPLE,
        organizationId: ORG_B,
      }),
    ).toThrow(PatientValidationError);
    expect(() => parseCreateInput({ ...SAMPLE, userId: STAFF_A })).toThrow(PatientValidationError);
  });
});

describe("patient authorization and BOLA", () => {
  it("unauthenticated create is denied", async () => {
    const { service } = harness();
    await expect(service.create(null, ORG_A, SAMPLE)).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("staff in organization A can create and read patient A", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const read = await service.get(identity(STAFF_A), ORG_A, created.data.id);
    expect(read).toMatchObject({ ok: true, data: { organizationId: ORG_A, firstName: "Ada" } });
  });

  it("staff in organization A cannot read organization B patient", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_B), ORG_B, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const crossGet = await service.get(identity(STAFF_A), ORG_A, created.data.id);
    expect(crossGet).toMatchObject({ ok: false, status: 404, error: "not_found" });
    expect(JSON.stringify(crossGet)).not.toContain("Ada");
    expect(JSON.stringify(crossGet)).not.toContain("ada@example.test");
    expect(JSON.stringify(crossGet)).not.toContain("+447700900123");
    expect(JSON.stringify(crossGet)).not.toContain("1815-12-10");
  });

  it("staff in organization B cannot read organization A patient", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(service.get(identity(STAFF_B), ORG_B, created.data.id)).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("tampered organization header does not grant access", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await service.get(identity(STAFF_A), ORG_B, created.data.id);
    expect(result).toMatchObject({ ok: false, status: 403, error: "forbidden" });
    expect(JSON.stringify(result)).not.toContain("Ada");
  });

  it("forged patient id from another tenant is not found", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_B), ORG_B, {
      ...SAMPLE,
      firstName: "Secret",
      email: "secret@example.test",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await handlePatientGet(service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      patientId: created.data.id,
    });
    expect(result.status).toBe(404);
    expect(JSON.stringify(result.body)).not.toContain("Secret");
    expect(JSON.stringify(result.body)).not.toContain("secret@example.test");
  });

  it("cross-tenant list does not include foreign patients", async () => {
    const { service } = harness();
    await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    await service.create(identity(STAFF_B), ORG_B, { ...SAMPLE, firstName: "Other" });
    const listA = await service.list(identity(STAFF_A), ORG_A);
    expect(listA.ok).toBe(true);
    if (!listA.ok) return;
    expect(listA.data).toHaveLength(1);
    expect(listA.data[0]?.firstName).toBe("Ada");
    expect(JSON.stringify(listA.data)).not.toContain("Other");
  });

  it("cross-tenant update is denied without leaking fields", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_B), ORG_B, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await handlePatientPatch(service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      patientId: created.data.id,
      body: { firstName: "Hacked" },
    });
    expect(result.status).toBe(404);
    expect(JSON.stringify(result.body)).not.toContain("Ada");
    expect(JSON.stringify(result.body)).not.toContain("Hacked");
  });

  it("authenticated user without membership cannot create", async () => {
    const { service } = harness();
    await expect(service.create(identity(NO_MEMBER), ORG_A, SAMPLE)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("revoked membership cannot read patients", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(service.get(identity(REVOKED), ORG_A, created.data.id)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("disabled user cannot create patients", async () => {
    const { service } = harness();
    await expect(service.create(identity(DISABLED), ORG_A, SAMPLE)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("PATIENT role cannot use tenant patient APIs (no self-access in M3)", async () => {
    const { service } = harness();
    await expect(service.create(identity(PATIENT_ROLE), ORG_A, SAMPLE)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("STAFF cannot archive; PRACTICE_ADMIN can", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      service.update(identity(STAFF_A), ORG_A, created.data.id, { status: "inactive" }),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    const archived = await service.update(identity(ADMIN_A), ORG_A, created.data.id, {
      status: "inactive",
    });
    expect(archived).toMatchObject({ ok: true, data: { status: "inactive" } });
  });

  it("SYSTEM_ADMIN without membership cannot access patients", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      service.get(identity(PLATFORM_ADMIN), ORG_A, created.data.id),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("malformed patient id is invalid", async () => {
    const { service } = harness();
    await expect(service.get(identity(STAFF_A), ORG_A, "   ")).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("nonexistent patient in the authorized org is not found", async () => {
    const { service } = harness();
    await expect(service.get(identity(STAFF_A), ORG_A, "missing")).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("repository failure fails closed", async () => {
    const { service, patients } = harness();
    patients.failLookups = true;
    await expect(service.list(identity(STAFF_A), ORG_A)).resolves.toMatchObject({
      ok: false,
      status: 503,
      error: "unavailable",
    });
  });

  it("authorization lookup failure fails closed", async () => {
    const { service, directory } = harness();
    directory.failLookups = true;
    await expect(service.create(identity(STAFF_A), ORG_A, SAMPLE)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("update cannot change organization ownership", async () => {
    const { service } = harness();
    const created = await service.create(identity(STAFF_A), ORG_A, SAMPLE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await handlePatientPatch(service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      patientId: created.data.id,
      body: { organizationId: ORG_B, firstName: "Ada" },
    });
    expect(result.status).toBe(400);
  });

  it("HTTP create requires a session", async () => {
    const { service } = harness();
    const result = await handlePatientCreate(service, {
      identity: null,
      organizationId: ORG_A,
      body: SAMPLE,
    });
    expect(result.status).toBe(401);
  });

  it("HTTP list after create stays tenant-scoped", async () => {
    const { service } = harness();
    await handlePatientCreate(service, {
      identity: identity(STAFF_A),
      organizationId: ORG_A,
      body: SAMPLE,
    });
    const list = await handlePatientList(service, {
      identity: identity(STAFF_B),
      organizationId: ORG_B,
    });
    expect(list.status).toBe(200);
    expect(list.body.patients).toEqual([]);
  });
});

describe("M3 schema constraints", () => {
  it("adds patients with restrictive organization FK and no cascade", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        "packages/db/prisma/migrations/20260814190000_m3_patient_identity/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "patients"');
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).toContain("patients_status_check");
    expect(sql).toContain("patient.create");
    expect(sql).not.toContain("perm_patient_read_self");
    expect(sql).not.toContain("role_system_admin");
  });
});
