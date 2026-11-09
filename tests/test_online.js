// Test 6: logika konta i słowa dnia po stronie klienta, z atrapą Supabase (bez sieci).
// Uruchomienie: node tests/test_online.js
const { loadOnline } = require('./index');

const { applyGuess, needsColors, onlineError, createOnline, emptyDaily } = loadOnline();
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const H = ['hit', 'hit', 'hit', 'hit', 'hit'], M = ['miss', 'miss', 'miss', 'miss', 'miss'];

const memoryStore = () => ({ get: (k, d) => d, set() {} });

// Atrapa klienta Supabase: zapisuje wywołania RPC, odpowiada według podanej funkcji.
function mockClient({ rpc = () => ({ data: null, error: null }), profile = { nick: 'Ala', nick_confirmed: true }, session = null } = {}) {
  const auth = [];
  const client = {
    calls: [],
    auth: {
      onAuthStateChange(cb) { auth.push(cb); },
      getSession: async () => ({ data: { session } }),
      signInWithOAuth: async () => ({ error: null }),
      setSession: async tokens => { client.tokens = tokens; return { error: null }; },
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile, error: null }) }),
    rpc(fn, args) { client.calls.push([fn, args]); return Promise.resolve(rpc(fn, args)); },
    login(id = 'u1') { auth.forEach(cb => cb('INITIAL_SESSION', { user: { id } })); },
  };
  return client;
}

async function setup({ client = mockClient(), timeoutMs = 50 } = {}) {
  const events = [];
  const online = createOnline({ store: memoryStore(), dayNumber: () => 5, loadClient: async () => client, timeoutMs });
  online.onChange((type, data) => events.push([type, data]));
  await online.init();
  return { online, client, events };
}
const named = (c, fn) => c.calls.filter(([f]) => f === fn);
const game = (guesses = [], results = []) => ({ ...emptyDaily(5), guesses, results });

const tests = {
  async 'niezalogowany: wysyła wszystkie próby do check_guess'() {
    const client = mockClient({ rpc: () => ({ data: { results: [M, H], status: 'won' }, error: null }) });
    const { online } = await setup({ client });
    const r = await online.guess(game(['balon'], [M]), 'kotek');
    if (!same(named(client, 'check_guess')[0][1], { p_day: 5, p_words: ['balon', 'kotek'] })) return `złe argumenty: ${JSON.stringify(client.calls)}`;
    return same(r, { result: H, status: 'won' }) || `dostałem ${JSON.stringify(r)}`;
  },
  async 'zalogowany: próba idzie do play_guess z trybem trudnym, nie do check_guess'() {
    const client = mockClient({ rpc: () => ({ data: { result: M, status: 'playing' }, error: null }) });
    const { online } = await setup({ client });
    client.login(); await tick(5);
    await online.guess({ ...game(), hard: true }, 'balon');
    if (named(client, 'check_guess').length) return 'zalogowany użył check_guess';
    return same(named(client, 'play_guess')[0][1], { p_day: 5, p_word: 'balon', p_hard: true }) || `złe argumenty: ${JSON.stringify(client.calls)}`;
  },
  async 'sesja zapisana w przeglądarce jest znana zaraz po init'() {
    const client = mockClient({ session: { user: { id: 'u1' } }, rpc: () => ({ data: { result: M, status: 'playing' }, error: null }) });
    const { online } = await setup({ client });
    await online.guess(game(), 'balon');
    return named(client, 'play_guess').length === 1 || 'pierwsza próba poszła jako gracz niezalogowany';
  },
  'applyGuess: przegrana bez hasła zostawia answer = null, wygrana podaje słowo'() {
    const lost = applyGuess(game(), 'balon', { result: M, status: 'lost' });
    const won = applyGuess(game(), 'kotek', { result: H, status: 'won' });
    const told = applyGuess(game(), 'balon', { result: M, status: 'lost', answer: 'kotek' });
    return (lost.answer === null && won.answer === 'kotek' && told.answer === 'kotek') || 'złe hasło w stanie gry';
  },
  async 'błąd sieci: próba nie jest liczona i wraca komunikat po polsku'() {
    const client = mockClient({ rpc: () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } }) });
    const { online } = await setup({ client });
    const r = await online.guess(game(), 'balon');
    return /Brak połączenia/.test(r.error || '') || `dostałem ${JSON.stringify(r)}`;
  },
  async 'serwer nie odpowiada: limit czasu i komunikat po polsku'() {
    const client = mockClient({ rpc: () => new Promise(() => {}) });
    const { online } = await setup({ client, timeoutMs: 20 });
    const r = await online.rankingDay(5);
    return /nie odpowiada/.test(r.error || '') || `dostałem ${JSON.stringify(r)}`;
  },
  async 'brak biblioteki Supabase: słowo dnia niedostępne, reszta bez wyjątku'() {
    const online = createOnline({ store: memoryStore(), dayNumber: () => 5, loadClient: async () => { throw new Error('CDN niedostępny'); } });
    const ok = await online.init();
    const sign = await online.signIn('http://localhost:8000/');
    const g = await online.guess(game(), 'balon');
    return (ok === false && /niedostępne/.test(sign.error) && /Trening/.test(g.error)) || 'moduł nie obsłużył braku biblioteki';
  },
  async 'logowanie: gra z konta zastępuje lokalną'() {
    const data = { guesses: ['kotek'], results: [H], status: 'won', hard_mode: false, answer: 'kotek' };
    const client = mockClient({ rpc: () => ({ data, error: null }) });
    const { online } = await setup({ client });
    client.login(); await tick(5);
    const r = await online.syncGame(game(['balon'], [M]), 5);
    if (named(client, 'play_guess').length) return 'odtworzono próby mimo gry na koncie';
    return (r.game.status === 'won' && r.game.answer === 'kotek' && !r.replayed) || `dostałem ${JSON.stringify(r)}`;
  },
  async 'logowanie po przegranej: próby odtwarzane po kolei, gracz dostaje hasło'() {
    const words = ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff'];
    let n = 0;
    const client = mockClient({ rpc: fn => (fn === 'get_game' ? { data: { status: 'none' }, error: null }
      : { data: { result: M, status: ++n === 6 ? 'lost' : 'playing', answer: n === 6 ? 'kotek' : null }, error: null }) });
    const { online } = await setup({ client });
    client.login(); await tick(5);
    const r = await online.syncGame({ ...game(words, words.map(() => M)), status: 'lost' }, 5);
    if (!same(named(client, 'play_guess').map(([, a]) => a.p_word), words)) return `zła kolejność: ${JSON.stringify(client.calls)}`;
    return (r.replayed && r.game.status === 'lost' && r.game.answer === 'kotek') || `dostałem ${JSON.stringify(r)}`;
  },
  async 'logowanie bez lokalnej gry nic nie wysyła'() {
    const client = mockClient({ rpc: () => ({ data: { status: 'none' }, error: null }) });
    const { online } = await setup({ client });
    client.login(); await tick(5);
    const r = await online.syncGame(null, 5);
    return (!r.game && named(client, 'play_guess').length === 0) || 'wysłano próby bez gry';
  },
  async 'wczorajsza gra lokalna nie jest odtwarzana'() {
    const client = mockClient({ rpc: () => ({ data: { status: 'none' }, error: null }) });
    const { online } = await setup({ client });
    client.login(); await tick(5);
    await online.syncGame({ ...game(['balon'], [M]), day: 4 }, 5);
    return named(client, 'play_guess').length === 0 || 'odtworzono grę z innego dnia';
  },
  async 'zapis ze starszej wersji dostaje kolory, a hasło tylko po wygranej'() {
    const client = mockClient({ rpc: () => ({ data: { results: [M], status: 'playing' }, error: null }) });
    const { online } = await setup({ client });
    const old = { day: 5, guesses: ['balon'], status: 'playing', results: [], answer: null };
    if (!needsColors(old) || needsColors(game(['balon'], [M]))) return 'needsColors źle ocenia stan';
    const r = await online.colorize(old);
    return (same(r.game.results, [M]) && r.game.answer === null) || `dostałem ${JSON.stringify(r)}`;
  },
  async 'niezatwierdzony nick wywołuje prośbę o nick'() {
    const client = mockClient({ profile: { nick: 'Jan Kowalski', nick_confirmed: false } });
    const { events } = await setup({ client });
    client.login(); await tick(5);
    return events.some(([t, d]) => t === 'needNick' && d === 'Jan Kowalski') || 'brak zdarzenia needNick z podpowiedzią';
  },
  async 'sesja z Edge Function trafia do klienta Supabase'() {
    const { online, client } = await setup();
    const r = await online.setSession({ access_token: 'a', refresh_token: 'b' });
    return (!r.error && same(client.tokens, { access_token: 'a', refresh_token: 'b' })) || `dostałem ${JSON.stringify(r)}`;
  },
  async 'usunięcie konta wylogowuje'() {
    const { online, client } = await setup();
    client.login(); await tick(5);
    const r = await online.deleteAccount();
    return (!r.error && !online.user && named(client, 'delete_my_account').length === 1) || 'konto nie zostało wylogowane';
  },
  'onlineError: komunikaty z naszych funkcji SQL przechodzą bez zmian'() {
    const m = onlineError({ code: '23505', message: 'Nick „Ala” jest już zajęty' });
    const other = onlineError({ code: 'PGRST202', message: 'Could not find the function' });
    return (m === 'Nick „Ala” jest już zajęty' && /problem/.test(other)) || `dostałem: ${m} / ${other}`;
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    let res;
    try { res = await fn(); } catch (e) { res = `wyjątek: ${e && e.stack || e}`; }
    if (res === true) console.log(`OK: ${name}`);
    else { failed++; console.log(`BŁĄD: ${name}: ${res}`); }
  }
  if (failed) {
    console.log(`BŁĄD: ${failed} z ${Object.keys(tests).length} testów nie przeszło`);
    process.exit(1);
  }
})();
