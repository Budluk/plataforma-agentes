from __future__ import annotations
import os
import time
from typing import Mapping, Protocol
import httpx

PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY", "GROQ_MODEL"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
               "GEMINI_API_KEY", "GEMINI_MODEL"),
    "deepseek": ("https://api.deepseek.com/chat/completions", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"),
}


class LLMError(Exception):
    pass


RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
DEFAULT_MAX_TOKENS = 3000
MAX_TOKENS_ENV = "LLM_MAX_TOKENS"


def _resolve_max_tokens(value, env) -> int:
    """Limite por chamada: argumento explícito > env > padrão, sempre validado."""
    if value is None:
        raw = (env or {}).get(MAX_TOKENS_ENV)
        if raw in (None, ""):
            return DEFAULT_MAX_TOKENS
        value, source = raw, MAX_TOKENS_ENV
    else:
        source = "max_tokens"
    if isinstance(value, str):
        try:
            value = int(value.strip())
        except ValueError:
            raise LLMError(f"{source} precisa ser um inteiro positivo") from None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise LLMError(f"{source} precisa ser um inteiro positivo")
    return value


class LLMClient(Protocol):
    def complete(self, system: str, user: str, *, max_tokens: int | None = None) -> str: ...


class HttpLLMClient:
    def __init__(self, provider: str = "groq", env: Mapping[str, str] | None = None, timeout: float = 30.0,
                 *, max_attempts: int = 3, base_delay: float = 0.25, sleep=None,
                 max_tokens: int | str | None = None):
        if provider not in PROVIDERS:
            raise LLMError(f"provider desconhecido: {provider!r}")
        if max_attempts < 1:
            raise LLMError("max_attempts precisa ser >= 1")
        env = os.environ if env is None else env
        self.provider = provider
        self.url, key_var, model_var = PROVIDERS[provider]
        self._key = (env.get(key_var) or "").strip()
        self.model = (env.get(model_var) or "").strip()
        self.timeout = timeout
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self._sleep = sleep or time.sleep
        if not self._key:
            raise LLMError(f"{key_var} ausente")
        if not self.model:
            raise LLMError(f"{model_var} ausente")
        self.max_tokens = _resolve_max_tokens(max_tokens, env)

    def __repr__(self) -> str:
        return (f"HttpLLMClient(provider={self.provider!r}, model={self.model!r}, "
                f"max_tokens={self.max_tokens})")

    def _post(self, system: str, user: str, *, max_tokens: int):
        return httpx.post(
            self.url,
            headers={"Authorization": f"Bearer {self._key}"},
            json={"model": self.model, "temperature": 0, "max_tokens": max_tokens,
                  "messages": [{"role": "system", "content": system},
                               {"role": "user", "content": user}]},
            timeout=self.timeout,
            trust_env=False,
        )

    @staticmethod
    def _parse(r, max_tokens: int = DEFAULT_MAX_TOKENS) -> str:
        try:
            choice = r.json()["choices"][0]
            if choice.get("finish_reason") == "length":
                raise LLMError(f"resposta cortada pelo limite de tokens "
                               f"(finish_reason=length, max_tokens={max_tokens})")
            return choice["message"]["content"] or ""
        except (KeyError, IndexError, ValueError, TypeError):
            raise LLMError("resposta fora do formato esperado") from None

    def complete(self, system: str, user: str, *, max_tokens: int | None = None) -> str:
        """Retries curtos só para 429/5xx e erro de rede; 4xx e JSON inválido falham na hora.

        Um pipeline pode pedir mais espaço só na sua chamada (ex.: código do dev).
        """
        limit = self.max_tokens if max_tokens is None else _resolve_max_tokens(max_tokens, {})
        last = "tentativa não executada"
        for attempt in range(1, self.max_attempts + 1):
            try:
                r = self._post(system, user, max_tokens=limit)
            except httpx.HTTPError as exc:
                last = f"erro de rede: {type(exc).__name__}"
            else:
                if r.status_code == 200:
                    return self._parse(r, limit)
                # o corpo da resposta não entra na mensagem: pode ecoar a requisição
                last = f"HTTP {r.status_code}"
                if r.status_code not in RETRY_STATUS:
                    raise LLMError(last)
            if attempt < self.max_attempts:
                self._sleep(self.base_delay * (2 ** (attempt - 1)))
        raise LLMError(last)


class FakeLLM:
    """Para testes e demo offline. Não faz rede."""

    def __init__(self, response: str):
        self.response = response
        self.calls = 0
        self.last_max_tokens: int | None = None

    def complete(self, system: str, user: str, *, max_tokens: int | None = None) -> str:
        self.calls += 1
        self.last_max_tokens = max_tokens
        return self.response


