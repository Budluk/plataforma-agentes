import json
import os
import time
import pytest
from agents.finance.portfolio_file import describe_problem, load_portfolio, parse_number, write_portfolio
from tests.test_base_agent import GOOD


def _write(tmp_path, text):
    p = tmp_path / "p.json"
    p.write_text(text, encoding="utf-8")
    return p


@pytest.mark.parametrize("text,expected", [("25000", 25000.0), ("25000.5", 25000.5), ("25000,5", 25000.5),
                                           (" -0,4 ", -0.4), ("0", 0.0)])
def test_parse_number_accepts_dot_or_comma(text, expected):
    assert parse_number(text) == expected


@pytest.mark.parametrize("text", ["1.000,50", "1,000.50", "abc", ""])
def test_parse_number_rejects_ambiguous_or_invalid(text):
    with pytest.raises(ValueError):
        parse_number(text)


def test_write_then_load_roundtrip_and_no_problem(tmp_path):
    p = tmp_path / "data" / "portfolio.json"
    write_portfolio(p, equity=25000.0, daily_pnl_pct=-0.4)
    assert json.loads(p.read_text(encoding="utf-8")) == {"equity": 25000.0, "daily_pnl_pct": -0.4,
                                                         "equity_snapshot_consistent": True}
    assert load_portfolio(p)["equity"] == 25000.0 and describe_problem(p) is None


@pytest.mark.parametrize("kw", [dict(equity=0.0, daily_pnl_pct=0.0), dict(equity=-5.0, daily_pnl_pct=0.0),
                                dict(equity=float("nan"), daily_pnl_pct=0.0),
                                dict(equity=1.0, daily_pnl_pct=float("inf"))])
def test_write_refuses_invalid_numbers_and_creates_no_file(tmp_path, kw):
    p = tmp_path / "p.json"
    with pytest.raises(ValueError):
        write_portfolio(p, **kw)
    assert not p.exists()


def test_describe_problem_names_the_cause_without_leaking_values(tmp_path):
    assert "não existe" in describe_problem(tmp_path / "nao.json")
    assert "JSON inválido" in describe_problem(_write(tmp_path, '{"equity": "C:\\qa"}'))
    assert "objeto" in describe_problem(_write(tmp_path, "[1, 2]"))
    msg = describe_problem(_write(tmp_path, json.dumps({**GOOD, "moeda": "SEGREDO"})))
    assert "moeda" in msg and "SEGREDO" not in msg
    msg = describe_problem(_write(tmp_path, json.dumps({**GOOD, "equity": "dez mil"})))
    assert "equity" in msg and "dez mil" not in msg
    assert "faltam" in describe_problem(_write(tmp_path, "{}"))


def test_describe_problem_reports_age(tmp_path):
    p = _write(tmp_path, json.dumps(GOOD))
    old = time.time() - 48 * 3600
    os.utime(p, (old, old))
    assert "24 h" in describe_problem(p)

