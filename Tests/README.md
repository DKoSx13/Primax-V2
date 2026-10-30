# Calidad y pruebas de Primax V2

Las pruebas ejecutables permanecen junto a cada componente (`tests/`, `test/` y specs de Backend) porque usan imports y rutas relativas. No se mueven como parte de esta estrategia.

- [Inventario y estrategia de pruebas](../Docs/quality-test-inventory.md): suites, clasificación por alcance y ejemplos académicos.
- [Convenciones de código](../Docs/code-conventions.md): estilo esperado y observaciones de naming para revisar en cambios futuros.
- [Plan SonarQube](../Docs/sonarqube-plan.md): propuesta de análisis con Docker, exclusiones y flujo académico; aún no se instala ni ejecuta.
- [Requisitos técnicos pendientes](../Docs/technical-readiness.md): requisitos para Backend/OCR, PostgreSQL actual y preparación del Repo 2.

No se afirma cobertura completa por el mero hecho de existir pruebas. Antes de crear el Repo 2 oficial se deben validar builds y suites por componente en un entorno preparado, revisar los hallazgos de calidad y resolver los pendientes documentados.
