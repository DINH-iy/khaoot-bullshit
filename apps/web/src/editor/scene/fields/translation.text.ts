import { defineTexts } from '../../../i18n/texts.js';

export const TRANSLATION_TEXTS = defineTexts('author-translations', {
  translations: 'Translations', language: 'Text language', original: 'Original text', fallback: 'Leave a field empty to use the original text.',
  prompt: 'Question or scene text', title: 'Scene title', explanation: 'Explanation',
}, {
  nl: { translations: 'Vertalingen', language: 'Taal van de tekst', original: 'Oorspronkelijke tekst', fallback: 'Laat een veld leeg om de oorspronkelijke tekst te gebruiken.', prompt: 'Vraag of scènetekst', title: 'Scènetitel', explanation: 'Uitleg' },
  de: { translations: 'Übersetzungen', language: 'Textsprache', original: 'Originaltext', fallback: 'Lass ein Feld leer, um den Originaltext zu verwenden.', prompt: 'Frage oder Szenentext', title: 'Szenentitel', explanation: 'Erklärung' },
  ro: { translations: 'Traduceri', language: 'Limba textului', original: 'Textul original', fallback: 'Lasă câmpul gol pentru a folosi textul original.', prompt: 'Întrebare sau textul scenei', title: 'Titlul scenei', explanation: 'Explicație' },
});
