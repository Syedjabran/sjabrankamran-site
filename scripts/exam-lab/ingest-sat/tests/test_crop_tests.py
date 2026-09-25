import functools
import io
import itertools
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bbox
import crop_tests
import manifest
import poppler

PAGE_WIDTH, PAGE_BOTTOM = 612.0, 720.0


def _w(text, left, top, height=9.83, right=None):
    return {"text": text, "left": left, "top": top,
            "right": left + 10 if right is None else right, "bottom": top + height}


# Test 4 page 5, reduced to its structure.
TWO_COLUMN_PAGE = [
    _w("Module", 294.7, 29.2, 15.56), _w("1", 310.9, 41.2, 23.17),
    _w("." * 30, 312.6, 115.7, 604.67),          # the dotted gutter leader
    _w("3", 60.3, 117.5), _w("Handedness,", 71.8, 135.5), _w("a", 128.4, 135.5),
    _w("A)", 71.8, 200.0), _w("left", 90.0, 200.0),
    _w("4", 338.7, 117.5), _w("It", 350.2, 135.4), _w("is", 359.4, 135.4),
    _w("A)", 350.2, 200.0), _w("right", 368.0, 200.0),
]

# Test 11's shape: letter-spaced heading, no leader, doubled running header.
LETTER_SPACED_HEADER_PAGE = [
    _w("1", 40.0, 29.0), _w("1", 48.0, 29.0),
    _w("Module", 276.7, 29.0, 15.56), _w("1", 293.1, 41.9, 23.17),
    _w("Reading", 124.3, 113.3), _w("and", 216.7, 113.3), _w("Writing", 262.1, 113.3),
    _w("33", 123.7, 142.7),
    *[_w(ch, 150.0 + i * 9, 142.7) for i, ch in enumerate("QUESTIONS")],
    _w("DIRECTIONS", 126.0, 196.9),
]


def test_finds_two_columns_on_a_test_page():
    cols = crop_tests.columns(TWO_COLUMN_PAGE, PAGE_WIDTH)
    assert len(cols) == 2 and cols[0][0] < 100 < cols[1][0]


def test_module_start_is_found_despite_letter_spaced_headings():
    """Test 11 letter-spaces its headings, so the word QUESTIONS never
    appears in the word stream. Matching it literally finds zero modules in
    that entire test -- measured."""
    assert crop_tests.module_at(LETTER_SPACED_HEADER_PAGE) == ("rw", 1)


def test_a_content_page_is_not_a_module_start():
    """Misfiring here resets the question counter mid-module, which is what
    made the second attempted rule return 6 questions instead of 27."""
    assert crop_tests.module_at(TWO_COLUMN_PAGE) is None


def test_question_numbers_are_found_and_the_running_header_is_not():
    cols = crop_tests.columns(TWO_COLUMN_PAGE, PAGE_WIDTH)
    anchors = crop_tests.question_anchors(TWO_COLUMN_PAGE, cols)
    assert [(a["qnum"], a["col"]) for a in anchors] == [(3, 0), (4, 1)]


# The brief's two region tests, ported from the retired per-page `regions`
# to `span` over the same page: columns (55, 300) and (333, 580) on page 5.
# The assertions are the brief's; the slots now say what text each column
# holds, which is what lets `span` tell an overflow from an empty strip.

def test_a_question_ends_where_the_next_one_in_its_column_begins():
    slots = [_slot(5, 0, 55.0, 300.0, [(117.5, 127.3), (135.5, 145.3), (400.0, 409.8)],
                   bottom=PAGE_BOTTOM),
             _slot(5, 1, 333.0, 580.0, [(117.5, 127.3)], bottom=PAGE_BOTTOM)]
    anchors = [{"qnum": 3, "col": 0, "top": 117.5, "page": 5, "slot": 0},
               {"qnum": 5, "col": 0, "top": 400.0, "page": 5, "slot": 0}]
    regions = crop_tests.span(anchors, 0, slots)
    assert len(regions) == 1 and regions[0]["bottom"] < 400.0


def test_a_question_running_past_its_column_stitches_into_the_next_one():
    """Spec 10.4 drops the whole test if a question is missing, so an
    overflowing question must be stitched, never skipped."""
    slots = [_slot(5, 0, 55.0, 300.0, [(600.0, 609.8), (620.0, 700.0)], bottom=PAGE_BOTTOM),
             _slot(5, 1, 333.0, 580.0, [(120.0, 129.8), (200.0, 209.8), (300.0, 309.8)],
                   bottom=PAGE_BOTTOM)]
    anchors = [{"qnum": 3, "col": 0, "top": 600.0, "page": 5, "slot": 0},
               {"qnum": 4, "col": 1, "top": 300.0, "page": 5, "slot": 1}]
    regions = crop_tests.span(anchors, 0, slots)
    assert len(regions) == 2
    assert regions[0]["bottom"] == PAGE_BOTTOM
    assert regions[1]["left"] == 333.0 and regions[1]["bottom"] < 300.0


def test_there_is_no_per_page_regions():
    """A page on its own cannot know where its module's directions end,
    where its STOP line is, or that its last question carries on overleaf.
    The per-page form cropped half the directions into test 4's Q1, ran
    Q33 past the STOP line and left test 10 Math 1 Q4's four graph choices
    behind; `locate` + `span` is the only way in."""
    assert not hasattr(crop_tests, "regions")


# ---------------------------------------------------------------------------
# The derived rule, on real shapes. Coordinates below are copied from
# `pdftotext -bbox` output of the named page, reduced to the words that
# matter.

# Test 11 page 5: no dotted leader anywhere in test 11, so the column split
# has to come from the page's text. Its choice labels also differ by glyph
# ("A)" at 71.1, "C)" at 72.0), and its corner section digits are 59.5pt
# tall "words".
NO_LEADER_PAGE = [
    _w("1", 77.6, 17.0, 59.5, 104.2), _w("1", 525.6, 17.0, 59.5, 552.2),
    _w("Module", 294.8, 32.0, 14.9, 335.2), _w("1", 310.0, 44.0, 22.3, 320.0),
    _w("3", 60.4, 113.0, 14.2, 65.5), _w("5", 339.4, 113.0, 14.2, 344.5),
    _w("Although", 71.1, 130.0, 14.2, 111.9), _w("A", 350.1, 130.0, 14.2, 357.4),
    _w("country.", 257.6, 168.0, 14.2, 293.1),
    _w("A)", 71.1, 217.0, 14.2, 82.0), _w("B)", 71.7, 233.0, 14.2, 81.5),
    _w("C)", 72.0, 248.0, 14.2, 82.6), _w("D)", 71.8, 264.0, 14.2, 83.1),
    _w("A)", 350.1, 267.0, 14.2, 361.0), _w("B)", 350.7, 283.0, 14.2, 360.5),
    _w("C)", 351.0, 298.0, 14.2, 361.6), _w("D)", 350.8, 314.0, 14.2, 362.1),
    _w("4", 60.3, 305.0, 14.2, 65.3), _w("Scholars", 72.2, 322.0, 14.2, 107.8),
    _w("particularly", 517.5, 180.0, 14.2, 567.5),
    _w("3", 311.6, 744.0, 14.9, 318.2),             # page-number footer
]


def test_columns_are_split_without_a_leader():
    """Test 11 draws its gutter rule as a vector line the text layer cannot
    see; the split must still land between the columns."""
    cols = crop_tests.columns(NO_LEADER_PAGE, PAGE_WIDTH)
    assert len(cols) == 2
    assert cols[0][1] > 293.1                       # the left column's longest line
    assert cols[0][1] < 314.5 < cols[1][0]          # the rule, measured off the render
    assert cols[1][0] < 333.0                       # the right number box's edge


def test_numbers_are_found_without_a_leader_and_the_footer_is_not():
    cols = crop_tests.columns(NO_LEADER_PAGE, PAGE_WIDTH)
    anchors = crop_tests.question_anchors(NO_LEADER_PAGE, cols)
    assert [(a["qnum"], a["col"]) for a in anchors] == [(3, 0), (4, 0), (5, 1)]


# Test 4 page 34: a bar chart whose axis labels are isolated integers inside
# the left column (plus OCR noise off its rotated axis title), and a
# right-column stem that begins with a digit. Neither sits in the number's
# outdent, which in all 8 tests holds nothing but the 960 question numbers.
FIGURE_PAGE = [
    _w("Module", 276.7, 29.0, 16.3, 317.6), _w("1", 293.2, 41.0, 23.4, 301.6),
    _w("-", 34.9, 69.0, 94.0, 58.2),
    _w("." * 200, 293.9, 116.0, 604.7, 304.7),
    _w("1", 42.4, 118.0, 9.8, 47.4), _w("3", 320.8, 118.0, 9.8, 325.8),
    _w("50", 88.4, 134.0, 14.0, 97.9), _w("45", 88.3, 146.0, 14.0, 97.5),
    _w("0", 75.3, 199.0, 8.2, 78.6), _w("8", 75.2, 219.0, 13.4, 80.7),
    _w("5", 93.2, 241.0, 14.0, 98.4),
    _w("1", 119.2, 260.0, 14.0, 124.4), _w("2", 148.5, 260.0, 14.0, 153.7),
    _w("What", 332.3, 170.0, 9.8, 355.8),
    _w("A)", 332.3, 189.0, 9.8, 343.1), _w("6", 350.2, 189.0, 9.8, 355.3),
    _w("A", 53.9, 297.0, 9.8, 61.1), _w("group", 63.5, 297.0, 9.8, 88.7),
    _w("4", 320.8, 337.0, 9.8, 325.8),
    _w("A)", 53.9, 351.0, 9.8, 64.7), _w("25", 71.8, 351.0, 9.8, 81.9),
    _w("3", 332.3, 355.0, 9.8, 337.3), _w("more", 339.7, 355.0, 9.8, 361.9),
    _w("A)", 332.3, 388.0, 9.8, 343.1),
    _w("2", 42.4, 500.0, 9.8, 47.4), _w("What", 53.9, 518.0, 9.8, 77.4),
]


def test_figure_labels_and_a_stem_starting_with_a_digit_are_not_numbers():
    """Attempt 1 counted 97 questions in a 27-question module: equations,
    figure labels and stray numerals. Here the chart's axis labels are
    isolated integers too; only position relative to the body edge tells
    them apart."""
    cols = crop_tests.columns(FIGURE_PAGE, PAGE_WIDTH)
    anchors = crop_tests.question_anchors(FIGURE_PAGE, cols)
    assert [(a["qnum"], a["col"]) for a in anchors] == [(1, 0), (2, 0), (3, 1), (4, 1)]


# Test 7 page 8: OCR-style dashes laid over the grey question bar share the
# question number's row. They are not text and must not make the number
# look like part of a line.
BAR_NOISE_PAGE = [
    *[_w("-", x, 115.0, 21.6, x + 20) for x in (35.6, 54.9, 78.8, 102.6)],
    _w("~", 245.5, 115.0, 21.6, 279.1),
    _w("." * 200, 293.9, 116.0, 604.7, 304.7),
    _w("-", 314.0, 116.0, 17.5, 318.3),
    _w("11", 39.9, 117.0, 10.5, 49.9), _w("12", 318.2, 117.0, 10.5, 328.3),
    _w("The", 53.9, 135.0, 10.5, 70.4), _w("A)", 53.9, 300.0, 10.5, 64.7),
    _w("Percentage", 409.9, 133.0, 13.3, 453.8), _w("A)", 332.2, 300.0, 10.5, 343.0),
]


def test_ocr_noise_on_the_question_bar_does_not_hide_the_number():
    cols = crop_tests.columns(BAR_NOISE_PAGE, PAGE_WIDTH)
    anchors = crop_tests.question_anchors(BAR_NOISE_PAGE, cols)
    assert [(a["qnum"], a["col"]) for a in anchors] == [(11, 0), (12, 1)]


# Test 4 page 12: one question set full width (a table and its passage run
# straight across where the gutter would be).
FULL_WIDTH_PAGE = [
    _w("17", 39.9, 118.0, 9.8, 49.9),
    _w("Effects", 120.3, 135.0, 9.8, 148.4), _w("Species", 288.0, 135.0, 9.8, 318.4),
    _w("grown", 267.9, 175.0, 9.8, 294.9), _w("in", 297.3, 175.0, 9.8, 305.8),
    _w("soil", 308.2, 175.0, 9.8, 322.9),
    _w("Mycorrhizal", 53.8, 250.0, 9.8, 105.6),
    _w("A)", 53.8, 425.0, 9.8, 64.7), _w("B)", 53.8, 467.0, 9.8, 63.6),
]


def test_a_full_width_page_is_one_column():
    cols = crop_tests.columns(FULL_WIDTH_PAGE, PAGE_WIDTH)
    assert len(cols) == 1 and cols[0][0] < 39.9 and cols[0][1] > 540
    anchors = crop_tests.question_anchors(FULL_WIDTH_PAGE, cols)
    assert [(a["qnum"], a["col"]) for a in anchors] == [(17, 0)]


# Test 10 page 37: the four graph choices of a question whose stem is on the
# page before, set two by two. No text crosses the gutter and there is no
# leader, but "B)" sits at neither column's edge, so this is one column --
# two would stack the choices A, C, B, D.
GRAPH_CHOICES_PAGE = [
    _w("A)", 71.8, 150.0, 9.8, 82.6), _w("B)", 289.4, 150.0, 9.8, 299.2),
    _w("y", 120.0, 150.0, 9.8, 125.0), _w("y", 340.0, 150.0, 9.8, 345.0),
    _w("C)", 71.8, 420.0, 9.8, 82.4), _w("D)", 289.4, 420.0, 9.8, 300.1),
]


def test_graph_choices_set_two_by_two_are_one_column():
    assert len(crop_tests.columns(GRAPH_CHOICES_PAGE, PAGE_WIDTH)) == 1


# A Reading and Writing title page carries questions 1 and 2 below its
# directions (test 4 page 4); skipping title pages loses both.
TITLE_PAGE_WITH_QUESTIONS = [
    _w("Module", 276.7, 29.0, 16.3, 317.6), _w("1", 293.1, 42.0, 23.2, 302.1),
    _w("Reading", 124.3, 113.0, 30.9, 210.1), _w("and", 216.7, 113.0, 30.9, 256.1),
    _w("Writing", 262.1, 113.0, 30.9, 340.2),
    _w("33", 123.7, 143.0, 18.0, 139.1), _w("QUESTIONS", 145.8, 143.0, 18.0, 232.2),
    _w("DIRECTIONS", 126.0, 197.0, 9.4, 176.8),
    _w("The", 123.1, 211.0, 12.1, 138.5), _w("Each", 484.1, 211.0, 12.1, 503.0),
    _w("question", 123.5, 224.0, 12.1, 159.1), _w("passage", 486.6, 224.0, 12.1, 519.5),
    _w("and", 123.5, 237.0, 12.1, 138.4), _w("passage(s).", 473.8, 237.0, 12.1, 517.1),
    _w("All", 123.6, 253.0, 12.1, 133.4), _w("a", 506.5, 253.0, 12.1, 511.5),
    _w("single", 123.5, 266.0, 12.1, 147.7),
    _w("." * 200, 294.6, 325.0, 395.1, 301.9),
    _w("2", 320.7, 326.0, 9.8, 325.8), _w("1", 42.4, 327.0, 9.8, 47.4),
    _w("The", 53.9, 344.0, 9.8, 70.4), _w("Research", 332.2, 344.0, 9.8, 370.0),
    _w("A)", 53.9, 470.0, 9.8, 64.7), _w("A)", 332.2, 470.0, 9.8, 343.1),
]


def test_a_title_page_yields_its_module_and_the_questions_below_its_directions():
    assert crop_tests.module_at(TITLE_PAGE_WITH_QUESTIONS) == ("rw", 1)
    cols = crop_tests.columns(TITLE_PAGE_WITH_QUESTIONS, PAGE_WIDTH)
    anchors = crop_tests.question_anchors(TITLE_PAGE_WITH_QUESTIONS, cols)
    assert [(a["qnum"], a["col"]) for a in anchors] == [(1, 0), (2, 1)]


MATH_TITLE_PAGE = [
    _w("2", 58.5, 17.0, 59.5, 85.1), _w("2", 506.5, 17.0, 59.5, 533.1),
    _w("Module", 276.8, 32.0, 14.9, 317.2), _w("2", 292.0, 44.0, 22.3, 302.0),
    _w("Math", 126.0, 118.0, 29.7, 182.0),
    _w("27", 126.0, 148.0, 17.3, 142.6),
    *[_w(ch, 148.2 + i * 11, 148.0, 17.3, 156.2 + i * 11) for i, ch in enumerate("QUESTIONS")],
    _w("DIR", 130.1, 199.0, 10.0, 144.7), _w("EC", 145.5, 199.0, 10.0, 155.5),
    _w("TIONS", 156.3, 199.0, 10.0, 182.4),
]

GENERAL_DIRECTIONS_PAGE = [
    _w("The", 60.0, 60.0, 20.0, 90.0), _w("SAT", 95.0, 60.0, 20.0, 130.0),
    _w("GENERAL", 60.0, 110.0, 10.0, 110.0), _w("DIRECTIONS", 113.0, 110.0, 10.0, 170.0),
    _w("Reading", 70.0, 250.0, 10.0, 105.0), _w("and", 108.0, 250.0, 10.0, 125.0),
    _w("Writing,", 128.0, 250.0, 10.0, 165.0), _w("Module", 168.0, 250.0, 10.0, 200.0),
    _w("1:", 203.0, 250.0, 10.0, 210.0), _w("39", 213.0, 250.0, 10.0, 223.0),
    _w("minutes", 226.0, 250.0, 10.0, 260.0),
]


def test_a_math_title_page_is_found_by_its_heading_and_module_digit():
    assert crop_tests.module_at(MATH_TITLE_PAGE) == ("math", 2)


def test_the_general_directions_page_is_not_a_module_start():
    """Test 11 ends with a GENERAL DIRECTIONS page that names every module
    and its timing; it must not open a fifth module."""
    assert crop_tests.module_at(GENERAL_DIRECTIONS_PAGE) is None


STOP_PAGE = [
    _w("Module", 276.7, 29.0, 16.3, 317.6), _w("2", 293.1, 42.0, 23.2, 302.1),
    _w("." * 200, 312.6, 116.0, 480.0, 319.9),
    _w("26", 57.8, 118.0, 9.8, 67.9), _w("In", 71.8, 135.0, 9.8, 80.0),
    _w("A)", 71.8, 200.0, 9.8, 82.6), _w("A)", 350.2, 200.0, 9.8, 361.0),
    _w("27", 336.2, 118.0, 9.8, 346.3), _w("Function", 350.2, 135.0, 9.8, 390.0),
    _w("STOP", 286.1, 642.0, 21.3, 342.5),
    _w("If", 68.3, 672.0, 12.4, 77.0), _w("only.", 500.0, 672.0, 12.4, 540.0),
]


def test_the_stop_line_bounds_the_last_page_of_a_module():
    top, bottom = crop_tests.zone(STOP_PAGE)
    assert bottom < 642.0
    assert crop_tests.zone(TWO_COLUMN_PAGE)[1] == 792.0 - crop_tests.FOOTER_TRIM


def _book(*pages):
    return {i + 1: p for i, p in enumerate(pages)}


def test_modules_run_from_title_page_to_stop_and_must_match_the_structure():
    structure = [{"section": "math", "module": 2, "questions": 27}]
    book = _book([], MATH_TITLE_PAGE, TWO_COLUMN_PAGE, STOP_PAGE, GENERAL_DIRECTIONS_PAGE)
    mods = crop_tests.modules(book, structure)
    assert [(m["section"], m["module"], m["count"], m["pages"]) for m in mods] == \
        [("math", 2, 27, [2, 3, 4])]
    with pytest.raises(ValueError):
        crop_tests.modules(book, [{"section": "math", "module": 2, "questions": 22}])
    with pytest.raises(ValueError):
        crop_tests.modules(_book(MATH_TITLE_PAGE, TWO_COLUMN_PAGE), structure)


def test_check_accepts_only_one_through_k_in_reading_order():
    good = [{"section": "rw", "module": 1, "count": 3,
             "anchors": [{"qnum": n} for n in (1, 2, 3)]}]
    assert crop_tests.check(good) == []
    for bad in ((1, 3, 2), (1, 2), (1, 2, 3, 3), (1, 2, 2, 3)):
        mod = {**good[0], "anchors": [{"qnum": n} for n in bad]}
        assert crop_tests.check([mod])


def _slot(page, col, left, right, text, top=95.0, bottom=737.0):
    return {"page": page, "col": col, "left": left, "right": right,
            "top": top, "bottom": bottom, "text": text}


def test_a_question_continues_onto_the_next_page():
    """Test 10 Math Module 1 question 4: stem on one page, its four graph
    choices on the next, question 5 on the page after that."""
    slots = [_slot(36, 0, 28.0, 568.0, [(118.0, 128.0), (200.0, 212.0)]),
             _slot(37, 0, 46.0, 586.0, [(150.0, 160.0), (600.0, 610.0)]),
             _slot(38, 0, 28.0, 290.0, [(118.0, 128.0)])]
    anchors = [{"qnum": 4, "page": 36, "col": 0, "top": 117.5, "slot": 0},
               {"qnum": 5, "page": 38, "col": 0, "top": 117.5, "slot": 2}]
    got = crop_tests.span(anchors, 0, slots)
    assert [(r["page"], r["top"], r["bottom"]) for r in got] == \
        [(36, 111.5, 737.0), (37, 95.0, 737.0)]


def test_an_empty_strip_above_the_next_question_is_not_stitched():
    """A question that ends at the foot of the left column is followed by a
    number at the top of the right one; the 16pt of white above that number
    is not part of the question."""
    slots = [_slot(5, 0, 46.0, 308.0, [(117.5, 127.0), (600.0, 700.0)]),
             _slot(5, 1, 324.0, 586.0, [(117.5, 127.0), (135.0, 145.0)])]
    anchors = [{"qnum": 3, "page": 5, "col": 0, "top": 600.0, "slot": 0},
               {"qnum": 4, "page": 5, "col": 1, "top": 117.5, "slot": 1}]
    assert [r["left"] for r in crop_tests.span(anchors, 0, slots)] == [46.0]


def test_a_right_column_without_a_number_continues_the_left_ones_question():
    """Test 4 Reading and Writing Module 2 question 13: graph and passage in
    the left column, question and choices at the top of the right one, no
    new number on the page."""
    slots = [_slot(23, 0, 46.0, 308.0, [(118.0, 128.0), (400.0, 650.0)]),
             _slot(23, 1, 324.0, 586.0, [(115.0, 125.0), (300.0, 310.0)]),
             _slot(24, 0, 28.0, 290.0, [(118.0, 128.0)])]
    anchors = [{"qnum": 13, "page": 23, "col": 0, "top": 118.0, "slot": 0},
               {"qnum": 14, "page": 24, "col": 0, "top": 118.0, "slot": 2}]
    got = crop_tests.span(anchors, 0, slots)
    assert [(r["page"], r["left"]) for r in got] == [(23, 46.0), (23, 324.0)]


def test_the_last_question_runs_to_the_end_of_its_module():
    slots = [_slot(17, 0, 46.0, 308.0, [(118.0, 500.0)], bottom=636.0),
             _slot(17, 1, 324.0, 586.0, [(118.0, 560.0)], bottom=636.0)]
    anchors = [{"qnum": 32, "page": 17, "col": 0, "top": 118.0, "slot": 0},
               {"qnum": 33, "page": 17, "col": 1, "top": 118.0, "slot": 1}]
    got = crop_tests.span(anchors, 1, slots)
    assert [(r["left"], r["top"], r["bottom"]) for r in got] == [(324.0, 112.0, 636.0)]


def _poppler_available():
    try:
        poppler.tool("pdftoppm")
    except RuntimeError:
        return False
    return True


@pytest.mark.skipif(not _poppler_available(), reason="poppler not installed")
def test_render_stitches_slices_and_trims_only_white(tmp_path):
    """A region reaches the foot of its column because the text layer cannot
    see where a figure ends. Trimming must remove the white below it and
    nothing else."""
    page = Image.new("1", (612, 792), 1)            # bilevel: embedded losslessly
    page.paste(0, (100, 100, 200, 150))             # ink in the left region
    page.paste(0, (400, 300, 500, 320))             # ink in the right region
    pdf = tmp_path / "page.pdf"
    page.save(pdf, resolution=72.0)
    dest = tmp_path / "q.jpg"
    crop_tests.render_regions(pdf, [
        {"page": 1, "left": 50.0, "right": 300.0, "top": 90.0, "bottom": 700.0},
        {"page": 1, "left": 350.0, "right": 600.0, "top": 95.0, "bottom": 700.0},
    ], dest, dpi=72)
    out = Image.open(dest).convert("L")
    margin = int(crop_tests.TRIM_MARGIN)
    inked = (50 + 2 * margin) + (20 + 2 * margin)
    # 610 rows of region came down to the two strips of ink plus their
    # margins; poppler anti-aliases one extra row at a rectangle's edge.
    assert out.width == 250 and inked <= out.height <= inked + 4
    assert out.getpixel((100, margin + 25)) < 60        # left ink kept
    assert out.getpixel((100, 50 + 2 * margin + margin + 12)) < 60  # right ink kept
    assert not dest.with_name("q.jpg.tmp").exists()


@pytest.mark.skipif(not _poppler_available(), reason="poppler not installed")
def test_render_refuses_a_raster_that_does_not_match_the_page_size(tmp_path):
    """A rotated page or an offset MediaBox renders at a different height
    than the page size the regions were measured against; every crop from
    it would be shifted. Same rule as crop_qbank.render_span."""
    page = Image.new("1", (792, 612), 1)            # a landscape page
    page.paste(0, (100, 100, 200, 150))
    pdf = tmp_path / "landscape.pdf"
    page.save(pdf, resolution=72.0)
    dest = tmp_path / "q.jpg"
    region = {"page": 1, "left": 50.0, "right": 300.0, "top": 90.0, "bottom": 500.0}
    with pytest.raises(RuntimeError, match="rendered page height"):
        crop_tests.render_regions(pdf, [{**region, "page_height": 792.0}], dest, dpi=72)
    with pytest.raises(RuntimeError):
        crop_tests.render_regions(pdf, [region], dest, dpi=72)  # US Letter assumed
    assert not dest.exists() and not dest.with_name("q.jpg.tmp").exists()
    crop_tests.render_regions(pdf, [{**region, "page_height": 612.0}], dest, dpi=72)
    assert dest.exists()


def test_span_regions_carry_their_page_height():
    slots = [_slot(36, 0, 28.0, 568.0, [(118.0, 128.0)]),
             {**_slot(37, 0, 46.0, 586.0, [(150.0, 160.0)]), "page_height": 700.0}]
    anchors = [{"qnum": 4, "page": 36, "col": 0, "top": 117.5, "slot": 0}]
    assert [r["page_height"] for r in crop_tests.span(anchors, 0, slots)] == [792.0, 700.0]


_REAL = manifest.load()


def _real_tests():
    for entry in _REAL["practice_tests"]:
        path = manifest.bundle_paths(entry, _REAL)["test"]
        if path.exists():
            yield entry["test_no"], path


@functools.lru_cache(maxsize=None)
def _real_book(path):
    """(pages, sizes, located) for one real test PDF, read once per run."""
    xml = bbox.bbox_xml(path)
    pages, sizes = bbox.words_by_page(xml), bbox.page_sizes(xml)
    return pages, sizes, crop_tests.locate(pages, sizes, _REAL["module_structure"])


_NEEDS_REAL = pytest.mark.skipif(not list(_real_tests()) or not _poppler_available(),
                                 reason="practice-test PDFs or poppler not on this machine")


@pytest.mark.slow
@_NEEDS_REAL
@pytest.mark.parametrize("test_no,path", list(_real_tests()))
def test_every_real_test_reads_as_its_printed_structure(test_no, path):
    """Spec 10.4's gate on the real books: every module's numbers read
    exactly 1..K in reading order, found by page geometry alone."""
    _, _, located = _real_book(path)
    assert crop_tests.check(located) == []
    assert [(m["section"], m["module"], len(m["anchors"])) for m in located] == \
        [("rw", 1, 33), ("rw", 2, 33), ("math", 1, 27), ("math", 2, 27)]


# A rendered pixel darker than this is ink. 100 dpi keeps a test's run to
# seconds while a 1pt rule still covers a whole pixel row.
_PIXEL_DPI = 100
_PIXEL_INK = 200
# The dotted gutter rule is about 1pt wide; anything wider in the gutter is
# content that neither column's crop holds.
_RULE_WIDTH = 3.0


def _ink_masks(pdf, first, last, dpi):
    """{page: L-mode image, 255 where ink} for pages first..last."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([poppler.tool("pdftoppm"), "-gray", "-r", str(dpi),
                        "-f", str(first), "-l", str(last), str(pdf), f"{tmp}/p"],
                       check=True, capture_output=True)
        masks = {}
        for f in Path(tmp).glob("p-*.pgm"):
            # Decoded from bytes, not the path: PIL memory-maps a PGM opened
            # by name, and on Windows the live map blocks the temp dir's
            # cleanup.
            with Image.open(io.BytesIO(f.read_bytes())) as im:
                masks[int(f.stem.rsplit("-", 1)[1])] = im.point(
                    lambda v: 255 if v < _PIXEL_INK else 0)
        return masks


def _pixel_problems(pages, sizes, located, masks, dpi):
    """Everything wrong with the crops of one test, measured on the render.

    From each module's first question to its STOP page, every page is
    checked -- including a page with no text at all, which `locate` gives
    no slot, so image-only material a question should have carried is still
    caught as ink left outside every question."""
    scale = dpi / 72.0

    def box(left, top, right, bottom):
        # The same point-to-pixel mapping render_regions crops with.
        return int(left * scale), int(top * scale), int(right * scale), int(bottom * scale)

    problems = []
    for mod in located:
        name = f"{mod['section']} module {mod['module']}"
        anchors, slots = mod["anchors"], mod["slots"]
        placed = {}
        for i, a in enumerate(anchors):
            for r in crop_tests.span(anchors, i, slots):
                placed.setdefault(r["page"], []).append((a["qnum"], r))
        title_page = mod["pages"][0]
        for pno in (p for p in mod["pages"] if p >= anchors[0]["page"]):
            mask = masks[pno]
            rects = placed.get(pno, [])
            width, height = sizes[pno]
            for q, r in rects:
                x0, y0, x1, y1 = box(r["left"], r["top"], r["right"], r["bottom"])
                for edge, line in (("top", (x0, y0, x1, y0 + 1)),
                                   ("bottom", (x0, y1 - 1, x1, y1)),
                                   ("left", (x0, y0, x0 + 1, y1)),
                                   ("right", (x1 - 1, y0, x1, y1))):
                    if mask.crop(line).getbbox():
                        problems.append(f"{name} Q{q} p{pno}: ink on the crop's {edge} edge")
            for (qa, ra), (qb, rb) in itertools.combinations(rects, 2):
                if qa != qb and (min(ra["right"], rb["right"]) > max(ra["left"], rb["left"])
                                 and min(ra["bottom"], rb["bottom"]) > max(ra["top"], rb["top"])):
                    problems.append(f"{name} p{pno}: Q{qa} and Q{qb} overlap")

            top, bottom = crop_tests.zone(pages[pno], height)
            cols = crop_tests.columns(pages[pno], width, height)
            left_over = mask.copy()
            draw = ImageDraw.Draw(left_over)

            def blank(b):
                if b[2] > b[0] and b[3] > b[1]:
                    draw.rectangle((b[0], b[1], b[2] - 1, b[3] - 1), fill=0)

            blank(box(0, 0, width, top))
            blank(box(0, bottom, width, height))
            if pno == title_page == anchors[0]["page"]:
                # A Reading and Writing title page rules its directions off
                # from its questions: one thin line across nearly the whole
                # page, and the only ink between the two. Anything else
                # there makes the band taller than a rule and is reported.
                between = box(0, top, width, anchors[0]["top"] - crop_tests.PAD)
                rule = left_over.crop(between).getbbox()
                if (rule and rule[3] - rule[1] <= 2 * scale
                        and rule[2] - rule[0] >= 0.75 * width * scale):
                    blank(between)
            if len(cols) == 2:
                gutter = box(cols[0][1], top, cols[1][0], bottom)
                inked = left_over.crop(gutter).getbbox()
                if inked and inked[2] - inked[0] > _RULE_WIDTH * scale:
                    problems.append(f"{name} p{pno}: {inked[2] - inked[0]}px of ink across the "
                                    "gutter, wider than its dotted rule")
                blank(gutter)
            for _, r in rects:
                blank(box(r["left"], r["top"], r["right"], r["bottom"]))
            stray = left_over.getbbox()
            if stray:
                pt = tuple(round(v / scale) for v in stray)
                problems.append(f"{name} p{pno}: ink in the question zone outside every "
                                f"question, bounding box {pt}pt")
    return problems


@pytest.mark.slow
@_NEEDS_REAL
@pytest.mark.parametrize("test_no,path", list(_real_tests()))
def test_every_real_crop_is_clean_on_the_rendered_page(test_no, path):
    """The pixel-level proof behind the gate: on the render of every module
    page, no crop edge cuts through ink, no two questions share pixels,
    nothing sits in the gutter but its rule, and no ink in the question zone
    belongs to no question. A text-layer check cannot see a vector figure;
    this can (plan 1's difficulty-glyph lesson)."""
    pages, sizes, located = _real_book(path)
    assert crop_tests.check(located) == []
    first = min(m["anchors"][0]["page"] for m in located)
    last = max(m["pages"][-1] for m in located)
    masks = _ink_masks(path, first, last, _PIXEL_DPI)
    assert _pixel_problems(pages, sizes, located, masks, _PIXEL_DPI) == []


def _real_path(test_no):
    return dict(_real_tests()).get(test_no)


@pytest.mark.slow
@pytest.mark.skipif(_real_path(10) is None or not _poppler_available(),
                    reason="test 10's PDF or poppler not on this machine")
def test_the_pixel_check_sees_what_the_text_layer_cannot(monkeypatch):
    """The check above must not be vacuous. Test 10 Math 1 Q4 carries its
    four graph choices over onto page 37. Strip that page's words, as if the
    graphs were pure images: `locate` then gives the page no slot, Q4 stops
    at the foot of page 36, and only the render can say the graphs are
    stranded. Then narrow the columns: crops cut through text and the cut
    text lands in the gutter."""
    path = _real_path(10)
    pages, sizes, _ = _real_book(path)
    structure = _REAL["module_structure"]

    def math1(book):
        return [m for m in crop_tests.locate(book, sizes, structure)
                if (m["section"], m["module"]) == ("math", 1)]

    mod = math1(pages)[0]
    masks = _ink_masks(path, mod["anchors"][0]["page"], mod["pages"][-1], _PIXEL_DPI)
    assert _pixel_problems(pages, sizes, [mod], masks, _PIXEL_DPI) == []

    blind_pages = {**pages, 37: []}
    blind = math1(blind_pages)
    assert crop_tests.check(blind) == []
    stranded = _pixel_problems(blind_pages, sizes, blind, masks, _PIXEL_DPI)
    assert any(p.startswith("math module 1 p37: ink in the question zone") for p in stranded)

    monkeypatch.setattr(crop_tests, "COLUMN_REACH", 200.0)
    narrow = _pixel_problems(pages, sizes, math1(pages), masks, _PIXEL_DPI)
    assert any("ink on the crop's right edge" in p for p in narrow)
    assert any("across the gutter" in p for p in narrow)
