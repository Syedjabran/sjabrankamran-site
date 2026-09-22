import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crop_qbank import anchors, bbox_xml, question_span, question_span_reason
import poppler

RAW_MATH_PDF = Path(__file__).resolve().parents[1] / "raw" / "question-bank" / "questionbank-export-2026-9-22 math.pdf"
# Page 255 of the real Math export contains byte 0x9d, confirmed by
# bisecting pages 1-400 for the byte that crashes a strict cp1252 decode
# (see task-4-report.md). Any real page with non-ASCII text would do; this
# one is known to reproduce both the crash and the silent-mangling case.
_CRASH_PAGE = 255

BBOX = """<?xml version="1.0"?>
<html><body>
<page width="612" height="792">
<word xMin="70" yMin="100" xMax="140" yMax="112">Question</word>
<word xMin="142" yMin="100" xMax="160" yMax="112">ID:</word>
<word xMin="162" yMin="100" xMax="220" yMax="112">ac472881</word>
<word xMin="70" yMin="150" xMax="110" yMax="162">Hard</word>
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
