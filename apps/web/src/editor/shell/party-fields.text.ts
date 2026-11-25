import { defineTexts } from '../../i18n/texts.js';

export const PARTY_FIELDS_TEXTS = defineTexts('party-fields', {
  title: 'Reactions & sounds', summary: '{reactions} own reactions · {sounds} sounds', reactions: 'Own reactions', reactionsHint: 'Players send these to the shared screen next to the standard reactions: an emoji, a short text (up to 16 characters) or a picture or GIF from the media library.',
  newReaction: 'Emoji or short text', add: 'Add', addPicture: 'Add a picture or GIF', remove: 'Remove {name}', picture: 'Picture {number}',
  sounds: 'Soundboard', soundsHint: 'Players play these on the shared screen (or the host’s screen without one): one sound at a time, each player 20 seconds apart, at most 6 seconds each. The host can switch the soundboard off.',
  addBuiltin: 'Add a built-in sound', addSong: 'Add a sound from the library', standard: 'Standard sounds', listen: 'Listen to {name}', full: 'At most {count}.',
}, {
  nl: {
    title: 'Reacties & geluiden', summary: '{reactions} eigen reacties · {sounds} geluiden', reactions: 'Eigen reacties', reactionsHint: 'Spelers sturen deze naar het gedeelde scherm naast de standaardreacties: een emoji, een korte tekst (tot 16 tekens) of een plaatje of GIF uit de mediabibliotheek.',
    newReaction: 'Emoji of korte tekst', add: 'Toevoegen', addPicture: 'Plaatje of GIF toevoegen', remove: '{name} weghalen', picture: 'Plaatje {number}',
    sounds: 'Geluidenbord', soundsHint: 'Spelers spelen deze af op het gedeelde scherm (of het scherm van de host zonder): één geluid tegelijk, per speler 20 seconden ertussen, hoogstens 6 seconden per geluid. De host kan het geluidenbord uitzetten.',
    addBuiltin: 'Ingebouwd geluid toevoegen', addSong: 'Geluid uit de bibliotheek toevoegen', standard: 'Standaardgeluiden', listen: 'Luister naar {name}', full: 'Hoogstens {count}.',
  },
  de: {
    title: 'Reaktionen & Töne', summary: '{reactions} eigene Reaktionen · {sounds} Töne', reactions: 'Eigene Reaktionen', reactionsHint: 'Spieler schicken diese neben den Standardreaktionen an den gemeinsamen Bildschirm: ein Emoji, ein kurzer Text (bis 16 Zeichen) oder ein Bild oder GIF aus der Mediathek.',
    newReaction: 'Emoji oder kurzer Text', add: 'Hinzufügen', addPicture: 'Bild oder GIF hinzufügen', remove: '{name} entfernen', picture: 'Bild {number}',
    sounds: 'Soundboard', soundsHint: 'Spieler spielen diese auf dem gemeinsamen Bildschirm ab (ohne ihn auf dem des Hosts): ein Ton auf einmal, pro Spieler 20 Sekunden Abstand, höchstens 6 Sekunden pro Ton. Der Host kann das Soundboard ausschalten.',
    addBuiltin: 'Eingebauten Ton hinzufügen', addSong: 'Ton aus der Mediathek hinzufügen', standard: 'Standardtöne', listen: '{name} anhören', full: 'Höchstens {count}.',
  },
  ro: {
    title: 'Reacții și sunete', summary: '{reactions} reacții proprii · {sounds} sunete', reactions: 'Reacții proprii', reactionsHint: 'Jucătorii le trimit pe ecranul comun alături de reacțiile standard: un emoji, un text scurt (până la 16 caractere) sau o imagine ori un GIF din biblioteca media.',
    newReaction: 'Emoji sau text scurt', add: 'Adaugă', addPicture: 'Adaugă o imagine sau un GIF', remove: 'Elimină {name}', picture: 'Imaginea {number}',
    sounds: 'Panou de sunete', soundsHint: 'Jucătorii le redau pe ecranul comun (sau pe al gazdei, fără el): câte un sunet, la 20 de secunde distanță pentru fiecare jucător, cel mult 6 secunde. Gazda poate opri panoul de sunete.',
    addBuiltin: 'Adaugă un sunet încorporat', addSong: 'Adaugă un sunet din bibliotecă', standard: 'Sunete standard', listen: 'Ascultă {name}', full: 'Cel mult {count}.',
  },
});
