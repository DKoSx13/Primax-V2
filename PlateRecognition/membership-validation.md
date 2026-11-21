# Validación del OCR de membresías Prime

Imagen de referencia: `fixtures/membership-PRIME-001.png`. Es el recorte de la tarjeta que la compilación vigente de Prime renderiza para una sesión demo autenticada contra el Backend de laboratorio. La ventana vertical de Chromium era de 390 × 844 píxeles CSS, con factor de escala 2. El recorte es de 692 × 268 píxeles y contiene el código y la indicación de presentación.

## Diagnóstico

En la captura vertical de 390 px procesada como JPEG por el importador, la lectura anterior obtuvo `PRIME-PRIME001` con 90,44 %. Tesseract había leído `PRIME` de la fila superior y `PRIME-001` de la tarjeta. El agrupador anterior concatenaba palabras consecutivas del TSV aunque estuvieran en filas distintas. El código concatenado tenía una forma válida, por lo que competía con el correcto. FuelFlow muestra el aviso de confianza insuficiente cuando Backend devuelve `recognized: false`, incluido el caso de un código sin membresía activa.

En la captura de 360 px, la primera lectura de página dividió `PRIME` y `-001` en dos palabras al 72,9 %. Otras variantes de esa misma captura sí permitieron reconocer el código. La separación del guion, la confusión 0/O y la pérdida de detalle en imágenes pequeñas explican diferencias entre capturas. La tarjeta vigente ya ofrece fondo claro, texto oscuro y ceros diferenciados. El ajuste se aplicó al OCR.

La unión ahora exige proximidad horizontal y solapamiento vertical, y mantiene íntegros los códigos que Tesseract ya leyó como una sola palabra. Una lectura débil puede repetirse sobre el recorte de la línea con el modo de texto de una línea de Tesseract. Dos observaciones permiten corroborar las lecturas débiles y el servicio puede responder antes cuando ya tiene una lectura fuerte. Los porcentajes provienen de Tesseract y el filtro de Backend continúa en 75 %.

## Importación en FuelFlow

El navegador usó FuelFlow, el BFF, Identity y el OCR en un Compose aislado con PostgreSQL. Se utilizó el diálogo real de importación, que vuelve a codificar el archivo como JPEG antes de enviarlo.

| Imagen importada | Resultado | Confianza |
|---|---|---:|
| Placa `ABC-123.png` | ABC-123 | 91,58 % |
| PNG de referencia | PRIME-001 | 94,75 % |
| Captura vertical de 360 px | PRIME-001 | 90,59 % |
| Captura vertical de 390 px | PRIME-001 | 90,74 % |
| Captura vertical de 412 px | PRIME-001 | 91,12 % |
| Captura vertical de 390 px con sesión autenticada contra Backend | PRIME-001 | 90,85 % |

Verifiqué que leer la placa dejara vacío el código, y que leer la membresía conservara la placa. Backend rechazó `XYZ-999` con `PRIME-001` y aceptó `ABC-123` con ese código. FuelFlow avanzó a la pantalla de monto; la atención de prueba se cerró antes de autorizar un pago. La validación fue con importación de archivos.

## Variaciones simuladas

Cada imagen se envió al endpoint HTTP real de OCR con Tesseract 5.3. Las transformaciones se aplicaron a la captura vertical de 390 px después de la codificación de FuelFlow. Se conservó el lienzo original para simular distancia. Los porcentajes de escala son relativos al tamaño de esa captura.

| Entrada | Resultado del OCR | Confianza | Tiempo HTTP |
|---|---|---:|---:|
| PNG de referencia, sin recodificar | PRIME-001 | 95,53 % | 5,12 s |
| Distancia, escala 70 % | PRIME-001 | 91,67 % | 1,98 s |
| Distancia, escala 50 % | PRIME-001 | 90,72 % | 3,76 s |
| Escala 50 % y desenfoque gaussiano σ 1,6 px | PRIME-001 | 82,82 % | 9,15 s |
| Distancia, escala 35 % | Sin candidato | 0 % | 8,37 s |
| Escala 35 % y desenfoque gaussiano σ 2,8 px | Sin candidato | 0 % | 5,66 s |
| Luz baja, brillo al 48 % | PRIME-001 | 91,27 % | 2,25 s |
| Bajo contraste, transformación 104 + 0,34 × píxel | PRIME-001 | 91,35 % | 1,96 s |
| Sombra lateral, gradiente de brillo de 32 % a 100 % | PRIME-001 | 89,92 % | 12,48 s |
| Perspectiva trapezoidal, esquinas a (12 %, 4 %), (91 %, 10 %), (98 %, 93 %), (4 %, 98 %) | PRIME-001 | 91,07 % | 8,54 s |
| Rotación de 12° y escala 85 % | PRIME-001 | 89,22 % | 12,18 s |

La escala 35 % había producido una lectura aislada de `PRIME-007` al 82,56 % en el OCR anterior. La corroboración evita ofrecer ese candidato. Los tiempos son observaciones individuales. La sombra lateral y la rotación de 12° excedieron en estas mediciones los 12 s del cliente de Identity, aunque el servicio OCR devolvió el código. La referencia y las capturas verticales se validaron también a través de Identity y FuelFlow. Las distancias, la iluminación y las perspectivas fueron simuladas.

## Pruebas automatizadas

`python -B -m unittest discover -v` pasó 15 pruebas en el contenedor aislado. Incluye el PNG de referencia, placas, códigos Prime actuales y antiguos, entrada sin texto y el agrupamiento de palabras.

## Despliegue selectivo

Desde el repositorio y con las variables habituales del proyecto de feria. Esperar a que terminen las atenciones en curso antes de recrear el servicio.

```bash
cd /home/primax/Proyectos/Primax-V2-astra-lot5
docker compose -p primax-astra-original build plate-recognition
docker compose -p primax-astra-original up -d --no-deps --no-build --pull never --wait --wait-timeout 90 plate-recognition
curl -fsS http://127.0.0.1:27200/api/v1/health
```
