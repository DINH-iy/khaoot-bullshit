import { defineTexts } from '../../i18n/texts.js';

export const SHARE_TEXTS = defineTexts('share', {
  title: 'Who can edit this game', hint: 'Editors only see games they made and games shared with them. Tick who may edit this one.', madeBy: 'Made by', owner: 'You (the owner)',
  madeByHint: 'Games from before this was kept count as yours. Give a game back to the editor who made it.', noEditors: 'Nobody else has editor rights yet.', failed: 'That did not work. Try again.', saved: 'Saved.',
  byAuthor: 'by {name}', byYou: 'by you', byOwner: 'by the owner', shared: 'shared with you',
}, {
  nl: {
    title: 'Wie dit spel mag bewerken', hint: 'Editors zien alleen spellen die ze zelf maakten en spellen die met hen gedeeld zijn. Vink aan wie dit spel mag bewerken.', madeBy: 'Gemaakt door', owner: 'Jij (de eigenaar)',
    madeByHint: 'Spellen van voordat dit bijgehouden werd, tellen als de jouwe. Geef een spel terug aan de editor die het maakte.', noEditors: 'Nog niemand anders heeft editorrechten.', failed: 'Dat lukte niet. Probeer het opnieuw.', saved: 'Bewaard.',
    byAuthor: 'door {name}', byYou: 'door jou', byOwner: 'door de eigenaar', shared: 'met jou gedeeld',
  },
  de: {
    title: 'Wer dieses Spiel bearbeiten darf', hint: 'Editoren sehen nur Spiele, die sie selbst gemacht haben, und Spiele, die mit ihnen geteilt wurden. Hake an, wer dieses bearbeiten darf.', madeBy: 'Gemacht von', owner: 'Du (der Besitzer)',
    madeByHint: 'Spiele von bevor dies gespeichert wurde, zählen als deine. Gib ein Spiel dem Editor zurück, der es gemacht hat.', noEditors: 'Noch niemand sonst hat Editorrechte.', failed: 'Das hat nicht geklappt. Versuche es erneut.', saved: 'Gespeichert.',
    byAuthor: 'von {name}', byYou: 'von dir', byOwner: 'vom Besitzer', shared: 'mit dir geteilt',
  },
  ro: {
    title: 'Cine poate edita acest joc', hint: 'Editorii văd doar jocurile făcute de ei și pe cele partajate cu ei. Bifează cine îl poate edita pe acesta.', madeBy: 'Făcut de', owner: 'Tu (proprietarul)',
    madeByHint: 'Jocurile de dinainte să se păstreze acest lucru contează ca ale tale. Dă un joc înapoi editorului care l-a făcut.', noEditors: 'Nimeni altcineva nu are încă drepturi de editor.', failed: 'Nu a mers. Încearcă din nou.', saved: 'Salvat.',
    byAuthor: 'de {name}', byYou: 'de tine', byOwner: 'de proprietar', shared: 'partajat cu tine',
  },
});
