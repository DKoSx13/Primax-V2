# Incremento 06 — SonarQube local y validación conjunta

Rama `quality/v2-sonarqube`, originada en main 7cde52c. Fuentes funcionales reunidas solo en `validation/v2-integration`, mediante cherry-picks de PR #2–#5 y resolución revisada de conflictos. No se mergeó main ni se tocó V12.1 histórica.

## Entorno y scans reproducibles

SonarQube Community Build 26.10.0.133078 en Docker, loopback `127.0.0.1:26900`; scanner CLI 8.1.0.6389. Imagen Sonar `sha256:f95aaa9016dd4e92c7d70691167a6d96dbb5d8acffd61eba1cb4335d364a7840`; scanner `sha256:47956b669bf486bdad919e1cbd0533223515aa0b6d1d31763e5a3754942df6d7`. Token/password locales solo en archivos ignorados, sin imprimirlos. No usa staging.

`sonar-project.properties` incluye Backend/src, fuentes HTML/JS/CSS de FuelFlow, Prime, Control y PrintAgent. Excluye dependencias, binarios, builds, www, coverage generado, tests/fixtures y caches. No se excluyó código válido para esconder issues. SCM se desactiva porque JGit dentro de Linux no puede resolver el fichero .git de un worktree con ruta absoluta Windows; no afecta el análisis de fuentes. Logs y JSON de métricas/issues quedan en `Docs/quality/`.

Cobertura importada: LCOV real de Jest Backend, generado sobre la integración con Node 22.23.4. No se atribuye cobertura inexistente a los frontends. El LCOV generado normaliza `SF:src/` a `SF:Backend/src/` para el root del scanner. `tools/sonar-results.cjs` consulta únicamente Sonar local y exporta métricas, bugs/vulnerabilidades, hotspots y smells críticos, sin token.

| Métrica | Inicial | Final |
| --- | ---: | ---: |
| Bugs | 38 | 35 |
| Vulnerabilities | 5 | 4 |
| Security Hotspots | 0 | 0 |
| Code Smells | 12 | 12 |
| Duplicated lines | 6.0 % | 6.0 % |
| Coverage (global de fuentes analizadas) | 31.5 % | 31.9 % |
| ncloc | 16348 | 16364 |

## Revisión y correcciones priorizadas

- **OCR:** se cierra una brecha real de configuración: en producción, OCR habilitado requiere HTTPS sin credenciales embebidas. Conserva HTTP local y la excepción académica privada ya existente. Test específico de HTTPS/rechazo HTTP y compatibilidad local.
- **PowerShell:** PrintAgent usa una ruta absoluta del sistema validada, en lugar de resolver `powershell.exe` por PATH/cwd. Test de rutas manipuladas y suite completa del agente.
- **Traducciones:** se separan tres claves duplicadas `voz_monto_post` (texto visual versus voz) conservando los tres idiomas y evitando que una definición sobrescriba otra.
- **Auditoría de secretos:** el script legado buscaba fuera del repo y solo una carpeta V12 inexistente. Se corrige la raíz y se revisan archivos tracked/nuevos no ignorados; solo informa ubicaciones, nunca valores.

## Issues restantes y límites de la clasificación

No se intentó llegar a cero. Las 4 alertas restantes de vulnerabilidad son S5332 en los defaults OCR (HTTP local/dockernet, ahora HTTPS obligatorio en producción), S2245 en jitter de reintento (Math.random no genera secretos) y S5332 en transporte HTTP PrintAgent loopback deliberado. Se documentan como contextos revisados; no se cambiaron reglas ni se silenció el analizador. La instalación local del agente sigue requiriendo origen exacto y CORS/LNA del navegador.

Los 35 bugs incluyen inferencias S3403 sobre el estado mutable de eventos de FuelFlow y parámetros usados en tests, promesas de UI ya controladas o a revisar, y orden alfabético de listas de contrato de PrintAgent con orden ASCII común a validación. Se mantiene la lógica financiera y de protocolo. Las alertas de promesas pendientes de una revisión más amplia quedan como deuda, sin afirmar que todas sean falsas. Los 12 smells y 6 % de duplicación no justificaron un refactor masivo; no hay smells blocker/critical en el snapshot exportado. Convenciones revisadas: clases PascalCase, variables camelCase y estados/constantes UPPER_SNAKE_CASE; nombres históricos no se renombraron sin beneficio funcional.

## Validación integrada y SDD

| Área | Evidencia | Resultado |
| --- | --- | --- |
| Backend unitarias + cobertura | Jest Node 22 sobre integración | 25 suites / 198 tests; líneas 52.46 %, statements 51.62 % en Backend |
| Backend E2E completo | `tools/validate-v2-e2e.cjs` | 20 suites / 309 tests: 279 generales/V2 + 20 financieros históricos + 10 conciliación |
| Seguridad de herramientas DB | `Backend/scripts/database-safety.test.cjs` | 5 tests; cloud bloqueado |
| FuelFlow | tests/build | 148 tests, build correcto |
| Control | tests/build | 19 tests, build correcto |
| Prime | tests/build | 27 tests, build correcto |
| PrintAgent | tests con RemoteSigned solo en proceso local | 56 tests; sin afirmar salida física |
| OCR | unittest en contenedor aislado de imagen existente, fuente V2 montada read-only | 12 tests funcionales |
| Navegador Chromium | `tools/v2-ui-validation.cjs`, API explícitamente simulada | Cliente solicita/cancela; Supervisor acepta/resuelve; sin errores JS |

La primera regresión E2E encontró una aserción de formato antiguo y bases locales con nombres contractuales distintos. La aserción se corrigió en PR #5; el runner agrupa suites conservando sus guardas y asigna cada base local correcta. Chromium detectó además el HTML de asistencia sin bootstrap de módulo; se corrigió en PR #2, con test de documento completo. Ambas correcciones fueron publicadas en sus PR originales y revalidadas.

SDD: Specs 04/05/06 → implementación en PR #2–#5 → tests y matrices individuales → esta validación. SDLC: planificación/análisis/diseño reflejados en Specs, construcción en incrementos, pruebas locales aquí, despliegue V2 separado y mantenimiento como siguientes etapas. Staging y validación física siguen pendientes; no se declara el objetivo global como finalizado.
