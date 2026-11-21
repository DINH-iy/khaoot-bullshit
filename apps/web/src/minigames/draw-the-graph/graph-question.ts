import { SAMPLE_GRAPH_QUESTION } from '@party/contracts';
import { LANGUAGES, type Language } from '../../i18n/language.js';
import { translate } from '../../i18n/texts.js';
import { CATALOG_TEXTS } from '../../presentation/catalog.text.js';
import { GRAPH_TEXTS } from './graph.text.js';

const languages = Object.keys(LANGUAGES) as Language[];

export function isDefaultGraphQuestion(prompt: string | undefined) {
  if (!prompt?.trim() || prompt === SAMPLE_GRAPH_QUESTION) return true;
  return languages.some(language => {
    const game = translate(CATALOG_TEXTS, 'draw-the-graph', undefined, language);
    return prompt === game || prompt === `${game}!` || prompt === translate(GRAPH_TEXTS, 'sampleQuestion', undefined, language);
  });
}
