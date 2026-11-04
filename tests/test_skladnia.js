// Test 5: skrypty z index.html i words.js parsują się bez błędów.
// Uruchomienie: node tests/test_skladnia.js
const vm = require('vm');
const { read, inlineScripts, fail } = require('./index');

function check(name, code) {
  try {
    new vm.Script(code, { filename: name });
    console.log(`OK: ${name} parsuje się poprawnie`);
  } catch (e) {
    fail(`Błąd składni w ${name}: ${e.message}\n${e.stack.split('\n').slice(0, 3).join('\n')}`);
  }
}

const scripts = inlineScripts();
if (!scripts.length) fail('Nie znalazłem w index.html żadnego skryptu <script>…</script>');
scripts.forEach((code, i) => check(`index.html (skrypt ${i + 1})`, code));
check('words.js', read('words.js'));
