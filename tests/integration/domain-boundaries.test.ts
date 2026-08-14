import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_BOUNDARY,
  DOMAIN_BOUNDARIES,
  FOUNDATION_BOUNDARY,
  NOTIFICATION_BOUNDARY,
  PATIENT_BOUNDARY,
} from "@dentalcare/domain";

describe("domain boundaries", () => {
  it("reserves the mandatory M0 module boundaries", () => {
    expect(DOMAIN_BOUNDARIES).toEqual([
      FOUNDATION_BOUNDARY,
      PATIENT_BOUNDARY,
      APPOINTMENT_BOUNDARY,
      NOTIFICATION_BOUNDARY,
    ]);
  });
});
