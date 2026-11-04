"""Wypisuje kandydatów na hasła dnia: pięcioliterowe słowa z listy frekwencyjnej,
które są w słowniku SJP.PL i nie ma ich jeszcze w data/answers.txt.

Użycie:
    python scripts/candidates.py ścieżka/do/slowa.txt ścieżka/do/pl_full.txt > kandydaci.txt

pl_full.txt (lub krótszy pl_50k.txt) to lista frekwencyjna słów z polskich napisów
filmowych (OpenSubtitles) z repozytorium https://github.com/hermitdave/FrequencyWords
(content/2018/pl, licencja CC BY-SA 4.0). Format: "słowo liczba_wystąpień" w każdej linii.

Wynik jest posortowany od najczęstszych. Słownik zawiera wszystkie formy odmienione,
więc lista wymaga ręcznego przeglądu przed dopisaniem do data/answers.txt.
"""
import sys
from pathlib import Path

from build_words import LETTERS, ROOT, norm


def main(sjp_path: str, freq_path: str) -> None:
    valid = {w for line in open(sjp_path, encoding="utf-8")
             if LETTERS.fullmatch(w := norm(line))}
    answers = set(norm(w) for w in (ROOT / "data" / "answers.txt").read_text(encoding="utf-8").split())

    seen = set()
    for line in open(freq_path, encoding="utf-8"):
        word, count = line.split()
        word = norm(word)
        if word in valid and word not in answers and word not in seen:
            seen.add(word)
            print(word, count)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1], sys.argv[2])
