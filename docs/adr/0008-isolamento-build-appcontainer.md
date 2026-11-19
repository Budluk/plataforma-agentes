# ADR-0008 — Isolamento real do build com AppContainer + Job Object (alvo B)

- Status: **implementado, integrado no `main` via PR #44 (commit `d1f090a`) e validado localmente**. Nenhuma exposição autorizada.
- Data: 2026-11-19
- Fase do plano: gate B (pré-requisito 4 do [ADR-0007](./0007-preparacao-alvo-b-cloudflare-tunnel.md))
- Relação: complementa o [ADR-0002](./0002-build-sandbox-sem-docker.md), que continua valendo como hardening no alvo A

## Resultado da implementação (2026-11-19)

O desenho do spike foi implementado em `clonestudio/server/build-isolation.mjs`
e `clonestudio/scripts/windows/build-isolation.ps1`. Validações executadas:

- Teste `windows-only` (`tests/build-isolation.windows.test.mjs`) confirmou:
  - `NET_DENIED=EACCES` em `net.connect(80, '1.1.1.1')` dentro do AppContainer —
    **negação de TCP confirmada por teste assertivo**;
  - leitura de arquivo fora do workspace negada (`FS_DENIED=EACCES`);
  - nenhum arquivo gravado no projeto de origem; apenas `dist/index.html` foi
    copiado de volta para o diretório de saída.
- Build real do Vite em AppContainer, com `DATA_DIR` fora da aplicação e projeto
  temporário: `code=0`, `dist/index.html` produzido, **pico de 219 MB** e ~7,3 s
  com cache quente de `node_modules` (46 s na primeira execução, quando o cache
  é criado). Limite do Job Object: 1536 MB derivados de
  `CLONESTUDIO_BUILD_HEAP_MB=512` × 3, 8 processos ativos, `KILL_ON_JOB_CLOSE`.
- O cache de `node_modules` fica em `%TEMP%\clonestudio-build\cache-<hash>` e é
  reutilizado entre builds. O workspace de cada build é efêmero; `.vite-temp`
  é um diretório real e gravável dentro dele, enquanto os pacotes são lidos por
  junctions com ACL `RX` no cache.
- O ambiente do helper é sanitizado com `buildChildEnv`; variáveis básicas do
  Windows (`ComSpec`, `PATHEXT`, `TEMP`, `TMP`, `USERPROFILE`, `APPDATA`,
  `LOCALAPPDATA`, `SystemDrive`, `NUMBER_OF_PROCESSORS`) são acrescentadas apenas
  para o PowerShell conseguir executar nativos. Nenhuma chave de provedor ou
  token do túnel entra no helper ou no build.
- O alvo A continua com `CLONESTUDIO_BUILD_ISOLATION=off` e o mesmo spawn de
  sempre; `CLONESTUDIO_PUBLIC_HOST` sem `required` quebra o boot.

Nada nesta etapa alterou `.env`, bind, túnel ou exposição. O alvo A segue
idêntico.

## Resultado do spike (2026-11-19)

Spike executado localmente, sem exposição e sem instalação, para validar a
viabilidade do desenho. **Viabilidade confirmada.** Um primeiro conjunto de
tentativas falhou, mas a causa era o próprio helper de P/Invoke, não o Windows:

- ❌ Rotas que **não** funcionam (registradas para evitar repetição):
  - `SetTokenInformation(TokenAppContainerSid)` e `NtSetInformationToken` →
    errno 87 / NTSTATUS `0xC0000003` (não é a forma de converter um token normal);
  - `CreateProcessWithTokenW` com `SECURITY_CAPABILITIES` → errno 87 mesmo com
    `SeImpersonatePrivilege`;
  - atributo `0x0002000D` (valor **errado**) em `UpdateProcThreadAttribute` →
    retorna `True`, mas o `CreateProcessW` falha com errno 6/123.
- ✅ **Caminho correto, validado neste spike:**
  1. `CreateAppContainerProfile`/`DeriveAppContainerSidFromAppContainerName` e
     `DeleteAppContainerProfile` (`userenv.dll`) funcionam sem elevação.
  2. `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` é **`0x00020009`** (não
     `0x0002000D`), com `SECURITY_CAPABILITIES { Sid, Capabilities=null,
     CapabilityCount=0, Reserved=0 }` e `InitializeProcThreadAttributeList`.
  3. `STARTUPINFOEX.cb` deve ser `112` (`sizeof(STARTUPINFOEX)`), não `104`.
  4. `CreateProcessW` com `EXTENDED_STARTUPINFO_PRESENT` (`0x00080000`) e
     **`lpCurrentDirectory` apontando para o diretório `...\AC` do próprio
     perfil** inicia `cmd.exe` e `node.exe` dentro do AppContainer
     (`CREATE_PROCESS=True`, `err=0`, PID e exit code acompanhados).
- ✅ **Isolamento de filesystem confirmado de fato:** já dentro do AppContainer,
  o `cmd.exe` recebeu "Acesso negado" ao tentar redirecionar saída para
  `AppData\Local\Temp\opencode`, e o `node.exe` falhou com `EPERM ... lstat 'C:\'`
  ao tentar resolver caminhos fora do perfil. Ou seja, o kernel nega acesso a
  dados do host — não é apenas uma convenção de código.
- ⚠️ **Não medido de forma confiável:** o pico de RAM do helper/build (máquina
  com 0,41 GB livres) e o resultado do teste de conectividade TCP. A negação de
  rede é esperada pelo projeto (AppContainer sem capabilities
  `internetClient`/`privateNetworkClientServer`), mas **deve ser confirmada na
  implementação** com um teste `windows-only` assertivo antes de qualquer
  exposição em B.
- Limpeza: os diretórios de storage deixados pelos helpers foram removidos do
  registro HKCU (20 remanescentes após a última rodada). Nenhum perfil spike
  permanece no sistema.

Nada neste spike alterou runtime, `.env`, bind ou exposição. O alvo A segue
idêntico.

## Contexto

O [ADR-0007](./0007-preparacao-alvo-b-cloudflare-tunnel.md) exige, antes de qualquer
exposição em B, "container/VM e sandbox de rede para o build" e registra que o
hardening da Fase 4 **não** é isolamento de segurança real: `vite build` compila o
código gerado pelo LLM com o mesmo usuário do servidor
(`server/generator.mjs`, `runCommand`/`doBuild`), dentro de `DATA_DIR`.

O ambiente atual foi verificado em 2026-11-19:

- Windows 11 Home, build 26300, `x64`;
- 3,78 GB de RAM Physical total, com 0,41 GB livres no momento da verificação;
- `wsl.exe` presente, mas **sem distro instalada** e sem Hyper-V;
- `docker`, `podman`, `nerdctl` ausentes;
- Windows Sandbox e Hyper-V não estão disponíveis na edição Home.

Portanto **não há VM ou container executável nesta máquina**: WSL2 exigiria
instalação, Hyper-V e Windows Sandbox não existem no Home, e um daemon de
container não cabe na folga de memória. O item 4 do ADR-0007 precisa de uma
alternativa que seja isolamento real de processo, sem novo daemon e sem consumo
permanente de RAM.

Ameaça considerada: código gerado é compilado, nunca executado como parte do
produto; ainda assim, um bug no compilador/parser ou um arquivo de configuração
hostil poderia transformar o build em execução arbitrária. No alvo A isso é
aceito (sem rede, sem outros usuários). No alvo B, o mesmo processo passa a
rodar atrás de um túnel e precisa de um limite de segurança do sistema
operacional — não apenas de convenções no código.

## Decisão

Adotar, **somente como desenho para o alvo B**, o isolamento nativo do Windows:

1. **AppContainer sem capabilities de rede.** O processo do build roda em um
   AppContainer dedicado (perfil estável por instalação,
   `CreateAppContainerProfile`/`DeriveAppContainerSidFromAppContainerName`), com
   lista de capabilities vazia. Sem `internetClient`/`internetClientServer`/
   `privateNetworkClientServer`, o kernel nega sockets — não dependemos de
   firewall do usuário nem de `HTTP_PROXY` para isso.
2. **Job Object com limites duros.** `CreateJobObject` +
   `SetInformationJobObject` aplicando `ActiveProcessLimit`, `ProcessMemoryLimit`
   e `JobMemoryLimit` (derivados de `CLONESTUDIO_BUILD_HEAP_MB`, com folga
   controlada), `PriorityClass` baixa e limite de CPU por rate quando
   disponível. O child é criado suspenso, colocado no job e só então retomado,
   para que nenhum neto escape do job. Timeout existente continua matando a
   árvore (`killTree`/`taskkill /t /f`).
3. **Workspace efêmero com ACL mínima.** O build não escreve em `DATA_DIR`.
   Um diretório novo em `%TEMP%` recebe: template fixo (cópia de
   `templates/base`), arquivos gerados do projeto e um `node_modules` ligado ao
   template **somente com ACL de leitura/execução** para o SID do AppContainer.
   Após o sucesso, apenas `dist/` é copiado de volta para o `distDir(id)` e o
   workspace é removido; `assertSafeBuildConfig` continua rodando antes do
   spawn, como defesa em profundidade.
4. **Segredos fora do alcance.** `buildChildEnv` já remove chaves/tokens. Além
   disso, o AppContainer só enxerga os diretórios aos quais recebeu ACE
   explícita: `.env`, `DATA_DIR/projects`, perfis de outros usuários e o diretório
   do servidor **não** recebem ACE. Nenhuma credencial do Cloudflare, do
   provedor de IA ou do túnel entra no workspace.
5. **Fail closed.** Se qualquer etapa falhar — criar/derivar o SID, montar
   `SECURITY_CAPABILITIES` no atributo `0x00020009` do `CreateProcessW`, aplicar
   o job OU conceder/remover ACL — o build falha com erro explícito e **nunca**
   cai para o spawn sem isolamento. O spawn usa `CreateProcessW` com
   `STARTUPINFOEX.cb = sizeof(STARTUPINFOEX)` e `lpCurrentDirectory` no diretório
   `AC` do perfil (ver "Resultado do spike"). Um `CLONESTUDIO_BUILD_ISOLATION=off`
   só é aceito enquanto o alvo for A; com `CLONESTUDIO_PUBLIC_HOST` definido,
   qualquer valor diferente de `required` quebra o boot.
6. **Helper sem dependência permanente.** A camada de P/Invoke fica em
   `server/build-isolation.mjs` + um helper C# compilado em memória via
   `Add-Type` do PowerShell já presente no Windows, ou, se o custo de memória
   do `powershell.exe` se mostrar proibitivo, via binding nativo leve avaliado
   em spike. Nenhum serviço, daemon, container ou modelo local é instalado.

## Plano de implementação

1. ~~Spike de viabilidade no Windows 11 Home: criar perfil AppContainer, iniciar
   `node` dentro dele e confirmar isolamento de filesystem.~~ Concluído em
   2026-11-19 (ver "Resultado do spike").
2. ~~Medir pico de RAM do helper e do build.~~ Concluído: 219 MB no build real
   com cache quente; não foi necessário reduzir `CLONESTUDIO_BUILD_HEAP_MB`.
3. ~~Implementar `build-isolation.mjs`, integrar `doBuild` e o workspace efêmero
   em `generator.mjs`, com testes unitários e teste `windows-only`.~~ Concluído.
4. ~~Adicionar ao runbook `CLONESTUDIO_BUILD_ISOLATION=required` e a verificação
   de que o build não herda rede.~~ Concluído em `CLOUDFLARE_TUNNEL.md`.
5. **Pendente:** somente com tudo verde e novo ADR aprovando a mudança de alvo,
   ligar o isolamento no ambiente do túnel. O alvo A continua com o comportamento
   atual e com as mesmas verificações Python e suites Node/browser descritas no README.

## Consequências

- Nenhuma superfície de rede nova, nenhum daemon e nenhuma dependência
  instalada nesta etapa. O código usa apenas PowerShell/.NET já presentes no
  Windows; o helper é transitório e roda somente durante o build.
- O alvo A permanece idêntico: `HOST=127.0.0.1`, `PREVIEW_PUBLIC_URL=` vazio e
  build com o mesmo usuário do servidor, conforme ADR-0002.
- O alvo B passa a ter um limite imposto pelo kernel (AppContainer + Job Object)
  em vez de convenções de código, fechando o pré-requisito 4 do ADR-0007.
- Custo: complexidade de P/Invoke e um helper transitório por build. O pico
  medido foi 219 MB com cache quente; o primeiro build (criação do cache) levou
  ~46 s e pode precisar de `BUILD_TIMEOUT_MS` maior em host mais lento. Se a
  folga de RAM mudar, a decisão de exposição em B deve ser reavaliada em novo
  ADR.
- AppContainer **não é VM**: kernel é compartilhado. Para a ameaça de código
  gerado executando acidentalmente no build, é uma barreira real; para um
  atacante com exploit de kernel do Windows, não é. Isso deve ficar explícito no
  ADR que autorizar a exposição.
- Sistemas não Windows não são cobertos por este ADR; uma mudança de host exigiria
  equivalente (por exemplo Landlock/seccomp no Linux) e nova decisão.
