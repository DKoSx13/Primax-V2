# Lote 5 · Validación del 20 de noviembre de 2026

**Abierto para revisión de reembolsos y atribución de tres aserciones históricas.** La continuación CAPTURED pasó la validación financiera en Chromium, PostgreSQL 17.6 y Redis 7.4 con proveedor DEMO. Las pérdidas de respuesta se inyectaron después de recibir la respuesta del servidor.

## Recuperación y cambios

Rama inicial y final `feat/dezkz-identity-a4-core`, HEAD `cec1cafc56f770597e786c9182a0fb82c3bfc7d4`. Al reanudar esta ampliación había seis archivos preparados, cinco con modificaciones sin preparar y 32 sin seguimiento. La revisión anterior inventaría los archivos. Los nueve históricos de Stage 2B vuelven a coincidir, byte por byte, con los SHA-256 de `evidence/lot5-validation/resume-audit.json`. El índice conserva los seis archivos heredados. Sin commit, push, merge ni cambios a Prisma o migraciones.

| Archivos trabajados en esta ampliación | Cambio |
|---|---|
| `Backend/src/kiosk/kiosk.service.ts`, `Backend/src/auth/access.guard.ts` | Las acciones ordinarias de cancelación, confirmación DEMO, avance, liberación e intervención requieren credencial técnica. Se comprueban estación, terminal registrada, operación abierta, vínculo con el pago y, para la autorización, operación técnica, surtidor y asignación. Se admite repetir la intervención de la misma atención en intervención. La clave antigua por sí sola se rechaza. La cancelación excepcional conserva la comprobación del ticket. |
| `Backend/src/transactions/captured-continuation.ts` | El replay CAPTURED exige los cuatro vínculos técnicos persistidos de la autorización. Un vínculo ausente provoca rechazo. |
| `Frontend_1_FuelFlow/src/js/transactionsService.js` | El reintento explícito coteja la operación y los metadatos del pago con la petición guardada. Si cambia la operación durante la espera, se rechaza la respuesta antes de guardarla. |
| `Backend/src/kiosk/kiosk.spec.ts`, `Backend/src/kiosk/kiosk-http.spec.ts`, `Backend/src/payments/order-workflow.spec.ts`, `Backend/src/transactions/captured-continuation.spec.ts`, `Frontend_1_FuelFlow/tests/transactions.test.js` | Contratos defensivos de permiso, proveedor, escritura, replay y estado local. |
| Este informe y `Docs/astra/evidence/lot5-reanudacion-8a5e7c73ca37/` | Resultados nuevos y consultas de solo lectura. Los archivos temporales privados del laboratorio están en la caché ignorada. |

## Resultados actuales

- **621/621 Jest**, 61 suites. Incluye contratos HTTP con Nest y persistencia simulada. Ante una orden ajena de la misma estación, cancelación y confirmación reciben 403 con cero llamadas al doble del proveedor y cero transacciones financieras. La cancelación ordinaria propia llama una vez al proveedor simulado. La suite de recuperación comprueba el alcance del ticket. Las cinco acciones rechazan pagos de otra operación. El replay de autorización rechaza un evento vinculado a otro identificador. [Jest](evidence/lot5-reanudacion-8a5e7c73ca37/jest.json)
- **194/194 FuelFlow**, incluidas las 21 pruebas de recarga QR. La suite de paridad detectó inicialmente una incompatibilidad entre su lector de política y la ubicación de una nueva función. Se corrigió su ubicación y se repitió la suite completa. [FuelFlow](evidence/lot5-reanudacion-8a5e7c73ca37/fuelflow.txt)
- **E2E financiero**. Se creó una red interna con cero tablas públicas y cero claves iniciales. Se aplicaron las 36 migraciones existentes a una base nueva y se cargaron fixtures DEMO. Se usaron los gateways de FuelFlow, el backend Nest con su guarda real y dos terminales, en puertos de navegador loopback. Para concurrencia entre procesos se alternaron las peticiones entre dos instancias Nest con el mismo PostgreSQL y Redis. El servidor estático de laboratorio y el backend integrado difieren del despliegue Compose de servicios separados. [Destinos de las llamadas concurrentes](evidence/lot5-reanudacion-8a5e7c73ca37/replicas-puertos.txt)
- **Seis ventas DEMO, PEN 120**. Hubo dos ventas ordinarias independientes en T01 y T02 y cuatro continuaciones. Cada venta tiene una orden, un pago, una autorización, una reserva cerrada con remanente cero y un comprobante. Una séptima atención terminó vacía tras expirar su ocupación, sin filas financieras asociadas. La suma de los seis pagos capturados coincide con la de las seis ventas pagadas. [Totales](evidence/lot5-reanudacion-8a5e7c73ca37/cierre-totales.json) · [Vínculos por operación](evidence/lot5-reanudacion-8a5e7c73ca37/cierre-operaciones.json)
- **Última recuperación T02**, operación `e9a8ca80-41d4-42e9-9f73-6fca69cafdfe`. Dos continuaciones concurrentes en procesos distintos devolvieron `e0620c49-12ae-4bca-907d-e94a804f2580`. Una indicó replay. El reintento después de perder la respuesta también indicó replay. Dos cierres simultáneos devolvieron la misma venta `e8f216d5-78cd-48dc-9f2e-69e492a58cc0`. El pago original `908a27da-1216-4e67-97d7-0df48bed6a34` quedó vinculado a esa venta y al comprobante EB01-0007 mediante la venta. Reintentar el pago consumido antes del cierre técnico devolvió 409. Al quitar temporalmente el identificador de orden del almacenamiento local, FuelFlow pidió asistencia antes de emitir una petición financiera. Para probar el replay se restituyó la copia exacta del estado local del fixture. [Traza con consola y respuestas](evidence/lot5-reanudacion-8a5e7c73ca37/replicas-final.json)

## Playwright y consola

| Aserción histórica | Resultado atribuible |
|---|---|
| Unrelated authorization incorrectly replayed | En los contratos nuevos se rechazan el evento que referencia otra autorización y la petición guardada de otra operación. En navegador, ambas réplicas devolvieron el ID propio, que también consta en SQL. La aserción histórica carece de la pareja petición/respuesta y del ID esperado del fixture. Sigue abierta su atribución. |
| Continuation cannot create order | El contrato comprueba el 400 explícito de creación y reselección con metadatos de continuación antes de consultar órdenes o llamar al proveedor. El E2E confirma que la continuación legítima usa la ruta de autorizaciones. Falta el cuerpo de la llamada histórica para asignarle esa causa. |
| Order guard status 403 | En Nest con dobles se obtiene 403 al faltar la operación técnica del fixture y 400 con operación válida y DTO inválido. Los dos 403 históricos de creación de orden carecen del mensaje y contexto necesarios para identificar la guarda exacta. |

Los resultados históricos de 144 Jest y 21 QR están inventariados en el informe anterior. Se excluyeron de los recuentos actuales. Para atribuir los tres mensajes quedan pendientes el script de las aserciones o la traza original con método, cuerpo, respuesta, identificadores esperados y estación/terminal, sin tokens.

En las ejecuciones nuevas, los 404 de operación y vehículo corresponden a búsquedas iniciales de datos sintéticos inexistentes. Las respuestas de red perdidas se inyectaron en la captura y la autorización. El 409 posterior a la venta corresponde al rechazo esperado. El primer intento T01 agotó el tiempo por el selector de idioma superpuesto. Los reintentos prematuros en otra pestaña recibieron 409 por la ocupación vigente. Se esperó su expiración normal, y los recorridos ordinarios completaron ambas ventas. Hubo cuatro 404 de imágenes por la decodificación de espacios en el servidor estático de prueba. Tras corregirlo, las cuatro URL devolvieron 200 y dejaron de aparecer en la traza final. Cero excepciones JavaScript no controladas en esa traza. [Comprobación de imágenes](evidence/lot5-reanudacion-8a5e7c73ca37/assets.json)

## Hallazgo pendiente de autorización

Las dos rutas de reembolso aceptadas por la política ordinaria de kiosco comparten la comprobación por estación del recurso existente. La revisión estática identificó que falta cotejar la terminal titular de la operación antes de llegar al reembolso. En órdenes, el flujo puede persistir REFUNDING y llamar al proveedor. En pagos DEMO de efectivo o tarjeta puede modificar el pago y sus movimientos locales. No se probó una mutación ajena, no se ejecutaron reembolsos y no hay evidencia de explotación. Corregir estas rutas requiere decidir cómo acreditar titularidad para ventas ya cerradas y preservar los permisos de miembros. Se solicitó autorización aparte. Referencias: [permisos de kiosco](../../Backend/src/kiosk/kiosk.service.ts), [orden](../../Backend/src/payments/online-orders.ts) y [pago DEMO](../../Backend/src/payments/payment-lifecycle.ts).

## Reanudación

Docker Linux funcionó. Ninguna prueba financiera aquí enumerada quedó bloqueada por infraestructura. Los servicios HTTP de este laboratorio están detenidos. PostgreSQL y Redis siguen en la red privada sin puertos publicados. Sus datos están en tmpfs y pueden perderse al detenerlos o reiniciar Docker. Las evidencias exportadas quedan en el repositorio. No se eliminaron volúmenes. [Estado de contenedores](evidence/lot5-reanudacion-8a5e7c73ca37/infraestructura.txt)

Comandos de verificación desde la raíz:

~~~powershell
git status --branch --untracked-files=all
git rev-parse HEAD
git diff --check
git diff --cached --check
node --test Frontend_1_FuelFlow/tests/*.test.js
$ev = 'Docs/astra/evidence/lot5-reanudacion-8a5e7c73ca37'
Get-Content -Raw "$ev/correlacion.sql" | docker exec -i astra-l5-8a5e7c73ca37-pg psql -v ON_ERROR_STOP=1 -U postgres -d lot5 -At
Get-Content -Raw "$ev/totales.sql" | docker exec -i astra-l5-8a5e7c73ca37-pg psql -v ON_ERROR_STOP=1 -U postgres -d lot5 -At
~~~

El runner aislado usó Node 22, `npm ci` con el lockfile del backend, generación del cliente en el contenedor, `npm run build` y `npm test -- --json --outputFile=/tmp/l5-certified-jest.json` desde `/lot`. En la copia local, el controlador de navegador utilizado en el último recorrido se conserva en `.cache/astra-l5-8a5e7c73ca37/final-browser.cjs`. El archivo de entorno privado contiene credenciales efímeras. Para una nueva campaña de escritura se necesita un laboratorio nuevo.
