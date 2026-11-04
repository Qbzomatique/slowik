// Test 6: logika konta i rankingu po stronie klienta, z atrapą Supabase (bez sieci).
// Uruchomienie: node tests/test_online.js
const { loadOnline } = require('./index');

const { buildPayload, onlineError, createOnline } = loadOnline();
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Pamięć zamiast localStorage (z kopiowaniem, jak przy JSON w prawdziwym store).
function memoryStore(init = {}) {
  const data = JSON.parse(JSON.stringify(init));
  return {
    data,
    get: (k, d) => (k in data ? JSON.parse(JSON.stringify(data[k])) : d),
    set: (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); },
  };
}

// Atrapa klienta Supabase: zapisuje wywołania RPC, odpowiada według podanej funkcji.
function mockClient({ rpc = () => ({ data: { already_saved: false }, error: null }), profile = { nick: 'Ala', nick_confirmed: true } } = {}) {
  const auth = [];
  const client = {
    calls: [],
    auth: {
      onAuthStateChange(cb) { auth.push(cb); },
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile, error: null }) }),
    rpc(fn, args) { client.calls.push([fn, args]); return Promise.resolve(rpc(fn, args)); },
    login(id = 'u1') { auth.forEach(cb => cb('INITIAL_SESSION', { user: { id } })); },
  };
  return client;
}

async function setup({ store = memoryStore(), client = mockClient(), today = 5, timeoutMs = 50 } = {}) {
  const events = [];
  const online = createOnline({ store, dayNumber: () => today, loadClient: async () => client, timeoutMs });
  online.onChange((type, data) => events.push([type, data]));
  await online.init();
  return { online, store, client, events };
}

const won = (day = 5) => ({ day, answer: 'kotek', guesses: ['balon', 'kotek'], status: 'won', hard: true });
const lost = (day = 5) => ({ day, answer: 'kotek', guesses: ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff'], status: 'lost' });
const submits = c => c.calls.filter(([fn]) => fn === 'submit_result');

const tests = {
  'buildPayload: wygrana słowa dnia daje komplet danych'() {
    const p = buildPayload(won(), 'daily');
    return same(p, { p_day: 5, p_guesses: ['balon', 'kotek'], p_won: true, p_hard_mode: true }) || `dostałem ${JSON.stringify(p)}`;
  },
  'buildPayload: przegrana ma p_won = false i 6 prób'() {
    const p = buildPayload(lost(), 'daily');
    return (p && p.p_won === false && p.p_guesses.length === 6 && p.p_hard_mode === false) || `dostałem ${JSON.stringify(p)}`;
  },
  'buildPayload: trening i niedokończona gra nie są wysyłane'() {
    const free = buildPayload({ ...won(), day: 0 }, 'free');
    const freeWithDay = buildPayload(won(), 'free');
    const playing = buildPayload({ ...won(), status: 'playing' }, 'daily');
    return (free === null && freeWithDay === null && playing === null) || 'trening albo gra w toku dała wynik do wysłania';
  },
  async 'zalogowany: po grze wynik idzie do submit_result i znika z kolejki'() {
    const { online, client, store } = await setup();
    client.login(); await tick(5);
    await online.submitGame(won(), 'daily');
    const sent = submits(client);
    if (sent.length !== 1) return `oczekiwano 1 wywołania submit_result, było ${sent.length}`;
    if (!same(sent[0][1], buildPayload(won(), 'daily'))) return `złe argumenty: ${JSON.stringify(sent[0][1])}`;
    return same(store.get('pending', []), []) || 'kolejka nie jest pusta po udanej wysyłce';
  },
  async 'trening nigdy nie trafia do rankingu, także gdy gracz jest zalogowany'() {
    const { online, client } = await setup();
    client.login(); await tick(5);
    await online.submitGame(won(), 'free');
    return submits(client).length === 0 || 'trening został wysłany';
  },
  async 'brak sieci: wynik zostaje w kolejce i idzie przy następnej próbie'() {
    let offline = true;
    const client = mockClient({ rpc: () => (offline ? { data: null, error: { message: 'TypeError: Failed to fetch' } } : { data: { already_saved: false }, error: null }) });
    const { online, store, events } = await setup({ client });
    client.login(); await tick(5);
    const first = await online.submitGame(won(), 'daily');
    if (store.get('pending', []).length !== 1) return 'wynik nie został w kolejce po błędzie sieci';
    if (!first[0].retry || !/Brak połączenia/.test(first[0].message)) return `zły komunikat: ${JSON.stringify(first[0])}`;
    offline = false;
    await online.flush();
    if (store.get('pending', []).length !== 0) return 'kolejka nie opustoszała po powrocie sieci';
    return events.some(([t, d]) => t === 'submitted' && d.ok) || 'brak zdarzenia o udanym zapisie';
  },
  async 'odrzucenie przez walidację serwera usuwa wynik z kolejki'() {
    const client = mockClient({ rpc: () => ({ data: null, error: { code: '22023', message: 'Przegrana oznacza 6 prób' } }) });
    const { online, store } = await setup({ client });
    client.login(); await tick(5);
    const out = await online.submitGame(won(), 'daily');
    if (store.get('pending', []).length !== 0) return 'odrzucony wynik został w kolejce';
    return out[0].message === 'Przegrana oznacza 6 prób' || `komunikat serwera nie dotarł: ${out[0].message}`;
  },
  async 'wyniki spoza okna ±1 dzień są porzucane bez wysyłania'() {
    const store = memoryStore({ pending: [buildPayload(won(2), 'daily'), buildPayload(won(4), 'daily')] });
    const { client } = await setup({ store });
    client.login(); await tick(5);
    const days = submits(client).map(([, a]) => a.p_day);
    return (same(days, [4]) && same(store.get('pending', []), [])) || `wysłane dni: ${JSON.stringify(days)}`;
  },
  async 'logowanie po grze: dzisiejszy wynik z localStorage idzie raz'() {
    const store = memoryStore({ daily: won() });
    const first = await setup({ store });
    first.client.login(); await tick(5);
    if (submits(first.client).length !== 1) return `po zalogowaniu wysłano ${submits(first.client).length} wyników zamiast 1`;
    const again = await setup({ store }); // odświeżenie strony: ta sama sesja, ten sam store
    again.client.login(); await tick(5);
    return submits(again.client).length === 0 || 'po odświeżeniu strony wynik poszedł drugi raz';
  },
  async 'logowanie na innym koncie wysyła dzisiejszy wynik także dla niego'() {
    const store = memoryStore({ daily: won() });
    const a = await setup({ store });
    a.client.login('u1'); await tick(5);
    const b = await setup({ store });
    b.client.login('u2'); await tick(5);
    return submits(b.client).length === 1 || 'drugie konto nie dostało dzisiejszego wyniku';
  },
  async 'nie wysyła wczorajszej gry z localStorage, gdy minęły 2 dni'() {
    const store = memoryStore({ daily: won(3) });
    const { client } = await setup({ store, today: 5 });
    client.login(); await tick(5);
    return submits(client).length === 0 || 'wysłano wynik spoza okna';
  },
  async 'niezatwierdzony nick wywołuje prośbę o nick'() {
    const client = mockClient({ profile: { nick: 'Jan Kowalski', nick_confirmed: false } });
    const { events } = await setup({ client });
    client.login(); await tick(5);
    return events.some(([t, d]) => t === 'needNick' && d === 'Jan Kowalski') || 'brak zdarzenia needNick z podpowiedzią';
  },
  async 'serwer nie odpowiada: limit czasu i komunikat po polsku'() {
    const client = mockClient({ rpc: () => new Promise(() => {}) });
    const { online } = await setup({ client, timeoutMs: 20 });
    client.login(); await tick(5);
    const r = await online.rankingDay(5);
    return /nie odpowiada/.test(r.error || '') || `dostałem ${JSON.stringify(r)}`;
  },
  async 'brak biblioteki Supabase nie psuje niczego'() {
    const online = createOnline({ store: memoryStore(), dayNumber: () => 5, loadClient: async () => { throw new Error('CDN niedostępny'); } });
    const ok = await online.init();
    const sign = await online.signIn('http://localhost:8000/');
    const out = await online.submitGame(won(), 'daily');
    return (ok === false && /niedostępne/.test(sign.error) && same(out, [])) || 'moduł nie obsłużył braku biblioteki';
  },
  async 'usunięcie konta czyści kolejkę i znaczniki wysłanych wyników'() {
    const store = memoryStore({ daily: won() });
    const { online, client } = await setup({ store });
    client.login(); await tick(5);
    const r = await online.deleteAccount();
    if (r.error) return `błąd: ${r.error}`;
    const sent = store.get('sent', {});
    return (!online.user && !('u1' in sent) && same(store.get('pending', []), [])) || 'po usunięciu konta zostały dane';
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
    console.log(`BŁĄD: ${failed} z ${Object.keys(tests).length} testów konta i rankingu nie przeszło`);
    process.exit(1);
  }
})();
