"""Parse the real exports and report coverage. Run before any cropping."""
import argparse
import collections
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poppler
from parse_qbank import parse_export

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / "question-bank"
OUT = HERE / "out"


def text_of(pdf: Path) -> str:
    cache = OUT / (pdf.stem + ".txt")
    if not cache.exists():
        OUT.mkdir(parents=True, exist_ok=True)
        subprocess.run([poppler.tool("pdftotext"), str(pdf), str(cache)], check=True)
    # Strict UTF-8, matching crop_qbank.py's decode of the same corpus (see
    # its bbox_xml). errors="ignore" here would silently mangle rationale
    # text on a future corrupt file instead of failing loudly -- the
    # current corpus is verified clean (0 U+FFFD), so this only changes
    # behaviour for material that doesn't exist yet.
    return cache.read_text(encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT / "qbank-records.json"))
    args = ap.parse_args()

    poppler.preflight()
    all_records, all_rejected = [], []
    for pdf in sorted(RAW.glob("*.pdf")):
        records, rejected = parse_export(text_of(pdf))
        print(f"{pdf.name}: {len(records)} parsed, {len(rejected)} rejected")
        all_records += records
        all_rejected += rejected

    by_domain = collections.Counter(r["domain"] for r in all_records)
    by_diff = collections.Counter(r["difficulty"] for r in all_records)
    by_kind = collections.Counter(r["answer"]["kind"] for r in all_records)
    by_source = collections.Counter(r["answer"]["source"] for r in all_records)
    print("\n  total:", len(all_records), " rejected:", len(all_rejected))
    print("  by domain:", dict(by_domain))
    print("  by difficulty:", dict(by_diff))
    print("  by answer kind:", dict(by_kind))
    print("  by answer source:", dict(by_source))
    if all_rejected:
        print("  rejected:")
        for r in all_rejected:
            print(f"    {r['id']}: {r['reason']}")

    Path(args.out).write_text(json.dumps(all_records, indent=1), encoding="utf-8")
    print("  wrote", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
