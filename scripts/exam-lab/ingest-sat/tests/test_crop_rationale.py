"""Tests for crop_rationale.py: locating an official rationale's region(s)
and turning them into one image.

The span tests use hand-written `-bbox` fixtures shaped like the real
exports (every record starts at the top of its own page; the rationale runs
from its `Rationale` label to the page bottom and, for 182 of the 3,770
records, onto one more page). The render tests use synthetic images for the pure
trimming/stitching logic, and one real two-page rationale sliced out of the
Math export for the end-to-end path.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import crop_rationale
import poppler
from crop_qbank import PAD, anchors, bbox_xml
from crop_rationale import (
    RationaleCropError, compose, id_index, ink_bounds, rationale_span,
    rationale_span_reason, render_rationale,
)

RAW_MATH_PDF = Path(__file__).resolve().parents[1] / "raw" / "question-bank" / "questionbank-export-2026-9-22 math.pdf"


def _page(words: list[tuple[float, float, float, float, str]], width: float = 612, height: float = 792) -> str:
    body = "\n".join(
        f'<word xMin="{x0}" yMin="{y0}" xMax="{x1}" yMax="{y1}">{t}</word>' for x0, y0, x1, y1, t in words
    )
    return f'<page width="{width}" height="{height}">\n{body}\n</page>'


def _doc(*pages: str) -> str:
    return '<?xml version="1.0"?>\n<html><body>\n' + "\n".join(pages) + "\n</body></html>\n"


def _header(qid: str, top: float = 26.6) -> list[tuple]:
    """A record's header block: `Question ID: <qid>`, the table's label row,
    its value row with the difficulty, then the body's `Question` label."""
    return [
        (18, top, 72, top + 8.7, "Question"), (75, top, 92, top + 8.7, "ID:"), (95, top, 157, top + 8.7, qid),
        (25, top + 27, 70, top + 33, "Assessment"), (100, top + 27, 120, top + 33, "Test"),
        (484, top + 60, 504, top + 66, "Hard"),
        (18, top + 105, 54, top + 111, "Question"),
        (18, top + 125, 60, top + 131, "What"),
    ]


def _answer_and_label(answer_top: float, label_top: float) -> list[tuple]:
    return [
        (18, answer_top, 48, answer_top + 5.8, "Correct"), (50, answer_top, 83, answer_top + 5.8, "Answer:"),
        (18, label_top, 56, label_top + 5.8, "Rationale"),
    ]


def _line(top: float, *texts: str) -> list[tuple]:
    out, x = [], 18.0
    for t in texts:
        out.append((x, top, x + 30, top + 5.8, t))
        x += 34
    return out


# The next record's header sits on the SAME page as this rationale. The real
# exports never do this (every record starts a fresh page), but the region
# must still end above that header, not at the page bottom.
SAME_PAGE = _doc(_page(
    _header("aaaaaaaa")
    + _answer_and_label(209.5, 238.8)
    + _line(253.0, "The", "correct", "answer")
    + _line(267.3, "is", "403.")
    + _header("bbbbbbbb", top=420.0)
    + _answer_and_label(600.0, 630.0)
    + _line(645.0, "Choice", "B")
))

# A rationale that starts near the bottom of page 1 and continues onto page
# 2; the next record opens page 3. Real shape of 182 records (87 Math, 95
# Reading and Writing): e.g. id 3f5a3602, Math pages 2-3.
CROSS_PAGE = _doc(
    _page(_header("aaaaaaaa") + _answer_and_label(670.0, 698.5) + _line(712.8, "Choice", "D") + _line(742.0, "Substituting")),
    _page(_line(23.5, "sides", "of", "this") + _line(121.8, "Choice", "A", "is", "incorrect")),
    _page(_header("bbbbbbbb") + _answer_and_label(209.5, 238.8) + _line(253.0, "Choice", "C")),
)

# The final record of an export: no next header anywhere.
LAST_RECORD = _doc(
    _page(_header("cccccccc") + _answer_and_label(209.5, 238.8) + _line(253.0, "The", "answer") + _line(340.8, "is", "7.")),
)


def test_same_page_rationale_is_one_region_ending_above_the_next_header():
    a = anchors(SAME_PAGE)
    regions = rationale_span(a, 0)
    assert regions is not None and len(regions) == 1
    (r,) = regions
    assert r["page"] == 1
    assert 244.6 < r["top"] < 253.0          # below the label, above the first rationale line
    assert r["bottom"] <= 420.0 - PAD        # clear of the next record's `Question ID:` row
    assert r["bottom"] >= 267.3 + 5.8        # the whole rationale is still inside


def test_cross_page_rationale_is_two_regions_and_never_reaches_the_next_record():
    a = anchors(CROSS_PAGE)
    regions = rationale_span(a, 0)
    assert regions is not None
    assert [r["page"] for r in regions] == [1, 2]
    first, second = regions
    assert 698.5 + 5.8 < first["top"] < 712.8
    assert first["bottom"] == 792.0          # runs to the page's bottom edge
    # The exports carry no running header (measured: continuation pages
    # open with rationale text at 14-24pt, and no header is drawn), so the
    # continuation region starts at the page's top edge -- above its first
    # line, never below it.
    assert second["top"] == 0.0
    assert second["top"] <= 23.5
    assert second["bottom"] == 792.0


def test_last_record_of_an_export_runs_to_the_page_bottom():
    a = anchors(LAST_RECORD)
    regions = rationale_span(a, 0)
    assert regions is not None and len(regions) == 1
    (r,) = regions
    assert r["page"] == 1
    assert 238.8 + 5.8 < r["top"] < 253.0
    # The text layer cannot see the math and figures College Board draws as
    # images, so a page's content bottom is found in the raster (see
    # `render_rationale`), not from the last word: the span hands it the
    # whole rest of the page.
    assert r["bottom"] == a["page_size"][1][1] == 792.0


def test_second_record_is_located_by_its_own_index():
    a = anchors(SAME_PAGE)
    (r,) = rationale_span(a, 1)
    assert (r["page"], r["bottom"]) == (1, 792.0)
    assert r["top"] == pytest.approx(630.0 + 5.8 + crop_rationale.LABEL_CLEARANCE)


def test_regions_carry_what_the_renderer_checks_its_cuts_against():
    """The first region names its label's box (the raster cut must sit in
    blank paper under the label's ink); a region ending above a header on
    its own page names that header's top (the paper down to it must be
    blank). A page-edge region needs neither."""
    (same,) = rationale_span(anchors(SAME_PAGE), 0)
    assert same["label"] == {"left": 18, "top": 238.8, "right": 56, "bottom": 238.8 + 5.8}
    assert same["next_header"] == 420.0
    first, second = rationale_span(anchors(CROSS_PAGE), 0)
    assert first["label"]["top"] == 698.5 and "next_header" not in first
    assert "label" not in second and "next_header" not in second


def test_label_on_a_later_page_than_the_question_id():
    """13 Math and 37 Reading and Writing records overflow before the
    rationale: the label sits on the page after the id."""
    doc = _doc(
        _page(_header("aaaaaaaa") + _line(500.0, "long", "question")),
        _page(_line(24.0, "D.", "choice") + _answer_and_label(90.0, 118.0) + _line(132.0, "Choice", "D")),
        _page(_header("bbbbbbbb")),
    )
    regions = rationale_span(anchors(doc), 0)
    assert [r["page"] for r in regions] == [2]
    assert 118.0 + 5.8 < regions[0]["top"] < 132.0


def test_region_includes_the_next_headers_page_only_above_that_header():
    """If a rationale's tail shares a page with the next header, that page
    contributes only the part above the header."""
    doc = _doc(
        _page(_header("aaaaaaaa") + _answer_and_label(670.0, 698.5) + _line(712.8, "Choice")),
        _page(_line(24.0, "tail", "text") + _header("bbbbbbbb", top=300.0)),
    )
    regions = rationale_span(anchors(doc), 0)
    assert [r["page"] for r in regions] == [1, 2]
    assert regions[1]["top"] == 0.0
    assert regions[1]["bottom"] == pytest.approx(300.0 - PAD)


def test_rationale_word_inside_a_table_row_is_not_the_label():
    """Id 5c24c861's rationale is a table whose header row reads "Correct
    Answer Rationale" / "Incorrect Answer Rationale". Only a `Rationale`
    alone on its row is the section label."""
    doc = _doc(_page(
        _header("aaaaaaaa") + _answer_and_label(480.0, 492.25)
        + [(20, 506.5, 60, 512.3, "Correct"), (62, 506.5, 80, 512.3, "Answer"), (82, 506.5, 120, 512.3, "Rationale")]
        + [(20, 561.3, 60, 567.1, "Incorrect"), (62, 561.3, 86, 567.1, "Answer"), (88, 561.3, 126, 567.1, "Rationale")]
    ))
    regions = rationale_span(anchors(doc), 0)
    assert regions is not None
    assert 492.25 + 5.8 < regions[0]["top"] < 506.5


def test_no_label_is_skipped_with_a_reason():
    doc = _doc(_page(_header("aaaaaaaa") + _line(209.5, "Correct", "Answer:")), _page(_header("bbbbbbbb")))
    a = anchors(doc)
    assert rationale_span(a, 0) is None
    assert rationale_span_reason(a, 0) == "no-rationale-label"


def test_two_standalone_labels_are_ambiguous_and_skipped():
    doc = _doc(_page(
        _header("aaaaaaaa") + _answer_and_label(209.5, 238.8) + _line(253.0, "text")
        + [(18, 400.0, 56, 405.8, "Rationale")]
    ))
    a = anchors(doc)
    assert rationale_span(a, 0) is None
    assert rationale_span_reason(a, 0) == "ambiguous-rationale-label"


def test_a_header_the_id_pattern_missed_is_never_swallowed_into_the_region():
    """If a record's id failed the 8-hex pattern, `anchors` would not see
    its header, and the page would look like a continuation page. The
    region must refuse it rather than include the next question."""
    doc = _doc(
        _page(_header("aaaaaaaa") + _answer_and_label(670.0, 698.5) + _line(712.8, "Choice")),
        _page(_header("NOT-HEX1")),
    )
    a = anchors(doc)
    assert rationale_span(a, 0) is None
    assert rationale_span_reason(a, 0) == "foreign-header-in-region"


def test_a_runaway_span_is_skipped():
    pages = [_page(_header("aaaaaaaa") + _answer_and_label(670.0, 698.5) + _line(712.8, "Choice"))]
    pages += [_page(_line(24.0, "more")) for _ in range(crop_rationale.MAX_PAGES)]
    a = anchors(_doc(*pages))
    assert rationale_span(a, 0) is None
    assert rationale_span_reason(a, 0) == "rationale-too-long"


def test_reason_is_none_when_the_span_succeeds():
    assert rationale_span_reason(anchors(SAME_PAGE), 0) is None


def test_id_index_finds_a_record_by_its_question_id():
    a = anchors(SAME_PAGE)
    assert id_index(a, "bbbbbbbb") == 1
    assert id_index(a, "deadbeef") is None


# --- raster trimming and stitching (synthetic images) ----------------------

def _white(h: int, w: int = 200) -> Image.Image:
    return Image.new("RGB", (w, h), "white")


def _with_bar(h: int, y0: int, y1: int, w: int = 200) -> Image.Image:
    img = _white(h, w)
    ImageDraw.Draw(img).rectangle((10, y0, 50, y1 - 1), fill="black")
    return img


def test_ink_bounds_finds_the_first_and_last_inked_rows():
    assert ink_bounds(_with_bar(100, 30, 60)) == (30, 60)
    assert ink_bounds(_white(100)) is None


def test_compose_trims_each_slice_to_its_ink_and_drops_blank_slices():
    """A page's blank remainder (and a wholly blank page -- 9 of the Math
    export's pages are) contributes nothing; the image ends at the last
    inked row plus the pad, which is the page's true content bottom."""
    out = compose([_with_bar(300, 100, 120), _white(300), _with_bar(300, 10, 40)], pad_px=5, gap_px=7)
    assert out is not None
    assert out.height == (20 + 2 * 5) + 7 + (30 + 2 * 5)


def test_compose_never_pads_outside_a_slice():
    """Padding is taken from inside the slice only: the first slice's top is
    the cut just below the `Rationale` label, and reaching above it would
    put the label back in the picture."""
    out = compose([_with_bar(100, 1, 99)], pad_px=10, gap_px=7)
    assert out.height == 100


def test_compose_of_nothing_but_blank_slices_is_none():
    assert compose([_white(100), _white(50)], pad_px=5, gap_px=7) is None


def test_render_refuses_a_cut_through_ink(tmp_path, monkeypatch):
    """A region edge that is not the page's own edge must pass through blank
    paper: if it slices a glyph, part of it would be missing (or part of the
    label/next header present). Such a rationale is skipped, never
    approximated."""
    page = _with_bar(1650, 400, 500, w=1275)
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: page})
    region = {"page": 1, "top": 450 * 72 / 150, "bottom": 792.0}
    with pytest.raises(RationaleCropError) as exc:
        render_rationale(Path("x.pdf"), [region], tmp_path / "r.jpg", {1: (612.0, 792.0)})
    assert exc.value.reason == "cut-through-ink"
    assert not (tmp_path / "r.jpg").exists()


# A 612x792pt page at 150 dpi, with a `Rationale` label whose box is
# 18-56pt x 192-198pt (37-117px x 400-413px) and whose ink fills rows
# 402-409, as a bold label without descenders does.
LABEL_BOX = {"left": 18.0, "top": 192.0, "right": 56.0, "bottom": 198.0}


def _labelled_page(*bars: tuple[int, int, int, int]) -> Image.Image:
    page = _white(1650, 1275)
    draw = ImageDraw.Draw(page)
    draw.rectangle((40, 402, 110, 409), fill="black")  # the label's ink
    for x0, y0, x1, y1 in bars:
        draw.rectangle((x0, y0, x1, y1 - 1), fill="black")
    return page


def _labelled_region() -> dict:
    return {"page": 1, "top": LABEL_BOX["bottom"] + crop_rationale.LABEL_CLEARANCE, "bottom": 792.0, "label": LABEL_BOX}


def test_render_moves_the_cut_up_when_first_line_math_rises_above_it(tmp_path, monkeypatch):
    """The real case of 37 Math rationales: a stacked fraction on the first
    line reaches above the text layer's planned cut (415px here). The cut
    moves up into the blank paper under the label's ink, so the fraction is
    whole and the label is still out of the picture."""
    page = _labelled_page((500, 412, 560, 460))
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: page})
    dest = tmp_path / "r.jpg"
    render_rationale(Path("x.pdf"), [_labelled_region()], dest, {1: (612.0, 792.0)})
    with Image.open(dest) as img:
        # Cut at 410 (first row under the label's ink): the math's 48 rows
        # start 2 rows in, plus the 12px pad below. Nothing of the label.
        assert img.height == (460 - 410) + 12


def test_render_refuses_math_that_overlaps_the_label_band(tmp_path, monkeypatch):
    """No blank row between the label's ink and the first line: any cut
    either shows the label or slices the math."""
    page = _labelled_page((500, 405, 560, 460))
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: page})
    with pytest.raises(RationaleCropError) as exc:
        render_rationale(Path("x.pdf"), [_labelled_region()], tmp_path / "r.jpg", {1: (612.0, 792.0)})
    assert exc.value.reason == "cut-through-ink"


def test_render_refuses_ink_between_the_bottom_cut_and_the_next_header(tmp_path, monkeypatch):
    """A header-bounded region ends PAD above the header; anything drawn in
    that strip would be silently cut away, so it must be blank."""
    region = {**_labelled_region(), "bottom": 300.0, "next_header": 306.0}
    ok = _labelled_page((40, 450, 400, 470))
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: ok})
    render_rationale(Path("x.pdf"), [region], tmp_path / "ok.jpg", {1: (612.0, 792.0)})

    leaky = _labelled_page((40, 450, 400, 470), (40, 628, 400, 634))
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: leaky})
    with pytest.raises(RationaleCropError) as exc:
        render_rationale(Path("x.pdf"), [region], tmp_path / "bad.jpg", {1: (612.0, 792.0)})
    assert exc.value.reason == "cut-through-ink"


def test_render_refuses_an_all_blank_region(tmp_path, monkeypatch):
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: _white(1650, 1275)})
    with pytest.raises(RationaleCropError) as exc:
        render_rationale(Path("x.pdf"), [{"page": 1, "top": 100.0, "bottom": 792.0}], tmp_path / "r.jpg", {1: (612.0, 792.0)})
    assert exc.value.reason == "empty-rationale-region"


def test_render_checks_the_raster_height_against_the_page_size(tmp_path, monkeypatch):
    """Same guard as crop_qbank.render_span: a raster that isn't the size
    the page's points predict means the mapping is wrong -- fail loudly
    (not a skip: it would affect every crop)."""
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: _white(1000, 1275)})
    with pytest.raises(RuntimeError, match="rendered page height"):
        render_rationale(Path("x.pdf"), [{"page": 1, "top": 100.0, "bottom": 792.0}], tmp_path / "r.jpg", {1: (612.0, 792.0)})


def test_render_pages_survives_a_temp_file_another_process_holds_open(monkeypatch):
    """On Windows an antivirus scan can hold a freshly written page raster
    open while the temporary directory is removed (seen during the Task 11
    corpus scan: WinError 32 on `page-0040.pgm`). That must not abort a
    3,700-record run over a leftover temp file; the pages are already in
    memory by then."""
    held = []

    def fake_pdftoppm(cmd, **kwargs):
        out = Path(cmd[-1]).with_name("page-1.ppm")
        Image.new("RGB", (4, 4), "white").save(out, "PPM")
        held.append(open(out, "rb"))  # the scanner's handle
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(crop_rationale.poppler, "tool", lambda name: name)
    monkeypatch.setattr(crop_rationale.subprocess, "run", fake_pdftoppm)
    try:
        pages = crop_rationale._render_pages(Path("x.pdf"), 1, 1, 150)
        assert list(pages) == [1] and pages[1].size == (4, 4)
    finally:
        for handle in held:
            handle.close()
            shutil.rmtree(Path(handle.name).parent, ignore_errors=True)


def test_render_writes_atomically(tmp_path, monkeypatch):
    monkeypatch.setattr(crop_rationale, "_render_pages", lambda pdf, first, last, dpi: {1: _with_bar(1650, 400, 500, w=1275)})

    def partial_then_fail(self, fp, *args, **kwargs):
        Path(fp).write_bytes(b"PARTIAL")
        raise OSError("disk full (simulated)")

    monkeypatch.setattr(Image.Image, "save", partial_then_fail)
    dest = tmp_path / "out" / "r.jpg"
    with pytest.raises(OSError, match="disk full"):
        render_rationale(Path("x.pdf"), [{"page": 1, "top": 100.0, "bottom": 792.0}], dest, {1: (612.0, 792.0)})
    assert not dest.exists()
    assert list(dest.parent.glob("*.tmp-*")) == []


# --- end to end against a real cross-page rationale ------------------------

def test_render_stitches_a_real_two_page_rationale(tmp_path):
    """Id 3f5a3602 (Math pages 2-3): its rationale starts at the foot of
    page 2 and ends on page 3; page 4 is the next record. Sliced out with
    pdfseparate/pdfunite so bbox_xml stays fast."""
    if not RAW_MATH_PDF.exists():
        pytest.skip("raw question-bank PDFs not present on this checkout")
    exe = ".exe" if os.name == "nt" else ""
    sep, unite = (str(poppler.POPPLER_BIN / f"{n}{exe}") for n in ("pdfseparate", "pdfunite"))
    subprocess.run([sep, "-f", "2", "-l", "4", str(RAW_MATH_PDF), str(tmp_path / "p%d.pdf")], check=True)
    sliced = tmp_path / "three.pdf"
    subprocess.run([unite, *(str(tmp_path / f"p{n}.pdf") for n in (2, 3, 4)), str(sliced)], check=True)

    a = anchors(bbox_xml(sliced))
    assert [x["qid"] for x in a["ids"]] == ["3f5a3602", "3d1070c9"]
    regions = rationale_span(a, 0)
    assert [r["page"] for r in regions] == [1, 2]

    dest = tmp_path / "out" / "3f5a3602-r.jpg"
    render_rationale(sliced, regions, dest, a["page_size"])
    with Image.open(dest) as img:
        assert img.width == 1275
        # The text runs 705-762pt on page 1 and 23-181pt on page 2 (~215pt
        # together): the image must hold both, with the blank remainder of
        # each page trimmed away.
        text_px = ((762.1 - 705.3) + (180.8 - 23.5)) * 150 / 72
        full = sum((r["bottom"] - r["top"]) * 150 / 72 for r in regions)
        assert text_px < img.height < full / 2
