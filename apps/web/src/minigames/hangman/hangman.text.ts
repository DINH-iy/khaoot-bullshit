import { defineTexts } from '../../i18n/texts.js';

export const HANGMAN_TEXTS = defineTexts('hangman', {
  ask: 'Pick a letter.', word: 'The word: {pattern}', wordLetters: '{length} letters', found: '{found} of {total} letters found', wrongLeft: '{wrong} wrong · {left} left',
  wrongLetters: 'Wrong letters', gallows: 'Gallows: {wrong} of {lives} wrong', solved: 'Found it!', hanged: 'Hanged', letter: 'Letter {letter}', theWord: 'The word was', wrongCount: '✓ {count} wrong',
}, {
  nl: {
    ask: 'Kies een letter.', word: 'Het woord: {pattern}', wordLetters: '{length} letters', found: '{found} van {total} letters gevonden', wrongLeft: '{wrong} fout · nog {left}',
    wrongLetters: 'Foute letters', gallows: 'Galg: {wrong} van {lives} fout', solved: 'Geraden!', hanged: 'Opgehangen', letter: 'Letter {letter}', theWord: 'Het woord was', wrongCount: '✓ {count} fout',
  },
  de: {
    ask: 'Wähle einen Buchstaben.', word: 'Das Wort: {pattern}', wordLetters: '{length} Buchstaben', found: '{found} von {total} Buchstaben gefunden', wrongLeft: '{wrong} falsch · noch {left}',
    wrongLetters: 'Falsche Buchstaben', gallows: 'Galgen: {wrong} von {lives} falsch', solved: 'Erraten!', hanged: 'Gehängt', letter: 'Buchstabe {letter}', theWord: 'Das Wort war', wrongCount: '✓ {count} falsch',
  },
  ro: {
    ask: 'Alege o literă.', word: 'Cuvântul: {pattern}', wordLetters: '{length} litere', found: '{found} din {total} litere găsite', wrongLeft: '{wrong} greșite · mai ai {left}',
    wrongLetters: 'Litere greșite', gallows: 'Spânzurătoare: {wrong} din {lives} greșite', solved: 'Ghicit!', hanged: 'Spânzurat', letter: 'Litera {letter}', theWord: 'Cuvântul era', wrongCount: '✓ {count} greșite',
  },
});
