"""Crop, upload and emit metadata for every question-bank item.

Resumable: a question whose crop already exists on disk is not re-rendered,
so an interrupted run (or a deliberate `--dry-run` pass to eyeball crops
before anything uploads) can simply be re-run and only the missing work is
redone. `--dry-run` also skips the upload call entirely -- no Supabase
credential is read and no network request is made.

Two independent things can make a question un-ingestable, and they are
reported with distinct, specific reasons rather than lumped into one
generic "skipped" bucket:

- `parse_export` rejects the record before cropping is even attempted (e.g.
  `answer-source-conflict`, an unresolvable grid-in) -- see parse_qbank.py.
- the record parses fine but `question_span` cannot locate its crop region
  on the page -- see `question_span_reason` in crop_qbank.py, which in
  particular distinguishes the measured cross-page case (the answer/
  rationale anchor lands on the next PDF page) from a genuine anomaly.
"""
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poppler
from crop_qbank import anchors, bbox_xml, question_span, question_span_reason, render_span
from parse_qbank import parse_export
from report_qbank import text_of
from upload import bucket_path, upload_file

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / "question-bank"
CROPS = HERE / "out" / "crops"


def _reason_key(reason: str) -> str:
    """Collapse a detailed, id-specific reason (e.g. "answer-source-conflict:
    line=B rationale=D") down to its category for the histogram. The full,
    specific string is still kept verbatim per-entry in skipped.json --
    this is only for counting how many fall in each bucket.
    """
    return reason.split(":", 1)[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="crop only, do not upload")
    ap.add_argument("--limit", type=int, default=0, help="stop after N questions")
    ap.add_argument("--out", default=str(HERE / "out" / "rows.json"))
    args = ap.parse_args()

    poppler.preflight()
    rows: list[dict] = []
    skipped: list[dict] = []

    for pdf in sorted(RAW.glob("*.pdf")):
        if args.limit and len(rows) >= args.limit:
            break
        records, rejected = parse_export(text_of(pdf))
        skipped += [{**r, "stage": "parse"} for r in rejected]
        a = anchors(bbox_xml(pdf))
        print(f"{pdf.name}: {len(records)} records, {len(a['ids'])} anchors")

        for rec in records:
            if args.limit and len(rows) >= args.limit:
                break
            span = question_span(a, rec["id"])
            if span is None:
                reason = question_span_reason(a, rec["id"])
                skipped.append({
                    "id": rec["id"], "reason": reason,
                    "stage": "crop", "section": rec["section"],
                })
                continue
            dest = CROPS / rec["section"] / f"{rec['id']}.jpg"
            if not dest.exists():
                width_pt, height_pt = a["page_size"][span["page"]]
                render_span(pdf, span, dest, page_width_pt=width_pt, page_height_pt=height_pt)
            img = bucket_path(rec["id"], rec["section"])
            if not args.dry_run:
                upload_file(dest, img)
            rows.append({
                **rec,
                "img": img,
                "ref": f"SAT Question Bank {rec['id']}",
                "source": "question-bank",
            })

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, indent=1), encoding="utf-8")
    print(f"\n  {len(rows)} rows -> {out_path}")
    print(f"  {len(skipped)} skipped")
    if skipped:
        out_path.with_name("skipped.json").write_text(
            json.dumps(skipped, indent=1), encoding="utf-8"
        )
        histogram = collections.Counter(_reason_key(s["reason"]) for s in skipped)
        print("  skip reasons:")
        for reason, count in histogram.most_common():
            print(f"    {reason}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
