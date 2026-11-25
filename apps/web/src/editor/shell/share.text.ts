import { defineTexts } from '../../i18n/texts.js';

export const SHARE_TEXTS = defineTexts('share', {
  title: 'Who can work on this game', hint: 'People only see games they made and games shared with them. Choose each person\'s role for this game (what each role may do is set under Admin → Roles).', roleFor: 'Role of {name} for this game', notShared: 'Not shared', madeBy: 'Made by', owner: 'You (the owner)',
  madeByHint: 'Games from before this was kept count as yours. Give a game back to the editor who made it.', noEditors: 'Nobody else has editor rights yet.', failed: 'That did not work. Try again.', saved: 'Saved.',
  byAuthor: 'by {name}', byYou: 'by you', byOwner: 'by the owner', shared: 'shared with you',
}, {
  nl: {
    title: 'Wie aan dit spel mag werken', hint: 'Mensen zien alleen spellen die ze zelf maakten en spellen die met hen gedeeld zijn. Kies per persoon de rol voor dit spel (wat elke rol mag, staat onder Beheer → Rollen).', roleFor: 'Rol van {name} voor dit spel', notShared: 'Niet gedeeld', madeBy: 'Gemaakt door', owner: 'Jij (de eigenaar)',
    madeByHint: 'Spellen van voordat dit bijgehouden werd, tellen als de jouwe. Geef een spel terug aan de editor die het maakte.', noEditors: 'Nog niemand anders heeft editorrechten.', failed: 'Dat lukte niet. Probeer het opnieuw.', saved: 'Bewaard.',
    byAuthor: 'door {name}', byYou: 'door jou', byOwner: 'door de eigenaar', shared: 'met jou gedeeld',
  },
  de: {
    title: 'Wer an diesem Spiel arbeiten darf', hint: 'Personen sehen nur Spiele, die sie selbst gemacht haben, und mit ihnen geteilte Spiele. Wähle pro Person die Rolle für dieses Spiel (was jede Rolle darf, steht unter Verwaltung → Rollen).', roleFor: 'Rolle von {name} für dieses Spiel', notShared: 'Nicht geteilt', madeBy: 'Gemacht von', owner: 'Du (der Besitzer)',
    madeByHint: 'Spiele von bevor dies gespeichert wurde, zählen als deine. Gib ein Spiel dem Editor zurück, der es gemacht hat.', noEditors: 'Noch niemand sonst hat Editorrechte.', failed: 'Das hat nicht geklappt. Versuche es erneut.', saved: 'Gespeichert.',
    byAuthor: 'von {name}', byYou: 'von dir', byOwner: 'vom Besitzer', shared: 'mit dir geteilt',
  },
  ro: {
    title: 'Cine poate lucra la acest joc', hint: 'Persoanele văd doar jocurile făcute de ele și pe cele partajate cu ele. Alege rolul fiecărei persoane pentru acest joc (ce poate fiecare rol se setează la Administrare → Roluri).', roleFor: 'Rolul lui {name} pentru acest joc', notShared: 'Nepartajat', madeBy: 'Făcut de', owner: 'Tu (proprietarul)',
    madeByHint: 'Jocurile de dinainte să se păstreze acest lucru contează ca ale tale. Dă un joc înapoi editorului care l-a făcut.', noEditors: 'Nimeni altcineva nu are încă drepturi de editor.', failed: 'Nu a mers. Încearcă din nou.', saved: 'Salvat.',
    byAuthor: 'de {name}', byYou: 'de tine', byOwner: 'de proprietar', shared: 'partajat cu tine',
  },
});
