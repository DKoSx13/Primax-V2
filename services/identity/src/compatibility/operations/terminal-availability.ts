/** Historical administrative blocking no longer authorizes access to FuelFlow.
 * Actual intervention/out-of-service states, lifecycle and pump checks remain. */
export const acceptsNewAttention = (status: string) =>
  ['DISPONIBLE', 'BLOQUEADA'].includes(status);
