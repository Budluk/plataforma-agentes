# Integrações e ferramentas mapeadas

Este documento é gerado a partir de `server/integrations.mjs` por `node scripts/generate-integrations-doc.mjs`.

## Resumo

| Métrica | Valor |
| --- | --- |
| Ferramentas mapeadas | 31 |
| Provedores nativos | 6 |
| Prontas ou catalogadas | 9 |

## Legenda de status

| Status | Significado |
| --- | --- |
| Nativo | O CloneStudio fala com essa ferramenta sem código adicional. |
| Catálogo | Skill/instrução já incluída no pacote ou pronta para instalar. |
| Adaptador | Existe um ponto de extensão; a conexão real ainda precisa ser habilitada. |
| Configuração | Depende de chave/OAuth e ajustes no `.env`. |
| Externo | Software separado; não é reimplementado dentro do CloneStudio. |
| Referência | Produto usado como referência de UX/arquitetura. |

## Ferramentas

### Já integrado ao CloneStudio

| Ferramenta | Categoria | O que é | Requisitos | Link |
| --- | --- | --- | --- | --- |
| **Context7** | Conhecimento | Documentação atualizada de bibliotecas via MCP. O gerador detecta Recharts, Framer Motion, Lucide e clsx no pedido e injeta trechos atuais no contexto do modelo. | Endpoint público https://mcp.context7.com/mcp. CONTEXT7_API_KEY é opcional e aumenta os limites de uso. | [GitHub](https://github.com/upstash/context7) |
| **FreeLLMAPI** | Inferência | Gateway OpenAI-compatible com fallback entre provedores gratuitos. É o provedor padrão do CloneStudio. | Serviço local em FREELLMAPI_BASE_URL e chave unificada no .env. | [GitHub](https://github.com/freellmapi/freellmapi) |
| **llama.cpp** | Inferência | llama-server local com API de chat completions. | LLAMACPP_BASE_URL e modelo GGUF carregado. | [GitHub](https://github.com/ggml-org/llama.cpp) |
| **LocalAI** | Inferência | Servidor OpenAI-compatible auto-hospedado para texto, imagem e áudio. | LOCALAI_BASE_URL e modelo configurados. | [GitHub](https://github.com/mudler/LocalAI) |
| **Ollama** | Inferência | Runtime local de LLMs com endpoint OpenAI-compatible. | Ollama em execução e OLLAMA_BASE_URL configurado. | [GitHub](https://github.com/ollama/ollama) |
| **Playwright CLI** | Navegador | Valida o preview gerado em navegador headless real, coleta erros de console e rede, detecta tela em branco e salva um screenshot a cada build. | playwright-core e Microsoft Edge ou Google Chrome instalados. Por padrão usa o navegador já presente no sistema, sem baixar Chromium. | [GitHub](https://github.com/microsoft/playwright-cli) |

### Catálogo / skill inclusa

| Ferramenta | Categoria | O que é | Requisitos | Link |
| --- | --- | --- | --- | --- |
| **Cloudflare Security Audit** | Skills | Skill de auditoria defensiva com validação e relatório. | Instalada via npx skills add. | [GitHub](https://github.com/cloudflare/security-audit-skill) |
| **Remotion Skills** | Skills | Skill para criar vídeos com Remotion. | Instalada via npx skills add. | [GitHub](https://github.com/remotion-dev/skills) |
| **Thirdwatch Scraping Skills** | Skills | Skill de scraping responsável e API-first. | Instalada via npx skills add. | [GitHub](https://github.com/thirdwatch-dev/scraping-skills) |

### Ponto de extensão preparado

| Ferramenta | Categoria | O que é | Requisitos | Link |
| --- | --- | --- | --- | --- |
| **Firecrawl** | Dados | API de crawling e extração que transforma sites em markdown. Pode alimentar a geração a partir de referências. | FIRECRAWL_API_KEY ou instância self-hosted. | [GitHub](https://github.com/firecrawl/firecrawl) |
| **Spec Kit** | Fluxo de trabalho | Fluxo spec-driven: especificação, plano e tarefas antes do código. Pode virar um modo do gerador. | CLI specify e template de specs no projeto. | [GitHub](https://github.com/github/spec-kit) |
| **Scroll Craft** | Frontend | Padrões de animação de scroll para páginas e landing pages. | Inspiração/trechos de CSS e JS integráveis ao template. | [GitHub](https://github.com/nateherkai/scroll-craft) |
| **Matt Pocock Skills** | Skills | Skills de TypeScript e engenharia para agentes. | Instalar via npx skills add. | [GitHub](https://github.com/mattpocock/skills) |

### Requer configuração de credenciais

| Ferramenta | Categoria | O que é | Requisitos | Link |
| --- | --- | --- | --- | --- |
| **Composio** | Integrações | Autenticação e sessões de ferramentas para agentes. | COMPOSIO_API_KEY e fluxo OAuth por usuário. | [GitHub](https://github.com/ComposioHQ/composio) |
| **Google Workspace CLI** | Integrações | Drive, Gmail, Calendar, Docs e Sheets via CLI. | Projeto Google Cloud e OAuth. | [GitHub](https://github.com/googleworkspace/cli) |

### Projeto ou serviço separado

| Ferramenta | Categoria | O que é | Requisitos | Link |
| --- | --- | --- | --- | --- |
| **Cline** | Agentes | Agente dentro do VS Code com edição de arquivos e terminal. | VS Code e chave de LLM. | [GitHub](https://github.com/cline/cline) |
| **Open Interpreter** | Agentes | Interpretador que executa código localmente a partir de linguagem natural. | Python e sandbox recomendado. | [GitHub](https://github.com/openinterpreter/openinterpreter) |
| **OpenHands** | Agentes | Plataforma de agentes que edita código e opera terminal/navegador. | Docker, sandbox e provedor de LLM. | [GitHub](https://github.com/OpenHands/OpenHands) |
| **Plandex** | Agentes | Agente de código para tarefas longas no terminal, com planos e diffs. | CLI e chave de LLM. | [GitHub](https://github.com/plandex-ai/plandex) |
| **Qwen Code** | Agentes | Agente de código no terminal baseado em Qwen. | CLI e credenciais do provedor Qwen. | [GitHub](https://github.com/QwenLM/qwen-code) |
| **Trae Agent** | Agentes | Framework de agentes de software com ferramentas e trajetórias. | Python e chave de LLM. | [GitHub](https://github.com/bytedance/trae-agent) |
| **VoiceStudio** | Áudio | Estúdio de voz/TTS com modelos locais ou APIs. | Modelos de áudio e, idealmente, GPU. | [GitHub](https://github.com/debpalash/VoiceStudio) |
| **screenshot-to-code** | Geração | Converte screenshots e mockups em HTML/React usando modelos com visão. | Serviço Python separado e modelo com visão. | [GitHub](https://github.com/abi/screenshot-to-code) |
| **ComfyUI** | Imagem | Motor de geração de imagens por grafo, com API HTTP. | GPU recomendada; modelos de imagem pesados. | [GitHub](https://github.com/Comfy-Org/ComfyUI) |
| **Stable Diffusion WebUI** | Imagem | Interface e API para geração de imagens com Stable Diffusion. | GPU e modelos locais (inviável em 4 GB de RAM). | [GitHub](https://github.com/AUTOMATIC1111/stable-diffusion-webui) |
| **browser-use** | Navegador | Agente Python que controla um navegador real para tarefas web. | Python, navegador e um LLM com visão. | [GitHub](https://github.com/browser-use/browser-use) |
| **Camoufox** | Navegador | Navegador anti-detecção baseado em Firefox para automação. | Instalação Python e uso ético dentro dos termos dos sites. | [GitHub](https://github.com/daijro/camoufox) |
| **Laya** | Navegador | Assistente/agente de navegador para fluxos web. | Python e navegador; avaliar licença e manutenção. | [GitHub](https://github.com/NandhaKishorM/laya) |
| **Flowise** | Orquestração | Construtor visual de fluxos de agentes e RAG. | Node/Docker e banco de dados. | [GitHub](https://github.com/FlowiseAI/Flowise) |

### Referência de produto

| Ferramenta | Categoria | O que é | Requisitos | Link |
| --- | --- | --- | --- | --- |
| **Dyad** | Referência | Alternativa local ao Lovable; referência de UX para geração e preview. | App desktop separado. | [GitHub](https://github.com/dyad-sh/dyad) |
| **WebRAD** | Referência | IDE visual open-source em Electron para montar apps web em TypeScript, com designer de componentes, handlers no Monaco e compilador para Web/PWA. | App desktop separado, com formato de projeto .wrproj, runtime e compilador próprios. Não é React/Vite nem um adaptador direto do CloneStudio. | [GitHub](https://github.com/Atentor/WebRad) |

## O que não está incluído

- Pesos de modelos, binários de GPU e imagens de container de terceiros.
- Autenticação OAuth pronta para Composio/Google Workspace. Cada integração exige credenciais próprias.
- Execução irrestrita de agentes (OpenHands, Cline, Open Interpreter) sem sandbox. Esses projetos rodam separadamente e exigem isolamento.
- Scraping que viole termos de uso, CAPTCHA, paywalls ou controles de acesso.
