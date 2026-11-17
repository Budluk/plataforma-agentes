import pytest
from pydantic import Field
from core import approvals_admin as adm
from core.actions import ActionGateway, ActionRefused, ActionSpec, Limits
from core.contracts import _Strict
from core.control_store import ControlStore


class OrderParams(_Strict):
    symbol: str = Field(min_length=1, max_length=20)
    qty: int = Field(gt=0, le=100)
    limit_price: float = Field(gt=0, allow_inf_nan=False)


def make(tmp_path):
    store = ControlStore(tmp_path / "c.db")
    store.init()
    calls = []
    spec = ActionSpec("demo.order", OrderParams, Limits(5, 5, 60))
    gw = ActionGateway(store, {"demo.order": spec}, {"demo.order": lambda p: calls.append(p) or {"ok": True}})
    return store, gw, calls


def test_real_pydantic_schema_happy_path(tmp_path):
    store, gw, calls = make(tmp_path)
    p = gw.propose("demo.order", {"symbol": "PETR4", "qty": 2, "limit_price": 38.5}, "ag", "r")
    adm.decide(store, p.approval_id, True, "lucas")
    assert gw.execute(p.approval_id, "ex", "r2").result == {"ok": True}
    assert calls == [{"symbol": "PETR4", "qty": 2, "limit_price": 38.5}]


def test_validation_errors_are_reported_by_field_without_the_value(tmp_path):
    store, gw, _ = make(tmp_path)
    with pytest.raises(ActionRefused) as exc:
        gw.propose("demo.order", {"symbol": "PETR4", "qty": 0, "limit_price": 38.5, "foo": "VALOR_SECRETO"}, "ag", "r")
    assert exc.value.code == "invalid_params"
    text = str(store.audit_tail(10))
    assert "foo(extra_forbidden)" in text and "qty(greater_than)" in text and "VALOR_SECRETO" not in text


def test_nan_and_infinite_prices_are_rejected(tmp_path):
    _, gw, _ = make(tmp_path)
    for bad in (float("nan"), float("inf"), -1.0, 0):
        with pytest.raises(ActionRefused):
            gw.propose("demo.order", {"symbol": "PETR4", "qty": 1, "limit_price": bad}, "ag", "r")
