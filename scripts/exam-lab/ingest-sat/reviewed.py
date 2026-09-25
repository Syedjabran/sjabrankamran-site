"""reviewed.json: the hand-verified entries (spec section 6).

Two kinds, each for one practice test and each citing what was verified:
`answer_overrides` ship over the parsed answer; `conversion_exceptions`
excuse one sanity check for exactly the printed cells they name and never
change a value.
"""
import json
from pathlib import Path

PATH = Path(__file__).resolve().parent / "reviewed.json"


def entries(kind: str, test: int) -> list[dict]:
    """The `kind` entries recorded for practice test `test`."""
    if not PATH.exists():
        return []
    return [e for e in json.loads(PATH.read_text(encoding="utf-8")).get(kind, []) if e["test"] == test]
