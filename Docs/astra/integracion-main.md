# Preparación de integración a main — 2026-11-11

No se realizó push, merge, cierre de PR, cambio de base ni modificación de ramas compartidas. Fuente remota: consultas de solo lectura de GitHub de los PR #9–#17, archivadas en `evidence/pr-status-20261111.json`. Todos continúan abiertos, draft, sin merge y mergeables con sus bases actuales; esto no certifica pruebas ni conflictos entre ellos.

| PR | Situación comprobada frente a Astra | Acción propuesta |
|---|---|---|
| #9 | Head no ancestro. PNG corporativo, login, registro y CSS de login idénticos; encabezado y proporciones presentes en QA. `primax.jpg` difiere, pero no tiene referencias en los clientes actuales. Versionado de imágenes y módulos presente. | Conservar implementación QA; no cherry-pick de la rama completa. |
| #10 | Head no ancestro. Ambos PNG corporativos idénticos; diseño transparente presente. Se detectó un faltante real: versión en imports transitivos de Control. | Faltante incorporado localmente en `1e585ff`; verificar build servido y navegación antes de integrar. |
| #11–#14 | Los cuatro heads son ancestros de Astra. | No volver a aplicar recibos, disponibilidad, recuperación ni finalización. |
| #15 | Head no ancestro, pero la cuadrícula `.pay-grid-methods`, tres columnas, máximo 760px y una columna bajo 540px ya existen. | Conservar implementación QA; no importar CSS antiguo completo. |
| #16–#17 | Ambos heads son ancestros de Astra. | Conservar historia y actualizar documentación con verificaciones nuevas. No confundir puntos de entrada con proyectos independientes. |

El commit main consultado es `58a2206d295d4f20c15495da6c1a8ec36572d4a5`. `git merge-tree --write-tree` entre ese commit y `1e585ff` terminó sin conflictos (resultado en `evidence/main-merge-tree.txt`). Es una comprobación de árboles locales, sin actualizar refs; se deberá repetir sobre el SHA final a publicar y main actualizado. No demuestra CI remoto verde.

Camino propuesto: terminar estabilización en `feat/astra-hexagonal-microservices`, consolidar evidencias y revisar diff contra main; solicitar autorización solo cuando el resultado final esté listo para publicar. Publicar la rama y abrir el PR consolidado únicamente con esa autorización. Esperar CI real asociado al SHA final, revisión y autorización de merge. Cualquier cierre de PR redundantes requiere autorización separada. Mantener `qa/feria-integration` y la instalación de feria intactas.

La extracción vertical arquitectónica debe ir en un commit/PR separado de las correcciones de estabilización; no es requisito para mover correcciones ya probadas a main. La nueva fase dependerá de las pruebas locales pendientes, y nunca justificará eliminar reglas financieras.
