import { defineTexts } from '../i18n/texts.js';

export const SOUND_TEXTS = defineTexts('sounds', {
  sounds: 'Sounds', play: 'Play {sound} on the shared screen', wait: 'Next sound in {seconds} s', ready: 'One sound every 20 seconds, one at a time in the room.',
  fanfare: 'Fanfare', tada: 'Ta-da', ding: 'Ding', airhorn: 'Air horn', drumroll: 'Drum roll', boing: 'Boing', 'sad-trombone': 'Sad trombone', applause: 'Applause',
  played: '🔊 {name}: {sound}', own: 'Our reactions',
}, {
  nl: {
    sounds: 'Geluiden', play: 'Speel {sound} af op het gedeelde scherm', wait: 'Volgend geluid over {seconds} s', ready: 'Eén geluid per 20 seconden, één tegelijk in de kamer.',
    fanfare: 'Fanfare', tada: 'Tadaa', ding: 'Ding', airhorn: 'Toeter', drumroll: 'Tromgeroffel', boing: 'Boing', 'sad-trombone': 'Treurige trombone', applause: 'Applaus',
    played: '🔊 {name}: {sound}', own: 'Eigen reacties',
  },
  de: {
    sounds: 'Töne', play: '{sound} auf dem gemeinsamen Bildschirm abspielen', wait: 'Nächster Ton in {seconds} s', ready: 'Ein Ton alle 20 Sekunden, einer nach dem anderen im Raum.',
    fanfare: 'Fanfare', tada: 'Tadaa', ding: 'Ding', airhorn: 'Drucklufthorn', drumroll: 'Trommelwirbel', boing: 'Boing', 'sad-trombone': 'Traurige Posaune', applause: 'Applaus',
    played: '🔊 {name}: {sound}', own: 'Eigene Reaktionen',
  },
  ro: {
    sounds: 'Sunete', play: 'Redă {sound} pe ecranul comun', wait: 'Următorul sunet în {seconds} s', ready: 'Un sunet la 20 de secunde, câte unul în cameră.',
    fanfare: 'Fanfară', tada: 'Ta-da', ding: 'Ding', airhorn: 'Sirenă', drumroll: 'Rafală de tobe', boing: 'Boing', 'sad-trombone': 'Trombon trist', applause: 'Aplauze',
    played: '🔊 {name}: {sound}', own: 'Reacțiile jocului',
  },
});
