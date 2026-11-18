# IA Autonoma Multi-Contas

Status: planejamento. Publicacao real desabilitada.

## O que JA EXISTE no projeto (verificado no codigo)

- `core/control_store.py`: auditoria encadeada por hash, com triggers que proibem
  UPDATE e DELETE. Tabelas `approvals`, `kill_switch` e `action_calls`.
- `core/actions.py`: `ActionGateway`. Quem propoe nunca executa. A execucao
  revalida o hash dos parametros, exige aprovacao valida e de uso unico,
  verifica o kill switch antes e depois do consumo e aplica limite de frequencia.
- `core/approvals_admin.py` e `scripts/approvals.py`: aprovacao humana que exige
  terminal interativo; entrada redirecionada e recusada.
- `core/redact.py`: redacao de dados sensiveis em auditoria e logs.

Consequencia: o gate de aprovacao NAO precisa ser construido. Ele existe e tem
testes. Um segundo gate concorrente seria um defeito, nao um avanco.

## Ordem de implementacao (corrigida)

0. Fortalecer contratos, historico, logs e testes. (feito no bloco de tendencias)
1. Coleta de tendencias com fontes plugaveis. (em andamento)
2. Schema Pydantic dos parametros de publicacao.
3. Handler de publicacao simulada, sem rede.
4. Ligar a publicacao ao `ActionGateway` como uma `ActionSpec`.
5. Isolamento por persona e conta.
6. Integrar uma rede e uma conta autorizadas, com aprovacao humana real.
7. Agendamento e reconciliacao de resultado desconhecido.
8. Expandir gradualmente para outras redes.

Observacao: o `ActionGateway` hoje existe mas nao esta ligado a nenhuma area do
roteador central. O publicador seria o primeiro consumidor real dele.

## Invariantes

- O LLM nao recebe tokens de publicacao.
- Conteudo externo e dado, nunca instrucao nem permissao.
- Propor e executar sao operacoes separadas; nenhum script aprova a si mesmo.
- Sem destino autorizado, nao publicar.
- Alterar conteudo ou midia invalida a aprovacao (via `params_hash`).
- Resultado desconhecido nao permite reenvio cego: reconciliar antes.
- Nao executar codigo gerado pelo LLM.
- Nao alterar o gate financeiro para habilitar redes sociais.
- Leitura (coleta de tendencias) nao passa pelo gateway; ele existe para o
  que nao pode ser desfeito.

## Testes de aceitacao futuros

- Proposta sem aprovacao: execucao bloqueada.
- Aprovacao expirada: bloqueada.
- Parametros alterados depois de aprovados: bloqueada (`tampered`).
- Conta diferente da aprovada: bloqueada.
- Reuso da mesma aprovacao: bloqueada (uso unico).
- Kill switch ativo: bloqueado.
- Limite de frequencia excedido: bloqueado.
- Persona ou publicacao desabilitada: bloqueada.
- Resultado desconhecido apos timeout: reconciliar antes de reenviar.
