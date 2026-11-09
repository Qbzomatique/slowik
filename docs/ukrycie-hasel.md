# Słowik: ukrycie haseł dnia

Dokument analityczny. Wersja 1.4, 9 listopada 2026. Status: **zaakceptowany (wariant A)**. Rozwija ograniczenia L1–L3 z [backend.md](backend.md).

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
| `check_guess(day, words[])` | `anon` | Dla niezalogowanych: kolory dla listy prób. Bez stanu. Nigdy nie zwraca hasła: po przegranej poznają je tylko zalogowani. |

`submit_result` zostaje wyłączona dla klientów. Tabela `games` (próby w toku) ma te same zasady RLS co `results`: gracz czyta tylko swoje, zapis tylko przez funkcję.

Liczenie kolorów w SQL musi dawać te same wyniki co funkcja `score` z gry. Sprawdzą to te same przypadki testowe, w tym powtórzone litery.

### Przejście ze starej wersji

- Trwającą lokalną grę z dnia wdrożenia klient odtwarza przez `play_guess` lub `check_guess`.
- Wyniki już zapisane w `results` zostają bez zmian.
- Po zalogowaniu lokalne próby z dzisiejszej gry są odtwarzane po kolei przez `play_guess`. Dają wynik w rankingu i, przy przegranej, hasło. Nie zwiększa to możliwości oszustwa ponad L10, bo serwer i tak sprawdza każdą próbę. Gdy gra na koncie już istnieje, wygrywa stan z konta.

## 4. Co zostaje niezabezpieczone

| # | Ograniczenie | Skutek | Decyzja |
|---|---|---|---|
| L10 | Niezalogowany może przez `check_guess` odpytywać kolory i rozpoznać hasło bez limitu gier, a potem zagrać na koncie. | Oszustwo wymaga skryptu lub cierpliwości; hasła nie da się już dostać jednym zapytaniem. | Akceptujemy. Niezalogowany po przegranej nie widzi hasła (nagroda za logowanie). Pełna ochrona: wariant C. |
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

## 7. Wyniki testów

Przebieg 9 listopada 2026, na produkcyjnym projekcie. S1–S13: skrypt `tests/manual/gra_console.js` jako zalogowany gracz. Kolorowanie i reguły trybu trudnego: `supabase/tests/score.sql`.

| # | Scenariusz | Wynik |
|---|---|---|
| S1 | Stary zapis wyniku (`submit_result`) wyłączony | ✅ |
| S2 | Słowo spoza słownika odrzucone | ✅ |
| S3 | Dzień poza oknem odrzucony | ✅ |
| S4 | Zalogowany nie może użyć `check_guess` | ✅ |
| S5 | Hasło nie pada przed końcem gry | ✅ |
| S6 | Serwer zwraca kolory | ✅ |
| S7 | Po 6 próbach przegrana i hasło dla zalogowanego | ✅ |
| S8 | Siódma próba odrzucona | ✅ |
| S9 | `get_game` zwraca stan gry | ✅ |
| S10 | Wynik powstaje z `play_guess` | ✅ |
| S11 | Bezpośredni insert do `games` zablokowany | ✅ |
| S12 | Update gry zablokowany | ✅ |
| S13 | Tabeli haseł nie ma w API | ✅ |
| S14 | Zgodność kolorów SQL z grą (6 przypadków), reguły trybu trudnego | ✅ |
| S15 | Niezalogowany: odmowa funkcji kont, brak hasła w odpowiedzi `check_guess`, także po 6 próbach | ✅ |
| S16 | Tryb trudny w prawdziwej grze: serwer odrzuca próbę ignorującą zieloną literę | ⏳ do sprawdzenia w kolejnej grze |
