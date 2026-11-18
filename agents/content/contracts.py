from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class _Estrito(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ContentDraft(_Estrito):
    """O que o LLM devolve. Nada aqui e publicado diretamente.

    Sem links: um link no texto e o sinal classico de isca vinda da
    fonte de tendencia, do mesmo modo que o pipeline de pesquisa ja
    trata.
    """

    hook: str = Field(min_length=3, max_length=120)
    script: str = Field(min_length=20, max_length=1500)
    caption: str = Field(min_length=3, max_length=2200)
    hashtags: list[str] = Field(default_factory=list, max_length=10)
    language: str = Field(min_length=2, max_length=10)

    def model_post_init(self, __context) -> None:
        texto = " ".join([self.hook, self.script, self.caption])
        if "http" in texto.lower() or "www." in texto.lower():
            raise ValueError("texto gerado contem link")
        for tag in self.hashtags:
            if not tag.startswith("#") or " " in tag:
                raise ValueError("hashtag fora do formato: " + repr(tag))
