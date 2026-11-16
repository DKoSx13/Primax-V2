/** Existing HTTP actor contract. Token metadata is deliberately kept separate. */
export type Actor =
  | { kind: 'member'; userId: string }
  | { kind: 'admin'; adminUser: string }
  | {
      kind: 'control';
      userId: string;
      role: string;
      permissions: string[];
      stationIds: string[];
      global: boolean;
    }
  | {
      kind: 'terminal';
      terminalId: string;
      stationId: string;
      credentialId: string;
      recoveredOperationId?: string;
    }
  | { kind: 'kiosk'; stationId?: string };

export class IdentityError extends Error {
  constructor(
    public readonly code:
      | 'invalid-input'
      | 'unauthorized'
      | 'forbidden'
      | 'not-found',
    message: string,
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}

export interface Account {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  active: boolean;
  authVersion: number;
}

export interface Claims {
  sub?: string;
  ver?: number;
  exp?: number;
}
export interface ControlAccess {
  systemAdmin: boolean;
  approved: boolean;
  emailVerified: boolean;
  role: string;
  /** Only unrevoked grants and active, unended station assignments. */
  permissions: string[];
  stationIds: string[];
}

/** Frozen from AccessGuard; roles alone never confer permissions. */
export const SYSTEM_CONTROL_PERMISSIONS = [
  'ADMIN_CONTROL_ACCESS',
  'ADMIN_DASHBOARD_VIEW',
  'ADMIN_INCIDENT_VIEW',
  'ADMIN_INCIDENT_MANAGE',
  'ADMIN_INVENTORY_VIEW',
  'ADMIN_OPERATION_VIEW',
  'ADMIN_USER_MANAGE',
  'ADMIN_STATION_MANAGE',
  'ADMIN_AUDIT_VIEW',
  'ADMIN_TERMINAL_VIEW',
  'ADMIN_TERMINAL_MANAGE',
  'ADMIN_INVENTORY_RECEIVE',
  'ADMIN_INVENTORY_MOVEMENT_VIEW',
  'ADMIN_INVENTORY_RECONCILE',
  'ADMIN_CUSTOMER_VIEW',
  'ADMIN_MEMBERSHIP_VIEW',
  'ADMIN_VEHICLE_VIEW',
  'ADMIN_TRANSACTION_VIEW',
  'ADMIN_RECEIPT_VIEW',
] as const;

export interface MembershipProfile {
  id: string;
  userId: string;
  number: string;
  status: string;
  name: string;
  email: string;
}
export interface MembershipFinance {
  balance: string;
  reserved: string;
  available: string;
  total: string;
  pendingBalance: string;
  points: number;
}
