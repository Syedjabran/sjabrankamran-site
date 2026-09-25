"""Emit src/lib/sat/question-bank.json, refusing to ship an unverifiable row.

This is the last gate before shipping: every row extract_sat.py produced is
re-checked here against the `SATQuestion` contract
(docs/superpowers/specs/2026-09-22-sat-module-design.md section 5.2) before
it is allowed to reach the site's bank file, independent of whether
extract_sat.py's own logic happened to get it right.

`validate()` checks the *shape* of each row. `check_provenance()` checks
something `validate()` cannot: whether the row's `img` actually exists in
the bucket. extract_sat.py writes a `mode.json` sidecar next to `rows.json`
recording whether that run was `--dry-run` (crop only, nothing ever
uploaded) or live, and `uploaded.json` recording which ids a live run
actually confirmed. Running this against a `--dry-run` rows.json -- e.g. by
mistakenly skipping the live-upload step -- would otherwise accept all of
it and write a bank of image links pointing at bucket objects that were
never created.
"""
import argparse
import json
import sys
from pathlib import Path

REQUIRED = (
    "id", "section", "domain", "skill", "difficulty", "answer", "rationale",
    "img", "ref", "source",
)
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
        if not row["rationale"]:
            raise ValueError(f"{row['id']}: no rationale")
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


def _load_json_if_exists(path: Path) -> object | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def check_provenance(rows: list[dict], rows_path: Path, *, allow_dry_run: bool) -> None:
    """Refuse to build a bank whose rows point at bucket objects that were
    never actually uploaded (C1).

    Reads two sidecars next to `rows_path`, both written by extract_sat.py:

    - `mode.json`: `{"dry_run": bool}`, recording whether the run that
      produced `rows_path` was `--dry-run` or live. A dry run's rows carry
      `img` paths for objects that don't exist in the bucket -- shipping
      them as-is would put a page of broken image links on the live site.
      Refused unless `allow_dry_run` is explicitly passed (e.g. to
      sanity-check the bank's shape before running the live upload). A
      missing `mode.json` -- a rows.json this gate cannot vouch for at all
      -- is treated the same as a dry run rather than trusted by default.
    - `uploaded.json`: the set of ids a live run actually confirmed
      uploaded. extract_sat.py's resumability invariant is that a row is
      appended to `rows.json` only *after* its upload succeeds, so a live
      run that dies partway through (the likelier real shape, e.g. 2,000 of
      3,730) should already have a rows.json containing exactly the
      confirmed ids. This cross-checks that invariant rather than trusting
      it blindly: any row id absent from `uploaded.json` is refused: a
      smaller-than-the-full-corpus rows.json is fine and builds a valid,
      smaller bank; a row with no confirmation at all is not.
    """
    mode_path = rows_path.with_name("mode.json")
    mode = _load_json_if_exists(mode_path)
    is_dry_run = mode is None or mode.get("dry_run", True)
    if is_dry_run:
        if allow_dry_run:
            print(
                f"WARNING: building from a --dry-run rows.json ({rows_path}) with "
                "--allow-dry-run -- the images these rows point at were never "
                "uploaded and do not exist in the bucket.",
                file=sys.stderr,
            )
            return
        reason = (
            "a --dry-run" if mode is not None
            else f"a run with no {mode_path.name} sidecar (unverifiable)"
        )
        raise ValueError(
            f"{rows_path} was produced by {reason} -- its rows point at bucket "
            "objects that were never uploaded. Refusing to ship broken image "
            "links. Run the live upload (extract_sat.py without --dry-run) "
            "first, or pass --allow-dry-run if you understand the images do "
            "not exist yet."
        )

    uploaded_path = rows_path.with_name("uploaded.json")
    uploaded = _load_json_if_exists(uploaded_path)
    if uploaded is None:
        raise ValueError(
            f"{uploaded_path} not found -- cannot confirm any row's image was "
            "actually uploaded. Refusing to ship unverifiable rows."
        )
    uploaded_ids = set(uploaded)
    missing = [row["id"] for row in rows if row["id"] not in uploaded_ids]
    if missing:
        preview = ", ".join(missing[:10]) + ("..." if len(missing) > 10 else "")
        raise ValueError(
            f"{len(missing)} row(s) in {rows_path} have no upload confirmation "
            f"in {uploaded_path}: {preview}. Refusing to ship rows whose images "
            "may not exist in the bucket."
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", help="JSON produced by extract_sat.py")
    ap.add_argument(
        "--out", default=str(DEST),
        help="output path (default: src/lib/sat/question-bank.json); "
             "pass an out/ path to verify a build without touching the real bank",
    )
    ap.add_argument(
        "--allow-dry-run", action="store_true",
        help="build from a --dry-run rows.json anyway, even though its images "
             "were never uploaded and the bank would point at bucket objects "
             "that do not exist yet",
    )
    args = ap.parse_args()
    rows_path = Path(args.rows)
    rows = json.loads(rows_path.read_text(encoding="utf-8"))
    check_provenance(rows, rows_path, allow_dry_run=args.allow_dry_run)
    validate(rows)
    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(rows, indent=1), encoding="utf-8")
    print(f"wrote {dest} ({len(rows)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
