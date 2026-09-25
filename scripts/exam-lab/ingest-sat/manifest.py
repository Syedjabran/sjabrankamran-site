"""The source material, and proof that it is actually on disk."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / "practice-tests" / "extracted"
MANIFEST = HERE / "manifest.json"


def load() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def bundle_paths(entry: dict, spec: dict) -> dict[str, Path]:
    """The three PDFs for one manifest entry, keyed by role."""
    base = RAW / entry["dir"]
    return {
        role: base / pattern.format(n=entry["test_no"])
        for role, pattern in spec["file_pattern"].items()
    }


def missing() -> list[str]:
    """Every manifest-declared file that is not on disk.

    Empty is the expected state. A non-empty list must fail a run rather
    than let it quietly ingest fewer tests than the manifest promises --
    silently shipping 7 of 8 tests is the failure mode this exists to stop.
    """
    spec = load()
    gaps: list[str] = []
    for entry in spec["practice_tests"]:
        for role, path in bundle_paths(entry, spec).items():
            if not path.exists():
                gaps.append(f"test {entry['test_no']} {role}: {path}")
    return gaps
