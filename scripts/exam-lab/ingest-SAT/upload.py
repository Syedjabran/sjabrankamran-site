"""Upload question crops to the private Supabase `exam-assets` bucket.

Every write is under the `sat/` prefix and `guard_prefix` enforces it, so the
existing 9702 and o-level assets cannot be touched by this pipeline. Every
write path in this module -- there is currently only `upload_file` -- must
call `guard_prefix` before it does anything else, so a bad `dest` never
reaches the network request.
"""
import os
import posixpath
from pathlib import Path

import urllib.request

BUCKET = "exam-assets"
PREFIX = "sat/"


def bucket_path(qid: str, section: str) -> str:
    return f"{PREFIX}{section}/{qid}.jpg"


def guard_prefix(dest: str) -> None:
    """Raise unless `dest` is confined under `PREFIX`.

    Two independent checks, not one: `normalised.startswith(PREFIX)` catches
    a `dest` that resolves outside `sat/` once `..` segments are walked
    (e.g. "sat/../o-level/x.jpg" -> "o-level/x.jpg"), and the literal
    `".." in dest` catches any attempted traversal that normalisation alone
    wouldn't -- for instance a path that walks above the bucket root
    entirely ("sat/../../o-level/x.jpg" normalises to "../o-level/x.jpg",
    which already fails the first check, but the second check also fires
    independently) or a Windows-style "..\\..\\" segment, which
    posixpath.normpath does not collapse (it only treats "/" as a
    separator) but which still contains the literal ".." substring. Since
    every escape requires walking up a directory level, and every way of
    doing that spells "..", a `dest` containing no ".." at all cannot leave
    `sat/` once it's already confirmed to start there.
    """
    normalised = posixpath.normpath(dest)
    if not normalised.startswith(PREFIX) or ".." in dest:
        raise ValueError(f"refusing to write outside {PREFIX}: {dest}")


def upload_file(path: Path, dest: str, *, url: str | None = None, key: str | None = None) -> str:
    """PUT one file. Idempotent: an existing object at `dest` is overwritten."""
    guard_prefix(dest)
    url = url or os.environ["SUPABASE_URL"]
    key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    endpoint = f"{url.rstrip('/')}/storage/v1/object/{BUCKET}/{dest}"
    req = urllib.request.Request(
        endpoint,
        data=path.read_bytes(),
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        },
    )
    with urllib.request.urlopen(req) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"upload failed {resp.status} for {dest}")
    return dest
