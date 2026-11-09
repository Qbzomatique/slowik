# Słowik

Polska gra w zgadywanie pięcioliterowego słowa (Wordle po polsku). Pierwsza gra planowanego serwisu z polskimi codziennymi grami słownymi. Projekt jest też częścią portfolio autora na GitHubie, więc kod, commity i README mają być czytelne dla rekrutera.

Strona: https://qbzomatique.github.io/slowik/ (GitHub Pages z gałęzi `main`, folder główny; każdy push na `main` wdraża stronę).

## Język

- Cały interfejs i README po polsku. Rozmowa z autorem po polsku.
- Komentarze w kodzie mogą być po polsku lub angielsku, byle spójnie w obrębie pliku.

## Struktura

- `index.html`: cała gra (HTML, CSS, JS w jednym pliku, bez frameworków i bez kroku budowania).
- `words.js`: generowany. `ANSWERS` (pula Treningu, posortowana) i `VALID` (dozwolone próby). Nie edytować ręcznie.
- `docs/backend.md`: analiza backendu (wymagania, RODO, model danych, RLS, ograniczenia, wyniki testów RLS). `docs/ukrycie-hasel.md`: gra sprawdzana przez serwer.
- `supabase/migrations/`: schemat, RLS i funkcje RPC, numerowane datą.
- `tests/`: testy CI (Python i Node, bez zależności); `tests/manual/rls_console.js` to ręczne testy RLS.
- `data/answers.txt`: alfabetyczna pula słów do Treningu, jedno na linię. Kolejność haseł dnia jest tylko w bazie.
- `scripts/build_words.py`: buduje `words.js` z `slowa.txt` ze słownika do gier SJP.PL (https://sjp.pl/sl/growy/). `slowa.txt` (~45 MB) nie jest w repo (`.gitignore`); trzeba go pobrać i podać ścieżkę: `python scripts/build_words.py ścieżka/do/slowa.txt`.

## Zasady, których pilnować

- **Hasła dnia są tylko w `private.answers`. Kolejności przyszłych haseł nie wolno zapisywać w repo ani odczytywać do czatu; `data/answers.txt` ma pozostać posortowany.** Minionych dni nie wolno zmieniać. Nowe hasła dopisuje migracja na koniec listy. Słowo dnia nr N to wiersz `((N-1) % liczba) + 1`, gdzie #1 = 4 listopada 2026.
- Hasła dnia: zwykłe, znane słowa, głównie rzeczowniki w mianowniku l. poj.; bez nazw własnych, wulgaryzmów i rzadkich form. Każde hasło musi być w słowniku SJP (skrypt to sprawdza).
- Polskie litery (ą ć ę ł ń ó ś ź ż) to osobne litery; słowa są normalizowane do NFC i małych liter.
- Kolorowanie prób obsługuje powtórzone litery dwuprzebiegowo (najpierw trafienia, potem litery na złym miejscu z limitem wystąpień). Po każdej zmianie funkcji `score` sprawdzić przypadki z powtórzeniami, np. `lalka`/`balon` → szare, zielone, zielone, szare, szare.
- Stan gracza tylko w `localStorage` (klucze z prefiksem `slowik.`); każdy dostęp w try/catch. Zmiana domyślnych ustawień → nowy klucz (obecnie `settings2`), żeby nie nadpisać starych zapisów.
- Słownik SJP.PL jest na licencji CC BY 4.0 / GPL 2: zachować przypisanie w README i w oknie „Jak grać”.
- Kolory przez zmienne CSS w `:root`, z wersją ciemną (`prefers-color-scheme` i `data-theme`). Strona musi działać na telefonie (~390 px szerokości).

## Konta i ranking (Supabase)

- Gra działa bez logowania. Słowo dnia wymaga sieci (hasło zna tylko serwer), Trening działa offline. Każdy błąd Supabase kończy się komunikatem po polsku.
- W repo tylko URL projektu i klucz publishable (`index.html`). Kluczy secret/`service_role`, sekretu Discorda ani hasła do bazy nigdy nie zapisywać w repo ani nie wklejać do czatu.
- Logika konta jest w `index.html` między `// online:start` a `// online:end`: bez DOM, bo uruchamia ją `tests/test_online.js` z atrapą Supabase.
- Zmiany w bazie tylko nowym plikiem migracji, bez edycji wdrożonych. Autor zatwierdza migrację i sam ją uruchamia w SQL Editor.
- Każda tabela ma RLS. Klient zapisuje wyłącznie przez funkcje RPC. Funkcje `SECURITY DEFINER` mają `search_path = ''`, pełne nazwy obiektów i jawne `grant execute`.
- Rankingi pokazują tylko nick i liczby, wyłącznie dla `nick_confirmed = true`. Nigdy `user_id` ani prób.
- Trening nie trafia do rankingu. Nicki escapować przed wstawieniem do HTML.
- Niezalogowany nie dostaje hasła od serwera po przegranej. Wynik powstaje tylko z `play_guess`.
- Kolorowanie jest w dwóch miejscach: `score` w `index.html` (Trening) i `private.score` w SQL. Zmiana wymaga obu i `supabase/tests/score.sql`.
- Znane ograniczenia: `docs/backend.md` (rozdział 8) i `docs/ukrycie-hasel.md` (rozdział 4).

## Plany (kolejność orientacyjna)

1. Pełna polityka prywatności (L9) przed publicznym ogłoszeniem rankingów.
2. Kopie zapasowe bazy (L6).
3. Bot Discorda ze slash-komendami i dziennym postem, ranking serwera.
4. Discord Activity (gra uruchamiana w Discordzie).
5. Kolejne gry: polski odpowiednik Krilliona (rzadkie odpowiedzi, lematyzacja np. Morfeuszem), Connections.

## Commity

Pracujemy bezpośrednio na `main`, bez gałęzi i PR-ów; testy CI mają zostać zielone.

Krótkie opisy po polsku w trybie rozkazującym lub opisowym, np. „Dodaj tryb trudny”, „Popraw kontrast klawiatury”.
