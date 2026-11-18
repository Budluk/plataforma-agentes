from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def load_pipeline_module():
    path = ROOT / "agents" / "content" / "pipeline.py"
    spec = importlib.util.spec_from_file_location("content_pipeline", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeMemory:
    def __init__(self):
        self.registros = []

    def record_run(self, agent, pessoa, status, detalhe):
        self.registros.append((agent, status, detalhe))


class FakeLogger:
    def __init__(self):
        self.eventos = []

    def log(self, evento, **campos):
        self.eventos.append((evento, campos))


class FakeLLM:
    def __init__(self, resposta):
        self.resposta = resposta
        self.chamadas = 0

    def complete(self, system, user):
        self.chamadas += 1
        return self.resposta


def rascunho(**kw):
    base = {
        "hook": "Gancho de teste",
        "script": "Um roteiro curto para validar o pipeline de conteudo.",
        "caption": "Legenda de teste para validar o contrato.",
        "hashtags": ["#teste"],
        "language": "pt-BR",
    }
    base.update(kw)
    return json.dumps(base)


class ContentPipelineTests(unittest.TestCase):
    def setUp(self):
        self.module = load_pipeline_module()

    def montar(self, resposta):
        self.memory = FakeMemory()
        self.logger = FakeLogger()
        self.llm = FakeLLM(resposta)
        return self.module.ContentPipeline(
            llm=self.llm, memory=self.memory, logger=self.logger
        )

    def test_rascunho_valido(self):
        resultado = self.montar(rascunho()).run("inteligencia artificial")

        self.assertTrue(resultado.ok, resultado.reasons)
        self.assertEqual(resultado.data["hook"], "Gancho de teste")
        self.assertEqual(resultado.data["hashtags"], ["#teste"])
        self.assertEqual(resultado.data["tema"], "inteligencia artificial")

    def test_json_dentro_de_cerca_e_aceito(self):
        resposta = "```json\n" + rascunho() + "\n```"
        resultado = self.montar(resposta).run("tema qualquer")

        self.assertTrue(resultado.ok, resultado.reasons)

    def test_texto_sem_json_recusa(self):
        resultado = self.montar("claro, aqui esta o texto").run("tema")

        self.assertFalse(resultado.ok)
        self.assertIn("ContentInvalid", resultado.reasons[0])
        self.assertIsNone(resultado.data)

    def test_campo_ausente_recusa(self):
        resposta = json.dumps({"hook": "so isso"})
        resultado = self.montar(resposta).run("tema")

        self.assertFalse(resultado.ok)
        self.assertIn("ContentInvalid", resultado.reasons[0])

    def test_campo_extra_recusa(self):
        resposta = json.dumps({
            "hook": "a", "script": "b" * 30, "caption": "c" * 10,
            "language": "pt-BR", "tool_calls": [],
        })
        resultado = self.montar(resposta).run("tema")

        self.assertFalse(resultado.ok)

    def test_link_no_texto_recusa(self):
        resposta = rascunho(
            script="Veja em " + "https" + "://" + "exemplo.com agora"
        )
        resultado = self.montar(resposta).run("tema")

        self.assertFalse(resultado.ok)

    def test_tema_curto_recusa_sem_chamar_llm(self):
        resultado = self.montar(rascunho()).run("ab")

        self.assertFalse(resultado.ok)
        self.assertEqual(self.llm.chamadas, 0)

    def test_tema_longo_e_truncado(self):
        resultado = self.montar(rascunho()).run("x" * 500)

        self.assertTrue(resultado.ok)
        self.assertEqual(len(resultado.data["tema"]), 300)

    def test_erro_do_llm_recusa(self):
        class LLMQuebrado:
            def complete(self, system, user):
                from core.llm_client import LLMError
                raise LLMError("rede fora")

        self.memory = FakeMemory()
        self.logger = FakeLogger()
        pipeline = self.module.ContentPipeline(
            llm=LLMQuebrado(), memory=self.memory, logger=self.logger
        )
        resultado = pipeline.run("tema")

        self.assertFalse(resultado.ok)
        self.assertIn("LLMError", resultado.reasons[0])

    def test_memoria_e_logger_registram(self):
        self.montar(rascunho()).run("tema")

        self.assertEqual(self.memory.registros[0][1], "ok")
        eventos = [e for e, _ in self.logger.eventos]
        self.assertIn("llm_request", eventos)
        self.assertIn("llm_response", eventos)

    def test_recusa_tambem_registra(self):
        self.montar("nao e json").run("tema")

        self.assertEqual(self.memory.registros[0][1], "rejected")
        eventos = [e for e, _ in self.logger.eventos]
        self.assertIn("rejection", eventos)

    def test_nao_publica_nada(self):
        pipeline = self.montar(rascunho())
        metodos = [m for m in dir(pipeline) if not m.startswith("_")]

        for proibido in ("publish", "post", "send", "upload", "execute"):
            self.assertNotIn(proibido, metodos)


if __name__ == "__main__":
    unittest.main(verbosity=2)
