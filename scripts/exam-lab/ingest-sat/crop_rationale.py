"""Locate and crop College Board's official rationale for a question-bank item.

The rationale has to ship as an image, exactly like the question: the PDF's
text layer drops every math symbol ("in this equation yields , or to both
sides"), so the text `parse_qbank` extracts is unusable for Math.

Geometry, measured over both exports (3,770 records, see task-11-report.md):

* Every record opens at the top of its own page: all 3,770 `Question ID:`
  rows sit at yMin=26.6 and no page carries two. So a rationale never shares
  a page with the next record's header -- it runs from just below its
  `Rationale` label to the bottom of that page, and on 182 records (87 Math,
  95 Reading and Writing) onto exactly one more page. None crosses two
  breaks. Counted by ink rather than by region, 163 of those have rationale
  on both pages (78 Math, 85 Reading and Writing), 10 Reading and Writing
  labels sit at a page foot with all their text on the next page, and 9
  Math rationales spill onto a wholly blank page. The code still handles a
  next header on the same page (the region then ends `PAD` above it),
  because nothing but this measurement promises a future export keeps that
  layout.
* The exports have no running header or footer: a continuation page's
  first word sits at 14.4-33.8pt (the lower ones below math drawn as an
  image), and the raster shows no ink in the top 12pt or bottom 16pt of any
  page a rationale covers. So a continuation region starts at the page's
  top edge.
* The label is the word `Rationale` alone on its row, exactly once per
  record. One Math rationale (5c24c861) is a table whose header row repeats
  the word ("Correct Answer Rationale"); being alone on its row is what
  tells the label apart.

Where a region ends is decided in two layers, because the text layer is
blind to much of what a rationale contains. College Board draws math and
figures as images, so a rationale whose last line is an equation (e.g.
7a5a74a6's closing "15/2 - 15/2") has no word box at its true bottom. The
span therefore hands the renderer the rest of the page, and the renderer
trims the blank paper off in the raster, where the math is visible. Nine
Math pages are wholly blank overflow pages; they trim to nothing and drop
out.

The top edge is settled in the raster for the same reason: 38 Math
rationales (37 of them shipped) open with a stacked fraction or tall
parentheses that rise above the label's box bottom, where a fixed
text-layer cut would slice them. The cut instead sits in the blank paper
directly under the label's own ink.

Integrity: an image must never contain part of the next question. The span
stops above the next record's `Question ID:` row (so the header table and
its difficulty glyph are excluded with it), refuses any region whose words
include another header, answer line or header table, and every cut that is
not a page edge must pass through blank paper in the raster -- blank all the
way to the label above it or the header below it. Anything that fails is
left out -- the drill falls back to the text rationale -- and the reason is
recorded; nothing is approximated.
"""
import io
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

import poppler
from crop_qbank import PAD, ROW_EPSILON, expected_render_height

# How far below the label's own box bottom the region is planned to start.
# The label has no descenders, so its ink ends above its box. This is only
# the text layer's estimate: first-line math is drawn as an image with no
# word box and can rise above it (38 Math rationales), so the renderer
# settles the real cut in the raster -- see `_cut_below_label`.
LABEL_CLEARANCE = 1.0
# Measured maximum is 2 pages; anything longer means an anchor was missed
# (e.g. a header the id pattern didn't match) rather than a real rationale.
MAX_PAGES = 4
# A grayscale value below this is ink. pdftoppm's lossless background is
# pure white (255); anti-aliased glyph edges and the lightest drawn shading
# are well below it.
WHITE_MIN = 250
# Blank paper kept around each page's inked rows. Where a rationale is
# stitched across a page break the two pads meet, giving ~12pt of white --
# about one line break -- so no extra gap is added between slices.
PAD_PT = 6.0
GAP_PT = 0.0
# Rationale crops ship as adaptive-palette PNGs with this many colours. A
# rationale is text and line math on white, which a small palette keeps
# exactly: over 250 random crops, 16 colours came to 21.6% of the JPEG
# (quality 85) bytes and 32 colours to 24.9%. By eye, 16 was as legible as
# the JPEG on dense math (stacked fractions, exponents, radicals), on the
# embedded raster math with its coloured anti-aliasing, and on the one
# table rationale. See task-11-report.md.
PALETTE_COLOURS = 16

# Word pairs that only ever begin another record's header or answer. Seeing
# one inside a region means it would show part of a different question.
_FOREIGN = (("Question", "ID:"), ("Assessment", "Test"), ("Correct", "Answer:"))


class RationaleCropError(Exception):
    """A rationale that can't be cropped cleanly. `reason` is recorded in
    skipped-rationales.json; the row ships with the text fallback."""

    def __init__(self, reason: str, detail: str = ""):
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason


def id_index(a: dict, qid: str) -> int | None:
    return next((i for i, x in enumerate(a["ids"]) if x["qid"] == qid), None)


def _pos(page: int, top: float) -> tuple[int, float]:
    return (page, top)


def _alone_on_row(word: dict, words: list[dict]) -> bool:
    return not any(o is not word and abs(o["top"] - word["top"]) <= ROW_EPSILON for o in words)


def _next_header(a: dict, rec: dict) -> dict | None:
    later = [x for x in a["ids"] if _pos(x["page"], x["top"]) > _pos(rec["page"], rec["top"])]
    return min(later, key=lambda x: _pos(x["page"], x["top"])) if later else None


def _foreign_pair(words: list[dict]) -> bool:
    """Any `_FOREIGN` pair among `words`, read in pdftotext's own stream
    order -- the same order `crop_qbank.anchors` reads `Question ID:` in."""
    texts = [w["text"] for w in words]
    return any((t, n) in _FOREIGN for t, n in zip(texts, texts[1:]))


def _locate(a: dict, i: int) -> tuple[list[dict] | None, str | None]:
    if not 0 <= i < len(a["ids"]):
        return None, "unknown-id"
    rec = a["ids"][i]
    nxt = _next_header(a, rec)
    # The last page this record can reach: the next header's page, or the
    # export's final page when this is its last record.
    last_page = nxt["page"] if nxt else max(a["pages"])
    start = _pos(rec["page"], rec["bottom"])
    stop = _pos(nxt["page"], nxt["top"]) if nxt else _pos(last_page + 1, 0.0)

    labels = [
        (p, w) for p in range(rec["page"], last_page + 1) for w in a["pages"].get(p, [])
        if w["text"] == "Rationale" and start < _pos(p, w["top"]) < stop and _alone_on_row(w, a["pages"][p])
    ]
    if not labels:
        return None, "no-rationale-label"
    if len(labels) > 1:
        return None, "ambiguous-rationale-label"
    label_page, label = labels[0]

    regions: list[dict] = []
    top = label["bottom"] + LABEL_CLEARANCE
    for p in range(label_page, last_page + 1):
        height = a["page_size"][p][1]
        if nxt and p == nxt["page"]:
            above = [w for w in a["pages"][p] if w["bottom"] <= nxt["top"]]
            bottom = nxt["top"] - PAD
            # The next header's own page contributes only when something of
            # this rationale actually sits above that header -- otherwise it
            # is the header page's top margin, and rendering it would cost a
            # page render per record for a slice that trims to nothing.
            if p == label_page or (above and bottom > top):
                regions.append({"page": p, "top": top, "bottom": bottom, "next_header": nxt["top"]})
            break
        regions.append({"page": p, "top": top, "bottom": height})
        top = 0.0
    if regions and regions[0]["page"] == label_page:
        # The renderer needs the label's box to find where its ink ends.
        regions[0]["label"] = {k: label[k] for k in ("left", "top", "right", "bottom")}

    if len(regions) > MAX_PAGES:
        return None, "rationale-too-long"
    if any(r["bottom"] <= r["top"] for r in regions):
        return None, "degenerate-rationale-region"
    for r in regions:
        inside = [w for w in a["pages"][r["page"]] if w["bottom"] > r["top"] and w["top"] < r["bottom"]]
        if _foreign_pair(inside):
            return None, "foreign-header-in-region"
    return regions, None


def rationale_span(a: dict, i: int) -> list[dict] | None:
    """The page regions holding record `i`'s rationale (`i` indexes
    `a["ids"]`, as `anchors` returns them), top to bottom: from just below
    its `Rationale` label to just above the next record's header, spanning
    page breaks. Each region is `{"page", "top", "bottom"}` in points; the
    first also carries the `label`'s box, and one that ends above a header
    on its own page carries that header's top as `next_header`, so the
    renderer can check both cuts against the raster. None when it can't be
    located cleanly; `rationale_span_reason` says why.
    """
    return _locate(a, i)[0]


def rationale_span_reason(a: dict, i: int) -> str | None:
    return _locate(a, i)[1]


def ink_bounds(img: Image.Image) -> tuple[int, int] | None:
    """(first inked row, one past the last inked row), or None if blank."""
    mask = img.convert("L").point(lambda v: 255 if v < WHITE_MIN else 0)
    box = mask.getbbox()
    return (box[1], box[3]) if box else None


def _blank(gray: Image.Image, y0: int, y1: int) -> bool:
    """True if every full-width row in [y0, y1) is blank paper."""
    if y1 <= y0:
        return True
    return gray.crop((0, y0, gray.width, y1)).getextrema()[0] >= WHITE_MIN


def _cut_below_label(gray: Image.Image, label: dict, planned: int, f: float, page: int) -> int:
    """The first region's top edge, settled in the raster.

    The cut must lie in blank paper that begins directly under the label's
    own ink: then everything above the cut is the label (or the answer line
    above it) and everything below is kept -- nothing of the rationale is
    lost and nothing of the label is shown. The text layer's planned cut is
    used when that blank band reaches it (the usual case); when first-line
    math rises above it, the cut moves up to just under the label's ink. If
    no blank row separates the two, there is no clean cut.
    """
    x0, y0 = int(label["left"] * f), int(label["top"] * f)
    x1, y1 = int(label["right"] * f) + 1, int(label["bottom"] * f) + 1
    ink = ink_bounds(gray.crop((x0, y0, x1, y1)))
    if ink is None:
        raise RationaleCropError("label-not-in-raster", f"p{page}")
    start = y0 + ink[1]  # first row below the label's ink
    if not _blank(gray, start, start + 1):
        raise RationaleCropError("cut-through-ink", f"under the label on p{page} at {start}px")
    if start < planned and _blank(gray, start, planned + 1):
        return planned
    return start


def compose(slices: list[Image.Image], pad_px: int, gap_px: int) -> Image.Image | None:
    """Trim each slice to its inked rows plus `pad_px` -- taken from inside
    the slice only, never beyond its edges -- drop blank slices, and stack
    the rest `gap_px` apart on white. None if every slice is blank."""
    kept = []
    for s in slices:
        bounds = ink_bounds(s)
        if bounds is None:
            continue
        top, bottom = bounds
        kept.append(s.crop((0, max(0, top - pad_px), s.width, min(s.height, bottom + pad_px))))
    if not kept:
        return None
    width = max(s.width for s in kept)
    canvas = Image.new("RGB", (width, sum(s.height for s in kept) + gap_px * (len(kept) - 1)), "white")
    y = 0
    for s in kept:
        canvas.paste(s, (0, y))
        y += s.height + gap_px
    return canvas


def _render_pages(pdf: Path, first: int, last: int, dpi: int) -> dict[int, Image.Image]:
    """Rasterise pages first..last in one pdftoppm call, keyed by page number.

    pdftoppm's default PPM output: lossless (so the blank-row checks see
    true white, not JPEG ringing), in colour (College Board colours some
    math), and measured ~2x faster than `-png`, whose compression dominated
    the per-record cost.

    Cleanup errors are ignored: on Windows an antivirus scan can hold a
    just-written raster open while the directory is removed (WinError 32,
    seen during the whole-corpus scan). The pages are in memory by then, so
    a leftover temp file must not abort the run.
    """
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        subprocess.run(
            [poppler.tool("pdftoppm"), "-r", str(dpi), "-f", str(first), "-l", str(last),
             str(pdf), str(Path(tmp) / "page")],
            check=True, capture_output=True,
        )
        out = {}
        for f in Path(tmp).glob("page-*.ppm"):
            # Loaded into memory (not left lazily open) so the temporary
            # directory can be removed on Windows.
            with Image.open(f) as img:
                out[int(f.stem.rsplit("-", 1)[1])] = img.convert("RGB")
        return out


def render_rationale(pdf: Path, regions: list[dict], page_size: dict, dpi: int = 150) -> bytes:
    """Render `regions` (from `rationale_span`) into one image and return
    its final PNG bytes (a `PALETTE_COLOURS`-colour adaptive palette,
    quantised from the lossless raster). Nothing is written: the
    rationale's bucket key is a hash of these bytes
    (`upload.rationale_bucket_path`), so the caller needs them before it
    knows where the file goes, and writes them itself, atomically.
    Deterministic -- pdftoppm, Pillow's median-cut quantiser and its PNG
    encoder all are -- so a re-render of an unchanged rationale reproduces
    its key.

    Raises `RationaleCropError` for a rationale that can't be cropped
    cleanly, `RuntimeError` for a raster whose size contradicts the page's
    declared size (that would offset every crop).
    """
    f = dpi / 72.0
    pages = _render_pages(pdf, regions[0]["page"], regions[-1]["page"], dpi)
    slices = []
    for r in regions:
        img = pages.get(r["page"])
        if img is None:
            raise RuntimeError(f"pdftoppm produced no page {r['page']} for {pdf.name}")
        height_pt = page_size[r["page"]][1]
        expected_h = expected_render_height(height_pt, dpi)
        if abs(img.height - expected_h) > 1:
            raise RuntimeError(
                f"rendered page height {img.height}px != expected {expected_h}px for "
                f"page_height_pt={height_pt} at {dpi} dpi ({pdf.name} p{r['page']}); "
                "point-to-pixel mapping is wrong"
            )
        top = int(round(r["top"] * f))
        bottom = min(int(round(r["bottom"] * f)), img.height)
        gray = img.convert("L")
        # Page edges are always safe; any other edge is a cut through the
        # page's content and must fall on blank paper -- and, where the
        # neighbour across the cut is known (the label above, a header
        # below), all the paper between that neighbour and the cut must be
        # blank too, so nothing of the rationale is cut away with it.
        if "label" in r:
            top = _cut_below_label(gray, r["label"], top, f, r["page"])
        elif top > 0 and not _blank(gray, top, top + 1):
            raise RationaleCropError("cut-through-ink", f"top of p{r['page']} at {top}px")
        if bottom < img.height:
            until = max(bottom, int(round(r.get("next_header", 0.0) * f)))
            if not _blank(gray, bottom - 1, until):
                raise RationaleCropError("cut-through-ink", f"bottom of p{r['page']} at {bottom}px")
        slices.append(img.crop((0, top, img.width, bottom)))

    image = compose(slices, pad_px=int(round(PAD_PT * f)), gap_px=int(round(GAP_PT * f)))
    if image is None:
        raise RationaleCropError("empty-rationale-region")

    out = io.BytesIO()
    image.quantize(colors=PALETTE_COLOURS).save(out, "PNG", optimize=True)
    return out.getvalue()
