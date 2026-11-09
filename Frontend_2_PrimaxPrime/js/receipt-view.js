import { escape as e, money } from './components.js';

// A read-only view of the receipt already issued by PostgreSQL.
export function digitalReceiptMarkup(transaction) {
  const receipt = transaction.receipt;
  if (!receipt?.id || !receipt.number) return '<p>Comprobante digital no disponible para este consumo.</p>';
  const issuedAt = receipt.issuedAt ? new Date(receipt.issuedAt) : null;
  const date = issuedAt && Number.isFinite(issuedAt.getTime())
    ? issuedAt.toLocaleString('es-PE')
    : 'Fecha no disponible';
  return `<section class="digital-receipt" aria-label="Comprobante digital académico"><span class="eco-digital-badge">EcoDigital · disponible en Prime</span><p>Comprobante académico de demostración · sin validez tributaria</p><dl><dt>Tipo</dt><dd>${e(receipt.documentType || 'Comprobante')}</dd><dt>Número</dt><dd>${e(receipt.number)}</dd><dt>Emitido</dt><dd>${e(date)}</dd><dt>Estación</dt><dd>${e(transaction.station)}</dd><dt>Vehículo</dt><dd>${e(transaction.vehicle)}</dd><dt>Combustible</dt><dd>${e(transaction.fuel || 'No disponible')}</dd><dt>Total registrado</dt><dd>${money(transaction.amount)}</dd></dl></section>`;
}
