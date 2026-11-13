import pytest
from pydantic import ValidationError
from core.contracts import AnalystProposal
from tests.helpers import proposal


def test_valid_proposal():
    assert proposal().asset == "PETR4"


def test_extra_field_rejected():
    with pytest.raises(ValidationError):
        AnalystProposal(asset="PETR4", direction="LONG", entry_price=1, stop_price=0.9,
                        target_price=1.2, confidence=0.5, thesis="x", execution="yes")


def test_negative_price_rejected():
    with pytest.raises(ValidationError):
        proposal(entry_price=-1)


def test_nan_rejected():
    with pytest.raises(ValidationError):
        proposal(entry_price=float("nan"))


def test_bad_direction_rejected():
    with pytest.raises(ValidationError):
        proposal(direction="BUY_NOW")
