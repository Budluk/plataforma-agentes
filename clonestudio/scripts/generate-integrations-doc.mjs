import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listIntegrations, integrationSummary } from '../server/integrations.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const summary = integrationSummary();
const items = listIntegrations();

const statusLabels = {
  nativo: 'Nativo',
  'catálogo': 'Catálogo',
  adaptador: 'Adaptador',
  'configuração': 'Configuração',
  externo: 'Externo',
  'referência': 'Referência',
};

const groups = [
  ['nativo', 'Já integrado ao CloneStudio'],
  ['catálogo', 'Catálogo / skill inclusa'],
  ['adaptador', 'Ponto de extensão preparado'],
  ['configuração', 'Requer configuração de credenciais'],
  ['externo', 'Projeto ou serviço separado'],
  ['referência', 'Referência de produto'],
];

const lines = [];
lines.push('# Integrações e ferramentas mapeadas');
lines.push('');
lines.push(
  'Este documento é gerado a partir de `server/integrations.mjs` por `node scripts/generate-integrations-doc.mjs`.',
);
lines.push('');
lines.push('## Resumo');
lines.push('');
lines.push('| Métrica | Valor |');
lines.push('| --- | --- |');
lines.push(`| Ferramentas mapeadas | ${summary.total} |`);
lines.push(`| Provedores nativos | ${summary.implemented} |`);
lines.push(`| Prontas ou catalogadas | ${summary.catalogued} |`);
lines.push('');
lines.push('## Legenda de status');
lines.push('');
lines.push('| Status | Significado |');
lines.push('| --- | --- |');
lines.push('| Nativo | O CloneStudio fala com essa ferramenta sem código adicional. |');
lines.push('| Catálogo | Skill/instrução já incluída no pacote ou pronta para instalar. |');
lines.push('| Adaptador | Existe um ponto de extensão; a conexão real ainda precisa ser habilitada. |');
lines.push('| Configuração | Depende de chave/OAuth e ajustes no `.env`. |');
lines.push('| Externo | Software separado; não é reimplementado dentro do CloneStudio. |');
lines.push('| Referência | Produto usado como referência de UX/arquitetura. |');
lines.push('');
lines.push('## Ferramentas');
lines.push('');

for (const [status, title] of groups) {
  const groupItems = items.filter((item) => item.status === status);
  if (groupItems.length === 0) continue;
  lines.push(`### ${title}`);
  lines.push('');
  lines.push('| Ferramenta | Categoria | O que é | Requisitos | Link |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const item of groupItems) {
    const description = item.description.replace(/\|/g, '\\|');
    const requires = item.requires.replace(/\|/g, '\\|');
    lines.push(
      `| **${item.name}** | ${item.category} | ${description} | ${requires} | [GitHub](${item.repo}) |`,
    );
  }
  lines.push('');
}

lines.push('## O que não está incluído');
lines.push('');
lines.push(
  '- Pesos de modelos, binários de GPU e imagens de container de terceiros.',
);
lines.push(
  '- Autenticação OAuth pronta para Composio/Google Workspace. Cada integração exige credenciais próprias.',
);
lines.push(
  '- Execução irrestrita de agentes (OpenHands, Cline, Open Interpreter) sem sandbox. Esses projetos rodam separadamente e exigem isolamento.',
);
lines.push(
  '- Scraping que viole termos de uso, CAPTCHA, paywalls ou controles de acesso.',
);
lines.push('');

const output = path.join(ROOT, 'docs', 'INTEGRATIONS.md');
fs.writeFileSync(output, lines.join('\n'), 'utf8');
console.log(`Gerado: ${output} (${items.length} integrações)`);
