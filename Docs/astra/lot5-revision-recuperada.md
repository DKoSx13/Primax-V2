# Lote 5 · Recuperación y parada de seguridad

La carpeta descomprimida conserva el repositorio, el índice y el trabajo pendiente. Rama feat/dezkz-identity-a4-core, HEAD cec1cafc56f770597e786c9182a0fb82c3bfc7d4. El estado detallado de la copia coincide con el del origen antes de añadir este informe.

## Hallazgo de revisión

La creación de autorizaciones comprueba la operación activa y la terminal mediante assertSaleBinding en Backend/src/auth/access.guard.ts. Las acciones de avance, liberación e intervención de autorizaciones existentes siguen otra ruta. En Backend/src/kiosk/kiosk.service.ts, authorization comprueba la estación de la autorización. En Backend/src/transactions/authorizations.controller.ts, el avance llega al servicio con el identificador, el importe y los galones. La operación y la identidad del solicitante no forman parte de ese contrato. El servicio comprueba reglas monetarias y el estado de la autorización. Esta combinación deja un riesgo concreto de modificar el despacho de otra operación de la misma estación si se conoce la autorización y se dispone de acceso válido al kiosco. No hay evidencia aquí de explotación, de cobro adicional, de cruce entre estaciones ni de que esta sea la causa del mensaje de Playwright.

La ampliación propuesta consiste en vincular las acciones financieras sobre autorizaciones existentes a la operación y terminal autenticadas. Se detuvo la implementación a la espera de autorización.

## Evidencia y límites

El comprobante EB01-0001 aparece en candidate/recovered-sale.json. Las capturas de estado del candidato documentan el recorrido histórico. Se requiere una traza que identifique la petición, la respuesta y la operación usada en la aserción para atribuir los tres fallos comunicados. Un 403 por sí solo no identifica qué guarda lo emitió.

Jest histórico registró 144 aprobadas y cero fallidas en backend-results.json. En el primer intento hubo 116 aprobadas y dos suites ausentes en el directorio temporal. En esta sesión pasaron las 21 pruebas locales de FuelFlow en qr-reload.test.js. El motor Linux de Docker no respondió a docker info. No se ejecutaron pruebas nuevas con bases de datos ni Playwright. Siguen sin validar concurrencia, pago y autorización únicos, venta única, correlación entre usuarios, recorrido normal independiente de T02 y consola del navegador.

## Inventario Git heredado

Las dos columnas registran respectivamente el índice y el árbol de trabajo. Los nueve archivos históricos de Stage 2B comprenden cuatro evidencias, un informe y cuatro scripts. Los demás archivos sin seguimiento corresponden al trabajo de continuación.

~~~text
## feat/dezkz-identity-a4-core
M  Backend/services/commerce/src/application/ports/authorization-commands.ts
 M Backend/src/payments/online-orders.ts
M  Backend/src/transactions/authorizations.service.ts
AM Backend/src/transactions/captured-continuation.ts
MM Backend/src/transactions/create-authorization.dto.ts
M  Frontend_1_FuelFlow/src/index.html
MM Frontend_1_FuelFlow/src/js/script.js
 M Frontend_1_FuelFlow/tests/qr-reload.test.js
?? Backend/src/transactions/captured-continuation.spec.ts
?? Docs/astra/evidence/lot5-captured-continuation/baseline/browser.json
?? Docs/astra/evidence/lot5-captured-continuation/baseline/captured-block.json
?? Docs/astra/evidence/lot5-captured-continuation/baseline/isolation.json
?? Docs/astra/evidence/lot5-captured-continuation/baseline/order-request.json
?? Docs/astra/evidence/lot5-captured-continuation/baseline/startup.json
?? Docs/astra/evidence/lot5-captured-continuation/baseline/stopped.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/after-explicit-replay.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/authorization-response-lost.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/before-continuation.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/continuation-request.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/isolation.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/recovered-sale.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/replay-confirmed.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/rollback.json
?? Docs/astra/evidence/lot5-captured-continuation/candidate/startup.json
?? Docs/astra/evidence/lot5-captured-continuation/unit/backend-results.json
?? Docs/astra/evidence/lot5-captured-continuation/unit/initial-harness-backend-results.json
?? Docs/astra/evidence/stage2b/compose-isolated-redacted.json
?? Docs/astra/evidence/stage2b/control.png
?? Docs/astra/evidence/stage2b/prime.png
?? Docs/astra/evidence/stage2b/results.json
?? Docs/astra/primax-stage2b-isolated-integration-results.md
?? tools/astra/lot5-captured-continuation-lab.cjs
?? tools/astra/lot5-continuation-rollback.cjs
?? tools/astra/lot5-continuation-unit.cjs
?? tools/astra/stage2b-browser.cjs
?? tools/astra/stage2b-checks.cjs
?? tools/astra/stage2b-lab.cjs
?? tools/stage2b-smoke.cjs
~~~
