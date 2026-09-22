#!/usr/bin/env python3
"""
Cambridge O Level 5054 Exam Lab ingestion.

Crops every question of every configured paper as an EXACT image (diagrams,
graphs and tables preserved), reads marks off the question paper's printed [n]
brackets, reads Paper 1 answers off the published mark scheme, crops the
matching mark-scheme region for the structured papers, uploads everything to the
private Supabase `exam-assets` bucket under the `o-level/` prefix, and writes
the metadata rows consumed by build_image_bank_olevel.py.

Nothing outside the `o-level/` prefix is ever read, written or listed, so the
existing 9702 assets in the same bucket are untouched.

Usage
  python3 extract5054.py --dry-run          # crop + classify, no upload
  python3 extract5054.py --review           # as above, print classifier diffs
  python3 extract5054.py --out rows.json    # crop, upload, emit metadata

Env (upload only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

import crop5054 as C
import classify5054 as K

HERE = os.path.dirname(os.path.abspath(__file__))
BUCKET = "exam-assets"
PREFIX = "o-level"


def load_config():
    with open(os.path.join(HERE, "papers.json")) as f:
        return json.load(f)


def load_reviewed():
    with open(os.path.join(HERE, "reviewed.json")) as f:
        return json.load(f)


def upload(data, path):
    supa = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    url = f"{supa}/storage/v1/object/{BUCKET}/{path}"
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Bearer {key}", "apikey": key,
        "content-type": "image/jpeg", "x-upsert": "true"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status in (200, 201)


def img_bytes(im):
    b = io.BytesIO()
    im.save(b, "JPEG", quality=82)
    return b.getvalue()


def region_text(pages, anchors, i, last_page):
    """All extracted text belonging to anchors[i], in reading order."""
    _, pi, ytop = anchors[i]
    nxt = anchors[i + 1] if i + 1 < len(anchors) else None
    end_pi = nxt[1] if nxt else last_page
    end_y = nxt[2] if nxt else 1e9
    out = []
    for p in range(pi, end_pi + 1):
        words = pages[p][2]
        for (x0, y0, x1, y1, t) in sorted(words, key=lambda z: (round(z[1] / 4), z[0])):
            if p == pi and y0 < ytop - 2:
                continue
            if p == end_pi and nxt and y0 >= end_y - 2:
                continue
            out.append(t)
    return " ".join(out)


def parse_mcq_key(ms_pdf):
    """{qnum: 'A'..'D'} from a published 5054 multiple-choice mark scheme."""
    import subprocess
    txt = subprocess.run(["pdftotext", "-layout", ms_pdf, "-"],
                         capture_output=True, text=True, check=True).stdout
    key = {}
    # Answer-table rows are "<question> <letter> <marks>", e.g. "  7   D   1".
    for m in re.finditer(r"^\s*(\d{1,2})\s+([A-D])\s+\d\s*$", txt, re.M):
        key[int(m.group(1))] = m.group(2)
    return key


def extract_paper(cfg, paper, reviewed, dry_run, review, failures, save_dir=None):
    raw = cfg["raw_dir"]
    code = paper["code"]
    ptype = paper["paper_type"]
    qp_pdf = os.path.join(raw, paper["qp"])
    ms_pdf = os.path.join(raw, paper["ms"]) if paper["ms"] else None

    pages = C.unrotate(C.parse_bbox(qp_pdf))
    anchors = C.find_anchors(pages, paper["nmax"])
    if not anchors:
        failures.append(f"{code}: no question anchors found in {paper['qp']} — paper skipped")
        return []
    last_page = C.last_content_page(pages)
    imgs = C.render_pages(qp_pdf, code, pages)

    # --- marks: the printed [n] brackets inside each question's own region ---
    # Text regions run to the physical end of the PDF, not to `last_page`: a
    # question's final [n] bracket can sit on a ruled answer-space page that
    # carries no other text (5054/41 2024 Q4) and so is not a crop boundary.
    texts = {}
    marks = {}
    for i, (qn, _, _) in enumerate(anchors):
        t = region_text(pages, anchors, i, len(pages) - 1)
        texts[qn] = t
        marks[qn] = sum(int(x) for x in re.findall(r"\[\s*(\d{1,2})\s*\]", t))
    if ptype == "P1":
        marks = {qn: 1 for qn in marks}
    total = sum(marks.values())
    if total != paper["total_marks"]:
        failures.append(
            f"{code}: extracted marks total {total} != printed paper total "
            f"{paper['total_marks']} — mark allocations not trusted, paper skipped")
        return []

    # --- answers (Paper 1 only, strictly from the published mark scheme) ---
    key = {}
    if ptype == "P1":
        key = parse_mcq_key(ms_pdf)
        missing = [qn for qn, *_ in anchors if qn not in key]
        if missing:
            failures.append(f"{code}: no mark-scheme answer for Q{missing} — questions skipped")

    # --- mark-scheme crops (structured papers) ---
    ms_idx = {}
    ms_pages = ms_imgs = ms_anchors = None
    ms_last = 0
    if ptype != "P1" and ms_pdf:
        ms_pages = C.unrotate(C.parse_bbox(ms_pdf))
        ms_anchors = C.find_ms_anchors(ms_pages, paper["nmax"])
        ms_last = C.last_content_page(ms_pages)
        ms_imgs = C.render_pages(ms_pdf, code + "_ms", ms_pages)
        ms_idx = {a[0]: i for i, a in enumerate(ms_anchors)}
        for qn, *_ in anchors:
            if qn not in ms_idx:
                failures.append(f"{code}: no mark-scheme anchor for Q{qn} — shipped without ms_img")

    rows = []
    for i, (qn, _, _) in enumerate(anchors):
        rk = f"{code}:{qn}"
        rv = reviewed.get(rk)
        if not rv:
            failures.append(f"{code} Q{qn}: no reviewed topic/level entry — question skipped")
            continue
        if ptype == "P1" and qn not in key:
            continue

        im = C.trim_white(C.crop_question(
            imgs, anchors[i], anchors[i + 1] if i + 1 < len(anchors) else None,
            last_page, C.notice_top(pages[last_page][2])))
        if im.width < 200 or im.height < 60:
            failures.append(f"{code} Q{qn}: crop degenerate ({im.width}x{im.height}) — skipped")
            continue
        qpath = f"{PREFIX}/{ptype.lower()}/{code}/q{qn}.jpg"

        ms_path = None
        ms_im = None
        if ptype != "P1" and qn in ms_idx:
            j = ms_idx[qn]
            ms_im = C.trim_white(C.crop_question(
                ms_imgs, ms_anchors[j],
                ms_anchors[j + 1] if j + 1 < len(ms_anchors) else None, ms_last,
                C.notice_top(ms_pages[ms_last][2])))
            if ms_im.width < 200 or ms_im.height < 40:
                failures.append(f"{code} Q{qn}: mark-scheme crop degenerate — shipped without ms_img")
                ms_im = None
            else:
                ms_path = f"{PREFIX}/{ptype.lower()}/{code}/q{qn}_ms.jpg"

        if review:
            pt = K.propose_topic(texts[qn], ptype)
            pl = K.propose_level(texts[qn])
            flag = "" if (pt == rv["topic"] and pl == rv["level"]) else "  <-- differs"
            print(f"  {code} Q{qn}: reviewed={rv['topic']}/{rv['level']} "
                  f"proposed={pt}/{pl}{flag}", file=sys.stderr)

        if save_dir:
            d = os.path.join(save_dir, os.path.dirname(qpath))
            os.makedirs(d, exist_ok=True)
            im.save(os.path.join(save_dir, qpath), "JPEG", quality=82)
            if ms_path:
                ms_im.save(os.path.join(save_dir, ms_path), "JPEG", quality=82)
        if not dry_run:
            upload(img_bytes(im), qpath)
            if ms_path:
                upload(img_bytes(ms_im), ms_path)

        rows.append({
            "id": f"ol-{ptype.lower()}-{code}-q{qn}",
            "paperType": ptype, "code": code, "qnum": qn,
            "topic": rv["topic"], "level": rv["level"], "marks": marks[qn],
            "answer": key.get(qn) if ptype == "P1" else None,
            "img": qpath, "ms_img": ms_path,
            "ref": f"{paper['ref']} Q{qn}", "duration": paper["duration"],
        })
    print(f"  {code}: {len(rows)}/{len(anchors)} questions "
          f"({'cropped' if dry_run else 'uploaded'})", file=sys.stderr)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--review", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--save-dir", help="also write every crop here for visual QA")
    args = ap.parse_args()
    dry = args.dry_run or args.review

    cfg = load_config()
    reviewed = load_reviewed()
    failures = []
    rows = []
    for paper in cfg["papers"]:
        if not paper.get("include"):
            print(f"  {paper['code']}: EXCLUDED — {paper.get('excluded_because','')}",
                  file=sys.stderr)
            continue
        rows += extract_paper(cfg, paper, reviewed, dry, args.review, failures, args.save_dir)

    print(f"\ntotal questions: {len(rows)}", file=sys.stderr)
    if failures:
        print("FAILURES / SKIPS:", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
    if args.out:
        with open(args.out, "w") as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
        print(f"wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
