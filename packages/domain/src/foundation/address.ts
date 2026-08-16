export const ADDRESS_TYPES = ["HOME", "WORK", "BILLING", "OTHER"] as const;

export type AddressType = (typeof ADDRESS_TYPES)[number];

export function isAddressType(value: string): value is AddressType {
  return (ADDRESS_TYPES as readonly string[]).includes(value);
}

/**
 * Shared address entity (TDA-ADR-004 §3.5).
 * Associated with Patient / Practitioner via ownership tables — not duplicated on User.
 */
export interface Address {
  readonly id: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state?: string;
  readonly postalCode: string;
  readonly country: string;
  readonly type: AddressType;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AddressCreateInput {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state?: string;
  readonly postalCode: string;
  readonly country: string;
  readonly type: AddressType;
}
