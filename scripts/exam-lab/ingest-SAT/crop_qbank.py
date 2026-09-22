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
import xml.etree.ElementTree as ET
from pathlib import Path

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
    out = subprocess.run(
        [poppler.tool("pdftotext"), "-bbox", str(pdf), "-"],
        capture_output=True, text=True, check=True,
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
    """Extract question-id, difficulty, answer and rationale anchors per page."""
    root = _strip_namespace(ET.fromstring(xml_text))
    ids, diffs, answers, rationales = [], [], [], []
    pages: dict[int, list[dict]] = {}
    for pageno, page in enumerate(root.iter("page"), start=1):
        words = _words(page)
        pages[pageno] = words
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
    return {"ids": ids, "diffs": diffs, "answers": answers, "rationales": rationales, "pages": pages}


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


def question_span(a: dict, qid: str) -> dict | None:
    """Region between the header's true bottom edge and the answer, for one question."""
    entry = next((x for x in a["ids"] if x["qid"] == qid), None)
    if entry is None:
        return None
    page = entry["page"]

    after = [d["bottom"] for d in a["diffs"] if d["page"] == page and d["bottom"] > entry["bottom"]]
    if not after:
        # No difficulty token found below this id: there's nothing to anchor
        # the header's end on, so cropping would risk leaking the header
        # (or worse, guessing) rather than failing safely.
        return None
    diff_bottom = min(after)

    header_bottom = _header_bottom(a["pages"][page], diff_bottom)
    top = header_bottom + PAD

    ends = [x["top"] for x in a["answers"] + a["rationales"] if x["page"] == page and x["top"] > top]
    if not ends:
        return None
    return {"page": page, "top": top, "bottom": min(ends) - PAD}
