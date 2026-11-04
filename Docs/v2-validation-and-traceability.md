# Primax V2 — validación y trazabilidad de incrementos 02–06

Fecha: 2026-10-30. Estado: **funcionalidad y calidad validadas localmente; staging preparado, pendiente de acceso y despliegue público; impresión física pendiente**. No se declara aún «PRIMAX V2 — FUNCIONALIDAD, CALIDAD Y STAGING VALIDADOS».

Se trabajó únicamente en `C:/Users/MATHIAS/Proyecto/Primax-V2` después de la corrección de ruta del usuario. Main actualizado: `7cde52c`. Cada rama funcional y calidad partió de ese main; no hay merges automáticos. `validation/v2-integration` reúne los commits mediante cherry-pick, resolviendo conflictos de imports y panel Supervisor sin perder funcionalidades.

## Reporte por incremento

| Incremento / rama | Archivos principales | Migraciones | Validación propia | Commit(s) / PR |
| --- | --- | --- | --- | --- |
| 02 feature/v2-02-assistance | Backend/src/assistance; FuelFlow assistance.js/script/index/gateway; Control assistance.js/app; Docs/increment-02-assistance.md | 20261030020000_v2_assistance, 20261030020100_v2_assistance_invariants | 8 E2E reales de DB/HTTP, 189 unitarias Backend; FuelFlow 142 con corrección de bootstrap; Control 18; builds | 63bf1e5 + 03a731e; https://github.com/DKoSx13/Primax-V2/pull/2 |
| 03 feature/v2-03-payments | DTO/servicios pagos/transacciones, payment-incidents.ts, supervisor-payments.ts; FuelFlow paymentRecovery.js; Control payment-recovery.js | Ninguna | 5 E2E pagos; Backend 192, FuelFlow 140, Control 16; builds | df5854a; https://github.com/DKoSx13/Primax-V2/pull/3 |
| 04 feature/v2-04-receipts | FuelFlow script/index; Control app/print-agent; PrintAgent/store.mjs + journal test | Ninguna | FuelFlow 139, Control 17, PrintAgent 55; builds | 98f0cd7; https://github.com/DKoSx13/Primax-V2/pull/4 |
| 05 feature/v2-05-prime | membership-number.ts, membership-code.ts, schema/seed; pagos/vehículos/alerts compatibles con alias; fixtures Prime/FuelFlow | 20261030050000_v2_prime_numbering | 53000 códigos, 2 E2E concurrentes/migración; Backend 194, FuelFlow 138, Prime 27; builds | 9470166 + dcb3979; https://github.com/DKoSx13/Primax-V2/pull/5 |
| 06 quality/v2-sonarqube | sonar-project.properties; environment.ts, PrintAgent/windows.mjs; traducciones; runners; auditor de secretos; Docs/quality | Ninguna | Scan inicial/final + regresión integrada de la tabla siguiente | ba59e1e; https://github.com/DKoSx13/Primax-V2/pull/6 |
| Staging deployment/v2-staging | Infrastructure/v2-staging; tools/validate-staging-v2.cjs + tests; este documento | Preparación; ninguna ejecutada en cloud | 9 tests de preflight sin cloud; recursos públicos pendientes | PR de preparación de staging; ver reporte final |

Los números de pruebas por rama difieren porque cada rama parte de main, sin incorporar los demás incrementos hasta la integración.

## Matriz SPEC → implementación → test → validación

| Spec / requisito | Componente / código | Tests | Resultado |
| --- | --- | --- | --- |
| 04 §4: solicitar asistencia/contexto/motivos/OTRO | Backend assistance.controller/service; FuelFlow assistance.js | assistance.e2e-spec.ts; assistance.test.js; gateway tests; Chromium | Persistencia, idempotencia, contexto real de estación/terminal/surtidor y operación opcional |
| 04 §4: toma atómica/responsable/acceptedAt | AssistanceService.act, UPDATE condicional serializable | Dos Supervisores concurrentes, 409 perdedor | Un responsable, una aceptación auditada |
| 04 §4–5: notas/resolver/escalar/cancelar/incidencia | AssistanceService, Control assistance.js | E2E workflow/carrera cancelación; Chromium cliente/Supervisor | Timestamps/resultados/observaciones y vínculo de incidencia |
| 04 §7–8: roles/grants/station scope/auditoría | AccessGuard preservado, readScope/act; OperationalAuditEvent | E2E de asignación/grants/propietario; UPDATE/DELETE auditoría rechazados | Supervisor sin privilegios de bloqueo/restauración; Admin en alcance y SuperAdmin global |
| 05 §1: métodos sin efectivo, historial intacto | V2_PAYMENT_METHODS, DTO y servicios; UI FuelFlow | E2E de rechazo de EFECTIVO y lectura histórica; tests UI | Enum histórico permanece; creación V2 rechaza efectivo |
| 05 §2: pagos seguros e incidencias | OnlineOrdersService; payment-incidents; SupervisorPaymentsService | E2E timeout/rechazo/reselección/cancelación; captura concurrente única | Backend/proveedor es autoridad; Supervisor no marca pagado |
| 05 §3: PrintAgent exclusivo/error sin cambio financiero | printReceipt.js, Control print-agent.js; PrintAgent JobStore | tests unknown/rejected/offline/replay/journal; 56 tests agente | Sin window.print ni fallback de navegador; salida física nunca fingida |
| 06 §1–3: formato, contador, UUID/UNIQUE, migración | membership-number.ts, contador BIGINT, MembershipCodeAlias | formatter 53000 valores; DB concurrencia y SQL exacto migración; alias ajeno | Límites aprobados, UUID/relaciones/importes preservados |
| Calidad: análisis y corrección útil | sonar-project.properties, config OCR, ejecutable absoluto | JSON/logs inicial/final + test HTTPS/PATH | 38→35 bugs, 5→4 alertas de vulnerabilidad, deuda contextual documentada |
| Staging: aislamiento/origins/secretos | projects.json, render.yaml, env.example, validador | 9 tests preflight | Preparado; no hay despliegue ni URLs verificadas |

## Regresión final de la combinación

- Backend: build correcto; 25 suites / 198 tests unitarios; 20 suites / 309 E2E; 5 tests de seguridad de herramientas DB.
- E2E completas: 279 generales/V2 (incluye asistencia, pagos, membresías, roles/permisos y estaciones), 20 financieras históricas y 10 de inventario/conciliación.
- FuelFlow: 148 tests y build; Control: 19 y build; Prime: 27 y build.
- OCR: 12 tests unittest funcionales en contenedor aislado con fuentes V2 read-only.
- PrintAgent: 56 tests y cadena HTTP/almacén/adaptador verificada con fixtures, sin afirmar salida física.
- Chromium: solicitud OTRO/observación/cancelación del cliente; aceptación y resolución del Supervisor; sin errores JavaScript. API de esta prueba UI explícitamente simulada; las reglas reales de DB/HTTP están cubiertas por E2E Backend.
- SonarQube Community 26.10.0.133078 local, scanner 8.1.0.6389. Coverage global 31.5→31.9 %, duplicación 6.0 %, smells 12, hotspots 0. Backend: líneas 52.46 %, statements 51.62 %. Fuentes y exclusiones comparables; métricas sin forzar cero issues.
- Auditor de secretos corregido: sin hallazgos en archivos tracked/no ignorados. Ningún secreto se guardó en commits.

Bases PostgreSQL/Redis exclusivas de V2 en loopback; no se ejecutó una prueba destructiva en Neon. Los servicios V12.1 preexistentes permanecen sin cambios. Node 22.23.4 usado para la regresión Backend; las primeras pruebas por incremento también se ejecutaron con Node 24.22.1 del equipo, sin alterar el contrato Node 22 del proyecto.

## Hallazgos y pendientes reales

Se corrigieron captura DEMO de tarjeta sin validar perfil, tratamiento de una orden pending como ambiguo, bootstrap HTML perdido en asistencia, aserción de formato obsoleta, configuración OCR HTTP en producción, resolución PowerShell por PATH y traducciones duplicadas. Los fixes funcionales regresaron a sus PR de origen.

Pendientes: cuentas cloud autenticadas y recursos V2 reales; bootstrap administrativo de staging aislado; validación pública de cookies/CORS/tickets/alcance/OCR; transporte seguro para PrintAgent desde HTTPS público, si se requiere ese escenario; PeriPage A6 instalada y prueba física. El agente actual exige PeriPage A6(1)/driver/USB/203 DPI, pero el sistema solo tiene Epson L3160 y colas virtuales. No se cambió ese contrato ni se imprimió mediante navegador.

No se integra tarjeta comercial sin adapter; fuera del demo se rechaza en forma segura. Reselección de orden pendiente está implementada para demo; un proveedor comercial sin adapter se escala, sin cobros inventados. Bandeja de asistencia por polling, hasta 100 resultados con activos primero; esa limitación está declarada en PR #2.

## SDD y SDLC

**SDD:** cada incremento comienza por Specs 04/05/06 y sus criterios; continúa con implementación aislada, pruebas afectadas y evidencia de validación. Las matrices enlazan los cuatro niveles, y los PR registran riesgos/pendientes.

**SDLC:** Planificación → Análisis → Diseño → Construcción → Pruebas → Despliegue → Mantenimiento. Specs/decisiones corresponden a planificación/análisis/diseño; ramas/commits/PR a construcción; tests/sonar/Chromium a pruebas; manifiestos V2 a preparación del despliegue. Despliegue público y mantenimiento no se consideran completados antes de verificar el entorno real.
