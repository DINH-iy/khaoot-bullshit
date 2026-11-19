import { defineTexts } from '../i18n/texts.js';

export const ROOM_MANAGEMENT_TEXTS = defineTexts('roomManagement', {
  manage: 'Manage {name}', name: 'Display name', saveName: 'Save name', replacePhoto: 'Replace photo', photoFailed: 'The photo could not be uploaded.',
  ban: 'Ban from this room', banAsk: 'Ban {name} from this room? Their account will be unable to rejoin.',
  banDenied: "This account is banned from the room.",
  idleClose: 'Close empty room after (minutes)', idleHelp: 'Starts when the last host or player disconnects. Use 0 to keep rooms open.',
  keepOpen: 'Keep this room open', closeRoom: 'Close room', closeAsk: 'Close this room for everyone?', closeFailed: 'The room could not be closed.',
}, {
  nl: {
    manage: '{name} beheren', name: 'Weergavenaam', saveName: 'Naam opslaan', replacePhoto: 'Foto vervangen', photoFailed: 'De foto kon niet worden geüpload.',
    ban: 'Uit deze kamer verbannen', banAsk: '{name} uit deze kamer verbannen? Dit account kan niet opnieuw deelnemen.',
    banDenied: "Dit account is uit deze kamer verbannen.",
    idleClose: 'Lege kamer sluiten na (minuten)', idleHelp: 'Begint zodra de laatste host of speler de verbinding verbreekt. Met 0 blijven kamers open.',
    keepOpen: 'Houd deze kamer open', closeRoom: 'Kamer sluiten', closeAsk: 'Deze kamer voor iedereen sluiten?', closeFailed: 'De kamer kon niet worden gesloten.',
  },
  de: {
    manage: '{name} verwalten', name: 'Anzeigename', saveName: 'Namen speichern', replacePhoto: 'Foto ersetzen', photoFailed: 'Das Foto konnte nicht hochgeladen werden.',
    ban: 'Aus diesem Raum sperren', banAsk: '{name} aus diesem Raum sperren? Das Konto kann dem Raum nicht erneut beitreten.',
    banDenied: "Dieses Konto ist für den Raum gesperrt.",
    idleClose: 'Leeren Raum schließen nach (Minuten)', idleHelp: 'Beginnt, wenn der letzte Gastgeber oder Spieler die Verbindung trennt. Bei 0 bleibt der Raum offen.',
    keepOpen: 'Diesen Raum offen halten', closeRoom: 'Raum schließen', closeAsk: 'Diesen Raum für alle schließen?', closeFailed: 'Der Raum konnte nicht geschlossen werden.',
  },
  ro: {
    manage: 'Gestionează jucătorul {name}', name: 'Nume afișat', saveName: 'Salvează numele', replacePhoto: 'Înlocuiește fotografia', photoFailed: 'Fotografia nu a putut fi încărcată.',
    ban: 'Interzice accesul în această cameră', banAsk: 'Îi interzici lui {name} accesul în această cameră? Contul nu va mai putea reintra.',
    banDenied: "Acest cont are accesul interzis în cameră.",
    idleClose: 'Închide camera goală după (minute)', idleHelp: 'Începe când ultima gazdă sau ultimul jucător se deconectează. Cu 0 camera rămâne deschisă.',
    keepOpen: 'Păstrează această cameră deschisă', closeRoom: 'Închide camera', closeAsk: 'Închizi camera pentru toată lumea?', closeFailed: 'Camera nu a putut fi închisă.',
  },
});
