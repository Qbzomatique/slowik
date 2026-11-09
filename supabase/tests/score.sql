-- Zgodność kolorowania i trybu trudnego w SQL z index.html (tests/test_score.js).
-- Uruchomienie: wklej do SQL Editor; każdy wiersz powinien mieć ok = true.

with cases(guess, answer, want) as (values
  ('kotek', 'kółko', array['hit','near','miss','miss','near']),
  ('lalka', 'balon', array['miss','hit','hit','miss','miss']),
  ('aaaaa', 'balon', array['miss','hit','miss','miss','miss']),
  ('słowo', 'słowo', array['hit','hit','hit','hit','hit']),
  ('wasik', 'wąsik', array['hit','miss','hit','hit','hit']),
  ('sączę', 'część', array['miss','miss','near','near','near'])
)
select 'score' as test, guess || '/' || answer as przypadek, private.score(guess, answer) = want as ok
from cases
union all
select 'hard_error', 'trafienie musi zostać', private.hard_error('zamek', array['kotek'], 'kółko') = 'Litera K musi być na pozycji 1'
union all
select 'hard_error', 'litera na złym miejscu musi wystąpić', private.hard_error('kapsa', array['kotek'], 'kółko') like 'Próba musi zawierać%'
union all
select 'hard_error', 'poprawna próba przechodzi', private.hard_error('kokos', array['kotek'], 'kółko') is null;
