# Propuesta local: estabilización Astra y extracción inicial de Catalog

Base propuesta: `main`; head: `feat/astra-hexagonal-microservices`.
No se ha creado un PR, enviado commits ni hecho merge. Esta propuesta requiere
completar los pendientes descritos en `avance.md` antes de solicitar integración.

El smoke usaba una cookie CSRF obsoleta y omitía reclamar la terminal. El cliente
ahora usa el scope de puerto y propietario; comprueba rechazo de CSRF inválido.
Playwright deja de bloquearse con el diálogo de idioma y cierra sus propias
operaciones vacías mediante fixture independiente de la página. Control permite
enfocar tablas desplazables y FuelFlow corrige contraste. Prime conserva bytes de
imágenes en el build. Los artefactos publicados se limitan a resúmenes sin HTTP.

Catalog incorpora un proyecto NestJS con build, Dockerfile, tests, configuración,
dominio, casos de uso, puerto de lectura y adaptadores propios. Paridad por red
contra QA comprobada; el gateway sigue sirviendo el proceso anterior. No presentar
esta fase como separación completa de los cinco servicios ni de sus bases.

## PR originales: decisión de integración

Consulta GitHub del 12 de noviembre: #9–#17 abiertos, draft, mergeable respecto de
sus propias bases. Las bases encadenadas no equivalen a independencia de cambios.
Se verificó nuevamente ascendencia de los seis heads incorporados a Astra.

| PR | Presente / faltante | Dependencia y conflicto | Recomendación / evidencia |
|---|---|---|---|
| #9 | Logo Prime y registro presentes; PNG idéntico. Build divergente corrompía imágenes al reescribir UTF‑8, corregido en misión 3 | Base main; código evolucionado | Conservar Astra con fix; tres imágenes comparadas byte a byte, tests Prime. No importar rama completa |
| #10 | Logos Control incluido V2 idénticos; versionado transitivo presente; configuración T02 añadida después | Base main; build divergente intencionalmente | Conservar Astra; navegación autenticada móvil/tablet y 38 unitarias |
| #11 | Head 4d11441 incorporado: correlativos persistentes | Base main | No duplicar; compra UI y conciliación en regresión Astra |
| #12 | Head 36616b0 incorporado: disponibilidad kiosk | Depende de #11 | No duplicar; bootstrap y smoke CSRF |
| #13 | Head fc473bc incorporado: recuperación | Depende de #12 | No duplicar; recuperación de compra UI y rechazo de otro propietario |
| #14 | Head 471a060 incorporado: finalización | Depende de #13 | No duplicar; T01 sin impresión/T02 simulada |
| #15 | Cuadrícula de tres columnas y una en móvil presentes | Base #14; historia divergente | Conservar CSS Astra; no cherry-pick completo; responsive verificado |
| #16 | Head b609273 incorporado: Compose | Base #14 | No duplicar; laboratorio aislado; Catalog nuevo aún paralelo |
| #17 | Head 284504c incorporado: documentación | Depende de #16 | Consolidar con avance actual; no certificar resultados antiguos como nuevos |

`git merge-tree --write-tree origin/main HEAD` en c5819a1 terminó sin conflictos
textuales contra el ref local consultado. No cambia ramas ni prueba compatibilidad
funcional. Volver a comprobar contra el SHA remoto vigente antes del merge; los
commits posteriores de Catalog y Prime todavía requieren revisión conjunta.

## Validación y límites

Resultados actuales y comandos están en `avance.md` y `evidence/*mission3*.json`.
Tests HTTP de Catalog usan persistencia simulada; verificador QA usa PostgreSQL
real. Playwright Astra usa Backend real. No se ejecutó nuevo CI remoto.

Pendientes de aceptación: recorrido real postpago/Yape/Plin y cobertura de
escrituras administrativas/registro según matriz funcional, revisión del gateway
para Catalog, roles PostgreSQL limitados, y prueba completa del workflow remoto
después de un push expresamente autorizado. Commerce mantiene consistencia en una
misma base; no se dividieron sus transacciones financieras.
