from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trend_growth import compare_growth
from content_automation.trends import TrendCandidate
from content_automation.trends_source_rss import (
    FeedInvalido,
    RssTrendsSource,
    converter_trafego,
    traduzir_item,
)


def item(**kw):
    base = {
        "title": "lakers x hornets",
        "approx_traffic": "500+",
        "pubDate": "Tue, 17 Nov 2026 19:10:00 -0800",
    }
    base.update(kw)
    return base


class ConversaoTests(unittest.TestCase):
    def test_remove_o_mais(self):
        self.assertEqual(converter_trafego("500+"), 500)
        self.assertEqual(converter_trafego("2000+"), 2000)

    def test_aceita_numero_puro(self):
        self.assertEqual(converter_trafego("1000"), 1000)

    def test_aceita_espacos(self):
        self.assertEqual(converter_trafego("  750+  "), 750)

    def test_remove_separadores(self):
        self.assertEqual(converter_trafego("1,000+"), 1000)
        self.assertEqual(converter_trafego("1.000+"), 1000)

    def test_texto_invalido_recusado(self):
        for bruto in ("", "muito", "-5", "5.5x", "500++"):
            with self.subTest(bruto=bruto):
                with self.assertRaises(FeedInvalido):
                    converter_trafego(bruto)

    def test_tipo_errado_recusado(self):
        with self.assertRaises(FeedInvalido):
            converter_trafego(500)


class TraducaoTests(unittest.TestCase):
    def test_item_valido(self):
        candidato = traduzir_item(item(), "BR")

        self.assertEqual(candidato.source, "google_trends_rss")
        self.assertEqual(candidato.topic, "lakers x hornets")
        self.assertEqual(candidato.metric, "approx_traffic")
        self.assertEqual(candidato.views, 500)
        self.assertEqual(candidato.region, "BR")

    def test_url_e_https(self):
        candidato = traduzir_item(item(), "BR")
        self.assertTrue(candidato.url.startswith("https" + "://"))

    def test_fuso_do_feed_e_preservado(self):
        candidato = traduzir_item(item(), "BR")
        self.assertIsNotNone(candidato.collected_at.tzinfo)

    def test_data_invalida_nao_derruba(self):
        candidato = traduzir_item(item(pubDate="data podre"), "BR")
        self.assertIsNotNone(candidato.collected_at.tzinfo)

    def test_sem_data_tambem_vale(self):
        candidato = traduzir_item(item(pubDate=None), "BR")
        self.assertEqual(candidato.metric, "approx_traffic")

    def test_titulo_vazio_recusado(self):
        with self.assertRaises(FeedInvalido):
            traduzir_item(item(title="   "), "BR")

    def test_trafego_ausente_recusado(self):
        with self.assertRaises(FeedInvalido):
            traduzir_item(item(approx_traffic=""), "BR")

    def test_fonte_sem_cliente_recusa(self):
        fonte = RssTrendsSource("BR")
        with self.assertRaises(FeedInvalido):
            fonte._obter_xml("qualquer")

    def test_regiao_obrigatoria(self):
        with self.assertRaises(ValueError):
            RssTrendsSource("   ")

    def test_regiao_normalizada(self):
        self.assertEqual(RssTrendsSource("br").regiao, "BR")

    def test_nao_se_compara_com_outra_metrica(self):
        candidato = traduzir_item(item(), "BR")

        outro = TrendCandidate(
            source=candidato.source,
            topic=candidato.topic,
            url=candidato.url,
            language=candidato.language,
            region=candidato.region,
            collected_at=candidato.collected_at,
            metric="search_index",
            views=80,
        )

        with self.assertRaises(ValueError):
            compare_growth(candidato, outro)

    def test_fonte_nao_publica_nada(self):
        fonte = RssTrendsSource("BR")
        metodos = [m for m in dir(fonte) if not m.startswith("_")]

        for proibido in ("publish", "post", "send", "upload", "execute"):
            self.assertNotIn(proibido, metodos)


if __name__ == "__main__":
    unittest.main(verbosity=2)
