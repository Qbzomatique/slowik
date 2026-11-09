-- Testy rankingu serwera (docs/discord-activity.md, D4, D6–D8). Niczego nie zmienia: wszystko w bloku
-- wycofywanym na końcu. Wymaga gracza, który dziś skończył grę w Activity i ma zatwierdzony nick.
-- Uruchomienie: wklej do SQL Editor; każdy wiersz powinien mieć ok = true.

drop table if exists pg_temp.guild_checks;
create temp table guild_checks (test text, ok boolean);

do $$
declare
  v_day integer := public.day_number();
  v_guild text;
  v_member uuid;
  v_count bigint;
  v_stranger boolean;
  v_member_sees boolean;
  v_columns boolean;
  v_anon boolean := false;
  v_unconfirmed boolean;
  v_deleted boolean;
begin
  select g.guild_id, g.user_id into v_guild, v_member
  from public.guild_players g
  join public.results r on r.user_id = g.user_id and r.day = v_day
  join public.profiles p on p.id = g.user_id and p.nick_confirmed
  limit 1;

  if v_guild is null then
    insert into guild_checks values ('brak gracza z dzisiejszym wynikiem w Activity', false);
    return;
  end if;

  begin
    -- D6: gracz spoza serwera
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_count from public.ranking_guild(v_guild, v_day);
    v_stranger := v_count = 0;

    -- Członek serwera widzi wyniki; D7: tylko dozwolone kolumny
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    select count(*) into v_count from public.ranking_guild(v_guild, v_day);
    v_member_sees := v_count >= 1;
    select coalesce(bool_and((select array_agg(k order by k) from jsonb_object_keys(to_jsonb(t)) as k)
                             = array['attempts', 'hard_mode', 'is_me', 'nick', 'place', 'won']), false)
      into v_columns from public.ranking_guild(v_guild, v_day) t;

    -- Niezalogowany nie ma dostępu
    set local role anon;
    begin
      perform public.ranking_guild(v_guild, v_day);
    exception when insufficient_privilege then
      v_anon := true;
    end;

    -- D4: niezatwierdzony nick znika z rankingu
    reset role;
    update public.profiles set nick_confirmed = false where id = v_member;
    set local role authenticated;
    select count(*) into v_count from public.ranking_guild(v_guild, v_day) t where t.is_me;
    v_unconfirmed := v_count = 0;

    -- D8: usunięcie konta kasuje wpisy serwerów
    reset role;
    delete from auth.users where id = v_member;
    select count(*) into v_count from public.guild_players where user_id = v_member;
    v_deleted := v_count = 0;

    raise exception 'wycofaj zmiany' using errcode = 'SL001';
  exception when sqlstate 'SL001' then
    null;
  end;

  reset role;
  insert into guild_checks values
    ('D6 gracz spoza serwera nie widzi rankingu', v_stranger),
    ('członek serwera widzi ranking', v_member_sees),
    ('D7 tylko dozwolone kolumny', v_columns),
    ('niezalogowany bez dostępu', v_anon),
    ('D4 niezatwierdzony nick poza rankingiem', v_unconfirmed),
    ('D8 usunięcie konta kasuje wpisy serwerów', v_deleted);
end;
$$;

select * from guild_checks;
