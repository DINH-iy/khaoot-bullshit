import { defineTexts } from '../i18n/texts.js';

// The header of the host menu and the admin pages, and the editor's logo menu (owner-nav.tsx).
export const OWNER_TEXTS = defineTexts('owner', {
  play: 'Play', host: 'Host', editor: 'Editor', feedbackReports: 'Feedback reports', liveRooms: 'Live rooms', storage: 'Storage', actionLog: 'Action log', health: 'Health', roles: 'Roles', people: 'People', packs: 'Chips & packs', joinScreen: 'Join screen', deviceLogs: 'Device logs',
  brand: 'party: start page', main: 'Main', feedback: 'Feedback', owner: 'Owner', goTo: 'Go to', logoMenu: 'Menu: go to another part of party', language: 'Language',
  ownerSignIn: 'Sign in as owner', ownerSignInFailed: 'Could not sign in as owner. Try again.',
  signedOut: 'This browser is not signed in as the owner or an editor. Open your private owner link once in this browser, or, with editor rights, enter your personal key on the start page. Then come back here.',
}, {
  nl: {
    play: 'Spelen', host: 'Hosten', editor: 'Editor', feedbackReports: 'Feedbackmeldingen', liveRooms: 'Open kamers', storage: 'Opslag', actionLog: 'Logboek', health: 'Gezondheid', roles: 'Rollen', people: 'Mensen', packs: 'Fiches & pakjes', joinScreen: 'Deelnamescherm', deviceLogs: 'Apparaatlogs',
    brand: 'party: startpagina', main: 'Hoofdmenu', feedback: 'Feedback', owner: 'Eigenaar', goTo: 'Ga naar', logoMenu: 'Menu: ga naar een ander deel van party', language: 'Taal',
    ownerSignIn: 'Inloggen als eigenaar', ownerSignInFailed: 'Inloggen als eigenaar is mislukt. Probeer het opnieuw.',
    signedOut: 'Deze browser is niet ingelogd als eigenaar of editor. Open je persoonlijke eigenaarslink één keer in deze browser, of voer met editorrechten je persoonlijke code in op de startpagina. Kom daarna hier terug.',
  },
  de: {
    play: 'Spielen', host: 'Hosten', editor: 'Editor', feedbackReports: 'Feedback-Meldungen', liveRooms: 'Offene Räume', storage: 'Speicher', actionLog: 'Aktionsprotokoll', health: 'Zustand', roles: 'Rollen', people: 'Personen', packs: 'Chips & Packs', joinScreen: 'Beitrittsbildschirm', deviceLogs: 'Geräteprotokolle',
    brand: 'party: Startseite', main: 'Hauptmenü', feedback: 'Feedback', owner: 'Inhaber', goTo: 'Gehe zu', logoMenu: 'Menü: zu einem anderen Teil von party', language: 'Sprache',
    ownerSignIn: 'Als Inhaber anmelden', ownerSignInFailed: 'Die Anmeldung als Inhaber ist fehlgeschlagen. Versuche es erneut.',
    signedOut: 'Dieser Browser ist nicht als Inhaber oder Editor angemeldet. Öffne deinen privaten Inhaber-Link einmal in diesem Browser oder gib mit Editor-Rechten deinen persönlichen Schlüssel auf der Startseite ein. Komm dann hierher zurück.',
  },
  ro: {
    play: 'Joacă', host: 'Găzduiește', editor: 'Editor', feedbackReports: 'Rapoarte de feedback', liveRooms: 'Camere deschise', storage: 'Stocare', actionLog: 'Jurnal de acțiuni', health: 'Stare', roles: 'Roluri', people: 'Persoane', packs: 'Jetoane și pachete', joinScreen: 'Ecranul de intrare', deviceLogs: 'Jurnalele dispozitivelor',
    brand: 'party: pagina de start', main: 'Principal', feedback: 'Feedback', owner: 'Proprietar', goTo: 'Mergi la', logoMenu: 'Meniu: mergi la altă parte din party', language: 'Limbă',
    ownerSignIn: 'Autentificare ca proprietar', ownerSignInFailed: 'Autentificarea ca proprietar a eșuat. Încearcă din nou.',
    signedOut: 'Acest browser nu este conectat ca proprietar sau editor. Deschide o dată linkul tău privat de proprietar în acest browser sau, cu drepturi de editor, introdu cheia ta personală pe pagina de start. Apoi revino aici.',
  },
});
