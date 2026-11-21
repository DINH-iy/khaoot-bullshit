import { defineTexts } from '../../i18n/texts.js';

export const PRACTICE_TEXTS = defineTexts('scene-practice', {
  replay: 'Restart', practice: 'Solo practice · scores stay here',
  start: 'Start practice', submit: 'Submit', saved: 'Practice answer submitted', correct: 'Correct', incorrect: 'Incorrect',
  points: '{points} points', chooseFile: 'Choose a test file', draw: 'Practice drawing', nextTurn: 'Finish turn',
  turn: 'Turn {turn} of {total}', previous: 'Previous part', next: 'Next part', part: 'Part {part} of {total}',
  sampleVote: 'Sample ballot', sampleAnswer: 'Sample answer {number}',
  team: 'Team {number}', teams: 'Sample teams', moveTo: 'Move to {team}', player: 'Player {number}',
}, {
  nl: { replay: 'Opnieuw', practice: 'Solo oefenen · scores blijven hier',
    start: 'Begin met oefenen', submit: 'Versturen', saved: 'Oefenantwoord verstuurd', correct: 'Goed', incorrect: 'Fout',
    points: '{points} punten', chooseFile: 'Kies een testbestand', draw: 'Oefentekening', nextTurn: 'Beurt afronden',
    turn: 'Beurt {turn} van {total}', previous: 'Vorige deel', next: 'Volgende deel', part: 'Deel {part} van {total}',
    sampleVote: 'Voorbeeldstemming', sampleAnswer: 'Voorbeeldantwoord {number}',
    team: 'Team {number}', teams: 'Voorbeeldteams', moveTo: 'Verplaats naar {team}', player: 'Speler {number}' },
  de: { replay: 'Neu starten', practice: 'Solo üben · Ergebnisse bleiben hier',
    start: 'Übung starten', submit: 'Abgeben', saved: 'Testantwort abgegeben', correct: 'Richtig', incorrect: 'Falsch',
    points: '{points} Punkte', chooseFile: 'Testdatei auswählen', draw: 'Testzeichnung', nextTurn: 'Zug beenden',
    turn: 'Zug {turn} von {total}', previous: 'Vorheriger Teil', next: 'Nächster Teil', part: 'Teil {part} von {total}',
    sampleVote: 'Beispielabstimmung', sampleAnswer: 'Beispielantwort {number}',
    team: 'Team {number}', teams: 'Beispielteams', moveTo: 'Zu {team} verschieben', player: 'Spieler {number}' },
  ro: { replay: 'Repornește', practice: 'Probă solo · scorurile rămân aici',
    start: 'Începe proba', submit: 'Trimite', saved: 'Răspuns de probă trimis', correct: 'Corect', incorrect: 'Incorect',
    points: '{points} puncte', chooseFile: 'Alege un fișier de probă', draw: 'Desen de probă', nextTurn: 'Încheie tura',
    turn: 'Tura {turn} din {total}', previous: 'Partea anterioară', next: 'Partea următoare', part: 'Partea {part} din {total}',
    sampleVote: 'Vot de exemplu', sampleAnswer: 'Răspuns de exemplu {number}',
    team: 'Echipa {number}', teams: 'Echipe de exemplu', moveTo: 'Mută în {team}', player: 'Jucător {number}' },
});
