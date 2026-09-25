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

Clearing the header's *text* is necessary but not sufficient. College
Board also draws the difficulty as a vector bar glyph (one, two or three
filled bars) in the header table's last cell. It carries no text, so it has
no `-bbox` word box at all and the row logic below cannot see it: cropping
below the header's lowest text row left the glyph's bottom sliver inside
1,788 of the corpus's 3,730 crops (47.9%), where -- measured -- it is a
perfect read-out of the rating, exactly what this module exists to prevent.
The body's "Question" section label sits below the whole table, glyph
included, so the crop anchors there as well; `GLYPH_DEPTH` is a measured
floor for the same reason, in case a future layout puts that label unusually
tight against the table.

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
import os
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

import poppler
from bbox import bbox_xml, page_sizes, words_by_page  # noqa: F401  (re-exported)

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
# How far below the difficulty row's own bottom the vector difficulty glyph
# can reach. It has no word box, so this cannot be derived from the text
# layer; it was measured off the rendered corpus, where the glyph reached at
# most 10.32pt below that row. This is only a backstop -- the "Question"
# label anchor clears the glyph by >= 14.40pt on every question in the real
# corpus, so this floor never binds there.
GLYPH_DEPTH = 12.0


def anchors(xml_text: str) -> dict:
    """Extract question-id, difficulty, answer and rationale anchors per page.

    Also returns `page_size`: each page's true (width_pt, height_pt) as
    declared on `-bbox`'s own `<page width=... height=...>` element. Callers
    must read a page's real size from here rather than assume a constant
    (e.g. US Letter) -- see `render_span`, which needs the true height to
    validate its point-to-pixel mapping.
    """
    pages = words_by_page(xml_text)
    page_size = page_sizes(xml_text)
    ids, diffs, answers, rationales, questions = [], [], [], [], []
    for pageno, words in pages.items():
        for i, w in enumerate(words):
            nxt = words[i + 1]["text"] if i + 1 < len(words) else None
            if w["text"] == "Question" and nxt == "ID:" and i + 2 < len(words):
                cand = words[i + 2]["text"]
                if _HEX8.match(cand):
                    ids.append({"qid": cand, "page": pageno, "top": w["top"], "bottom": w["bottom"]})
            if w["text"] == "Question" and nxt != "ID:":
                # The body's section label, NOT the "Question ID:" token in
                # the header -- the `nxt` check is what separates them, and
                # it is the only thing that does: both are the bare word
                # "Question" in the word stream.
                questions.append({"page": pageno, "top": w["top"]})
            if w["text"] in DIFFICULTY_WORDS:
                diffs.append({"page": pageno, "top": w["top"], "bottom": w["bottom"]})
            if w["text"] == "Correct" and nxt == "Answer:":
                answers.append({"page": pageno, "top": w["top"]})
            if w["text"] == "Rationale":
                rationales.append({"page": pageno, "top": w["top"]})
    return {
        "ids": ids, "diffs": diffs, "answers": answers, "rationales": rationales,
        "questions": questions, "pages": pages, "page_size": page_size,
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

    labels = [q["top"] for q in a["questions"] if q["page"] == page and q["top"] > entry["bottom"]]
    if not labels:
        # Every one of the 3,730 ingestable questions in the real corpus has
        # this label, so its absence means the page is not the shape this
        # module understands. Cropping anyway would risk shipping the
        # difficulty glyph, so fail the question instead of guessing.
        return None, "no-question-label"

    header_bottom = _header_bottom(a["pages"][page], diff_bottom)
    # Three independent lower bounds, each covering something the others
    # cannot, so the crop top is the lowest of them:
    #   header_bottom + PAD  -- below the header's lowest *text* row,
    #                           including a wrapped domain/skill tail.
    #   label_top - PAD      -- below the whole header *table*, which is the
    #                           only way to clear the textless difficulty
    #                           glyph; the label is the first body element.
    #   diff_bottom + GLYPH_DEPTH -- a measured floor on the glyph's reach,
    #                           in case that label ever sits tight against
    #                           the table.
    top = max(header_bottom + PAD, min(labels) - PAD, diff_bottom + GLYPH_DEPTH)

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
    if span["bottom"] <= span["top"]:
        # An inverted span (top > bottom) would otherwise reach PIL's
        # .crop() and raise `ValueError: Coordinate 'lower' is less than
        # 'upper'`; a zero-height one (top == bottom) would pass .crop()
        # but fail .save() with `cannot write empty image as JPEG`. Both
        # already fail loud, but with a generic PIL message carrying no
        # pdf/page/question-id context. Task 7 calls this function 3,766
        # times, so this needs to name exactly which pdf/page/span produced
        # it -- mirroring the diagnostic style of the height check below.
        raise RuntimeError(
            f"degenerate span top={span['top']} bottom={span['bottom']} "
            f"for {pdf.name} p{span['page']}: bottom must be > top"
        )
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
            # Write to a temp file in the same directory, then os.replace()
            # it onto dest -- atomic on both POSIX and Windows. Task 7's
            # resumability keys purely on dest.exists(), so a process killed
            # mid-.save() (plausible across a many-minute cold run over the
            # full corpus) must never leave a partial file sitting at the
            # final path: it would look "done" to the next run and, once
            # live, get uploaded as the actual crop. Either dest doesn't
            # exist yet, or it is the complete file -- never in between.
            tmp_dest = dest.with_name(f"{dest.name}.tmp-{os.getpid()}")
            try:
                crop.save(tmp_dest, "JPEG", quality=85, optimize=True)
                os.replace(tmp_dest, dest)
            except BaseException:
                tmp_dest.unlink(missing_ok=True)
                raise
    return dest
