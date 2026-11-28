import { defineTexts } from '../../../i18n/texts.js';

export const ANSWER_PLACEMENT_TEXTS = defineTexts('answer-placement', {
  selected: 'Answer to position', x: 'Horizontal position (%)', y: 'Vertical position (%)',
  width: 'Answer width (%)', height: 'Answer height (%)', rotation: 'Rotation (degrees)', auto: 'Auto', restore: 'Return answer to automatic layout',
  move: 'Move answer {number}', rotate: 'Rotate answer {number}', resize: 'Resize answer {number}', keys: 'Use the arrow keys to adjust this answer.',
}, {
  nl: { selected: 'Antwoord om te verplaatsen', x: 'Horizontale positie (%)', y: 'Verticale positie (%)',
    width: 'Antwoordbreedte (%)', height: 'Antwoordhoogte (%)', rotation: 'Rotatie (graden)', auto: 'Automatisch', restore: 'Antwoord terugzetten in automatische indeling',
    move: 'Verplaats antwoord {number}', rotate: 'Draai antwoord {number}', resize: 'Wijzig grootte van antwoord {number}', keys: 'Gebruik de pijltjestoetsen om dit antwoord aan te passen.' },
  de: { selected: 'Antwort zum Positionieren', x: 'Horizontale Position (%)', y: 'Vertikale Position (%)',
    width: 'Antwortbreite (%)', height: 'Antworthöhe (%)', rotation: 'Drehung (Grad)', auto: 'Automatisch', restore: 'Antwort zurück ins automatische Layout',
    move: 'Antwort {number} verschieben', rotate: 'Antwort {number} drehen', resize: 'Größe von Antwort {number} ändern', keys: 'Mit den Pfeiltasten kannst du die Antwort anpassen.' },
  ro: { selected: 'Răspuns de poziționat', x: 'Poziție orizontală (%)', y: 'Poziție verticală (%)',
    width: 'Lățimea răspunsului (%)', height: 'Înălțimea răspunsului (%)', rotation: 'Rotație (grade)', auto: 'Automat', restore: 'Readu răspunsul la aranjarea automată',
    move: 'Mută răspunsul {number}', rotate: 'Rotește răspunsul {number}', resize: 'Redimensionează răspunsul {number}', keys: 'Folosește tastele săgeată pentru a ajusta răspunsul.' },
});
