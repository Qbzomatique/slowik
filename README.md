# Słowik

[![Testy](https://github.com/Qbzomatique/slowik/actions/workflows/testy.yml/badge.svg)](https://github.com/Qbzomatique/slowik/actions/workflows/testy.yml)

Polska gra w zgadywanie pięcioliterowego słowa, w stylu Wordle.

**Zagraj:** https://qbzomatique.github.io/slowik/

## Zasady

Masz sześć prób na odgadnięcie słowa. Po każdej próbie płytki zmieniają kolor:

- 🟩 litera jest w słowie i stoi na właściwym miejscu,
- 🟨 litera jest w słowie, ale na innym miejscu,
- ⬛ litery nie ma w słowie.

Polskie znaki to osobne litery: `ą` to nie `a`, a `ł` to nie `l`.

## Funkcje

- **Słowo dnia**: jedno dla wszystkich, zmienia się o północy (#1 = 4 listopada 2026).
- **Trening**: losowe słowa bez limitu, nie liczy się do statystyk.
- Statystyki, serie i rozkład prób zapisywane w przeglądarce.
- Udostępnianie wyniku jako siatki emoji.
- Tryb trudny i kolory dla daltonistów.
- Sprawdzanie prób w słowniku SJP.PL (28 702 formy pięcioliterowe).

## Struktura

```
index.html              gra (HTML, CSS i JS w jednym pliku)
words.js                hasła i słownik, generowane skryptem
data/answers.txt        lista haseł dnia w kolejności wypadania
scripts/build_words.py  buduje words.js ze słownika SJP.PL
scripts/candidates.py   wypisuje kandydatów na nowe hasła dnia
tests/                  testy uruchamiane w GitHub Actions
```

## Słownik

Próby są sprawdzane w [słowniku do gier SJP.PL](https://sjp.pl/sl/growy/). Plik `slowa.txt` (~45 MB) nie jest w repo. Żeby przebudować `words.js`:

```bash
python scripts/build_words.py ścieżka/do/slowa.txt
```

Hasła dnia to osobna lista zwykłych słów w `data/answers.txt`. Kolejność w pliku wyznacza, które słowo wypada którego dnia, więc **nowe hasła dopisuj na końcu**. Zmiana kolejności zmieniłaby słowa minionych dni.

Kandydatów na nowe hasła wybiera `scripts/candidates.py`: bierze pięcioliterowe słowa z [listy frekwencyjnej FrequencyWords](https://github.com/hermitdave/FrequencyWords) (polskie napisy filmowe), zostawia te ze słownika SJP.PL i spoza obecnej listy, a potem sortuje je od najczęstszych. Wynik trzeba przejrzeć ręcznie, bo słownik zawiera też formy odmienione.

```bash
python scripts/candidates.py slowa.txt pl_full.txt > kandydaci.txt
```

## Uruchomienie lokalnie

Wystarczy otworzyć `index.html` w przeglądarce. Nie trzeba niczego instalować.

## Testy

Każdy push na `main` uruchamia testy w GitHub Actions (`.github/workflows/testy.yml`). Wystarczą Python 3.10+ i Node, bez instalowania pakietów. Lokalnie każdy test to jedno polecenie:

```bash
python tests/test_hasla.py         # words.js zgodny z answers.txt; hasła mają 5 polskich liter, są w słowniku, bez powtórek
python tests/test_minione_dni.py   # hasła minionych dni bez zmian względem HEAD~1 (albo: ... <commit>); w CI względem ostatniego zielonego commita
node tests/test_score.js           # kolorowanie prób, w tym powtórzone litery i polskie znaki
node tests/test_skladnia.js        # skrypty z index.html i words.js parsują się bez błędów
```

## Plany

- Konta i wspólne rankingi
- Logowanie przez Discorda i bot z wynikami serwera
- Kolejne gry (polski odpowiednik Krilliona, Connections)

## Licencja

Kod: MIT (zob. `LICENSE`).
Słownik: © SJP.PL, licencja [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) / GPL 2.
Lista frekwencyjna (wybór haseł dnia): © Hermit Dave, [FrequencyWords](https://github.com/hermitdave/FrequencyWords), licencja [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
