import {
  Account,
  Claims,
  ControlAccess,
  MembershipFinance,
  MembershipProfile,
} from './domain';

export interface Accounts {
  byId(id: string): Promise<Account | null>;
  byEmail(email: string): Promise<Account | null>;
  byDni(dni: string): Promise<Account | null>;
}
export interface Passwords {
  compare(password: string, hash: string): Promise<boolean>;
}
export interface Tokens {
  sign(claims: { sub: string; ver: number }): Promise<string>;
  /** Adapter enforces signature, issuer, audience, algorithm and expiry. */
  verify(token: string): Promise<Claims>;
}
export interface Clock {
  nowSeconds(): number;
}
export interface Grants {
  forUser(userId: string): Promise<ControlAccess>;
}
export interface Revocations {
  /** Atomic increment, never read-then-write. Invalidates ALL user JWTs. */
  incrementAuthVersion(userId: string): Promise<void>;
}
export interface Sessions {
  /** Opaque session IDs; adapter owns hashing, storage and transport. */
  find(id: string): Promise<{ stationId: string; expiresAt: number } | null>;
  revoke(id: string): Promise<void>;
}
export interface Memberships {
  forUser(userId: string): Promise<MembershipProfile | null>;
}
/** Read-only Commerce projection. Identity never calculates or changes money. */
export interface CommerceMemberships {
  summary(membershipId: string): Promise<MembershipFinance>;
}
export interface Vehicles {
  /** Adapter must atomically enforce active membership and exclusive ownership. */
  link(userId: string, plate: string, label: string): Promise<void>;
}
/** Reserved boundaries, not a new recovery/OCR implementation. */
export interface RecoveryDelivery {
  send(email: string, code: string, expiresAt: Date): Promise<void>;
}
export interface VehicleRecognition {
  recognize(image: Uint8Array): Promise<string | null>;
}
