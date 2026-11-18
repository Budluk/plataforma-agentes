$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  $candidate = Join-Path $env:ProgramFiles 'nodejs\node.exe'
  if (Test-Path $candidate) { $node = Get-Item $candidate } else { $node = $null }
}
if (-not $node) {
  throw 'Node.js 20+ não encontrado. Instale em https://nodejs.org/ e reabra o PowerShell.'
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Arquivo .env criado. Edite FREELLMAPI_BASE_URL e FREELLMAPI_API_KEY antes de gerar apps.' -ForegroundColor Yellow
}

$nodeExe = if ($node.Source) { $node.Source } else { $node.FullName }
Write-Host "Iniciando CloneStudio AI com $(& $nodeExe --version)..." -ForegroundColor Cyan
& $nodeExe 'server/index.mjs'
