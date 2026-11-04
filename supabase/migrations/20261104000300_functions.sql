-- Funkcje RPC: zapis wyniku, nick, rankingi, usunięcie konta.
-- Wszystkie SECURITY DEFINER mają pusty search_path i pełne nazwy obiektów,
-- a każda sama sprawdza auth.uid(). Opis: docs/backend.md, rozdział 6.

-- Dzisiejszy numer dnia w UTC (#1 = 2026-11-04), tak jak w grze.
create function public.day_number()
returns integer
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'utc')::date - date '2026-11-04') + 1;
$$;

-- Zapis wyniku bieżącego gracza. Zwraca zapisany wynik; gdy wynik na ten dzień
-- już istnieje, niczego nie nadpisuje i zwraca istniejący z already_saved = true.
create function public.submit_result(p_day integer, p_guesses text[], p_won boolean, p_hard_mode boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today integer := public.day_number();
  saved public.results;
  existed boolean := false;
begin
  if uid is null then
    raise exception 'Zaloguj się, żeby zapisać wynik' using errcode = '28000';
  end if;
  if p_day is null or p_day < today - 1 or p_day > today + 1 then
    raise exception 'Dzień % jest poza oknem zapisu (dziś jest dzień %, dozwolone ±1)', p_day, today
      using errcode = '22023';
  end if;
  if p_won is null then
    raise exception 'Brak informacji, czy gra jest wygrana' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_guesses), 0) not between 1 and 6 then
    raise exception 'Wynik musi mieć od 1 do 6 prób' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_guesses) as g where g is null or g !~ '^[a-ząćęłńóśźż]{5}$') then
    raise exception 'Każda próba musi mieć 5 małych liter polskiego alfabetu' using errcode = '22023';
  end if;
  if not p_won and cardinality(p_guesses) <> 6 then
    raise exception 'Przegrana oznacza 6 prób' using errcode = '22023';
  end if;

  insert into public.results (user_id, day, guesses, attempts, won, hard_mode)
  values (uid, p_day, p_guesses, cardinality(p_guesses), p_won, coalesce(p_hard_mode, false))
  on conflict (user_id, day) do nothing
  returning * into saved;

  if not found then
    existed := true;
    select * into saved from public.results r where r.user_id = uid and r.day = p_day;
  end if;

  return jsonb_build_object(
    'day', saved.day, 'attempts', saved.attempts, 'won', saved.won,
    'hard_mode', saved.hard_mode, 'created_at', saved.created_at, 'already_saved', existed
  );
end;
$$;

-- Ustawia i zatwierdza nick bieżącego gracza (po tym gracz trafia do rankingów).
create function public.set_nick(p_nick text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v text := btrim(regexp_replace(coalesce(p_nick, ''), '\s+', ' ', 'g'));
begin
  if uid is null then
    raise exception 'Zaloguj się, żeby zmienić nick' using errcode = '28000';
  end if;
  if v !~ '^[0-9A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż _-]{3,20}$' then
    raise exception 'Nick musi mieć 3–20 znaków: litery, cyfry, spacja, _ lub -' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p where lower(p.nick) = lower(v) and p.id <> uid) then
    raise exception 'Nick „%” jest już zajęty', v using errcode = '23505';
  end if;

  update public.profiles set nick = v, nick_confirmed = true where id = uid;
  if not found then
    raise exception 'Nie znaleziono profilu' using errcode = 'P0002';
  end if;
  return v;
exception when unique_violation then
  raise exception 'Nick „%” jest już zajęty', v using errcode = '23505';
end;
$$;

-- Ranking dnia: wygrane, mniej prób wyżej, przy remisie wcześniejszy zapis.
-- Tylko zatwierdzone nicki. Zwraca pierwszą setkę i wiersz bieżącego gracza.
create function public.ranking_day(p_day integer)
returns table (place bigint, nick text, attempts smallint, hard_mode boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select row_number() over (order by r.attempts, r.created_at) as place,
           p.nick, r.attempts, r.hard_mode,
           coalesce(r.user_id = auth.uid(), false) as is_me
    from public.results r
    join public.profiles p on p.id = r.user_id
    where r.day = p_day and r.won and p.nick_confirmed
  )
  select place, nick, attempts, hard_mode, is_me
  from ranked
  where place <= 100 or is_me
  order by place;
$$;

-- Ranking ogólny: wygrane, potem % wygranych, potem najdłuższa seria.
-- Seria to ciąg kolejnych numerów dni z wygraną (metoda luk i wysp).
create function public.ranking_overall(p_limit integer default 100)
returns table (place bigint, nick text, games bigint, wins bigint, win_pct integer, best_streak bigint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with confirmed as (
    select r.user_id, r.day, r.won
    from public.results r
    join public.profiles p on p.id = r.user_id
    where p.nick_confirmed
  ),
  totals as (
    select user_id, count(*) as games, count(*) filter (where won) as wins
    from confirmed
    group by user_id
  ),
  islands as (
    select user_id, day - row_number() over (partition by user_id order by day) as grp
    from confirmed
    where won
  ),
  streaks as (
    select user_id, max(len) as best_streak
    from (select user_id, count(*) as len from islands group by user_id, grp) s
    group by user_id
  ),
  stats as (
    select t.user_id, p.nick, p.created_at, t.games, t.wins,
           round(100.0 * t.wins / t.games)::integer as win_pct,
           coalesce(s.best_streak, 0) as best_streak
    from totals t
    join public.profiles p on p.id = t.user_id
    left join streaks s on s.user_id = t.user_id
  ),
  ranked as (
    select row_number() over (order by wins desc, win_pct desc, best_streak desc, created_at) as place,
           nick, games, wins, win_pct, best_streak,
           coalesce(user_id = auth.uid(), false) as is_me
    from stats
  )
  select place, nick, games, wins, win_pct, best_streak, is_me
  from ranked
  where place <= least(greatest(coalesce(p_limit, 100), 1), 100) or is_me
  order by place;
$$;

-- Usuwa konto bieżącego gracza. Kaskada usuwa profil i wszystkie wyniki.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Zaloguj się, żeby usunąć konto' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- Uprawnienia. Supabase domyślnie pozwala rolom anon i authenticated wywoływać
-- nowe funkcje, więc najpierw wszystko odbieramy, potem nadajemy jawnie.
revoke execute on function public.day_number() from public, anon, authenticated;
revoke execute on function public.submit_result(integer, text[], boolean, boolean) from public, anon, authenticated;
revoke execute on function public.set_nick(text) from public, anon, authenticated;
revoke execute on function public.ranking_day(integer) from public, anon, authenticated;
revoke execute on function public.ranking_overall(integer) from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon, authenticated;

grant execute on function public.day_number() to anon, authenticated;
grant execute on function public.ranking_day(integer) to anon, authenticated;
grant execute on function public.ranking_overall(integer) to anon, authenticated;
grant execute on function public.submit_result(integer, text[], boolean, boolean) to authenticated;
grant execute on function public.set_nick(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
