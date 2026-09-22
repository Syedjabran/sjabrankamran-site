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


def validate(rows: list[dict]) -> None:
    seen: set[str] = set()
    for row in rows:
        for field in REQUIRED:
            if field not in row:
                raise ValueError(f"{row.get('id', '?')}: missing field {field}")
        if row["id"] in seen:
            raise ValueError(f"duplicate id {row['id']}")
        seen.add(row["id"])
        if not row["img"]:
            raise ValueError(f"{row['id']}: no image")
        if not row["img"].startswith("sat/"):
            raise ValueError(f"{row['id']}: image outside the sat/ prefix")
        ans = row["answer"]
        # `ans` may carry a `source` key (answer-line/rationale/entry-note/
        # rationale-stated) alongside `kind` -- that's parse_qbank's audit
        # trail for how the answer was established, not part of this
        # contract, so it is neither required nor stripped here.
        if ans.get("kind") == "mcq" and not isinstance(ans.get("correct"), int):
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
