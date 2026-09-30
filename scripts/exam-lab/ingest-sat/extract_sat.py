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

A `mode.json` sidecar is written alongside `rows.json` recording whether the
run that produced it was `--dry-run` or live. `build_sat_bank.py` reads it
before shipping anything: a dry run's rows point at bucket objects that were
never uploaded, and building a bank from them without that check would ship
a page of broken image links -- see `build_sat_bank.check_provenance`.

Two independent things can make a question un-ingestable, and they are
reported with distinct, specific reasons rather than lumped into one
generic "skipped" bucket:

- `parse_export` rejects the record before cropping is even attempted (e.g.
  `answer-source-conflict`, an unresolvable grid-in) -- see parse_qbank.py.
- the record parses fine but `question_span` cannot locate its crop region
  on the page -- see `question_span_reason` in crop_qbank.py, which in
  particular distinguishes the measured cross-page case (the answer/
  rationale anchor lands on the next PDF page) from a genuine anomaly.

Each shipped row also carries its official rationale as an image
(`rationale_img`) -- see crop_rationale.py for why the text won't do. Its
key is a hash of the crop's bytes, `sat/<section>/r/<hash>.<ext>`
(`upload.rationale_bucket_path` says why it must not be derivable from the
question id); the local copy mirrors it under `out/crops/`. The rationale
is bookkept separately from the question, so a question uploaded before
rationales existed still gets its rationale uploaded, and a resume
re-renders and re-uploads neither:

- `out/crops/rationale-crops.json`: `{id: key}` for every rationale crop on
  disk, kept beside the crops (like them, a fixed path), so a resume knows
  each crop's key without re-rendering it.
- `uploaded-rationales.json`: `{id: key}` for every rationale a live run
  confirmed uploaded, and under which key (build_sat_bank.py ships
  `rationaleImg` only for a row whose key is recorded here).
- `skipped-rationales.json`: rows whose rationale could not be cropped
  cleanly, each with a reason. Such a row still ships -- with the text
  rationale as its fallback -- so these are NOT counted in skipped.json,
  which lists records that did not ship at all.
"""
import argparse
import collections
import json
import os
import sys
import time
import urllib.error
from collections.abc import Callable
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poppler
from crop_qbank import anchors, bbox_xml, question_span, question_span_reason, render_span
from crop_rationale import RationaleCropError, id_index, rationale_span, rationale_span_reason, render_rationale
from parse_qbank import parse_export
from report_qbank import text_of
from upload import bucket_path, preflight_credentials, rationale_bucket_path, upload_file

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
    _atomic_write(path, lambda tmp: tmp.write_text(text, encoding="utf-8"))


def _atomic_write_bytes(path: Path, data: bytes) -> None:
    """`_atomic_write_text` for bytes -- how a rationale crop reaches its
    content-hash path: either absent or complete, never partial."""
    _atomic_write(path, lambda tmp: tmp.write_bytes(data))


def _atomic_write(path: Path, write: Callable[[Path], object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    try:
        write(tmp)
        _replace_with_retry(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


REPLACE_ATTEMPTS = 8


def _replace_with_retry(tmp: Path, path: Path) -> None:
    """`os.replace`, retried briefly on Windows' transient "Access is denied".

    On Windows the replace fails while any other process holds the
    destination open without delete-sharing -- typically an antivirus or
    indexer scanning the file just written. A live upload rewrites
    uploaded.json after every object, so a scan landing at the wrong moment
    used to abort a 3,700-file run. The lock clears in milliseconds; a real
    permission problem still raises after the last attempt.
    """
    for attempt in range(REPLACE_ATTEMPTS):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == REPLACE_ATTEMPTS - 1:
                raise
            time.sleep(0.1 * (attempt + 1))


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


def _load_keys(path: Path) -> dict[str, str]:
    """A `{question id: rationale key}` record (`rationale-crops.json` or
    `uploaded-rationales.json`), or empty when there is none yet.

    Same resilience as `_load_uploaded`, for the same reason: an unreadable
    or corrupt record costs, at worst, a re-render (deterministic, so the
    same key) or a re-upload (upsert, harmless) -- refusing to start would
    block every resume. A record that parses but isn't a flat
    `{str: str}` map -- e.g. the list of ids rationale uploads were recorded
    as before keys became content hashes -- says nothing about which object
    was written, so it is treated as empty too, loudly.
    """
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"WARNING: could not read {path} ({exc}); treating it as empty.", file=sys.stderr)
        return {}
    if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
        print(
            f"WARNING: {path} is not a {{question id: key}} record; treating it as empty "
            "(every rationale it covers is re-rendered or re-uploaded under its key).",
            file=sys.stderr,
        )
        return {}
    return data


def _record_key(path: Path, qid: str, key: str, record: dict[str, str]) -> None:
    """Set `record[qid] = key` and write the whole record at once,
    atomically -- one entry at a time, like `_record_uploaded`, so a run
    killed right after this still has it."""
    record[qid] = key
    _atomic_write_text(path, json.dumps(dict(sorted(record.items())), indent=1))


def _local_crop(key: str) -> Path:
    """Where a `sat/...` key's crop lives locally: `CROPS` mirrors the
    bucket below the prefix -- the same mapping the dev-only
    /api/sat/local-image route resolves a key with."""
    return CROPS.joinpath(*PurePosixPath(key).relative_to("sat").parts)


def _rationale_image(pdf: Path, a: dict, rec: dict, *, dry_run: bool,
                     crops: dict[str, str], crops_path: Path,
                     uploaded: dict[str, str], uploaded_path: Path,
                     skipped: list[dict]) -> str | None:
    """Crop (and, live, upload) `rec`'s official rationale; return its
    bucket key, or None -- with the reason appended to `skipped` -- when it
    can't be cropped cleanly.

    The key is a hash of the crop's bytes (`rationale_bucket_path`), so it
    is known only once the crop is rendered. `crops` (rationale-crops.json,
    beside the crops themselves) remembers the key each id's crop was
    written under, so a resume doesn't re-render; `uploaded`
    (uploaded-rationales.json, beside rows.json) remembers the key uploaded
    for each id. An upload is needed exactly when the two differ -- which
    also covers a re-render whose bytes changed: a new key, uploaded under
    it, while the old object stays in the bucket, orphaned. Both records are
    written before this returns, and the upload before the caller appends
    its row.
    """
    def skip(reason: str, stage: str) -> None:
        skipped.append({"id": rec["id"], "reason": reason, "stage": stage, "section": rec["section"]})

    i = id_index(a, rec["id"])
    regions = rationale_span(a, i) if i is not None else None
    if regions is None:
        skip(rationale_span_reason(a, i) if i is not None else "unknown-id", "rationale-span")
        return None
    key = crops.get(rec["id"])
    if key is None or not _local_crop(key).exists():
        try:
            data = render_rationale(pdf, regions, a["page_size"])
        except RationaleCropError as exc:
            skip(str(exc), "rationale-render")
            return None
        key = rationale_bucket_path(rec["section"], data)
        dest = _local_crop(key)
        if not dest.exists():  # else a byte-identical crop is already there
            _atomic_write_bytes(dest, data)
        _record_key(crops_path, rec["id"], key, crops)
    if not dry_run and uploaded.get(rec["id"]) != key:
        key = _upload_with_retry(_local_crop(key), key)
        _record_key(uploaded_path, rec["id"], key, uploaded)
    return key


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="crop only, do not upload")
    ap.add_argument("--limit", type=int, default=0, help="stop after N questions")
    ap.add_argument("--out", default=str(HERE / "out" / "rows.json"))
    args = ap.parse_args(argv)

    poppler.preflight()
    if not args.dry_run:
        preflight_credentials()
    out_path = Path(args.out)
    skipped_path = out_path.with_name("skipped.json")
    uploaded_path = out_path.with_name("uploaded.json")
    mode_path = out_path.with_name("mode.json")
    uploaded_rationales_path = out_path.with_name("uploaded-rationales.json")
    skipped_rationales_path = out_path.with_name("skipped-rationales.json")
    rationale_crops_path = CROPS / "rationale-crops.json"
    uploaded = _load_uploaded(uploaded_path)
    uploaded_rationales = _load_keys(uploaded_rationales_path)
    rationale_crops = _load_keys(rationale_crops_path)

    rows: list[dict] = []
    skipped: list[dict] = []
    skipped_rationales: list[dict] = []
    corpus_seen: set[str] = set()

    def _persist() -> None:
        _atomic_write_text(out_path, json.dumps(rows, indent=1))
        _atomic_write_text(skipped_path, json.dumps(skipped, indent=1))
        _atomic_write_text(skipped_rationales_path, json.dumps(skipped_rationales, indent=1))
        _atomic_write_text(mode_path, json.dumps({"dry_run": args.dry_run}, indent=1))

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
                if rec["id"] in corpus_seen:
                    # parse_export only dedupes within one PDF's own export;
                    # an id exported under two overlapping filters (spec
                    # integrity rule 3) would otherwise be re-cropped and
                    # re-uploaded here, then rejected as a duplicate id only
                    # much later by build_sat_bank.py's validate() -- after
                    # a multi-hour upload already ran. Caught here instead,
                    # with a reason distinct from a parse- or crop-stage
                    # reject so it's clear the record itself was fine.
                    skipped.append({
                        "id": rec["id"], "reason": "duplicate-across-exports",
                        "stage": "dedupe", "section": rec["section"],
                    })
                    continue
                corpus_seen.add(rec["id"])
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
                    # Store the canonical key _upload_with_retry's return
                    # value carries (upload_file's, via guard_prefix's
                    # normalised form) -- not img, bucket_path's raw output
                    # -- as the row's "img". Identical today, but this is
                    # the validated-vs-transmitted distinction commit
                    # 3b848bb closed for upload_file itself; storing img
                    # here instead would silently reopen it one call up.
                    img = _upload_with_retry(dest, img)
                    _record_uploaded(uploaded_path, rec["id"], uploaded)
                row = {
                    **rec,
                    "img": img,
                    "ref": f"SAT Question Bank {rec['id']}",
                    "source": "question-bank",
                }
                # After the question's own upload, before the row is
                # appended: a row still exists only once everything it
                # points at is in the bucket.
                rationale_img = _rationale_image(
                    pdf, a, rec, dry_run=args.dry_run,
                    crops=rationale_crops, crops_path=rationale_crops_path,
                    uploaded=uploaded_rationales, uploaded_path=uploaded_rationales_path,
                    skipped=skipped_rationales,
                )
                if rationale_img is not None:
                    row["rationale_img"] = rationale_img
                rows.append(row)
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
            print(f"WARNING: failed to persist rows.json/skipped.json/skipped-rationales.json: {exc}", file=sys.stderr)

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
    with_rationale = sum(1 for r in rows if "rationale_img" in r)
    print(f"  {with_rationale} of {len(rows)} rows carry a rationale image")
    print(f"  {len(skipped_rationales)} rationales skipped (text fallback) -> {skipped_rationales_path.name}")
    if skipped_rationales:
        histogram = collections.Counter(_reason_key(s["reason"]) for s in skipped_rationales)
        for reason, count in histogram.most_common():
            print(f"    {reason}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
