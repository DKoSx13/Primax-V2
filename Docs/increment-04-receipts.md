# Incremento 04 — Comprobantes exclusivamente con PrintAgent

Spec: `Specs/05-payments-and-receipts.md` §3 y criterios 5–8. Rama `feature/v2-04-receipts`, desde main 7cde52c. Sin migraciones ni cambios de estado financiero.

| Requisito | Implementación | Tests | Validación |
| --- | --- | --- | --- |
| Cliente elige Imprimir / No imprimir | FuelFlow `src/index.html`, traducciones y handlers en `src/js/script.js` | `tests/receipts-v2.test.js`; finalization tests existentes | Dos acciones; sin window.print ni diálogo/popup funcional |
| PrintAgent es única vía física | FuelFlow `printReceipt.js` y Control `print-agent.js` existentes; eliminación del popup de Control | tests de impresión de FuelFlow/Control; `PrintAgent/tests/jobs.test.mjs` | Idempotencia por receipt-id, consulta antes de POST, unknown nunca se reenvía |
| Error claro, salida física no confirmada, cierre permitido | `imprimirYFinalizar`, mensajes Control | tests de unavailable/rejected/unknown/malformed; finalización existente | No modifica ni recrea pago/transacción; conserva comprobante |
| Registro del intento | `PrintAgent/store.mjs` | nuevo test journal | `print-attempts.jsonl` añade REQUESTED/RESULT con ID, hash, estado y timestamp, sin placa/DNI; replay no duplica envío ni eventos |

Validación: FuelFlow 139 tests; Control 17; PrintAgent 55. Builds FuelFlow/Control correctos. La suite PrintAgent de Windows requiere ejecutar scripts locales; se utilizó `PSExecutionPolicyPreference=RemoteSigned` únicamente en el proceso de test, sin cambiar configuración persistente. `tools/print-agent.spec.cjs` actualiza los textos esperados de los botones.

Limitación explícita de arquitectura preservada: PrintAgent HTTP está restringido a loopback y a páginas locales de origen exacto. No se han relajado CORS, LNA, autenticación ni protecciones del navegador para imprimir desde HTTPS de staging. Validación con impresora física requiere instalación local/driver/papel y sigue pendiente; los tests usan adapter/cola simulados y no afirman impresión física. Fallos antes de alcanzar al agente se muestran al cliente; no generan un registro ficticio en el journal del agente.

SDD: la Spec determina el flujo y su regresión. SDLC: construcción/pruebas aquí; despliegue y mantenimiento del agente permanecen separados.
