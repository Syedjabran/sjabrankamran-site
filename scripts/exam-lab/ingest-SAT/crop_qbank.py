"""Locate the exact question region of a question-bank export for cropping.

The crop deliberately starts below the *entire* metadata header -- not just
the difficulty token -- so a student never sees College Board's difficulty
rating, domain, or skill on the question image, and ends above the answer
(or the rationale, when the answer line is absent) so the key is not in the
picture either.

The header is a flattened Domain/Skill/Difficulty table (see
parse_qbank.py's module docstring for the text-mode version of this same
problem). A long domain or skill name wraps onto a second line whose *text*
lands, in pdftotext's reading order, right after the difficulty token, but
whose *y position* on the page is still inside the header block -- tightly
spaced below the row it continues. Cropping below the difficulty token's
own yMax alone leaves that wrapped tail, and the difficulty rating sitting
next to it, inside the question image (confirmed against the real corpus:
id 6d99b141's "Trigonometry"/"triangles" tail renders at yMax=103.56, well
below "Hard"'s own yMax=92.31).

This module works entirely in `-bbox` coordinate space, so it sidesteps
that problem structurally rather than by pattern-matching text: it extends
the header downward through any row that continues tightly (observed
0.9-5.5pt in the real corpus, across both alternating- and
consecutive-line wraps) below the row before it, and stops at the first
looser gap (observed 20.7-27.9pt), which marks the section break into the
question body. Because this is purely geometric, it is also immune to the
word-stream reordering that can bleed stem text into the header in
*plain-text* mode (see parse_qbank.py's `SKILL_BLEED_FROM_STEM` fixture) --
a bled word still lands at its true body y-position in bbox space, so it
never gets merged into the header.
"""
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

import poppler

DIFFICULTY_WORDS = {"Easy", "Medium", "Hard"}
_HEX8 = re.compile(r"^[0-9a-f]{8}$")
PAD = 6.0
# A wrapped table row continues its predecessor closely (observed 0.9-5.5pt
# in the real corpus); the gap to the next section is much larger (observed
# 20.7-27.9pt). 15pt sits between the two with margin on both sides.
ROW_GAP = 15.0
# Words sharing a yMin within this tolerance are treated as the same visual
# row; real same-row words share it near-exactly.
ROW_EPSILON = 1.0


def bbox_xml(pdf: Path) -> str:
    # encoding="utf-8" is required, not optional: pdftotext -bbox emits
    # UTF-8, but subprocess.run(text=True) without an explicit encoding
    # decodes with locale.getpreferredencoding() -- cp1252 on this
    # machine -- which raises UnicodeDecodeError on real question-bank
    # pages (confirmed: byte 0x9d on math export page 255) and would
    # silently mangle other non-ASCII text (smart quotes etc.) even on
    # pages that happen not to crash.
    out = subprocess.run(
        [poppler.tool("pdftotext"), "-bbox", str(pdf), "-"],
        capture_output=True, encoding="utf-8", check=True,
    )
    return out.stdout


def _strip_namespace(root: ET.Element) -> ET.Element:
    """Drop the XHTML namespace pdftotext's real `-bbox` output declares
    (`<html xmlns="http://www.w3.org/1999/xhtml">`), so plain tag names
    like "page" and "word" match regardless of whether it's present.
    Without this, `root.iter("page")` silently finds nothing against real
    output, since every tag is actually `{http://www.w3.org/1999/xhtml}page`
    -- confirmed by running this against the real corpus, where it returned
    empty anchors for every page.
    """
    for el in root.iter():
        if "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def _words(page) -> list[dict]:
    return [
        {
            "text": (w.text or "").strip(),
            "top": float(w.get("yMin")),
            "bottom": float(w.get("yMax")),
        }
        for w in page.iter("word")
    ]


def anchors(xml_text: str) -> dict:
    """Extract question-id, difficulty, answer and rationale anchors per page.

    Also returns `page_size`: each page's true (width_pt, height_pt) as
    declared on `-bbox`'s own `<page width=... height=...>` element. Callers
    must read a page's real size from here rather than assume a constant
    (e.g. US Letter) -- see `render_span`, which needs the true height to
    validate its point-to-pixel mapping.
    """
    root = _strip_namespace(ET.fromstring(xml_text))
    ids, diffs, answers, rationales = [], [], [], []
    pages: dict[int, list[dict]] = {}
    page_size: dict[int, tuple[float, float]] = {}
    for pageno, page in enumerate(root.iter("page"), start=1):
        words = _words(page)
        pages[pageno] = words
        page_size[pageno] = (float(page.get("width")), float(page.get("height")))
        for i, w in enumerate(words):
            nxt = words[i + 1]["text"] if i + 1 < len(words) else None
            if w["text"] == "Question" and nxt == "ID:" and i + 2 < len(words):
                cand = words[i + 2]["text"]
                if _HEX8.match(cand):
                    ids.append({"qid": cand, "page": pageno, "top": w["top"], "bottom": w["bottom"]})
            if w["text"] in DIFFICULTY_WORDS:
                diffs.append({"page": pageno, "top": w["top"], "bottom": w["bottom"]})
            if w["text"] == "Correct" and nxt == "Answer:":
                answers.append({"page": pageno, "top": w["top"]})
            if w["text"] == "Rationale":
                rationales.append({"page": pageno, "top": w["top"]})
    return {
        "ids": ids, "diffs": diffs, "answers": answers, "rationales": rationales,
        "pages": pages, "page_size": page_size,
    }


def _rows(words: list[dict]) -> list[dict]:
    """Group words into visual rows by shared yMin, sorted top to bottom."""
    ordered = sorted(words, key=lambda w: w["top"])
    rows: list[dict] = []
    for w in ordered:
        if rows and w["top"] - rows[-1]["top"] <= ROW_EPSILON:
            rows[-1]["bottom"] = max(rows[-1]["bottom"], w["bottom"])
        else:
            rows.append({"top": w["top"], "bottom": w["bottom"]})
    return rows


def _header_bottom(words: list[dict], start_bottom: float) -> float:
    """The header's true bottom edge: the difficulty row's own bottom,
    extended through any row that continues tightly below it (a wrapped
    domain/skill tail), stopping at the first row that doesn't -- the
    section break into the question body.
    """
    bottom = start_bottom
    for row in _rows(words):
        if row["top"] <= bottom:
            continue  # already covered by the difficulty row itself
        if row["top"] - bottom > ROW_GAP:
            break
        bottom = max(bottom, row["bottom"])
    return bottom


def _locate(a: dict, qid: str) -> tuple[dict | None, str | None]:
    """Shared by `question_span` and `question_span_reason`: (span, None) on
    success, or (None, reason) when it can't be determined -- distinguishing
    *why*, since one of those reasons (cross-page) is a measured ~1.1% of
    the real corpus, not a hypothetical edge case.
    """
    entry = next((x for x in a["ids"] if x["qid"] == qid), None)
    if entry is None:
        return None, "unknown-id"
    page = entry["page"]

    after = [d["bottom"] for d in a["diffs"] if d["page"] == page and d["bottom"] > entry["bottom"]]
    if not after:
        # No difficulty token found below this id: there's nothing to anchor
        # the header's end on, so cropping would risk leaking the header
        # (or worse, guessing) rather than failing safely.
        return None, "no-difficulty-anchor"
    diff_bottom = min(after)

    header_bottom = _header_bottom(a["pages"][page], diff_bottom)
    top = header_bottom + PAD

    ends = [x["top"] for x in a["answers"] + a["rationales"] if x["page"] == page and x["top"] > top]
    if not ends:
        # The header was found on this page but no answer/rationale anchor
        # was: verified against the real corpus, this means the question
        # spans two physical PDF pages and the end anchor is on the next
        # one, not that the page is malformed. Cross-page stitching is a
        # follow-up (see Task 7); this just needs to be reported separately
        # from a genuine parse failure, not silently lumped in with one.
        return None, "cross-page: answer/rationale anchor not found on the id's page"
    return {"page": page, "top": top, "bottom": min(ends) - PAD}, None


def question_span(a: dict, qid: str) -> dict | None:
    """Region between the header's true bottom edge and the answer, for one
    question, or None if it can't be determined. Call `question_span_reason`
    to distinguish why.
    """
    return _locate(a, qid)[0]


def question_span_reason(a: dict, qid: str) -> str | None:
    """Why `question_span` returned None for this id, or None if it would
    succeed. In particular distinguishes the measured cross-page case (the
    answer/rationale anchor lands on the next PDF page) from an unknown id
    or a missing difficulty anchor, so a caller can report it separately.
    """
    return _locate(a, qid)[1]


def scale_box(span: dict, page_width_pt: float, dpi: int = 150) -> dict:
    """Convert a span's point-space top/bottom (and the page's point-space
    width) into pixel-space, at the given render resolution. PDF points are
    1/72 inch, so the factor is dpi/72.
    """
    f = dpi / 72.0
    return {
        "top": int(round(span["top"] * f)),
        "bottom": int(round(span["bottom"] * f)),
        "width": int(round(page_width_pt * f)),
    }


def expected_render_height(page_height_pt: float, dpi: int) -> int:
    """The pixel height a full-page `pdftoppm -r <dpi>` raster should have,
    given the page's true height in points (dpi/72 factor, same as
    `scale_box`). `render_span` checks the actual rendered image against
    this so a page that is rotated, has a non-zero MediaBox origin, or is
    simply a different size than the caller assumed fails loudly instead of
    silently producing an offset crop (confirmed empirically for this
    corpus: every page of both real exports is 612x792pt, rotation 0,
    MediaBox origin (0, 0) -- see task-5-report.md -- so this check is a
    safety net for the corpus's actual shape, not a hypothetical).
    """
    return int(round(page_height_pt * dpi / 72.0))


def render_span(pdf: Path, span: dict, dest: Path, dpi: int = 150,
                page_width_pt: float = 612.0, page_height_pt: float = 792.0) -> Path:
    """Rasterise the span's page and crop it to the question region.

    `page_width_pt`/`page_height_pt` default to the US Letter size every
    page of the real question-bank exports actually measures (confirmed via
    `pdfinfo` and the `-bbox` output's own `<page>` element across both
    PDFs). Callers that have already parsed a page's real size --
    `anchors(...)["page_size"][span["page"]]` -- should pass it explicitly
    rather than rely on the default, since a future export is not
    guaranteed to keep this size.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "page"
        subprocess.run(
            [poppler.tool("pdftoppm"), "-r", str(dpi), "-f", str(span["page"]),
             "-l", str(span["page"]), "-jpeg", str(pdf), str(stem)],
            check=True, capture_output=True,
        )
        rendered = sorted(Path(tmp).glob("page*.jpg"))
        if not rendered:
            raise RuntimeError(f"pdftoppm produced no page for {pdf.name} p{span['page']}")
        # `with Image.open(...)` (not a bare Image.open call) so the file
        # handle is always closed before the enclosing TemporaryDirectory
        # tries to delete it -- including on the raise below, which fires
        # before `.crop()` would otherwise trigger PIL's implicit `.load()`
        # (and the fp-close that comes with it). On Windows, an open handle
        # makes that delete fail with a PermissionError, masking the real
        # RuntimeError with an unrelated cleanup crash (confirmed while
        # developing this function's own test for that raise).
        with Image.open(rendered[0]) as img:
            expected_h = expected_render_height(page_height_pt, dpi)
            if abs(img.height - expected_h) > 1:
                # The point-to-pixel mapping below assumes the rendered
                # raster's height matches page_height_pt*dpi/72 exactly (mod
                # rounding). A mismatch means that assumption is wrong -- a
                # rotated page, a non-Letter page, or a stale caller-supplied
                # size -- and every crop from here on would be silently
                # offset if this weren't caught.
                raise RuntimeError(
                    f"rendered page height {img.height}px != expected {expected_h}px "
                    f"for page_height_pt={page_height_pt} at {dpi} dpi "
                    f"({pdf.name} p{span['page']}); point-to-pixel mapping is wrong -- "
                    "check for page rotation or a non-Letter page before trusting this crop"
                )
            box = scale_box(span, page_width_pt, dpi)
            crop = img.crop((0, box["top"], img.width, min(box["bottom"], img.height)))
            crop.save(dest, "JPEG", quality=85, optimize=True)
    return dest
