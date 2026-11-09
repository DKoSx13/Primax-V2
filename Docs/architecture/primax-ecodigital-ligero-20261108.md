# Primax EcoDigital ligero — entrega para revisión

Rama: `qa/feria-integration`. Punto de partida: `primax-ecodigital-diagnostico-20261108.md`.

## Alcance implementado

- FuelFlow conserva los dos botones, sus handlers y el cierre técnico. La pantalla del ticket destaca la opción sin solicitud de impresión y muestra una explicación en español, inglés y quechua. El aviso sobre consulta en Prime solo aparece si la transacción confirmada por Backend incluye una membresía y un comprobante numerado; no depende de un dato local escrito por el usuario.
- Prime usa el `receipt` que ya llega en `memberships/me/transactions`. En cada consumo que tiene número emitido muestra una referencia EcoDigital y acceso al detalle digital de solo lectura. La vista reproduce el mismo número, tipo, fecha, estación, vehículo, combustible y total; indica que es un documento académico de demostración sin validez tributaria. Si no existe `receipt`, no muestra distintivo ni inventa documento.
- Control agrega al dashboard el conteo `receiptsAvailableToday` mediante `Receipt.count` en PostgreSQL. La consulta filtra por fecha de emisión desde el inicio del día de Lima y por las estaciones autorizadas o seleccionadas. Solo se ejecuta y muestra si el actor tiene `ADMIN_DASHBOARD_VIEW` y `ADMIN_RECEIPT_VIEW`. Es un conteo de documentos emitidos, no de cierres sin impresión; la tarjeta lo aclara. El dashboard no tiene filtro de fechas personalizado: el indicador se limita al período “hoy”.

No se cambió el modelo Prisma, el contrato de impresión, pagos, inventario, saldos, numeración ni la lógica de cierre. No se ejecutaron migraciones, seeds, escrituras en bases existentes, deploy, commit ni push. Los documentos siguen siendo demostrativos.

## Archivos modificados

| Área | Archivos |
| --- | --- |
| FuelFlow | `src/index.html`, `src/js/script.js`, `src/styles/styles.css`, `tests/receipts-v2.test.js` dentro de `Frontend_1_FuelFlow` |
| Prime | `index.html`, `js/app.js`, `js/views.js`, `js/receipt-view.js`, `styles/eco-digital.css`, `tests/eco-digital.test.js` dentro de `Frontend_2_PrimaxPrime` |
| Control | `js/app.js`, `js/control-presentation.js`, `tests/control-presentation.test.js` dentro de `Frontend_3_PrimaxControl` |
| Backend | `src/control/control.service.ts`, `src/control/ecodigital-dashboard.spec.ts` |
| Documentación | Este informe y el diagnóstico previo, que sigue sin commit |

## Verificación

- `Frontend_1_FuelFlow`: `npm test` (**156/156**; incluye cierre sin impresión, impresión demo, doble clic, fallo seguido de cierre y recuperación); `npm run build` correcto.
- `Frontend_2_PrimaxPrime`: `npm test` (**31/31**; incluye disponibilidad, ausencia y escape de datos de comprobante); `npm run build` correcto.
- `Frontend_3_PrimaxControl`: `npm test` (**35/35**; incluye presentación del indicador y permisos de navegación); `npm run build` correcto.
- `Backend`: prueba unitaria `src/control/ecodigital-dashboard.spec.ts` (**3/3**; consulta por estación, permiso y límite de día en Lima); `npm run build` y `npm run lint` correctos.
- `git diff --check` y revisión del estado de la rama.

Estas pruebas no sustituyen una comprobación visual en navegador ni un recorrido de venta en el laboratorio con las nuevas imágenes. El conteo se ha probado con un repositorio simulado y compilación Prisma; la lectura integrada del endpoint actualizado aún necesita ejecutarse tras reconstruir `administration-service` en `primax-feria-check`.

## Reconstrucción limitada al laboratorio

Los cambios visibles requieren los tres frontends. El indicador de Control también requiere reconstruir `administration-service` porque el gateway dirige `/control/dashboard` a ese servicio. Estos comandos no recrean PostgreSQL, Redis, gateway, servicios de ventas ni tareas de seed o migración:

```bash
COMPOSE_PROJECT_NAME=primax-feria-check FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 BACKEND_PORT=27100 docker compose build administration-service frontend1 frontend2 frontend3
COMPOSE_PROJECT_NAME=primax-feria-check FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 BACKEND_PORT=27100 docker compose up -d --no-deps --no-build administration-service frontend1 frontend2 frontend3
COMPOSE_PROJECT_NAME=primax-feria-check FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 BACKEND_PORT=27100 docker compose ps administration-service frontend1 frontend2 frontend3
```

Antes de ejecutar, comprobar que las variables efectivas de Compose son las del laboratorio y que no se emplea ningún override remoto. No se ejecutaron estos comandos en esta ronda.

## Límites de la afirmación ambiental

El sistema no mide hojas, CO₂, ahorro económico, salida física de PrintAgent ni frecuencia real de clientes que evitan imprimir. EcoDigital presenta la alternativa de no solicitar impresión y la disponibilidad digital del documento académico ya emitido. Una copia posterior desde Control no altera el conteo de documentos disponibles.
