import { defineTexts } from '../i18n/texts.js';

export const BRICK_CHALLENGE_TEXTS = defineTexts('brick rally challenge', {
  rules: 'You both play the same map. The fastest clear within two minutes wins.',
  ready: 'Ready to race', waiting: 'Waiting for the other player to get ready.',
  readyAlert: 'Your Brick Rally challenge is ready to open.',
  submitted: 'Time recorded. Waiting for the other player or the time limit.',
  result: 'Result', noClear: 'No clear', checking: 'Checking the result…',
}, {
  nl: {
    rules: 'Jullie spelen op dezelfde kaart. Wie binnen twee minuten het snelst klaar is, wint.',
    ready: 'Klaar voor de race', waiting: 'Wachten tot de andere speler klaar is.',
    readyAlert: 'Je Brick Rally-uitdaging staat klaar.',
    submitted: 'Je tijd staat vast. Wachten op de andere speler of het einde van de tijd.',
    result: 'Uitslag', noClear: 'Niet uitgespeeld', checking: 'Resultaat controleren…',
  },
  de: {
    rules: 'Ihr spielt dieselbe Karte. Wer sie innerhalb von zwei Minuten am schnellsten räumt, gewinnt.',
    ready: 'Bereit fürs Rennen', waiting: 'Warte, bis die andere Person bereit ist.',
    readyAlert: 'Deine Brick Rally-Herausforderung ist bereit.',
    submitted: 'Zeit gespeichert. Warte auf die andere Person oder das Zeitlimit.',
    result: 'Ergebnis', noClear: 'Nicht geschafft', checking: 'Ergebnis wird geprüft…',
  },
  ro: {
    rules: 'Jucați pe aceeași hartă. Câștigă cel care o termină cel mai repede în două minute.',
    ready: 'Gata de cursă', waiting: 'Așteaptă ca celălalt jucător să fie gata.',
    readyAlert: 'Provocarea ta Brick Rally poate fi deschisă.',
    submitted: 'Timp înregistrat. Așteaptă celălalt jucător sau expirarea timpului.',
    result: 'Rezultat', noClear: 'Neterminat', checking: 'Se verifică rezultatul…',
  },
});
