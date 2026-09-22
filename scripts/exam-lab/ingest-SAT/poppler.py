"""Absolute-path poppler resolution.

The Xpdf 4.00 build on this machine's PATH also answers to `pdftotext` but
emits a different `-bbox` XML layout, which would produce crops that look
almost right. Every call therefore goes through an absolute path into the
conda poppler, and `preflight()` refuses to run against anything else.
"""
import os
import subprocess
from pathlib import Path

POPPLER_BIN = Path(
    os.environ.get("POPPLER_BIN", r"C:/Users/Baqir/miniconda3/Library/bin")
)

ALLOWED = {"pdftotext", "pdftoppm", "pdfinfo"}
MIN_VERSION = (22, 0)


def tool(name: str) -> str:
    """Absolute path to a poppler binary."""
    if name not in ALLOWED:
        raise ValueError(f"not a poppler tool: {name}")
    exe = POPPLER_BIN / (name + (".exe" if os.name == "nt" else ""))
    if not exe.exists():
        raise RuntimeError(
            f"{name} not found at {exe}. Install with: conda install -c conda-forge poppler"
        )
    return str(exe)


def _version(name: str) -> tuple[str, tuple[int, int]]:
    out = subprocess.run([tool(name), "-v"], capture_output=True, text=True)
    text = (out.stderr or "") + (out.stdout or "")
    # Check if it's poppler first (includes "Poppler Developers" or poppler URL)
    if "Poppler" in text or "poppler.freedesktop.org" in text:
        # It's poppler, parse version
        try:
            nums = text.split("version", 1)[1].strip().split()[0].split(".")
            return text, (int(nums[0]), int(nums[1]))
        except (IndexError, ValueError):
            raise RuntimeError(f"{name} did not identify as poppler: {text.strip()[:120]}")
    # Not poppler, check if it's Xpdf
    if "Glyph & Cog" in text or "Xpdf" in text:
        raise RuntimeError(
            f"{name} at {POPPLER_BIN} is the Xpdf build, not poppler. "
            "Its -bbox output differs and would corrupt crops."
        )
    if "poppler" not in text.lower():
        raise RuntimeError(f"{name} did not identify as poppler: {text.strip()[:120]}")
    nums = text.split("version", 1)[1].strip().split()[0].split(".")
    return text, (int(nums[0]), int(nums[1]))


def preflight() -> None:
    """Assert both binaries are poppler and new enough. Call before any page work."""
    for name in ("pdftotext", "pdftoppm"):
        _, ver = _version(name)
        if ver < MIN_VERSION:
            raise RuntimeError(f"{name} is poppler {ver}, need >= {MIN_VERSION}")
