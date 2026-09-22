"""Emit src/lib/sat/question-bank.json, refusing to ship an unverifiable row.

This is the last gate before shipping: every row extract_sat.py produced is
re-checked here against the `SATQuestion` contract
(docs/superpowers/specs/2026-09-22-sat-module-design.md section 5.2) before
it is allowed to reach the site's bank file, independent of whether
extract_sat.py's own logic happened to get it right.
"""
import argparse
import json
from pathlib import Path

REQUIRED = ("id", "section", "domain", "skill", "difficulty", "answer", "img", "ref", "source")
REPO = Path(__file__).resolve().parents[3]
DEST = REPO / "src" / "lib" / "sat" / "question-bank.json"

SECTIONS = {"rw", "math"}
DIFFICULTIES = {"E", "M", "H"}
# Hard-coded here on purpose, NOT imported from parse_qbank.DOMAIN_SLUGS --
# this is meant to be an independent cross-check of what extract_sat.py
# already produced, not an extension of the same code path. Importing the
# same constants would mean a typo in parse_qbank's own vocabulary passes
# both sides of the gate silently; duplicating the 8 values here is what
# makes this a real, independent verification instead of trusting upstream
# by construction (see docs/superpowers/specs/2026-09-22-sat-module-design.md
# section 5.2 for the canonical SATDomain list this mirrors).
DOMAINS = {
    "information-ideas", "craft-structure", "expression-ideas", "standard-english",
    "algebra", "advanced-math", "psda", "geometry-trig",
}


def validate(rows: list[dict]) -> None:
    seen: set[str] = set()
    for row in rows:
        for field in REQUIRED:
            if field not in row:
                raise ValueError(f"{row.get('id', '?')}: missing field {field}")
        if row["id"] in seen:
            raise ValueError(f"duplicate id {row['id']}")
        seen.add(row["id"])
        if row["section"] not in SECTIONS:
            raise ValueError(f"{row['id']}: unknown section {row['section']!r}")
        if row["difficulty"] not in DIFFICULTIES:
            raise ValueError(f"{row['id']}: unknown difficulty {row['difficulty']!r}")
        if row["domain"] not in DOMAINS:
            raise ValueError(f"{row['id']}: unknown domain {row['domain']!r}")
        if not row["img"]:
            raise ValueError(f"{row['id']}: no image")
        if not row["img"].startswith("sat/"):
            raise ValueError(f"{row['id']}: image outside the sat/ prefix")
        ans = row["answer"]
        # Checked before any .get() call below: a malformed (non-dict)
        # answer must fail with this gate's own ValueError, not a confusing
        # AttributeError from calling .get() on something that isn't a dict.
        if not isinstance(ans, dict):
            raise ValueError(f"{row['id']}: answer must be an object, got {type(ans).__name__}")
        # `ans` may carry a `source` key (answer-line/rationale/entry-note/
        # rationale-stated) alongside `kind` -- that's parse_qbank's audit
        # trail for how the answer was established, not part of this
        # contract, so it is neither required nor stripped here.
        correct = ans.get("correct")
        # bool is a subclass of int in Python (isinstance(True, int) is
        # True), so `correct: true` must be rejected explicitly rather than
        # slipping through as a "valid" index.
        if ans.get("kind") == "mcq" and (not isinstance(correct, int) or isinstance(correct, bool)):
            raise ValueError(f"{row['id']}: mcq answer has no index")
        if ans.get("kind") == "spr" and not ans.get("accepted"):
            raise ValueError(f"{row['id']}: spr answer has no accepted values")
        if ans.get("kind") not in ("mcq", "spr"):
            raise ValueError(f"{row['id']}: unknown answer kind")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", help="JSON produced by extract_sat.py")
    ap.add_argument(
        "--out", default=str(DEST),
        help="output path (default: src/lib/sat/question-bank.json); "
             "pass an out/ path to verify a build without touching the real bank",
    )
    args = ap.parse_args()
    rows = json.loads(Path(args.rows).read_text(encoding="utf-8"))
    validate(rows)
    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(rows, indent=1), encoding="utf-8")
    print(f"wrote {dest} ({len(rows)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
