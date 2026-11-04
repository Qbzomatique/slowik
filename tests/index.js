// Wspólne funkcje testów w Node: odczyt skryptów z index.html.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Skrypty osadzone w index.html (bez tych z atrybutem src).
function inlineScripts() {
  return [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
}

// Funkcja score z gry, wyjęta z index.html razem z pomocniczym chars.
function loadScore() {
  const code = inlineScripts().join('\n');
  const chars = code.match(/^const chars=.*$/m);
  const score = code.match(/^function score\([\s\S]*?\n\}$/m);
  if (!chars || !score) fail('Nie znalazłem w index.html „const chars=” albo „function score(”. Czy zmieniła się ich postać?');
  return vm.runInNewContext(`${chars[0]}\n${score[0]}\nscore`);
}

function fail(msg) {
  console.log(`BŁĄD: ${msg}`);
  process.exit(1);
}

module.exports = { read, inlineScripts, loadScore, fail };
