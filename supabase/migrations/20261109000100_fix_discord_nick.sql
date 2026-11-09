-- Poprawka podpowiedzi nicku: konto Discord bez nazwy wyświetlanej może mieć pusty
-- global_name, a pusty tekst przechodził przez coalesce i dawał nick awaryjny „gracz1”.
-- Puste wartości są teraz pomijane, a z pola name usuwamy końcówkę „#0”.

create or replace function public.handle_new_user()
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
  base := coalesce(
    nullif(btrim(meta -> 'custom_claims' ->> 'global_name'), ''),
    nullif(btrim(meta ->> 'full_name'), ''),
    nullif(btrim(regexp_replace(meta ->> 'name', '#[0-9]+$', '')), ''),
    ''
  );
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
