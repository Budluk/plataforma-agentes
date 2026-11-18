from __future__ import annotations

import pytest

from agents.publisher.contracts import PublishPost
from agents.publisher.handlers import DryRunPublisher
from core import approvals_admin as adm
from core.actions import ActionGateway, ActionRefused, ActionSpec, Limits
from core.control_store import ControlStore

H = "a" * 64
H2 = "b" * 64


class Clock:
    def __init__(self, t=1_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


def params(**kw):
    base = {
        "platform": "tiktok",
        "account_id": "conta-1",
        "persona_id": "p1",
        "content_hash": H,
        "media_hash": H2,
        "caption": "legenda de teste",
    }
    base.update(kw)
    return base


class Env:
    def __init__(self, tmp_path):
        self.clock = Clock()
        self.store = ControlStore(tmp_path / "control.db", clock=self.clock)
        self.store.init()
        self.arquivo = tmp_path / "dryrun.txt"
        self.handler = DryRunPublisher(self.arquivo)

        spec = ActionSpec(
            "publish.post", PublishPost, Limits(5, 3, 3600),
            approval_ttl_seconds=600,
        )
        self.gw = ActionGateway(
            self.store,
            {"publish.post": spec},
            {"publish.post": self.handler},
        )

    def propor(self, **kw):
        return self.gw.propose("publish.post", params(**kw), "agente", "run1")

    def aprovar(self, aid):
        return adm.decide(self.store, aid, True, "lucas")

    def executar(self, aid):
        return self.gw.execute(aid, "executor", "run2")

    def linhas(self):
        if not self.arquivo.exists():
            return []
        return self.arquivo.read_text(encoding="utf-8").splitlines()


def recusa(codigo, fn, *a):
    with pytest.raises(ActionRefused) as exc:
        fn(*a)
    assert exc.value.code == codigo, exc.value.code


def test_publica_simulado_sem_aprovacao_nao_executa(tmp_path):
    e = Env(tmp_path)
    pedido = e.propor()
    recusa("not_approved", e.executar, pedido.approval_id)
    assert e.linhas() == []


def test_caminho_completo_grava_uma_linha(tmp_path):
    e = Env(tmp_path)
    pedido = e.propor()
    assert e.aprovar(pedido.approval_id) == "approved"

    resultado = e.executar(pedido.approval_id)

    assert resultado.result["simulado"] is True
    assert resultado.result["publicado"] is False
    assert len(e.linhas()) == 1
    assert e.linhas()[0].startswith("tiktok|conta-1|p1|")


def test_uso_unico_bloqueia_segunda_execucao(tmp_path):
    e = Env(tmp_path)
    pedido = e.propor()
    e.aprovar(pedido.approval_id)
    e.executar(pedido.approval_id)

    recusa("not_approved", e.executar, pedido.approval_id)
    assert len(e.linhas()) == 1


def test_negado_nao_executa(tmp_path):
    e = Env(tmp_path)
    pedido = e.propor()
    assert adm.decide(e.store, pedido.approval_id, False, "lucas") == "denied"

    recusa("not_approved", e.executar, pedido.approval_id)
    assert e.linhas() == []


def test_expirada_nao_executa(tmp_path):
    e = Env(tmp_path)
    pedido = e.propor()
    e.aprovar(pedido.approval_id)

    e.clock.t += 601
    recusa("not_approved", e.executar, pedido.approval_id)
    assert e.linhas() == []


def test_aprovacao_nao_serve_para_outra_conta(tmp_path):
    """Cada aprovacao vale para uma conta; o hash amarra isso."""
    e = Env(tmp_path)
    pedido = e.propor(account_id="conta-1")
    e.aprovar(pedido.approval_id)

    linhas_antes = len(e.linhas())
    outro = e.gw.propose(
        "publish.post", params(account_id="conta-2"), "agente", "run9"
    )

    assert outro.approval_id != pedido.approval_id

    # O pedido da conta-2 esta pending: executar recusa.
    recusa("not_approved", e.executar, outro.approval_id)

    # Executar o pedido aprovado da conta-1 publica na conta-1.
    e.executar(pedido.approval_id)
    assert len(e.linhas()) == linhas_antes + 1
    assert "conta-1" in e.linhas()[-1]
    assert "conta-2" not in e.linhas()[-1]


def test_parametros_gravados_ficam_amarrados_ao_hash(tmp_path):
    """Alterar os parametros no banco invalida a aprovacao."""
    e = Env(tmp_path)
    pedido = e.propor()
    e.aprovar(pedido.approval_id)

    con = e.store._connect()
    con.execute(
        "UPDATE approvals SET params_json=? WHERE id=?",
        ('{"platform":"tiktok","account_id":"conta-9",'
         '"persona_id":"p1","content_hash":"' + H + '",'
         '"media_hash":"' + H2 + '","caption":"outra",'
         '"scheduled_for":null}',
         pedido.approval_id),
    )
    con.commit()
    con.close()

    recusa("tampered", e.executar, pedido.approval_id)
    assert e.linhas() == []

def test_kill_switch_bloqueia_proposta(tmp_path):
    e = Env(tmp_path)
    adm.engage_kill(e.store, "parada manual", "lucas")

    recusa("kill_switch", e.propor)
    assert e.linhas() == []


def test_plataforma_desconhecida_nao_passa_do_schema(tmp_path):
    e = Env(tmp_path)
    recusa(
        "invalid_params", e.gw.propose, "publish.post",
        params(platform="orkut"), "agente", "run1",
    )
    assert e.linhas() == []


def test_caption_vazia_e_recusada(tmp_path):
    e = Env(tmp_path)
    recusa(
        "invalid_params", e.gw.propose, "publish.post",
        params(caption="   "), "agente", "run1",
    )


def test_hash_invalido_e_recusado(tmp_path):
    e = Env(tmp_path)
    recusa(
        "invalid_params", e.gw.propose, "publish.post",
        params(content_hash="curto"), "agente", "run1",
    )


def test_limite_de_execucoes_por_janela(tmp_path):
    e = Env(tmp_path)
    e.gw._specs["publish.post"] = ActionSpec(
        "publish.post", PublishPost, Limits(5, 1, 3600),
        approval_ttl_seconds=600,
    )

    for _ in range(1):
        pedido = e.propor()
        e.aprovar(pedido.approval_id)
        e.executar(pedido.approval_id)

    segundo = e.propor()
    e.aprovar(segundo.approval_id)
    recusa("rate_limited", e.executar, segundo.approval_id)

    assert len(e.linhas()) == 1


def test_cadeia_de_auditoria_permanece_integra(tmp_path):
    e = Env(tmp_path)
    pedido = e.propor()
    e.aprovar(pedido.approval_id)
    e.executar(pedido.approval_id)

    ok, n, ruim = e.store.verify_chain()

    assert ok is True, f"cadeia adulterada no evento {ruim}"
    assert n > 0
