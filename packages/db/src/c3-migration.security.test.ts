import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "packages/db/prisma/migrations/20260815220000_c3_otp_identity_registration/migration.sql",
);

describe("C3 migration safety", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("is additive and does not drop M3–M7 tables", () => {
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).toContain('ALTER TABLE "practitioners" ADD COLUMN "verificationStatus"');
    expect(sql).toContain('CREATE TABLE "organization_invitations"');
    expect(sql).toContain('CREATE TABLE "auth_otp_challenges"');
    expect(sql).toContain('CREATE TABLE "patient_user_links"');
    expect(sql).toContain('CREATE TABLE "addresses"');
    expect(sql).toContain('CREATE TABLE "clinic_codes"');
    expect(sql).toContain('CREATE TABLE "registration_sessions"');
  });

  it("backfills existing practitioners as verified and seeds invite permissions", () => {
    expect(sql).toContain(`UPDATE "practitioners" SET "verificationStatus" = 'verified'`);
    expect(sql).toContain("invitation.patient.create");
    expect(sql).toContain("invitation.practitioner.create");
    expect(sql).toContain("practitioner.verify");
    expect(sql).toContain("('role_staff', 'perm_invitation_patient_create')");
    expect(sql).not.toContain("('role_system_admin', 'perm_invitation");
  });

  it("stores invitation and OTP secrets as hashes only", () => {
    expect(sql).toContain('"tokenHash"');
    expect(sql).toContain('"codeHash"');
    expect(sql).toContain('"codeSalt"');
    expect(sql).not.toContain('"plaintextOtp"');
    expect(sql).not.toContain('"tokenPlaintext"');
  });
});
