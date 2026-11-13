import pytest
from core.contracts import PortfolioState
from core.hard_gate import (ExecutionToolForbidden, assert_no_execution_tool,
                            compute_risk, evaluate_risk)
from tests.helpers import good_portfolio, proposal


def test_compute_risk_long():
    r = compute_risk(proposal())
    assert r.stop_distance_pct == pytest.approx(3.0)
    assert r.reward_risk_ratio == pytest.approx(8 / 3)
    assert r.levels_coherent


def test_incoherent_levels():
    assert not compute_risk(proposal(stop_price=103.0)).levels_coherent


def test_short_coherent():
    r = compute_risk(proposal(direction="SHORT", stop_price=103.0, target_price=92.0))
    assert r.levels_coherent


def test_approves_good_case():
    d = evaluate_risk(compute_risk(proposal()), good_portfolio())
    assert d.approved and d.reasons == []


def test_inconsistent_snapshot_rejected():
    d = evaluate_risk(compute_risk(proposal()), good_portfolio(equity_snapshot_consistent=False))
    assert not d.approved and d.reasons


def test_missing_portfolio_data_fails_closed():
    d = evaluate_risk(compute_risk(proposal()), PortfolioState())
    assert not d.approved


def test_daily_loss_rejected():
    d = evaluate_risk(compute_risk(proposal()), good_portfolio(daily_pnl_pct=-5.0))
    assert not d.approved


def test_low_reward_risk_rejected():
    d = evaluate_risk(compute_risk(proposal(target_price=101.0)), good_portfolio())
    assert not d.approved


def test_wide_stop_rejected():
    d = evaluate_risk(compute_risk(proposal(stop_price=90.0, target_price=130.0)), good_portfolio())
    assert not d.approved


def test_veto_raises_on_execution_tool():
    with pytest.raises(ExecutionToolForbidden):
        assert_no_execution_tool("execution_order")


def test_veto_allows_normal_tool():
    assert_no_execution_tool("get_market_data")
