import type { MinigameKey, MinigameSettings } from '@party/contracts';
import { currentLanguage } from '../i18n/language.js';
import { translate } from '../i18n/texts.js';
import { CONTROL_TEXTS } from './controls.text.js';
import { BUS_TEXTS } from './steps/bus.text.js';

export function minigameResult(game: MinigameKey, value: number | null, settings: MinigameSettings, team = false): string {
  const t = (key: keyof typeof CONTROL_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROL_TEXTS, key, values);
  if (value === null) return t(game === 'reaction' && !team ? 'falseStart' : 'noResult');
  if (game === 'reaction' || (team && game === 'perfect-circle')) return `${value} ms`;
  if (game === 'tap-race') return t(value === 1 ? 'tap' : 'tapMany', { value });
  if (game === 'stop-clock') {
    const format = (ms: number) => new Intl.NumberFormat(currentLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ms / 1000);
    const off = team ? value : Math.abs(value - (settings as MinigameSettings<'stop-clock'>).targetMs);
    const difference = t('off', { off: format(off) });
    return team ? difference : `${format(value)} s · ${difference}`;
  }
  if (game === 'perfect-circle') return t('round', { value: (value / 10).toLocaleString(currentLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
  if (game === 'relay-drawing') return t(value === 1 ? 'vote' : 'voteMany', { value });
  if (game === 'bus') return translate(BUS_TEXTS, value === 1 ? 'sip' : 'sips', { count: value });
  if (game === 'majority') return t(value === 0 ? 'left' : 'right');
  return t('door', { number: value + 1 });
}
