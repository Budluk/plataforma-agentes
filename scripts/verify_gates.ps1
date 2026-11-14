param([switch]$Live)
# Gates de aceitação: roda tudo e mostra OK/FALHA. Sai com 0 só se tudo passar.
Set-Location (Split-Path -Parent $PSScriptRoot)
$py = ".\.venv\Scripts\python.exe"
$files = (Get-ChildItem core,agents,pipelines,scripts,config,tests -Recurse -Filter *.py).FullName
$rows = [System.Collections.Generic.List[object]]::new()
function Check([string]$Name, [scriptblock]$Test) {
    try { $ok = [bool](& $Test) } catch { $ok = $false }
    $rows.Add([pscustomobject]@{ Gate = $Name; Status = $(if ($ok) { "OK" } else { "FALHA" }) })
}

Check "Python 3.12"                               { (& $py --version) -match "3\.12" }
Check "pip check (dependências consistentes)"     { & $py -m pip check *> $null; $LASTEXITCODE -eq 0 }
Check "pytest verde"                              { & $py -m pytest -q *> $null; $LASTEXITCODE -eq 0 }
Check ".env ignorado pelo git"                    { git check-ignore -q .env; $LASTEXITCODE -eq 0 }
Check "nenhum arquivo sensível rastreado"         { -not (git ls-files | Select-String -Pattern "(^|/)\.env$|\.venv|\.db$|\.jsonl$|dev_output") }
Check "INV-5: execution_order só em hard_gate e testes" {
    -not (Select-String -Path $files -Pattern "execution_order" | Where-Object { $_.Path -notlike "*\core\hard_gate.py" -and $_.Path -notlike "*\tests\*" })
}
Check "sem imports proibidos" {
    -not (Select-String -Path $files -Pattern "^\s*(import|from)\s+(langchain|crewai|autogen|ollama|qdrant|mem0|torch|tensorflow|librosa|selenium|playwright|requests|subprocess)\b")
}
foreach ($s in "check_env","smoke_io") {
    Check "script $s" { & $py "scripts\$s.py" *> $null; $LASTEXITCODE -eq 0 }
}
foreach ($s in "finance","music","sales","funnel","research","dev","central") {
    Check "demo offline $s" { & $py "scripts\run_${s}_demo.py" *> $null; $LASTEXITCODE -eq 0 }
}
if ($Live) { Check "LLM real responde (rede)" { & $py scripts\test_llm.py *> $null; $LASTEXITCODE -eq 0 } }

Check ".env sem chaves repetidas" { -not (Select-String -Path .env -Pattern '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Group-Object | Where-Object Count -gt 1) }

$rows | Format-Table -AutoSize
if ($rows.Status -contains "FALHA") { "HÁ GATES FALHANDO."; exit 1 } else { "Todos os gates passaram."; exit 0 }

