// Ręczne testy RLS (docs/backend.md, rozdział 9) jako zalogowany gracz A.
// Nie działa w CI, bo potrzebuje prawdziwej sesji. Uruchomienie: zaloguj się na stronie gry
// i wpisz w konsoli przeglądarki:
//   await import('https://qbzomatique.github.io/slowik/tests/manual/rls_console.js?v=1')
// UWAGA: zapisuje przykładowy wynik na wczorajszy dzień, więc używaj konta, które potem usuniesz (R17).
// Wynik nie zawiera tokenów ani identyfikatorów.
(async () => {
  const session = JSON.parse(localStorage.getItem('slowik.auth') || 'null');
  if (!session || !session.access_token) {
    console.log('BŁĄD: nie jesteś zalogowany na tej stronie.');
    return;
  }
  const me = session.user.id;
  const base = SUPABASE_URL + '/rest/v1';
  const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };

  async function req(path, method = 'GET', body) {
    const r = await fetch(base + path, { method, headers: { ...headers, Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* pusta odpowiedź */ }
    return { status: r.status, json };
  }
  const rpc = (fn, args = {}) => req('/rpc/' + fn, 'POST', args);
  const denied = r => r.status >= 400 && r.json && r.json.code === '42501';
  const invalid = r => r.status >= 400 && r.json && r.json.code === '22023';

  const lines = [];
  const check = (id, name, pass, detail) => lines.push(`${pass ? 'OK  ' : 'BŁĄD'} ${id} ${name}${!pass && detail ? ' -> ' + JSON.stringify(detail) : ''}`);

  const today = (await rpc('day_number')).json;
  const day = today - 1; // wczoraj: dzisiejsza gra zostaje do prawdziwego wyniku

  let r = await req('/results', 'POST', { user_id: me, day, guesses: ['dzwon'], attempts: 1, won: true });
  check('R5', 'bezpośredni insert do results zablokowany', denied(r), r);

  const first = await rpc('submit_result', { p_day: day, p_guesses: ['balon', 'kotek'], p_won: true });
  check('R6', 'submit_result zapisuje wynik', first.status === 200 && first.json.attempts >= 1, first);

  r = await rpc('submit_result', { p_day: day, p_guesses: ['zamek', 'balon', 'kotek'], p_won: true });
  check('R7', 'drugi wynik na ten sam dzień niczego nie nadpisuje', r.status === 200 && r.json.already_saved === true && r.json.attempts === first.json.attempts, r);

  for (const d of [today + 2, today - 2]) {
    r = await rpc('submit_result', { p_day: d, p_guesses: ['kotek'], p_won: true });
    check('R8', `dzień ${d > today ? '+2' : '-2'} poza oknem`, invalid(r), r);
  }

  const six = ['balon', 'zamek', 'kotek', 'pirat', 'sport', 'rynek'];
  const bad = {
    '7 prób': { p_guesses: [...six, 'trawa'], p_won: true },
    '0 prób': { p_guesses: [], p_won: true },
    'próba 4-literowa': { p_guesses: ['kota'], p_won: true },
    'próba z cyfrą': { p_guesses: ['kot3k'], p_won: true },
    'wielkie litery': { p_guesses: ['KOTEK'], p_won: true },
    'przegrana z 3 próbami': { p_guesses: six.slice(0, 3), p_won: false },
  };
  for (const [name, args] of Object.entries(bad)) {
    r = await rpc('submit_result', { p_day: today + 1, ...args });
    check('R9', name, invalid(r), r);
  }

  r = await req(`/results?user_id=eq.${me}&day=eq.${day}`, 'PATCH', { attempts: 1 });
  check('R10', 'update własnego wyniku zablokowany', denied(r), r);
  r = await req(`/results?user_id=eq.${me}&day=eq.${day}`, 'DELETE');
  check('R10', 'delete własnego wyniku zablokowany', denied(r), r);

  r = await req('/results?select=user_id');
  check('R11', 'select z results zwraca tylko własne wiersze', r.status === 200 && r.json.length >= 1 && r.json.every(x => x.user_id === me), { status: r.status, rows: r.json && r.json.length });

  r = await req('/profiles?select=id');
  check('R12', 'select z profiles zwraca tylko własny profil', r.status === 200 && r.json.length === 1 && r.json[0].id === me, { status: r.status, rows: r.json && r.json.length });

  r = await req(`/profiles?id=eq.${me}`, 'PATCH', { nick_confirmed: false });
  check('R13', 'bezpośredni update profilu zablokowany', denied(r), r);

  for (const [name, nick] of [['za krótki', 'ab'], ['niedozwolone znaki', 'a<b>c'], ['za długi', 'x'.repeat(21)]]) {
    r = await rpc('set_nick', { p_nick: nick });
    check('R15', `nick ${name} odrzucony`, invalid(r), r);
  }

  const onlyKeys = (rows, keys) => Array.isArray(rows) && rows.every(x => Object.keys(x).sort().join() === [...keys].sort().join());
  r = await rpc('ranking_day', { p_day: day });
  check('R16', 'ranking dnia: tylko dozwolone kolumny', r.status === 200 && onlyKeys(r.json, ['place', 'nick', 'attempts', 'hard_mode', 'is_me']), r);
  r = await rpc('ranking_overall', { p_limit: 100 });
  check('R16', 'ranking ogólny: tylko dozwolone kolumny', r.status === 200 && onlyKeys(r.json, ['place', 'nick', 'games', 'wins', 'win_pct', 'best_streak', 'is_me']), r);

  console.log(lines.join('\n'));
  console.log(`Razem: ${lines.filter(l => l.startsWith('OK')).length} OK, ${lines.filter(l => l.startsWith('BŁĄD')).length} BŁĄD`);
})();
