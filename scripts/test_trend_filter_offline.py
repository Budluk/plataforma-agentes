from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trend_filter import filtrar_por_temas, resumir
from content_automation.trends import TrendCandidate

URL = "https" + "://" + "example.com" + "/feed"


def cand(titulo, trafego=500):
    return TrendCandidate(
        source="google_trends_rss",
        topic=titulo,
        url=URL,
        language="pt-BR",
        region="BR",
        collected_at=datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc),
        metric="approx_traffic",
        views=trafego,
    )


TEMAS = ["python", "programacao", "produtividade"]


class FiltroTests(unittest.TestCase):
    def test_mantem_so_o_que_casa(self):
        lista = [
            cand("curso de python basico", 800),
            cand("lakers x hornets", 2000),
            cand("dicas de produtividade", 300),
        ]
        resultado = filtrar_por_temas(lista, TEMAS)

        self.assertEqual(len(resultado), 2)
        self.assertEqual(resultado[0].topic, "curso de python basico")
        self.assertEqual(resultado[1].topic, "dicas de produtividade")

    def test_ignora_maiuscula(self):
        resultado = filtrar_por_temas([cand("PYTHON para todos")], TEMAS)
        self.assertEqual(len(resultado), 1)

    def test_tema_vazio_permite_tudo(self):
        lista = [cand("lakers x hornets"), cand("h&m")]
        resultado = filtrar_por_temas(lista, [])

        self.assertEqual(len(resultado), 2)

    def test_proibido_barra_mesmo_se_permitido(self):
        lista = [
            cand("python para lucro garantido"),
            cand("python basico"),
        ]
        resultado = filtrar_por_temas(lista, TEMAS, ["lucro garantido"])

        self.assertEqual(len(resultado), 1)
        self.assertEqual(resultado[0].topic, "python basico")

    def test_proibido_vence_o_permitido(self):
        lista = [cand("python com fraude")]
        resultado = filtrar_por_temas(lista, TEMAS, ["fraude"])

        self.assertEqual(resultado, [])

    def test_lista_vazia_devolve_vazio(self):
        self.assertEqual(filtrar_por_temas([], TEMAS), [])

    def test_nada_casa_devolve_vazio(self):
        lista = [cand("lakers x hornets"), cand("big brother brasil")]
        self.assertEqual(filtrar_por_temas(lista, TEMAS), [])

    def test_candidatos_precisa_ser_lista(self):
        with self.assertRaises(TypeError):
            filtrar_por_temas("nao e lista", TEMAS)

    def test_tema_invalido_recusado(self):
        for entrada in ("python", [""], [None], [123]):
            with self.subTest(entrada=entrada):
                with self.assertRaises((TypeError, ValueError)):
                    filtrar_por_temas([cand("python")], entrada)

    def test_resumir_conta_e_soma(self):
        lista = [cand("python", 800), cand("produtividade", 300)]
        resultado = resumir(lista)

        self.assertEqual(resultado["total"], 2)
        self.assertEqual(resultado["trafego_total"], 1100)
        self.assertEqual(len(resultado["temas"]), 2)

    def test_resumir_ignora_trafego_ausente(self):
        lista = [
            TrendCandidate(
                source="manual", topic="sem trafego", url=URL,
                language="pt-BR", region="BR",
                collected_at=datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc),
                metric="approx_traffic", views=None,
            ),
            cand("com trafego", 400),
        ]
        self.assertEqual(resumir(lista)["trafego_total"], 400)

    def test_feed_real_nao_tem_nada_de_python(self):
        """Cenario atual: as tendencias do Brasil nao casam com a persona."""
        feed_brasil = [
            cand("lakers x hornets", 2000),
            cand("big brother brasil", 2000),
            cand("gta 5", 200),
            cand("h&m", 200),
        ]
        self.assertEqual(filtrar_por_temas(feed_brasil, TEMAS), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
