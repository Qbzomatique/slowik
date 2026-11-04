"""Wspólne funkcje testów w Pythonie: wczytywanie haseł i słownika."""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
START_DAY = (2026, 11, 4)  # dzień #1


def norm(word: str) -> str:
    return unicodedata.normalize("NFC", word.strip().lower())


def answers_txt(text: str | None = None) -> list[str]:
    """Hasła z data/answers.txt (albo z podanej treści tego pliku)."""
    if text is None:
        text = (ROOT / "data" / "answers.txt").read_text(encoding="utf-8")
    return [norm(w) for w in text.splitlines() if w.strip()]


def words_js() -> tuple[list[str], set[str]]:
    """ANSWERS i VALID odczytane z words.js."""
    js = (ROOT / "words.js").read_text(encoding="utf-8")
    answers = re.search(r"const ANSWERS=(\[.*?\]);", js)
    valid = re.search(r'const VALID=new Set\(("(?:[^"\\]|\\.)*")\.split\(" "\)\);', js)
    if not answers or not valid:
        fail("Nie umiem odczytać ANSWERS lub VALID z words.js. Czy plik ma format z scripts/build_words.py?")
    return json.loads(answers.group(1)), set(json.loads(valid.group(1)).split(" "))


def fail(msg: str) -> None:
    print(f"BŁĄD: {msg}")
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"OK: {msg}")
