"""Buduje words.js ze słownika SJP.PL i listy haseł.

Użycie:
    python scripts/build_words.py ścieżka/do/slowa.txt

slowa.txt pochodzi ze "słownika do gier" ze strony https://sjp.pl/sl/growy/
(licencja GPL 2 / CC BY 4.0). Plik jest duży (~45 MB), więc nie trzymamy go w repo.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LETTERS = re.compile(r"[a-ząćęłńóśźż]{5}")


def norm(word: str) -> str:
    return unicodedata.normalize("NFC", word.strip().lower())


def main(sjp_path: str) -> None:
    valid = sorted({w for line in open(sjp_path, encoding="utf-8")
                    if LETTERS.fullmatch(w := norm(line))})
    answers = [norm(w) for w in (ROOT / "data" / "answers.txt").read_text(encoding="utf-8").split()]

    valid_set = set(valid)
    missing = [w for w in answers if w not in valid_set]
    if missing:
        sys.exit(f"Hasła spoza słownika: {', '.join(missing)}")
    dupes = {w for w in answers if answers.count(w) > 1}
    if dupes:
        sys.exit(f"Powtórzone hasła: {', '.join(sorted(dupes))}")

    js = (
        "// Wygenerowane przez scripts/build_words.py. Nie edytuj ręcznie.\n"
        "// Słownik: SJP.PL (https://sjp.pl), licencja CC BY 4.0.\n"
        f"const ANSWERS={json.dumps(answers, ensure_ascii=False)};\n"
        f"const VALID=new Set({json.dumps(' '.join(valid), ensure_ascii=False)}.split(\" \"));\n"
    )
    (ROOT / "words.js").write_text(js, encoding="utf-8")
    print(f"words.js: {len(answers)} haseł, {len(valid)} dozwolonych słów")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
