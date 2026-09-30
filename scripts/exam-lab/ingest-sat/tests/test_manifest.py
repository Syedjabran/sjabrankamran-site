import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import manifest


def test_every_manifest_file_is_on_disk():
    assert manifest.missing() == []


def test_manifest_covers_the_eight_published_tests():
    nums = [e["test_no"] for e in manifest.load()["practice_tests"]]
    assert nums == [4, 5, 6, 7, 8, 9, 10, 11]


def test_module_structure_totals_the_printed_120_questions():
    total = sum(m["questions"] for m in manifest.load()["module_structure"])
    assert total == 120
