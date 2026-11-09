-- Ranking serwera Discord: kto z serwera grał w Activity i z jakim wynikiem.
-- Opis: docs/discord-activity.md, 4.3. Zapis do guild_players tylko z Edge Function,
-- po sprawdzeniu instancji w API Discorda.

create table public.guild_players (
  guild_id  text not null,
  user_id   uuid not null references auth.users (id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (guild_id, user_id)
);

comment on table public.guild_players is
  'Gracze, którzy uruchomili Activity na danym serwerze. Nie jest to lista członków serwera.';

alter table public.guild_players enable row level security;

revoke all on public.guild_players from anon, authenticated;
grant select on public.guild_players to authenticated;

create policy "Gracz widzi tylko własne serwery"
  on public.guild_players for select to authenticated
  using (user_id = (select auth.uid()));
comment on policy "Gracz widzi tylko własne serwery" on public.guild_players is
  'Pozwala zalogowanemu odczytać wyłącznie własne wpisy. INSERT/UPDATE/DELETE nie mają polityk: wpis dodaje Edge Function, usuwa kaskada z delete_my_account.';

-- Wyniki dnia graczy serwera. Tylko dla kogoś, kto sam grał na tym serwerze, i tylko zatwierdzone nicki.
-- Najpierw wygrane według liczby prób, potem przegrane. Bez prób i identyfikatorów.
create function public.ranking_guild(p_guild_id text, p_day integer)
returns table (place bigint, nick text, attempts smallint, won boolean, hard_mode boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by r.won desc, r.attempts, r.created_at) as place,
         p.nick, r.attempts, r.won, r.hard_mode,
         coalesce(r.user_id = auth.uid(), false) as is_me
  from public.guild_players g
  join public.results r on r.user_id = g.user_id and r.day = p_day
  join public.profiles p on p.id = g.user_id
  where g.guild_id = p_guild_id
    and p.nick_confirmed
    and exists (
      select 1 from public.guild_players me
      where me.guild_id = p_guild_id and me.user_id = auth.uid()
    )
  order by place
  limit 100;
$$;

revoke execute on function public.ranking_guild(text, integer) from public, anon, authenticated;
grant execute on function public.ranking_guild(text, integer) to authenticated;
