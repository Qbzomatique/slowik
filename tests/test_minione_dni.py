"""Test 3: hasła dni, które już minęły, są takie same jak w poprzedniej wersji.

Porównuje pierwsze N haseł z data/answers.txt z wersją z commita bazowego, gdzie
N = dzisiejszy numer dnia (#1 = 4 listopada 2026) + 1 dzień zapasu na strefy czasowe.

Uruchomienie: python tests/test_minione_dni.py [commit]
Commit bazowy: argument, zmienna BASE_SHA albo domyślnie HEAD~1. W GitHub Actions
BASE_SHA to ostatni commit na main, dla którego testy przeszły.
"""
import os
import subprocess
import sys
from datetime import date, datetime, timezone

from wspolne import ROOT, START_DAY, answers_txt, fail, ok


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    base = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BASE_SHA", "")).strip()
    if not base or set(base) == {"0"}:
        base = "HEAD~1"

    if git("rev-parse", "--verify", "--quiet", f"{base}^{{commit}}").returncode != 0:
        ok(f"brak commita bazowego „{base}” (np. pierwszy commit), pomijam test")
        return
    old_file = git("show", f"{base}:data/answers.txt")
    if old_file.returncode != 0:
        ok(f"w commicie {base} nie ma data/answers.txt, pomijam test")
        return

    today = datetime.now(timezone.utc).date()
    day = (today - date(*START_DAY)).days + 1
    n = max(0, day + 1)

    old, new = answers_txt(old_file.stdout), answers_txt()
    for i in range(min(n, len(old))):
        if i >= len(new):
            fail(f"Usunięto hasło dnia #{i + 1} „{old[i]}”, a ten dzień już minął "
                 f"(dziś jest dzień #{day}). Nowa lista ma tylko {len(new)} haseł.")
        if old[i] != new[i]:
            fail(f"Zmieniono hasło dnia #{i + 1}, który już minął (dziś jest dzień #{day}): "
                 f"było „{old[i]}”, jest „{new[i]}”. Minionych dni nie wolno zmieniać ani przestawiać.")
    ok(f"hasła dni #1–#{min(n, len(old))} bez zmian względem {base} (dziś jest dzień #{day})")


if __name__ == "__main__":
    main()
