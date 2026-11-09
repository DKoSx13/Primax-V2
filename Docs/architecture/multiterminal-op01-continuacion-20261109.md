# Primax V2: continuación multterminal y OP01 (9 de noviembre de 2026)

## Estado inicial y alcance

La rama es `qa/feria-integration`; EcoDigital está en `a4455cc`. Se conservaron todos los cambios locales. Las migraciones `20261109000000_operation_number_op01` y `20261109010000_active_pump_exclusion` figuran finalizadas en `_prisma_migrations` del único PostgreSQL de `primax-feria-check`. No se volvieron a ejecutar. Los respaldos verificados antes de su primera aplicación son `/tmp/primax-feria-check-pre-op01-20261109.dump` y `/tmp/primax-feria-check-pre-pump-20261109.dump`.

La numeración `OP01` procede de secuencia y función PostgreSQL, se asigna al abrir `TerminalOperation`, tiene índice único y no se reutiliza. El backfill ordenó las operaciones antiguas de modo determinista, sin atribuir fecha histórica al correlativo. `EB01` y `FT01` siguen independientes. La restricción parcial `TerminalOperation_one_active_pump` impide dos atenciones activas en el mismo surtidor. Las reglas de reserva de inventario y de idempotencia de venta permanecen en Backend.

T01 (`PRIMAX-SUR-T01`, surtidor 03, puerto 27181) y T02 (`PRIMAX-SUR-T02`, surtidor 04, puerto 27184) usan credenciales de terminal y cookies con sufijo de puerto. Ambos gateways usan el mismo Backend, Redis y PostgreSQL. El código de terminal es configuración del gateway y no parámetro elegido por el navegador. Control muestra `OP01`, terminal y surtidor, conserva UUID y filtra por estación, terminal, surtidor, estado, modalidad y fechas con autorización del Backend. Prime conserva el aislamiento por cliente.

## Causa de la incidencia de dos pestañas

`fuelflow:operation:v1` se guarda en `localStorage`, compartido entre pestañas del mismo origen, mientras cada pestaña mantiene su propio estado de venta en memoria. Antes de esta corrección no existía propiedad exclusiva de pestaña: ambas podían usar el mismo `operationId`. El Backend rechazó correctamente una solicitud con ese UUID y datos diferentes. Además, el identificador de la orden QR no se guardaba inmediatamente en la instantánea local; una recarga podía dejar el pago pendiente en Backend sin el dato necesario para recuperarlo. El mensaje «Orden conservada» procede del rechazo de la reelección de método; sin la traza HTTP original no se puede atribuir su código de respuesta exacto.

## Corrección local pendiente de despliegue al laboratorio

- Web Locks serializa las pestañas del mismo origen antes del bootstrap y muestra «Terminal en uso» a la segunda. Un ID de pestaña en `sessionStorage` se incluye en cada petición del gateway y en su firma HMAC.
- `POST /terminal/claim` fija en Redis el propietario de la terminal, bajo el bloqueo de fila PostgreSQL. Otra pestaña o perfil recibe conflicto incluso si la terminal está vacía. La propiedad se renueva al consultar la terminal y al operar; vence después de 120 segundos sin actividad. Una atención abandonada solo se puede reclamar con el mismo UUID si Backend confirma ausencia de venta, pago, orden, autorización, reserva e incidencia. Una atención con evidencia requiere la sesión original o intervención autorizada.
- La apertura de operación exige la propiedad del Backend. Las escrituras financieras del gateway comprueban la misma propiedad, sin cambiar las claves de idempotencia. Las operaciones antiguas en curso conservan la vía de cierre existente cuando todavía no hay propietario Redis.
- FuelFlow guarda el ID de orden QR al recibirla, consulta la misma orden tras recargar y bloquea estados inciertos antes de otro pago. No reemplaza una instantánea local que contenga orden QR.
- La identidad visible de FuelFlow y del comprobante usa el código de terminal y surtidor confirmados por Backend. Se retiró «Kiosco 01» fijo; cada idioma conserva su etiqueta.

## Evidencia y límites

Antes de la incidencia se ejecutaron dos ventas simultáneas en el laboratorio: T02 `OP01-0006`/`EB01-0007` y T01 `OP01-0008`/`EB01-0006`, visibles en Control y en las respectivas cuentas Prime. Se verificó inventario común, cookies de distinto puerto, persistencia tras reinicio y una prueba de contención de inventario sobre una restauración aislada. Estas pruebas **preceden** a la corrección de dos pestañas.

Después de la corrección pasaron: Backend 235 pruebas unitarias, FuelFlow 160, Prime 31, Control 35; builds de Backend y los tres frontends; `git diff --check`. Los tests nuevos cubren propiedad de pestaña en Backend, firma de gateway y conservación de una orden QR. No hay navegador automatizado disponible en este entorno. No se reconstruyeron ni reiniciaron los contenedores con este código nuevo.

La consulta actual de la base confirma `OP01-0012` en T02 y `OP01-0013` en T01 activas, cada una con un pago, una orden y una reserva. Se conservaron. Por ello la prueba E2E de dos pestañas y la repetición de ventas simultáneas con el código corregido **no están aprobadas**. Antes de usar el laboratorio para ventas nuevas, conciliar esas dos operaciones mediante los flujos autorizados y comprobar su resultado financiero y de inventario. No borrar almacenamiento del navegador ni cerrar operaciones pendientes por conveniencia.

## Reconstrucción controlada del laboratorio

Después de conciliar `OP01-0012` y `OP01-0013`, desde la raíz del repositorio, reconstruir solo los servicios afectados. Estos comandos no ejecutan migraciones ni seeds y `--no-deps` evita reiniciar PostgreSQL, Redis y otros contenedores:

```bash
export BACKEND_PORT=27100 FRONTEND1_PORT=27181 FRONTEND1_T02_PORT=27184 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183
docker compose -p primax-feria-check -f compose.yaml build identity-service commerce-service administration-service fuelflow-gateway fuelflow-gateway-t02 frontend1 fuelflow-t02 frontend3
docker compose -p primax-feria-check -f compose.yaml up -d --no-deps identity-service commerce-service administration-service fuelflow-gateway fuelflow-gateway-t02 frontend1 fuelflow-t02 frontend3
```

Verificar que la configuración efectiva conserva los secretos y puertos del laboratorio antes del `up`; si se usó un archivo de entorno externo, añadir `--env-file` con ese mismo archivo a ambos comandos. No ejecutar `down -v`.

## Acoplamientos y evolución

La asignación `OP01` y la exclusión de surtidor viven en Commerce/PostgreSQL; Identity administra credenciales y Redis, Administration consulta operaciones y aplica permisos. Los dominios aún comparten esquema y Prisma. Para una evolución gradual, extraer primero interfaces de repositorio y casos de uso de apertura/recuperación de operación, después contratos de lectura para Control y Prime; mantener las restricciones y transacciones en PostgreSQL hasta que exista un protocolo de consistencia probado. No se requieren nuevos servicios de mensajería para la feria.
