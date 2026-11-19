import pytest
from pydantic import ValidationError

from agents.dev.contracts import (MAX_CODE_CHARS, MAX_EXPLANATION_CHARS, MAX_LINES,
                                  DevProposal)
from agents.dev.static_check import MAX_CHARS as STATIC_MAX_CHARS
from agents.dev.static_check import MAX_LINES as STATIC_MAX_LINES
from agents.music.contracts import (MAX_MIDI_NOTES, MAX_SEMITONES, MIN_SEMITONES,
                                    MusicRequest)
from agents.music.theory import MAX_CHORD_NOTES
from agents.research.contracts import MAX_KEY_POINTS, MAX_SUMMARY_CHARS, ResearchSummary
from agents.sales.contracts import MAX_TARGET_MARGIN_PCT, SalesRequest
from pipelines.dev_pipeline import build_system
from pipelines.music_pipeline import SYSTEM as MUSIC_SYSTEM
from pipelines.research_pipeline import SYSTEM as RESEARCH_SYSTEM
from pipelines.sales_pipeline import SYSTEM as SALES_SYSTEM


def test_dev_prompt_uses_the_enforced_limits():
    prompt = build_system({"math"})
    assert f"no máximo {MAX_LINES} linhas" in prompt
    assert f"no máximo {MAX_CODE_CHARS} caracteres" in prompt
    assert f"até {MAX_EXPLANATION_CHARS} caracteres" in prompt
    assert STATIC_MAX_LINES == MAX_LINES
    assert STATIC_MAX_CHARS == MAX_CODE_CHARS


def test_dev_contract_boundaries_match_the_prompt():
    assert DevProposal(filename="a.py", code="x" * MAX_CODE_CHARS,
                       explanation="y" * MAX_EXPLANATION_CHARS)
    with pytest.raises(ValidationError):
        DevProposal(filename="a.py", code="x" * (MAX_CODE_CHARS + 1))


def test_research_prompt_and_contract_share_limits():
    assert f"no máximo {MAX_SUMMARY_CHARS} caracteres" in RESEARCH_SYSTEM
    assert f"até {MAX_KEY_POINTS} textos curtos" in RESEARCH_SYSTEM
    assert ResearchSummary(summary="x" * MAX_SUMMARY_CHARS, answers_question=True)
    with pytest.raises(ValidationError):
        ResearchSummary(summary="x" * (MAX_SUMMARY_CHARS + 1), answers_question=True)
    assert ResearchSummary(summary="x", key_points=["a"] * MAX_KEY_POINTS,
                           answers_question=True)
    with pytest.raises(ValidationError):
        ResearchSummary(summary="x", key_points=["a"] * (MAX_KEY_POINTS + 1),
                        answers_question=True)


def test_sales_prompt_says_that_95_is_exclusive():
    assert f"0 a menos de {MAX_TARGET_MARGIN_PCT}" in SALES_SYSTEM
    base = {"action": "price", "product": "Camiseta", "unit_cost": 10.0}
    assert SalesRequest(**base, target_margin_pct=MAX_TARGET_MARGIN_PCT - 0.01)
    with pytest.raises(ValidationError):
        SalesRequest(**base, target_margin_pct=MAX_TARGET_MARGIN_PCT)


def test_music_prompt_states_note_and_semitone_limits():
    assert f"no máximo {MAX_MIDI_NOTES} notas" in MUSIC_SYSTEM
    assert f"de {MIN_SEMITONES} a {MAX_SEMITONES}" in MUSIC_SYSTEM
    base = {"action": "transpose", "notes": [60]}
    assert MusicRequest(**base, semitones=MIN_SEMITONES)
    assert MusicRequest(**base, semitones=MAX_SEMITONES)
    with pytest.raises(ValidationError):
        MusicRequest(**base, semitones=MAX_SEMITONES + 1)
    with pytest.raises(ValidationError):
        MusicRequest(action="tab", notes=[60] * (MAX_MIDI_NOTES + 1))


def test_music_prompt_states_the_chord_semantics():
    assert "cada nota em uma corda distinta" in MUSIC_SYSTEM
    assert f"no máximo {MAX_CHORD_NOTES} notas" in MUSIC_SYSTEM
