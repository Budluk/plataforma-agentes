# Prompt para o Lovable — incorporar o pacote ao CloneStudio AI existente

Audite o projeto atual antes de alterar qualquer arquivo. Preserve o Supabase, autenticação, dados e funcionalidades existentes. Use o pacote CloneStudioAI como referência de arquitetura, não como autorização para substituir o projeto.

Implemente no projeto existente:
1. Central de provedores com status real para Ollama, LocalAI, llama.cpp e FreeLLMAPI.
2. Catálogo de Skills: Cloudflare Security Audit, Thirdwatch Scraping, Context7, Remotion, Composio e Google Workspace CLI.
3. Cada Skill deve exibir repositório, finalidade, requisitos, licença verificada e estado de instalação/configuração.
4. Segredos somente no backend/secret manager; nunca no frontend ou em tabelas legíveis pelo usuário.
5. Context7 por MCP/CLI; Composio por sessões autenticadas por usuário; Google Workspace por OAuth explícito.
6. Não simular conexões. Mostrar pendente até um teste real passar.
7. Não executar scraping que contorne autenticação, CAPTCHA ou controles de acesso.
8. Não executar comandos arbitrários no servidor web. Toda execução de agentes deve ocorrer em sandbox isolada.
9. Criar testes, relatório de arquivos alterados e lista de configurações pendentes.

Antes de criar tabelas ou migrações, compare com o schema Supabase existente e proponha migrações aditivas. Não aplicar mudanças destrutivas.
