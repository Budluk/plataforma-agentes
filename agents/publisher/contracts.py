from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field

PLATAFORMAS = frozenset({
    "tiktok", "instagram", "youtube",
    "facebook", "x", "linkedin",
})

_ID_CONTA = re.compile(r"^[a-z0-9][a-z0-9_-]{1,39}$")
_HASH = re.compile(r"^[0-9a-f]{64}$")


class _Estrito(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class PublishPost(_Estrito):
    """Parametros de uma publicacao. Nada aqui fala com a rede.

    O `media_hash` e o `content_hash` sao o que amarra a aprovacao:
    mudar o texto ou a midia depois de aprovado muda o hash, e o
    gateway recusa a execucao como `tampered`.
    """

    platform: str = Field(min_length=1, max_length=20)
    account_id: str = Field(min_length=2, max_length=40)
    persona_id: str = Field(min_length=1, max_length=40)
    content_hash: str = Field(min_length=64, max_length=64)
    media_hash: str = Field(min_length=64, max_length=64)
    caption: str = Field(max_length=2200)
    scheduled_for: str | None = Field(default=None, max_length=40)

    def __post_init__(self) -> None:
        pass

    def model_post_init(self, __context) -> None:
        if self.platform not in PLATAFORMAS:
            raise ValueError(
                "plataforma nao suportada: " + repr(self.platform)
            )
        if not _ID_CONTA.match(self.account_id):
            raise ValueError("account_id fora do formato")
        if not _HASH.match(self.content_hash):
            raise ValueError("content_hash deve ser sha256 em hex")
        if not _HASH.match(self.media_hash):
            raise ValueError("media_hash deve ser sha256 em hex")
        if not self.caption.strip():
            raise ValueError("caption obrigatoria")
