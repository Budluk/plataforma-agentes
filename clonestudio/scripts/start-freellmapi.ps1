param(
  [switch]$Stop,
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'

$port = if ($env:FREELLMAPI_PORT) { [int]$env:FREELLMAPI_PORT } else { 3001 }
$home_ = if ($env:FREELLMAPI_HOME) { $env:FREELLMAPI_HOME } else { 'C:\Users\Lucas\Tools\freellmapi' }
$nodeHome = if ($env:FREELLMAPI_NODE_HOME) { $env:FREELLMAPI_NODE_HOME } else { 'C:\Users\Lucas\Tools\node-v22.14.0-win-x64' }
$nodeExe = Join-Path $nodeHome 'node.exe'
$npmCmd = Join-Path $nodeHome 'npm.cmd'
$logDir = Join-Path $home_ 'logs'
$outLog = Join-Path $logDir 'server.out.log'
$errLog = Join-Path $logDir 'server.err.log'

function Get-PortOwner {
  param([int]$Port)
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty OwningProcess
}

function Test-FreeLLMAPIProcess {
  param([int]$ProcessId)
  $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue).CommandLine
  if (-not $cmd) { return $false }
  return $cmd -like "*$home_*" -or $cmd -like '*freellmapi*'
}

function Stop-Tree {
  param([int]$ProcessId)
  & taskkill /PID $ProcessId /T /F 2>&1 | Out-Null
}

$owner = Get-PortOwner -Port $port

if ($Stop) {
  if (-not $owner) {
    Write-Host "FreeLLMAPI nao esta rodando na porta $port." -ForegroundColor Yellow
    return
  }
  if (-not (Test-FreeLLMAPIProcess -ProcessId $owner)) {
    throw "A porta $port esta em uso pelo PID $owner, que nao parece ser o FreeLLMAPI. Encerre manualmente se necessario."
  }
  Stop-Tree -ProcessId $owner
  Start-Sleep -Seconds 1
  if (Get-PortOwner -Port $port) {
    throw "Nao foi possivel encerrar o processo da porta $port."
  }
  Write-Host "FreeLLMAPI encerrado (porta $port)." -ForegroundColor Green
  return
}

if ($owner) {
  if (-not (Test-FreeLLMAPIProcess -ProcessId $owner)) {
    throw "A porta $port esta em uso pelo PID $owner, que nao parece ser o FreeLLMAPI. Libere a porta ou defina FREELLMAPI_PORT."
  }
  Write-Host "FreeLLMAPI ja esta rodando na porta $port (PID $owner)." -ForegroundColor Green
  Write-Host "Painel: http://127.0.0.1:$port"
  return
}

if (-not (Test-Path $nodeExe)) {
  throw "Node 22 nao encontrado em $nodeExe. Defina FREELLMAPI_NODE_HOME ou instale o Node 22."
}
if (-not (Test-Path (Join-Path $home_ 'package.json'))) {
  throw "FreeLLMAPI nao encontrado em $home_. Defina FREELLMAPI_HOME ou clone o projeto nessa pasta."
}

$version = & $nodeExe --version
if ($version -notmatch '^v(2[0-4])\.') {
  throw "O FreeLLMAPI exige Node >=20.18 <25; encontrado $version em $nodeExe."
}

if (-not (Test-Path (Join-Path $home_ '.env'))) {
  Copy-Item (Join-Path $home_ '.env.example') (Join-Path $home_ '.env')
  Write-Host "Arquivo .env criado em $home_. Revise FREEAPI_CONFIG_PATH antes de usar." -ForegroundColor Yellow
}

if (-not (Test-Path (Join-Path $home_ 'node_modules'))) {
  Write-Host 'Instalando dependencias do FreeLLMAPI (primeira execucao)...' -ForegroundColor Cyan
  Push-Location $home_
  try {
    & $npmCmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install falhou com codigo $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
}

New-Item -ItemType Directory -Force $logDir | Out-Null

$env:PATH = "$nodeHome;$env:PATH"
$env:FREEAPI_CONFIG_PATH = if ($env:FREEAPI_CONFIG_PATH) { $env:FREEAPI_CONFIG_PATH } else { Join-Path $home_ 'freellmapi.config.json' }

Write-Host "Iniciando FreeLLMAPI com $version..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $env:ComSpec `
  -ArgumentList @('/d', '/s', '/c', "`"$npmCmd`" run dev -w server") `
  -WorkingDirectory $home_ `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

if ($NoWait) {
  Write-Host "Processo iniciado (PID $($proc.Id)). Logs: $logDir" -ForegroundColor Green
  return
}

$deadline = (Get-Date).AddSeconds(90)
$ready = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 750
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/ping" -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch {
    if ($proc.HasExited) { break }
  }
}

if (-not $ready) {
  $tail = if (Test-Path $errLog) { Get-Content $errLog -Tail 20 | Out-String } else { '' }
  throw "FreeLLMAPI nao respondeu em 90 s. Veja $outLog e $errLog.`n$tail"
}

Write-Host "FreeLLMAPI pronto: http://127.0.0.1:$port/v1" -ForegroundColor Green
Write-Host "Painel: http://127.0.0.1:$port | Logs: $logDir"
