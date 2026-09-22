#!/usr/bin/env python3
"""
Re-tag every auto-classified question with maxwell's improved classifier and
patch the already-extracted rows.json in place — WITHOUT re-uploading any
image (images are unchanged; only the topic label changes).

Preserves the human-reviewed originals (the four s24/sp23 papers maxwell curated
by hand). Then rebuilds the bank.

Run after run_extract.py has produced rows.json:
  python3 apply_topics.py && python3 build_image_bank_olevel.py rows.json
"""
import os, re, json, sys
import crop5054 as C
import classify5054 as K
import extract5054 as E

# maxwell's hand-reviewed papers — never overwrite these topics.
CURATED = {"5054_s24_11", "5054_s24_21", "5054_s24_41", "5054_sp23_02"}
RAW = "/home/admin/.openclaw/workspace/papers5054/raw"


def main():
    reviewed = json.load(open("reviewed.json"))
    cfg = json.load(open("papers.json"))
    changed = 0
    for paper in cfg["papers"]:
        code = paper["code"]
        if code in CURATED:
            continue
        pt = paper["paper_type"]
        qp = os.path.join(cfg["raw_dir"], paper["qp"])
        try:
            pages = C.unrotate(C.parse_bbox(qp))
            anchors = C.find_anchors(pages, paper["nmax"])
            for i, (qn, _, _) in enumerate(anchors):
                t = E.region_text(pages, anchors, i, len(pages) - 1)
                rk = f"{code}:{qn}"
                if rk in reviewed:
                    newtopic = K.propose_topic(t, pt)
                    if newtopic != reviewed[rk].get("topic"):
                        reviewed[rk]["topic"] = newtopic
                        changed += 1
        except Exception as e:
            print(f"ERR {code}: {e}", file=sys.stderr)
    json.dump(reviewed, open("reviewed.json", "w"), ensure_ascii=False, indent=1)
    print(f"reviewed topics updated: {changed}", file=sys.stderr)

    # Patch rows.json topics in place (no re-upload).
    if os.path.exists("rows.json"):
        rows = json.load(open("rows.json"))
        patched = 0
        for r in rows:
            rk = f"{r.get('code')}:{r.get('qnum')}"
            if rk in reviewed and r.get("topic") != reviewed[rk]["topic"]:
                r["topic"] = reviewed[rk]["topic"]
                patched += 1
        json.dump(rows, open("rows.json", "w"), ensure_ascii=False, indent=1)
        tagged = sum(1 for r in rows if r.get("topic"))
        print(f"rows patched: {patched} | total {len(rows)} | with-topic {tagged}", file=sys.stderr)
    else:
        print("rows.json not found yet — run after extraction", file=sys.stderr)


if __name__ == "__main__":
    main()
