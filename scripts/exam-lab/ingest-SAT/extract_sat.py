"""Crop, upload and emit metadata for every question-bank item.

Resumable in two independent ways:

- A question whose crop already exists on disk is not re-rendered (see
  `crop_qbank.render_span`, which writes atomically so a crop is either
  absent or complete -- never a partial file that would be mistaken for a
  finished one).
- A question already recorded in `uploaded.json` is not re-uploaded on a
  rerun. Supabase's upsert makes re-uploading harmless, but slow across
  3,730+ files; `uploaded.json` is written incrementally, one id at a time,
  so a killed run's progress up to the moment it died is never lost.

`rows.json` and `skipped.json` are always written, including when the run
is interrupted by an exception or Ctrl-C partway through -- partial results
are far more useful than none on a run this long. `--dry-run` skips the
upload call entirely -- no Supabase credential is read and no network
request is made.

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
import os
import sys
import time
import urllib.error
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

MAX_UPLOAD_ATTEMPTS = 5
RETRY_BASE_DELAY = 1.0  # seconds; doubled each attempt: 1, 2, 4, 8


def _reason_key(reason: str) -> str:
    """Collapse a detailed, id-specific reason (e.g. "answer-source-conflict:
    line=B rationale=D") down to its category for the histogram. The full,
    specific string is still kept verbatim per-entry in skipped.json --
    this is only for counting how many fall in each bucket.
    """
    return reason.split(":", 1)[0]


def _atomic_write_text(path: Path, text: str) -> None:
    """Write `text` to `path` atomically: to a temp file in the same
    directory first, then `os.replace()`d onto the real path -- atomic on
    both POSIX and Windows, same pattern as `crop_qbank.render_span`'s crop
    writes. A process killed mid-write leaves `path` either absent/
    unchanged or fully updated, never truncated.

    This matters most for `uploaded.json`: a plain `write_text` truncated
    by a kill mid-write would make `_load_uploaded`'s `json.loads` raise on
    every future run -- a hard failure that blocks all resume forever,
    which is a *worse* outcome than the one Task 7's persistence exists to
    prevent. The same exposure applies to `rows.json`/`skipped.json`, so
    every write in this module that needs to survive a kill goes through
    this helper rather than repeating the temp-file dance three times.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    try:
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def _load_uploaded(path: Path) -> set[str]:
    """The set of question ids already confirmed uploaded in a prior run,
    or empty on a fresh run / if the file doesn't exist yet.

    Resilient to a corrupt or unreadable file: warns loudly and treats it
    as empty rather than crashing the run. Re-uploading ids that were
    actually already uploaded is harmless (Supabase upsert), whereas
    refusing to start over a bad bookkeeping file is not -- that would turn
    one bad `uploaded.json` into a permanent block on every future resume.

    The two ways this can fail need different operator responses, so the
    warning distinguishes them instead of using one blanket "corrupt"
    message: a read failure (permissions, the file vanished mid-read) means
    the file itself is inaccessible -- fix the permissions/environment; a
    parse failure means the file was read fine but its *content* is bad
    (e.g. truncated by an interrupted write) -- nothing to fix except let
    the next successful write replace it.
    """
    if not path.exists():
        return set()
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(
            f"WARNING: could not read {path} ({exc}); treating as empty. "
            "Already-uploaded ids may be re-uploaded (harmless: upsert), not lost.",
            file=sys.stderr,
        )
        return set()
    try:
        return set(json.loads(text))
    except (json.JSONDecodeError, ValueError) as exc:
        print(
            f"WARNING: {path} is corrupt/unparseable ({exc}); treating as empty. "
            "Already-uploaded ids may be re-uploaded (harmless: upsert), not lost.",
            file=sys.stderr,
        )
        return set()


def _record_uploaded(path: Path, qid: str, already: set[str]) -> None:
    """Append `qid` to the on-disk uploaded-ids record and the in-memory
    set, written immediately (not batched) so a run killed right after this
    call still has the upload it just completed on record. Idempotent
    upsert already makes re-uploading a completed id harmless -- this is
    what makes a resumed run fast rather than merely correct.
    """
    already.add(qid)
    _atomic_write_text(path, json.dumps(sorted(already), indent=1))


def _upload_with_retry(dest: Path, img: str) -> str:
    """Upload one crop, retrying transient failures with exponential
    backoff (delays 1s, 2s, 4s, 8s between up to `MAX_UPLOAD_ATTEMPTS`
    tries).

    Retries HTTP 429 (rate limited) and 5xx (server-side, plausibly
    transient) and connection/timeout errors. Does NOT retry any other 4xx:
    a 401/403 means the credentials are wrong, and retrying identical bad
    credentials cannot succeed -- it fails immediately so the real problem
    surfaces instead of being masked behind several slow, doomed attempts.
    """
    last_exc: BaseException | None = None
    for attempt in range(MAX_UPLOAD_ATTEMPTS):
        try:
            return upload_file(dest, img)
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500:
                raise  # non-retryable client error (e.g. 401/403)
            last_exc = exc
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_exc = exc
        if attempt < MAX_UPLOAD_ATTEMPTS - 1:
            time.sleep(RETRY_BASE_DELAY * (2 ** attempt))
    raise RuntimeError(
        f"upload failed for {img} after {MAX_UPLOAD_ATTEMPTS} attempts: {last_exc}"
    ) from last_exc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="crop only, do not upload")
    ap.add_argument("--limit", type=int, default=0, help="stop after N questions")
    ap.add_argument("--out", default=str(HERE / "out" / "rows.json"))
    args = ap.parse_args(argv)

    poppler.preflight()
    out_path = Path(args.out)
    skipped_path = out_path.with_name("skipped.json")
    uploaded_path = out_path.with_name("uploaded.json")
    uploaded = _load_uploaded(uploaded_path)

    rows: list[dict] = []
    skipped: list[dict] = []

    def _persist() -> None:
        _atomic_write_text(out_path, json.dumps(rows, indent=1))
        _atomic_write_text(skipped_path, json.dumps(skipped, indent=1))

    persist_error: Exception | None = None
    try:
        for pdf in sorted(RAW.glob("*.pdf")):
            if args.limit and len(rows) >= args.limit:
                break
            records, rejected = parse_export(text_of(pdf))
            # A whole PDF's parse-stage rejects are appended here BEFORE the
            # inner --limit check below ever runs, so on a limited run
            # len(rows) + len(skipped) is not "questions attempted": it also
            # counts every parse-time reject from a PDF whose records were
            # never even reached because the limit was hit first.
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
                was_missing = not dest.exists()
                if was_missing:
                    width_pt, height_pt = a["page_size"][span["page"]]
                    render_span(pdf, span, dest, page_width_pt=width_pt, page_height_pt=height_pt)
                    if rec["id"] in uploaded:
                        # CROPS is a fixed path while uploaded.json derives
                        # from --out's parent, so the two can desync: e.g.
                        # out/crops was cleared (or never shared) while
                        # out/uploaded.json survived. The crop just got
                        # re-rendered but the upload below will be skipped
                        # (id already marked uploaded), so the bucket keeps
                        # whatever image it already has -- which may not be
                        # this new crop. This can't be fixed silently since
                        # only a human can say which copy is correct; it
                        # must not be missed, so it prints even in dry-run.
                        print(
                            f"WARNING: {rec['id']}'s crop was just re-rendered (missing "
                            f"from {CROPS}) but its id is already recorded as uploaded in "
                            f"{uploaded_path.name} -- the bucket copy may now be stale "
                            f"relative to this new crop. Remove its entry from "
                            f"{uploaded_path.name} to force a re-upload.",
                            file=sys.stderr,
                        )
                img = bucket_path(rec["id"], rec["section"])
                if not args.dry_run and rec["id"] not in uploaded:
                    _upload_with_retry(dest, img)
                    _record_uploaded(uploaded_path, rec["id"], uploaded)
                rows.append({
                    **rec,
                    "img": img,
                    "ref": f"SAT Question Bank {rec['id']}",
                    "source": "question-bank",
                })
    finally:
        # Always persisted, even on an exception or KeyboardInterrupt: a
        # mid-run failure at item 2,000 of 3,730 must leave a record of how
        # far the run got, not silently vanish. `_persist()` itself is
        # wrapped in its own try/except: if the loop died for a real reason
        # AND persistence then also fails, letting that second exception
        # escape `finally` would replace the original one -- the real cause
        # would never reach whatever is watching this process. Reporting
        # the persistence failure here and continuing lets the original
        # exception (if any) propagate unmodified once this `finally`
        # completes -- Python resumes that pending exception automatically,
        # so the `persist_error` check below is never reached in that case.
        try:
            _persist()
        except Exception as exc:
            persist_error = exc
            print(f"WARNING: failed to persist rows.json/skipped.json: {exc}", file=sys.stderr)

    if persist_error is not None:
        # Only reached when the loop itself completed without raising --
        # if it had, the pending exception would already have propagated
        # out of the function the moment `finally` above finished, and this
        # line would never run. So getting here means: the run itself was
        # otherwise clean, but it failed to record what it did. That must
        # not be reported as success (exit 0) -- I1 exists specifically so
        # a run's outcome is never lost, and this is the one case (no other
        # error to blame) where silently returning 0 would do exactly that.
        print(
            "ERROR: run completed but failed to persist rows.json/skipped.json -- "
            "not reporting success.",
            file=sys.stderr,
        )
        raise persist_error

    print(f"\n  {len(rows)} rows -> {out_path}")
    print(f"  {len(skipped)} skipped")
    if skipped:
        histogram = collections.Counter(_reason_key(s["reason"]) for s in skipped)
        print("  skip reasons:")
        for reason, count in histogram.most_common():
            print(f"    {reason}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
