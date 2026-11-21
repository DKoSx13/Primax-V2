# Estabilización de Primax para la feria

Rama `feria/estabilizacion-local-20261120`, base `c4aea333ae3dd8079a529e941f0adc1fecb556d0`. El proyecto de exposición sigue siendo `primax-astra-original`.

## Prioridad crítica

- **Propiedad de terminal.** La pestaña tiene un UUID en `sessionStorage` y mantiene un Web Lock exclusivo por origen. El heartbeat consulta `terminal/me` cada 30 s mientras FuelFlow está visible. Redis guarda la propiedad 120 s y el heartbeat solo puede renovar una propiedad que sigue existiendo. Al expirar, la operación nueva requiere una propiedad estricta y el mensaje 409 atribuye el conflicto a otra pestaña. La finalización de la venta y la sesión Prime tienen estados distintos. La pestaña de Control no toma el Web Lock de FuelFlow. El cambio vuelve a reclamar la terminal por el endpoint existente justo antes de abrir una atención nueva. El backend serializa el reclamo, protege al propietario actual y bloquea la toma de una operación financiera abierta. FuelFlow también comprueba el vencimiento de la sesión de kiosco al iniciar y durante el heartbeat visible.
- **Atención abierta en exposición.** La consulta de solo lectura encontró `OP01-0012` (`9797daf9-ba98-48df-bd51-929682eed72d`) en `PRIMAX-SUR-T01`, abierta a las 01:08:31 de Lima. Seguía `ACTIVE` con la terminal `EN_USO`. Había una solicitud de ayuda general resuelta y un evento `OPERATION_OPENED`. No había un evento de cierre, autorización, orden, pago, reserva de saldo o inventario, venta, comprobante ni incidencia operativa abierta. Al abrir una atención se ocupa la terminal inmediatamente. Resolver la asistencia deja que la atención siga su curso. La auditoría no registra qué gesto del navegador dejó la atención abierta.
- **T02.** La consulta encontró la terminal registrada y disponible, sin atención abierta. Se reactivó el endpoint administrativo existente con el grant `ADMIN_TERMINAL_MANAGE`, alcance de estación, validación bajo bloqueo de la fila y auditoría. El mantenimiento usa `FUERA_DE_SERVICIO` con motivo persistido y Control lo muestra como «En mantenimiento». Una operación abierta debe resolverse primero. Habilitar requiere un surtidor activo y una suspensión por mantenimiento. Las credenciales, asignaciones e historial se conservan.
- **Cancelación.** FuelFlow confirma antes de cerrar, y regresar al inicio desde Selección de combustible solicita el mismo cierre. Una orden pendiente se cancela con el proveedor configurado antes de cerrar la atención. Una reserva Prime sin despacho se intenta liberar con el mecanismo existente. Con despacho se usa Detener y liquidar. Los pagos capturados sin despacho y estados ambiguos conservan la atención y ofrecen asistencia. El siguiente cliente entra cuando Backend confirma el cierre.

## Identificación, liquidación y presentación

- El lector de placa entrega la placa y el lector de membresía entrega un código candidato. Los dos conservan el ingreso manual. El endpoint de validación comprueba la placa, la membresía activa y los alias vigentes. Solo devuelve los datos de perfil necesarios para el comprobante de esa combinación. La consulta por placa del kiosco y las respuestas de OCR omiten el perfil y los saldos. La autorización de postpago vuelve a comprobar el vínculo. Prepago conserva la atribución de puntos y las reglas de descuento por vehículo en Commerce.
- El prepago parcial conserva la liquidación existente. Backend usa el avance registrado, liquida por el consumo efectivo, libera inventario sobrante y confirma la devolución interna cuando el pago es demo. Con proveedor externo, la devolución que todavía requiere confirmación queda en conciliación. FuelFlow muestra consumo y devolución según el resultado persistido.
- Se conservó el parche local que evita leer emojis, reinicia visualmente tanque y barra, y oculta el engranaje manteniendo su elemento y listener. El reinicio de la atención limpia también el estado persistente del flujo una vez confirmado el cierre.
- Prime muestra el número autenticado con mayor tamaño y contraste. Control acorta el indicador de comprobantes, conserva su alcance temporal y añade «Impacto ambiental / Menos papel». El sistema registra comprobantes emitidos, así que la tarjeta ambiental usa texto y omite una cifra de impresiones evitadas.

## Cierre seguro de una atención y mantenimiento

1. Pausa el autoservicio y confirma con el operador que la terminal ya no atiende a nadie. En Control abre **Operaciones** y consulta detalle e incidencias. Compara estado, avance, órdenes, pagos, autorización, reservas, transacción y comprobante.
2. Para una atención vacía, cancela en la pestaña original si FuelFlow ya ofrece **Cancelar atención**. En la versión anterior usa el endpoint de Control con un usuario autorizado para gestionar incidencias en la estación. En la consola de la pestaña autenticada de Control, verifica primero el identificador contra el detalle. Este ejemplo usa la operación observada y solo corresponde si sigue abierta y vacía.

   ```js
   const id = '9797daf9-ba98-48df-bd51-929682eed72d';
   const response = await fetch('/api/v1/control/terminal-operations/' + id + '/cancel-unpaid', {
     method: 'POST', credentials: 'same-origin'
   });
   console.log(response.status, await response.json());
   ```

3. Si hay orden pendiente, usa la cancelación de esa orden desde FuelFlow. En Control, «Consultar pago / asistir» ofrece «Cancelar y liberar de forma controlada» cuando Backend confirma que es elegible. Si hay un pago capturado, consumo o incertidumbre, conserva el UUID y el contexto original. Desde **Consultar pago / asistir** en el detalle de la operación, consulta el estado autoritativo y continúa, concilia o escala según las acciones disponibles. Un conflicto de Backend es motivo para volver a consultar el detalle. Completa la liquidación y verifica la salida de la lista de atenciones abiertas antes de tocar el estado de la terminal.
4. Con la nueva versión desplegada, inicia sesión en Control con `ADMIN_TERMINAL_MANAGE` y acceso a la estación. En **Terminales y surtidores** selecciona solo `PRIMAX-SUR-T02`, usa **Poner en mantenimiento** y registra el motivo. Verifica «En mantenimiento», que T02 rechaza iniciar y que T01 conserva su disponibilidad. **Habilitar** revierte esa suspensión.

## Reconstrucción y despliegue controlado

Ejecutar desde el checkout, con las mismas variables de entorno con que se inició el Compose original. Cierra todas las atenciones antes de recrear servicios. Mantén T01/T02 sin público hasta completar la comprobación de salud. Esta consulta debe devolver cero filas.

```bash
cd /home/primax/Proyectos/Primax-V2-astra-lot5
docker compose -p primax-astra-original exec -T postgres sh -c \
  'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
BEGIN READ ONLY;
SELECT t.code, o.number, o."operationId", o.status
FROM "TerminalOperation" o JOIN "Terminal" t ON t.id = o."terminalId"
WHERE o."closedAt" IS NULL;
ROLLBACK;
SQL
```

Guarda referencias a las imágenes que efectivamente están ejecutándose antes de compilar. Un archivo nuevo por despliegue evita reemplazar el punto de retorno.

```bash
(
  set -euo pipefail
  backup=/home/primax/primax-backups/feria-estabilizacion-20261121
  stamp=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$backup"
  manifest="$backup/imagenes-$stamp.tsv"
  for service in identity-service administration-service plate-recognition frontend1 fuelflow-t02 frontend2 frontend3; do
    cid=$(docker compose -p primax-astra-original ps -q "$service")
    runtime_id=$(docker inspect --format '{{.Image}}' "$cid")
    runtime_ref=$(docker inspect --format '{{.Config.Image}}' "$cid")
    rollback_ref="primax-feria-rollback/$service:$stamp"
    docker image tag "$runtime_id" "$rollback_ref"
    printf '%s\t%s\t%s\n' "$service" "$runtime_ref" "$rollback_ref" >> "$manifest"
  done
  printf '%s\n' "$manifest"
)
docker compose -p primax-astra-original config --quiet
docker compose -p primax-astra-original build identity-service administration-service plate-recognition frontend1 fuelflow-t02 frontend2 frontend3
```

Repite el control de atenciones abiertas inmediatamente antes del siguiente comando. El Gateway, los BFF, Commerce, Catálogo, PostgreSQL, Redis, PrintAgent y los jobs conservan sus contenedores.

```bash
docker compose -p primax-astra-original up -d --no-deps --no-build --pull never --wait --wait-timeout 180 \
  identity-service administration-service plate-recognition frontend1 fuelflow-t02 frontend2 frontend3
docker compose -p primax-astra-original ps -a
curl -fsS http://127.0.0.1:27200/api/v1/health
```

Comprueba 15 servicios saludables y los dos jobs con código 0. Abre las páginas en los mismos orígenes loopback del túnel SSH. Haz una recarga inicial para tomar los nuevos archivos y ejecuta la aceptación en una sola pestaña de T01.

## Reversión

Primero termina o concilia toda atención. Mientras esté disponible el Control nuevo, usa **Habilitar** si quieres restaurar también la disponibilidad previa de T02. La reversión de imágenes conserva el estado de mantenimiento en PostgreSQL si aún está activo. Selecciona el manifiesto que imprimió el despliegue y vuelve a etiquetar sus imágenes.

```bash
(
  set -euo pipefail
  read -r -p 'Ruta del manifiesto de imágenes: ' manifest
  services=()
  while IFS=$'\t' read -r service runtime_ref rollback_ref; do
    docker image tag "$rollback_ref" "$runtime_ref"
    services+=("$service")
  done < "$manifest"
  test "${#services[@]}" -eq 7
  docker compose -p primax-astra-original up -d --no-deps --no-build --pull never --wait --wait-timeout 180 "${services[@]}"
)
docker compose -p primax-astra-original ps -a
```

El parche de código de la misión se puede revertir aparte. `git apply --check` permite detectar ediciones posteriores antes de tocar el árbol de trabajo. El parche de cambios previos se conserva como referencia independiente.

```bash
git apply --check --reverse /home/primax/primax-backups/feria-estabilizacion-20261121/cambios-mision.patch
git apply --reverse /home/primax/primax-backups/feria-estabilizacion-20261121/cambios-mision.patch
git diff --stat
```

## Checklist de aceptación

- [ ] T01 completa tres ventas seguidas en una sola pestaña. Tras cada «No imprimir y finalizar», Control muestra la operación cerrada y T01 «Disponible».
- [ ] T01 completa otra venta después de más de 120 s sin actividad en la pestaña de FuelFlow. Abre y usa Control en otra pestaña durante la espera. Verifica una segunda pestaña concurrente de T01 bloqueada.
- [ ] Prepago completo y prepago de S/ 50 detenido alrededor de S/ 30. Compara orden, pago inicial, consumo, devolución demo, galones, comprobante y reserva. Verifica que el inventario físico descuenta el consumo y que la reserva termina en cero. Un reintento de confirmación conserva la misma transacción.
- [ ] Postpago completo y detenido manualmente. Valida cargo efectivo, saldo liberado, puntos, comprobante, inventario y cierre. Los puntos por venta elegible siguen la política vigente.
- [ ] Retrocede entre pantallas conservando la misma atención. Desde combustible pulsa volver al inicio y elige conservar. Después confirma la cancelación y verifica el cierre.
- [ ] Cancela una orden QR pendiente sin simular su confirmación. Verifica orden y pago cancelados, reserva liberada y contador de atenciones actualizado. Para un pago capturado o una respuesta incierta, comprueba que la aplicación conserva la operación y solicita asistencia.
- [ ] Lee ABC-123 por OCR con el campo de membresía vacío. Presenta o introduce PRIME-001 por separado, prueba una combinación incorrecta y verifica que Backend la rechaza sin entregar datos personales. Comprueba la alternativa manual.
- [ ] Abre Prime en un móvil vertical. Verifica el código en Inicio y Mi membresía e importa una captura de la tarjeta. Si se prueba la cámara física, registra ese resultado por separado.
- [ ] Activa el mantenimiento de T02. Verifica que T02 queda bloqueada, que T01 sigue vendiendo y que «Habilitar» funciona. Deja T02 en mantenimiento para la feria.
- [ ] Revisa que la voz omite emojis, el engranaje permanece oculto, barra/tanque empiezan en cero y la interfaz responde en las tres lenguas y en pantalla estrecha.
- [ ] Comprueba en Control «Comprobantes digitales», «Menos papel», «1 estación visible» cuando corresponda y la lectura de estados operativos.

La impresión física y el APK quedan para la siguiente etapa. Se conservan sus componentes y el flujo de comprobante académico.

## Archivos de la entrega

| Componente | Archivos |
|---|---|
| Backend | `src/alerts/alerts.service.ts`, `src/auth/admin.controller.ts`, `src/control/control-operations.service.ts`, `src/vehicles/recognition.service.ts`, `src/vehicles/vehicles.controller.ts` |
| Verificación Backend | `src/kiosk/kiosk.spec.ts`, `src/operations/terminal-state.spec.ts`, `src/vehicles/recognition.service.spec.ts`, `test/control-operations.e2e-spec.ts`, `test/identity-lot-r.integration.cjs`, `test/lot2-scenarios/admin-ocr.cjs`, `test/lot2d-admin-scenario.cjs`, `test/terminal-refactor.e2e-spec.ts` |
| FuelFlow | `src/index.html`, `src/js/apiClient.js`, `src/js/kioskSession.js`, `src/js/plateCamera.js`, `src/js/script.js`, `src/js/terminalOperation.js`, `tests/qr-reload.test.js`, `tests/receipt-customer-form.test.js`, `tests/terminal-finalization.test.js`, `tests/terminal-operation.test.js`. El cambio de `src/styles/styles.css` ya estaba en el árbol. |
| Prime | `js/views.js`, `styles/app.css` |
| Control | `js/app.js`, `js/control-presentation.js`, `styles/control.css`, `tests/control-presentation.test.js` |
| OCR | `app.py`, `Dockerfile`, `test_v11.py` |
| Especificaciones y entrega | `Specs/03-approved-decisions.md`, `Specs/04-terminal-assistance.md` y este documento |

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| Backend `npm --prefix Backend run build` | Compilación correcta |
| Backend `npm --prefix Backend test -- --silent --testTimeout=30000` | 640/640 en 62 suites. El primer intento con 5 s por prueba tuvo un timeout de AuthCore durante la compilación concurrente. También detectó expectativas históricas de Control solo lectura que se actualizaron para comprobar los permisos y el mantenimiento. |
| FuelFlow `npm --prefix Frontend_1_FuelFlow test` | 195/195 |
| Prime `npm --prefix Frontend_2_PrimaxPrime test` | 31/31 |
| Control `npm --prefix Frontend_3_PrimaxControl test` | 38/38 |
| `git diff --check` | Correcto |
| OCR `python -B -m unittest discover -v` en el contenedor aislado | 12/12, con imágenes de placa y códigos PRIME-001, PRIME-A001, PRIME-AA001 y PRIM001A. Los ensayos iniciales identificaron timeouts bajo carga y confusiones entre O y 0. Se acotó Tesseract a un hilo y se mantuvo el umbral vigente. |
| Inicio del Compose aislado | 15 servicios saludables y dos jobs con código 0. El proyecto de exposición también conservó ese conteo. |
| Recuperación administrativa del primer laboratorio | La primera prueba de cancelación detectó HTTP 415 por cuerpo JSON ausente. Tras corregir el cliente, se usó la acción autorizada de Control para cancelar y liberar la orden de ese ensayo. PostgreSQL confirmó pago y orden cancelados, 0 L consumidos, 8.885535 L liberados y terminal disponible. |
| Chromium con backend y base aislados | Tres ventas consecutivas en T01 sin recargar. Funcionaron ambas formas de cancelación, la separación de placa y membresía, el rechazo de una combinación incompatible y la relectura de la transacción parcial con el mismo UUID. |
| Tarjeta y Control responsive | Código de Prime visible a 360 px e importación de la captura con reconocimiento de `PRIME-001`. Control a 390 px mostró las dos tarjetas, «1 estación visible» y T02 «En mantenimiento» con acción «Habilitar». |
| Prepago parcial cerca de S/ 30 | Orden de S/ 50.00, transacción de S/ 30.46, devolución demo de S/ 19.54, 1.430 gal, 3 puntos y comprobante `EB01-0004`. Reservado final 0 L. Consumo de inventario de 5.413144 L y liberación de 3.472391 L. |
| Expiración de propiedad Redis | Después de cerrar una venta se dejó FuelFlow 125 s sin heartbeat en la misma página de Chromium y se usó Control en otra pestaña. El inicio directo, que reproduce la llamada antigua, devolvió 409 con «Terminal ocupada en otra pestaña». En esa misma página, **Iniciar** reclamó la terminal y completó un postpago parcial sin recargar. T02 permaneció en mantenimiento durante la venta. |
| Postpago parcial | Se autorizaron S/ 100.00, se cobraron S/ 11.08 y se liberaron S/ 88.92. Comprobante `EB01-0005`, 0.520 gal, 1 punto y reserva final de inventario 0 L. Las dos barras de la prueba reciente iniciaron en 0% y avanzaron sin descensos. |
| Conciliación final de solo lectura | Cero atenciones abiertas. El monto cobrado más la devolución coincide con la orden en los dos prepagos parciales y hay un evento de devolución por venta. Los litros despachados coinciden con el ledger de inventario. Saldo Prime S/ 188.92 y 15 puntos, ambos consistentes con sus movimientos. |

Las pruebas de navegador usaron Chromium en modo headless y datos demo en proyectos Compose aislados. Los registros y la captura de OCR están en `/home/primax/primax-backups/feria-estabilizacion-20261121`. El laboratorio de aceptación se comprobó libre de atenciones antes de detenerlo. Los contenedores, imágenes y volúmenes se conservan.

Queda la validación manual sobre el equipo de exposición después del despliegue, incluida la voz audible en los tres idiomas, el tamaño vertical en un teléfono físico y la cámara real si se va a usar en el puesto. Las devoluciones probadas son internas de demostración. Las devoluciones de proveedores externos siguen el flujo de conciliación existente. Las suites dedicadas de integración del Backend que requieren una base de pruebas separada quedan pendientes. Se comprobó el flujo integrado con PostgreSQL en el laboratorio Compose de esta entrega.
