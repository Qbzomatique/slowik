-- Wyniki słowa dnia. Jeden wynik na gracza na dzień; zapis tylko przez submit_result.
-- Opis wymagań: docs/backend.md, rozdziały 6 i 7.

create table public.results (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        integer not null check (day >= 1),
  guesses    text[] not null,
  attempts   smallint not null,
  won        boolean not null,
  hard_mode  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint results_attempts check (attempts between 1 and 6 and attempts = cardinality(guesses)),
  -- Każda próba to 5 małych liter polskiego alfabetu.
  constraint results_guesses_format check (
    array_to_string(guesses, ',') ~ '^[a-ząćęłńóśźż]{5}(,[a-ząćęłńóśźż]{5}){0,5}$'
  ),
  constraint results_lost_after_six check (won or attempts = 6)
);

comment on table public.results is
  'Wynik słowa dnia (numer dnia: #1 = 2026-11-04). Trening nigdy tu nie trafia.';
comment on column public.results.hard_mode is
  'Deklaracja gracza, serwer jej nie weryfikuje (docs/backend.md, L3).';

-- Ranking dnia: wygrane danego dnia według liczby prób i czasu zapisu.
create index results_day_ranking_idx on public.results (day, attempts, created_at) where won;

alter table public.results enable row level security;

revoke all on public.results from anon, authenticated;
grant select on public.results to authenticated;

create policy "Gracz widzi tylko własne wyniki"
  on public.results for select to authenticated
  using (user_id = (select auth.uid()));
comment on policy "Gracz widzi tylko własne wyniki" on public.results is
  'Pozwala zalogowanemu odczytać wyłącznie swoje wyniki razem z próbami. Cudzych prób nie widzi nikt (spoilery). INSERT/UPDATE/DELETE nie mają polityk, więc są zabronione: zapis tylko przez submit_result, usunięcie tylko kaskadą z delete_my_account.';
