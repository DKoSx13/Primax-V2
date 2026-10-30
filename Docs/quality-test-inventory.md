# Inventario y estrategia de pruebas

Estado de inventario estático: 2026-10-30. Se clasifican las pruebas por lo que ejercitan; “unitaria” se reserva para lógica aislada con dependencias sustituidas. No se movieron pruebas ni se ejecutaron suites durante este inventario.

## Resumen por componente

| Componente | Suites/archivos detectados | Tipos y alcance |
| --- | ---: | --- |
| `Frontend_1_FuelFlow` | 18 archivos `tests/*.test.js` | Node `node:test`; mayormente pruebas de servicios, reglas y límites con dependencias simuladas (unitarias/de componente). Incluye contrato/routing/build estático; no se detectó runner E2E de navegador en este componente. |
| `Frontend_2_PrimaxPrime` | 13 archivos: 5 `.test.js`, 8 `.spec.cjs` | Node `node:test` para servicios/auth/estados; Playwright para pruebas de navegador móvil y flujos UI. Las pruebas Playwright son E2E de interfaz; no son unitarias. |
| `Frontend_3_PrimaxControl` | 3 archivos `tests/*.test.js` | Node `node:test`; proxy HTTP/control de rutas, estado UI y contrato del PrintAgent. Las pruebas del proxy ejercitan handler/HTTP con servidor upstream simulado, no el sistema desplegado. |
| `Backend` | 22 specs `src/**/*.spec.ts`, 17 specs `test/*.e2e-spec.ts`, 3 scripts `.test.*` | Jest/ts-jest. Specs de servicios y controladores con mocks son unitarias o de componente; `test/` levanta Nest y hace HTTP con Supertest y DB PostgreSQL aislada: integración/E2E de API. Scripts `database-safety` y seeds son pruebas de seguridad/guardas de operación, no pruebas funcionales HTTP. |
| `PlateRecognition` | 2 archivos Python | `unittest`; lógica de normalización/preprocesamiento y fixtures de imagen son pruebas de componente con OCR real; `test_ocr.py` también prueba endpoint Flask HTTP, autenticación y validación. No es solo unitario. |
| `PrintAgent` | 6 archivos `tests/*.test.mjs` | Node `node:test`; lógica de jobs, idempotencia y validaciones más pruebas HTTP del servidor local y headers/contratos. La impresora física/driver no queda validada por mocks/contratos. |

Conteo estático: **84 archivos/suites de prueba** (18 + 13 + 3 + 42 Backend + 2 + 6). En Backend el total corresponde a 22 unit/integration specs de `src`, 17 E2E de `test` y 3 pruebas de scripts. Un archivo puede contener múltiples casos/subtests; este conteo no es número de tests individuales. Playwright usa 8 archivos y 3 proyectos de viewport, por lo que el número de ejecuciones puede multiplicarse por proyectos.

## Clasificación y ejemplos útiles para exposición

### Pruebas unitarias reales o de componente aislado

- `Backend/src/vehicles/plate.dto.ts` y `Backend/src/vehicles/recognition.service.spec.ts`: normalización de placa y respuestas del gateway OCR con fetch simulado; la normalización aislada es un buen ejemplo unitario.
- `Backend/src/auth/auth.service.spec.ts`: login, rechazo de credenciales, cuenta inactiva y no exposición del hash mediante dependencias simuladas.
- `Backend/src/payments/payments.service.spec.ts`: reglas por modalidad de pago con proveedor sustituido; es test de servicio/componente, no de proveedor real.
- `Frontend_1_FuelFlow/tests/transactions.test.js`: bloqueo de doble envío, reutilización de `operationId` tras timeout y rechazo de errores como éxito usando storage/request simulados.
- `Frontend_2_PrimaxPrime/tests/auth.test.js`: persistencia y expiración de sesión, logout y errores de storage con `fetch` simulado.
- `PrintAgent/tests/jobs.test.mjs`: deduplicación/idempotencia de jobs y recuperación usando almacenamiento/control de impresión sustituidos.

### Integración y HTTP/API

- `Backend/test/api.e2e-spec.ts`: Nest + Supertest + PostgreSQL real aislado; cubre login HTTP, normalización/consulta de placa, pagos, saldo, reservas, transacciones, idempotencia, CORS y aislamiento entre usuarios.
- `Backend/test/control.e2e-spec.ts`: autenticación administrativa, grants, alcance por estación, permisos e incidencias mediante API y DB.
- `Backend/test/phase1a.e2e-spec.ts`: seguridad de terminales/turnos, alcance, concurrencia, auditoría append-only y rutas HTTP; integra Backend y PostgreSQL.
- `Backend/test/inventory-reconciliation.e2e-spec.ts`: conciliación de inventario, rollback, alcance y privilegios SQL en PostgreSQL.
- `PlateRecognition/test_ocr.py`: Flask test client contra `/recognize`, autenticación, imágenes de fixtures y ejecución de OCR/preprocesamiento.
- `Frontend_3_PrimaxControl/tests/control-proxy.test.js`: handler/proxy HTTP, cookie permitida, encabezados y rutas; es integración del componente con upstream simulado.
- `PrintAgent/tests/http.test.mjs`: contrato HTTP del servidor local y respuestas del agente.

### E2E de navegador

`Frontend_2_PrimaxPrime/tests/*.spec.cjs` usa Playwright Chromium con servidor local y proyectos de viewport 360×800, 390×844 y 412×915. Incluye navegación, registro/login, identidad y recuperación en UI. Son pruebas E2E del frontend contra el servidor de desarrollo/fixtures; no equivalen a staging ni a integración con proveedores reales.

### Seguridad y límites

- `Backend/scripts/database-safety.test.cjs` y los tests de seeds verifican guardas y restricciones sobre destinos/operaciones de base de datos.
- `Backend/test/control.e2e-spec.ts` y `phase1a.e2e-spec.ts` comprueban autenticación, permisos, grants, alcance, revocación y rechazo de accesos no autorizados por HTTP.
- `PlateRecognition/test_ocr.py` verifica token ausente/incorrecto en endpoint.
- `Frontend_1_FuelFlow/tests/build-secrets.test.js` comprueba límites de secretos en build.
- `Frontend_3_PrimaxControl/tests/control-proxy.test.js` comprueba rechazo de origen/ruta/cookies no permitidos.

## Límites conocidos

- Un E2E con base local demuestra integración en el entorno de prueba, no despliegue ni hardware real.
- Pagos demo/no integrados no validan cargos comerciales, adquirencia, Yape/Plin reales ni liquidación bancaria.
- No se observa cobertura disponible uniforme para todos los componentes; no afirmar cobertura porcentual sin generar y revisar reportes.
- No se detectó suite de seguridad dinámica (DAST) dedicada ni fuzzing general.
- Pruebas de PrintAgent no prueban impresora física en este entorno. El OCR usa fixtures y no valida cámara/placas reales.

## Ejemplos académicos recomendados

1. Normalización de placa: comparación entre test puro de `normalizePlate` y E2E HTTP que verifica acceso/alcance.
2. Autorización: `control.e2e-spec.ts` prueba grants y scope; explicar por qué ocultar botones no sustituye Backend.
3. Idempotencia de pago/operación: E2E PostgreSQL concurrente en `api.e2e-spec.ts` y unit/component test de `transactions.test.js`.
4. Terminal: `phase1a.e2e-spec.ts` prueba vínculo técnico, turnos, exclusividad y concurrencia.
5. Membresía/inventario: `membership-number.spec.ts` prueba contador persistido; `inventory-reconciliation.e2e-spec.ts` prueba conciliación y rollback.
6. Proxy Control y PrintAgent: `control-proxy.test.js` y `PrintAgent/tests/http.test.mjs` muestran fronteras HTTP con contratos acotados.
