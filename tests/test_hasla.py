"""Testy 1 i 2: words.js zgadza się z data/answers.txt, a każde hasło jest poprawne.

Uruchomienie: python tests/test_hasla.py
"""
import re
import sys

from wspolne import answers_txt, fail, norm, ok, words_js

POLISH_5 = re.compile(r"[a-ząćęłńóśźż]{5}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    txt = answers_txt()
    js_answers, valid = words_js()
    js = [norm(w) for w in js_answers]

    # 1. Spójność words.js z data/answers.txt
    if js != txt:
        for i, (a, b) in enumerate(zip(js, txt), 1):
            if a != b:
                fail(f"words.js i data/answers.txt różnią się na pozycji {i}: "
                     f"words.js ma „{a}”, answers.txt ma „{b}”. Przebuduj: python scripts/build_words.py slowa.txt")
        fail(f"words.js ma {len(js)} haseł, a data/answers.txt {len(txt)}. "
             "Przebuduj: python scripts/build_words.py slowa.txt")
    ok(f"words.js zgadza się z data/answers.txt ({len(txt)} haseł)")

    # 2. Każde hasło: 5 polskich liter, w VALID, bez powtórzeń
    bad = [(i, w) for i, w in enumerate(txt, 1) if not POLISH_5.fullmatch(w)]
    if bad:
        fail("Hasła, które nie są 5 literami polskiego alfabetu: "
             + ", ".join(f"#{i} „{w}”" for i, w in bad))
    missing = [(i, w) for i, w in enumerate(txt, 1) if w not in valid]
    if missing:
        fail("Hasła spoza słownika VALID: " + ", ".join(f"#{i} „{w}”" for i, w in missing))
    seen, dupes = {}, []
    for i, w in enumerate(txt, 1):
        if w in seen:
            dupes.append(f"„{w}” (#{seen[w]} i #{i})")
        seen.setdefault(w, i)
    if dupes:
        fail("Powtórzone hasła: " + ", ".join(dupes))
    ok("każde hasło ma 5 polskich liter, jest w VALID i występuje raz")


if __name__ == "__main__":
    main()
