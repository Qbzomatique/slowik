// Test 4: kolorowanie prób (funkcja score z index.html).
// Uruchomienie: node tests/test_score.js
const { loadScore } = require('./index');

const score = loadScore();
const H = 'hit', N = 'near', M = 'miss';

const cases = [
  ['kotek', 'kółko', [H, N, M, M, N], 'ó to nie o, a druga litera k jest na złym miejscu'],
  ['lalka', 'balon', [M, H, H, M, M], 'powtórzone l: jedno trafione, drugie już bez pary'],
  ['aaaaa', 'balon', [M, H, M, M, M], 'pięć a, w haśle jedno'],
  ['słowo', 'słowo', [H, H, H, H, H], 'cała próba trafiona'],
  ['wasik', 'wąsik', [H, M, H, H, H], 'ą to nie a'],
  ['sączę', 'część', [M, M, N, N, N], 's to nie ś, ą nie ma w haśle, c, z i ę na złych miejscach'],
];

let failed = 0;
for (const [guess, answer, want, why] of cases) {
  const got = score(guess, answer);
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log(`OK: ${guess}/${answer} → ${got.join(',')}`);
  } else {
    failed++;
    console.log(`BŁĄD: ${guess}/${answer} (${why}): oczekiwano ${want.join(',')}, jest ${got.join(',')}`);
  }
}
if (failed) {
  console.log(`BŁĄD: ${failed} z ${cases.length} przypadków kolorowania nie przeszło`);
  process.exit(1);
}
