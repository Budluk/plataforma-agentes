from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trend_growth import compare_growth
from content_automation.trends import TrendCandidate


def load_source_module():
    path = ROOT / "content_automation" / "trends_source_simulated.py"
    spec = importlib.util.spec_from_file_location(
        "trends_source_simulated", path
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SimulatedSourceTests(unittest.TestCase):
    def setUp(self):
        self.module = load_source_module()

    def fonte(self, leituras):
        return self.module.SimulatedTrendsSource(leituras)

    def test_produz_candidato_valido(self):
        candidatos = self.fonte([
            {"termo": "inteligencia artificial", "indice": 82}
        ]).collect()

        self.assertEqual(len(candidatos), 1)
        candidato = candidatos[0]
        self.assertEqual(candidato.source, "google_trends")
        self.assertEqual(candidato.metric, "search_index")
        self.assertEqual(candidato.views, 82)
        self.assertEqual(candidato.region, "BR")

    def test_url_e_https_e_sem_credenciais(self):
        candidato = self.fonte([
            {"termo": "python", "indice": 50}
        ]).collect()[0]

        self.assertTrue(candidato.url.startswith("https" + "://"))
        self.assertNotIn("@", candidato.url)

    def test_espaco_vira_mais_na_url(self):
        candidato = self.fonte([
            {"termo": "cafe gelado", "indice": 30}
        ]).collect()[0]

        self.assertIn("cafe+gelado", candidato.url)

    def test_indice_fora_da_escala_recusado(self):
        for indice in (-1, 101, 1000):
            with self.subTest(indice=indice):
                with self.assertRaises(ValueError):
                    self.fonte([
                        {"termo": "teste", "indice": indice}
                    ]).collect()

    def test_indice_tipo_errado_recusado(self):
        for indice in (True, 50.5, "50", None):
            with self.subTest(indice=indice):
                with self.assertRaises(ValueError):
                    self.fonte([
                        {"termo": "teste", "indice": indice}
                    ]).collect()

    def test_termo_vazio_recusado(self):
        with self.assertRaises(ValueError):
            self.fonte([{"termo": "   ", "indice": 10}]).collect()

    def test_extremos_da_escala_aceitos(self):
        candidatos = self.fonte([
            {"termo": "zero", "indice": 0},
            {"termo": "cem", "indice": 100},
        ]).collect()

        self.assertEqual(candidatos[0].views, 0)
        self.assertEqual(candidatos[1].views, 100)

    def test_leituras_deve_ser_lista(self):
        with self.assertRaises(TypeError):
            self.fonte("nao-e-lista")

    def test_nao_mede_crescimento_entre_metricas(self):
        candidato = self.fonte([
            {"termo": "teste", "indice": 50}
        ]).collect()[0]

        outro = TrendCandidate(
            source=candidato.source,
            topic=candidato.topic,
            url=candidato.url,
            language=candidato.language,
            region=candidato.region,
            collected_at=candidato.collected_at,
            metric="views",
            views=900,
        )

        with self.assertRaises(ValueError):
            compare_growth(candidato, outro)

    def test_nao_publica_nada(self):
        fonte = self.fonte([{"termo": "teste", "indice": 5}])
        metodos = [m for m in dir(fonte) if not m.startswith("_")]

        for proibido in ("publish", "post", "send", "upload", "execute"):
            self.assertNotIn(proibido, metodos)


if __name__ == "__main__":
    unittest.main(verbosity=2)
