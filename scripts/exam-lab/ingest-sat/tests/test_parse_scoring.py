import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import parse_scoring


def _w(text, left, top):
    return {"text": text, "left": left, "top": top, "right": left + 12, "bottom": top + 9}


def _grid(x0, rows):
    """One table: raw score, lower, upper -- three columns from x0."""
    out = []
    for i, (raw, lo, hi) in enumerate(rows):
        y = 100.0 + i * 12
        out += [_w(str(raw), x0, y), _w(str(lo), x0 + 60, y), _w(str(hi), x0 + 120, y)]
    return out


RW = [(0, 200, 200), (1, 200, 200), (2, 220, 230), (3, 250, 280)]
MATH = [(0, 200, 200), (1, 200, 210), (2, 230, 260), (3, 260, 300)]
PAGE = _grid(60.0, RW) + _grid(340.0, MATH)


def test_pairs_each_raw_score_with_its_own_lower_and_upper():
    """The failure this guards: the text stream is column-major, so reading
    it linearly pairs raw score 0 with raw score 1's lower bound and shifts
    the entire table by one row."""
    tables = parse_scoring.parse_tables({1: PAGE})
    assert tables["rw"][2] == (220, 230)
    assert tables["rw"][3] == (250, 280)


def test_keeps_the_two_side_by_side_tables_apart():
    tables = parse_scoring.parse_tables({1: PAGE})
    assert tables["rw"][1] == (200, 200)
    assert tables["math"][1] == (200, 210)


def test_check_rejects_a_lower_bound_above_its_upper():
    bad = {"rw": {0: (400, 300)}, "math": {}}
    assert any("lower" in p for p in parse_scoring.check_tables(bad))


def test_check_rejects_a_score_outside_the_published_200_800_range():
    bad = {"rw": {0: (100, 300)}, "math": {}}
    assert any("200-800" in p for p in parse_scoring.check_tables(bad))


def test_check_rejects_a_non_monotonic_curve():
    """More correct answers can never be worth a lower scaled score."""
    bad = {"rw": {0: (300, 320), 1: (280, 300)}, "math": {}}
    assert any("monotonic" in p for p in parse_scoring.check_tables(bad))
