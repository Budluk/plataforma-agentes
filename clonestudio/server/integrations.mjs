const integrations = [
  {
    id: 'freellmapi',
    name: 'FreeLLMAPI',
    repo: 'https://github.com/freellmapi/freellmapi',
    category: 'Inferência',
    kind: 'gateway',
    status: 'nativo',
    description:
      'Gateway OpenAI-compatible com fallback entre provedores gratuitos. É o provedor padrão do CloneStudio.',
    requires: 'Serviço local em FREELLMAPI_BASE_URL e chave unificada no .env.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    repo: 'https://github.com/ollama/ollama',
    category: 'Inferência',
    kind: 'runtime',
    status: 'nativo',
    description: 'Runtime local de LLMs com endpoint OpenAI-compatible.',
    requires: 'Ollama em execução e OLLAMA_BASE_URL configurado.',
  },
  {
    id: 'localai',
    name: 'LocalAI',
    repo: 'https://github.com/mudler/LocalAI',
    category: 'Inferência',
    kind: 'runtime',
    status: 'nativo',
    description: 'Servidor OpenAI-compatible auto-hospedado para texto, imagem e áudio.',
    requires: 'LOCALAI_BASE_URL e modelo configurados.',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp',
    repo: 'https://github.com/ggml-org/llama.cpp',
    category: 'Inferência',
    kind: 'runtime',
    status: 'nativo',
    description: 'llama-server local com API de chat completions.',
    requires: 'LLAMACPP_BASE_URL e modelo GGUF carregado.',
  },
  {
    id: 'context7',
    name: 'Context7',
    repo: 'https://github.com/upstash/context7',
    category: 'Conhecimento',
    kind: 'mcp',
    status: 'nativo',
    description:
      'Documentação atualizada de bibliotecas via MCP. O gerador detecta Recharts, Framer Motion, Lucide e clsx no pedido e injeta trechos atuais no contexto do modelo.',
    requires:
      'Endpoint público https://mcp.context7.com/mcp. CONTEXT7_API_KEY é opcional e aumenta os limites de uso.',
  },
  {
    id: 'playwright-cli',
    name: 'Playwright CLI',
    repo: 'https://github.com/microsoft/playwright-cli',
    category: 'Navegador',
    kind: 'cli',
    status: 'nativo',
    description:
      'Valida o preview gerado em navegador headless real, coleta erros de console e rede, detecta tela em branco e salva um screenshot a cada build.',
    requires:
      'playwright-core e Microsoft Edge ou Google Chrome instalados. Por padrão usa o navegador já presente no sistema, sem baixar Chromium.',
  },
  {
    id: 'browser-use',
    name: 'browser-use',
    repo: 'https://github.com/browser-use/browser-use',
    category: 'Navegador',
    kind: 'agent',
    status: 'externo',
    description: 'Agente Python que controla um navegador real para tarefas web.',
    requires: 'Python, navegador e um LLM com visão.',
  },
  {
    id: 'camoufox',
    name: 'Camoufox',
    repo: 'https://github.com/daijro/camoufox',
    category: 'Navegador',
    kind: 'runtime',
    status: 'externo',
    description: 'Navegador anti-detecção baseado em Firefox para automação.',
    requires: 'Instalação Python e uso ético dentro dos termos dos sites.',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    repo: 'https://github.com/firecrawl/firecrawl',
    category: 'Dados',
    kind: 'api',
    status: 'adaptador',
    description:
      'API de crawling e extração que transforma sites em markdown. Pode alimentar a geração a partir de referências.',
    requires: 'FIRECRAWL_API_KEY ou instância self-hosted.',
  },
  {
    id: 'screenshot-to-code',
    name: 'screenshot-to-code',
    repo: 'https://github.com/abi/screenshot-to-code',
    category: 'Geração',
    kind: 'app',
    status: 'externo',
    description: 'Converte screenshots e mockups em HTML/React usando modelos com visão.',
    requires: 'Serviço Python separado e modelo com visão.',
  },
  {
    id: 'spec-kit',
    name: 'Spec Kit',
    repo: 'https://github.com/github/spec-kit',
    category: 'Fluxo de trabalho',
    kind: 'toolkit',
    status: 'adaptador',
    description:
      'Fluxo spec-driven: especificação, plano e tarefas antes do código. Pode virar um modo do gerador.',
    requires: 'CLI specify e template de specs no projeto.',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    repo: 'https://github.com/QwenLM/qwen-code',
    category: 'Agentes',
    kind: 'cli',
    status: 'externo',
    description: 'Agente de código no terminal baseado em Qwen.',
    requires: 'CLI e credenciais do provedor Qwen.',
  },
  {
    id: 'dyad',
    name: 'Dyad',
    repo: 'https://github.com/dyad-sh/dyad',
    category: 'Referência',
    kind: 'app',
    status: 'referência',
    description: 'Alternativa local ao Lovable; referência de UX para geração e preview.',
    requires: 'App desktop separado.',
  },
  {
    id: 'webrad',
    name: 'WebRAD',
    repo: 'https://github.com/Atentor/WebRad',
    category: 'Referência',
    kind: 'ide',
    status: 'referência',
    description:
      'IDE visual open-source em Electron para montar apps web em TypeScript, com designer de componentes, handlers no Monaco e compilador para Web/PWA.',
    requires:
      'App desktop separado, com formato de projeto .wrproj, runtime e compilador próprios. Não é React/Vite nem um adaptador direto do CloneStudio.',
  },
  {
    id: 'plandex',
    name: 'Plandex',
    repo: 'https://github.com/plandex-ai/plandex',
    category: 'Agentes',
    kind: 'cli',
    status: 'externo',
    description: 'Agente de código para tarefas longas no terminal, com planos e diffs.',
    requires: 'CLI e chave de LLM.',
  },
  {
    id: 'trae-agent',
    name: 'Trae Agent',
    repo: 'https://github.com/bytedance/trae-agent',
    category: 'Agentes',
    kind: 'framework',
    status: 'externo',
    description: 'Framework de agentes de software com ferramentas e trajetórias.',
    requires: 'Python e chave de LLM.',
  },
  {
    id: 'openhands',
    name: 'OpenHands',
    repo: 'https://github.com/OpenHands/OpenHands',
    category: 'Agentes',
    kind: 'platform',
    status: 'externo',
    description: 'Plataforma de agentes que edita código e opera terminal/navegador.',
    requires: 'Docker, sandbox e provedor de LLM.',
  },
  {
    id: 'cline',
    name: 'Cline',
    repo: 'https://github.com/cline/cline',
    category: 'Agentes',
    kind: 'extension',
    status: 'externo',
    description: 'Agente dentro do VS Code com edição de arquivos e terminal.',
    requires: 'VS Code e chave de LLM.',
  },
  {
    id: 'open-interpreter',
    name: 'Open Interpreter',
    repo: 'https://github.com/openinterpreter/openinterpreter',
    category: 'Agentes',
    kind: 'cli',
    status: 'externo',
    description: 'Interpretador que executa código localmente a partir de linguagem natural.',
    requires: 'Python e sandbox recomendado.',
  },
  {
    id: 'flowise',
    name: 'Flowise',
    repo: 'https://github.com/FlowiseAI/Flowise',
    category: 'Orquestração',
    kind: 'platform',
    status: 'externo',
    description: 'Construtor visual de fluxos de agentes e RAG.',
    requires: 'Node/Docker e banco de dados.',
  },
  {
    id: 'comfyui',
    name: 'ComfyUI',
    repo: 'https://github.com/Comfy-Org/ComfyUI',
    category: 'Imagem',
    kind: 'engine',
    status: 'externo',
    description: 'Motor de geração de imagens por grafo, com API HTTP.',
    requires: 'GPU recomendada; modelos de imagem pesados.',
  },
  {
    id: 'stable-diffusion-webui',
    name: 'Stable Diffusion WebUI',
    repo: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui',
    category: 'Imagem',
    kind: 'engine',
    status: 'externo',
    description: 'Interface e API para geração de imagens com Stable Diffusion.',
    requires: 'GPU e modelos locais (inviável em 4 GB de RAM).',
  },
  {
    id: 'security-audit-skill',
    name: 'Cloudflare Security Audit',
    repo: 'https://github.com/cloudflare/security-audit-skill',
    category: 'Skills',
    kind: 'skill',
    status: 'catálogo',
    description: 'Skill de auditoria defensiva com validação e relatório.',
    requires: 'Instalada via npx skills add.',
  },
  {
    id: 'scraping-skills',
    name: 'Thirdwatch Scraping Skills',
    repo: 'https://github.com/thirdwatch-dev/scraping-skills',
    category: 'Skills',
    kind: 'skill',
    status: 'catálogo',
    description: 'Skill de scraping responsável e API-first.',
    requires: 'Instalada via npx skills add.',
  },
  {
    id: 'remotion-skills',
    name: 'Remotion Skills',
    repo: 'https://github.com/remotion-dev/skills',
    category: 'Skills',
    kind: 'skill',
    status: 'catálogo',
    description: 'Skill para criar vídeos com Remotion.',
    requires: 'Instalada via npx skills add.',
  },
  {
    id: 'composio',
    name: 'Composio',
    repo: 'https://github.com/ComposioHQ/composio',
    category: 'Integrações',
    kind: 'platform',
    status: 'configuração',
    description: 'Autenticação e sessões de ferramentas para agentes.',
    requires: 'COMPOSIO_API_KEY e fluxo OAuth por usuário.',
  },
  {
    id: 'google-workspace-cli',
    name: 'Google Workspace CLI',
    repo: 'https://github.com/googleworkspace/cli',
    category: 'Integrações',
    kind: 'cli',
    status: 'configuração',
    description: 'Drive, Gmail, Calendar, Docs e Sheets via CLI.',
    requires: 'Projeto Google Cloud e OAuth.',
  },
  {
    id: 'mattpocock-skills',
    name: 'Matt Pocock Skills',
    repo: 'https://github.com/mattpocock/skills',
    category: 'Skills',
    kind: 'skill',
    status: 'adaptador',
    description: 'Skills de TypeScript e engenharia para agentes.',
    requires: 'Instalar via npx skills add.',
  },
  {
    id: 'scroll-craft',
    name: 'Scroll Craft',
    repo: 'https://github.com/nateherkai/scroll-craft',
    category: 'Frontend',
    kind: 'skill',
    status: 'adaptador',
    description: 'Padrões de animação de scroll para páginas e landing pages.',
    requires: 'Inspiração/trechos de CSS e JS integráveis ao template.',
  },
  {
    id: 'laya',
    name: 'Laya',
    repo: 'https://github.com/NandhaKishorM/laya',
    category: 'Navegador',
    kind: 'agent',
    status: 'externo',
    description: 'Assistente/agente de navegador para fluxos web.',
    requires: 'Python e navegador; avaliar licença e manutenção.',
  },
  {
    id: 'voicestudio',
    name: 'VoiceStudio',
    repo: 'https://github.com/debpalash/VoiceStudio',
    category: 'Áudio',
    kind: 'app',
    status: 'externo',
    description: 'Estúdio de voz/TTS com modelos locais ou APIs.',
    requires: 'Modelos de áudio e, idealmente, GPU.',
  },
];

const statusOrder = {
  nativo: 0,
  catálogo: 1,
  adaptador: 2,
  configuração: 3,
  externo: 4,
  referência: 5,
};

export function listIntegrations() {
  return integrations
    .slice()
    .sort(
      (a, b) =>
        (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name),
    );
}

export function integrationGroups() {
  const groups = new Map();
  for (const item of listIntegrations()) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return [...groups.entries()].map(([category, items]) => ({ category, items }));
}

export function integrationSummary() {
  const items = listIntegrations();
  const implemented = items.filter((item) => item.status === 'nativo').length;
  const catalogued = items.filter((item) => ['nativo', 'catálogo'].includes(item.status)).length;
  return {
    total: items.length,
    implemented,
    catalogued,
    byStatus: items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {}),
  };
}
