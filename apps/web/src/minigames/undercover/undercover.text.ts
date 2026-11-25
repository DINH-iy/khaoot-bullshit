import { defineTexts } from '../../i18n/texts.js';

export const UNDERCOVER_TEXTS = defineTexts('undercover', {
  yourWord: 'Your secret word', showWord: 'Show my word', hideWord: 'Hide', mrWhite: 'You are Mr. White', mrWhiteHint: 'You have no word. Listen, blend in, and guess the word if you are voted out.',
  round: 'Round {round}', cluesTitle: 'Clues, out loud', yourTurn: 'Your turn: say one clue about your word.', clued: 'I gave my clue', speaking: '{name} gives a clue…',
  nextPlayer: 'Next player', voteTitle: 'Vote someone out', voteHint: 'Who has another word?', voted: '{count} of {total} voted', countVotes: 'Count the votes',
  youVoted: 'You voted for {name}. Tap someone else to change.', guessTitle: 'Mr. White guesses the word', guessLabel: 'The civilians’ word', send: 'Guess', guessing: '{name} is Mr. White and guesses the word…',
  moveOn: 'Move on', out: '{name} is out: {role}', tie: 'A tie: nobody is out this round.', youAreOut: 'You are out. Keep watching (and keep quiet).',
  civilian: 'Civilian', undercover: 'Undercover', white: 'Mr. White', winCivilians: 'The civilians win!', winImpostors: 'The impostors win!', winWhite: 'Mr. White guessed the word and wins!',
  tooFew: 'Undercover needs at least 3 players.', timeLeft: '{seconds} s', inGame: 'Players', words: 'The words: {civilian} (civilians) · {undercover} (undercover)', guessed: 'Mr. White guessed “{guess}”',
  hostNext: 'Skip', votes: '{count} votes',
}, {
  nl: {
    yourWord: 'Je geheime woord', showWord: 'Toon mijn woord', hideWord: 'Verberg', mrWhite: 'Jij bent Mr. White', mrWhiteHint: 'Je hebt geen woord. Luister, val niet op, en raad het woord als je eruit gestemd wordt.',
    round: 'Ronde {round}', cluesTitle: 'Hints, hardop', yourTurn: 'Jouw beurt: zeg één hint over je woord.', clued: 'Ik heb mijn hint gegeven', speaking: '{name} geeft een hint…',
    nextPlayer: 'Volgende speler', voteTitle: 'Stem iemand eruit', voteHint: 'Wie heeft een ander woord?', voted: '{count} van {total} gestemd', countVotes: 'Stemmen tellen',
    youVoted: 'Je stemde op {name}. Tik op iemand anders om te wisselen.', guessTitle: 'Mr. White raadt het woord', guessLabel: 'Het woord van de burgers', send: 'Raden', guessing: '{name} is Mr. White en raadt het woord…',
    moveOn: 'Verder', out: '{name} ligt eruit: {role}', tie: 'Gelijkspel: deze ronde ligt niemand eruit.', youAreOut: 'Je ligt eruit. Kijk mee (en zeg niets).',
    civilian: 'Burger', undercover: 'Undercover', white: 'Mr. White', winCivilians: 'De burgers winnen!', winImpostors: 'De infiltranten winnen!', winWhite: 'Mr. White raadde het woord en wint!',
    tooFew: 'Undercover heeft minstens 3 spelers nodig.', timeLeft: '{seconds} s', inGame: 'Spelers', words: 'De woorden: {civilian} (burgers) · {undercover} (undercover)', guessed: 'Mr. White raadde “{guess}”',
    hostNext: 'Overslaan', votes: '{count} stemmen',
  },
  de: {
    yourWord: 'Dein geheimes Wort', showWord: 'Mein Wort zeigen', hideWord: 'Verbergen', mrWhite: 'Du bist Mr. White', mrWhiteHint: 'Du hast kein Wort. Hör zu, fall nicht auf und rate das Wort, wenn du rausgewählt wirst.',
    round: 'Runde {round}', cluesTitle: 'Hinweise, laut', yourTurn: 'Du bist dran: sag einen Hinweis zu deinem Wort.', clued: 'Ich habe meinen Hinweis gegeben', speaking: '{name} gibt einen Hinweis…',
    nextPlayer: 'Nächster Spieler', voteTitle: 'Wähle jemanden raus', voteHint: 'Wer hat ein anderes Wort?', voted: '{count} von {total} abgestimmt', countVotes: 'Stimmen zählen',
    youVoted: 'Du hast für {name} gestimmt. Tippe auf jemand anderen, um zu wechseln.', guessTitle: 'Mr. White rät das Wort', guessLabel: 'Das Wort der Bürger', send: 'Raten', guessing: '{name} ist Mr. White und rät das Wort…',
    moveOn: 'Weiter', out: '{name} ist raus: {role}', tie: 'Gleichstand: diese Runde ist niemand raus.', youAreOut: 'Du bist raus. Schau weiter zu (und sag nichts).',
    civilian: 'Bürger', undercover: 'Undercover', white: 'Mr. White', winCivilians: 'Die Bürger gewinnen!', winImpostors: 'Die Eindringlinge gewinnen!', winWhite: 'Mr. White hat das Wort erraten und gewinnt!',
    tooFew: 'Undercover braucht mindestens 3 Spieler.', timeLeft: '{seconds} s', inGame: 'Spieler', words: 'Die Wörter: {civilian} (Bürger) · {undercover} (Undercover)', guessed: 'Mr. White hat „{guess}“ geraten',
    hostNext: 'Überspringen', votes: '{count} Stimmen',
  },
  ro: {
    yourWord: 'Cuvântul tău secret', showWord: 'Arată-mi cuvântul', hideWord: 'Ascunde', mrWhite: 'Tu ești Mr. White', mrWhiteHint: 'Nu ai cuvânt. Ascultă, nu ieși în evidență și ghicește cuvântul dacă ești eliminat.',
    round: 'Runda {round}', cluesTitle: 'Indicii, cu voce tare', yourTurn: 'E rândul tău: spune un indiciu despre cuvântul tău.', clued: 'Mi-am spus indiciul', speaking: '{name} dă un indiciu…',
    nextPlayer: 'Următorul jucător', voteTitle: 'Votează pe cineva afară', voteHint: 'Cine are alt cuvânt?', voted: '{count} din {total} au votat', countVotes: 'Numără voturile',
    youVoted: 'Ai votat cu {name}. Atinge pe altcineva ca să schimbi.', guessTitle: 'Mr. White ghicește cuvântul', guessLabel: 'Cuvântul civililor', send: 'Ghicește', guessing: '{name} e Mr. White și ghicește cuvântul…',
    moveOn: 'Mai departe', out: '{name} e eliminat: {role}', tie: 'Egalitate: nimeni nu e eliminat runda asta.', youAreOut: 'Ești eliminat. Privește în continuare (și taci).',
    civilian: 'Civil', undercover: 'Undercover', white: 'Mr. White', winCivilians: 'Câștigă civilii!', winImpostors: 'Câștigă impostorii!', winWhite: 'Mr. White a ghicit cuvântul și câștigă!',
    tooFew: 'Undercover are nevoie de cel puțin 3 jucători.', timeLeft: '{seconds} s', inGame: 'Jucători', words: 'Cuvintele: {civilian} (civili) · {undercover} (undercover)', guessed: 'Mr. White a ghicit „{guess}”',
    hostNext: 'Sari peste', votes: '{count} voturi',
  },
});
