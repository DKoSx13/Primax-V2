# Acceso temporal al APK de Primax Prime

El proxy independiente escucha en `127.0.0.1:27285` de Debian y reenvía solicitudes seleccionadas al Backend de `127.0.0.1:27200`. El APK conserva el login y los JWT que valida Backend. El proxy solo habilita la cuenta demo sembrada. El alias temporal evita que el correo de la fixture y sus credenciales conocidas basten para entrar desde Internet.

## Rutas habilitadas

| Método | Rutas bajo `/api/v1` |
|---|---|
| POST | `/auth/login`, `/memberships/me/recharges` |
| GET | `/benefits`, `/memberships/me`, `/memberships/me/wallet`, `/memberships/me/transactions`, `/memberships/me/rewards`, `/memberships/me/redemptions` |
| OPTIONS | Preflight de las rutas anteriores para el origen Android `https://localhost` |

Prime consulta las seis rutas GET al cargar la sesión. Los listados aceptan la paginación del APK. El alcance del jurado incluye consultar beneficios y movimientos y realizar recargas demo. Registro, recuperación de contraseña, edición de perfil, alta de vehículos, canje, órdenes de pago, administración, Control, kioscos y OCR reciben rechazo del proxy. La recarga demo tiene un máximo de S/ 100 por solicitud. Los límites globales son 240 solicitudes, 12 intentos de login y 12 recargas por minuto, con cuerpos JSON de hasta 4 KiB. Son globales porque todas las conexiones llegan por SSH y el proxy prescinde de cabeceras de IP reenviadas.

El proxy guarda temporalmente en memoria las huellas de los JWT emitidos en sus inicios de sesión, con vencimiento de hasta una hora. Remite el JWT al Backend en cada consulta o recarga. El proceso registra únicamente el inicio o un error de arranque genérico. El alias y la contraseña se comparten por privado con el jurado.

## Iniciar en Debian

Con Node.js 22, desde una terminal del host Debian, deja el proxy en primer plano. Genera un alias nuevo para cada sesión de feria.

```bash
cd /home/primax/Proyectos/Primax-V2-astra-lot5
prime_feria_codigo=$(node -p "require('node:crypto').randomBytes(16).toString('hex')")
printf 'Alias para el jurado: demo+%s@primaxprime.pe\n' "$prime_feria_codigo"
PRIME_PROXY_ACCESS_CODE="$prime_feria_codigo" node tools/prime-demo-proxy.cjs
unset prime_feria_codigo
```

El campo **Correo o DNI** del APK recibe el alias mostrado. En **Contraseña** se utiliza la contraseña vigente de esa cuenta demo. Si el proxy se reinicia, hay que volver a iniciar sesión con el alias de la nueva ejecución.

## Añadir el reenvío en Windows

En otra terminal de PowerShell, abre un segundo túnel usando el mismo destino del SSH existente. Si ese túnel usa un puerto SSH personalizado, conserva su opción `-p` o su alias de configuración.

```powershell
$DestinoSsh = Read-Host "Mismo destino SSH, usuario@host o alias"
ssh.exe -N -o ExitOnForwardFailure=yes -L 127.0.0.1:27285:127.0.0.1:27285 $DestinoSsh
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
$DominioNgrok = Read-Host "URL HTTPS que muestra ngrok"
$env:PRIME_API_BASE_URL = $DominioNgrok.TrimEnd('/') + '/api/v1'
npm --prefix Frontend_2_PrimaxPrime run android:debug
```

 Verifica un inicio de sesión y una consulta del saldo en el dispositivo antes de entregar el acceso al jurado. En el plan gratuito, comprueba que el WebView recibe JSON si aparece el aviso de navegador de ngrok.

Referencias de operación. [CLI de ngrok](https://ngrok.com/docs/gateway/agent/cli), [captura de tráfico](https://ngrok.com/docs/obs/traffic-inspection/http-requests), [aviso de navegador](https://ngrok.com/faq).

## Cerrar el acceso al final

1. Pulsa **Ctrl+C** en la ventana de ngrok. Confirma que el endpoint dejó de estar activo en el Panel de ngrok.
2. Pulsa **Ctrl+C** en la ventana SSH dedicada al puerto 27285. Si agregaste el puerto al túnel compartido, cerrarlo también detiene los demás reenvíos de esa sesión. Puedes volver a iniciarlos con el comando habitual.
3. Pulsa **Ctrl+C** en el proxy de Debian. El proceso descarta el alias y todas sus sesiones. Verifica que `ss -ltn 'sport = :27285'` ya no muestra un socket en escucha.

## Verificación local ejecutada

Se probó el socket 27285 contra el Backend real del Compose aislado. Se verificaron las seis lecturas del APK, el login con alias y contraseña demo, el rechazo de un JWT emitido directamente por Backend y una recarga de S/ 1. Repetir su identificador abonó S/ 1 en total. También se comprobaron CORS, métodos y rutas bloqueados, el límite de monto, el cuerpo de más de 4 KiB y el HTTP 429. Chromium confirmó el preflight, login y saldo desde `https://localhost`; para el experimento local se desactivó únicamente su comprobación de acceso a loopback. La prueba del APK por HTTPS público queda para la apertura supervisada.
