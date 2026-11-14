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

## Agente Central

`scripts/central_cli.py "<pedido>"` recebe um pedido em linguagem natural e o roteia para uma área.
- O LLM só pode devolver uma área de uma lista fechada (`finance`, `music`, `sales`, `funnel`, `research`, `dev`) ou `none`.
  Qualquer outra coisa, campo extra, JSON inválido ou dúvida vira `none` e nada é despachado.
- O roteador não tem ferramentas nem permissões. O texto que o LLM escreve em `reason` só vai para o log.
- Cada área continua passando pelos seus próprios contratos, gates e permissões: um pedido mal roteado ainda é barrado.
- Finanças exige uma fonte de portfólio real; sem ela, recusa (não inventa dados).
- Revisão de código não passa pelo roteador: use `scripts/dev_cli.py review <arquivo.py>`.

## Regras do hard gate (Economia)

Código: `core/hard_gate.py`. O gate lê só dados validados (nunca texto do LLM). Qualquer regra violada rejeita, e dado ausente também rejeita.

| Regra | Valor | Rejeita quando |
|---|---|---|
| Perda diária | -2.0% | `daily_pnl_pct <= -2.0` |
| Distância do stop | 5.0% | o stop fica a mais de 5.0% da entrada |
| Retorno/risco | 1.5 | (alvo - entrada) / (entrada - stop) abaixo de 1.5 |
| Coerência dos níveis | - | LONG exige stop < entrada < alvo; SHORT, o inverso |
| Portfólio | - | equity ausente ou <= 0, ou `equity_snapshot_consistent = False` |

Não existem limites de tamanho de posição nem de exposição total: o sistema só emite alertas, não dimensiona nem executa ordens.
Se isso mudar, essas regras precisam ser criadas e testadas antes.

## Demo offline (LLM falso)

`FakeLLM` (em `core/llm_client.py`) devolve um texto fixo, sem rede. Os cenários e as respostas fixas ficam em `SCENARIOS`, em `scripts/run_finance_demo.py`; com `--live`, os cenários cuja resposta fixa é um JSON válido chamam o modelo real.

## Modelo do LLM e versões

`GROQ_MODEL` no `.env`. A lista de modelos muda por conta e com o tempo; para ver a da sua:

    .\.venv\Scripts\python.exe -c "import os,httpx; from dotenv import load_dotenv; load_dotenv(); r=httpx.get('https://api.groq.com/openai/v1/models',headers={'Authorization':'Bearer '+os.getenv('GROQ_API_KEY','').strip()},timeout=30); print(r.status_code); [print(m['id']) for m in sorted(r.json().get('data',[]),key=lambda m:m['id'])]"

Em uso: `openai/gpt-oss-20b`. O `llama-3.1-8b-instant` deu 404 nesta conta.
Dependências: `requirements.txt` (5 diretas, versão exata) e `requirements.lock` (todas, para reproduzir o ambiente).
Gates de aceitação: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\verify_gates.ps1`.
