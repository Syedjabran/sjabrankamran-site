"""Crop, upload and emit metadata for all 8 official practice tests.

Structurally the same run as extract_sat.py, and it reuses that module's
resumability and upload machinery wholesale. The difference is the failure
policy. The question bank ships whatever it can verify and reports the rest,
because a bank is a pool. A practice test is a *form*: shipping 32 of its 33
Reading and Writing questions would put a broken test in front of a student
and then score it against a conversion table built for 33. So spec section
10.4 applies here -- a test that does not come out whole is dropped whole,
and the run says so.

Emits, next to --out:
  rows.json      one row per question of every complete test
  skipped.json   every dropped test and every unresolved question, with why
  scoring.json   the conversion tables, keyed by test number
  uploaded.json  ids confirmed uploaded (resume)
  mode.json      {"dry_run": bool} -- the provenance gate reads this
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bbox
import crop_tests
import manifest
import parse_answers
import parse_scoring
import poppler
from extract_sat import _atomic_write_text, _load_uploaded, _record_uploaded, _upload_with_retry
from upload import preflight_credentials, test_bucket_path

HERE = Path(__file__).resolve().parent
CROPS = HERE / "out" / "crops" / "tests"  # mirrors the bucket key sat/tests/<n>/…


def build_row(*, test_no: int, section: str, module: int, qnum: int,
              answers: dict, img: str) -> dict:
    """One shippable row. Raises KeyError when no official answer exists --
    integrity rule 1 means a question without one is never emitted."""
    answer = answers[(section, module, qnum)]
    return {
        "test_no": test_no, "section": section, "module": module, "qnum": qnum,
        "answer": answer,
        "img": img,
        "ref": f"SAT Practice Test {test_no} {section.upper()} Module {module} Q{qnum}",
        "source": "practice-test",
    }


def check_test_complete(test_no: int, rows: list[dict], structure: list[dict]) -> list[str]:
    """Spec 10.4 in one function: every module must be present in full."""
    problems = []
    for mod in structure:
        got = {r["qnum"] for r in rows
               if r["section"] == mod["section"] and r["module"] == mod["module"]}
        want = set(range(1, mod["questions"] + 1))
        if got != want:
            problems.append(
                f"test {test_no} {mod['section']} module {mod['module']}: "
                f"expected {mod['questions']} questions, got {len(got)} "
                f"(missing {sorted(want - got)[:5]})"
            )
    return problems


MINUTES = re.compile(r"(Reading and Writing|Math), Module ([12]): (\d+) minutes")


def module_minutes(text: str) -> dict | None:
    """{"rw": [m1, m2], "math": [m1, m2]} as printed on the paper, or None
    unless all four limits parse and each module prints one value."""
    found: dict[tuple[str, int], set[int]] = {}
    for name, module, mins in MINUTES.findall(text):
        section = "rw" if name == "Reading and Writing" else "math"
        found.setdefault((section, int(module)), set()).add(int(mins))
    keys = [("rw", 1), ("rw", 2), ("math", 1), ("math", 2)]
    if any(len(found.get(k, ())) != 1 for k in keys):
        return None
    return {sec: [next(iter(found[(sec, 1)])), next(iter(found[(sec, 2)]))] for sec in ("rw", "math")}


def ingest_test(entry: dict, spec: dict, *, dry_run: bool, uploaded: set[str],
                uploaded_path: Path) -> tuple[list[dict], list[dict], dict, dict | None]:
    """(rows, skipped, tables, minutes) for one test. Rows and minutes are
    returned only if the test is complete; an incomplete test returns no rows
    and one skip entry naming every gap. `tables` is returned whenever the
    conversion tables pass their own checks."""
    paths = manifest.bundle_paths(entry, spec)
    test_no = entry["test_no"]

    answers, rejected = parse_answers.parse_answers(parse_answers.text_of(paths["answers"]))
    # reviewed.json's hand-verified keys ship over the parse (test 6 depends on them).
    answers, rejected, stale = parse_answers.apply_overrides(answers, rejected, test_no)
    for note in stale:
        print(f"  note: reviewed.json override no longer needed -- {note}")
    tables = parse_scoring.tables_for(paths["scoring"])

    skipped = [{"test_no": test_no, "stage": "answers", **r} for r in rejected]
    table_problems = parse_scoring.check_tables(tables, test=test_no)
    for problem in table_problems:
        skipped.append({"test_no": test_no, "stage": "scoring", "reason": problem})
    # A test that fails the question gate is not sittable, but its conversion
    # table is official data parsed from the scoring guide on its own and still
    # feeds the estimate -- unless the table itself failed its checks.
    tables = {} if table_problems else tables

    xml = bbox.bbox_xml(paths["test"])
    pages, sizes = bbox.words_by_page(xml), bbox.page_sizes(xml)
    minutes = module_minutes(parse_answers.text_of(paths["test"]))
    if minutes is None:
        skipped.append({"test_no": test_no, "stage": "timing",
                        "reason": "the paper's four module time limits did not all parse"})
        return [], skipped, tables, None

    # Crops come from whole modules, never page by page: a module's title page
    # carries its first questions, its STOP page ends it mid-column, and a
    # question can run onto the next page (test 10 Math 1 Q4). The geometry
    # gate runs before anything is rendered.
    try:
        located = crop_tests.locate(pages, sizes, spec["module_structure"])
    except ValueError as e:
        skipped.append({"test_no": test_no, "stage": "geometry", "reason": str(e)})
        return [], skipped, tables, None
    problems = crop_tests.check(located)
    if problems:
        skipped.append({"test_no": test_no, "stage": "geometry", "reason": "; ".join(problems)})
        return [], skipped, tables, None

    rows: list[dict] = []
    for mod in located:
        section, module = mod["section"], mod["module"]
        for i, a in enumerate(mod["anchors"]):
            key = (section, module, a["qnum"])
            if key not in answers:
                skipped.append({"test_no": test_no, "stage": "answer-missing",
                                "section": section, "module": module,
                                "qnum": a["qnum"], "reason": "no-answer"})
                continue
            img = test_bucket_path(test_no, section, module, a["qnum"])
            dest = CROPS / str(test_no) / f"{section}-m{module}-q{a['qnum']}.jpg"
            if not dest.exists():
                crop_tests.render_regions(paths["test"], crop_tests.span(mod["anchors"], i, mod["slots"]), dest)
            if not dry_run and img not in uploaded:
                img = _upload_with_retry(dest, img)
                _record_uploaded(uploaded_path, img, uploaded)
            rows.append(build_row(test_no=test_no, section=section, module=module,
                                  qnum=a["qnum"], answers=answers, img=img))

    problems = check_test_complete(test_no, rows, spec["module_structure"])
    if problems:
        skipped.append({"test_no": test_no, "stage": "structure",
                        "reason": "; ".join(problems)})
        return [], skipped, tables, None
    return rows, skipped, tables, minutes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="crop only, do not upload")
    ap.add_argument("--only", type=int, default=0, help="ingest just this test number")
    ap.add_argument("--out", default=str(HERE / "out" / "tests" / "rows.json"))
    args = ap.parse_args(argv)

    poppler.preflight()
    if not args.dry_run:
        preflight_credentials()
    gaps = manifest.missing()
    if gaps:
        print("ERROR: manifest names files that are not on disk:", file=sys.stderr)
        for g in gaps:
            print(f"  {g}", file=sys.stderr)
        return 1

    out_path = Path(args.out)
    uploaded_path = out_path.with_name("uploaded.json")
    uploaded = _load_uploaded(uploaded_path)
    spec = manifest.load()

    rows: list[dict] = []
    skipped: list[dict] = []
    scoring: dict[str, dict] = {}
    timings: dict[str, dict] = {}
    try:
        for entry in spec["practice_tests"]:
            if args.only and entry["test_no"] != args.only:
                continue
            got, lost, tables, minutes = ingest_test(entry, spec, dry_run=args.dry_run,
                                                     uploaded=uploaded, uploaded_path=uploaded_path)
            rows += got
            skipped += lost
            if tables:
                scoring[str(entry["test_no"])] = tables
            if got:
                timings[str(entry["test_no"])] = minutes
            print(f"test {entry['test_no']}: {len(got)} rows, {len(lost)} issues")
    finally:
        _atomic_write_text(out_path, json.dumps(rows, indent=1))
        _atomic_write_text(out_path.with_name("skipped.json"), json.dumps(skipped, indent=1))
        _atomic_write_text(out_path.with_name("scoring.json"), json.dumps(scoring, indent=1))
        _atomic_write_text(out_path.with_name("timings.json"), json.dumps(timings, indent=1))
        _atomic_write_text(out_path.with_name("mode.json"), json.dumps({"dry_run": args.dry_run}, indent=1))

    print(f"\n  {len(rows)} rows -> {out_path}")
    print(f"  {len(timings)} complete tests, {len(scoring)} conversion tables")
    if skipped:
        hist = collections.Counter(s["stage"] for s in skipped)
        print("  issues:", dict(hist))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
