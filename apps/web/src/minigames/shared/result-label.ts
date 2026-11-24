import { CLAP_BEATS_MS, COIN_SIDES, type MinigameKey, type MinigameSettings } from '@party/contracts';
import { currentLanguage } from '../../i18n/language.js';
import { translate } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from './controls.text.js';
import { COIN_TEXTS } from '../heads-or-tails/coin.text.js';
import { ROULETTE_TEXTS } from '../red-or-black-roulette/roulette.js';
import { GRAPH_TEXTS } from '../draw-the-graph/graph.text.js';
import { BUS_TEXTS } from '../bus/bus.text.js';

export function minigameResult(game: MinigameKey, value: number | null, settings: MinigameSettings, team = false, guess?: { cut?: number | undefined; angle?: number | undefined; dotGuess?: number | undefined }): string {
  const t = (key: keyof typeof CONTROL_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROL_TEXTS, key, values);
  if (value === null) return t(game === 'reaction' && !team ? 'falseStart' : 'noResult');
  if (game === 'heads-or-tails') return translate(COIN_TEXTS, COIN_SIDES[value] ?? 'heads');
  if (game === 'red-or-black-roulette') return value === 0 ? translate(ROULETTE_TEXTS, 'freePick') : translate(ROULETTE_TEXTS, 'bet', { amount: value });
  if (game === 'reaction') return `${value} ms`;
  if (game === 'speed-run') return `${(value / 1000).toLocaleString(currentLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
  if (game === 'clap-beat') return `${value} / ${CLAP_BEATS_MS.length}`;
  if (game === 'tap-race') return t(value === 1 ? 'tap' : 'tapMany', { value });
  if (game === 'stop-clock') {
    const format = (ms: number) => new Intl.NumberFormat(currentLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ms / 1000);
    const off = team ? value : Math.abs(value - (settings as MinigameSettings<'stop-clock'>).targetMs);
    const difference = t('off', { off: format(off) });
    return team ? difference : `${format(value)} s · ${difference}`;
  }
  if (game === 'perfect-circle') return t('round', { value: (value / 10).toLocaleString(currentLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
  if (game === 'cut-the-line') {
    const off = t('cutOff', { value });
    return guess?.cut === undefined ? off : `${guess.cut}% · ${off}`;
  }
  if (game === 'match-the-angle') {
    const off = t('angleOff', { value });
    return guess?.angle === undefined ? off : `${guess.angle}° · ${off}`;
  }
  if (game === 'draw-the-graph') return translate(GRAPH_TEXTS, 'error', {
    value: (value / 100).toLocaleString(currentLanguage(), { maximumFractionDigits: 2 }),
  });
  if (game === 'count-the-dots') {
    const off = t('dotOff', { value });
    return guess?.dotGuess === undefined ? off : `${guess.dotGuess} · ${off}`;
  }
  if (game === 'relay-drawing' && (settings as MinigameSettings<'relay-drawing'>).animation) return `${value}%`;
  if (game === 'relay-drawing') return t(value === 1 ? 'vote' : 'voteMany', { value });
  if (game === 'bus') return translate(BUS_TEXTS, value === 1 ? 'sip' : 'sips', { count: value });
  if (game === 'majority') return t(value === 0 ? 'left' : 'right');
  return t('door', { number: value + 1 });
}
