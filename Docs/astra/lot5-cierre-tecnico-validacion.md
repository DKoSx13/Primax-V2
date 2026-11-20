# Lote 5 · Cierre técnico de T02 y revisión de Playwright

## Comportamiento de T02

El cierre ordinario de FuelFlow conserva la atención cuando hay un pago u orden sin autorización conciliada. El antecedente es el cambio `fc473bc` y la regla de recuperación de atenciones con evidencia financiera. El reembolso íntegro acredita la devolución del dinero. Por sí solo no concede a la terminal permiso para cerrar. En la versión recuperada, Control ofrecía **Escalar**, registraba la incidencia y dejaba la operación ACTIVE. La pantalla de terminales solo ofrecía resolver una intervención si la operación o la terminal ya estaban en estado de asistencia. La combinación dejaba a una terminal sana sin recorrido ordinario de resolución manual.

La modificación en `Backend/src/operations/control-payments.ts` conecta la escalación explícita del personal con INTERVENTION_REQUIRED. En la misma transacción verifica orden y pago únicos de la operación, importe positivo devuelto íntegro, mismo método, evento definitivo asociado a ambos, reserva de esa atención y estación cancelada sin consumo ni saldo, y ausencia de autorización y venta. La condición de actualización excluye atenciones cerradas. El personal debe resolver por la ruta existente, que verifica su asignación, registra actor y motivo y vuelve a comprobar autorizaciones y reservas pendientes. Este recorrido también se aplica a devoluciones anteriores que conserven la evidencia requerida.

El nuevo contrato `Backend/src/operations/refund-intervention.spec.ts` se escribió primero. En el código anterior falló la transición legítima y pasaron los diez contratos restantes. Se usaron dobles para permisos, estación, devolución parcial, orden pendiente, pago distinto, falta de evento, reserva de otra atención, consumo, autorización y venta. [Resultado previo](evidence/astra-l5-cierre-83446aa831/contrato-antes.txt)

## Evidencia histórica

| Mensaje original | Datos recuperados | Dato que impide atribuir la causa |
|---|---|---|
| Unrelated authorization incorrectly replayed | La solicitud positiva CAPTURED por S/ 20 contiene la operación `bc01f193-7549-4b79-9f01-cf519a180a78`, orden `9f88760c-30d3-4060-bb4e-33d62e392e9e` y pago `e3a1d636-427e-4f14-b590-5bf336da939e`. La instantánea del replay conserva la autorización `ebb41092-1ad9-4e63-9bfc-8a9cb08614e1` y terminal `3b0c9ed8-de96-4ac8-871a-5794c394643c` en esa operación. | Faltan la segunda identidad y autorización supuestamente distintas, la aserción con su valor esperado y la respuesta a esa petición. El replay positivo carece de valor probatorio sobre el supuesto cruce. |
| Continuation cannot create order | La consola del candidato en 28184 registra HTTP 400 en online-orders a +520539 ms. El contrato actual impide crear una orden cuando recibe metadatos de continuación. | Faltan el cuerpo y la identidad de esa solicitud, su respuesta JSON y el paso que lanzó el mensaje. No se puede asociar ese 400 a la aserción. |
| Order guard status 403 | En el mismo origen hay dos 403 de online-orders a +473083 y +487459 ms. | Faltan los campos de la operación, la identidad autenticada, la respuesta de la guarda y el esperado de la aserción. El código HTTP admite más de una causa. |

Se buscaron las cadenas en herramientas, cachés, documentación y artefactos locales, y en el historial Git alcanzable de herramientas y pruebas. Los 14 logs y 22 instantáneas YAML de Playwright y la copia de fuentes del candidato no aportaron la traza completa. [Petición histórica](evidence/lot5-captured-continuation/candidate/continuation-request.json) · [Instantánea histórica](evidence/lot5-captured-continuation/candidate/replay-confirmed.json) · [Consola del candidato](../../.playwright-mcp/console-2026-11-20T14-13-26-088Z.log)

## Punto de reanudación

Laboratorio nuevo `astra-l5-cierre-83446aa831`, base sintética `lot5cierre`. PostgreSQL comenzó con cero tablas y Redis con cero claves. Las dos instancias previstas escuchan en 3000 y 3002 dentro de la red dedicada. Los gateways se publican en loopback 29381 y 29384. Los runners se encuentran en la caché privada del laboratorio. El runner de devoluciones requiere cero pagos al empezar. Para reanudar un caso interrumpido consultar primero los resultados de solo lectura:

```powershell
$l='astra-l5-cierre-83446aa831'
git status --short --branch --untracked-files=all
docker ps -a --filter "name=$l"
Get-Content -Raw Docs/astra/evidence/lot5-reembolsos-b4ea3efca2e3/correlacion.sql | docker exec -i "$l-pg" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d lot5cierre
```
## Regresión de esta ejecución

Jest ejecutado sin variables del servidor DEMO aprobó **635 de 635 en 62 suites**, incluidas 11 pruebas nuevas. La primera ejecución completa heredó las variables de los servidores y arrojó cinco fallos en los contratos de reconocimiento de placas y de entorno de acceso de demostración. El archivo de configuración de los servidores fijaba el modo local, las credenciales de demostración y el reconocimiento deshabilitado. Se repitió la suite completa en el mismo contenedor sin ese archivo de entorno y con idénticas fuentes. FuelFlow aprobó **194 de 194**. [Jest](evidence/astra-l5-cierre-83446aa831/jest.json) · [Primer intento](evidence/astra-l5-cierre-83446aa831/jest-entorno-demo.txt) · [FuelFlow](evidence/astra-l5-cierre-83446aa831/fuelflow.txt)

Chromium realizó dos devoluciones DEMO legítimas con PostgreSQL y Redis nuevos. Los POST simultáneos y el reintento devolvieron la misma entidad. T01 conservó su autorización SETTLED, venta reembolsada y comprobante EB01-0001. T02 conservó un pago y una orden REFUNDED por S/ 20, un evento financiero definitivo, una transición del proveedor simulado, ningún despacho, autorización, venta ni comprobante. Su reserva liberó 3,554972 litros. El cierre ordinario de T02 devolvió 409. Control también devolvió 409 al intentar resolver antes de escalar. Tras escalar, dos peticiones simultáneas de resolución y un reintento devolvieron CLOSED. SQL registró una sola resolución con actor y motivo. Al comparar todas las columnas exportadas para ambas devoluciones solo cambió el estado de la atención T02. [Antes](evidence/astra-l5-cierre-83446aa831/antes-control.json) · [Después](evidence/astra-l5-cierre-83446aa831/conciliacion-final.json) · [Peticiones de Control](evidence/astra-l5-cierre-83446aa831/control-manual.txt) · [Auditoría](evidence/astra-l5-cierre-83446aa831/auditoria.jsonl)

**Procedimiento operativo completo.** En Control, escalar el pago, revisar la incidencia PAYMENT_AMBIGUOUS, documentar la conciliación y pasarla de OPEN a IN_REVIEW y RESOLVED. Resolver también la intervención de la terminal con el motivo comprobado. Ambos pasos tienen auditoría propia. La prueba ejecutó la resolución de terminal primero. La incidencia seguía abierta y la siguiente atención vacía no pudo iniciar el pago. La regla de atención vacía también comprueba incidencias abiertas de la terminal. Se verificaron por HTTP ambas transiciones de la incidencia y se cerró por la ruta ordinaria de Control la atención de prueba que seguía sin pago ni orden. Una pestaña nueva también recibió el 409 previsto mientras la anterior conservaba la titularidad durante 120 segundos. Se respetó su expiración natural. [Incidencia](evidence/astra-l5-cierre-83446aa831/incidente-antes.json) · [Revisión y cierre de la atención vacía](evidence/astra-l5-cierre-83446aa831/revision-incidente.txt)

En la consola de los dos reembolsos aparecen 404 para placas sintéticas desconocidas y para la consulta inicial de operaciones que acto seguido se crearon con 201. ERR_FAILED en demo-confirm corresponde a la pérdida de respuesta inducida después de capturar. El 409 de cierre ordinario de T02 es la protección observada. Las trazas de ambos navegadores no registraron excepciones JavaScript de página.

Después de cerrar la incidencia se ejecutó otra atención independiente en T02. Se perdió deliberadamente la respuesta de captura. Al retirar el identificador local, el cliente se bloqueó antes de crear una orden, autorización o venta; al restaurarlo continuó la misma atención. Dos autorizaciones simultáneas devolvieron el mismo ID con un replay. Tras perder esa respuesta, la recarga recuperó la misma autorización. Dos ventas simultáneas devolvieron la misma transacción con un replay. La nueva venta quedó PAID, reserva CLOSED, comprobante EB01-0002. Un intento de continuar el propio pago tras liquidarlo devolvió 409. Las excepciones JavaScript de página fueron cero. Las respuestas HTTP, errores de consola y abortos inducidos están en la traza. [Chromium](evidence/astra-l5-cierre-83446aa831/trace-29384-1795193002326.json) · [Distribución por réplica](evidence/astra-l5-cierre-83446aa831/replicas.txt)

El recuento global de la base sintética fue de tres pagos por S/ 60, dos órdenes QR, dos autorizaciones, dos ventas distintas, dos comprobantes distintos y S/ 40 devueltos. Las cuatro atenciones quedaron cerradas, incluida la atención de diagnóstico sin actividad financiera. Se verificó el rechazo entre operaciones de una misma estación con los contratos de titularidad de kiosco y continuación. Los E2E financieros utilizaron exclusivamente solicitudes de los titulares. [SQL reproducible](evidence/astra-l5-cierre-83446aa831/operaciones.sql) · [Filas y totales](evidence/astra-l5-cierre-83446aa831/operaciones-finales.jsonl)

## Git y entrega

Rama `feat/dezkz-identity-a4-core`, HEAD inicial y final `cec1cafc56f770597e786c9182a0fb82c3bfc7d4`. Al comenzar había seis rutas preparadas, trece rutas con cambios sin preparar y 66 archivos sin seguimiento. Se conservaron las seis entradas del índice (puerto de autorizaciones, servicio de autorizaciones, continuación CAPTURED, DTO de creación, HTML y script de FuelFlow), los cambios previos de kiosco, autenticación, pagos y FuelFlow y todos los archivos recuperados. Los nueve archivos históricos coinciden con sus hashes. El árbol final contiene seis rutas preparadas, catorce con diferencias sin preparar y 93 archivos sin seguimiento. Las categorías pueden solaparse en rutas con estados AM o MM. [Inventario individual XY](evidence/astra-l5-cierre-83446aa831/git-final.txt) · [Verificación histórica](evidence/astra-l5-cierre-83446aa831/evidencias-verificadas.txt)

La aportación de esta sesión es un cambio de implementación en `Backend/src/operations/control-payments.ts`, un contrato nuevo en `Backend/src/operations/refund-intervention.spec.ts`, este informe y 25 archivos de evidencia dentro de `Docs/astra/evidence/astra-l5-cierre-83446aa831/`. Las dos copias anteriores a la llamada válida a Control documentan también un intento de runner que se detuvo por ID vacío antes de cualquier llamada HTTP. El directorio privado ignorado contiene los runners y la configuración local de prueba. Pasaron los dos controles de espacios de Git. No se prepararon archivos ni se creó commit. No hubo cambios de Prisma ni migraciones, push, merge o despliegue.

Para verificar el resultado sin repetir transacciones, desde la raíz:

```powershell
$l='astra-l5-cierre-83446aa831'
$ev="Docs/astra/evidence/$l"
Get-Content -Raw "$ev/operaciones.sql" | docker exec -i "$l-pg" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d lot5cierre
Get-Content -Raw "$ev/jest.json" | ConvertFrom-Json | Select-Object tests,failed,suites
Get-Content "$ev/control-manual.txt","$ev/auditoria.jsonl","$ev/revision-incidente.txt"
git diff -- Backend/src/operations/control-payments.ts
git status --short --branch --untracked-files=all
```

Los procesos HTTP de esta ejecución quedaron detenidos. PostgreSQL y Redis permanecen en la red aislada sin puertos publicados en el host. El veredicto financiero y técnico DEMO de esta ejecución es favorable. **El Lote 5 sigue abierto para aceptación íntegra** porque faltan las peticiones, respuestas y aserciones originales que permitan atribuir los tres mensajes de Playwright, especialmente el supuesto replay ajeno. No hay evidencia de explotación confirmada ni pruebas financieras de esta ronda bloqueadas por infraestructura. [Estado del laboratorio](evidence/astra-l5-cierre-83446aa831/infraestructura.txt)
