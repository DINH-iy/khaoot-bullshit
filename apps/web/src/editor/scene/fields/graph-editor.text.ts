import { defineTexts } from '../../../i18n/texts.js';

export const GRAPH_EDITOR_TEXTS = defineTexts('graph authoring', {
  cutoff: 'Last point shown to players', chart: 'Graph with the answer',
  dragHelp: 'Drag the divider to choose where players start drawing. They see the solid line and draw the dashed section.',
  editReadings: 'Edit data and axis labels',
  readingsHelp: 'The first list is the solid line players see. The second list is the answer they draw. Enter comma-separated readings.',
  importAll: 'Import all new series', alreadySaved: 'This series is already in the graph library.',
  linkExists: 'This link has been used before. You can still import any new series.',
  extraSeries: 'The previewed series goes into this scene. The other new series go into the graph library.',
  limit: 'This game’s graph library is full. Import up to 50 graphs per game.',
  stored: 'Graph library', fromLibrary: 'Choose a saved graph',
}, {
  nl: {
    cutoff: 'Laatste punt dat spelers zien', chart: 'Grafiek met het antwoord',
    dragHelp: 'Sleep de scheidslijn naar het punt waar spelers beginnen te tekenen. Ze zien de doorgetrokken lijn en tekenen het gestippelde deel.',
    editReadings: 'Gegevens en aslabels bewerken', readingsHelp: 'De eerste lijst is de lijn die spelers zien. De tweede lijst is het antwoord dat ze tekenen. Scheid de waarden met komma’s.',
    importAll: 'Alle nieuwe reeksen importeren', alreadySaved: 'Deze reeks staat al in de grafiekbibliotheek.',
    linkExists: 'Deze link is eerder gebruikt. Nieuwe reeksen kun je nog importeren.',
    extraSeries: 'De getoonde reeks komt in deze scène. De overige nieuwe reeksen komen in de grafiekbibliotheek.',
    limit: 'De grafiekbibliotheek van dit spel zit vol. Importeer maximaal 50 grafieken per spel.',
    stored: 'Grafiekbibliotheek', fromLibrary: 'Kies een opgeslagen grafiek',
  },
  de: {
    cutoff: 'Letzter sichtbarer Punkt', chart: 'Diagramm mit der Lösung',
    dragHelp: 'Ziehe die Trennlinie, um den Startpunkt festzulegen. Spieler sehen die durchgezogene Linie und zeichnen den gestrichelten Teil.',
    editReadings: 'Daten und Achsenbeschriftungen bearbeiten', readingsHelp: 'Die erste Liste ist die sichtbare Linie. Die zweite Liste ist die Lösung, die Spieler zeichnen. Trenne die Werte mit Kommas.',
    importAll: 'Alle neuen Reihen importieren', alreadySaved: 'Diese Reihe ist bereits in der Diagrammbibliothek.',
    linkExists: 'Dieser Link wurde bereits verwendet. Neue Reihen können weiterhin importiert werden.',
    extraSeries: 'Die angezeigte Reihe kommt in diese Szene, weitere neue Reihen in die Diagrammbibliothek.',
    limit: 'Die Diagrammbibliothek dieses Spiels ist voll. Pro Spiel sind bis zu 50 Importe möglich.',
    stored: 'Diagrammbibliothek', fromLibrary: 'Gespeichertes Diagramm auswählen',
  },
  ro: {
    cutoff: 'Ultimul punct vizibil jucătorilor', chart: 'Graficul cu răspunsul',
    dragHelp: 'Trage separatorul unde vrei să înceapă desenul. Jucătorii văd linia continuă și desenează porțiunea punctată.',
    editReadings: 'Editează datele și etichetele axelor', readingsHelp: 'Prima listă este linia vizibilă. A doua listă este răspunsul desenat de jucători. Separă valorile prin virgule.',
    importAll: 'Importă toate seriile noi', alreadySaved: 'Această serie se află deja în biblioteca de grafice.',
    linkExists: 'Acest link a mai fost folosit. Poți importa seriile noi.',
    extraSeries: 'Seria din previzualizare intră în această scenă. Celelalte serii noi intră în biblioteca de grafice.',
    limit: 'Biblioteca acestui joc este plină. Poți importa până la 50 de grafice pe joc.',
    stored: 'Biblioteca de grafice', fromLibrary: 'Alege un grafic salvat',
  },
});
