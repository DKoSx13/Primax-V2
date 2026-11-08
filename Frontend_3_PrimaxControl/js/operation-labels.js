// Presentation only. API filters and persisted enum values remain unchanged.
const operational = {
  ACTIVE: 'Activa', CLOSED: 'Cerrada', INTERVENTION_REQUIRED: 'Requiere intervención',
  RESERVED: 'Reservada', DISPENSING: 'Abasteciendo', SETTLED: 'Liquidada', RELEASED: 'Reserva liberada',
  PAID: 'Pagada', REFUNDED: 'Reembolsada', PAYMENT_PENDING: 'Pago pendiente',
};
const financial = {
  PAYMENT_PENDING: 'Pago pendiente', PAID: 'Pagada', REFUNDED: 'Reembolsada',
  PENDING: 'Pendiente', PARTIAL: 'Pago parcial', CAPTURED: 'Confirmado',
  REJECTED: 'Rechazado', ERROR: 'Error de pago', CANCELLED: 'Cancelado',
};
export const operationStatusLabel = value => operational[value] || (value ? `Estado desconocido (${value})` : 'Sin estado');
export const operationFinancialLabel = value => financial[value] || (value ? 'Estado financiero por revisar' : 'Sin estado financiero');
