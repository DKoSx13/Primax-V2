/** Transport/actor tuples are supplied at composition and never interpreted here. */
export interface OperationalAdministrationArguments { grantAdmin: unknown[]; revokeAdminGrant: unknown[]; createPump: unknown[]; createTerminal: unknown[]; assignTerminal: unknown[]; endTerminalAssignment: unknown[]; revokeTerminal: unknown[] }
export interface OperationalAdministrationViews { grantAdmin: unknown; revokeAdminGrant: unknown; createPump: unknown; createTerminal: unknown; assignTerminal: unknown; endTerminalAssignment: unknown; revokeTerminal: unknown }
export interface OperationalAdministrationPort<I extends OperationalAdministrationArguments, V extends OperationalAdministrationViews> {
  grantAdmin(...args: I['grantAdmin']): Promise<V['grantAdmin']>;
  revokeAdminGrant(...args: I['revokeAdminGrant']): Promise<V['revokeAdminGrant']>;
  createPump(...args: I['createPump']): Promise<V['createPump']>;
  createTerminal(...args: I['createTerminal']): Promise<V['createTerminal']>;
  assignTerminal(...args: I['assignTerminal']): Promise<V['assignTerminal']>;
  endTerminalAssignment(...args: I['endTerminalAssignment']): Promise<V['endTerminalAssignment']>;
  revokeTerminal(...args: I['revokeTerminal']): Promise<V['revokeTerminal']>;
}
export const OPERATIONAL_ADMINISTRATION = Symbol('commerce.operational-administration');
