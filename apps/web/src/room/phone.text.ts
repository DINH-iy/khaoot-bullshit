import { defineTexts } from '../i18n/texts.js';

// The phones' own words that are not the game's texts (those are presentation/game-texts.text.ts): the language choice.
export const PHONE_TEXTS = defineTexts('phone', {
  language: 'Language', languageTitle: 'Language on this phone',
}, {
  nl: { language: 'Taal', languageTitle: 'Taal op deze telefoon' },
  de: { language: 'Sprache', languageTitle: 'Sprache auf diesem Handy' },
  ro: { language: 'Limbă', languageTitle: 'Limba pe acest telefon' },
});
