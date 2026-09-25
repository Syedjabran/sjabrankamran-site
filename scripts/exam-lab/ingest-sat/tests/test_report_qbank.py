import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import report_qbank
from report_qbank import text_of


def test_text_of_uses_strict_utf8_decoding_not_lenient(tmp_path, monkeypatch):
    """report_qbank.py used to read cached .txt files with errors="ignore",
    unlike crop_qbank.py's strict UTF-8 decode of the same corpus -- so
    corruption in the rationale text this module ships would be silently
    dropped instead of failing loudly. The corpus is verified clean (0
    U+FFFD), so this only matters for a future file; simulate one with an
    invalid UTF-8 byte and confirm it now raises instead of mangling text.
    """
    monkeypatch.setattr(report_qbank, "OUT", tmp_path)
    cache = tmp_path / "broken.txt"
    cache.write_bytes(b"Rationale: The correct answer is 2.6\xff broken byte")

    with pytest.raises(UnicodeDecodeError):
        text_of(Path("broken.pdf"))  # stem "broken" -> matches the cached file above
