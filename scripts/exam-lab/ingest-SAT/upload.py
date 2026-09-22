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
CREDENTIAL_VARS = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
# Half-open connections happen on a run this long; with no explicit
# timeout, urlopen inherits socket.getdefaulttimeout() (None on this
# machine), which blocks forever with no output and makes the
# TimeoutError arm of extract_sat.py's retry handler dead code.
REQUEST_TIMEOUT = 60


def bucket_path(qid: str, section: str) -> str:
    """Canonical object key for one question's crop, under `PREFIX`.

    Does no sanitisation of its own -- never write this string to the
    bucket directly. `upload_file`'s call to `guard_prefix` is the real
    safety boundary; always go through it.
    """
    return f"{PREFIX}{section}/{qid}.jpg"


def guard_prefix(dest: str) -> str:
    """Raise unless `dest` is confined under `PREFIX`; otherwise return the
    normalised, canonical form of `dest`.

    Callers that write to the bucket MUST use the returned string as the
    object key, not the original `dest` argument. Validating the
    normalised form while transmitting the raw one would let a
    non-canonical-but-valid dest (e.g. "./sat/x.jpg" or "sat//x.jpg") pass
    the guard while writing to a different literal key than the canonical
    one `bucket_path` would have produced -- silently creating a
    near-duplicate object instead of overwriting the existing one, and
    breaking the idempotent-upload property.

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
    return normalised


def preflight_credentials() -> None:
    """Fail fast if a required Supabase credential is missing, before any
    crop is rendered -- not lazily inside `upload_file`, which reads
    `os.environ[...]` directly and would otherwise raise a bare `KeyError`
    only once the first live upload is attempted, after the first crop of a
    potentially many-minute run has already been produced.

    Checks only for *presence* in the environment, never reads or logs the
    value itself. Call this beside `poppler.preflight()`, and skip it under
    `--dry-run` -- a machine with no Supabase credentials configured at all
    must still be able to run a dry-run crop-only pass.
    """
    missing = [name for name in CREDENTIAL_VARS if name not in os.environ]
    if missing:
        raise RuntimeError(
            f"missing required environment variable(s): {', '.join(missing)}. "
            "Set them before running a live upload (not needed for --dry-run)."
        )


def upload_file(path: Path, dest: str, *, url: str | None = None, key: str | None = None) -> str:
    """PUT one file. Idempotent: an existing object at `dest` is overwritten.

    Uses `guard_prefix`'s returned, normalised path as the actual object
    key -- not the raw `dest` argument -- so the string that was validated
    and the string that gets transmitted are the same by construction. See
    `guard_prefix` for why that distinction matters.
    """
    canonical_dest = guard_prefix(dest)
    url = url or os.environ["SUPABASE_URL"]
    key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    endpoint = f"{url.rstrip('/')}/storage/v1/object/{BUCKET}/{canonical_dest}"
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
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        # urlopen itself raises HTTPError for any real 4xx/5xx before this
        # is ever reached, so this only ever sees a genuine 2xx response --
        # it exists to catch the full success range (e.g. 204 No Content,
        # a plausible response to an upsert overwrite) rather than a
        # narrower (200, 201) check that would misfire a false "upload
        # failed" on a perfectly successful write.
        if not (200 <= resp.status < 300):
            raise RuntimeError(f"upload failed {resp.status} for {canonical_dest}")
    return canonical_dest
