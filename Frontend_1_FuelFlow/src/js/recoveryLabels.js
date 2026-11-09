const labels = {
  operation: { ACTIVE: 'Activa', CLOSED: 'Cerrada' },
  order: { PENDING: 'Pendiente', CANCELLED: 'Cancelada', CAPTURED: 'Pago confirmado', FAILED: 'Fallida' },
  payment: { PENDING: 'Pendiente', CANCELLED: 'Cancelado', CAPTURED: 'Pago confirmado', REJECTED: 'Rechazado' },
  authorization: { SETTLED: 'Liquidada', RELEASED: 'Liberada', RESERVED: 'Reservada' },
  reservation: { PENDING_PAYMENT: 'Pago pendiente', CANCELLED: 'Cancelada', CLOSED: 'Cerrada', ACTIVE: 'Activa', REVIEW: 'En revisión' },
  sale: { PAID: 'Pagada', REFUNDED: 'Reembolsada', PENDING: 'Pendiente' },
};

export function recoveryStatusLabel(kind, value) {
  if (!value) return '—';
  return labels[kind]?.[value] || 'Estado por revisar';
}
