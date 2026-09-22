import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from upload import bucket_path, guard_prefix


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
