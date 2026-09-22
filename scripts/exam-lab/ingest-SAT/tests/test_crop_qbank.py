import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crop_qbank import (
    anchors, bbox_xml, expected_render_height, question_span,
    question_span_reason, render_span, scale_box,
)
import crop_qbank
import poppler

RAW_MATH_PDF = Path(__file__).resolve().parents[1] / "raw" / "question-bank" / "questionbank-export-2026-9-22 math.pdf"
# Page 255 of the real Math export contains byte 0x9d, confirmed by
# bisecting pages 1-400 for the byte that crashes a strict cp1252 decode
# (see task-4-report.md). Any real page with non-ASCII text would do; this
# one is known to reproduce both the crash and the silent-mangling case.
_CRASH_PAGE = 255
# Real page carrying id 6d99b141 (Geometry and Trigonometry / Lines, angles,
# and triangles / Hard), confirmed by slicing it out with pdfseparate and
# running anchors()/question_span() against it during task-5 development:
# it resolves a real, single-page span (page=1 once sliced), so it doubles
# as a real-corpus fixture for render_span without paying the cost of
# running bbox_xml over the whole ~2030-page export.
_WRAPPED_DOMAIN_PAGE = 1215

BBOX = """<?xml version="1.0"?>
<html><body>
<page width="612" height="792">
<word xMin="70" yMin="100" xMax="140" yMax="112">Question</word>
<word xMin="142" yMin="100" xMax="160" yMax="112">ID:</word>
<word xMin="162" yMin="100" xMax="220" yMax="112">ac472881</word>
<word xMin="70" yMin="150" xMax="110" yMax="162">Hard</word>
<word xMin="70" yMin="180" xMax="140" yMax="192">Question</word>
<word xMin="70" yMin="200" xMax="120" yMax="212">What</word>
<word xMin="70" yMin="400" xMax="150" yMax="412">Correct</word>
<word xMin="152" yMin="400" xMax="210" yMax="412">Answer:</word>
<word xMin="70" yMin="500" xMax="140" yMax="512">Rationale</word>
</page>
</body></html>
"""

# Real pdftotext -bbox output for id 6d99b141 (math export, page 1215): a
# two-line domain ("Geometry and" / "Trigonometry") and a two-line skill
# ("Lines, angles, and" / "triangles") each wrap onto a second row, and
# both wrapped tails render at yMin=97/yMax=103 -- BELOW the difficulty
# token "Hard"'s own baseline (yMin=86/yMax=92). The header/body boundary
# label "Question" (distinct from "Question ID:") follows at yMin=131,
# a much larger gap (28pt) than the tight 5pt gap between the difficulty
# row and the wrapped-tail row.
BBOX_WRAPPED_DOMAIN = """<?xml version="1.0"?>
<html><body>
<page width="612" height="792">
<word xMin="18" yMin="26" xMax="72" yMax="35">Question</word>
<word xMin="75" yMin="26" xMax="92" yMax="35">ID:</word>
<word xMin="95" yMin="26" xMax="157" yMax="35">6d99b141</word>
<word xMin="254" yMin="86" xMax="293" yMax="92">Geometry</word>
<word xMin="296" yMin="86" xMax="311" yMax="92">and</word>
<word xMin="369" yMin="86" xMax="392" yMax="92">Lines,</word>
<word xMin="395" yMin="86" xMax="423" yMax="92">angles,</word>
<word xMin="425" yMin="86" xMax="440" yMax="92">and</word>
<word xMin="484" yMin="86" xMax="504" yMax="92">Hard</word>
<word xMin="254" yMin="97" xMax="308" yMax="103">Trigonometry</word>
<word xMin="369" yMin="97" xMax="404" yMax="103">triangles</word>
<word xMin="18" yMin="131" xMax="54" yMax="137">Question</word>
<word xMin="18" yMin="150" xMax="60" yMax="156">In</word>
<word xMin="18" yMin="400" xMax="48" yMax="406">Correct</word>
<word xMin="50" yMin="400" xMax="83" yMax="406">Answer:</word>
<word xMin="18" yMin="452" xMax="56" yMax="458">Rationale</word>
</page>
</body></html>
"""


# Real `pdftotext -bbox` output declares an XHTML namespace on the root
# element (`<html xmlns="http://www.w3.org/1999/xhtml">`), unlike the bare
# fixtures above. `ElementTree.iter("page")` silently matches nothing
# against a namespaced document -- every tag is actually
# `{http://www.w3.org/1999/xhtml}page` -- so this regression-tests that
# anchors() still finds content in the real output shape, not just in
# hand-written fixtures that happen to omit the namespace.
BBOX_NAMESPACED = """<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml">
<head>
</head>
<body>
<doc>
<page width="612.000000" height="792.000000">
<word xMin="18.000000" yMin="26.625077" xMax="72.369308" yMax="35.348656">Question</word>
<word xMin="75.709736" yMin="26.625077" xMax="92.220226" yMax="35.348656">ID:</word>
<word xMin="95.560507" yMin="26.625077" xMax="157.174196" yMax="35.348656">6d99b141</word>
<word xMin="484.734000" yMin="86.508401" xMax="504.069440" yMax="92.312695">Hard</word>
<word xMin="18.000000" yMin="131.008401" xMax="54.410445" yMax="137.812695">Question</word>
<word xMin="18.000000" yMin="385.008401" xMax="25.410445" yMax="390.812695">In</word>
<word xMin="18.000000" yMin="424.000051" xMax="48.026645" yMax="429.815771">Correct</word>
<word xMin="50.248421" yMin="424.000051" xMax="83.076627" yMax="429.815771">Answer:</word>
<word xMin="18.000000" yMin="452.500051" xMax="56.132988" yMax="458.315771">Rationale</word>
</page>
</doc>
</body>
</html>
"""


# id present, difficulty and the "Question" body-start row present, but no
# `Correct Answer:` or `Rationale` anchor anywhere on the page -- the real
# shape of a question whose end anchor lands on the *next* physical PDF
# page (verified against the real corpus: ~1.1% of sampled questions).
BBOX_CROSS_PAGE = """<?xml version="1.0"?>
<html><body>
<page width="612" height="792">
<word xMin="70" yMin="100" xMax="140" yMax="112">Question</word>
<word xMin="142" yMin="100" xMax="160" yMax="112">ID:</word>
<word xMin="162" yMin="100" xMax="220" yMax="112">ac472881</word>
<word xMin="70" yMin="150" xMax="110" yMax="162">Hard</word>
<word xMin="70" yMin="180" xMax="140" yMax="192">Question</word>
<word xMin="70" yMin="200" xMax="120" yMax="212">What</word>
</page>
</body></html>
"""

# id present but no difficulty token anywhere after it.
BBOX_NO_DIFFICULTY = """<?xml version="1.0"?>
<html><body>
<page width="612" height="792">
<word xMin="70" yMin="100" xMax="140" yMax="112">Question</word>
<word xMin="142" yMin="100" xMax="160" yMax="112">ID:</word>
<word xMin="162" yMin="100" xMax="220" yMax="112">ac472881</word>
<word xMin="70" yMin="200" xMax="120" yMax="212">What</word>
</page>
</body></html>
"""


# id and difficulty present, but no standalone "Question" body label -- the
# anchor that puts the crop below the header TABLE (and so below the vector
# difficulty glyph), as distinct from below the header's lowest text row.
BBOX_NO_QUESTION_LABEL = """<?xml version="1.0"?>
<html><body>
<page width="612" height="792">
<word xMin="70" yMin="100" xMax="140" yMax="112">Question</word>
<word xMin="142" yMin="100" xMax="160" yMax="112">ID:</word>
<word xMin="162" yMin="100" xMax="220" yMax="112">ac472881</word>
<word xMin="70" yMin="150" xMax="110" yMax="162">Hard</word>
<word xMin="70" yMin="200" xMax="120" yMax="212">What</word>
<word xMin="70" yMin="400" xMax="150" yMax="412">Correct</word>
<word xMin="152" yMin="400" xMax="210" yMax="412">Answer:</word>
</page>
</body></html>
"""


def test_bbox_xml_decodes_real_pdftotext_output_as_utf8_not_locale_codec(tmp_path):
    """Regression for a crash confirmed on this machine: `bbox_xml`'s
    subprocess.run had no explicit `encoding`, so `text=True` decoded with
    `locale.getpreferredencoding()` (cp1252 here) instead of UTF-8, which
    raises UnicodeDecodeError on real question-bank pages (byte 0x9d occurs
    on math export page 255) and would silently mangle other non-ASCII text
    (smart quotes etc.) even on pages that happen not to crash.

    Exercises the real `bbox_xml(pdf)` unmodified -- it takes no page-range
    argument -- against a single real page sliced out with `pdfseparate`
    into a standalone tiny PDF, so the test stays fast without touching
    `bbox_xml`'s signature or running it over the full ~159MB/2400-page
    export. Skipped if the gitignored raw corpus isn't present on this
    checkout.
    """
    if not RAW_MATH_PDF.exists():
        pytest.skip("raw question-bank PDFs not present on this checkout")

    pdfseparate = str(poppler.POPPLER_BIN / ("pdfseparate.exe" if os.name == "nt" else "pdfseparate"))
    sliced = tmp_path / "page.pdf"
    subprocess.run(
        [pdfseparate, "-f", str(_CRASH_PAGE), "-l", str(_CRASH_PAGE), str(RAW_MATH_PDF), str(sliced)],
        check=True,
    )

    xml_text = bbox_xml(sliced)
    assert "�" not in xml_text  # no replacement-character mangling
    ET.fromstring(xml_text)  # doesn't raise


def test_anchors_and_span_work_against_real_namespaced_bbox_output():
    a = anchors(BBOX_NAMESPACED)
    assert a["ids"][0]["qid"] == "6d99b141"
    span = question_span(a, "6d99b141")
    assert span is not None
    assert span["page"] == 1
    assert span["top"] >= 92.312695
    assert span["bottom"] <= 424.000051


def test_anchors_find_question_ids():
    a = anchors(BBOX)
    assert a["ids"][0]["qid"] == "ac472881"
    assert a["ids"][0]["page"] == 1


def test_span_starts_below_difficulty_and_ends_above_answer():
    a = anchors(BBOX)
    span = question_span(a, "ac472881")
    assert span["page"] == 1
    assert span["top"] >= 162      # below the "Hard" token
    assert span["bottom"] <= 400   # above "Correct Answer:"


def test_span_is_none_for_unknown_id():
    assert question_span(anchors(BBOX), "deadbeef") is None


def test_span_starts_below_wrapped_tail_not_just_below_difficulty():
    """Regression for the column-major header wrap: a wrapped domain/skill
    tail renders BELOW the difficulty token's baseline (yMax=92 here), not
    above it. Starting the crop right below difficulty alone (92 + PAD = 98)
    would land inside the wrapped tail's own row (yMin=97/yMax=103),
    leaking "Trigonometry"/"triangles" -- the wrapped remainder of the
    domain and skill -- into the cropped question image. The crop must
    start below the tail's bottom edge instead.
    """
    a = anchors(BBOX_WRAPPED_DOMAIN)
    span = question_span(a, "6d99b141")
    assert span is not None
    assert span["top"] >= 103              # below the wrapped tail's yMax
    assert not (97 <= span["top"] <= 103)  # not inside the wrapped tail's row
    assert span["bottom"] <= 400


def test_span_starts_below_the_header_table_not_just_its_lowest_text_row():
    """Regression for the difficulty-glyph leak.

    College Board draws the difficulty as a vector bar glyph in the header
    table's last cell. It has no text, so it has no word box, so no amount
    of reasoning over the text rows can see it -- and cropping at the
    header's lowest text row (`Hard`'s yMax=162, + PAD = 168) left its
    bottom sliver in 1,788 of the real corpus's 3,730 crops, where the
    number of filled bars reads the rating straight off the image.

    The body's "Question" label (yMin=180) is the first element BELOW the
    whole table, so anchoring there clears the glyph structurally. The crop
    must start below it, not merely below the difficulty row.
    """
    span = question_span(anchors(BBOX), "ac472881")
    assert span is not None
    assert span["top"] > 168, "crop started at the old text-row anchor, inside the glyph"
    assert span["top"] >= 180 - crop_qbank.PAD


def test_span_clears_the_measured_reach_of_the_textless_difficulty_glyph():
    """The glyph reached 10.32pt below the difficulty row's own bottom in
    the rendered corpus; GLYPH_DEPTH is the backstop for that, independent
    of where the "Question" label happens to sit.
    """
    a = anchors(BBOX)
    diff_bottom = min(d["bottom"] for d in a["diffs"])
    span = question_span(a, "ac472881")
    assert span["top"] >= diff_bottom + crop_qbank.GLYPH_DEPTH


def test_question_id_token_is_not_mistaken_for_the_body_question_label():
    """Both are the bare word "Question" in the word stream; only the
    following token tells them apart. Counting the header's own "Question
    ID:" as the body label would put the crop top back up inside the
    header -- and back over the glyph.
    """
    labels = anchors(BBOX)["questions"]
    assert [q["top"] for q in labels] == [180]


def test_span_reason_distinguishes_a_missing_question_label():
    a = anchors(BBOX_NO_QUESTION_LABEL)
    assert question_span(a, "ac472881") is None
    assert question_span_reason(a, "ac472881") == "no-question-label"


def test_span_reason_is_none_when_span_succeeds():
    assert question_span_reason(anchors(BBOX), "ac472881") is None


def test_span_reason_distinguishes_unknown_id():
    assert question_span_reason(anchors(BBOX), "deadbeef") == "unknown-id"


def test_span_reason_distinguishes_missing_difficulty_anchor():
    assert question_span_reason(anchors(BBOX_NO_DIFFICULTY), "ac472881") == "no-difficulty-anchor"


def test_span_reason_distinguishes_cross_page_from_other_failures():
    """The header (id + difficulty) is found, but there's no answer/
    rationale anchor on this page at all -- the real shape of a question
    whose end anchor lands on the next physical PDF page, not a malformed
    or unparseable block. `question_span` still safely returns None either
    way; `question_span_reason` is what lets a caller (Task 7's skipped
    report) count this ~1.1%-of-corpus case separately from genuine
    failures instead of lumping every None together.
    """
    a = anchors(BBOX_CROSS_PAGE)
    assert question_span(a, "ac472881") is None
    reason = question_span_reason(a, "ac472881")
    assert reason is not None
    assert reason.startswith("cross-page")


def test_scale_box_converts_points_to_pixels():
    # PDF points are 1/72 inch; at 150 dpi the factor is 150/72
    box = scale_box({"top": 72.0, "bottom": 144.0}, page_width_pt=612.0, dpi=150)
    assert box["top"] == 150
    assert box["bottom"] == 300
    assert box["width"] == 1275


def test_anchors_captures_each_page_true_size_in_points():
    """Task-5 concern: never hard-code the page size -- read it from
    `-bbox`'s own <page width=... height=...> element. Checked against both
    the bare fixture and the real namespaced-output shape, since a page's
    true size is what `render_span` needs to validate its pixel mapping.
    """
    assert anchors(BBOX)["page_size"][1] == (612.0, 792.0)
    assert anchors(BBOX_NAMESPACED)["page_size"][1] == (612.0, 792.0)


def test_expected_render_height_matches_known_letter_page_pixel_geometry():
    # 792pt / 72 * 150dpi = 1650px exactly for a US Letter page -- no
    # rounding slop to account for at this resolution.
    assert expected_render_height(792.0, dpi=150) == 1650


def test_render_span_raises_loudly_when_declared_page_height_is_wrong(tmp_path):
    """If a page were rotated, had a non-zero MediaBox origin, or a caller
    simply passed a stale page_height_pt, the point-to-pixel mapping in
    `scale_box` would be silently wrong. render_span must fail loudly
    instead of writing a subtly offset crop (task-5 brief concern 3).
    """
    if not RAW_MATH_PDF.exists():
        pytest.skip("raw question-bank PDFs not present on this checkout")
    span = {"page": 1, "top": 100.0, "bottom": 300.0}
    with pytest.raises(RuntimeError, match="rendered page height"):
        render_span(RAW_MATH_PDF, span, tmp_path / "bad.jpg", page_height_pt=400.0)


def test_render_span_raises_loudly_for_a_degenerate_span(tmp_path):
    """An inverted span (top > bottom) or a zero-height one (top == bottom)
    would otherwise reach PIL: `.crop()` raises `ValueError: Coordinate
    'lower' is less than 'upper'` for the inverted case, and `.save()`
    raises `cannot write empty image as JPEG` for the zero-height case.
    Both fail loud, which is good, but with a generic PIL message carrying
    no pdf/page/question-id context. Task 7 calls `render_span` 3,766
    times, so this needs to name exactly which pdf/page/span produced it
    instead -- mirroring the diagnostic style of the height assertion
    above. The check runs before the PDF is ever opened, so a nonexistent
    `pdf` path is fine here and doesn't need the raw-corpus skip guard.
    """
    pdf = Path("nonexistent.pdf")

    zero_height = {"page": 1, "top": 300.0, "bottom": 300.0}
    with pytest.raises(RuntimeError, match="degenerate span"):
        render_span(pdf, zero_height, tmp_path / "bad.jpg")

    inverted = {"page": 1, "top": 300.0, "bottom": 100.0}
    with pytest.raises(RuntimeError, match="degenerate span"):
        render_span(pdf, inverted, tmp_path / "bad2.jpg")


def test_render_span_writes_a_correctly_scaled_crop_from_a_real_page(tmp_path):
    """End-to-end against a real page (sliced out of the full Math export
    with pdfseparate, matching the pattern used for the UTF-8 crash
    regression above): render_span must produce a JPEG sized from the real
    span, not from guessed page geometry.
    """
    if not RAW_MATH_PDF.exists():
        pytest.skip("raw question-bank PDFs not present on this checkout")

    pdfseparate = str(poppler.POPPLER_BIN / ("pdfseparate.exe" if os.name == "nt" else "pdfseparate"))
    sliced = tmp_path / "page.pdf"
    subprocess.run(
        [pdfseparate, "-f", str(_WRAPPED_DOMAIN_PAGE), "-l", str(_WRAPPED_DOMAIN_PAGE),
         str(RAW_MATH_PDF), str(sliced)],
        check=True,
    )
    a = anchors(bbox_xml(sliced))
    span = question_span(a, "6d99b141")
    assert span is not None
    width_pt, height_pt = a["page_size"][span["page"]]

    dest = tmp_path / "out" / "6d99b141.jpg"
    from PIL import Image
    result = render_span(sliced, span, dest, dpi=150, page_width_pt=width_pt, page_height_pt=height_pt)

    assert result == dest
    assert dest.exists()
    img = Image.open(dest)
    assert img.width == round(width_pt * 150 / 72)
    expected_height = round((span["bottom"] - span["top"]) * 150 / 72)
    assert abs(img.height - expected_height) <= 1


def _write_partial_bytes_then_fail(fp, *args, **kwargs):
    """Fake `Image.save`: writes real (if garbage) bytes to whatever path
    it was actually called with, then raises.

    This is the part the earlier version of this test got wrong: a fake
    that raises *before* writing anything proves nothing about atomicity,
    because a non-atomic `crop.save(dest, ...)` that fails before writing a
    single byte would leave `dest` absent too -- the same observable
    result an atomic implementation gives, for an unrelated reason. Writing
    real bytes to `fp` first means this test distinguishes the two
    implementations by *where* the caller told `.save()` to write: an
    atomic `render_span` calls `.save()` with a temp path, so the partial
    bytes land there and get cleaned up, while a non-atomic one calls
    `.save()` with `dest` directly, so the partial bytes would land AT
    `dest` and still be sitting there when this raises.
    """
    Path(fp).write_bytes(b"PARTIAL-JPEG-BYTES-not-a-real-image")
    raise OSError("disk full (simulated) after a partial write")


def test_render_span_write_is_atomic_and_leaves_no_partial_file_on_failure(tmp_path):
    """A crop write killed mid-`.save()` (SIGKILL, power loss, an OOM-kill --
    all plausible across a many-minute cold run over the full 3,730-question
    corpus) must not leave a corrupt file sitting at `dest`. Task 7's
    resumability keys purely on `dest.exists()`, so a half-written file
    there would be silently treated as "already cropped" and, once live,
    uploaded as the real thing. render_span writes to a temp file in the
    same directory first and only `os.replace()`s it onto `dest` once the
    write is known-complete, so `dest` either doesn't exist at all or is
    the complete, correct file -- never a partial one.

    The fake `.save()` genuinely writes bytes to whichever path it's given
    before raising (see `_write_partial_bytes_then_fail`), so this proves
    atomicity rather than merely that the cleanup branch runs: verified by
    temporarily reverting `render_span` to `crop.save(dest, ...)` (no temp
    file) while developing this fix, which made this test fail with
    `dest.exists()` True and containing the partial bytes -- see
    task-7-report.md's fix-round-2 section for that reproduction.
    """
    if not RAW_MATH_PDF.exists():
        pytest.skip("raw question-bank PDFs not present on this checkout")

    pdfseparate = str(poppler.POPPLER_BIN / ("pdfseparate.exe" if os.name == "nt" else "pdfseparate"))
    sliced = tmp_path / "page.pdf"
    subprocess.run(
        [pdfseparate, "-f", str(_WRAPPED_DOMAIN_PAGE), "-l", str(_WRAPPED_DOMAIN_PAGE),
         str(RAW_MATH_PDF), str(sliced)],
        check=True,
    )
    a = anchors(bbox_xml(sliced))
    span = question_span(a, "6d99b141")
    width_pt, height_pt = a["page_size"][span["page"]]
    dest = tmp_path / "out" / "6d99b141.jpg"

    from PIL import Image
    with patch.object(Image.Image, "save", side_effect=_write_partial_bytes_then_fail):
        with pytest.raises(OSError, match="disk full"):
            render_span(sliced, span, dest, dpi=150, page_width_pt=width_pt, page_height_pt=height_pt)

    assert not dest.exists()
    leftovers = list(dest.parent.glob("*.tmp-*")) if dest.parent.exists() else []
    assert leftovers == []
