import { defineTexts } from '../i18n/texts.js';

export const CELEBRATION_TEXTS = defineTexts('celebration', {
  ours: 'Our celebration', pick: 'When your team wins a round or the game, the big screen plays this.', emoji: 'Emoji', cheer: 'Cheer (up to 24 characters)', sound: 'Sound', noSound: 'No sound',
  save: 'Save', saved: 'Saved', wins: '{team} wins!', clear: 'No celebration', placeholder: 'We are the champions!',
}, {
  nl: { ours: 'Onze viering', pick: 'Als jullie team een ronde of het spel wint, speelt het grote scherm dit af.', emoji: 'Emoji', cheer: 'Yell (tot 24 tekens)', sound: 'Geluid', noSound: 'Geen geluid',
    save: 'Bewaren', saved: 'Bewaard', wins: '{team} wint!', clear: 'Geen viering', placeholder: 'Wij zijn de kampioenen!' },
  de: { ours: 'Unser Jubel', pick: 'Wenn euer Team eine Runde oder das Spiel gewinnt, spielt der große Bildschirm das ab.', emoji: 'Emoji', cheer: 'Schlachtruf (bis 24 Zeichen)', sound: 'Ton', noSound: 'Kein Ton',
    save: 'Speichern', saved: 'Gespeichert', wins: '{team} gewinnt!', clear: 'Kein Jubel', placeholder: 'Wir sind die Champions!' },
  ro: { ours: 'Sărbătoarea noastră', pick: 'Când echipa voastră câștigă o rundă sau jocul, ecranul mare redă asta.', emoji: 'Emoji', cheer: 'Strigăt (până la 24 de caractere)', sound: 'Sunet', noSound: 'Fără sunet',
    save: 'Salvează', saved: 'Salvat', wins: '{team} câștigă!', clear: 'Fără sărbătoare', placeholder: 'Suntem campionii!' },
});
