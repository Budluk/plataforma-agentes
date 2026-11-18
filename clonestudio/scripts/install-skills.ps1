$ErrorActionPreference = 'Continue'
Write-Host 'Instalador de Skills/CLIs oficiais do CloneStudio AI' -ForegroundColor Cyan
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Write-Host 'Instale Node.js 20+ antes.' -ForegroundColor Red; exit 1 }
$tasks = @(
  @{Name='Cloudflare Security Audit Skill';Cmd='npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit'},
  @{Name='Thirdwatch Scraping Skills';Cmd='npx skills add https://github.com/thirdwatch-dev/scraping-skills'},
  @{Name='Remotion Agent Skills';Cmd='npx skills add remotion-dev/skills'},
  @{Name='Context7 CLI setup';Cmd='npx ctx7 setup'},
  @{Name='Composio TypeScript SDK';Cmd='npm install @composio/core'},
  @{Name='Google Workspace CLI';Cmd='npm install -g @googleworkspace/cli'}
)
foreach ($task in $tasks) {
  Write-Host "`n$($task.Name): $($task.Cmd)" -ForegroundColor White
  $answer = Read-Host 'Executar agora? (s/N)'
  if ($answer -match '^(s|sim)$') { Invoke-Expression $task.Cmd }
}
Write-Host '`nConcluído. Faça as autenticações necessárias conforme README_PT.md.' -ForegroundColor Green
