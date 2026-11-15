from tests.test_base_agent import GOOD
from tests.test_pipeline import pipe


def test_extra_field_is_reported_by_name_without_leaking_the_value(env):
    res = pipe(env).run("PETR4", {**GOOD, "moeda": "BRL-SECRETO"})
    assert not res.approved
    assert "portfólio inválido" in res.reasons[0] and "moeda" in res.reasons[0]
    assert "SECRETO" not in " ".join(res.reasons)


def test_wrong_type_is_reported_by_field_without_the_value(env):
    res = pipe(env).run("PETR4", {**GOOD, "equity": "dez mil"})
    assert not res.approved and "equity" in res.reasons[0]
    assert "dez mil" not in " ".join(res.reasons)


def test_valid_portfolio_is_not_flagged(env):
    assert pipe(env).run("PETR4", dict(GOOD)).approved


def test_empty_portfolio_still_fails_closed_with_the_old_reasons(env):
    res = pipe(env).run("PETR4", {})
    assert not res.approved and any("ausentes" in r for r in res.reasons)
