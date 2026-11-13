from __future__ import annotations
import os
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


class LLMClient(Protocol):
    def complete(self, system: str, user: str) -> str: ...


class HttpLLMClient:
    def __init__(self, provider: str = "groq", env: Mapping[str, str] | None = None, timeout: float = 30.0):
        if provider not in PROVIDERS:
            raise LLMError(f"provider desconhecido: {provider!r}")
        env = os.environ if env is None else env
        self.provider = provider
        self.url, key_var, model_var = PROVIDERS[provider]
        self._key = (env.get(key_var) or "").strip()
        self.model = (env.get(model_var) or "").strip()
        self.timeout = timeout
        if not self._key:
            raise LLMError(f"{key_var} ausente")
        if not self.model:
            raise LLMError(f"{model_var} ausente")

    def __repr__(self) -> str:
        return f"HttpLLMClient(provider={self.provider!r}, model={self.model!r})"

    def complete(self, system: str, user: str) -> str:
        try:
            r = httpx.post(
                self.url,
                headers={"Authorization": f"Bearer {self._key}"},
                json={"model": self.model, "temperature": 0, "max_tokens": 1500,
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": user}]},
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:
            raise LLMError(f"erro de rede: {type(exc).__name__}") from None
        if r.status_code != 200:
            raise LLMError(f"HTTP {r.status_code}: {r.text[:200]}")
        try:
            return r.json()["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, ValueError, TypeError):
            raise LLMError("resposta fora do formato esperado") from None


class FakeLLM:
    """Para testes e demo offline. Não faz rede."""

    def __init__(self, response: str):
        self.response = response
        self.calls = 0

    def complete(self, system: str, user: str) -> str:
        self.calls += 1
        return self.response

