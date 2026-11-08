# Ajustes de Operaciones y layout de Control — 8 noviembre 2026

El merge sigue abierto en `qa/feria-integration`. Solo se modificó presentación frontend; no se cambiaron contratos, estados persistidos, migraciones ni reglas financieras.

El endpoint de Operaciones combina estados de TerminalOperation (`ACTIVE`, `INTERVENTION_REQUIRED`, `CLOSED`), FuelAuthorization (`RESERVED`, `DISPENSING`, `SETTLED`, `RELEASED`) y Transaction (`PAID`, `REFUNDED`, `PAYMENT_PENDING`). Las diez opciones conservan su `value` técnico, con diez etiquetas diferentes en español. El fallback de un estado desconocido incluye su código entre paréntesis.

Los movimientos usan los siete códigos de InventoryMovementKind: `OPENING_BALANCE` Saldo inicial, `RESERVE` Reserva, `DISPENSE` Despacho, `LEGACY_DISPENSE` Despacho histórico, `RELEASE` Liberación de reserva, `ADJUST_IN` Ajuste de entrada y `ADJUST_OUT` Ajuste de salida. El formato visual conserva el signo y todos los decimales recibidos como cadena, sin conversión a Number. Las tablas mantienen desplazamiento horizontal interno y columnas numéricas sin partición.

Las tarjetas de Operaciones muestran referencia técnica abreviada, badge y fecha en la cabecera; agrupan los demás datos sin inventar valores cuando son nulos. El detalle conserva el UUID completo y la acción de copia, y el comprobante muestra su número real. La sidebar estira su fondo azul con la altura de la fila grid/documento; solo la navegación permanece sticky en escritorio. En móvil vuelve al flujo normal.

Validación: 34 pruebas de Control aprobadas, build aprobado, sintaxis y `git diff --check` aprobados. No se contó con navegador automatizado, por lo que selector abierto, tabla y sidebar en páginas largas a 375/558/768/1366 px quedan pendientes de verificación visual. El laboratorio no se reconstruyó.
