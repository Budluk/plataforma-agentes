$ErrorActionPreference = "Continue"
$root = "C:\Users\Lucas\plataforma-agentes"
Set-Location -LiteralPath $root

$py = Join-Path $root ".venv\Scripts\python.exe"
$csv = Join-Path $root "config\content_automation\minhas_observacoes.csv"
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd"
$log = Join-Path $logDir "trends_$stamp.log"

"=== execucao: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" |
    Out-File -LiteralPath $log -Append -Encoding UTF8

$args = @((Join-Path $root "scripts\trend_report.py"))

if (Test-Path -LiteralPath $csv -PathType Leaf) {
    $args += "--csv"
    $args += $csv
} else {
    "AVISO: CSV nao encontrado, apenas relatorio:" | Out-File -LiteralPath $log -Append -Encoding UTF8
    $csv | Out-File -LiteralPath $log -Append -Encoding UTF8
}

$resultado = & $py @args 2>&1
$resultado | Out-File -LiteralPath $log -Append -Encoding UTF8

"--- fim (codigo $LASTEXITCODE) ---" |
    Out-File -LiteralPath $log -Append -Encoding UTF8
