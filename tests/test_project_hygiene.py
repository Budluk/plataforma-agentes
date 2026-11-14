import re
from pathlib import Path
from core import hard_gate

ROOT = Path(__file__).resolve().parent.parent
DIRECT = {"pydantic", "httpx", "python-dotenv", "pytest", "pytest-asyncio"}


def _lines(name):
    text = (ROOT / name).read_text(encoding="utf-8")
    return [l.strip() for l in text.splitlines() if l.strip() and not l.strip().startswith("#")]


def test_requirements_are_exactly_the_five_direct_deps_with_exact_versions():
    names = set()
    for line in _lines("requirements.txt"):
        m = re.fullmatch(r"([A-Za-z0-9_.\-]+)==(\d+(\.\d+)*)", line)
        assert m, f"linha sem versão exata: {line}"
        names.add(m.group(1).lower())
    assert names == DIRECT


def test_lock_contains_every_pinned_requirement():
    lock = set(_lines("requirements.lock"))
    assert set(_lines("requirements.txt")) <= lock


def test_env_example_has_unique_keys_empty_secrets_and_no_retired_model():
    entries = _lines(".env.example")
    keys = [e.split("=", 1)[0] for e in entries]
    assert len(keys) == len(set(keys)), "chave repetida no .env.example"
    values = dict(e.split("=", 1) for e in entries)
    for key, value in values.items():
        if any(s in key.upper() for s in ("KEY", "TOKEN", "SECRET", "PASSWORD")):
            assert value == "", f"{key} não pode ter valor no .env.example"
    assert values["GROQ_MODEL"].strip() and values["GROQ_MODEL"] != "llama-3.1-8b-instant"


def test_readme_documents_the_real_gate_numbers_and_the_fake_llm():
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    for value in (hard_gate.MAX_DAILY_LOSS_PCT, hard_gate.MAX_STOP_DISTANCE_PCT, hard_gate.MIN_REWARD_RISK):
        assert str(value) in text
    assert "FakeLLM" in text and "run_finance_demo.py" in text
    assert "Não existem limites de tamanho de posição" in text
