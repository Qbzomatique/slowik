# Słowik: ukrycie haseł dnia

Dokument analityczny. Wersja 1.0, 9 listopada 2026. Status: **do akceptacji**. Rozwija ograniczenia L1–L3 z [backend.md](backend.md).

## 1. Problem

Ranking nie jest dziś wiarygodny:

| # | Zagrożenie | Dziś |
|---|---|---|
| Z1 | Podejrzenie dzisiejszego i przyszłych haseł | `ANSWERS` w `words.js`, kolejność także w `data/answers.txt` i w historii gita |
| Z2 | Wysłanie zmyślonego wyniku | `submit_result` wierzy klientowi, że `won = true` |
| Z3 | Próby „na brudno” przed właściwą grą | Gra liczy kolory lokalnie, serwer widzi tylko wynik końcowy |
| Z4 | Fałszywy tryb trudny, próby spoza słownika | Serwer nie zna hasła ani słownika |

**Cel:** dla zalogowanego gracza wynik wylicza serwer na podstawie prób zgłaszanych po kolei, a hasło nie trafia do przeglądarki przed końcem gry.

## 2. Kluczowa konsekwencja

**Jeśli hasła nie ma w przeglądarce, przeglądarka nie policzy kolorów.** Słowo dnia wymaga więc połączenia z serwerem. To zmienia wymaganie z `backend.md` (US-1: gra działa bez Supabase).

| Wariant | Słowo dnia offline | Hasło ukryte | Wiarygodność rankingu |
|---|---|---|---|
| A. Serwer sprawdza próby wszystkich graczy **(rekomendacja)** | Nie, tylko Trening | Tak | Wysoka dla kont, patrz L10 |
| B. Hasło dnia pobierane z serwera i liczone lokalnie | Tak, po pobraniu | Tylko przyszłe | Niska: dzisiejsze hasło widać w ruchu sieciowym |
| C. Logowanie wymagane do słowa dnia | Nie | Tak | Najwyższa, ale łamie decyzję o grze bez konta |

Rekomendacja: **wariant A**. Wariant B nie rozwiązuje Z1 dla dzisiejszego słowa, czyli tego, które decyduje o rankingu dnia.

Bez sieci, także gdy projekt Supabase jest uśpiony: komunikat po polsku i dostępny Trening. Rozpoczętą grę stan lokalny pozwala wyświetlić, ale kolejne próby czekają na połączenie.

## 3. Rozwiązanie

```mermaid
sequenceDiagram
  participant K as Przeglądarka
  participant S as Supabase (RPC)
  participant H as private.answers
  K->>S: play_guess(dzień, słowo)
  S->>H: odczyt hasła (SECURITY DEFINER)
  S-->>K: kolory, stan gry; hasło dopiero po końcu gry
```

- **Hasła** trafiają do tabeli `private.answers (day, word)` w schemacie niedostępnym przez API.
- **Kolejność przyszłych haseł losuje baza** przy migracji (`order by random()`). W repo jest tylko zbiór słów, kolejności nie zna nikt, także autor gry, więc może grać uczciwie. Dni minione i dzień bieżący z zapasem zachowują dotychczasowe hasła.
- **Stara kolejność jest ujawniona w historii gita**, dlatego przyszłe dni muszą zostać przelosowane. Sam jej usunięcie z repo nic by nie dało.
- **`words.js`** zachowuje `VALID` oraz `ANSWERS` jako posortowaną pulę do Treningu. Pula 1571 słów przy nieznanej kolejności nie zdradza hasła dnia.
- **`data/answers.txt`** przestaje być źródłem kolejności i staje się alfabetyczną pulą słów.
- **Słownik** trafia do `private.dictionary`. Słowo dnia zawsze wymaga słowa ze słownika, a ustawienie „Tylko słowa ze słownika” dotyczy już tylko Treningu.

### Funkcje RPC

| Funkcja | Kto | Co robi |
|---|---|---|
| `play_guess(day, word, hard)` | `authenticated` | Dopisuje próbę do `games`, sprawdza okno dni, słownik, limit 6 prób i tryb trudny. Liczy kolory. Po końcu gry zapisuje `results` i zwraca hasło. |
| `get_game(day)` | `authenticated` | Stan gry gracza, także po zmianie urządzenia. |
| `check_guess(day, words[])` | `anon` | Dla niezalogowanych: kolory dla listy prób. Bez stanu. Hasło zwraca dopiero, gdy lista zawiera trafienie albo ma 6 prób. |

`submit_result` zostaje wyłączona dla klientów. Tabela `games` (próby w toku) ma te same zasady RLS co `results`: gracz czyta tylko swoje, zapis tylko przez funkcję.

Liczenie kolorów w SQL musi dawać te same wyniki co funkcja `score` z gry. Sprawdzą to te same przypadki testowe, w tym powtórzone litery.

### Przejście ze starej wersji

- Trwającą lokalną grę z dnia wdrożenia klient odtwarza przez `play_guess` lub `check_guess`.
- Wyniki już zapisane w `results` zostają bez zmian.
- Logowanie po grze jako niezalogowany przestaje dawać wynik w rankingu, bo takiej gry serwer nie widział po kolei. **Do rankingu trafia tylko gra rozegrana po zalogowaniu.** To zmiana względem US-2 w `backend.md`.

## 4. Co zostaje niezabezpieczone

| # | Ograniczenie | Skutek | Decyzja |
|---|---|---|---|
| L10 | Niezalogowany może sprawdzać próby przez `check_guess`, poznać hasło i zagrać potem na koncie | Oszustwo nadal możliwe, ale wymaga celowego działania, a wynik wymaga zgadywania jak w grze | Akceptujemy. Pełna ochrona to wariant C. |
| L11 | Drugie konto Discord do rozpoznania hasła | Jak L10 | Akceptujemy |
| L12 | Okno ±1 dzień pozwala zagrać słowo „jutrzejsze” wcześniej | Gracz może poznać hasło kilka godzin przed innymi | Akceptujemy ze względu na strefy czasowe |
| L13 | Brak limitu wywołań RPC | Masowe odpytywanie | Monitoring w panelu, limity później |

## 5. Wymagania towarzyszące

- **L5 staje się krytyczne:** uśpiony projekt wyłącza słowo dnia, a nie tylko ranking. Etap obejmuje workflow GitHub Actions wywołujący raz na dobę lekką funkcję. GitHub wyłącza harmonogramy po 60 dniach bez aktywności w repo, więc trzeba to pilnować.
- **Testy CI:** `test_minione_dni.py` i część `test_hasla.py` dotyczą kolejności, której nie będzie w repo, więc zostaną zastąpione kontrolą puli. Logika klienta jest testowana z atrapą serwera.
- **Ręczne testy (lista S):** bezpośredni odczyt `private.answers` niemożliwy; hasło nie pada w odpowiedzi przed końcem gry; siódma próba odrzucona; słowo spoza słownika odrzucone; naruszenie trybu trudnego odrzucone; wynik powstaje wyłącznie z `play_guess`; zgodność kolorów SQL z grą.

## 6. Plan

| Krok | Zawartość | Kto |
|---|---|---|
| 0 | Akceptacja tego dokumentu | Autor |
| 1 | Migracje: `private`, hasła, słownik, `games`, funkcje | Asystent pisze, autor akceptuje i uruchamia |
| 2 | Testy SQL na produkcyjnej bazie (lista S), jeszcze bez zmiany gry | Razem |
| 3 | Frontend: próby przez RPC, `words.js` bez kolejności, testy CI | Asystent |
| 4 | Workflow podtrzymujący, aktualizacja `backend.md`, README, CLAUDE.md | Asystent |
