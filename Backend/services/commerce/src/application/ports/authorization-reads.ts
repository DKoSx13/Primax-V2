export interface AuthorizationReadsViews { status: unknown; pendingBefore: unknown }
export interface AuthorizationReadsPort<V extends AuthorizationReadsViews> {
  status(id: string): Promise<V['status']>;
  pendingBefore(minutes: number): Promise<V['pendingBefore']>;
}
export const AUTHORIZATION_READS = Symbol('commerce.authorization-reads');
