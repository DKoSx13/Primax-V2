/** Explicit original operations; concrete compatibility types supplied at composition. */
export interface AccountAdministrationArguments {
  pending: unknown[];
  createAdministrativeAccount: unknown[];
  approve: unknown[];
  setStatus: unknown[];
}
export interface AccountAdministrationViews {
  pending: unknown;
  createAdministrativeAccount: unknown;
  approve: unknown;
  setStatus: unknown;
}
export interface AccountAdministrationPort<I extends AccountAdministrationArguments, V extends AccountAdministrationViews> {
  pending(...args: I['pending']): Promise<V['pending']>;
  createAdministrativeAccount(...args: I['createAdministrativeAccount']): Promise<V['createAdministrativeAccount']>;
  approve(...args: I['approve']): Promise<V['approve']>;
  setStatus(...args: I['setStatus']): Promise<V['setStatus']>;
}
