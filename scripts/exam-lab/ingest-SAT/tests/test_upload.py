import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from upload import bucket_path, guard_prefix, preflight_credentials, upload_file


def test_bucket_path_is_under_sat_prefix():
    p = bucket_path("ac472881", "math")
    assert p.startswith("sat/")
    assert p == "sat/math/ac472881.jpg"


def test_guard_rejects_paths_outside_sat():
    guard_prefix("sat/math/x.jpg")           # must not raise
    with pytest.raises(ValueError):
        guard_prefix("o-level/p1/x.jpg")
    with pytest.raises(ValueError):
        guard_prefix("sat/../o-level/x.jpg")


def test_guard_rejects_prefix_boundary_lookalikes():
    """"sat" is a prefix of "satellite" as a raw string, but `PREFIX` is
    "sat/" (with the trailing slash), so a sibling directory that merely
    starts with the same three letters must not slip through.
    """
    with pytest.raises(ValueError):
        guard_prefix("satellite/x.jpg")


def test_guard_rejects_multi_level_traversal_back_to_bucket_root():
    """"sat/.." walks all the way back out to the bucket root, then
    "sat/../.." would try to walk above it -- posixpath.normpath leaves a
    leading ".." in place for that rather than raising, so the explicit
    ".." in dest check (not just the startswith check) is what actually
    catches it.
    """
    with pytest.raises(ValueError):
        guard_prefix("sat/../../o-level/x.jpg")


def test_guard_rejects_absolute_path_escape():
    with pytest.raises(ValueError):
        guard_prefix("/etc/passwd")


def test_guard_rejects_backslash_traversal_attempt():
    """posixpath only treats "/" as a separator, so a Windows-style
    "..\\..\\" segment doesn't get collapsed by normpath the way "../../"
    would. It's still caught, though: the literal ".." substring is present
    in `dest` regardless of which slash follows it, and `guard_prefix`
    checks for that substring independently of normalisation.
    """
    with pytest.raises(ValueError):
        guard_prefix("sat/..\\..\\o-level/x.jpg")


def test_guard_allows_harmless_leading_dot_segment():
    """A leading "./" is not a traversal attempt -- it normalises to a path
    that is still genuinely confined under sat/, so it must be allowed.
    """
    guard_prefix("./sat/x.jpg")  # must not raise


def test_guard_prefix_returns_the_normalised_canonical_path():
    """guard_prefix's return value, not the caller's raw `dest`, is what a
    write must use as the object key (see upload_file below) -- otherwise a
    non-canonical-but-valid dest validates against one string while writing
    to a different literal key than `bucket_path` would have produced.
    """
    assert guard_prefix("sat/math/x.jpg") == "sat/math/x.jpg"
    assert guard_prefix("./sat/math/x.jpg") == "sat/math/x.jpg"
    assert guard_prefix("sat//math//x.jpg") == "sat/math/x.jpg"


def _fake_response(status: int) -> MagicMock:
    """A mock urlopen result usable as a context manager: `resp.status` is
    set, and `with ... as resp` yields the same mock. No socket is ever
    opened -- this replaces `urllib.request.urlopen` entirely.
    """
    resp = MagicMock()
    resp.status = status
    resp.__enter__.return_value = resp
    resp.__exit__.return_value = False
    return resp


def test_upload_file_transmits_the_normalised_dest_not_the_raw_one(tmp_path):
    """guard_prefix validates the normalised form of `dest`; upload_file
    must use that SAME normalised string as the object key it sends, not
    the raw argument it was given. Otherwise a non-canonical-but-valid dest
    ("./sat/math/x.jpg") would pass the guard on one string and transmit a
    different one, silently creating a near-duplicate object instead of
    overwriting the canonical one and breaking the idempotent-upload
    property. `urlopen` is fully mocked -- no network request is made.
    """
    src = tmp_path / "crop.jpg"
    src.write_bytes(b"fake-jpeg-bytes")

    with patch("upload.urllib.request.urlopen", return_value=_fake_response(200)) as mock_urlopen:
        result = upload_file(src, "./sat/math/x.jpg", url="https://example.supabase.co", key="fake-key")

    assert result == "sat/math/x.jpg"
    sent_request = mock_urlopen.call_args[0][0]
    assert sent_request.full_url == "https://example.supabase.co/storage/v1/object/exam-assets/sat/math/x.jpg"


def test_upload_file_treats_204_as_success_not_failure(tmp_path):
    """204 No Content is a plausible response to an upsert overwrite.
    `urlopen` itself raises `HTTPError` for any real 4xx/5xx before the
    explicit status check inside `upload_file` is ever reached, so that
    check only ever sees a genuine 2xx -- it must not misfire a false
    "upload failed" on this one. `urlopen` is fully mocked -- no network
    request is made.
    """
    src = tmp_path / "crop.jpg"
    src.write_bytes(b"fake-jpeg-bytes")

    with patch("upload.urllib.request.urlopen", return_value=_fake_response(204)):
        result = upload_file(src, "sat/math/x.jpg", url="https://example.supabase.co", key="fake-key")

    assert result == "sat/math/x.jpg"


def test_upload_file_passes_a_socket_timeout_to_urlopen(tmp_path):
    """socket.getdefaulttimeout() is None on this machine, so with no
    explicit timeout a half-open connection during the 3,730-file run would
    block forever with no output. `urlopen` is fully mocked -- no network
    request is made.
    """
    src = tmp_path / "crop.jpg"
    src.write_bytes(b"fake-jpeg-bytes")

    with patch("upload.urllib.request.urlopen", return_value=_fake_response(200)) as mock_urlopen:
        upload_file(src, "sat/math/x.jpg", url="https://example.supabase.co", key="fake-key")

    assert mock_urlopen.call_args.kwargs["timeout"] == 60


# --- preflight_credentials -------------------------------------------------

def test_preflight_credentials_raises_when_missing(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        preflight_credentials()


def test_preflight_credentials_passes_when_present(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-key-for-test")
    preflight_credentials()  # must not raise


def test_preflight_credentials_reports_each_missing_var_by_name(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_SERVICE_ROLE_KEY"):
        preflight_credentials()
