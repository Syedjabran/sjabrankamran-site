"""Emit src/lib/sat/practice-tests.json, refusing anything unverifiable.

The last gate for the practice tests, and deliberately the same shape as
build_sat_bank.py: re-validate every row independently of the code that
produced it, and refuse to build from a rows.json whose images were never
uploaded. `check_provenance` is imported from build_sat_bank rather than
copied -- one dry-run/live gate, one behaviour, one place to fix it.

The extra rules here: spec section 10.5 -- a practice test ships only with
its own ingested conversion table, whole. Without one there is no official
score, and an official practice test that cannot be scored officially is
not the product this module promises. And spec 10.4 -- a test ships whole:
every module holds exactly its printed questions (33/33/27/27), re-checked
here rather than trusted from extract_tests.py, and every MCQ answer is an
index into its four options.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sat_bank import check_provenance  # noqa: F401  (re-exported for tests)
from parse_scoring import RAW_MAX  # the official raw-score range, not hardcoded here

REPO = Path(__file__).resolve().parents[3]
DEST = REPO / "src" / "lib" / "sat" / "practice-tests.json"
REQUIRED = ("test_no", "section", "module", "qnum", "answer", "img", "ref", "source")
SECTIONS = {"rw", "math"}
MODULES = {1, 2}
MCQ_OPTIONS = 4  # A-D
# Questions per module on the paper tests: Reading and Writing 33 + 33,
# Math 27 + 27. A section's raw-score ceiling IS its question count, so this
# comes from parse_scoring's RAW_MAX (split evenly over the two modules)
# rather than being restated, and not from extract_tests.py's own reading
# of the printed module headers -- this gate is meant to be independent.
MODULE_QUESTIONS = {
    (section, module): raw_max // len(MODULES)
    for section, raw_max in RAW_MAX.items() for module in sorted(MODULES)
}


def _check_table_complete(test_no: int, table: dict) -> None:
    """Spec 10.5's table check is not just "does one exist" (that's the
    per-row check above) but "is it whole": every raw score from 0 to the
    section's max, each mapped to an [lo, hi] pair of ints with lo <= hi.
    RAW_MAX is imported from parse_scoring rather than hardcoded 66/54 here
    -- one place owns the official raw-score range.

    Run once per test, after every row has been checked, not inline in the
    per-row loop: an incomplete table on a test whose rows also fail an
    earlier, unrelated check (duplicate slot, bad img prefix, ...) must
    surface that earlier failure first, not this one.
    """
    for section, raw_max in RAW_MAX.items():
        band = table.get(section) or {}
        expected = {str(i) for i in range(raw_max + 1)}
        if set(band) != expected:
            missing = sorted(expected - set(band), key=int)
            extra = sorted(set(band) - expected, key=int)
            raise ValueError(
                f"test {test_no} {section}: conversion table incomplete -- "
                f"expected raw scores 0-{raw_max} (spec 10.5); "
                f"missing {missing}, extra {extra}"
            )
        for raw, bounds in band.items():
            malformed = (
                not isinstance(bounds, (list, tuple)) or len(bounds) != 2
                or not all(isinstance(b, int) and not isinstance(b, bool) for b in bounds)
            )
            if malformed:
                raise ValueError(f"test {test_no} {section} raw {raw}: malformed bound {bounds!r}")
            lo, hi = bounds
            if lo > hi:
                raise ValueError(f"test {test_no} {section} raw {raw}: lower {lo} above upper {hi}")


def validate(rows: list[dict], scoring: dict) -> None:
    seen: set[tuple] = set()
    for row in rows:
        for field in REQUIRED:
            if field not in row:
                raise ValueError(f"{row.get('ref', '?')}: missing field {field}")
        slot = (row["test_no"], row["section"], row["module"], row["qnum"])
        if slot in seen:
            raise ValueError(f"duplicate question slot {slot}")
        seen.add(slot)
        if row["section"] not in SECTIONS:
            raise ValueError(f"{slot}: unknown section {row['section']!r}")
        if row["module"] not in MODULES:
            raise ValueError(f"{slot}: unknown module {row['module']!r}")
        if not str(row["img"]).startswith("sat/"):
            raise ValueError(f"{slot}: image outside the sat/ prefix")
        answer = row["answer"]
        if not isinstance(answer, dict) or answer.get("kind") not in ("mcq", "spr"):
            raise ValueError(f"{slot}: unknown answer kind")
        correct = answer.get("correct")
        # bool is a subclass of int in Python (isinstance(True, int) is
        # True), so `correct: true` must be rejected explicitly rather than
        # slipping through as a "valid" index (mirrors build_sat_bank.py).
        if answer["kind"] == "mcq" and (not isinstance(correct, int) or isinstance(correct, bool)):
            raise ValueError(f"{slot}: mcq answer has no index")
        if answer["kind"] == "mcq" and not 0 <= correct < MCQ_OPTIONS:
            raise ValueError(f"{slot}: mcq answer index {correct} is outside 0-{MCQ_OPTIONS - 1}")
        if answer["kind"] == "spr" and not answer.get("accepted"):
            raise ValueError(f"{slot}: spr answer has no accepted values")
        if str(row["test_no"]) not in scoring:
            raise ValueError(
                f"test {row['test_no']}: no conversion table -- an official "
                "practice test cannot ship without the table that makes its "
                "score official (spec 10.5)"
            )

    for test_no in sorted({r["test_no"] for r in rows}):
        _check_test_whole(test_no, rows)
        _check_table_complete(test_no, scoring[str(test_no)])


def _check_test_whole(test_no: int, rows: list[dict]) -> None:
    """Spec 10.4: every module of the test holds exactly questions 1..N of
    its printed size (MODULE_QUESTIONS) -- a test missing one question, or
    carrying one past the end, is not the paper its conversion table
    scores. Duplicates were already refused per row."""
    for (section, module), size in MODULE_QUESTIONS.items():
        got = {r["qnum"] for r in rows
               if r["test_no"] == test_no and r["section"] == section and r["module"] == module}
        want = set(range(1, size + 1))
        if got != want:
            missing = sorted(want - got)
            extra = sorted(got - want)
            raise ValueError(
                f"test {test_no} {section} module {module}: expected questions 1-{size} "
                f"(spec 10.4); missing {missing}, extra {extra}"
            )


def check_timings(rows: list[dict], timings: dict) -> None:
    """Every shipped test carries the four module limits printed on its own
    paper (spec 12) -- {"rw": [m1, m2], "math": [m1, m2]}, positive ints."""
    for test_no in sorted({r["test_no"] for r in rows}):
        t = timings.get(str(test_no))
        ok = (isinstance(t, dict) and set(t) == {"rw", "math"}
              and all(isinstance(v, list) and len(v) == 2
                      and all(isinstance(m, int) and 0 < m <= 180 for m in v) for v in t.values()))
        if not ok:
            raise ValueError(f"test {test_no}: module time limits missing or malformed: {t!r}")


def to_client(row: dict) -> dict:
    """The SATTestQuestion shape src/lib/sat/types.ts declares (camelCase testNo)."""
    return {"testNo": row["test_no"], "section": row["section"], "module": row["module"],
            "qnum": row["qnum"], "answer": row["answer"], "img": row["img"],
            "ref": row["ref"], "source": row["source"]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", help="rows.json produced by extract_tests.py")
    ap.add_argument("--out", default=str(DEST))
    ap.add_argument("--allow-dry-run", action="store_true")
    args = ap.parse_args()

    rows_path = Path(args.rows)
    rows = json.loads(rows_path.read_text(encoding="utf-8"))
    scoring = json.loads(rows_path.with_name("scoring.json").read_text(encoding="utf-8"))
    timings = json.loads(rows_path.with_name("timings.json").read_text(encoding="utf-8"))
    # Practice-test rows carry no `id` -- extract_tests.py's uploaded.json
    # records the bucket key (the row's `img`) that was actually confirmed
    # uploaded, so that is this row's identity for the live-branch check.
    check_provenance(rows, rows_path, allow_dry_run=args.allow_dry_run, key=lambda row: row["img"])
    validate(rows, scoring)
    check_timings(rows, timings)

    by_test: dict[int, list[dict]] = {}
    for row in rows:
        by_test.setdefault(row["test_no"], []).append(row)
    payload = {
        "tests": [
            {
                "testNo": test_no,
                "questions": [to_client(r) for r in sorted(items, key=lambda r: (r["section"], r["module"], r["qnum"]))],
                "conversion": scoring[str(test_no)],
                "minutes": timings[str(test_no)],
            }
            for test_no, items in sorted(by_test.items())
        ]
    }
    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"wrote {dest} ({len(by_test)} tests, {len(rows)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
