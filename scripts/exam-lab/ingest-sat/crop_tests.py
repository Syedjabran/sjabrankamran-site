"""Locate and cut one question out of a two-column practice-test page.

The question bank put one question per header block down a single column.
The practice tests do not: each page carries two columns side by side, and a
question is one column-shaped region, not a full-width band.

Unlike the question bank, a question that will not crop cannot simply be
skipped: spec section 10.4 drops the entire test if its count does not match
the printed 33/33/27/27, so a question overflowing its column is stitched
into the next column instead. `ingest-5054/crop5054.py`'s `crop_question` is
the prior art for that paste-onto-one-canvas shape.

How the page is read -- every number below was measured on all 8 tests
(4-11), not inferred:

1. Module boundaries come from the module's title page, never from the
   running header. A title page carries the section heading row
   ("Reading and Writing" / "Math") immediately followed by an
   "N QUESTIONS" row. Rows are compared with every space removed, so test
   11's letter-spaced `3 3 Q U E S T I O N S` and tests 4-10's
   `33 QUESTIONS` compare equal. The module number is the digit under the
   running header's "Module" word, and a module ends on the page carrying
   its "STOP" line. `modules()` checks all four against the printed
   structure; a test that does not segment into exactly that structure
   fails there, before any question is looked for.

2. Every page is laid out on one of two grids (the book alternates its
   margins between facing pages), and both grids share their geometry: the
   right column's body edge sits PITCH to the right of the left column's.
   The left body edge is read off the page itself -- first from the
   choice labels ("A)" to "D)"), which are set flush at a column's body
   edge; failing those, from the dotted gutter leader tests 4-10 draw as
   a text word; failing both, from the leftmost run of text lines. A page
   is one column when text crosses the gutter, or when it has no leader
   and a choice label sits off both columns' edges (a question whose four
   answer choices are graphs laid out two by two).

3. A question number is printed in a small box hanging to the left of its
   column. It is found as a 1-2 digit word whose centre sits NUMBER_OFFSET
   left of the column's body edge, alone on its row within the column.
   Font size is not a signal (the number matches the body text). Within a
   module the accepted numbers must come out as exactly 1..K in reading
   order (left column top to bottom, then the right, page by page); that is
   checked, never used to pick candidates.

4. A question runs from its number to the next question's number in
   reading order, across as many columns and pages as that takes -- one
   test 10 question puts its stem on one page and its four graph choices
   on the next. A column or page in between is included only if it holds
   text within the span, so a question ending at the foot of a left column
   does not drag an empty right-column strip with it.

The supported path for a whole test is `locate` -> `check` (must return no
complaints) -> `span` for each anchor -> `render_regions`. There is
deliberately no per-page form: a page on its own cannot know where its
module's directions end, where its STOP line is, or that its last question
carries on over the page.
"""
import re
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bbox
import manifest
import poppler
from crop_qbank import expected_render_height

PAD = 6.0
# The running header and the page-number footer sit outside the question
# body on every page, so no crop should ever reach them. Measured on the
# rendered pages of every module of all 8 tests: header ink ends by 72.0pt
# and the first question starts at 113.25pt or lower; question ink ends by
# 734.5pt (test 5's 2x2 graph choices) and footer ink starts at 740.5pt or
# lower (test 11's CONTINUE arrow). The page bottom is 792 - FOOTER_TRIM.
HEADER_TRIM = 95.0
FOOTER_TRIM = 55.0
LETTER_HEIGHT = 792.0

# Words whose tops differ by at most this much share a visual row. Test 11's
# letter-spaced headings share their top exactly.
ROW_TOL = 2.0
# Nothing typeset in these books is this tall: the tallest text, a section
# heading, is 31.2pt. Taller "words" are the dotted gutter leader
# (395-605pt), the OCR-style runs tests 4-10 lay over the grey question bars
# (92-97pt) and test 11's corner section digits (59.5pt). None is question
# text.
ARTIFACT_HEIGHT = 45.0
_LEADER = re.compile(r"^\.{5,}$")
LEADER_MIN_HEIGHT = 200.0
_ALNUM = re.compile(r"[0-9A-Za-z]")
_ALPHA = re.compile(r"[A-Za-z]")
_SECTION = {"READINGANDWRITING": "rw", "MATH": "math"}
_QUESTIONS = re.compile(r"(\d+)QUESTIONS")
_CHOICE = re.compile(r"^[A-D]\)$")
_QNUM = re.compile(r"^\d{1,2}$")

# On every Reading and Writing title page the directions paragraph's rows
# are 0.8-7.8pt apart and the first question starts 40.6-49.5pt below its
# last row. (A Math title page holds no question: question 1 is two pages
# on, after the reference sheet.)
DIRECTIONS_GAP = 20.0

# Right-column body edge minus left-column body edge: 277.7-279.0pt on
# every two-column page of all 8 tests.
PITCH = 278.4
# Dotted gutter leader centre minus the left body edge: 244.3-245.4pt on
# every page of tests 4-10 that carries one (test 11 has none).
LEADER_TO_EDGE = 244.9
# A question number's centre sits this far left of its column's body edge:
# 7.6-9.8pt across all 960 numbers (one- and two-digit numbers are centred
# in the same box). It is accepted within NUMBER_SLACK of that. Nothing else
# in the text layer of any of the 8 tests sits 0-25pt left of a body edge:
# the nearest integer that is not a question number is a stem beginning
# with a digit, 1.8pt right of the edge.
NUMBER_OFFSET = 8.7
NUMBER_SLACK = 3.0
# Half-width of the band about the page centre that a two-column page never
# puts text across: its left column's text ends by 299.0pt and its right
# column's begins at 318.2pt (a number) or later, on a 612pt page.
GUTTER_HALF = 4.0
# Crop box of a column relative to its body edge. The number box starts
# 17.7pt left of the body edge; the grey question bar ends 225.4pt right of
# it and no text passes 229pt. The dotted gutter rule, found in the render
# of all 319 two-column pages, sits 5.5-6.7pt right of the left column's
# box and 8.7-9.9pt left of the right column's, so it is never in a crop.
BOX_REACH = 26.0
COLUMN_REACH = 236.0
# A label sits at a column's body edge within this much.
EDGE_TOL = 2.0
# Two words share a row when their vertical centres are this close; body
# rows are 12pt or more apart.
ROW_SHARE = 4.0


def _rows(words: list[dict]) -> list[list[dict]]:
    """Words grouped into visual rows, top to bottom, each left to right."""
    rows: list[list[dict]] = []
    for w in sorted(words, key=lambda w: w["top"]):
        if rows and w["top"] - rows[-1][0]["top"] <= ROW_TOL:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [sorted(r, key=lambda w: w["left"]) for r in rows]


def _compact(row: list[dict]) -> str:
    """A row's text with every space removed, upper-cased: letter-spaced
    headings (`Q U E S T I O N S`, `DIR EC TIONS`) compare equal to plain
    ones."""
    return "".join(w["text"] for w in row).upper()


def _text_words(words: list[dict]) -> list[dict]:
    """Words that are typeset text: not an artifact, not pure punctuation.

    Tests 4-10 lay OCR-style runs of dashes and tildes over the grey
    question bars; dropping anything without a letter or digit keeps them
    out of every row and isolation test below.
    """
    return [w for w in words
            if w["bottom"] - w["top"] <= ARTIFACT_HEIGHT and _ALNUM.search(w["text"])]


def _leader(words: list[dict]) -> dict | None:
    """The dotted gutter leader tests 4-10 draw as one tall word of dots."""
    for w in words:
        if _LEADER.match(w["text"]) and w["bottom"] - w["top"] >= LEADER_MIN_HEIGHT:
            return w
    return None


def _running_module(words: list[dict]) -> int | None:
    """The module number printed under the running header's "Module"."""
    for m in words:
        if m["text"] != "Module" or m["top"] > HEADER_TRIM:
            continue
        centre = (m["left"] + m["right"]) / 2
        for d in words:
            if (d["text"] in ("1", "2") and 0 < d["top"] - m["top"] < 30
                    and abs((d["left"] + d["right"]) / 2 - centre) < 25):
                return int(d["text"])
    return None


def _module_start(words: list[dict]) -> tuple[str, int, int, float] | None:
    """(section, module, printed question count, bottom of the directions
    block) when `words` is a module's title page, else None."""
    rows = _rows(_text_words(words))
    texts = [_compact(r) for r in rows]
    for i in range(len(rows) - 1):
        section = _SECTION.get(texts[i])
        count = _QUESTIONS.fullmatch(texts[i + 1])
        if not (section and count):
            continue
        module = _running_module(words)
        if module is None:
            return None
        return section, module, int(count.group(1)), _block_bottom(rows[i + 2:])
    return None


def _block_bottom(rows: list[list[dict]]) -> float:
    """Bottom of the directions block that opens `rows`: rows are taken
    while each starts within DIRECTIONS_GAP of the one above."""
    bottom = None
    for r in rows:
        top = min(w["top"] for w in r)
        if bottom is not None and top - bottom > DIRECTIONS_GAP:
            break
        rb = max(w["bottom"] for w in r)
        bottom = rb if bottom is None else max(bottom, rb)
    return bottom if bottom is not None else HEADER_TRIM


def module_at(words: list[dict]) -> tuple[str, int] | None:
    """(section, module) if this page opens a module, else None."""
    start = _module_start(words)
    return (start[0], start[1]) if start else None


def _stop_top(words: list[dict]) -> float | None:
    """Top of the "STOP" line that closes a module, if this page has one."""
    for r in _rows(_text_words(words)):
        if _compact(r) == "STOP":
            return min(w["top"] for w in r)
    return None


def zone(words: list[dict], page_height: float = LETTER_HEIGHT) -> tuple[float, float]:
    """(top, bottom) of the part of the page that holds questions: below the
    running header (and below the directions on a module's title page),
    above the footer (and above the STOP line on a module's last page)."""
    top, bottom = HEADER_TRIM, page_height - FOOTER_TRIM
    start = _module_start(words)
    if start:
        top = max(top, start[3] + PAD)
    stop = _stop_top(words)
    if stop is not None:
        bottom = min(bottom, stop - PAD)
    return top, bottom


def _zone_text(words: list[dict], page_height: float) -> list[dict]:
    top, bottom = zone(words, page_height)
    return [w for w in _text_words(words) if w["top"] >= top and w["bottom"] <= bottom]


def _label_edge(xs: list[float]) -> float | None:
    """Body edge from choice-label positions: the median of the leftmost
    cluster. Labels differ by up to 0.9pt by glyph (test 11 sets "A)" at
    53.1 and "C)" at 54.0 on one edge), and a label inside a table sits
    further right, never further left."""
    if not xs:
        return None
    low = min(xs)
    return statistics.median([x for x in xs if x <= low + EDGE_TOL])


def _line_start_edge(text: list[dict], mid: float) -> float | None:
    """The leftmost x at which at least two text lines of the left half
    begin -- the weakest evidence, used only on a page with neither choice
    labels nor a leader."""
    starts = sorted(r[0]["left"] for r in _rows([w for w in text if w["left"] < mid])
                    if _ALPHA.search(r[0]["text"]))
    for x in starts:
        near = [s for s in starts if x <= s <= x + EDGE_TOL]
        if len(near) >= 2:
            return statistics.median(near)
    return None


def layout(words: list[dict], page_width: float,
           page_height: float = LETTER_HEIGHT) -> list[float]:
    """Body edge of each column, left to right: two for a two-column page,
    one for a full-width page, none for a page without question text.

    The left edge is the least of the estimates available -- left-column
    labels, right-column labels less PITCH, the leader less LEADER_TO_EDGE.
    A label can sit right of its column's edge (inside a table) but never
    left of it, and the other two estimates agree with the labels to 1pt on
    every page carrying both. A column's own labels then set its edge when
    they are within EDGE_TOL of that. Labels set the edge on every page of
    all 8 tests that holds a question but one: test 10's page 36, a stem
    whose graph choices are overleaf, read from its line starts.
    """
    text = _zone_text(words, page_height)
    if not text:
        return []
    mid = page_width / 2
    leader = _leader(words)
    labels = [w["left"] for w in text if _CHOICE.match(w["text"])]
    own_left = _label_edge([x for x in labels if x < mid])
    own_right = _label_edge([x for x in labels if x >= mid])
    estimates = [x for x in (
        own_left,
        own_right - PITCH if own_right is not None else None,
        (leader["left"] + leader["right"]) / 2 - LEADER_TO_EDGE if leader else None,
    ) if x is not None]
    if estimates:
        least = min(estimates)
        edge = own_left if own_left is not None and own_left - least <= EDGE_TOL else least
    else:
        edge = _line_start_edge(text, mid)
    if edge is None:
        return []
    crossing = any(w["left"] < mid + GUTTER_HALF and w["right"] > mid - GUTTER_HALF
                   for w in text)
    off_grid = any(min(abs(x - edge), abs(x - edge - PITCH)) > EDGE_TOL for x in labels)
    if crossing or (leader is None and off_grid):
        return [edge]
    right = edge + PITCH
    if own_right is not None and abs(own_right - right) <= EDGE_TOL:
        right = own_right
    return [edge, right]


def columns(words: list[dict], page_width: float,
            page_height: float = LETTER_HEIGHT) -> list[tuple[float, float]]:
    """Crop box (left, right) of each column, left to right: two for a
    two-column page, one for a full-width page, none for a page without
    question text."""
    edges = layout(words, page_width, page_height)
    reach = COLUMN_REACH if len(edges) == 2 else PITCH + COLUMN_REACH
    return [(max(0.0, e - BOX_REACH), min(page_width, e + reach)) for e in edges]


def question_anchors(words: list[dict], cols: list[tuple[float, float]],
                     page_height: float = LETTER_HEIGHT) -> list[dict]:
    """Question numbers on this page, in reading order:
    [{"qnum", "col", "top"}]."""
    text = _zone_text(words, page_height)
    found = []
    for ci, (left, right) in enumerate(cols):
        edge = left + BOX_REACH
        target = edge - NUMBER_OFFSET
        in_col = [w for w in text if w["right"] > left and w["left"] < right]
        for w in in_col:
            if not _QNUM.match(w["text"]) or int(w["text"]) == 0:
                continue
            if abs((w["left"] + w["right"]) / 2 - target) > NUMBER_SLACK:
                continue
            mid_y = (w["top"] + w["bottom"]) / 2
            alone = not any(
                o is not w and abs((o["top"] + o["bottom"]) / 2 - mid_y) < ROW_SHARE
                for o in in_col
            )
            if alone:
                found.append({"qnum": int(w["text"]), "col": ci, "top": w["top"]})
    return sorted(found, key=lambda a: (a["col"], a["top"]))


def modules(pages: dict[int, list[dict]], structure: list[dict]) -> list[dict]:
    """The test's modules in page order: [{"section", "module", "count",
    "pages": [first..last]}], first being the title page and last the page
    carrying the module's STOP line.

    Raises ValueError unless the title pages spell out exactly `structure`
    (manifest.json's module_structure, which the answer key confirms for all
    8 tests) -- same modules, same order, same printed question counts --
    and each module closes with a STOP before the next one opens. A module
    boundary found anywhere else would restart the question count mid-module,
    which is how the second failed rule lost 21 of Math Module 1's 27.
    """
    found: list[dict] = []
    for pno in sorted(pages):
        start = _module_start(pages[pno])
        if start:
            if found and found[-1].get("last") is None:
                raise ValueError(f"page {pno} opens {start[:2]} before the previous module's STOP")
            found.append({"section": start[0], "module": start[1], "count": start[2],
                          "first": pno, "last": None})
        elif found and found[-1]["last"] is None and _stop_top(pages[pno]) is not None:
            found[-1]["last"] = pno
    got = [(m["section"], m["module"], m["count"]) for m in found]
    want = [(s["section"], s["module"], s["questions"]) for s in structure]
    if got != want:
        raise ValueError(f"module title pages read {got}, expected {want}")
    for m in found:
        if m["last"] is None:
            raise ValueError(f"{m['section']} module {m['module']} has no STOP page")
        m["pages"] = list(range(m["first"], m.pop("last") + 1))
        del m["first"]
    return found


def locate(pages: dict[int, list[dict]], sizes: dict[int, tuple[float, float]],
           structure: list[dict]) -> list[dict]:
    """Every module with its question anchors and its reading-order slots.

    [{"section", "module", "count", "pages", "slots": [...], "anchors":
    [...]}] where a slot is one column of one page -- {"page", "col",
    "left", "right", "top", "bottom", "page_height", "text": [(top, bottom),
    ...]} -- and an anchor is {"qnum", "page", "col", "top", "slot"} with
    `slot` indexing `slots`. Anchors are exactly what the page geometry
    finds; `check` says whether they are the printed 1..K.

    This and `span` are the only supported way to get a question's regions:
    `check(locate(...))` must come back empty, then each question is
    `span(mod["anchors"], i, mod["slots"])`.
    """
    out = []
    for mod in modules(pages, structure):
        slots: list[dict] = []
        anchors: list[dict] = []
        for pno in mod["pages"]:
            width, height = sizes[pno]
            words = pages[pno]
            cols = columns(words, width, height)
            top, bottom = zone(words, height)
            text = _zone_text(words, height)
            first_slot = len(slots)
            for ci, (left, right) in enumerate(cols):
                slots.append({
                    "page": pno, "col": ci, "left": left, "right": right,
                    "top": top, "bottom": bottom, "page_height": height,
                    "text": sorted((w["top"], w["bottom"]) for w in text
                                   if w["right"] > left and w["left"] < right),
                })
            for a in question_anchors(words, cols, height):
                anchors.append({**a, "page": pno, "slot": first_slot + a["col"]})
        out.append({**mod, "slots": slots, "anchors": anchors})
    return out


def check(located: list[dict]) -> list[str]:
    """Spec 10.4's gate on the anchors, before anything is rendered: every
    module's numbers must read exactly 1..K in reading order. Empty means
    the test segments into its printed structure."""
    problems = []
    for mod in located:
        got = [a["qnum"] for a in mod["anchors"]]
        want = list(range(1, mod["count"] + 1))
        if got != want:
            problems.append(f"{mod['section']} module {mod['module']}: numbers read {got}, "
                            f"expected 1..{mod['count']}")
    return problems


def span(anchors: list[dict], i: int, slots: list[dict]) -> list[dict]:
    """The rectangles making up question `anchors[i]`, in reading order.

    It starts at its own number and runs to the next question's number,
    through every slot between. Its own slot is always kept. A later slot
    is kept only if it holds text inside the span -- or if its text is
    unknown (`"text": None`), in which case it is kept rather than risk
    cutting a question short. After the module's last question, the span
    runs to the end of the module's last slot.

    `anchors` and `slots` are one module's, as `locate` returns them; this
    and `locate` are the only supported way to get a question's regions.
    Each region carries its page's height so `render_regions` can refuse a
    raster that does not match it.
    """
    a = anchors[i]
    nxt = anchors[i + 1] if i + 1 < len(anchors) else None
    last = nxt["slot"] if nxt is not None else len(slots) - 1
    out = []
    for s in range(a["slot"], last + 1):
        slot = slots[s]
        top = a["top"] - PAD if s == a["slot"] else slot["top"]
        bottom = nxt["top"] - PAD if nxt is not None and s == nxt["slot"] else slot["bottom"]
        if bottom <= top:
            continue
        if s != a["slot"] and slot.get("text") is not None and not any(
                t < bottom and b > top for t, b in slot["text"]):
            continue
        out.append({"page": slot["page"], "left": slot["left"], "right": slot["right"],
                    "top": top, "bottom": bottom,
                    "page_height": slot.get("page_height", LETTER_HEIGHT)})
    return out


# A pixel darker than this is ink. The grey question bars are ~215, page
# white is 255; anti-aliased glyph edges fall in between.
INK = 245
# White margin, in points, kept around the ink when a slice is trimmed.
TRIM_MARGIN = 4.0


def _trim(img: Image.Image, margin_px: int) -> Image.Image | None:
    """`img` cut down to the rows that hold ink, plus `margin_px` of white
    either side; None if it holds no ink at all. Only all-white rows are
    removed, so nothing printed is ever cut. A region reaches to the foot of
    its column (the text layer cannot see where a figure ends), which on a
    short question leaves most of a page of white below it."""
    gray = img.convert("L")
    width = gray.width
    data = gray.tobytes()
    inked = [y for y in range(gray.height)
             if min(data[y * width:(y + 1) * width]) < INK]
    if not inked:
        return None
    top = max(0, inked[0] - margin_px)
    bottom = min(img.height, inked[-1] + 1 + margin_px)
    return img.crop((0, top, img.width, bottom))


def render_regions(pdf: Path, regions: list[dict], dest: Path, dpi: int = 150) -> None:
    """Render and stitch `regions` into one image at `dest`, written
    atomically so an interrupted run leaves no half-file that a resume would
    mistake for a finished crop (plan 1's render_span rule).

    Each slice is trimmed to its ink before stacking, so a stitched
    question reads as one block rather than two islands separated by the
    white foot of a column.

    Raises RuntimeError, before anything is written, when a rendered page's
    height is not the one its region was measured against (the region's
    `page_height`, US Letter if absent) -- a rotated page or an offset
    MediaBox would otherwise shift every crop silently. The rule is
    crop_qbank.render_span's, through the same `expected_render_height`.
    """
    scale = dpi / 72.0
    with tempfile.TemporaryDirectory() as tmp:
        slices = []
        for r in regions:
            stem = Path(tmp) / f"p{r['page']}"
            page_png = stem.with_suffix(".png")
            if not page_png.exists():
                subprocess.run(
                    [poppler.tool("pdftoppm"), "-png", "-r", str(dpi),
                     "-f", str(r["page"]), "-l", str(r["page"]),
                     "-singlefile", str(pdf), str(stem)],
                    check=True, capture_output=True,
                )
            page_height = r.get("page_height", LETTER_HEIGHT)
            with Image.open(page_png) as raster:
                expected = expected_render_height(page_height, dpi)
                if abs(raster.height - expected) > 1:
                    raise RuntimeError(
                        f"rendered page height {raster.height}px != expected {expected}px "
                        f"for page_height={page_height}pt at {dpi} dpi ({pdf.name} "
                        f"p{r['page']}); the point-to-pixel mapping is wrong -- check for "
                        "page rotation or an offset MediaBox before trusting this crop"
                    )
                img = raster.convert("RGB")
            piece = img.crop((
                int(r["left"] * scale), int(r["top"] * scale),
                min(img.width, int(r["right"] * scale)),
                min(img.height, int(r["bottom"] * scale)),
            ))
            trimmed = _trim(piece, int(TRIM_MARGIN * scale))
            if trimmed is not None:
                slices.append(trimmed)
        if not slices:
            raise ValueError(f"nothing printed in the regions for {dest.name}")
        width = max(s.width for s in slices)
        canvas = Image.new("RGB", (width, sum(s.height for s in slices)), "white")
        y = 0
        for s in slices:
            canvas.paste(s, (0, y))
            y += s.height
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging = dest.with_name(f"{dest.name}.tmp")
        canvas.save(staging, "JPEG", quality=88)
        staging.replace(dest)


def main() -> int:
    """Print the acceptance gate for every test in the manifest; exit 1 if
    any test does not read as its printed structure.

        python crop_tests.py
    """
    spec = manifest.load()
    failed = 0
    for entry in spec["practice_tests"]:
        xml = bbox.bbox_xml(manifest.bundle_paths(entry, spec)["test"])
        try:
            located = locate(bbox.words_by_page(xml), bbox.page_sizes(xml),
                             spec["module_structure"])
            problems = check(located)
            counts = {(m["section"], m["module"]): len(m["anchors"]) for m in located}
        except ValueError as exc:
            problems, counts = [str(exc)], {}
        print(f"test {entry['test_no']:>2}: {counts} {'OK' if not problems else 'MISMATCH'}")
        for problem in problems:
            print(f"    {problem}")
        failed += bool(problems)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
