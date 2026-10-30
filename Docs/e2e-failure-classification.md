# Clasificación de fallos E2E heredados

Fecha: 2026-10-30. Entorno: PostgreSQL y Redis locales aislados; sin staging. Los conteos iniciales del barrido general fueron **17 suites: 3 pasaron, 9 fallaron, 5 omitidas; 291 casos: 134 pasaron, 124 fallaron, 33 omitidos**. Un barrido con una sola URL mezcla fallos funcionales con bases de prueba que exigen nombres/puertos distintos. Las pruebas no se desactivan para ocultar fallos.

## Actualización: fixtures técnicos de ventas

Los 84 fallos registrados abajo fueron el estado **anterior** a esta adaptación. Un helper exclusivo de test (`Backend/test/technical-sale-fixture.ts`) prepara Supervisor, turno, surtidor, terminal, credencial y operación técnica persistidos por `operationId`. Las tres suites identifican las peticiones como procedentes del gateway mediante un proveedor simulado, siguiendo el patrón de `partial-refund.e2e-spec.ts`; `AccessGuard` sigue verificando credencial y operación reales. `recorded-purchase.ts` admite este modo técnico sin cambiar a sus otros consumidores. La comprobación nueva en `api.e2e-spec.ts` confirma que la clave Kiosk directa sola continúa devolviendo 403. La firma HMAC, sesión y CSRF del gateway conservan su cobertura dedicada en las suites Kiosk/Phase 1A; no se cambió código productivo.

Resultados individuales tras adaptar fixtures: `api.e2e-spec.ts` **60/60**, `v9.e2e-spec.ts` **37/37**, `prepaid-guest.e2e-spec.ts` **12/12**. En V9 permanecen las aserciones financieras vigentes; solo se sustituyó el transporte de venta heredado. Barrido conjunto con bases locales requeridas: **16/16 suites y 282/282 casos**; conciliación de inventario en su base dedicada: **1/1 suite y 10/10 casos**. Total: **17/17 suites y 292/292 casos, 0 fallos y 0 skips**. El caso adicional respecto a los 291 iniciales es la comprobación explícita de que la clave Kiosk directa recibe 403.

## Decisiones por causa

| Suite/grupo | Clasificación | Causa y decisión |
| --- | --- | --- |
| `registration.e2e-spec.ts` | A. Test obsoleto | Aserciones `PRIM001` y regex sin guion eran anteriores al formatter ejecutable V12.1 (`PRIM-001`). Se ajustaron expectativas; 57/57 pasan. El formato futuro `PRIME-...` pertenece a otro incremento SDD. |
| `auth-recovery.e2e-spec.ts` | A. Test obsoleto | Esperaba 400 al deshabilitar correo. `PasswordResetService.forgot` lanza 503 y la referencia V12.1 exige indisponibilidad explícita. Se ajustó esa expectativa; la suite pasa. |
| `partial-refund.e2e-spec.ts` | B. Fixture de venta anterior | El setup intentaba autorizar con `x-kiosk-key` directo y recibía 403 antes de ejercitar el reembolso. Se adaptó el fixture a Supervisor, turno, terminal, credencial y operación técnica. El gateway queda simulado solo en esta suite financiera; AccessGuard valida el vínculo técnico real. Resultado: 7/7 pasan. No se encontró inconsistencia financiera. |
| `critical-integrity.spec.ts` | B. Fixture de servicio anterior | Faltaba `onlineOrder.updateMany` en el repositorio simulado. Se añadió respuesta de cero filas y aserción de una llamada; mantiene las verificaciones de pago persistido, idempotencia y cierre. Suite y Jest completos pasan. |
| `incidents`, `v11_2-demo`, `inventory-reconciliation`, `inventory-foundations`, Control y Phase 1A | B. Entorno de bases dedicadas | Cada grupo requiere nombre/puerto/variable local propios. Pasan con bases locales migradas, sin cambiar Backend. |
| `api.e2e-spec.ts`, `v9.e2e-spec.ts`, `prepaid-guest.e2e-spec.ts` | B. Fixture de venta y expectativas de seguridad heredadas | Casos de venta llaman `x-kiosk-key` directa, prohibida por `SUP-002` V12.1. HTTP 403 es correcto. Las aserciones financieras no llegan a ejecutarse. Los casos en cascada dependen de ventas/datos no creados. Requieren adaptar sus fixtures al protocolo técnico vigente o reemplazar selectivamente casos redundantes con cobertura equivalente. No se relaja AccessGuard. |

No hay **C. Bug real** confirmado en reembolso ni en la autorización Kiosk. Las tres suites históricas ya ejecutan sus aserciones financieras con el fixture técnico actualizado; la lista de casos abajo conserva la trazabilidad de los fallos anteriores. El contrato técnico vigente está en `Specs/V12.1-reference/02-supervisor-terminal.md` (`SUP-002`): una venta nueva requiere credencial y operación técnica; la clave directa no crea autorizaciones ni transacciones.

El barrido intermedio, antes de adaptar los fixtures de venta, había dado 13 suites con destinos correctos **173/173**, conciliación **10/10** y tres suites históricas con **24 aprobados y 84 fallidos**. La tabla final de arriba sustituye ese estado intermedio.

## Casos fallidos de suites históricas, barrido individual

Cada caso de la lista se clasifica **B: fixture de venta anterior**. Cuando el caso describe una respuesta HTTP previa a la autenticación técnica (por ejemplo, esperar 400/409 de validación financiera usando solo la clave), esa expectativa concreta también es **A: obsoleta** para una solicitud no autorizada. Los casos de canje/historial que fallan después son **B: cascada**, por datos que la venta previa no creó. Se conserva el nombre exacto del caso para localizarlo.

### api.e2e-spec.ts (47)

- ABC-123 → S/100 → +100 → historial de PRIME-0001
- reintentos simultáneos no duplican compra, pago ni puntos
- dos solicitudes nuevas simultáneas con mismo UUID crean una sola compra
- UUID reutilizado con otro monto devuelve 409
- rechaza monto inválido 0 sin efectos
- rechaza monto inválido -1 sin efectos
- rechaza monto inválido 1.001 sin efectos
- rechaza monto inválido 100 sin efectos
- rechaza monto inválido 1000000 sin efectos
- rechaza estado arbitrario y campos adicionales
- prepago libre conserva placa y combustible inexistente no produce escrituras parciales
- rollback del cierre conserva el pago previo si falla el movimiento en PostgreSQL
- prepago sin membresía registra pago con cero puntos; postpago se rechaza
- dos canjes concurrentes no gastan dos veces el saldo disponible
- reintentar canje devuelve cupón previo sin nuevo débito
- reserva postpago descuenta el saldo y lo deja comprometido
- RECHUZA reserva con código de membresía de otro vehículo
- RECHUZA reserva sin saldo suficiente y no compromete nada
- postpago consume lo real y libera el excedente de la reserva
- postpago que consume menos de lo reservado devuelve el excedente
- progress repetido aplica el total una vez y devuelve el estado persistido
- postpago sin autorización previa se rechaza
- liberar una reserva devuelve el importe y evita el doble cobro
- PREPAGO con medio externo nunca altera el saldo
- prepago parcial con reembolso externo pendiente cierra inventario y deja conciliación financiera
- PREPAGO con SALDO_PRIME se rechaza: no se cobra a la membresía
- rechaza importe que no corresponde al volumen despachado
- rechaza código de membresía incoherente con la placa
- Detener cobra solo lo consumido y libera el excedente
- el avance nunca supera el importe reservado
- Detener antes de despachar libera la reserva íntegra
- rechaza confirmar un consumo por encima de lo reservado
- no liquida la misma reserva dos veces
- con una reserva abierta el disponible baja y el total se mantiene
- las reservas antiguas se listan sin liberarlas
- recargar con la autorización ya liquidada recupera el comprobante sin cobrar dos veces
- recargar con la reserva liberada no reenvía y permite una operación nueva
- el avance no cobra: solo la confirmación registra la transacción
- otro socio no puede consultar la compra, placa ni puntos de Diego
- V10: S/8.99 persists 0 points and an exact divisor
- V10: S/9.00 persists 1 points and an exact divisor
- V10: S/17.99 persists 1 points and an exact divisor
- V10: S/18.00 persists 2 points and an exact divisor
- V10: S/89.99 persists 9 points and an exact divisor
- V10: S/90.00 persists 10 points and an exact divisor
- V10: S/100.00 persists 11 points and an exact divisor
- V10: concurrent purchase and retry award exactly ten points once

### v9.e2e-spec.ts (25)

- critical: prepago persists payment before authorization and rejects manipulated closure
- critical: persisted PENDING payment never authorizes, including retries
- critical: persisted REJECTED payment never authorizes, including retries
- critical: intervention persists progress and blocks automation and closure
- E2E principal: Diego 5 - 12.60 => deuda 7.60; recarga 20 => saldo 12.40
- Ya recargue rechecks PostgreSQL: insufficient, still insufficient, then sufficient with same operationId
- explicit debt after rejection reuses operationId, covers only missing money and settles FIFO
- saldo suficiente conserva PAID/CAPTURED y no crea deuda
- insuficiente sin consentimiento: rechazo sin movimientos
- saldo cero: Payment PENDING, no saldo negativo
- límite exacto permitido
- sobre límite rechazado
- deuda existente cuenta para el límite
- reservas de crédito concurrentes no exceden límite
- liberar crédito devuelve solo el efectivo reservado
- consumo menor que efectivo reservado no genera deuda
- recarga 3 liquida correctamente
- recarga 7.60 liquida correctamente
- recarga 20 liquida correctamente
- FIFO entre varias deudas y ledger por aplicación
- recarga concurrente idempotente
- compra concurrente idempotente: una deuda
- snapshot BOLETA permanece tras editar perfil
- snapshot FACTURA permanece tras editar perfil
- comprobante manual y guardado explícito del perfil

### prepaid-guest.e2e-spec.ts (12)

- known plate links its membership, keeps points and one reward movement
- manual unknown plate is normalized, saved and creates no account, vehicle or points
- unknown plate authorization and closure are idempotent under concurrent retries
- rejects invalid plate "" before charging
- rejects invalid plate "BAD" before charging
- rejects invalid plate "ABC-12" before charging
- rejects invalid plate "ABC-1234" before charging
- PENDING payment never creates a fuel authorization even for unknown plates
- REJECTED payment never creates a fuel authorization even for unknown plates
- unknown plate still cannot use POSTPAGO
- cannot substitute a different unknown plate during closure
- registration during dispensing cannot retroactively grant membership points

