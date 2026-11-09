# Słowik

Polska gra w zgadywanie pięcioliterowego słowa (Wordle po polsku). Pierwsza gra planowanego serwisu z polskimi codziennymi grami słownymi. Projekt jest też częścią portfolio autora na GitHubie, więc kod, commity i README mają być czytelne dla rekrutera.

Strona: https://qbzomatique.github.io/slowik/ (GitHub Pages z gałęzi `main`, folder główny; każdy push na `main` wdraża stronę).

## Język

- Cały interfejs i README po polsku. Rozmowa z autorem po polsku.
- Komentarze w kodzie mogą być po polsku lub angielsku, byle spójnie w obrębie pliku.

## Struktura

- `index.html`: cała gra (HTML, CSS, JS w jednym pliku, bez frameworków i bez kroku budowania).
- `words.js`: generowany. `ANSWERS` (hasła dnia) i `VALID` (dozwolone próby). Nie edytować ręcznie.
- `docs/backend.md`: analiza backendu (wymagania, RODO, model danych, RLS, ograniczenia, wyniki testów RLS).
- `supabase/migrations/`: schemat, RLS i funkcje RPC, numerowane datą.
- `tests/`: testy CI (Python i Node, bez zależności); `tests/manual/rls_console.js` to ręczne testy RLS.
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

## Konta i ranking (Supabase)

- Gra musi działać bez logowania i bez sieci. Każdy błąd Supabase kończy się komunikatem po polsku, a gra działa dalej na `localStorage`.
- W repo tylko URL projektu i klucz publishable (`index.html`). Kluczy secret/`service_role`, sekretu Discorda ani hasła do bazy nigdy nie zapisywać w repo ani nie wklejać do czatu.
- Logika konta jest w `index.html` między `// online:start` a `// online:end`: bez DOM, bo uruchamia ją `tests/test_online.js` z atrapą Supabase.
- Zmiany w bazie tylko nowym plikiem migracji, bez edycji wdrożonych. Autor zatwierdza migrację i sam ją uruchamia w SQL Editor.
- Każda tabela ma RLS. Klient zapisuje wyłącznie przez funkcje RPC. Funkcje `SECURITY DEFINER` mają `search_path = ''`, pełne nazwy obiektów i jawne `grant execute`.
- Rankingi pokazują tylko nick i liczby, wyłącznie dla `nick_confirmed = true`. Nigdy `user_id` ani prób.
- Trening nie trafia do rankingu. Nicki escapować przed wstawieniem do HTML.
- Znane ograniczenia, m.in. publiczne hasła w `words.js` (L1–L3): `docs/backend.md`, rozdział 8.

## Plany (kolejność orientacyjna)

1. Ukrycie haseł (L1–L3 w `docs/backend.md`) przed publicznym ogłoszeniem rankingów; pełna polityka prywatności (L9).
2. Podtrzymanie darmowego projektu Supabase przed uśpieniem (L5) i kopie zapasowe (L6).
3. Bot Discorda ze slash-komendami i dziennym postem, ranking serwera.
4. Discord Activity (gra uruchamiana w Discordzie).
5. Kolejne gry: polski odpowiednik Krilliona (rzadkie odpowiedzi, lematyzacja np. Morfeuszem), Connections.

## Commity

Pracujemy bezpośrednio na `main`, bez gałęzi i PR-ów; testy CI mają zostać zielone.

Krótkie opisy po polsku w trybie rozkazującym lub opisowym, np. „Dodaj tryb trudny”, „Popraw kontrast klawiatury”.
