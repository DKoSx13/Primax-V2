// Exact display of Prisma decimal strings; do not coerce financial/inventory values to Number.
const kinds = { OPENING_BALANCE:'Saldo inicial', RESERVE:'Reserva', DISPENSE:'Despacho', LEGACY_DISPENSE:'Despacho histórico', RELEASE:'Liberación de reserva', ADJUST_IN:'Ajuste de entrada', ADJUST_OUT:'Ajuste de salida' };
export const movementKindLabel = kind => kinds[kind] || (kind ? `Movimiento desconocido (${kind})` : 'Sin tipo');
export function formatLiters(value) {
  if (value == null) return '—';
  const raw = String(value);
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return raw;
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return match[1] + grouped + (match[3] === undefined ? '' : ',' + match[3]);
}
