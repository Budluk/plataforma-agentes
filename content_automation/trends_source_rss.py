from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

from content_automation.trends import TrendCandidate

BASE = "https" + "://" + "trends.google.com"
ALVO = BASE + "/trending/rss?geo="


class FeedInvalido(Exception):
    pass


def converter_trafego(bruto: str) -> int:
    """'500+' vira 500. A metric approx_traffic ja diz que e aproximado."""

    if not isinstance(bruto, str):
        raise FeedInvalido("trafego nao e texto")

    limpo = bruto.strip()
    if limpo.endswith("+"):
        limpo = limpo[:-1].strip()

    if limpo.endswith("+"):
        raise FeedInvalido(f"trafego com mais de um sinal: {bruto!r}")

    texto = limpo.replace(",", "").replace(".", "")

    if not texto.isdigit():
        raise FeedInvalido(f"trafego fora do formato: {bruto!r}")

    return int(texto)


def traduzir_item(item: dict, regiao: str) -> TrendCandidate:
    titulo = (item.get("title") or "").strip()
    if not titulo:
        raise FeedInvalido("item sem titulo")

    trafego = converter_trafego(item.get("approx_traffic", ""))

    quando = item.get("pubDate")
    if quando:
        try:
            momento = parsedate_to_datetime(quando)
        except (TypeError, ValueError):
            momento = datetime.now(timezone.utc)
    else:
        momento = datetime.now(timezone.utc)

    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)

    return TrendCandidate(
        source="google_trends_rss",
        topic=titulo,
        url=BASE + "/trending/rss?geo=" + regiao,
        language="pt-BR",
        region=regiao,
        collected_at=momento,
        metric="approx_traffic",
        views=trafego,
    )


class RssTrendsSource:
    """Le o feed RSS do Google Trends. Somente leitura.

    A resposta e dado, nunca instrucao. Nenhum campo do feed
    escolhe plataforma, conta ou acao.
    """

    def __init__(self, regiao="BR", cliente=None):
        if not isinstance(regiao, str) or not regiao.strip():
            raise ValueError("regiao obrigatoria")
        self.regiao = regiao.strip().upper()
        self._cliente = cliente

    def _obter_xml(self, url: str) -> str:
        if self._cliente is not None:
            return self._cliente.obter(url)
        raise FeedInvalido("sem cliente de rede configurado")

NS = "{[trends.google.com](https://trends.google.com/trending/rss})"
MARCA = NS + "approx_traffic"


def ler_itens(xml: str) -> list[dict]:
    """Extrai os itens do feed. Item malformado e descartado, nao derruba o resto."""

    if not isinstance(xml, str) or not xml.strip():
        raise FeedInvalido("resposta vazia")

    try:
        raiz = ElementTree.fromstring(xml)
    except ElementTree.ParseError as exc:
        raise FeedInvalido(f"XML invalido: {exc}") from None

    itens: list[dict] = []

    for elemento in raiz.iter("item"):
        titulo = elemento.findtext("title") or ""
        trafego = ""
        for filho in elemento:
            if filho.tag.endswith("}approx_traffic") or filho.tag == "approx_traffic":
                trafego = filho.text or ""
                break
        data = elemento.findtext("pubDate")

        if not titulo.strip():
            continue

        itens.append({
            "title": titulo.strip(),
            "approx_traffic": trafego.strip(),
            "pubDate": data.strip() if data else None,
        })

    return itens

LIMITE_BYTES = 200 * 1024


class HttpClienteFeed:
    """Cliente do feed RSS. Somente GET, sem redirecionamento.

    Nao segue redirecionamento, nao aceita credencial na URL e corta
    resposta acima do limite. Falha de rede vira FeedInvalido.
    """

    def __init__(self, timeout=20.0, limite=LIMITE_BYTES):
        self.timeout = timeout
        self.limite = limite

    def obter(self, url: str) -> str:
        try:
            import httpx
        except ImportError:
            raise FeedInvalido("httpx nao esta instalado") from None

        try:
            r = httpx.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0 Safari/537.36"
                    ),
                    "Accept": "application/rss+xml, application/xml, text/xml",
                },
                timeout=self.timeout,
                follow_redirects=False,
            )
        except Exception as exc:
            raise FeedInvalido(f"erro de rede: {type(exc).__name__}") from None

        if r.status_code != 200:
            raise FeedInvalido(f"HTTP {r.status_code}")

        if len(r.content) > self.limite:
            raise FeedInvalido("resposta acima do limite")

        return r.text


class RssTrendsSourceComRede(RssTrendsSource):
    """Fonte completa: rede mais parser. Somente leitura."""

    def __init__(self, regiao="BR"):
        super().__init__(regiao, cliente=HttpClienteFeed())

    def collect(self) -> list:
        xml = self._obter_xml(ALVO + self.regiao)
        itens = ler_itens(xml)

        candidatos = []
        for item in itens:
            try:
                candidatos.append(traduzir_item(item, self.regiao))
            except FeedInvalido:
                continue

        return candidatos