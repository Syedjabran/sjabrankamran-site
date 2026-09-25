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

Measured on all 8 guides (page 5 of each), the table is ONE grid titled
"Raw Score Conversion Table: Section Scores", not two tables side by side:

    Raw Score Conversion Table: Section Scores
            Reading and Writing      Math        Reading and Writing      Math
    (# OF CORRECT ANSWERS) LOWER UPPER LOWER UPPER  (# OF CORRECT ANSWERS) LOWER UPPER LOWER UPPER
     0                     200   200   200   200    34                     480   500   520   550
     ...                                            ...
    33                     470   490   510   540    54 ...  (Math cells blank from 55)
                                                    66                     790   800

One shared raw-score column feeds both sections, and the 67 rows are split
into two bands (raw 0-33, raw 34-66) printed next to each other. Above the
title sits a fill-in worksheet whose MODULE 1 / MODULE 2 digits land in the
raw column's own x-range, which is what defeated clustering by x alone.

So the grid is located by what is printed on it, never by an x position:
the title bounds it from above (the worksheet is above the title, so it is
never read); the header row names each column ("(# OF CORRECT ANSWERS)",
then LOWER/UPPER pairs), and a number belongs to the column whose header
spans its centre; the section label printed above each LOWER/UPPER pair
decides whether that pair is Reading and Writing or Math -- not its
position, and not how far its raw scores run.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bbox
import reviewed

# Raw scores top out at 66 and scaled scores at 800, so no cell is wider
# than three digits; the footer's copyright year, which sits in the raw
# column's x-range below the grid, is not a cell.
_INT = re.compile(r"^\d{1,3}$")
# Words on one printed row share a top edge to within a fraction of a point;
# the grid's rows are 9pt apart. 3pt keeps a row together without ever
# reaching the next one.
ROW_TOLERANCE = 3.0
SCORE_MIN, SCORE_MAX = 200, 800
# Section raw-score ceilings, from the printed worksheet: Reading and
# Writing is 33 + 33, Math is 27 + 27.
RAW_MAX = {"rw": 66, "math": 54}
# Compared after `_norm`, so case, punctuation and letter-spacing in the
# printed title do not matter. A prefix match, so a "(continued)" title on a
# later page is read too.
TITLE = "rawscoreconversiontablesectionscores"
RAW_HEADER = "correctanswers"

Span = tuple[float, float]


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _centre(word: dict) -> float:
    return (word["left"] + word["right"]) / 2


def _within(word: dict, span: Span) -> bool:
    return span[0] <= _centre(word) <= span[1]


def _lines(words: list[dict]) -> list[list[dict]]:
    """Words grouped into printed rows, top to bottom, each left to right."""
    rows: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["left"])):
        if rows and abs(w["top"] - rows[-1][0]["top"]) <= ROW_TOLERANCE:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [sorted(row, key=lambda w: w["left"]) for row in rows]


def _is_title(line: list[dict]) -> bool:
    return "".join(_norm(w["text"]) for w in line).startswith(TITLE)


def _bands(line: list[dict]) -> list[tuple[Span, list[tuple[Span, Span]]]]:
    """[(raw_span, [(lower_span, upper_span), ...])] for a header row.

    LOWER and UPPER are single words; every run of other words between them
    is one heading. A band starts at a heading that reads "(# OF CORRECT
    ANSWERS)" and owns the LOWER/UPPER pairs that follow it. A row with no
    such band (the worksheet's own LOWER/UPPER boxes, say) is not a header.
    """
    cells: list[tuple[str, Span, str]] = []
    run: list[dict] = []

    def close_run() -> None:
        if run:
            text = "".join(_norm(w["text"]) for w in run)
            cells.append(("heading", (run[0]["left"], run[-1]["right"]), text))
            run.clear()

    for w in line:
        kind = _norm(w["text"])
        if kind in ("lower", "upper"):
            close_run()
            cells.append((kind, (w["left"], w["right"]), kind))
        else:
            run.append(w)
    close_run()

    bands = []
    for i, (kind, span, text) in enumerate(cells):
        if kind != "heading" or RAW_HEADER not in text:
            continue
        pairs = []
        j = i + 1
        while j + 1 < len(cells) and cells[j][0] == "lower" and cells[j + 1][0] == "upper":
            pairs.append((cells[j][1], cells[j + 1][1]))
            j += 2
        if pairs:
            bands.append((span, pairs))
    return bands


def _labels(lines: list[list[dict]]) -> list[tuple[str, Span]]:
    """Section labels ("Reading and Writing", "Math") and the x-span each
    is printed over."""
    found = []
    for line in lines:
        words = [_norm(w["text"]) for w in line]
        for i, word in enumerate(words):
            if word == "math":
                found.append(("math", (line[i]["left"], line[i]["right"])))
            elif word == "reading" and words[i + 1:i + 3] == ["and", "writing"]:
                found.append(("rw", (line[i]["left"], line[i + 2]["right"])))
    return found


def _section_of(pair: tuple[Span, Span], labels: list[tuple[str, Span]]) -> str | None:
    """The one section whose label is centred over this LOWER/UPPER pair, or
    None when none or both are -- an unlabelled pair is left unread, and
    check_tables reports the gap, rather than being assigned by guesswork."""
    left, right = pair[0][0], pair[1][1]
    sections = {s for s, (l, r) in labels if left <= (l + r) / 2 <= right}
    return sections.pop() if len(sections) == 1 else None


def _cell(cells: list[dict], span: Span, top: float) -> int | None:
    for w in cells:
        if _within(w, span) and abs(w["top"] - top) <= ROW_TOLERANCE:
            return int(w["text"])
    return None


def _page_rows(words: list[dict]) -> list[tuple[str, int, tuple[int, int]]]:
    """(section, raw, (lower, upper)) for every grid row on one page."""
    lines = _lines(words)
    titles = [i for i, line in enumerate(lines) if _is_title(line)]
    if not titles:
        return []
    # Everything above the first title -- the fill-in worksheet -- is ignored.
    # Headers are rows below it that carry a "(# OF CORRECT ANSWERS)" band.
    headers = [i for i in range(titles[0] + 1, len(lines)) if _bands(lines[i])]
    bounds = sorted(set(titles) | set(headers)) + [len(lines)]

    rows = []
    for h in headers:
        above = max(b for b in bounds if b < h)
        below = min(b for b in bounds if b > h)
        labels = _labels(lines[above + 1:h])
        cells = [w for line in lines[h + 1:below] for w in line if _INT.match(w["text"])]
        for raw_span, pairs in _bands(lines[h]):
            sections = [_section_of(pair, labels) for pair in pairs]
            for raw_word in (w for w in cells if _within(w, raw_span)):
                for (lower_span, upper_span), section in zip(pairs, sections):
                    lo = _cell(cells, lower_span, raw_word["top"])
                    hi = _cell(cells, upper_span, raw_word["top"])
                    # Math's cells are printed blank from raw 55 on; a row
                    # with either bound missing contributes nothing.
                    if section and lo is not None and hi is not None:
                        rows.append((section, int(raw_word["text"]), (lo, hi)))
    return rows


def parse_tables(pages: dict[int, list[dict]]) -> dict[str, dict[int, tuple[int, int]]]:
    """{"rw": {raw: (lower, upper)}, "math": {...}}.

    Every band on every page carrying the table's title contributes its rows,
    so a grid split across bands or continued onto another page assembles
    itself. A raw score read twice with two different bounds is dropped
    rather than resolved by picking one; check_tables then reports it
    missing.
    """
    merged: dict[str, dict[int, tuple[int, int]]] = {"rw": {}, "math": {}}
    conflicts: set[tuple[str, int]] = set()
    for pageno in sorted(pages):
        for section, raw, bounds in _page_rows(pages[pageno]):
            seen = merged[section].setdefault(raw, bounds)
            if seen != bounds:
                conflicts.add((section, raw))
    for section, raw in conflicts:
        del merged[section][raw]
    return {section: dict(sorted(table.items())) for section, table in merged.items()}


def conversion_exceptions(test: int) -> list[dict]:
    """reviewed.json's hand-verified conversion-table exceptions for `test`."""
    return reviewed.entries("conversion_exceptions", test)


def check_tables(
    tables: dict[str, dict[int, tuple[int, int]]],
    test: int | None = None,
    exceptions: list[dict] | None = None,
) -> list[str]:
    """Every way a mis-parsed table can be caught without a second source.

    A table that passes all of these is not *proven* right, but every
    failure mode seen while developing this -- a shifted row, a column read
    as its neighbour, a band or page half-read -- breaks at least one of them.

    Monotonicity is a parse-sanity rule, not a promise College Board makes:
    test 6 really prints R&W raw 40 -> 41 as (540, 580) -> (530, 590). Such a
    break is tolerated only when `exceptions` (by default reviewed.json's, for
    `test`) lists exactly that test, section, raw score and rule, and only
    while the parsed cells on both sides of the break still equal the
    verified `from` (raw - 1) and `printed` (raw) values -- a different
    reading of either is reported, never excused. Without `test`, nothing is
    excused.
    """
    if exceptions is None:
        exceptions = conversion_exceptions(test) if test is not None else []
    listed = {
        (e["section"], e["raw"], e["rule"]): (tuple(e["from"]), tuple(e["printed"]))
        for e in exceptions if e["test"] == test
    }
    problems: list[str] = []
    for section, raw_max in RAW_MAX.items():
        table = tables.get(section) or {}
        if not table:
            problems.append(f"{section}: no conversion table found")
            continue
        expected = set(range(0, raw_max + 1))
        missing = sorted(expected - set(table))
        extra = sorted(set(table) - expected)
        if missing:
            problems.append(
                f"{section}: expected raw scores 0-{raw_max}, "
                f"{len(missing)} missing ({missing[:5]})"
            )
        if extra:
            problems.append(f"{section}: raw scores beyond 0-{raw_max} ({extra[:5]})")
        for raw, (lo, hi) in sorted(table.items()):
            if lo > hi:
                problems.append(f"{section} raw {raw}: lower {lo} above upper {hi}")
            if not (SCORE_MIN <= lo <= SCORE_MAX and SCORE_MIN <= hi <= SCORE_MAX):
                problems.append(f"{section} raw {raw}: ({lo}, {hi}) outside 200-800")
        ordered = sorted(table.items())
        for (raw, (lo, hi)), (nraw, (nlo, nhi)) in zip(ordered, ordered[1:]):
            if nlo < lo or nhi < hi:
                if listed.get((section, nraw, "non-monotonic")) == ((lo, hi), (nlo, nhi)) and nraw == raw + 1:
                    continue
                problems.append(
                    f"{section}: curve is not monotonic from raw {raw} ({lo}, {hi}) "
                    f"to raw {nraw} ({nlo}, {nhi})"
                )
                break
    for (section, raw, rule), cells in sorted(listed.items()):
        for at, printed in zip((raw - 1, raw), cells):
            parsed = (tables.get(section) or {}).get(at)
            if parsed != printed:
                problems.append(
                    f"{section} raw {at}: reviewed.json verified test {test} as printing "
                    f"{printed} ({rule} at raw {raw}), parsed {parsed}"
                )
    return problems


def tables_for(pdf: Path) -> dict[str, dict[int, tuple[int, int]]]:
    return parse_tables(bbox.words_by_page(bbox.bbox_xml(pdf)))
