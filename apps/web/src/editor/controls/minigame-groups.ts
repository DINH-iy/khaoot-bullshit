import type { MinigameKey } from '@party/contracts';
import { translate } from '../../i18n/texts.js';
import { FIELDS_TEXTS } from '../scene/fields.text.js';

const t = (key: keyof typeof FIELDS_TEXTS.en) => translate(FIELDS_TEXTS, key);

/** The minigame picker's tabs: what kind of game it is. */
export const MINIGAME_GROUPS: { key: string; name: string; games: MinigameKey[] }[] = [
  { key: 'speed', get name() { return t('gSpeed'); }, games: ['reaction', 'tap-race', 'clap-beat', 'speed-run', 'brick-rally', 'stop-clock'] },
  { key: 'precision', get name() { return t('gPrecision'); }, games: ['cut-the-line', 'match-the-angle', 'count-the-dots'] },
  { key: 'skill', get name() { return t('gDrawing'); }, games: ['perfect-circle', 'draw-the-graph', 'relay-drawing'] },
  { key: 'luck', get name() { return t('gLuck'); }, games: ['lucky-doors', 'majority', 'heads-or-tails', 'red-or-black-roulette'] },
  { key: 'words', get name() { return t('gWords'); }, games: ['hangman', 'undercover'] },
  { key: 'drinking', get name() { return t('gDrinking'); }, games: ['bus'] },
];
