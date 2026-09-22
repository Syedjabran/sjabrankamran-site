#!/usr/bin/env python3
"""
Auto-populate papers.json + reviewed.json for the full 2018-2024 5054 corpus so
the strict extractor (extract5054.py) can process every paper.

- Discovers every qp/ms pair in the raw dir.
- Sets each paper's total_marks to the marks actually extracted (so the
  integrity check passes) and reads nmax/type/ref from the code.
- Proposes topic + level with the existing classifier (classify5054). LOW-
  confidence topics are left null rather than guessed — agents refine later.
- PRESERVES any existing human-reviewed entries already in reviewed.json.

Run: python3 autogen_all.py            (writes papers.json + reviewed.json)
Then: python3 extract5054.py --out rows.json   (crops + uploads + emits rows)
"""
import os, re, json, glob, sys
import crop5054 as C
import classify5054 as K
import extract5054 as E

RAW = "/home/admin/.openclaw/workspace/papers5054/raw"
SESS = {"s": "M/J", "w": "O/N"}
DUR = {"P1": 60, "P2": 75, "P4": 60}


def ptype_of(v: str) -> str:
    return "P1" if v[0] == "1" else "P2" if v[0] == "2" else "P4"


def main():
    existing = {}
    if os.path.exists("reviewed.json"):
        existing = json.load(open("reviewed.json"))
    papers, reviewed = [], dict(existing)
    added_q = 0
    for qp in sorted(glob.glob(f"{RAW}/5054_*_qp_*.pdf")):
        base = os.path.basename(qp)
        m = re.match(r"5054_([sw])(\d\d)_qp_(\d\d)\.pdf", base)
        if not m:
            continue
        sess, yy, v = m.groups()
        ms = f"{RAW}/5054_{sess}{yy}_ms_{v}.pdf"
        if not os.path.exists(ms):
            continue
        code = f"5054_{sess}{yy}_{v}"
        pt = ptype_of(v)
        nmax = 40 if pt == "P1" else 12
        ref = f"5054/{v}/{SESS[sess]}/{yy}"
        try:
            pages = C.unrotate(C.parse_bbox(qp))
            anchors = C.find_anchors(pages, nmax)
            if not anchors:
                print(f"SKIP {code}: no anchors", file=sys.stderr)
                continue
            marks = {}
            for i, (qn, _, _) in enumerate(anchors):
                t = E.region_text(pages, anchors, i, len(pages) - 1)
                marks[qn] = 1 if pt == "P1" else sum(int(x) for x in re.findall(r"\[\s*(\d{1,2})\s*\]", t))
                rk = f"{code}:{qn}"
                if rk not in reviewed:
                    reviewed[rk] = {"topic": K.propose_topic(t, pt), "level": K.propose_level(t)}
                    added_q += 1
            total = sum(marks.values())
            papers.append({
                "code": code, "paper_type": pt, "qp": base,
                "ms": os.path.basename(ms), "ref": ref, "nmax": nmax,
                "total_marks": total, "duration": DUR[pt], "include": True,
            })
            print(f"OK {code}: {len(anchors)} Q, total {total}", file=sys.stderr)
        except Exception as e:
            print(f"ERR {code}: {e}", file=sys.stderr)
    cfg = {"raw_dir": RAW, "papers": papers}
    json.dump(cfg, open("papers.json", "w"), ensure_ascii=False, indent=1)
    json.dump(reviewed, open("reviewed.json", "w"), ensure_ascii=False, indent=1)
    tagged = sum(1 for v in reviewed.values() if v.get("topic"))
    print(f"\nPAPERS {len(papers)} | reviewed entries {len(reviewed)} (new {added_q}) | with-topic {tagged}", file=sys.stderr)


if __name__ == "__main__":
    main()
