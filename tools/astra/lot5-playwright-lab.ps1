# From the repository root, with Docker Linux, Chromium, playwright-core and Python installed.
$ErrorActionPreference = 'Stop'
function RunDocker {
  & docker @args
  if ($LASTEXITCODE) { throw "Docker step failed ($($args[0]))" }
}
function Secret { [guid]::NewGuid().ToString('N') }
$root = (Get-Location).Path
if (!(Test-Path "$root/tools/astra/lot5-playwright-finance.cjs")) { throw 'Start at the Astra repository root' }
$lab = 'astra-pw5-' + (Secret).Substring(0,10)
$private = (New-Item -ItemType Directory ".cache/$lab").FullName
$evidence = (New-Item -ItemType Directory "Docs/astra/evidence/$lab").FullName
$envFile = "$private/private.env"
$pass = Secret
$redisPass = Secret
$gateway = Secret
$url = "postgresql://postgres:$pass@postgres:5432/lot5pw"
@(
  "DATABASE_URL=$url", "DATABASE_URL_UNPOOLED=$url", "KIOSK_REDIS_URL=redis://:$redisPass@redis:6379/0",
  "KIOSK_GATEWAY_SECRET=$gateway", "KIOSK_API_KEY=$(Secret)", "JWT_SECRET=$(Secret)",
  "KIOSK_SESSION_NAMESPACE=$lab", 'APP_MODE=local', 'PAYMENT_ENV=demo', 'SOLES_PER_POINT=9',
  'DEMO_WALLET_ENABLED=true', 'DATABASE_PURPOSE=local-v12.1-demo', 'DEMO_OPERATIONS_ENABLED=true',
  'PLATE_RECOGNITION_ENABLED=false', 'PASSWORD_RESET_DELIVERY=disabled', 'DEMO_ENCARGADO_EMAIL=playwright@primax.local',
  "DEMO_ENCARGADO_PASSWORD=$(Secret)", "DEMO_PASSWORD=$(Secret)", 'PORT=3000',
  'CORS_ORIGINS=http://127.0.0.1:29481,http://127.0.0.1:29484'
) | Set-Content $envFile -Encoding ascii
"KIOSK_GATEWAY_SECRET=$gateway" | Set-Content "$private/gateway.env" -Encoding ascii
$env:LOT5_LAB = $lab
$env:TEMP = $private
$env:TMP = $private
if (!$env:PW_CORE) { $env:PW_CORE = Get-Content "$env:LOCALAPPDATA/ms-playwright/.links/*" | Select-Object -First 1 }
if (!$env:PW_EXE) {
  $env:PW_EXE = (Get-ChildItem "$env:LOCALAPPDATA/ms-playwright/chromium_headless_shell-*" -Recurse -Filter '*headless*exe' | Select-Object -First 1).FullName
}
Write-Output "New DEMO run $lab"
RunDocker network create --internal $lab
RunDocker run -d --name "$lab-pg" --network $lab --network-alias postgres --tmpfs /var/lib/postgresql/data -e "POSTGRES_PASSWORD=$pass" -e POSTGRES_DB=lot5pw postgres:17.6-bookworm
RunDocker run -d --name "$lab-redis" --network $lab --network-alias redis --tmpfs /data -e "REDISCLI_AUTH=$redisPass" redis:7.4-alpine redis-server --requirepass $redisPass
RunDocker run -d --name "$lab-test" --mount "type=bind,source=$root/Backend,target=/src,readonly" --entrypoint sleep primax-v11-tests:latest infinity
$webStarted = $false
try {
  RunDocker exec "$lab-test" sh -ec 'mkdir /lot && cp -r /src/. /lot && cd /lot && npm ci --no-audit --no-fund >/tmp/install.log 2>&1 && ./node_modules/.bin/prisma generate >/tmp/generate.log 2>&1 && npm run build >/tmp/build.log 2>&1'
  RunDocker network disconnect bridge "$lab-test"
  RunDocker network connect --alias backend $lab "$lab-test"
  $tables = RunDocker exec "$lab-pg" psql -XAt -U postgres -d lot5pw -c "select count(*) from information_schema.tables where table_schema='public'"
  $keys = RunDocker exec "$lab-redis" redis-cli DBSIZE
  if ("$tables,$keys" -ne '0,0') { throw 'Initial storage is not empty' }
  "public_tables=$tables redis_keys=$keys" | Set-Content "$evidence/initial.txt" -Encoding ascii
  RunDocker exec --env-file $envFile -w /lot "$lab-test" sh -ec 'node scripts/local-db-command.cjs prisma migrate deploy >/tmp/migrate.log && node scripts/seed-local-demo.cjs >/tmp/seed.log && node scripts/seed-local-operations.cjs >>/tmp/seed.log'
  $station = 'SELECT id FROM "Station" WHERE code=''PRIMAX-SUR'';' | docker exec -i "$lab-pg" psql -XAt -U postgres -d lot5pw
  if ($station -notmatch '^[0-9a-f-]{36}$') { throw 'Missing synthetic station' }
  Add-Content $envFile "KIOSK_STATION_ID=$station"
  RunDocker cp tools/astra/lot5-playwright-replay-contract.cjs "${lab}-test:/lot/replay-contract.cjs"
  foreach ($port in 3000,3002) {
    RunDocker exec -d --env-file $envFile -e "PORT=$port" -w /lot "$lab-test" sh -c "node dist/src/main.js >/tmp/api-$port.log 2>&1"
  }
  RunDocker run -d --name "$lab-web" --env-file "$private/gateway.env" -e FUELFLOW_KIOSK_AUTH=true -p 127.0.0.1:29481:29481 -p 127.0.0.1:29484:29484 --mount "type=bind,source=$root/Frontend_1_FuelFlow,target=/input,readonly" --mount "type=bind,source=$root/tools/astra/lot5-playwright-web.mjs,target=/web.mjs,readonly" node:22.21.1-bookworm-slim sh -ec 'cp -r /input /ff && cd /ff && node tools/build.cjs && node /web.mjs'
  $webStarted = $true
  RunDocker network connect $lab "$lab-web"
  RunDocker exec "$lab-web" node -e "const wait=ms=>new Promise(r=>setTimeout(r,ms)); (async()=>{for(let i=0;i<60;i++){try{await Promise.all(['http://backend:3000','http://backend:3002','http://127.0.0.1:29484/src/index.html'].map(u=>fetch(u)));return}catch{await wait(1000)}}process.exit(1)})()"
  node tools/astra/lot5-playwright-finance.cjs
  if ($LASTEXITCODE) { throw 'Playwright assertions failed' }
} finally {
  foreach ($terminal in 'T01','T02') {
    if (Test-Path "$private/$terminal.zip") {
      python tools/astra/lot5-playwright-export.py "$private/$terminal.zip" "$evidence/$terminal.zip"
      if ($LASTEXITCODE) { Write-Error 'Trace export failed' -ErrorAction Continue }
    }
  }
  if ($webStarted) {
    RunDocker logs "$lab-web" | Select-String '^/api/v1/' | ForEach-Object { $_.Line } | Set-Content "$evidence/replicas.txt" -Encoding ascii
    RunDocker stop "$lab-web"
  }
  RunDocker stop "$lab-test"
}
