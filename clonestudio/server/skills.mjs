import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';

const SKILLS_DIR = path.join(ROOT, 'skills');
const MANIFEST = path.join(SKILLS_DIR, 'manifest.json');

const catalogMeta = [
  {
    id: 'cloudflare-security-audit',
    name: 'Cloudflare Security Audit',
    category: 'Segurança',
    description: 'Auditoria defensiva por fases, validação independente e relatório estruturado.',
    license: 'MIT',
    status: 'instalável',
    install: 'npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit',
  },
  {
    id: 'thirdwatch-scraping',
    name: 'Thirdwatch Scraping Skills',
    category: 'Pesquisa e extração',
    description:
      'Playbook de scraping responsável, decisão API-first e extração de dados públicos.',
    license: 'MIT',
    status: 'instalável',
    install: 'npx skills add https://github.com/thirdwatch-dev/scraping-skills',
  },
  {
    id: 'context7',
    name: 'Context7',
    category: 'Documentação',
    description: 'Documentação atualizada e exemplos por versão via MCP/CLI.',
    license: 'MIT',
    status: 'configuração necessária',
    install: 'npx ctx7 setup',
    env: 'CONTEXT7_API_KEY',
  },
  {
    id: 'remotion',
    name: 'Remotion Agent Skills',
    category: 'Vídeo',
    description: 'Boas práticas para criar, pré-visualizar e renderizar vídeos com Remotion.',
    license: 'Verificar licença do commit instalado',
    status: 'instalável',
    install: 'npx skills add remotion-dev/skills',
  },
  {
    id: 'composio',
    name: 'Composio',
    category: 'Integrações',
    description: 'Toolkit de ferramentas, autenticação e sessões para agentes.',
    license: 'MIT',
    status: 'configuração necessária',
    install: 'npm install @composio/core',
    env: 'COMPOSIO_API_KEY',
  },
  {
    id: 'google-workspace-cli',
    name: 'Google Workspace CLI',
    category: 'Produtividade',
    description: 'CLI para Drive, Gmail, Calendar, Docs e Sheets; requer OAuth.',
    license: 'Apache-2.0',
    status: 'configuração necessária',
    install: 'npm install -g @googleworkspace/cli',
    env: 'GOOGLE_WORKSPACE_CLI_ENABLED',
  },
];

export function listSkills() {
  let manifestSkills = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (Array.isArray(parsed.skills)) manifestSkills = parsed.skills;
  } catch {
    manifestSkills = [];
  }

  return catalogMeta.map((meta) => {
    const manifest = manifestSkills.find((item) => item.id === meta.id) || {};
    let readme = '';
    try {
      readme = fs.readFileSync(path.join(SKILLS_DIR, meta.id, 'SKILL.md'), 'utf8');
    } catch {
      readme = '';
    }
    return {
      ...meta,
      repo: manifest.repo || '',
      install: manifest.install || meta.install,
      installed: Boolean(readme),
      summary: readme
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.startsWith('#'))
        .slice(0, 3)
        .join(' ')
        .slice(0, 320),
    };
  });
}
