# Integración controlada de recuperación en `primax-feria-check`

Fecha: 9 de noviembre de 2026. Rama: `qa/feria-integration`. No hubo commit ni push.

## Respaldo y protección de datos

- Respaldo nuevo: `/home/primax/Backups/primax-feria-check/20261109-pre-rebuild.dump`, fuera de `/tmp`, modo `600`, 249425 bytes.
- SHA-256: `474791a29d48cbcb479d54fe7c98c5ea13532448b9a3d9dac8343845de51162b`.
- `pg_restore --list` y extracción íntegra con `pg_restore --file=/dev/null` terminaron sin errores. No se hizo restauración sobre la base del laboratorio.
- PostgreSQL y Redis conservaron sus contenedores y volúmenes originales. `_prisma_migrations` tenía 36 filas finalizadas antes y después; no se ejecutaron migrate, seed ni servicios de inicialización.

## Reconstrucción

Se construyeron seis imágenes: la imagen compartida `primax-feria-check-domain:demo` del Backend, ambos gateways FuelFlow, ambos frontends FuelFlow y `frontend3` Control. Se recrearon ocho servicios con `up -d --no-deps --no-build`: `identity-service`, `commerce-service`, `administration-service`, `fuelflow-gateway`, `fuelflow-gateway-t02`, `frontend1`, `fuelflow-t02` y `frontend3`. Control requirió una recreación explícita porque Compose había conservado inicialmente su contenedor anterior. El API Gateway `backend`, Catalog, Prime, Print, OCR, PostgreSQL y Redis no se recrearon.

Las dependencias de `identity-service` incluyen los servicios separados `migrate`, `seed`, `seed-control-admin` y `seed-operations`; `--no-deps` evitó iniciarlos. El Dockerfile del Backend ejecuta `prisma generate` y `npm run build` al construir, sin migración ni seed. Los comandos de aplicación son procesos `node`.

## Validación

- Los 15 servicios del proyecto están saludables. API Gateway `/api/v1/health` devolvió `status: ok` y todos sus dominios `up`.
- Identity, Commerce, Administration, ambos gateways FuelFlow y los tres frontends reconstruidos respondieron `200` en sus health checks.
- HTTP: solicitud anónima de código a Commerce `401`; cuerpo inválido en la ruta nueva de Identity `400`; código inexistente enviado a cada gateway FuelFlow `401`. Se imprimieron solo estados HTTP, sin códigos, tokens ni cookies.
- Backend: 30 suites y 245 pruebas pasaron antes de la reconstrucción. Se añadió una prueba de expiración del código y las 11 pruebas específicas de recuperación pasaron después. El gateway pasó 19 pruebas. `git diff --check` pasó.
- Los IDs de imagen en ejecución coinciden con las seis imágenes nuevas. Esto y las respuestas de las rutas nuevas confirman que el código está activo.

## Estado financiero y límite de la validación

`OP01-0012` continúa `ACTIVE` en T02/surtidor 04: orden Yape S/ 12 `PENDING`, pago `PENDING`, reserva `PENDING_PAYMENT`, sin autorización ni venta; evento del proveedor DEMO `DEMO_PENDING`. `OP01-0013` continúa `ACTIVE` en T01/surtidor 03: orden y pago `CAPTURED`, autorización `SETTLED`, reserva `CLOSED`, venta `PAID`, comprobante `EB01-0008`; eventos DEMO `DEMO_PAID` y `CAPTURED`. Hay cero eventos de auditoría de recuperación en el laboratorio: no se ha solicitado ni canjeado ningún código real.

No había una sesión auténtica de `SUPER_ADMIN` disponible para el cliente HTTP de esta ejecución. No se usaron contraseñas fijas o de demostración para sustituir esa autorización. Por ello siguen pendientes las comprobaciones HTTP autenticadas: emisión de código, rechazo de código de otra terminal, canje real, revocación de credenciales anteriores, alcance de pestaña/operación y auditoría correspondiente. La cobertura automatizada local sí prueba estos casos, pero no equivale al E2E autenticado del laboratorio.

## Secuencia pendiente

Con una sesión legítima de `SUPER_ADMIN`, repetir lectura de estados, solicitar un código por operación con justificación y canjearlo solo en el gateway correcto (T02 `:27184`, T01 `:27181`), cada uno con un UUID de pestaña diferente. No mostrar ni registrar códigos o cookies. Comprobar la evidencia devuelta por Backend y los eventos de auditoría. Después de revisar el plan financiero con el usuario: para OP01-0012, cancelar exclusivamente la orden Yape pendiente por el flujo existente, verificar orden/pago/reserva `CANCELLED` y ausencia de venta/autorización, y cerrar la atención. Para OP01-0013, conservar cobro, venta y comprobante y cerrar solo la atención. Tras ambos cierres y nueva lectura de Control/Prime, ejecutar la prueba final de dos pestañas y ventas simultáneas en T01/T02; aún no se han creado ventas nuevas.
