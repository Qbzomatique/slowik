-- Profile graczy: nick widoczny w rankingach po świadomym zatwierdzeniu.
-- Opis wymagań: docs/backend.md, rozdziały 5.1, 6 i 7.

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nick           text not null,
  nick_confirmed boolean not null default false,
  created_at     timestamptz not null default now(),
  -- 3–20 znaków: litery (także polskie), cyfry, spacja, _ i -; bez spacji na brzegach.
  constraint profiles_nick_format check (
    nick ~ '^[0-9A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż _-]{3,20}$' and nick = btrim(nick)
  )
);

comment on table public.profiles is
  'Profil gracza. Nick jest publiczny w rankingach dopiero po zatwierdzeniu (nick_confirmed).';
comment on column public.profiles.nick_confirmed is
  'false: nick to podpowiedź z Discorda, gracz nie występuje w rankingach. true: gracz zatwierdził nick przez set_nick.';

-- Nicki są unikalne bez względu na wielkość liter.
create unique index profiles_nick_lower_key on public.profiles (lower(nick));

-- RLS: domyślnie wszystko zabronione, poniżej jedyny wyjątek.
alter table public.profiles enable row level security;

-- Supabase domyślnie nadaje rolom klienta wszystkie prawa do nowych tabel.
-- Zostawiamy tylko odczyt dla zalogowanych; zmiany idą przez funkcje (migracja 300).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "Gracz widzi tylko własny profil"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
comment on policy "Gracz widzi tylko własny profil" on public.profiles is
  'Pozwala zalogowanemu odczytać wyłącznie swój wiersz (nick i znacznik zatwierdzenia). Cudze nicki są dostępne tylko przez funkcje rankingów, a INSERT/UPDATE/DELETE nie ma żadnej polityki, więc są zabronione.';

-- Profil zakłada się sam po pierwszym logowaniu. Nick to oczyszczona nazwa z Discorda
-- (zawsze niezatwierdzona); przy kolizji dopisujemy numer.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base text;
  candidate text;
  n int := 0;
begin
  base := coalesce(meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name', meta ->> 'name', '');
  base := regexp_replace(base, '[^0-9A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż _-]', '', 'g');
  base := btrim(regexp_replace(base, '\s+', ' ', 'g'));
  base := btrim(left(base, 20));
  if length(base) < 3 then
    base := 'gracz';
    n := 1;
  end if;

  loop
    candidate := case when n = 0 then base
                      else btrim(left(base, 20 - length(n::text))) || n::text end;
    begin
      insert into public.profiles (id, nick) values (new.id, candidate);
      return new;
    exception when unique_violation then
      n := n + 1;
    end;
  end loop;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
