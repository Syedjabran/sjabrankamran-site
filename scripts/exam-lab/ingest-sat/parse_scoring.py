"""Read a practice test's raw-to-scaled conversion tables.

These tables are the *only* thing that makes a score official (spec section
10.5). A score that did not come from one of them is labelled an estimate,
so a mis-parsed table is worse than no table: it would put College Board's
name on a number College Board never published.

The tables cannot be read from the plain text stream. pdftotext emits them
column-major -- the entire raw-score column, then the entire LOWER column,
then UPPER -- so reading linearly pairs raw score 0 with raw score 1's
bound and shifts the whole curve by a row. Everything here works in -bbox
coordinate space instead, the same discipline crop_qbank applies to the
question header.

Nothing hard-codes an x position: columns are found by clustering the
numbers' own left edges, and the raw-score column is identified by its
values forming a 0..N run. A different page layout in a future test shifts
the numbers but not that structure.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bbox

_INT = re.compile(r"^\d{1,4}$")
# Two numbers belong to the same column when their left edges are closer
# than this. Real columns in these guides are ~60pt apart and a column's own
# numbers share a left edge within a point or two, so 20pt sits clear of
# both. Right-aligned digits of differing width are what the tolerance is
# for; it is not a guess at the column spacing.
COLUMN_TOLERANCE = 20.0
ROW_TOLERANCE = 3.0
SCORE_MIN, SCORE_MAX = 200, 800
# Section raw-score ceilings, from the printed worksheet: Reading and
# Writing is 33 + 33, Math is 27 + 27.
RAW_MAX = {"rw": 66, "math": 54}


def _columns(words: list[dict]) -> list[list[dict]]:
    """Numeric words grouped into columns by their left edge, left to right."""
    nums = sorted((w for w in words if _INT.match(w["text"])), key=lambda w: w["left"])
    cols: list[list[dict]] = []
    for w in nums:
        if cols and w["left"] - cols[-1][-1]["left"] <= COLUMN_TOLERANCE:
            cols[-1].append(w)
        else:
            cols.append([w])
    return cols


def _is_raw_column(col: list[dict]) -> bool:
    """A raw-score column is a 0..N run read top to bottom. Scaled-score
    columns repeat values (200 appears many times) and never start at 0."""
    vals = [int(w["text"]) for w in sorted(col, key=lambda w: w["top"])]
    return len(vals) >= 4 and vals[0] == 0 and vals == list(range(len(vals)))


def _read_row(col: list[dict], top: float) -> int | None:
    for w in col:
        if abs(w["top"] - top) <= ROW_TOLERANCE:
            return int(w["text"])
    return None


def parse_tables(pages: dict[int, list[dict]]) -> dict[str, dict[int, tuple[int, int]]]:
    """{"rw": {raw: (lower, upper)}, "math": {...}}.

    Each raw-score column found anywhere in the guide contributes its rows;
    a table split across pages or page-columns therefore assembles itself.
    Which table is which is decided at the end by raw-score ceiling, not by
    position: Reading and Writing reaches 66, Math reaches 54.
    """
    found: list[dict[int, tuple[int, int]]] = []
    for words in pages.values():
        cols = _columns(words)
        for i, col in enumerate(cols):
            if not _is_raw_column(col) or i + 2 >= len(cols):
                continue
            lower_col, upper_col = cols[i + 1], cols[i + 2]
            table: dict[int, tuple[int, int]] = {}
            for w in col:
                lo = _read_row(lower_col, w["top"])
                hi = _read_row(upper_col, w["top"])
                if lo is not None and hi is not None:
                    table[int(w["text"])] = (lo, hi)
            if table:
                found.append(table)

    merged: dict[str, dict[int, tuple[int, int]]] = {"rw": {}, "math": {}}
    for table in found:
        ceiling = max(table)
        section = "rw" if ceiling > RAW_MAX["math"] else "math"
        merged[section].update(table)
    return merged


def check_tables(tables: dict[str, dict[int, tuple[int, int]]]) -> list[str]:
    """Every way a mis-parsed table can be caught without a second source.

    A table that passes all of these is not *proven* right, but every
    failure mode seen while developing this -- a shifted row, a column read
    as its neighbour, a page half-read -- breaks at least one of them.
    """
    problems: list[str] = []
    for section, table in tables.items():
        if not table:
            problems.append(f"{section}: no conversion table found")
            continue
        expected = set(range(0, RAW_MAX[section] + 1))
        if set(table) != expected:
            gaps = sorted(expected - set(table))
            problems.append(
                f"{section}: expected raw scores 0-{RAW_MAX[section]}, "
                f"{len(gaps)} missing ({gaps[:5]})"
            )
        for raw, (lo, hi) in sorted(table.items()):
            if lo > hi:
                problems.append(f"{section} raw {raw}: lower {lo} above upper {hi}")
            if not (SCORE_MIN <= lo <= SCORE_MAX and SCORE_MIN <= hi <= SCORE_MAX):
                problems.append(f"{section} raw {raw}: ({lo}, {hi}) outside 200-800")
        ordered = [table[r] for r in sorted(table)]
        for (lo, hi), (nlo, nhi) in zip(ordered, ordered[1:]):
            if nlo < lo or nhi < hi:
                problems.append(f"{section}: curve is not monotonic at ({lo}, {hi}) -> ({nlo}, {nhi})")
                break
    return problems


def tables_for(pdf: Path) -> dict[str, dict[int, tuple[int, int]]]:
    return parse_tables(bbox.words_by_page(bbox.bbox_xml(pdf)))
