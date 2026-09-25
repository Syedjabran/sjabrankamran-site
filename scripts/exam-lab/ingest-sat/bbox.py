"""Shared `pdftotext -bbox` reading for every SAT corpus.

Plan 1 read the question-bank exports with ElementTree directly and that was
fine, because those exports happen to be clean. The practice-test scoring
guides are not: they carry XML-illegal control characters in the text layer
(11 BEL bytes in test 4's guide alone), and ElementTree rejects the *entire
document* over one of them -- not the offending word, the whole file.
Sanitising here means both corpora go through one reader with one decode
policy, instead of the question-bank path quietly being the only one that
works.
"""
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

import poppler

# XML 1.0 forbids the C0 controls except tab, newline and carriage return.
# They carry no textual meaning here -- they are artefacts of the PDF's text
# layer -- so they are dropped and the word they were attached to is kept.
_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_XMLNS = re.compile(r'\sxmlns="[^"]+"')


def bbox_xml(pdf: Path) -> str:
    """`pdftotext -bbox` output for `pdf`, decoded strict UTF-8.

    `encoding="utf-8"` is required, not optional: `text=True` alone decodes
    with `locale.getpreferredencoding()` (cp1252 on this machine), which
    raises on real pages (byte 0x9d on math export page 255) and silently
    mangles others. Same policy as plan 1.
    """
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "b.xml"
        subprocess.run(
            [poppler.tool("pdftotext"), "-bbox", str(pdf), str(out)],
            check=True, capture_output=True, encoding="utf-8",
        )
        return out.read_text(encoding="utf-8")


def parse(xml_text: str) -> ET.Element:
    """Root element, control characters removed and the XHTML namespace
    stripped. `iter("page")` silently matches nothing against a namespaced
    document -- every tag is `{http://www.w3.org/1999/xhtml}page` -- so the
    namespace must go before any traversal.
    """
    return ET.fromstring(_XMLNS.sub("", _ILLEGAL.sub("", xml_text), count=1))


def words_by_page(xml_text: str) -> dict[int, list[dict]]:
    pages: dict[int, list[dict]] = {}
    for pageno, page in enumerate(parse(xml_text).iter("page"), start=1):
        pages[pageno] = [
            {
                "text": (w.text or "").strip(),
                "left": float(w.get("xMin")), "top": float(w.get("yMin")),
                "right": float(w.get("xMax")), "bottom": float(w.get("yMax")),
            }
            for w in page.iter("word")
        ]
    return pages


def page_sizes(xml_text: str) -> dict[int, tuple[float, float]]:
    return {
        pageno: (float(p.get("width")), float(p.get("height")))
        for pageno, p in enumerate(parse(xml_text).iter("page"), start=1)
    }
