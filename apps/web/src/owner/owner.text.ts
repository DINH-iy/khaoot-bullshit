import { defineTexts } from '../i18n/texts.js';

// The header of the host menu and the admin pages, and the editor's logo menu (owner-nav.tsx).
export const OWNER_TEXTS = defineTexts('owner', {
  play: 'Play', host: 'Host', editor: 'Editor', feedbackReports: 'Feedback reports', people: 'People', packs: 'Chips & packs', joinScreen: 'Join screen',
  brand: 'party: start page', main: 'Main', feedback: 'Feedback', owner: 'Owner', goTo: 'Go to', menu: 'Menu', logoMenu: 'Menu: go to another part of party', language: 'Language',
  signedOut: 'This browser is not signed in as the owner or an editor. Open your private owner link once in this browser, or, with editor rights, enter your personal key on the start page. Then come back here.',
}, {
  nl: {
    play: 'Spelen', host: 'Hosten', editor: 'Editor', feedbackReports: 'Feedbackmeldingen', people: 'Mensen', packs: 'Fiches & pakjes', joinScreen: 'Deelnamescherm',
    brand: 'party: startpagina', main: 'Hoofdmenu', feedback: 'Feedback', owner: 'Eigenaar', goTo: 'Ga naar', menu: 'Menu', logoMenu: 'Menu: ga naar een ander deel van party', language: 'Taal',
    signedOut: 'Deze browser is niet ingelogd als eigenaar of editor. Open je persoonlijke eigenaarslink één keer in deze browser, of voer met editorrechten je persoonlijke code in op de startpagina. Kom daarna hier terug.',
  },
  de: {
    play: 'Spielen', host: 'Hosten', editor: 'Editor', feedbackReports: 'Feedback-Meldungen', people: 'Personen', packs: 'Chips & Packs', joinScreen: 'Beitrittsbildschirm',
    brand: 'party: Startseite', main: 'Hauptmenü', feedback: 'Feedback', owner: 'Inhaber', goTo: 'Gehe zu', menu: 'Menü', logoMenu: 'Menü: zu einem anderen Teil von party', language: 'Sprache',
    signedOut: 'Dieser Browser ist nicht als Inhaber oder Editor angemeldet. Öffne deinen privaten Inhaber-Link einmal in diesem Browser oder gib mit Editor-Rechten deinen persönlichen Schlüssel auf der Startseite ein. Komm dann hierher zurück.',
  },
  ro: {
    play: 'Joacă', host: 'Găzduiește', editor: 'Editor', feedbackReports: 'Rapoarte de feedback', people: 'Persoane', packs: 'Jetoane și pachete', joinScreen: 'Ecranul de intrare',
    brand: 'party: pagina de start', main: 'Principal', feedback: 'Feedback', owner: 'Proprietar', goTo: 'Mergi la', menu: 'Meniu', logoMenu: 'Meniu: mergi la altă parte din party', language: 'Limbă',
    signedOut: 'Acest browser nu este conectat ca proprietar sau editor. Deschide o dată linkul tău privat de proprietar în acest browser sau, cu drepturi de editor, introdu cheia ta personală pe pagina de start. Apoi revino aici.',
  },
});
