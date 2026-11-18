from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.content.personas import (
    PersonaInvalida,
    carregar_persona,
    exigir_persona_ativa,
    tema_permitido,
)


def escrever(base, dados):
    caminho = base / "persona.json"
    caminho.write_text(json.dumps(dados), encoding="utf-8")
    return caminho


def persona(**kw):
    base = {
        "persona_id": "teste",
        "enabled": True,
        "language": "pt-BR",
        "niche": "tecnologia",
        "editorial_identity": "Perfil de teste",
        "style": "didatico e objetivo",
        "allowed_topics": ["python", "produtividade"],
        "forbidden_topics": ["fraude"],
        "accounts": ["conta-1"],
        "require_sources_for_factual_claims": True,
    }
    base.update(kw)
    return base


class PersonaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)

    def test_persona_valida(self):
        p = carregar_persona(escrever(self.base, persona()))
        self.assertEqual(p.persona_id, "teste")
        exigir_persona_ativa(p)

    def test_arquivo_ausente(self):
        with self.assertRaises(PersonaInvalida):
            carregar_persona(self.base / "nao-existe.json")

    def test_json_invalido(self):
        caminho = self.base / "quebrado.json"
        caminho.write_text("{isso nao e json", encoding="utf-8")
        with self.assertRaises(PersonaInvalida):
            carregar_persona(caminho)

    def test_campo_extra_recusado(self):
        dados = persona()
        dados["tool_calls"] = []
        with self.assertRaises(PersonaInvalida):
            carregar_persona(escrever(self.base, dados))

    def test_desabilitada_recusada(self):
        p = carregar_persona(escrever(self.base, persona(enabled=False)))
        with self.assertRaises(PersonaInvalida):
            exigir_persona_ativa(p)

    def test_sem_conta_recusada(self):
        p = carregar_persona(escrever(self.base, persona(accounts=[])))
        with self.assertRaises(PersonaInvalida):
            exigir_persona_ativa(p)

    def test_tema_permitido(self):
        p = carregar_persona(escrever(self.base, persona()))
        self.assertTrue(tema_permitido(p, "aula de python"))
        self.assertTrue(tema_permitido(p, "Python avancado"))

    def test_tema_fora_da_lista_recusado(self):
        p = carregar_persona(escrever(self.base, persona()))
        self.assertFalse(tema_permitido(p, "culinaria vegana"))

    def test_tema_proibido_recusado(self):
        p = carregar_persona(escrever(self.base, persona()))
        self.assertFalse(tema_permitido(p, "como fazer fraude fiscal"))

    def test_lista_vazia_permite_qualquer_tema(self):
        p = carregar_persona(
            escrever(self.base, persona(allowed_topics=[]))
        )
        self.assertTrue(tema_permitido(p, "qualquer assunto"))

    def test_exemplo_do_projeto_esta_desabilitado(self):
        exemplo = ROOT / "config" / "personas" / "exemplo.json"
        p = carregar_persona(exemplo)

        self.assertEqual(p.persona_id, "exemplo")
        self.assertFalse(p.enabled)
        with self.assertRaises(PersonaInvalida):
            exigir_persona_ativa(p)


if __name__ == "__main__":
    unittest.main(verbosity=2)
