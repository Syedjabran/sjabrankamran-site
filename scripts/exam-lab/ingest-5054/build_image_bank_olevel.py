#!/usr/bin/env python3
"""
Build src/lib/exam-lab/image-bank-olevel.{json,ts} from extract5054.py output.

Mirrors the 9702 build_image_bank.py: a JSON data file plus a thin generated
TypeScript wrapper exporting the bank and a per-paper summary. The 9702 bank is
never read or written here.

  python3 build_image_bank_olevel.py rows.json
"""
import collections
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
BASE = os.path.join(REPO, "src", "lib", "exam-lab")

# Canonical Cambridge O Level 5054 paper facts, read off the papers themselves:
#   5054/11 2024 — "There are forty questions", "total mark ... is 40", "1 hour"
#   5054/21 2024 — "total mark for this paper is 80", "1 hour 45 minutes"
#   5054/41 2024 — "total mark for this paper is 40", "1 hour"
CANON = {
    "P1": {"marks": 40, "duration": 60, "name": "Paper 1 · Multiple Choice"},
    "P2": {"marks": 80, "duration": 105, "name": "Paper 2 · Theory"},
    "P4": {"marks": 40, "duration": 60, "name": "Paper 4 · Alternative to Practical"},
}

SESSORD = {"sp": 0, "m": 1, "s": 2, "w": 3}


def chrono(code):
    m = re.match(r"5054_([a-z]+)(\d\d)_(\d\d)", code)
    if not m:
        return 9e9
    sess, yy, v = m.groups()
    return int(yy) * 1000 + SESSORD.get(sess, 9) * 100 + int(v)


def main():
    rows = []
    for f in sys.argv[1:]:
        with open(f) as fh:
            rows += json.load(fh)
    if not rows:
        sys.exit("no rows")

    seen = {}
    for r in rows:
        seen[r["id"]] = r
    rows = sorted(seen.values(), key=lambda r: (chrono(r["code"]), r["paperType"], r["qnum"]))

    # Shape guard: a paper whose extracted question count is impossible for its
    # type is a parse failure, not a short paper, and must not ship.
    SHAPE = {"P1": (40, 40), "P2": (5, 12), "P4": (3, 8)}
    bycode = collections.defaultdict(list)
    for r in rows:
        bycode[(r["paperType"], r["code"])].append(r)
    valid = set()
    for (pt, code), qs in bycode.items():
        lo, hi = SHAPE[pt]
        if lo <= len(qs) <= hi:
            valid.add((pt, code))
        else:
            print(f"DROPPED {code}: {len(qs)} questions outside the {pt} range {lo}-{hi}",
                  file=sys.stderr)
    rows = [r for r in rows if (r["paperType"], r["code"]) in valid]

    # Every multiple-choice question must carry a mark-scheme answer.
    bad = [r["id"] for r in rows if r["paperType"] == "P1" and r["answer"] not in list("ABCD")]
    if bad:
        sys.exit(f"refusing to build: MCQ rows without a mark-scheme answer: {bad}")

    with open(os.path.join(BASE, "image-bank-olevel.json"), "w") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    papers = sorted({(r["paperType"], r["code"]) for r in rows}, key=lambda x: chrono(x[1]))
    canon_ts = "\n".join(
        f'  {pt}: {{ marks: {c["marks"]}, duration: {c["duration"]}, name: "{c["name"]}" }},'
        for pt, c in CANON.items())
    ts = f'''// AUTO-GENERATED wrapper. Data in image-bank-olevel.json (exact Cambridge
// O Level 5054 past-paper images in the private 'exam-assets' Supabase bucket,
// under the o-level/ prefix). PORTAL-ONLY. Regenerate via
// scripts/exam-lab/ingest-5054/extract5054.py + build_image_bank_olevel.py.
import rawData from "./image-bank-olevel.json";
import type {{ ImgQuestion }} from "./image-bank";

// Canonical Cambridge 5054 paper facts, taken from the papers themselves.
const CANON: Record<string, {{ marks: number; duration: number; name: string }}> = {{
{canon_ts}
}};

// {len(rows)} questions across {len(papers)} papers.
export const OLEVEL_IMAGE_BANK = rawData as ImgQuestion[];

const SESSORD: Record<string, number> = {{ sp: 0, m: 1, s: 2, w: 3 }};
function chrono(code: string): number {{
  const m = code.match(/5054_([a-z]+)(\\d\\d)_(\\d\\d)/);
  if (!m) return 9e9;
  return parseInt(m[2]) * 1000 + (SESSORD[m[1]] ?? 9) * 100 + parseInt(m[3]);
}}

export const OLEVEL_IMAGE_PAPERS = Array.from(new Set(OLEVEL_IMAGE_BANK.map((q) => q.code)))
  .map((code) => {{
    const qs = OLEVEL_IMAGE_BANK.filter((q) => q.code === code);
    const pt = qs[0].paperType;
    return {{ code, paperType: pt, count: qs.length, marks: CANON[pt].marks,
      duration: CANON[pt].duration, ref: qs[0].ref.replace(/ Q.*$/, ""), chrono: chrono(code) }};
  }})
  .sort((a, b) => a.chrono - b.chrono);

export const OLEVEL_PAPER_NAMES = CANON;

/** 5054 syllabus topics present in the bank, for the paper a drill targets. */
export function olevelTopics(paperType: "P1" | "P2" | "P4"): string[] {{
  const set = new Set<string>();
  for (const q of OLEVEL_IMAGE_BANK) if (q.paperType === paperType && q.topic) set.add(q.topic);
  return Array.from(set).sort();
}}
'''
    with open(os.path.join(BASE, "image-bank-olevel.ts"), "w") as f:
        f.write(ts)

    print("questions:", len(rows), "| papers:", len(papers))
    print("by type:", dict(collections.Counter(r["paperType"] for r in rows)))
    print("by paper:", {c: len(v) for (_, c), v in bycode.items()})
    print("topics:", dict(collections.Counter(r["topic"] for r in rows)))


if __name__ == "__main__":
    main()
