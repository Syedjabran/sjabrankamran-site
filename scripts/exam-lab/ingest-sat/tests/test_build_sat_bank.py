import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_sat_bank import check_provenance, ship_rationale_images, validate

GOOD = [{
    "id": "ac472881", "section": "math", "domain": "algebra",
    "skill": "Linear equations in one variable", "difficulty": "H",
    "answer": {"kind": "spr", "accepted": ["403"]},
    "rationale": "The correct answer is 403.",
    "img": "sat/math/ac472881.jpg", "ref": "SAT Question Bank ac472881",
    "source": "question-bank",
}]


def test_validate_accepts_a_good_row():
    validate(GOOD)


def test_validate_rejects_missing_image():
    bad = [{**GOOD[0], "img": ""}]
    with pytest.raises(ValueError, match="image"):
        validate(bad)


def test_validate_rejects_duplicate_ids():
    with pytest.raises(ValueError, match="duplicate"):
        validate(GOOD + GOOD)


def test_validate_rejects_mcq_without_an_index():
    bad = [{**GOOD[0], "answer": {"kind": "mcq"}}]
    with pytest.raises(ValueError, match="answer"):
        validate(bad)


def test_validate_rejects_path_outside_sat_prefix():
    bad = [{**GOOD[0], "img": "o-level/p1/x.jpg"}]
    with pytest.raises(ValueError, match="prefix"):
        validate(bad)


def test_validate_tolerates_and_preserves_answer_source_key():
    """Real answer dicts carry a `source` key (answer-line / rationale /
    entry-note / rationale-stated) recording how parse_qbank established the
    answer -- the audit trail for the ~1 in 10 answers that come from
    rationale prose rather than the official `Correct Answer:` line.
    validate() must accept a row whose answer dict carries it without
    requiring it (a hand-authored row may omit it) and without stripping it.
    """
    with_source = [{**GOOD[0], "answer": {**GOOD[0]["answer"], "source": "answer-line"}}]
    validate(with_source)
    assert with_source[0]["answer"]["source"] == "answer-line"


def test_validate_rejects_unknown_section():
    """`section` is a closed 2-value vocabulary ("rw"/"math") -- this is a
    deliberate independent re-check of what extract_sat.py should already
    have gotten right, not a rule this gate invents; a typo anywhere
    upstream must not ship silently.
    """
    bad = [{**GOOD[0], "section": "science"}]
    with pytest.raises(ValueError, match="section"):
        validate(bad)


def test_validate_rejects_unknown_difficulty():
    bad = [{**GOOD[0], "difficulty": "X"}]
    with pytest.raises(ValueError, match="difficulty"):
        validate(bad)


def test_validate_rejects_unknown_domain():
    bad = [{**GOOD[0], "domain": "algebrra"}]  # typo, not a real domain slug
    with pytest.raises(ValueError, match="domain"):
        validate(bad)


def test_validate_rejects_non_dict_answer():
    """A malformed `answer` (not an object at all) must fail with this
    gate's own ValueError, not an AttributeError from calling `.get()` on
    something that isn't a dict -- still loud, but with a confusing
    traceback that doesn't say which row or why.
    """
    bad = [{**GOOD[0], "answer": "B"}]
    with pytest.raises(ValueError, match="answer"):
        validate(bad)


def test_validate_rejects_boolean_as_mcq_index():
    """`bool` is a subclass of `int` in Python, so `isinstance(True, int)`
    is True -- `correct: true` must not silently pass as a valid MCQ index.
    """
    bad = [{**GOOD[0], "answer": {"kind": "mcq", "correct": True}}]
    with pytest.raises(ValueError, match="answer"):
        validate(bad)


def test_validate_rejects_missing_rationale():
    """SATQuestion (design doc section 5.2) has 10 fields, not the 9
    REQUIRED used to list -- a row with no `rationale` at all used to pass.
    """
    bad = [{k: v for k, v in GOOD[0].items() if k != "rationale"}]
    with pytest.raises(ValueError, match="rationale"):
        validate(bad)


def test_validate_rejects_empty_rationale():
    bad = [{**GOOD[0], "rationale": ""}]
    with pytest.raises(ValueError, match="rationale"):
        validate(bad)


# --- check_provenance (C1) -------------------------------------------------

def _rows_at(tmp_path: Path, rows: list[dict] | None = None) -> Path:
    path = tmp_path / "rows.json"
    path.write_text(json.dumps(rows if rows is not None else GOOD), encoding="utf-8")
    return path


def test_check_provenance_refuses_dry_run_rows_by_default(tmp_path):
    """The exact mistake C1 exists to catch: running this against the
    dry-run rows.json sitting on disk would otherwise accept all of it and
    write a bank pointing at bucket objects that don't exist.
    """
    rows_path = _rows_at(tmp_path)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": True}), encoding="utf-8")
    with pytest.raises(ValueError, match="dry-run"):
        check_provenance(GOOD, rows_path, allow_dry_run=False)


def test_check_provenance_allows_dry_run_rows_with_explicit_override(tmp_path, capsys):
    rows_path = _rows_at(tmp_path)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": True}), encoding="utf-8")
    check_provenance(GOOD, rows_path, allow_dry_run=True)  # must not raise
    assert "WARNING" in capsys.readouterr().err


def test_check_provenance_refuses_when_mode_file_is_missing(tmp_path):
    """A rows.json with no mode.json sidecar at all -- e.g. from a version
    of extract_sat.py that predates this fix -- is unverifiable and must be
    treated the same as a dry run, not trusted by default.
    """
    rows_path = _rows_at(tmp_path)
    with pytest.raises(ValueError, match="mode.json"):
        check_provenance(GOOD, rows_path, allow_dry_run=False)


def test_check_provenance_accepts_live_rows_confirmed_in_uploaded_json(tmp_path):
    rows_path = _rows_at(tmp_path)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": False}), encoding="utf-8")
    (tmp_path / "uploaded.json").write_text(json.dumps([GOOD[0]["id"]]), encoding="utf-8")
    check_provenance(GOOD, rows_path, allow_dry_run=False)  # must not raise


def test_check_provenance_builds_a_smaller_valid_bank_from_a_partial_live_run(tmp_path):
    """The likelier real shape: a live run uploads N of the corpus then
    dies. extract_sat.py's append-after-upload invariant means rows.json
    already contains only the successfully-uploaded rows; if uploaded.json
    confirms every one of them, this must build fine -- an incomplete
    corpus is not, by itself, a reason to refuse.
    """
    two_rows = [GOOD[0], {**GOOD[0], "id": "bbbbbbbb"}]
    rows_path = _rows_at(tmp_path, rows=two_rows)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": False}), encoding="utf-8")
    (tmp_path / "uploaded.json").write_text(
        json.dumps([two_rows[0]["id"], two_rows[1]["id"]]), encoding="utf-8"
    )
    check_provenance(two_rows, rows_path, allow_dry_run=False)  # must not raise


def test_check_provenance_refuses_a_live_row_with_no_upload_confirmation(tmp_path):
    rows_path = _rows_at(tmp_path)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": False}), encoding="utf-8")
    (tmp_path / "uploaded.json").write_text(json.dumps([]), encoding="utf-8")
    with pytest.raises(ValueError, match="upload confirmation"):
        check_provenance(GOOD, rows_path, allow_dry_run=False)


def test_check_provenance_refuses_a_live_run_with_no_uploaded_json(tmp_path):
    rows_path = _rows_at(tmp_path)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": False}), encoding="utf-8")
    with pytest.raises(ValueError, match="uploaded.json"):
        check_provenance(GOOD, rows_path, allow_dry_run=False)


# --- rationale images (Task 11) ---------------------------------------------
#
# A rationale's key is a content hash (upload.rationale_bucket_path), and
# uploaded-rationales.json records, per question id, the key actually
# uploaded. A row ships `rationaleImg` only when that record holds exactly
# the row's key.

KEY_A = "sat/math/r/0123456789abcdef0123.jpg"
KEY_B = "sat/math/r/fedcba9876543210fedc.jpg"
WITH_R = [
    {**GOOD[0], "rationale_img": KEY_A},
    {**GOOD[0], "id": "bbbbbbbb", "rationale_img": KEY_B},
    {**GOOD[0], "id": "cccccccc"},  # its rationale couldn't be cropped
]


def _live_at(tmp_path: Path, rationales: object | None) -> Path:
    rows_path = _rows_at(tmp_path, WITH_R)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": False}), encoding="utf-8")
    (tmp_path / "uploaded.json").write_text(json.dumps([r["id"] for r in WITH_R]), encoding="utf-8")
    if rationales is not None:
        (tmp_path / "uploaded-rationales.json").write_text(json.dumps(rationales), encoding="utf-8")
    return rows_path


def test_live_build_ships_only_confirmed_rationale_images(tmp_path):
    """Controller ruling 2: a row whose rationale key was not recorded as
    uploaded ships without `rationaleImg` (text fallback), never with a
    dead link -- and the build still succeeds."""
    rows_path = _live_at(tmp_path, {"ac472881": KEY_A})
    check_provenance(WITH_R, rows_path, allow_dry_run=False)
    out, lacking = ship_rationale_images(WITH_R, rows_path, allow_dry_run=False)
    assert out[0]["rationaleImg"] == KEY_A
    assert "rationaleImg" not in out[1] and "rationaleImg" not in out[2]
    assert lacking == 2
    assert all("rationale_img" not in r for r in out)  # the snake-case row field never reaches the bank


def test_live_build_refuses_a_rationale_key_other_than_the_one_uploaded(tmp_path):
    """The record confirms the id's upload, but of a different object (an
    earlier render, since re-rendered to new bytes and a new key). The
    row's key was never uploaded, so it ships without one."""
    rows_path = _live_at(tmp_path, {"ac472881": KEY_B, "bbbbbbbb": KEY_B})
    out, lacking = ship_rationale_images(WITH_R, rows_path, allow_dry_run=False)
    assert "rationaleImg" not in out[0]
    assert out[1]["rationaleImg"] == KEY_B
    assert lacking == 2


def test_live_build_with_no_rationale_record_ships_every_row_with_the_text_fallback(tmp_path):
    rows_path = _live_at(tmp_path, None)
    out, lacking = ship_rationale_images(WITH_R, rows_path, allow_dry_run=False)
    assert lacking == 3
    assert all("rationaleImg" not in r and "rationale_img" not in r for r in out)


def test_live_build_refuses_a_rationale_record_that_is_not_a_key_per_id(tmp_path):
    """A list of ids (the pre-content-hash format) or any other shape says
    nothing about which key was uploaded -- fail loudly rather than guess."""
    rows_path = _live_at(tmp_path, ["ac472881", "bbbbbbbb"])
    with pytest.raises(ValueError, match="uploaded-rationales.json"):
        ship_rationale_images(WITH_R, rows_path, allow_dry_run=False)


def test_dry_run_build_keeps_rationale_images_under_allow_dry_run(tmp_path):
    rows_path = _rows_at(tmp_path, WITH_R)
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": True}), encoding="utf-8")
    out, lacking = ship_rationale_images(WITH_R, rows_path, allow_dry_run=True)
    assert [r.get("rationaleImg") for r in out] == [KEY_A, KEY_B, None]
    assert lacking == 1
    with pytest.raises(ValueError, match="dry-run"):
        ship_rationale_images(WITH_R, rows_path, allow_dry_run=False)


def test_ship_rationale_images_does_not_mutate_its_input(tmp_path):
    rows_path = _live_at(tmp_path, {})
    ship_rationale_images(WITH_R, rows_path, allow_dry_run=False)
    assert WITH_R[0]["rationale_img"] == KEY_A


def test_validate_accepts_a_content_hash_rationale_key():
    validate([{**GOOD[0], "rationale_img": KEY_A}])


@pytest.mark.parametrize("key", [
    "o-level/r/0123456789abcdef0123.jpg",       # outside the sat/ prefix
    "sat/math/ac472881-r.jpg",                  # the old, id-derived key
    "sat/math/r/ac472881.jpg",                  # id-derived under the new directory
    "sat/math/r/ac4728810123456789ab.jpg",      # hash-shaped but carries the id
    "sat/rw/r/0123456789abcdef0123.jpg",        # another section's directory
    "sat/math/r/0123456789ABCDEF0123.jpg",      # not a lowercase hex digest
    "sat/math/r/0123456789abcdef012.jpg",       # wrong length
])
def test_validate_rejects_a_rationale_key_that_is_not_an_opaque_content_hash(key):
    with pytest.raises(ValueError, match="rationale"):
        validate([{**GOOD[0], "rationale_img": key}])
