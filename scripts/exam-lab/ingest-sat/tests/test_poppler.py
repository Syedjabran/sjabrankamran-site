import subprocess
import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import poppler


def test_tool_returns_absolute_path():
    p = poppler.tool("pdftotext")
    assert Path(p).is_absolute()
    assert Path(p).exists()


def test_tool_rejects_unknown_binary():
    with pytest.raises(ValueError):
        poppler.tool("rm")


def test_preflight_accepts_real_poppler():
    poppler.preflight()  # must not raise


def test_preflight_rejects_xpdf(monkeypatch):
    def fake(cmd, **kw):
        return subprocess.CompletedProcess(
            cmd, 0, stderr="pdftotext version 4.00\nCopyright 1996-2017 Glyph & Cog, LLC\n", stdout=""
        )
    monkeypatch.setattr(poppler.subprocess, "run", fake)
    with pytest.raises(RuntimeError, match="Xpdf"):
        poppler.preflight()
