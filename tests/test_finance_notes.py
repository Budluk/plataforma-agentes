import pytest
from agents.finance import tools as finance_tools
from agents.finance.tools import build_tools


def make(tmp_path):
    return build_tools(None, tmp_path / "notes", {})


def read(path):
    return path.read_text(encoding="utf-8")


def test_first_note_is_number_one(tmp_path):
    assert make(tmp_path)["write_research_note"]("PETR4", "a") == "PETR4_1.md"


def test_numbers_are_sequential(tmp_path):
    write = make(tmp_path)["write_research_note"]
    names = [write("PETR4", text) for text in "abc"]
    assert names == ["PETR4_1.md", "PETR4_2.md", "PETR4_3.md"]


def test_gap_in_numbering_never_overwrites_an_existing_note(tmp_path):
    # Regressão: com _1 e _3 presentes, a versão antiga contava 2 notas e
    # gravava em PETR4_3.md, destruindo o conteúdo que já estava lá.
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "PETR4_1.md").write_text("um", encoding="utf-8")
    (notes / "PETR4_3.md").write_text("tres", encoding="utf-8")

    assert make(tmp_path)["write_research_note"]("PETR4", "novo") == "PETR4_4.md"

    assert read(notes / "PETR4_1.md") == "um"
    assert read(notes / "PETR4_3.md") == "tres"
    assert read(notes / "PETR4_4.md") == "novo"
    assert sorted(p.name for p in notes.iterdir()) == ["PETR4_1.md", "PETR4_3.md", "PETR4_4.md"]


def test_other_assets_and_non_numeric_names_do_not_consume_numbers(tmp_path):
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "VALE3_7.md").write_text("outro ativo", encoding="utf-8")
    (notes / "PETR4_extra.md").write_text("nome sem numero", encoding="utf-8")

    assert make(tmp_path)["write_research_note"]("PETR4", "a") == "PETR4_1.md"
    assert read(notes / "VALE3_7.md") == "outro ativo"


def test_name_collision_retries_instead_of_overwriting(tmp_path, monkeypatch):
    # Simula a corrida: o número calculado já foi tomado por outra gravação.
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "PETR4_1.md").write_text("original", encoding="utf-8")
    monkeypatch.setattr(finance_tools, "_highest_note_number", lambda *_: 0)

    assert make(tmp_path)["write_research_note"]("PETR4", "novo") == "PETR4_2.md"
    assert read(notes / "PETR4_1.md") == "original"
    assert read(notes / "PETR4_2.md") == "novo"


def test_invalid_asset_is_refused_before_touching_disk(tmp_path):
    write = make(tmp_path)["write_research_note"]
    with pytest.raises(ValueError):
        write("../../etc/passwd", "x")
    assert not (tmp_path / "notes").exists()
