from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trends_source_rss import FeedInvalido, ler_itens


NS = "[trends.google.com](https://trends.google.com/trending/rss)"


def feed(prefixo="ht", ns=NS, itens=None):
    itens = itens if itens is not None else [
        ("lakers x hornets", "500+", "Tue, 17 Nov 2026 19:10:00 -0800"),
        ("cafe gelado", "2000+", None),
    ]
    corpo = ""
    for titulo, trafego, data in itens:
        corpo += "<item><title>" + titulo + "</title>"
        corpo += "<" + prefixo + ":approx_traffic>" + trafego + "</" + prefixo + ":approx_traffic>"
        if data:
            corpo += "<pubDate>" + data + "</pubDate>"
        corpo += "</item>"
    return '<rss xmlns:' + prefixo + '="' + ns + '"><channel>' + corpo + "</channel></rss>"


class ParserTests(unittest.TestCase):
    def test_le_itens_com_prefixo_padrao(self):
        itens = ler_itens(feed())

        self.assertEqual(len(itens), 2)
        self.assertEqual(itens[0]["title"], "lakers x hornets")
        self.assertEqual(itens[0]["approx_traffic"], "500+")

    def test_tolerante_a_outro_prefixo(self):
        itens = ler_itens(feed(prefixo="tr"))

        self.assertEqual(len(itens), 2)
        self.assertEqual(itens[0]["approx_traffic"], "500+")

    def test_tolerante_a_outro_namespace(self):
        itens = ler_itens(feed(ns="[exemplo.invalido](http://exemplo.invalido/feed)"))

        self.assertEqual(itens[0]["approx_traffic"], "500+")

    def test_item_sem_titulo_e_descartado(self):
        itens = ler_itens(feed(itens=[
            ("   ", "100+", None),
            ("cafe gelado", "2000+", None),
        ]))

        self.assertEqual(len(itens), 1)
        self.assertEqual(itens[0]["title"], "cafe gelado")

    def test_item_sem_trafego_vira_texto_vazio(self):
        itens = ler_itens(feed(itens=[("sem trafego", "", None)]))

        self.assertEqual(itens[0]["approx_traffic"], "")

    def test_data_ausente_vira_none(self):
        itens = ler_itens(feed(itens=[("sem data", "500+", None)]))

        self.assertIsNone(itens[0]["pubDate"])

    def test_data_presente_e_preservada(self):
        itens = ler_itens(feed())

        self.assertEqual(
            itens[0]["pubDate"], "Tue, 17 Nov 2026 19:10:00 -0800"
        )

    def test_feed_vazio_devolve_lista_vazia(self):
        self.assertEqual(ler_itens(feed(itens=[])), [])

    def test_xml_invalido_recusa(self):
        for texto in ("<rss", "isso nao e xml", "<rss><channel>"):
            with self.subTest(texto=texto):
                with self.assertRaises(FeedInvalido):
                    ler_itens(texto)

    def test_texto_vazio_recusa(self):
        for texto in ("", "   "):
            with self.subTest(texto=texto):
                with self.assertRaises(FeedInvalido):
                    ler_itens(texto)

    def test_tipo_errado_recusa(self):
        with self.assertRaises(FeedInvalido):
            ler_itens(123)

    def test_item_estranho_nao_derruba_os_outros(self):
        xml = (
            '<rss xmlns:ht="' + NS + '"><channel>'
            "<item></item>"
            "<item><title>valido</title>"
            "<ht:approx_traffic>300+</ht:approx_traffic></item>"
            "</channel></rss>"
        )
        itens = ler_itens(xml)

        self.assertEqual(len(itens), 1)
        self.assertEqual(itens[0]["title"], "valido")


if __name__ == "__main__":
    unittest.main(verbosity=2)
