import httpx
import pytest
from core import llm_client
from core.llm_client import HttpLLMClient, LLMError

ENV = {"GROQ_API_KEY": "k", "GROQ_MODEL": "m"}


def reply(content, finish="stop"):
    return {"choices": [{"finish_reason": finish, "message": {"content": content}}]}


def fake_post(payload=None, status=200, text="boom", seen=None):
    def _post(url, **kw):
        if seen is not None:
            seen.update(kw)
        if payload is None:
            return httpx.Response(status, text=text)
        return httpx.Response(status, json=payload)
    return _post


def client():
    return HttpLLMClient("groq", env=ENV)


def test_returns_content(monkeypatch):
    monkeypatch.setattr(llm_client.httpx, "post", fake_post(reply("OK")))
    assert client().complete("s", "u") == "OK"


def test_truncated_response_is_an_explicit_error(monkeypatch):
    monkeypatch.setattr(llm_client.httpx, "post", fake_post(reply('{"a": "cort', "length")))
    with pytest.raises(LLMError, match="limite de tokens"):
        client().complete("s", "u")


def test_null_content_becomes_empty_string(monkeypatch):
    monkeypatch.setattr(llm_client.httpx, "post", fake_post(reply(None)))
    assert client().complete("s", "u") == ""


def test_http_error_is_llm_error(monkeypatch):
    monkeypatch.setattr(llm_client.httpx, "post", fake_post(None, status=500))
    with pytest.raises(LLMError, match="HTTP 500"):
        client().complete("s", "u")


def test_malformed_payload_is_llm_error(monkeypatch):
    monkeypatch.setattr(llm_client.httpx, "post", fake_post({}))
    with pytest.raises(LLMError, match="formato"):
        client().complete("s", "u")


def test_request_leaves_room_for_reasoning_tokens(monkeypatch):
    seen = {}
    monkeypatch.setattr(llm_client.httpx, "post", fake_post(reply("OK"), seen=seen))
    client().complete("s", "u")
    assert seen["json"]["max_tokens"] >= 3000


def test_ignores_proxy_environment(monkeypatch):
    seen = {}
    monkeypatch.setattr(llm_client.httpx, "post", fake_post(reply("OK"), seen=seen))
    client().complete("s", "u")
    assert seen["trust_env"] is False
