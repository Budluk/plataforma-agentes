from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trend_store import TrendStore
from content_automation.trends import TrendCandidate

URL_A = "https" + "://" + "example.com" + "/pauta-a"
URL_B = "https" + "://" + "example.com" + "/pauta-b"


def load_pipeline_module():
    path = ROOT / "pipelines" / "trends_pipeline.py"
    spec = importlib.util.spec_from_file_location("trends_pipeline", path)
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


class FakeSource:
    def __init__(self, candidatos=None, erro=None):
        self._candidatos = candidatos or []
        self._erro = erro

    def collect(self):
        if self._erro is not None:
            raise self._erro
        return list(self._candidatos)


def candidato(url=URL_A, views=100):
    return TrendCandidate(
        source="fake",
        topic="Pauta",
        url=url,
        language="pt-BR",
        region="BR",
        collected_at=datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc),
        views=views,
    )


class TrendsPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = TrendStore(Path(self.temp.name) / "pipeline.sqlite3")
        self.module = load_pipeline_module()

    def montar(self, source):
        self.memory = FakeMemory()
        self.logger = FakeLogger()
        return self.module.TrendsPipeline(
            source=source,
            store=self.store,
            memory=self.memory,
            logger=self.logger,
        )

    def test_coleta_valida(self):
        pipeline = self.montar(FakeSource([candidato()]))
        resultado = pipeline.run()

        self.assertTrue(resultado.ok, resultado.reasons)
        self.assertEqual(resultado.data["novas"], 1)
        self.assertEqual(resultado.data["duplicadas"], 0)
        self.assertEqual(len(self.store.list_observations()), 1)

    def test_segunda_execucao_conta_duplicada(self):
        candidatos = [candidato()]
        self.montar(FakeSource(candidatos)).run()
        resultado = self.montar(FakeSource(candidatos)).run()

        self.assertTrue(resultado.ok)
        self.assertEqual(resultado.data["novas"], 0)
        self.assertEqual(resultado.data["duplicadas"], 1)
        self.assertEqual(len(self.store.list_observations()), 1)

    def test_fonte_vazia_recusa(self):
        resultado = self.montar(FakeSource([])).run()

        self.assertFalse(resultado.ok)
        self.assertIn("nao retornou candidatos", resultado.reasons[0])
        self.assertEqual(len(self.store.list_observations()), 0)

    def test_erro_da_fonte_recusa_sem_estourar(self):
        resultado = self.montar(
            FakeSource(erro=RuntimeError("rede fora"))
        ).run()

        self.assertFalse(resultado.ok)
        self.assertIn("RuntimeError", resultado.reasons[0])
        self.assertEqual(len(self.store.list_observations()), 0)

    def test_candidato_invalido_nao_derruba_os_validos(self):
        fonte = FakeSource([candidato(URL_A), candidato(URL_B, views=999)])
        pipeline = self.montar(fonte)
        resultado = pipeline.run()

        self.assertTrue(resultado.ok)
        self.assertEqual(resultado.data["novas"], 2)

    def test_memoria_e_logger_registram(self):
        self.montar(FakeSource([candidato()])).run()

        self.assertEqual(len(self.memory.registros), 1)
        self.assertEqual(self.memory.registros[0][1], "ok")

        eventos = [evento for evento, _ in self.logger.eventos]
        self.assertIn("trends_collected", eventos)

    def test_recusa_tambem_registra(self):
        self.montar(FakeSource([])).run()

        self.assertEqual(self.memory.registros[0][1], "rejected")
        eventos = [evento for evento, _ in self.logger.eventos]
        self.assertIn("rejection", eventos)

    def test_nao_publica_nada(self):
        """Garantia explicita: o pipeline nao tem metodo de publicacao."""
        pipeline = self.montar(FakeSource([candidato()]))
        metodos = [m for m in dir(pipeline) if not m.startswith("_")]

        for proibido in ("publish", "post", "send", "upload", "execute"):
            self.assertNotIn(proibido, metodos)

if __name__ == "__main__":
    unittest.main(verbosity=2)
