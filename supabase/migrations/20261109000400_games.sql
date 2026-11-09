-- Gra sprawdzana przez serwer: próby po kolei, kolory i wynik liczone w bazie.
-- Opis: docs/ukrycie-hasel.md. submit_result działa dalej do czasu wdrożenia nowej gry
-- (wyłącza ją osobna migracja 500).

create table public.games (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        integer not null check (day >= 1),
  guesses    text[] not null default '{}',
  hard_mode  boolean not null default false,
  status     text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

comment on table public.games is
  'Stan słowa dnia zalogowanego gracza. Zapis tylko przez play_guess.';

alter table public.games enable row level security;

revoke all on public.games from anon, authenticated;
grant select on public.games to authenticated;

create policy "Gracz widzi tylko własne gry"
  on public.games for select to authenticated
  using (user_id = (select auth.uid()));
comment on policy "Gracz widzi tylko własne gry" on public.games is
  'Pozwala zalogowanemu odczytać wyłącznie swoje gry. INSERT/UPDATE/DELETE nie mają polityk: zapis tylko przez play_guess, usunięcie tylko kaskadą z delete_my_account.';

-- Hasło danego dnia; po wyczerpaniu listy hasła zaczynają się od początku, jak w grze.
create function private.answer_for(p_day integer)
returns text
language sql
stable
set search_path = ''
as $$
  select a.word from private.answers a
  where a.day = ((p_day - 1) % (select count(*) from private.answers)) + 1;
$$;

-- Kolorowanie: odpowiednik funkcji score z index.html (najpierw trafienia, potem litery z limitem wystąpień).
create function private.score(p_guess text, p_answer text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_g text[] := regexp_split_to_array(p_guess, '');
  v_a text[] := regexp_split_to_array(p_answer, '');
  v_res text[] := array['miss', 'miss', 'miss', 'miss', 'miss'];
  v_left jsonb := '{}';
  v_count integer;
begin
  for i in 1..5 loop
    if v_g[i] = v_a[i] then
      v_res[i] := 'hit';
    else
      v_left := jsonb_set(v_left, array[v_a[i]], to_jsonb(coalesce((v_left ->> v_a[i])::integer, 0) + 1));
    end if;
  end loop;
  for i in 1..5 loop
    if v_res[i] <> 'hit' then
      v_count := coalesce((v_left ->> v_g[i])::integer, 0);
      if v_count > 0 then
        v_res[i] := 'near';
        v_left := jsonb_set(v_left, array[v_g[i]], to_jsonb(v_count - 1));
      end if;
    end if;
  end loop;
  return v_res;
end;
$$;

-- Tryb trudny: odpowiednik hardModeError z index.html. Zwraca komunikat albo null.
create function private.hard_error(p_word text, p_guesses text[], p_answer text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_w text[] := regexp_split_to_array(p_word, '');
  v_prev text;
  v_gl text[];
  v_r text[];
  v_need integer;
  v_have integer;
begin
  foreach v_prev in array p_guesses loop
    v_r := private.score(v_prev, p_answer);
    v_gl := regexp_split_to_array(v_prev, '');
    for i in 1..5 loop
      if v_r[i] = 'hit' and v_w[i] <> v_gl[i] then
        return format('Litera %s musi być na pozycji %s', upper(v_gl[i]), i);
      end if;
    end loop;
    for i in 1..5 loop
      if v_r[i] <> 'miss' then
        select count(*) into v_need from generate_series(1, 5) j where v_gl[j] = v_gl[i] and v_r[j] <> 'miss';
        select count(*) into v_have from generate_series(1, 5) j where v_w[j] = v_gl[i];
        if v_have < v_need then
          return format('Próba musi zawierać %s', upper(v_gl[i]));
        end if;
      end if;
    end loop;
  end loop;
  return null;
end;
$$;

-- Wspólna walidacja dnia i słowa; zgłasza błąd z komunikatem po polsku.
create function private.check_input(p_day integer, p_word text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today integer := public.day_number();
begin
  if p_day is null or p_day < 1 or p_day < v_today - 1 or p_day > v_today + 1 then
    raise exception 'Dzień % jest poza oknem gry (dziś jest dzień %, dozwolone ±1)', p_day, v_today
      using errcode = '22023';
  end if;
  if p_word is null or p_word !~ '^[a-ząćęłńóśźż]{5}$' then
    raise exception 'Próba musi mieć 5 małych liter polskiego alfabetu' using errcode = '22023';
  end if;
  if not exists (select 1 from private.dictionary d where d.word = p_word) then
    raise exception 'Nie ma tego słowa w słowniku' using errcode = '22023';
  end if;
end;
$$;

-- Jedna próba zalogowanego gracza. Hasło wraca dopiero po końcu gry.
create function public.play_guess(p_day integer, p_word text, p_hard boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_answer text;
  v_guesses text[];
  v_status text;
  v_hard_error text;
begin
  if v_uid is null then
    raise exception 'Zaloguj się, żeby zagrać na konto' using errcode = '28000';
  end if;
  perform private.check_input(p_day, p_word);

  insert into public.games (user_id, day, hard_mode)
  values (v_uid, p_day, coalesce(p_hard, false))
  on conflict (user_id, day) do nothing;

  select * into v_game from public.games g
  where g.user_id = v_uid and g.day = p_day
  for update;

  if v_game.status <> 'playing' then
    raise exception 'Ta gra jest już zakończona' using errcode = '22023';
  end if;
  -- Wynik zapisany jeszcze starą metodą (submit_result) kończy dzień.
  if cardinality(v_game.guesses) = 0
     and exists (select 1 from public.results r where r.user_id = v_uid and r.day = p_day) then
    raise exception 'Wynik na ten dzień jest już zapisany' using errcode = '22023';
  end if;

  v_answer := private.answer_for(p_day);
  if v_game.hard_mode then
    v_hard_error := private.hard_error(p_word, v_game.guesses, v_answer);
    if v_hard_error is not null then
      raise exception '%', v_hard_error using errcode = '22023';
    end if;
  end if;

  v_guesses := v_game.guesses || p_word;
  v_status := case when p_word = v_answer then 'won'
                   when cardinality(v_guesses) = 6 then 'lost'
                   else 'playing' end;

  update public.games g
  set guesses = v_guesses, status = v_status, updated_at = now()
  where g.user_id = v_uid and g.day = p_day;

  if v_status <> 'playing' then
    insert into public.results (user_id, day, guesses, attempts, won, hard_mode)
    values (v_uid, p_day, v_guesses, cardinality(v_guesses), v_status = 'won', v_game.hard_mode)
    on conflict (user_id, day) do nothing;
  end if;

  return jsonb_build_object(
    'result', to_jsonb(private.score(p_word, v_answer)),
    'status', v_status,
    'attempts', cardinality(v_guesses),
    'hard_mode', v_game.hard_mode,
    'answer', case when v_status <> 'playing' then v_answer end
  );
end;
$$;

-- Stan gry gracza (po odświeżeniu strony albo na innym urządzeniu).
create function public.get_game(p_day integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_guesses text[];
  v_status text;
  v_hard boolean;
  v_answer text;
begin
  if v_uid is null then
    raise exception 'Zaloguj się, żeby odczytać grę' using errcode = '28000';
  end if;

  select g.guesses, g.status, g.hard_mode into v_guesses, v_status, v_hard
  from public.games g where g.user_id = v_uid and g.day = p_day;

  if not found then
    select r.guesses, case when r.won then 'won' else 'lost' end, r.hard_mode
      into v_guesses, v_status, v_hard
    from public.results r where r.user_id = v_uid and r.day = p_day;
    if not found then
      return jsonb_build_object('status', 'none');
    end if;
  end if;

  v_answer := private.answer_for(p_day);
  return jsonb_build_object(
    'guesses', to_jsonb(v_guesses),
    'results', coalesce((
      select jsonb_agg(to_jsonb(private.score(t.word, v_answer)) order by t.pos)
      from unnest(v_guesses) with ordinality as t(word, pos)
    ), '[]'::jsonb),
    'status', v_status,
    'hard_mode', v_hard,
    'answer', case when v_status <> 'playing' then v_answer end
  );
end;
$$;

-- Gra niezalogowanego: bez stanu, klient wysyła wszystkie dotychczasowe próby.
-- Nigdy nie zwraca hasła: po przegranej poznają je tylko zalogowani.
create function public.check_guess(p_day integer, p_words text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_word text;
  v_answer text;
  v_won boolean;
begin
  if coalesce(cardinality(p_words), 0) not between 1 and 6 then
    raise exception 'Gra musi mieć od 1 do 6 prób' using errcode = '22023';
  end if;
  foreach v_word in array p_words loop
    perform private.check_input(p_day, v_word);
  end loop;

  v_answer := private.answer_for(p_day);
  v_won := v_answer = any (p_words);
  return jsonb_build_object(
    'results', (
      select jsonb_agg(to_jsonb(private.score(t.word, v_answer)) order by t.pos)
      from unnest(p_words) with ordinality as t(word, pos)
    ),
    'status', case when v_won then 'won' when cardinality(p_words) = 6 then 'lost' else 'playing' end
  );
end;
$$;

revoke execute on function public.play_guess(integer, text, boolean) from public, anon, authenticated;
revoke execute on function public.get_game(integer) from public, anon, authenticated;
revoke execute on function public.check_guess(integer, text[]) from public, anon, authenticated;

grant execute on function public.play_guess(integer, text, boolean) to authenticated;
grant execute on function public.get_game(integer) to authenticated;
grant execute on function public.check_guess(integer, text[]) to anon;
