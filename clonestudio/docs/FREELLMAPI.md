# FreeLLMAPI no CloneStudio AI

O CloneStudio usa o FreeLLMAPI como provedor padrão. Ele expõe uma API compatível com OpenAI Chat Completions e faz fallback entre provedores gratuitos.

## Endpoint

```text
http://127.0.0.1:3001/v1
```

A chave unificada é gerada no painel do FreeLLMAPI (`http://127.0.0.1:3001` → página **Keys**). Ela fica somente no `.env` do backend:

```dotenv
FREELLMAPI_BASE_URL=http://127.0.0.1:3001/v1
FREELLMAPI_API_KEY=freellmapi-...
FREELLMAPI_MODEL=gpt-oss-120b
FREELLMAPI_FALLBACK_MODELS=qwen3.8-27b,qwen3.5-397b,nvidia/nemotron-3-ultra-550b-a55b:free
AI_PROVIDER_ORDER=freellmapi
```

O CloneStudio tenta o modelo principal e, se ele falhar por timeout/limite, tenta os fallbacks na ordem. Cada modelo pode estar em um provedor gratuito diferente dentro do FreeLLMAPI.

## Como iniciar

O caminho recomendado é o script do CloneStudio, que usa o Node 22 permanente e a pasta permanente do gateway:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start-freellmapi.ps1
```

O script verifica a porta `3001`, inicia o servidor em segundo plano, aguarda o `/api/ping` e grava logs em `C:\Users\Lucas\Tools\freellmapi\logs`. Para encerrar:

```powershell
.\scripts\start-freellmapi.ps1 -Stop
```

Variáveis aceitas: `FREELLMAPI_HOME` (padrão `C:\Users\Lucas\Tools\freellmapi`), `FREELLMAPI_NODE_HOME` (padrão `C:\Users\Lucas\Tools\node-v22.14.0-win-x64`) e `FREELLMAPI_PORT` (padrão `3001`).

Alternativa manual, na pasta do FreeLLMAPI:

```powershell
npm run dev -w server
```

O painel do gateway abre em `http://127.0.0.1:3001` (o frontend de desenvolvimento, se iniciado, usa `:5173`). O CloneStudio não precisa do frontend do gateway, somente do servidor.

## Provedores keyless (recomendado: OVH)

O Kilo keyless é útil para testes curtos, mas sofre `empty_completion`, 429 e timeouts em gerações longas. O OVHcloud AI Endpoints é keyless, não exige cartão e serve modelos bons para código. No FreeLLMAPI, adicione a chave sentinela e os modelos no `freellmapi.config.json`:

```json
{
  "keys": [
    { "platform": "ovh", "label": "OVH keyless", "enabled": true }
  ],
  "models": [
    {
      "platform": "ovh",
      "modelId": "gpt-oss-120b",
      "displayName": "GPT-OSS 120B (OVH keyless)",
      "contextWindow": 131072,
      "rpmLimit": 2,
      "supportsTools": true,
      "fallbackEnabled": true,
      "enabled": true
    },
    {
      "platform": "ovh",
      "modelId": "Qwen3.5-397B-A17B",
      "displayName": "Qwen3.5 397B (OVH keyless)",
      "contextWindow": 262144,
      "rpmLimit": 2,
      "supportsTools": true,
      "fallbackEnabled": true,
      "enabled": true
    },
    {
      "platform": "ovh",
      "modelId": "Qwen3.8-27B",
      "displayName": "Qwen3.8 27B (OVH keyless)",
      "contextWindow": 262144,
      "rpmLimit": 2,
      "supportsTools": true,
      "fallbackEnabled": true,
      "enabled": true
    }
  ],
  "fallback": [
    { "platform": "ovh", "modelId": "gpt-oss-120b", "priority": 1, "enabled": true },
    { "platform": "ovh", "modelId": "Qwen3.8-27B", "priority": 2, "enabled": true },
    { "platform": "ovh", "modelId": "Qwen3.5-397B-A17B", "priority": 3, "enabled": true }
  ]
}
```

No `.env` do FreeLLMAPI, aumente os limites para gerações longas:

```dotenv
PROVIDER_TIMEOUT_OVH=360000
PROVIDER_STREAM_STALL_TIMEOUT_OVH=240000
FALLBACK_TIME_BUDGET_MS=600000
```

Na instalação permanente, o `.env` também aponta para o arquivo de configuração local:

```dotenv
FREEAPI_CONFIG_PATH=C:\Users\Lucas\Tools\freellmapi\freellmapi.config.json
```

Depois de reiniciar o gateway, confirme que os modelos aparecem como `available` / `execution_status: "ready"` em `GET /v1/models`. O OVH limita a aproximadamente 2 requisições por minuto por modelo e IP; por isso o CloneStudio usa uma lista de fallback em vez de depender de um único modelo.

## Testar sem o CloneStudio

```powershell
$headers = @{ Authorization = 'Bearer freellmapi-...' }
$body = @{
  model = 'gpt-oss-120b'
  messages = @(@{ role = 'user'; content = 'Responda apenas OK.' })
  max_tokens = 16
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri 'http://127.0.0.1:3001/v1/chat/completions' `
  -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

## Modelos

Consulte a lista disponível pelo painel ou pela rota autenticada:

```text
GET http://127.0.0.1:3001/v1/models
Authorization: Bearer freellmapi-...
```

O CloneStudio também expõe um proxy sem chave para o navegador:

```text
GET /api/providers/freellmapi/models
```

Assim a chave nunca chega ao browser.

## Fallback

`AI_PROVIDER_ORDER` define a ordem. O roteador ignora provedores sem URL válida e tenta o próximo quando há erro, timeout ou resposta vazia:

```dotenv
AI_PROVIDER_ORDER=freellmapi,ollama,localllm,llamacpp
```

O log do servidor mostra qual provedor falhou e por quê. Modelos gratuitos podem ter limites de taxa e filas; timeouts são configuráveis em `AI_REQUEST_TIMEOUT_MS` e `AI_GENERATION_TIMEOUT_MS`.

## Segurança e privacidade

- A chave fica só no backend.
- Prompts podem ser registrados/treinados pelos provedores gratuitos do gateway. Não envie segredos nos prompts.
- Para produção, troque o endpoint local por um gateway autenticado com TLS e limite de requisições.
- O FreeLLMAPI mantém o próprio banco de chaves/uso; faça backup da pasta de dados dele separadamente.
