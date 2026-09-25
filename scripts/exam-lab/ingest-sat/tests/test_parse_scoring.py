import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import parse_scoring


def _w(text, left, right, top):
    return {"text": text, "left": left, "top": top, "right": right, "bottom": top + 8}


def _num(value, centre, top):
    """A number centred on `centre`, ~4.5pt per digit, as the guides print them."""
    half = 2.25 * len(str(value))
    return _w(str(value), centre - half, centre + half, top)


def _line(top, *words):
    """(text, left, right) triples -> words on one printed row."""
    return [_w(text, left, right, top) for text, left, right in words]


# The shape measured on page 5 of all 8 real scoring guides, with the real
# coordinates: one titled grid, a shared raw column per band, four data
# columns (R&W lower/upper, Math lower/upper) under printed section labels,
# raw 0-33 in the left band and 34-66 in the right, Math blank from 55.
def rw_bounds(raw):
    return (200 + 9 * raw, min(800, 220 + 9 * raw))


def math_bounds(raw):
    return (200 + 11 * raw, min(800, 206 + 11 * raw))


TITLE = _line(360.9, ("Raw", 46, 75), ("Score", 79, 116), ("Conversion", 120, 196),
              ("Table:", 199, 241), ("Section", 244, 294), ("Scores", 298, 343))


def _labels(first, second):
    """Section labels over each band's two LOWER/UPPER pairs, in the order given."""
    def phrase(section, left, right):
        centre = (left + right) / 2
        if section == "math":
            return [("Math", centre - 8.5, centre + 8.5)]
        return [("Reading", centre - 33.5, centre - 6.5), ("and", centre - 4.5, centre + 7.5),
                ("Writing", centre + 9.5, centre + 33.5)]
    words = []
    for band in (0, 267):
        words += phrase(first, 135 + band, 198 + band) + phrase(second, 224 + band, 287 + band)
    return _line(386.7, *words)


SUBHEADER = _line(394.7, ("RAW", 62, 79), ("SCORE", 80, 105), ("Section", 132, 158),
                  ("Score", 159, 179), ("Range", 180, 201), ("RAW", 329, 346),
                  ("SCORE", 347, 372), ("Section", 399, 424), ("Score", 426, 446))
HEADER = _line(409.3, ("(#", 48, 53), ("OF", 54, 62), ("CORRECT", 63, 89), ("ANSWERS)", 90, 119),
               ("LOWER", 135, 154), ("UPPER", 180, 198), ("LOWER", 224, 243), ("UPPER", 269, 287),
               ("(#", 315, 320), ("OF", 321, 329), ("CORRECT", 330, 356), ("ANSWERS)", 357, 386),
               ("LOWER", 402, 421), ("UPPER", 447, 465), ("LOWER", 491, 510), ("UPPER", 536, 554))
# Column centres under that header: raw, R&W lower, R&W upper, Math lower, Math upper.
BAND_1 = (83.5, 144.5, 189.0, 233.5, 278.0)
BAND_2 = (350.5, 411.5, 456.0, 500.5, 545.0)


def _rows(first_pair=rw_bounds, second_pair=math_bounds):
    words = []
    for raw in range(67):
        band, i = (BAND_1, raw) if raw <= 33 else (BAND_2, raw - 34)
        top = 418.7 + 9 * i
        words.append(_num(raw, band[0], top))
        for centre, value in zip(band[1:3], first_pair(raw)):
            words.append(_num(value, centre, top))
        if raw <= 54:  # the real grid prints Math blank from raw 55
            for centre, value in zip(band[3:5], second_pair(raw)):
                words.append(_num(value, centre, top))
    return words


# The fill-in worksheet printed above the title: its own LOWER/UPPER boxes
# and section names, and MODULE 1 / MODULE 2 digits that fall inside the raw
# column's x-range -- the noise that broke x-clustering on tests 4-6.
WORKSHEET = (
    _line(203.6, ("LOWER", 326, 344), ("UPPER", 356, 372))
    + _line(237.7, ("READING", 61, 87), ("AND", 89, 101), ("MATH", 238, 255))
    + _line(251.7, ("MODULE", 66, 91), ("1", 93, 96), ("MODULE", 155, 181), ("2", 182, 186))
    + _line(315.1, ("MODULE", 66, 91), ("1", 93, 96), ("MODULE", 155, 181), ("2", 182, 186))
)
FOOTER = _line(748.5, ("5", 563, 568), ("2023", 52, 69), ("College", 70, 95), ("Board.", 96, 117))

GRID = TITLE + _labels("rw", "math") + SUBHEADER + HEADER + _rows()
PAGE = WORKSHEET + GRID + FOOTER


def test_pairs_each_raw_score_with_its_own_lower_and_upper():
    """The failure this guards: the text stream is column-major, so reading
    it linearly pairs raw score 0 with raw score 1's lower bound and shifts
    the entire table by one row."""
    tables = parse_scoring.parse_tables({5: PAGE})
    assert tables["rw"][2] == rw_bounds(2)
    assert tables["rw"][3] == rw_bounds(3)
    assert tables["rw"][40] == rw_bounds(40)


def test_keeps_the_two_sections_apart():
    """Both sections share one raw column; each must read its own pair."""
    tables = parse_scoring.parse_tables({5: PAGE})
    assert tables["rw"][1] == rw_bounds(1)
    assert tables["math"][1] == math_bounds(1)
    assert tables["math"][45] == math_bounds(45)


def test_reads_both_bands_into_one_complete_curve_per_section():
    tables = parse_scoring.parse_tables({5: PAGE})
    assert tables["rw"] == {raw: rw_bounds(raw) for raw in range(67)}
    assert tables["math"] == {raw: math_bounds(raw) for raw in range(55)}
    assert parse_scoring.check_tables(tables) == []


def test_blank_math_cells_past_54_add_nothing():
    tables = parse_scoring.parse_tables({5: PAGE})
    assert 55 not in tables["math"]
    assert tables["rw"][55] == rw_bounds(55)


def test_the_worksheet_above_the_title_is_never_read():
    """Its MODULE digits sit in the raw column's x-range and its LOWER/UPPER
    boxes look like a header; neither may reach the table."""
    assert parse_scoring.parse_tables({5: PAGE}) == parse_scoring.parse_tables({5: GRID})


def test_sections_follow_their_printed_labels_not_their_position():
    """Swap the labels and the values under them: the section each pair
    belongs to must follow its label."""
    swapped = (TITLE + _labels("math", "rw") + SUBHEADER + HEADER
               + _rows(first_pair=math_bounds, second_pair=rw_bounds))
    tables = parse_scoring.parse_tables({5: swapped})
    assert tables["math"][1] == math_bounds(1)
    assert tables["rw"][1] == rw_bounds(1)


def test_a_page_that_only_mentions_the_table_contributes_nothing():
    """Page 3's instructions say "Use the Raw Score Conversion Table: Section
    Scores on page 5" -- a mention, not the title."""
    mention = _line(359.8, ("Use", 63, 79), ("the", 81, 94), ("Raw", 96, 113), ("Score", 115, 140),
                    ("Conversion", 142, 189), ("Table:", 191, 214), ("Section", 216, 248),
                    ("Scores", 250, 279), ("on", 281, 291), ("page", 293, 314), ("5", 316, 322))
    page_3 = mention + SUBHEADER + HEADER + _rows()
    assert parse_scoring.parse_tables({3: page_3}) == {"rw": {}, "math": {}}


def test_a_raw_score_read_twice_with_different_bounds_is_dropped_not_chosen():
    def rw_disagreeing_at_7(raw):
        lower, upper = rw_bounds(raw)
        return (lower + 10, upper + 10) if raw == 7 else (lower, upper)

    reprint = TITLE + _labels("rw", "math") + HEADER + _rows(first_pair=rw_disagreeing_at_7)
    tables = parse_scoring.parse_tables({5: PAGE, 6: reprint})
    assert 7 not in tables["rw"]
    assert tables["rw"][6] == rw_bounds(6) and tables["rw"][8] == rw_bounds(8)
    assert parse_scoring.check_tables(tables) == ["rw: expected raw scores 0-66, 1 missing ([7])"]


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


def test_check_rejects_an_upper_bound_that_falls_on_its_own():
    bad = {"rw": {0: (300, 330), 1: (300, 320)}, "math": {}}
    assert any("monotonic" in p for p in parse_scoring.check_tables(bad))


def test_check_rejects_missing_raw_scores():
    tables = parse_scoring.parse_tables({5: GRID})
    del tables["rw"][66]
    del tables["math"][0]
    problems = parse_scoring.check_tables(tables)
    assert any(p.startswith("rw:") and "missing" in p for p in problems)
    assert any(p.startswith("math:") and "missing" in p for p in problems)


def test_check_rejects_raw_scores_beyond_the_section_maximum():
    tables = parse_scoring.parse_tables({5: GRID})
    tables["math"][55] = (800, 800)
    assert any("beyond 0-54" in p for p in parse_scoring.check_tables(tables))


def test_check_rejects_a_section_that_is_absent():
    tables = parse_scoring.parse_tables({5: GRID})
    assert parse_scoring.check_tables({"rw": tables["rw"]}) == ["math: no conversion table found"]


def _with_drop_at(raw):
    """GRID's tables with R&W's lower bound falling by 10 into `raw` -- the
    shape test 6 really prints at raw 40 -> 41 (540, 580) -> (530, 590)."""
    tables = parse_scoring.parse_tables({5: GRID})
    tables["rw"][raw] = (tables["rw"][raw - 1][0] - 10, tables["rw"][raw][1])
    return tables


def _exception(tables, raw, test=6, **cells):
    """A reviewed entry for the break into `raw`, pinned by default to the
    cells `tables` really holds on both sides of it."""
    return {"test": test, "section": "rw", "raw": raw,
            "from": list(cells.get("from_", tables["rw"][raw - 1])),
            "printed": list(cells.get("printed", tables["rw"][raw])),
            "rule": "non-monotonic", "verified": "fixture"}


def test_a_listed_verified_break_is_tolerated():
    tables = _with_drop_at(41)
    assert parse_scoring.check_tables(tables) != []  # strict without the list
    listed = [_exception(tables, 41)]
    assert parse_scoring.check_tables(tables, test=6, exceptions=listed) == []


def test_the_same_break_at_an_unlisted_raw_score_fails():
    tables = _with_drop_at(30)
    listed = [_exception(tables, 41)]
    assert any("monotonic" in p for p in parse_scoring.check_tables(tables, test=6, exceptions=listed))


def test_a_listed_break_only_covers_its_own_test():
    tables = _with_drop_at(41)
    listed = [_exception(tables, 41, test=6)]
    assert any("monotonic" in p for p in parse_scoring.check_tables(tables, test=5, exceptions=listed))


def test_a_listed_entry_whose_printed_values_differ_from_the_parse_fails():
    """If a future parse reads other numbers at the listed cell, the
    verification no longer describes what was parsed and must not excuse it."""
    tables = _with_drop_at(41)
    lower, upper = tables["rw"][41]
    listed = [_exception(tables, 41, printed=(lower - 10, upper))]
    problems = parse_scoring.check_tables(tables, test=6, exceptions=listed)
    assert any("reviewed.json" in p and "raw 41" in p for p in problems)
    assert any("monotonic" in p for p in problems)


def test_a_listed_entry_whose_from_cell_differs_from_the_parse_fails():
    """Pinning only the cell after the break would still excuse a misread of
    the cell before it; both sides are pinned."""
    tables = _with_drop_at(41)
    lower, upper = tables["rw"][40]
    listed = [_exception(tables, 41, from_=(lower, upper - 10))]
    problems = parse_scoring.check_tables(tables, test=6, exceptions=listed)
    assert any("reviewed.json" in p and "raw 40" in p for p in problems)
    assert any("monotonic" in p for p in problems)


def test_reviewed_json_lists_test_6s_printed_break_and_nothing_else():
    assert parse_scoring.conversion_exceptions(6) == [{
        "test": 6, "section": "rw", "raw": 41, "from": [540, 580], "printed": [530, 590],
        "rule": "non-monotonic",
        "verified": "rendered page 5 of scoring-sat-practice-test-6-digital.pdf, 2026-09-25",
    }]
    assert all(parse_scoring.conversion_exceptions(n) == [] for n in (4, 5, 7, 8, 9, 10, 11))
