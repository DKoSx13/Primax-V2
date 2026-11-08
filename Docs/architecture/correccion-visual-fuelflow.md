# Corrección visual y funcional de FuelFlow

Validación realizada el 7 de noviembre de 2026 (America/Lima).

## Cambios de esta intervención

- `Frontend_1_FuelFlow/src/index.html`: tres opciones de pago, eliminación de la acción independiente de guardado y textos finales exactos.
- `Frontend_1_FuelFlow/src/styles/styles.css`: cuadrícula de tres columnas de igual ancho, centrada y limitada a 760 px; una columna hasta 540 px. Botón Volver alineado con la cuadrícula. Botones finales con ajuste de texto en móvil.
- `Frontend_1_FuelFlow/src/js/script.js`: conservación de datos al volver al formulario, autocompletado sin sobrescribir campos editados, RUC obligatorio en factura de prepago y protección de cierre contra solicitudes simultáneas. El resultado de impresión solo anuncia éxito de cierre cuando este se confirma.
- `Frontend_1_FuelFlow/tools/build.cjs` y `Frontend_2_PrimaxPrime/tools/build.cjs`: el identificador de versión incluye los bytes de las imágenes. Las referencias de imágenes en HTML y plantillas JavaScript incorporan esa versión para invalidar caché al reemplazar un logo conservando su nombre.
- `Frontend_1_FuelFlow/tests/receipts-v2.test.js`, `terminal-finalization.test.js` y `receipt-customer-form.test.js`: expectativas actualizadas y regresiones para el formulario, impresión, errores de cierre y pulsaciones simultáneas.

No se modificaron FrontEnd_3, el esquema Prisma, las migraciones, los correlativos ni la arquitectura de servicios durante esta intervención.

## Datos del comprobante

La interfaz encontrada no tenía un botón separado llamado Guardar datos; tenía una casilla «Guardar estos datos en mi perfil Primax Prime». Se retiró esa acción del kiosco. Continuar sigue validando DNI, RUC, razón social y placa según la modalidad, y la venta sigue enviando `receiptDni`, `receiptRuc` y `receiptBusinessName` al backend. Este conserva la instantánea del comprobante vinculada a la transacción.

No se actualiza automáticamente el perfil permanente del socio: esa actualización era opcional y requería consentimiento. La gestión del perfil sigue disponible en Prime. Los datos introducidos se conservan mientras se navega entre pasos y se limpian tras un cierre confirmado o al comenzar otra atención después de descartar una operación obsoleta.

## Finalización e impresión

- Izquierda: **Imprimir y finalizar**. Obtiene la venta confirmada, usa su comprobante persistido, solicita impresión y luego cierra. Los reintentos conservan el identificador estable del trabajo del agente existente.
- Derecha: **No imprimir y finalizar**. Valida y cierra la atención sin invocar al agente de impresión; conserva la venta y su comprobante.
- Ambos botones quedan temporalmente deshabilitados durante el cierre. Si falla el backend, la operación y el comprobante se conservan para reintentar. Si falla la impresora, se muestra el error y se permite finalizar sin imprimir.
- Se conserva la identificación de documentos académicos, sin validez fiscal ante SUNAT.

## Recursos gráficos

Prime usa `Frontend_2_PrimaxPrime/assets/Logotipo corporativo PRIMAX PRIME.png` en acceso, registro y encabezado. La imagen nueva mide 2172 × 724 px y pesa 318052 bytes. El recurso desplegado respondió HTTP 200 y su SHA-256 coincidió con el original: `82c53d6db1d3ffd51ffbf80ecd4b1aa0995b13eddd8dfb4e323ea94f4a911108`.

**Pendiente: falta el PNG corporativo de FuelFlow.** En `Frontend_1_FuelFlow/assets/img/` se encontró únicamente `logo-primax-horizontal.jpg` como logo PRIMAX (cabecera JPEG real). Los PNG disponibles son `Logo_Yape.png` y `Logo_Plin.png`, pertenecientes a métodos de pago. Se conservó el JPEG y el título actual de bienvenida; no se convirtió una imagen ni se utilizó el logo de otra aplicación. Para completar este objetivo hace falta identificar o proporcionar el PNG de FuelFlow y actualizar sus referencias.

## Pruebas ejecutadas

| Verificación | Resultado |
| --- | --- |
| `npm.cmd test --prefix Frontend_1_FuelFlow` | 152 pruebas aprobadas |
| `npm.cmd test --prefix Frontend_2_PrimaxPrime` | 28 pruebas aprobadas |
| `npm.cmd test --prefix Frontend_3_PrimaxControl` | 27 pruebas aprobadas |
| `docker compose config --quiet` | Correcto |
| `docker compose up -d` | Construcción e inicio correctos sin pasos manuales de dependencias o migración |
| `docker compose ps` | Los 13 servicios en ejecución y saludables |
| Diseño a 1280, 1024, 768, 375 y 320 px | Sin desbordamiento horizontal; centro de cuadrícula coincide con centro del contenedor; tarjetas de dimensiones uniformes |
| DNI al volver desde métodos de pago | Conservado |
| Logo Prime a 1280, 375 y 320 px y tras inicio de sesión | Cargado, proporción 3:1, `object-fit: contain`, sin desbordamiento |
| Textos finales a 320 px | Textos exactos en español, sin recorte; ajuste en varias líneas cuando es necesario |

### Ventas mediante navegador sobre Docker

Se efectuaron tres ventas de demostración por S/ 20 cada una, con placa y datos de prueba. No hubo cobros comerciales.

| Método | Placa | Comprobante persistido | Cierre |
| --- | --- | --- | --- |
| Yape | VST-123 | EB01-0004 | Sin impresión |
| Plin | VST-124 | FT01-0003 | Impresión simulada y cierre |
| NFC / tarjeta | VST-125 | EB01-0005 | Sin impresión |

Los números continúan los documentos existentes; no se reiniciaron secuencias. La factura contiene el RUC y la razón social introducidos. Se observó una solicitud de creación de transacción por cada venta. En la venta NFC se registraron **cero solicitudes de impresión**. El trabajo simulado de Plin incluyó `FT01-0003`, el tipo FACTURA y el identificador de la transacción correspondiente.

Se consultó PostgreSQL y se verificó un único comprobante por cada una de esas transacciones. En Control, la vista Pagos / Transacciones mostró los mismos tipos, números, importes y métodos; se comprobó nuevamente después de recargar la página. FuelFlow se utilizó antes de iniciar sesión en Control.

Las capturas `pagos-prepago-escritorio.png` y `pagos-prepago-movil.png` documentan la distribución final de selección de método. Después de la última reconstrucción se repitió la comprobación de formulario: una atención nueva empezó sin DNI y este se conservó al volver desde el método de pago.

## Límites de la verificación

- No hay impresora física conectada: se utilizó el agente de demostración. Las pruebas automatizadas cubren impresora no disponible, conservación del ticket, cierre posterior sin imprimir, doble pulsación y fallo de cierre después de imprimir.
- El PNG de FuelFlow no está disponible entre los recursos inspeccionados.
- No se ejecutó una nueva clonación limpia ni toda la suite del backend en esta intervención, concentrada en los frontends; sí se reconstruyó e inició Compose y se verificaron las ventas reales del prototipo contra los servicios desplegados y PostgreSQL.
- No se eliminaron volúmenes, documentos históricos ni datos previos. Las tres ventas de prueba quedaron persistidas.

## Inicio

Desde la raíz: `docker compose up -d`.

- FuelFlow: http://localhost:26081
- Prime: http://localhost:26082
- Control: http://localhost:26083

Para diagnosticar: `docker compose ps` y `docker compose logs --tail 100 frontend1 frontend2 commerce-service print-service`.
