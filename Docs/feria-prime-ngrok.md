# Acceso temporal al APK de Primax Prime

**Solo demostración local y temporal. No utilizar como gateway de producción ni exponer datos reales.**

El proxy independiente escucha en `127.0.0.1:27285` de Debian y reenvía solicitudes seleccionadas al backend de `127.0.0.1:27200`. PostgreSQL guarda las cuentas de Prime y sus membresías. El acceso por el proxy requiere una cuenta registrada para la feria o el alias de la cuenta demo.

## Rutas habilitadas

| Método | Rutas bajo `/api/v1` |
|---|---|
| POST | `/auth/login`, `/auth/register`, `/memberships/me/recharges`, `/vehicles`, `/rewards/redeem` |
| PATCH | `/memberships/me/profile` |
| GET | `/benefits`, `/memberships/me`, `/memberships/me/wallet`, `/memberships/me/transactions`, `/memberships/me/rewards`, `/memberships/me/redemptions` |
| OPTIONS | Preflight de las rutas anteriores para el origen Android `https://localhost` |

Prime consulta las seis rutas GET al cargar la sesión. Los listados aceptan la paginación del APK. El proxy rechaza recuperación de contraseña, órdenes de pago, administración, Control, terminales, kioscos y OCR. La recarga demo tiene un máximo de S/ 100 por solicitud. El proxy admite cuerpos de hasta 4 KiB y limita los registros a cinco intentos por minuto y la lista de feria a 100 entradas. Los límites son globales porque las conexiones llegan por SSH.

El proxy guarda en memoria las huellas de los JWT de sus registros e inicios de sesión por hasta una hora. Cada ruta personal pasa el JWT al backend. El directorio privado `~/.primax-feria` guarda la lista de feria y las reservas de registro. El proxy escribe la reserva antes de llamar al backend y comprueba el ID devuelto al iniciar sesión. Si PostgreSQL confirma un alta y se pierde la respuesta, el usuario puede ingresar con sus credenciales. Conserva ese directorio al reiniciar y usa una sola instancia del proxy por directorio.

## Iniciar en Debian

En Debian, actualiza primero el servicio de identidad del Compose local y comprueba la API. El proxy y el backend necesitan estar actualizados juntos.

```bash
# Desde la raíz del repositorio local elegido, sin reutilizar una instalación operativa.
docker compose build identity-service
docker compose up -d --no-deps --no-build --pull never --wait identity-service
curl -fsS http://127.0.0.1:27200/api/v1/health
```

Con Node.js 22, identifica el proceso anterior con `ss -ltnp 'sport = :27285'`. Detén ese PID con `kill -TERM PID` y arranca el proxy actualizado en una terminal con el código de feria vigente.

```bash
read -rs -p 'Código de feria vigente: ' prime_feria_codigo
printf '\n'
PRIME_PROXY_ACCESS_CODE="$prime_feria_codigo" node tools/prime-demo-proxy.cjs
unset prime_feria_codigo
```

Tras un reinicio del proxy, los usuarios deben volver a iniciar sesión. El campo **Correo o DNI** también acepta el alias de la cuenta demo.

## Añadir el reenvío en Windows

En PowerShell, identifica primero el proceso de Windows que escucha en el puerto del túnel.

```powershell
Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 27285 -State Listen |
    ForEach-Object { Get-Process -Id $_.OwningProcess }
```

Si el reenvío está detenido, abre un túnel en una terminal de PowerShell y déjala abierta.

```powershell
ssh.exe -p 22225 -N -o ExitOnForwardFailure=yes -L 127.0.0.1:27285:127.0.0.1:27285 primax@127.0.0.1
```

También puedes agregar literalmente `-L 127.0.0.1:27285:127.0.0.1:27285` al comando SSH habitual la próxima vez que lo inicies. Con el reenvío activo, este preflight local debe devolver HTTP 204 y el origen `https://localhost`.

```powershell
curl.exe -i -X OPTIONS "http://127.0.0.1:27285/api/v1/auth/login" -H "Origin: https://localhost" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"
```

## Abrir ngrok y preparar el APK

En la cuenta ngrok, deja desactivada la captura completa de peticiones y respuestas en **Traffic Inspector**. El agente se inicia con la inspección local desactivada. Usa el dominio HTTPS asignado que se pasará al APK.

```powershell
$DominioNgrok = Read-Host "URL HTTPS del dominio asignado en ngrok"
ngrok http http://127.0.0.1:27285 --url $DominioNgrok --inspect=false
```

El APK debe haberse compilado con `PRIME_API_BASE_URL=https://<dominio-ngrok>/api/v1`. Si utiliza otra URL, compílalo en el entorno Windows que ya tiene Android y las dependencias del proyecto. Desde la raíz de ese checkout, en otra terminal:

```powershell
$DominioNgrok = Read-Host 'URL HTTPS del dominio asignado en ngrok'
$env:PRIME_API_BASE_URL = $DominioNgrok.TrimEnd('/') + '/api/v1'
npm --prefix Frontend_2_PrimaxPrime ci
npm --prefix Frontend_2_PrimaxPrime run android:debug
```

Verifica un registro, un nuevo inicio de sesión y una consulta del saldo en el dispositivo antes de entregar el acceso al jurado. Repite el flujo con otra cuenta y comprueba que muestra su propia membresía. En el plan gratuito, comprueba que el WebView recibe JSON si aparece el aviso de navegador de ngrok.

Referencias de operación. [CLI de ngrok](https://ngrok.com/docs/gateway/agent/cli), [captura de tráfico](https://ngrok.com/docs/obs/traffic-inspection/http-requests), [aviso de navegador](https://ngrok.com/faq).

## Cerrar el acceso al final

1. Pulsa **Ctrl+C** en la ventana de ngrok. Confirma que el endpoint dejó de estar activo en el Panel de ngrok.
2. Pulsa **Ctrl+C** en la ventana SSH dedicada al puerto 27285. Si agregaste el puerto al túnel compartido, cerrarlo también detiene los demás reenvíos de esa sesión. Puedes volver a iniciarlos con el comando habitual.
3. Detén el proxy de Debian mediante **Ctrl+C** en su terminal o mediante `kill -TERM PID` con el PID que muestra `ss -ltnp 'sport = :27285'`. Verifica que `ss -ltn 'sport = :27285'` queda sin un socket en escucha.

## Pruebas de registro

Ejecuta las pruebas unitarias desde el repositorio. La prueba de integración opcional crea tres cuentas sintéticas y modifica exclusivamente una instancia de laboratorio; nunca la exposición ni una base real. Requiere que el gateway y PostgreSQL del mismo laboratorio estén levantados.

```bash
npm --prefix Frontend_2_PrimaxPrime test
node --test tools/prime-demo-proxy.test.cjs

# Ejemplo: laboratorio primax-final01, API en 28200 (ajustar solo a tu laboratorio).
PRIME_TEST_UPSTREAM=http://127.0.0.1:28200 \
  PRIME_TEST_POSTGRES_CONTAINER=primax-final01-postgres-1 \
  node --test tools/prime-demo-proxy.test.cjs
```

En la verificación anterior del proxy demo se comprobaron las seis lecturas del APK, el login con alias, el rechazo de un JWT obtenido directamente del backend y la idempotencia de una recarga de S/ 1. También se probaron CORS, los límites de monto y tamaño de solicitud, el HTTP 429 y el rechazo de rutas y métodos restringidos.
