# Manifiesto de publicación Astra para GitHub público

Estado al preparar este manifiesto: rama `feat/astra-hexagonal-microservices`. El árbol contiene cambios tracked y archivos nuevos en Backend/Gateway, Catalog, Identity, laboratorios FuelFlow, herramientas Astra, documentos y evidencias. La lista concreta debe regenerarse con `git status --short` antes de publicar. No se ha hecho staging, commit ni push.

## Archivos que deben versionarse tras revisión

- Cambios de aplicación y pruebas asociados que ya aparecen en `git status`: `.gitignore`, `Backend/gateway`, `Backend/src`, `Backend/package.json`, pruebas/configuración Identity/Redis y `services/catalog`.
- Código nuevo necesario para continuar: `Backend/src/catalog-reader`, `Backend/src/identity-adapters`, `Backend/src/identity-core`, `Backend/test/identity-core`, `Backend/tsconfig.identity-core.json`, `services/identity`, `Frontend_1_FuelFlow/lab` y `tools/astra`.
- Documentación Astra: `HANDOFF-ASTRA.md`, continuidad Misión 5.10, consolidación Misión 4, documentos de Misión 5 y contratos Catalog.
- Evidencias referenciadas por esos informes, conservando cada archivo sin editar. Antes de hacer público cualquier JSON/TXT, revisar que no contenga datos personales, secretos, rutas internas o información de infraestructura.
- Archivos lock necesarios para reproducir los proyectos. Archivos `.env.example` solo después de comprobar manualmente que contienen placeholders.

Los directorios anteriores identifican áreas, no son comandos seguros para añadir rutas en bloque. Crear una lista final de paths individuales a partir del status real; preservar el trabajo aunque alguna ruta se retenga temporalmente para revisión de privacidad.

## Archivos excluidos

- `.env` reales, contraseñas, tokens, cookies, claves API, credenciales y URLs con credenciales.
- Claves privadas y certificados sensibles (`*.key`, material PEM/P12/PFX privado).
- Dumps, respaldos de bases, datos reales/personales/financieros, volúmenes Docker y recibos operativos.
- `node_modules`, `dist`, clientes generados, cachés y temporales.
- Logs privados o con URLs/credenciales. No publicar logs PrintAgent históricos.
- Respaldos en `/home/primax/.local/state/primax-backups`; nunca subir tar.gz ni manifiestos locales de respaldo.
- Evidencia que revele información privada. Conservarla localmente; excluirla de lo público hasta revisión individual.

## Documentación y evidencias que deben conservarse

Conservar íntegros `Docs/astra/HANDOFF-ASTRA.md`, informes de Misión 4 y 5, propuestas de contratos y las evidencias de éxitos y fallos. La evidencia histórica tiene valor de auditoría; no borrar ni reescribir archivos parciales. El handoff reporta Catalog aprobado técnicamente con tráfico apagado; Identity A.1/A.3 probados en laboratorio, A.2 PasswordReset bloqueado, y sin autonomía completa. No presentar resultados históricos como pruebas ejecutadas en esta preparación.

## Riesgos de publicación pública

1. El árbol mezcla trabajo de varias misiones y archivos no seguidos; un staging amplio puede incluir trabajo ajeno o incompleto.
2. Los nombres de archivo no bastan para detectar secretos: revisar contenido y escanear antes de publicar. No mostrar secretos en logs de revisión.
3. Las evidencias pueden contener rutas, identificadores o datos privados aunque sean sintéticas.
4. `.env.example` podría contener valores que parezcan reales; confirmar placeholders.
5. Identity y Catalog no están conectados al tráfico productivo; A.2 está bloqueado y Administración/Commerce siguen pendientes.
6. El respaldo local es para recuperación privada y no forma parte del commit público.

## Continuidad para Dezkz

1. Leer `HANDOFF-ASTRA.md`, `continuidad-primax-v2-identity-5-10.md`, `mision5-11-propiedad-persistencia.md`, `mision5-11-a2-password-reset.md`, `identity-recovery-policy-port-design.md` y `mision5-11-a3-perfil.md`.
2. Preservar el árbol completo; revisar por separado cambios tracked y no seguidos. No usar `git add -A`.
3. Mantener PasswordReset vigente sin cambios hasta resolver autoridad de `authVersion`, escritores de permisos, orden frente a revocación y reconciliación.
4. No migrar datos ni activar tráfico. A.4 sobre número/alias/Vehicle requiere diseño y autorización antes de alterar transacciones compartidas.
5. Catalog mantiene pendiente la migración del inventario público. Administración y Commerce deben respetar las condiciones del handoff y los límites de propiedad.
6. Para los laboratorios, seguir exactamente los comandos y precauciones del handoff: recursos sintéticos nuevos, evidencia con nombre nuevo y nunca bases/volúmenes existentes.

## Preparación y comandos propuestos

Antes de aprobar una publicación, revisar rama y estado, inspeccionar cada diff y cada archivo nuevo, escanear secretos y seleccionar rutas exactas. No alterar `main`.

```bash
git status --short
git diff --check
git diff --name-only
git ls-files --others --exclude-standard
git switch -c handoff/astra-identity-catalog-2026-11
git add <rutas-exactas-aprobadas>
git diff --cached --check
git diff --cached --stat
git status --short
git commit -m "Prepare Astra Identity and Catalog handoff"
git push -u origin handoff/astra-identity-catalog-2026-11
```

Los últimos comandos requieren aprobación explícita de rama, archivos y contenido staged. No ejecutar `git add`, commit o push sin esa aprobación. Guardar una segunda copia cifrada fuera de la VM por canal privado; no publicar el respaldo.
