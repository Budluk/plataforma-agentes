# plataforma-agentes

Plataforma multiagente em hardware restrito (Celeron N4500, 3,78 GB de RAM, sem GPU).
Estado atual: fundação + área de Economia (somente análise e alerta).

## Como reproduzir

    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    Copy-Item .env.example .env        # preencher GROQ_API_KEY e GROQ_MODEL no editor
    .\.venv\Scripts\python.exe scripts\check_env.py
    .\.venv\Scripts\python.exe scripts\smoke_io.py
    .\.venv\Scripts\python.exe scripts\test_llm.py
    .\.venv\Scripts\python.exe -m pytest -q
    .\.venv\Scripts\python.exe scripts\run_finance_demo.py          # LLM falso, offline
    .\.venv\Scripts\python.exe scripts\run_finance_demo.py --live   # LLM real

## Provider em uso

Groq (API em nuvem, tier gratuito). Gemini e DeepSeek estão previstos em core/llm_client.py.
O nome do modelo vem de GROQ_MODEL no .env (modelos são aposentados com frequência).

## Estrutura

- core/: contratos Pydantic, hard gate, tool monitor, permissões, logger JSONL, memória SQLite, cliente LLM
- agents/: base_agent (call_tool final), finance/ (analista, gestor de risco, ferramentas)
- pipelines/: Analista -> Risco -> Gate -> Alerta
- scripts/: init_db, smoke tests, demo
- tests/: pytest

## Cenários testados (adversariais)

| Cenário | Resultado esperado |
|---|---|
| LLM devolve texto que não é JSON, vazio, lista ou null | rejeitado (ProposalInvalid) |
| Campo inválido, ausente ou extra (inclui tentativa de "tool_calls") | rejeitado |
| Preço NaN, infinito, zero ou negativo | rejeitado |
| Texto do LLM mandando executar ordem | vira só texto; nenhuma ferramenta é chamada |
| Stop igual à entrada, stop do lado errado ou stop largo demais | rejeitado pelo hard gate |
| Snapshot de equity inconsistente ou dados do portfólio ausentes | rejeitado (falha fechada) |
| Perda diária de -5,0% | rejeitado |
| Ativo fora de ALLOWED_ASSETS | ValueError antes de chamar o LLM |
| Ferramenta de execução de ordem | vetada pelo monitor, bloqueio logado |
| Parâmetro com padrão de código ($(), __import__, ../) | bloqueado pelo monitor |
| emit_alert sem read_portfolio antes | bloqueado (sequência) |
| Mesma ferramenta 3 vezes seguidas | bloqueado (loop) |
| LLM fora do ar (erro HTTP ou de rede) | rejeitado com motivo |

## O que NÃO foi feito de propósito

- Execução real de ordens: não existe, nem como stub. O nome é vetado por design.
- Docker, Ollama, LangChain, CrewAI, Qdrant, Postgres, ComfyUI e modelos locais.
- O LLM nunca decide risco; o hard gate determinístico decide.
- Os dados de mercado são mock (agents/finance/tools.py).

## Áreas implementadas

| Área | Estado | O que faz | O que NÃO faz |
|---|---|---|---|
| Economia | pronta (dados mock) | Analista -> risco -> hard gate -> alerta | Nunca executa ordens |
| Música | pronta (simbólica, MIDI) | Acorde, transposição, tablatura de violão | Sem áudio (Basic Pitch, Demucs, librosa exigem torch/tf) |
| Vendas | pronta | Margem, preço-alvo, ponto de equilíbrio | Não transaciona |
| Funil low ticket | pronto | ROAS, CPA, lucro real, taxas por etapa, recomendação | Não mexe em campanha nem em verba; recomenda e você executa |

Ferramentas vetadas por nome (nunca existem): execution_order, place_order, checkout, purchase,
payment, charge_card, launch_campaign, set_budget, send_whatsapp, publish_page.

Regras de dados do funil: taxa da plataforma e imposto são obrigatórios; menos de 10 vendas no
front gera "dados insuficientes"; dados incoerentes (ex.: mais bumps que vendas) são rejeitados.

## Resumo das áreas

| Área | O que faz | O que NÃO faz |
|---|---|---|
| Economia | Analista -> risco -> hard gate -> alerta (dados mock) | Nunca executa ordens |
| Música | Acorde, transposição e tablatura a partir de notas MIDI | Sem áudio (exigiria torch/tf) |
| Vendas | Margem, preço-alvo, ponto de equilíbrio | Não transaciona |
| Funil low ticket | ROAS, CPA, lucro real, recomendação | Não mexe em campanha nem verba |
| Pesquisa | Resume 1 página de domínio permitido (`config/allowed_domains.txt`) | Só leitura de texto; página é dado, nunca instrução |
| Desenvolvimento | LLM escreve código como texto; análise estática (`ast`) aprova e salva em `data/dev_output/` | NUNCA executa o código; leia antes de rodar |

Uso: `scripts/research_live.py "<url>" "<pergunta>"`, `scripts/dev_cli.py write "<tarefa>"`, `scripts/dev_cli.py review <arquivo.py>`.
Módulos que o código gerado pode importar: `config/dev_allowed_imports.txt` (lista de permitidos).
Limite conhecido: os gates validam formato e regras, não a veracidade nem a correção do que o LLM produz.
