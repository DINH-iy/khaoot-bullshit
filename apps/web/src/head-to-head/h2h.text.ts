import { defineTexts, translate } from '../i18n/texts.js';

// Head-to-head boards and their replay (boards.tsx, replay.tsx), on phones and the shared screen.
// Lists joined by | are split in the code: picks (rock, paper, scissors) and chess pieces (k, q, r, b, n, p).
export const H2H_TEXTS = defineTexts('head-to-head', {
  score: 'Score: {first} {firstWins}, {second} {secondWins}, first to {target}', you: ' (you)', firstTo: 'first to {target}',
  lastRound: 'Last round', lastRoundLabel: 'Last round: {firstPick} against {secondPick}, {result}', aTie: 'a tie', winsRound: '{name} wins the round', tieAgain: 'A tie, again!',
  youPicked: 'You picked {pick}. Waiting for {name}…', pickOne: 'Round {round}: pick one', yourPick: 'Your pick', picks: 'rock|paper|scissors', picked: 'picked', thinking: 'thinking…',
  ttt: 'Tic-tac-toe: {first} ✕, {second} ◯', cell: 'Row {row}, column {column}: {owner}', empty: 'empty',
  piece: '{color} {piece}', check: 'Check!', chessBoard: 'Chess board', white: 'white', black: 'black', pieces: 'king|queen|rook|bishop|knight|pawn', promoteTo: 'Promote to', cancel: 'Cancel',
  bothPick: 'Both pick at once', yourMove: 'Your move', theirMove: '{name}’s move', draw: 'A draw!', wins: '{name} wins!', winsGaveUp: '{name} wins ({other} gave up)!', gaveUp: '{name} gave up.', watchReplay: 'Watch the replay', hideReplay: 'Hide the replay', versus: '{first} vs {second}',
  yesGiveUp: 'Yes, give up', keepPlaying: 'Keep playing', giveUp: 'Give up',
  tie: 'Tie', recording: 'Recording…', saved: 'Saved.', replayLabel: 'Replay, move {move} of {total}: {result}', replay: 'Replay', saveVideo: 'Save as video', replayGone: 'The replay disappears when the room ends.',
}, {
  nl: { watchReplay: 'Bekijk de herhaling', hideReplay: 'Verberg de herhaling', gaveUp: '{name} gaf op.',
    score: 'Stand: {first} {firstWins}, {second} {secondWins}, eerst tot {target}', you: ' (jij)', firstTo: 'eerst tot {target}',
    lastRound: 'Vorige ronde', lastRoundLabel: 'Vorige ronde: {firstPick} tegen {secondPick}, {result}', aTie: 'gelijk', winsRound: '{name} wint de ronde', tieAgain: 'Weer gelijk!',
    youPicked: 'Je koos {pick}. Wachten op {name}…', pickOne: 'Ronde {round}: kies er één', yourPick: 'Jouw keuze', picks: 'steen|papier|schaar', picked: 'gekozen', thinking: 'denkt na…',
    ttt: 'Boter, kaas en eieren: {first} ✕, {second} ◯', cell: 'Rij {row}, kolom {column}: {owner}', empty: 'leeg',
    piece: '{color} {piece}', check: 'Schaak!', chessBoard: 'Schaakbord', white: 'witte', black: 'zwarte', pieces: 'koning|dame|toren|loper|paard|pion', promoteTo: 'Promoveren tot', cancel: 'Annuleren',
    bothPick: 'Allebei tegelijk kiezen', yourMove: 'Jij bent aan zet', theirMove: '{name} is aan zet', draw: 'Gelijkspel!', wins: '{name} wint!', winsGaveUp: '{name} wint ({other} gaf op)!', versus: '{first} tegen {second}',
    yesGiveUp: 'Ja, opgeven', keepPlaying: 'Verder spelen', giveUp: 'Opgeven',
    tie: 'Gelijk', recording: 'Opnemen…', saved: 'Opgeslagen.', replayLabel: 'Herhaling, zet {move} van {total}: {result}', replay: 'Herhaling', saveVideo: 'Opslaan als video', replayGone: 'De herhaling verdwijnt als de room eindigt.',
  },
  de: { watchReplay: 'Wiederholung ansehen', hideReplay: 'Wiederholung ausblenden', gaveUp: '{name} hat aufgegeben.',
    score: 'Stand: {first} {firstWins}, {second} {secondWins}, wer zuerst {target}', you: ' (du)', firstTo: 'wer zuerst {target}',
    lastRound: 'Letzte Runde', lastRoundLabel: 'Letzte Runde: {firstPick} gegen {secondPick}, {result}', aTie: 'unentschieden', winsRound: '{name} gewinnt die Runde', tieAgain: 'Wieder unentschieden!',
    youPicked: 'Du hast {pick} gewählt. Warten auf {name}…', pickOne: 'Runde {round}: wähle eins', yourPick: 'Deine Wahl', picks: 'Stein|Papier|Schere', picked: 'gewählt', thinking: 'überlegt…',
    ttt: 'Tic-Tac-Toe: {first} ✕, {second} ◯', cell: 'Reihe {row}, Spalte {column}: {owner}', empty: 'leer',
    piece: '{color} {piece}', check: 'Schach!', chessBoard: 'Schachbrett', white: 'weißer', black: 'schwarzer', pieces: 'König|Dame|Turm|Läufer|Springer|Bauer', promoteTo: 'Umwandeln in', cancel: 'Abbrechen',
    bothPick: 'Beide wählen gleichzeitig', yourMove: 'Du bist am Zug', theirMove: '{name} ist am Zug', draw: 'Unentschieden!', wins: '{name} gewinnt!', winsGaveUp: '{name} gewinnt ({other} hat aufgegeben)!', versus: '{first} gegen {second}',
    yesGiveUp: 'Ja, aufgeben', keepPlaying: 'Weiterspielen', giveUp: 'Aufgeben',
    tie: 'Unentschieden', recording: 'Wird aufgenommen…', saved: 'Gespeichert.', replayLabel: 'Wiederholung, Zug {move} von {total}: {result}', replay: 'Wiederholung', saveVideo: 'Als Video speichern', replayGone: 'Die Wiederholung verschwindet, wenn der Raum endet.',
  },
  ro: { watchReplay: 'Vezi reluarea', hideReplay: 'Ascunde reluarea', gaveUp: '{name} a renunțat.',
    score: 'Scor: {first} {firstWins}, {second} {secondWins}, primul la {target}', you: ' (tu)', firstTo: 'primul la {target}',
    lastRound: 'Runda trecută', lastRoundLabel: 'Runda trecută: {firstPick} contra {secondPick}, {result}', aTie: 'egalitate', winsRound: '{name} câștigă runda', tieAgain: 'Iar egalitate!',
    youPicked: 'Ai ales {pick}. Se așteaptă {name}…', pickOne: 'Runda {round}: alege unul', yourPick: 'Alegerea ta', picks: 'piatră|hârtie|foarfecă', picked: 'a ales', thinking: 'se gândește…',
    ttt: 'X și 0: {first} ✕, {second} ◯', cell: 'Rândul {row}, coloana {column}: {owner}', empty: 'gol',
    piece: '{piece} {color}', check: 'Șah!', chessBoard: 'Tablă de șah', white: 'alb', black: 'negru', pieces: 'rege|regină|turn|nebun|cal|pion', promoteTo: 'Transformă în', cancel: 'Anulează',
    bothPick: 'Amândoi aleg deodată', yourMove: 'E rândul tău', theirMove: 'E rândul lui {name}', draw: 'Remiză!', wins: '{name} câștigă!', winsGaveUp: '{name} câștigă ({other} a abandonat)!', versus: '{first} contra {second}',
    yesGiveUp: 'Da, abandonez', keepPlaying: 'Joc mai departe', giveUp: 'Abandonează',
    tie: 'Egalitate', recording: 'Se înregistrează…', saved: 'Salvat.', replayLabel: 'Reluare, mutarea {move} din {total}: {result}', replay: 'Reluare', saveVideo: 'Salvează ca video', replayGone: 'Reluarea dispare când se termină camera.',
  },
});

export const h = (key: keyof typeof H2H_TEXTS.en, values?: Record<string, string | number>) => translate(H2H_TEXTS, key, values);
export const listItem = (key: 'picks' | 'pieces', index: number) => h(key).split('|')[index] ?? '';
