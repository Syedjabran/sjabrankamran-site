import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bbox

# Real `pdftotext -bbox` output for a scoring guide contains BEL (0x07),
# which is not a legal XML 1.0 character. Confirmed on test 4's guide: 11 of
# them, and ElementTree refuses the WHOLE document over one ("not
# well-formed (invalid token)"), so every page is lost, not just the word.
WITH_CONTROL_CHARS = (
    '<?xml version="1.0"?>\n<html><body>\n<page width="612" height="792">\n'
    '<word xMin="58.5" yMin="123.0" xMax="70.3" yMax="140.9">\x07In</word>\n'
    '<word xMin="80.0" yMin="123.0" xMax="95.0" yMax="140.9">April</word>\n'
    "</page>\n</body></html>\n"
)


def test_parse_survives_xml_illegal_control_characters():
    words = bbox.words_by_page(WITH_CONTROL_CHARS)[1]
    assert [w["text"] for w in words] == ["In", "April"]


def test_the_word_carrying_the_control_char_is_kept_not_dropped():
    """The BEL is noise in the text layer, not a word boundary. Stripping the
    character must not strip the word it was attached to -- losing 'In' would
    silently shift every downstream anchor."""
    first = bbox.words_by_page(WITH_CONTROL_CHARS)[1][0]
    assert first["left"] == 58.5 and first["bottom"] == 140.9


def test_page_sizes_are_read_from_the_page_element():
    assert bbox.page_sizes(WITH_CONTROL_CHARS) == {1: (612.0, 792.0)}
