import copy
from core.redact import MASK, MAX_ITEMS, MAX_STR, redact, redact_text


def test_masks_by_key_name():
    out = redact({"api_key": "abc", "Authorization": "x", "password": "p", "symbol": "PETR4", "qty": 3})
    assert out["api_key"] == MASK and out["Authorization"] == MASK and out["password"] == MASK
    assert out["symbol"] == "PETR4" and out["qty"] == 3


def test_masks_by_value_pattern_even_under_innocent_keys():
    secrets = ["gsk_" + "a1B2" * 8, "sk-" + "x9" * 12, "Bearer " + "abc.def-" * 4,
               "ghp_" + "Z" * 30, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlMTIz",
               "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----"]
    for s in secrets:
        out = redact({"note": f"antes {s} depois"})
        assert s not in out["note"] and MASK in out["note"], s


def test_truncates_long_text_and_limits_items_and_depth():
    assert len(redact_text("x" * 1000)) < MAX_STR + 20
    assert len(redact(list(range(500)))) == MAX_ITEMS + 1
    deep = cur = {}
    for _ in range(20):
        cur["a"] = {}
        cur = cur["a"]
    assert "profundo demais" in str(redact(deep))


def test_unknown_objects_become_type_names_and_input_is_not_mutated():
    original = {"k": {"inner": ["gsk_" + "z" * 30]}, "obj": object()}
    snapshot = copy.deepcopy({"k": original["k"]})
    out = redact(original)
    assert out["obj"] == "<object>" and original["k"] == snapshot["k"]
    assert "gsk_" not in str(out)


def test_safe_values_pass_through():
    assert redact({"a": 1, "b": 2.5, "c": True, "d": None, "e": "texto normal"}) == {
        "a": 1, "b": 2.5, "c": True, "d": None, "e": "texto normal"}
