// Ręczne testy gry sprawdzanej przez serwer (docs/ukrycie-hasel.md) jako zalogowany gracz.
// Uruchomienie: zaloguj się na stronie gry i wpisz w konsoli przeglądarki:
//   await import('https://qbzomatique.github.io/slowik/tests/manual/gra_console.js?v=1')
// UWAGA: rozgrywa przegraną grę na wczorajszy dzień, więc dopisuje ją do statystyk konta.
// Hasła nie wypisuje.
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
  const safe = r => ({ status: r.status, code: r.json && r.json.code, message: r.json && r.json.message });
  const lines = [];
  const check = (id, name, pass, detail) => lines.push(`${pass ? 'OK  ' : 'BŁĄD'} ${id} ${name}${!pass && detail ? ' -> ' + JSON.stringify(detail) : ''}`);

  const today = (await rpc('day_number')).json;
  const day = today - 1;
  const play = word => rpc('play_guess', { p_day: day, p_word: word });

  let r = await rpc('submit_result', { p_day: day, p_guesses: ['kotek'], p_won: true });
  check('S1', 'stary zapis wyniku wyłączony', denied(r), safe(r));
  r = await play('qqqqq');
  check('S2', 'słowo spoza słownika odrzucone', invalid(r), safe(r));
  r = await rpc('play_guess', { p_day: today + 2, p_word: 'balon' });
  check('S3', 'dzień poza oknem odrzucony', invalid(r), safe(r));
  r = await rpc('check_guess', { p_day: day, p_words: ['balon'] });
  check('S4', 'zalogowany nie używa check_guess', denied(r), safe(r));

  const words = ['balon', 'pirat', 'sport', 'rynek', 'osoba'];
  let hidden = true, colored = true;
  for (const w of words) {
    r = await play(w);
    if (r.status !== 200 || r.json.status !== 'playing' || r.json.answer !== null) hidden = false;
    if (r.status !== 200 || !Array.isArray(r.json.result) || r.json.result.length !== 5) colored = false;
  }
  check('S5', 'hasło nie pada przed końcem gry', hidden);
  check('S6', 'serwer zwraca kolory', colored);
  r = await play('kotek');
  check('S7', 'po 6 próbach przegrana i hasło dla zalogowanego', r.status === 200 && r.json.status === 'lost' && typeof r.json.answer === 'string', safe(r));
  r = await play('trawa');
  check('S8', 'siódma próba odrzucona', invalid(r), safe(r));

  r = await rpc('get_game', { p_day: day });
  check('S9', 'get_game zwraca stan gry', r.status === 200 && r.json.status === 'lost' && r.json.results.length === 6, safe(r));
  r = await req(`/results?select=attempts,won&day=eq.${day}`);
  check('S10', 'wynik powstał z play_guess', r.status === 200 && r.json.length === 1 && r.json[0].attempts === 6 && r.json[0].won === false, safe(r));
  r = await req('/games', 'POST', { user_id: me, day: today, guesses: [], status: 'won' });
  check('S11', 'bezpośredni insert do games zablokowany', denied(r), safe(r));
  r = await req(`/games?user_id=eq.${me}&day=eq.${day}`, 'PATCH', { status: 'won' });
  check('S12', 'update gry zablokowany', denied(r), safe(r));
  r = await req('/answers?select=day&limit=1');
  check('S13', 'tabeli haseł nie ma w API', r.status >= 400, safe(r));

  console.log(lines.join('\n'));
  console.log(`Razem: ${lines.filter(l => l.startsWith('OK')).length} OK, ${lines.filter(l => l.startsWith('BŁĄD')).length} BŁĄD`);
})();
