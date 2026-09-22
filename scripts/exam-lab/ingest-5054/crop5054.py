#!/usr/bin/env python3
"""
Exact-image cropping for Cambridge O Level 5054 past papers.

Adapted from the 9702 pipeline's crop_questions.py (pdftotext -bbox anchors +
pdftoppm rasterisation, crop the region between consecutive question anchors,
stitching across page breaks). Three 5054-specific corrections were needed:

  1. LANDSCAPE mark-scheme pages. The 2024 5054 mark schemes declare an A4
     portrait MediaBox but carry /Rotate, so pdftoppm emits a landscape raster
     while the -bbox <page width/height> attributes still report the portrait
     MediaBox. Page geometry is therefore always taken from the RENDERED image,
     never from the bbox header.
  2. ROTATED-CONTENT pages. The 2023 specimen mark scheme (5054_sp23_ms_2.pdf)
     has no /Rotate at all: the landscape table is drawn 90 deg rotated onto a
     portrait page, so pdftoppm renders it sideways. Detected from word aspect
     ratios and corrected by rotating the raster 90 deg clockwise and mapping
     word coordinates (x, y) -> (page_height - y, x).
  3. BLANK tail pages. 5054 theory papers end with "BLANK PAGE" / copyright
     pages. The final question's crop is bounded at the last page carrying real
     question text instead of running to the end of the PDF.

Nothing here is 5054-specific beyond the constants, so new sessions can be added
to papers.json without touching this file.
"""
import re
import os
import html
import subprocess

from PIL import Image, ImageChops

RES = 150
SCALE = RES / 72.0
LEFT_MIN = 40        # points: reject barcode/margin junk digits left of the text block
LEFT_MAX = 95        # points: question numbers sit in the left margin
FOOTER_TRIM = 46     # points trimmed off page bottoms (UCLES footer)
HEADER_TRIM = 34     # points trimmed off page tops (running header)
ART_LEFT = 34        # points: below this is barcode / rule / dotted-line margin art

# Boilerplate that can occupy a page on its own. Stripped before deciding
# whether a page still carries question content: the final content page of a
# 5054 paper normally carries the copyright notice UNDER the last question, so
# "contains the notice" is not by itself evidence that the page is blank.
BOILERPLATE = [
    re.compile(r"BLANK PAGE", re.I),
    re.compile(r"Permission to reproduce.*?earliest possible opportunity\.", re.S | re.I),
    re.compile(r"To avoid the issue of disclosure.*?examination series\.", re.S | re.I),
    re.compile(r"Cambridge Assessment International Education is part of.*?Cambridge\.", re.S | re.I),
    re.compile(r"Cambridge University Press & Assessment[^\n]*", re.I),
    re.compile(r"©\s*UCLES[^\n]*", re.I),
    re.compile(r"5054/\d+[A-Z/\d]*", re.I),
    re.compile(r"\[Turn over", re.I),
]


def parse_bbox(pdf):
    """[(declared_w, declared_h, words, rotated)] — one entry per page.

    `words` are (x0, y0, x1, y1, text) in the PDF's own text space. `rotated` is
    True when the text is drawn 90 deg rotated relative to the raster pdftoppm
    produces (see module docstring, case 2).
    """
    out = f"/tmp/_bbox5054_{os.getpid()}.html"
    subprocess.run(["pdftotext", "-bbox", pdf, out], check=True)
    xml = open(out, encoding="utf-8").read()
    os.unlink(out)
    pages = []
    for pm in re.finditer(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', xml, re.S):
        w, h, body = float(pm.group(1)), float(pm.group(2)), pm.group(3)
        words = []
        for wm in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', body):
            x0, y0, x1, y1 = map(float, wm.groups()[:4])
            txt = html.unescape(wm.group(5))
            words.append((x0, y0, x1, y1, txt))
        pages.append((w, h, words, _content_rotated(words)))
    return pages


def _content_rotated(words):
    """True when most multi-character words are taller than they are wide."""
    tall = wide = 0
    for (x0, y0, x1, y1, txt) in words:
        if len(txt.strip()) < 4:
            continue
        w, h = x1 - x0, y1 - y0
        if h <= 0 or w <= 0:
            continue
        if h > w * 1.6:
            tall += 1
        elif w > h * 1.6:
            wide += 1
    return tall > wide and tall >= 5


def unrotate(pages):
    """Map rotated pages into upright space: (x, y) -> (page_h - y, x)."""
    out = []
    for (w, h, words, rot) in pages:
        if not rot:
            out.append((w, h, words, False))
            continue
        nw = [(h - y1, x0, h - y0, x1, t) for (x0, y0, x1, y1, t) in words]
        out.append((h, w, nw, True))
    return out


def page_is_blank(words):
    """True when a page carries no question text once boilerplate is removed."""
    text = " ".join(t for (_, _, _, _, t) in words)
    for pat in BOILERPLATE:
        text = pat.sub(" ", text)
    text = re.sub(r"[\s\d.]+", " ", text)
    return len(text.strip()) < 60


def last_content_page(pages):
    i = len(pages) - 1
    while i > 0 and page_is_blank(pages[i][2]):
        i -= 1
    return i


def notice_top(words):
    """y of the 'Permission to reproduce ...' copyright block, or None.

    The last question of a paper shares its page with that block; bounding the
    final crop above it keeps the shipped image to the question itself.
    """
    ys = [y0 for (x0, y0, x1, y1, t) in words if t.strip() == "Permission"]
    return min(ys) if ys else None


def _starts_question(words, x1, y0):
    """True if a word just to the right on the same line starts a question
    (capitalised word or '(a)'), which excludes header noise like '1 hour'."""
    for (wx0, wy0, wx1, wy1, wtxt) in words:
        if abs(wy0 - y0) < 6 and x1 <= wx0 < x1 + 140 and wtxt.strip():
            t = wtxt.strip()
            return t[0].isupper() or t.startswith("(")
    return False


def _is_leftmost(words, x0, y0):
    """True if no real word sits to the left of this token on the same text line.
    Rejects cover/front-matter false anchors such as 'Paper 1 Multiple Choice'."""
    for (wx0, wy0, wx1, wy1, wtxt) in words:
        if wtxt.strip() and abs(wy0 - y0) < 6 and ART_LEFT < wx0 < x0 - 2:
            return False
    return True


def find_anchors(pages, nmax):
    """[(qnum, page_idx, y_top_points)] for question-paper pages, in order."""
    anchors = []
    expected = 1
    for pi, (w, h, words, rot) in enumerate(pages):
        for (x0, y0, x1, y1, txt) in sorted(words, key=lambda t: (t[1], t[0])):
            if expected > nmax:
                break
            if (LEFT_MIN <= x0 < LEFT_MAX and txt.strip() == str(expected)
                    and _is_leftmost(words, x0, y0) and _starts_question(words, x1, y0)):
                anchors.append((expected, pi, y0))
                expected += 1
    return anchors


def find_ms_anchors(pages, nmax):
    """[(qnum, page_idx, y_top_points)] for mark-scheme answer tables.

    Anchors on the Question-column label of each question's first row: '3(a)(i)'
    on structured papers, or a bare '4' where a question has no lettered parts
    (5054/41 2024 Q4). Only pages carrying a real 'Question / Answer / Marks'
    table header are searched, so the numbered Generic Marking Principles on the
    mark scheme's front matter can never be mistaken for a question.
    """
    anchors = []
    expected = 1
    for pi, (w, h, words, rot) in enumerate(pages):
        head = [t for t in words if t[4].strip() == "Question"]
        if not head:
            continue
        col_x = min(t[0] for t in head)
        for (x0, y0, x1, y1, txt) in sorted(words, key=lambda t: (t[1], t[0])):
            if expected > nmax:
                break
            s = txt.strip()
            if not (col_x - 12 <= x0 <= col_x + 90):
                continue
            if re.match(rf"^{expected}\(", s) or s == str(expected):
                anchors.append((expected, pi, y0))
                expected += 1
    return anchors


def render_pages(pdf, tag, pages):
    """Rasterise, correcting sideways pages. Returns [PIL.Image] upright."""
    d = f"/tmp/pp5054/pg_{tag}"
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        os.unlink(os.path.join(d, f))
    subprocess.run(["pdftoppm", "-png", "-r", str(RES), pdf, f"{d}/p"], check=True)
    paths = sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith(".png"))
    imgs = []
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB")
        if i < len(pages) and pages[i][3]:
            im = im.rotate(-90, expand=True)  # clockwise
        imgs.append(im)
    return imgs


def page_height_pts(img):
    return img.height / SCALE


def crop_question(imgs, a, a_next, last_page, end_notice=None):
    """Crop one question, stitching across page breaks. Geometry comes from the
    rendered images so rotated/landscape pages are handled transparently."""
    qn, pi, y0 = a
    top = int((y0 - 6) * SCALE)
    if a_next and a_next[1] == pi:
        bot = int((a_next[2] - 4) * SCALE)
        return imgs[pi].crop((0, max(0, top), imgs[pi].width, min(imgs[pi].height, bot)))
    # `last_page` can never precede the anchor's own page: a question that opens
    # on the final content page must not wrap backwards into earlier pages.
    end_pi = a_next[1] if a_next else max(pi, last_page)
    if a_next:
        end_y = int((a_next[2] - 4) * SCALE)
    else:
        bottom = page_height_pts(imgs[end_pi]) - FOOTER_TRIM
        if end_notice is not None:
            bottom = min(bottom, end_notice - 8)
        end_y = int(bottom * SCALE)
    slices = []
    first_bot = int((page_height_pts(imgs[pi]) - FOOTER_TRIM) * SCALE)
    if a_next is None and end_pi == pi:
        first_bot = min(first_bot, end_y)
    slices.append(imgs[pi].crop((0, max(0, top), imgs[pi].width, first_bot)))
    for mp in range(pi + 1, end_pi):
        ht = int(HEADER_TRIM * SCALE)
        fb = int((page_height_pts(imgs[mp]) - FOOTER_TRIM) * SCALE)
        slices.append(imgs[mp].crop((0, ht, imgs[mp].width, fb)))
    if end_pi != pi:
        ht = int(HEADER_TRIM * SCALE)
        slices.append(imgs[end_pi].crop((0, ht, imgs[end_pi].width, max(ht + 1, end_y))))
    W = max(s.width for s in slices)
    H = sum(s.height for s in slices)
    canvas = Image.new("RGB", (W, H), "white")
    y = 0
    for s in slices:
        canvas.paste(s, (0, y))
        y += s.height
    return canvas


def trim_white(im, pad=10):
    bg = Image.new("RGB", im.size, "white")
    bb = ImageChops.difference(im, bg).getbbox()
    if not bb:
        return im
    l, t, r, b = bb
    return im.crop((max(0, l - pad), max(0, t - pad),
                    min(im.width, r + pad), min(im.height, b + pad)))
