# Plan de análisis SonarQube

Estado: propuesto para la preparación de Repo 2. **SonarQube no está instalado, no se ha levantado ningún contenedor y no se ejecutó un scan.**

## Alcance analizable

| Componente | Lenguajes/artefactos fuente | Observaciones |
| --- | --- | --- |
| Frontend_1_FuelFlow | JavaScript, HTML, CSS | Node `node:test`; análisis estático y cobertura solo si se genera reporte compatible. |
| Frontend_2_PrimaxPrime | JavaScript, HTML, CSS, configuración Playwright/Capacitor; Android puede contener Java/Kotlin/XML | Mantener reportes/browser artifacts fuera de fuentes. |
| Frontend_3_PrimaxControl | JavaScript, HTML, CSS | Incluye proxy/BFF y cliente web. |
| Backend | TypeScript/JavaScript, Prisma schema/SQL, scripts | NestJS; Sonar analiza TS/JS; definir inclusión de Prisma/SQL según edición/plugins disponibles. |
| PlateRecognition | Python | Flask, OpenCV y OCR; cobertura posible mediante XML si se genera. |
| PrintAgent | JavaScript, HTML/CSS si aplican | Servicio local Node y tests `node:test`. |

SonarQube puede analizar fuentes existentes sin cambiar arquitectura ni requerir nueva API. Confirmar previamente versión/edición, licencia, scanner y compatibilidad de análisis antes de preparar configuración final.

## Exclusiones iniciales

Excluir dependencias, builds y datos generados, revisando rutas reales por componente:

`**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/coverage/**`, `**/.next/**`, `**/playwright-report/**`, `**/test-results/**`, `**/__pycache__/**`, `**/.pytest_cache/**`, `**/.venv/**`, `**/venv/**`, `**/vendor/**`, `**/cache/**`, outputs generados de Capacitor/Android y fixtures binarios cuando no sean código fuente.

No excluir automáticamente migraciones o tests fuente; pueden aportar revisión útil. Excluir secretos, archivos `.env`, artefactos de terceros y archivos de referencia histórica si no pertenecen al alcance V2, evitando ocultar código ejecutable por conveniencia. Ajustar exclusiones a rutas confirmadas en configuración real.

## Métricas y lectura

Registrar Bugs, Vulnerabilities, Security Hotspots, Code Smells, Duplications y Coverage cuando exista reporte válido. Revisar hotspots manualmente; un hotspot no equivale por sí solo a vulnerabilidad confirmada. No prometer cero vulnerabilidades, no manipular exclusiones ni modificar código artificialmente para subir métricas.

## Flujo académico propuesto

`Scan inicial → registrar hallazgos → corregir problemas relevantes → ejecutar tests → scan final → comparar resultados`

Guardar fecha, versión/configuración, commit/revisión de fuentes, métricas inicial/final, hallazgos aceptados/rechazados y justificación. Hacer el scan final sobre las mismas fuentes y configuración comparable. La cobertura se reporta solo si los tests generan y Sonar importa reportes válidos; análisis estático no equivale a cobertura.

## Preparación antes de ejecución

1. Aprobar alcance, versión y modo local de SonarQube Docker; decidir si se requiere persistencia/credencial.
2. Preparar exclusiones y rutas de reportes según los componentes existentes.
3. Ejecutar los tests pertinentes y producir cobertura sin alterar su lógica.
4. Ejecutar un scan de referencia; revisar hallazgos prioritarios de seguridad y bugs.
5. Resolver solo problemas relevantes con cambios revisables y pruebas; dejar deuda justificada.
6. Repetir tests y scan comparable; archivar resultados para exposición.

No se levanta Docker en esta fase.
