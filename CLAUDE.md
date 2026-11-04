# Słowik

Polska gra w zgadywanie pięcioliterowego słowa (Wordle po polsku). Pierwsza gra planowanego serwisu z polskimi codziennymi grami słownymi. Projekt jest też częścią portfolio autora na GitHubie, więc kod, commity i README mają być czytelne dla rekrutera.

Strona: https://qbzomatique.github.io/slowik/ (GitHub Pages z gałęzi `main`, folder główny; każdy push na `main` wdraża stronę).

## Język

- Cały interfejs i README po polsku. Rozmowa z autorem po polsku.
- Komentarze w kodzie mogą być po polsku lub angielsku, byle spójnie w obrębie pliku.

## Struktura

- `index.html`: cała gra (HTML, CSS, JS w jednym pliku, bez frameworków i bez kroku budowania).
- `words.js`: generowany. `ANSWERS` (hasła dnia) i `VALID` (dozwolone próby). Nie edytować ręcznie.
- `data/answers.txt`: hasła dnia, jedno na linię, w kolejności wypadania.
- `scripts/build_words.py`: buduje `words.js` z `slowa.txt` ze słownika do gier SJP.PL (https://sjp.pl/sl/growy/). `slowa.txt` (~45 MB) nie jest w repo (`.gitignore`); trzeba go pobrać i podać ścieżkę: `python scripts/build_words.py ścieżka/do/slowa.txt`.

## Zasady, których pilnować

- **`data/answers.txt`: nie wolno zmieniać haseł dni, które już minęły (pozycje 1..dzisiejszy numer dnia), ani ich kolejności. Przyszłe hasła można usuwać i przestawiać. Nowe najlepiej dopisywać na końcu.** Słowo dnia nr N to `ANSWERS[(N-1) % len]`, gdzie #1 = 4 listopada 2026 (czas lokalny gracza).
- Hasła dnia: zwykłe, znane słowa, głównie rzeczowniki w mianowniku l. poj.; bez nazw własnych, wulgaryzmów i rzadkich form. Każde hasło musi być w słowniku SJP (skrypt to sprawdza).
- Polskie litery (ą ć ę ł ń ó ś ź ż) to osobne litery; słowa są normalizowane do NFC i małych liter.
- Kolorowanie prób obsługuje powtórzone litery dwuprzebiegowo (najpierw trafienia, potem litery na złym miejscu z limitem wystąpień). Po każdej zmianie funkcji `score` sprawdzić przypadki z powtórzeniami, np. `lalka`/`balon` → szare, zielone, zielone, szare, szare.
- Stan gracza tylko w `localStorage` (klucze z prefiksem `slowik.`); każdy dostęp w try/catch. Zmiana domyślnych ustawień → nowy klucz (obecnie `settings2`), żeby nie nadpisać starych zapisów.
- Słownik SJP.PL jest na licencji CC BY 4.0 / GPL 2: zachować przypisanie w README i w oknie „Jak grać”.
- Kolory przez zmienne CSS w `:root`, z wersją ciemną (`prefers-color-scheme` i `data-theme`). Strona musi działać na telefonie (~390 px szerokości).

## Plany (kolejność orientacyjna)

1. Lepsza, dłuższa lista haseł dnia (np. z listy frekwencyjnej przefiltrowanej przez SJP, potem ręczny przegląd).
2. Backend (np. Supabase): konta, wspólne rankingi, serie.
3. Logowanie przez Discorda (OAuth), bot ze slash-komendami i dziennym postem, ranking serwera.
4. Discord Activity (gra uruchamiana w Discordzie).
5. Kolejne gry: polski odpowiednik Krilliona (rzadkie odpowiedzi, lematyzacja np. Morfeuszem), Connections.

## Commity

Krótkie opisy po polsku w trybie rozkazującym lub opisowym, np. „Dodaj tryb trudny”, „Popraw kontrast klawiatury”.
