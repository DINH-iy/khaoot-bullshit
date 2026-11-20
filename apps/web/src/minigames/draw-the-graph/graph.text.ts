import { defineTexts } from '../../i18n/texts.js';

export const GRAPH_TEXTS = defineTexts('draw-the-graph', {
  chart: 'Partial line graph', revealed: 'Actual line and player guesses', actual: 'Actual line',
  draw: 'Start at the dot and draw all the way to the right edge.',
  keyboard: 'Use Up and Down to set the height. Right records a point and moves forward. Left goes back one point.',
  point: 'Point {point} of {total}, height {height}', clear: 'Clear line', submit: 'Lock in line', saved: 'Line saved',
  error: '{value}% average error',
  custom: 'Use my own graph', fixedScale: 'Enter 2–25 whole numbers from 0 to 100 for each half, separated by commas. Keep the values equally spaced within each half.',
  knownValues: 'Visible values', actualValues: 'Hidden values', invalidValues: 'Enter 2–25 whole numbers from 0 to 100.',
  firstLabel: 'Left axis label', splitLabel: 'Middle axis label', lastLabel: 'Right axis label', units: 'Vertical units',
}, {
  nl: {
    chart: 'Onvolledige lijngrafiek', revealed: 'Werkelijke lijn en schattingen', actual: 'Werkelijke lijn',
    draw: 'Begin bij de stip en teken helemaal tot de rechterrand.',
    keyboard: 'Stel de hoogte in met Omhoog en Omlaag. Rechts legt een punt vast en gaat verder. Links gaat een punt terug.',
    point: 'Punt {point} van {total}, hoogte {height}', clear: 'Lijn wissen', submit: 'Lijn vastleggen', saved: 'Lijn opgeslagen',
    error: '{value}% gemiddelde afwijking',
    custom: 'Mijn eigen grafiek gebruiken', fixedScale: 'Voer per helft 2–25 hele getallen van 0 tot 100 in, gescheiden door komma’s. Verdeel de waarden gelijkmatig over elke helft.',
    knownValues: 'Zichtbare waarden', actualValues: 'Verborgen waarden', invalidValues: 'Voer 2–25 hele getallen van 0 tot 100 in.',
    firstLabel: 'Aslabel links', splitLabel: 'Aslabel midden', lastLabel: 'Aslabel rechts', units: 'Verticale eenheid',
  },
  de: {
    chart: 'Unvollständiges Liniendiagramm', revealed: 'Tatsächlicher Verlauf und Schätzungen', actual: 'Tatsächlicher Verlauf',
    draw: 'Beginne am Punkt und zeichne bis zum rechten Rand.',
    keyboard: 'Mit Pfeil nach oben und unten legst du die Höhe fest. Rechts setzt einen Punkt und geht weiter. Links geht einen Punkt zurück.',
    point: 'Punkt {point} von {total}, Höhe {height}', clear: 'Linie löschen', submit: 'Linie bestätigen', saved: 'Linie gespeichert',
    error: '{value}% mittlere Abweichung',
    custom: 'Eigenes Diagramm verwenden', fixedScale: 'Pro Hälfte 2–25 ganze Zahlen von 0 bis 100 durch Kommas getrennt eingeben. Die Werte innerhalb jeder Hälfte in gleichen Abständen wählen.',
    knownValues: 'Sichtbare Werte', actualValues: 'Verborgene Werte', invalidValues: 'Gib 2–25 ganze Zahlen von 0 bis 100 ein.',
    firstLabel: 'Linke Achsenbeschriftung', splitLabel: 'Mittlere Achsenbeschriftung', lastLabel: 'Rechte Achsenbeschriftung', units: 'Vertikale Einheit',
  },
  ro: {
    chart: 'Grafic parțial', revealed: 'Linia reală și estimările jucătorilor', actual: 'Linia reală',
    draw: 'Pornește de la punct și desenează până la marginea din dreapta.',
    keyboard: 'Sus și Jos stabilesc înălțimea. Dreapta salvează un punct și avansează. Stânga revine cu un punct.',
    point: 'Punctul {point} din {total}, înălțimea {height}', clear: 'Șterge linia', submit: 'Confirmă linia', saved: 'Linie salvată',
    error: '{value}% eroare medie',
    custom: 'Folosește propriul grafic', fixedScale: 'Introdu câte 2–25 de numere întregi de la 0 la 100 pentru fiecare jumătate, separate prin virgule. Alege valori la intervale egale în fiecare jumătate.',
    knownValues: 'Valori vizibile', actualValues: 'Valori ascunse', invalidValues: 'Introdu 2–25 de numere întregi de la 0 la 100.',
    firstLabel: 'Etichetă stânga', splitLabel: 'Etichetă centru', lastLabel: 'Etichetă dreapta', units: 'Unitate verticală',
  },
});
