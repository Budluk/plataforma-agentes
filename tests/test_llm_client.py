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


def client(**kw):
    return HttpLLMClient("groq", env=ENV, sleep=lambda _: None, **kw)


def sequence(*responses):
    """Devolve respostas/erros em ordem e conta as chamadas."""
    it = iter(responses)
    calls = []

    def _post(url, **kw):
        calls.append(kw)
        value = next(it)
        if isinstance(value, Exception):
            raise value
        return value

    return _post, calls


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


def test_retries_transient_500_then_succeeds(monkeypatch):
    post, calls = sequence(httpx.Response(500, text="temporario"),
                           httpx.Response(200, json=reply("OK")))
    sleeps = []
    monkeypatch.setattr(llm_client.httpx, "post", post)
    c = HttpLLMClient("groq", env=ENV, base_delay=0.1, sleep=sleeps.append)

    assert c.complete("s", "u") == "OK"
    assert len(calls) == 2 and sleeps == [0.1]


def test_retries_network_error_then_succeeds(monkeypatch):
    post, calls = sequence(httpx.ConnectError("fora"),
                           httpx.Response(200, json=reply("OK")))
    monkeypatch.setattr(llm_client.httpx, "post", post)
    assert client().complete("s", "u") == "OK"
    assert len(calls) == 2


def test_does_not_retry_client_error(monkeypatch):
    post, calls = sequence(httpx.Response(401, text="chave invalida"))
    monkeypatch.setattr(llm_client.httpx, "post", post)
    with pytest.raises(LLMError, match="HTTP 401"):
        client().complete("s", "u")
    assert len(calls) == 1


def test_exhausts_retries_with_backoff(monkeypatch):
    post, calls = sequence(httpx.Response(503), httpx.Response(503), httpx.Response(503))
    sleeps = []
    monkeypatch.setattr(llm_client.httpx, "post", post)
    c = HttpLLMClient("groq", env=ENV, base_delay=0.1, sleep=sleeps.append)

    with pytest.raises(LLMError, match="HTTP 503"):
        c.complete("s", "u")
    assert len(calls) == 3 and sleeps == [0.1, 0.2]


def test_provider_error_body_is_not_exposed(monkeypatch):
    post, _ = sequence(*[httpx.Response(500, text="SEGREDO-DO-PROVEDOR")] * 3)
    monkeypatch.setattr(llm_client.httpx, "post", post)
    with pytest.raises(LLMError) as exc:
        client().complete("s", "u")
    assert "SEGREDO-DO-PROVEDOR" not in str(exc.value)


def test_invalid_json_is_not_retried(monkeypatch):
    post, calls = sequence(httpx.Response(200, json={}))
    monkeypatch.setattr(llm_client.httpx, "post", post)
    with pytest.raises(LLMError, match="formato"):
        client().complete("s", "u")
    assert len(calls) == 1
