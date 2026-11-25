import { defineTexts } from '../i18n/texts.js';

export const ROOM_WORDS_TEXTS = defineTexts('room-words', {
  title: 'Your words (Galgje, Undercover)', inUse: 'Galgje {words} · Undercover {pairs}', hint: 'The next Galgje or Undercover round uses these instead of the game’s own words. Only you see them; a round already playing keeps its word.',
  words: 'Galgje: one word or short phrase per line', pairs: 'Undercover: one pair per line, the civilians’ word first (koffie, thee)', save: 'Save my words', clear: 'Use the game’s words again',
  saved: 'Saved. The next round uses your words.', cleared: 'The game’s own words are used again.', failed: 'Your words could not be saved. Try again.', skipped: 'Left out: {count} (check the letters, or the comma in a pair).',
}, {
  nl: {
    title: 'Je eigen woorden (Galgje, Undercover)', inUse: 'Galgje {words} · Undercover {pairs}', hint: 'De volgende ronde Galgje of Undercover gebruikt deze in plaats van de woorden van het spel. Alleen jij ziet ze; een ronde die al loopt houdt haar woord.',
    words: 'Galgje: één woord of korte zin per regel', pairs: 'Undercover: één paar per regel, eerst het woord van de burgers (koffie, thee)', save: 'Mijn woorden bewaren', clear: 'Weer de woorden van het spel gebruiken',
    saved: 'Bewaard. De volgende ronde gebruikt jouw woorden.', cleared: 'De eigen woorden van het spel worden weer gebruikt.', failed: 'Je woorden konden niet bewaard worden. Probeer het opnieuw.', skipped: 'Weggelaten: {count} (controleer de letters, of de komma in een paar).',
  },
  de: {
    title: 'Deine Wörter (Galgenmännchen, Undercover)', inUse: 'Galgenmännchen {words} · Undercover {pairs}', hint: 'Die nächste Runde Galgenmännchen oder Undercover nutzt diese statt der Wörter des Spiels. Nur du siehst sie; eine laufende Runde behält ihr Wort.',
    words: 'Galgenmännchen: ein Wort oder kurzer Satz pro Zeile', pairs: 'Undercover: ein Paar pro Zeile, zuerst das Wort der Bürger (Kaffee, Tee)', save: 'Meine Wörter speichern', clear: 'Wieder die Wörter des Spiels nutzen',
    saved: 'Gespeichert. Die nächste Runde nutzt deine Wörter.', cleared: 'Die eigenen Wörter des Spiels werden wieder genutzt.', failed: 'Deine Wörter konnten nicht gespeichert werden. Versuche es erneut.', skipped: 'Weggelassen: {count} (prüfe die Buchstaben oder das Komma in einem Paar).',
  },
  ro: {
    title: 'Cuvintele tale (Spânzurătoarea, Undercover)', inUse: 'Spânzurătoarea {words} · Undercover {pairs}', hint: 'Următoarea rundă de Spânzurătoarea sau Undercover le folosește în locul cuvintelor jocului. Doar tu le vezi; o rundă în desfășurare își păstrează cuvântul.',
    words: 'Spânzurătoarea: un cuvânt sau o expresie scurtă pe rând', pairs: 'Undercover: o pereche pe rând, întâi cuvântul civililor (cafea, ceai)', save: 'Salvează cuvintele mele', clear: 'Folosește din nou cuvintele jocului',
    saved: 'Salvat. Următoarea rundă folosește cuvintele tale.', cleared: 'Se folosesc din nou cuvintele jocului.', failed: 'Cuvintele nu au putut fi salvate. Încearcă din nou.', skipped: 'Omise: {count} (verifică literele sau virgula dintr-o pereche).',
  },
});
