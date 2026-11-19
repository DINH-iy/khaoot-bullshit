import { currentLanguage } from './language.js';

/** 1st, 2nd… in the current language's own way (1e, 1., 1). */
export const ordinal = (place: number) => { const language = currentLanguage(); return language === 'en' ? ['1st', '2nd', '3rd'][place - 1] ?? `${place}th` : language === 'nl' ? `${place}e` : language === 'de' ? `${place}.` : String(place); };
