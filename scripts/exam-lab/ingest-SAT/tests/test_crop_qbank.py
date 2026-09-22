import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crop_qbank import anchors, question_span

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
