import { HEAD_TO_HEAD_DEFAULTS, HEAD_TO_HEAD_KEYS, isHeadToHeadKey, type Places } from '@party/contracts';
import { PlacesFields } from './places-fields.js';
import { useState } from 'react';
import { ChoiceDialog, type CardChoice } from '../../controls/choice-dialog.js';
import { withDuelContest, type Stage } from '../../model.js';
import { CREATURE_TEXTS } from '../../../head-to-head/creature-board.js';
import { translate, useTexts } from '../../../i18n/texts.js';
import { FIELDS_TEXTS } from '../fields.text.js';
import { gameDescription, gameHowToPlay, gameName } from '../../../presentation/catalog.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import { Segmented } from '../../controls/segmented.js';

const points = (milli: unknown) => typeof milli === 'string' ? String(Number(milli) / 1000) : '';
const milli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(Math.min(value, 999_999_999) * 1000) : '0'; };

// Every way a duel can be won: a contest in the room, or a game on the two phones.
const duelChoices = (): CardChoice[] => [{ value: 'host', label: t('anyContest'), description: t('anyContestText'), icon: 'duel' },
  ...HEAD_TO_HEAD_KEYS.map(key => ({ value: key, label: gameName(key), description: t('onPhones', { description: gameDescription(key) }), icon: 'duel' }))];

/**
 * A duel's settings: who duels (a random pair or the host's pick), how it is won
 * (any contest the host judges, or a head-to-head game on the two phones, with
 * its settings), the points for the winner and runner-up, and for each right bet.
 */
export function DuelFields({ part, stage, onChange }: { part: 'settings' | 'points'; stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const c = useTexts(CREATURE_TEXTS);
  const contest = (stage['contest'] as { kind: 'host' } | { kind: 'game'; game: string; settings?: Record<string, unknown> } | undefined) ?? { kind: 'host' };
  const game = contest.kind === 'game' && isHeadToHeadKey(contest.game) ? contest.game : null;
  const set = (change: Partial<Stage>, field: string) => onChange({ ...stage, ...change }, field);
  const [picking, setPicking] = useState(false);
  if (part === 'points') return <>
    <PlacesFields legend={t('duelists')} hint={t('duelistsHint')} required fallback={['10000']}
      value={stage['places'] as Places | undefined} onChange={places => { const copy: Stage = { ...stage }; if (places) copy['places'] = places; else delete copy['places']; onChange(copy, 'places'); }} />
    <label className="ed-inline">{t('perBet')}<input type="number" min={0} value={points(stage['betMilli'])} onChange={event => set({ betMilli: milli(event.target.value) }, 'bet')} /></label>
  </>;
  // How it is won: chosen when the scene was added, changed in a popup with every way.
  return <div className="duel-fields">
    <div className="ed-chosen"><strong>{game ? t('gameOnPhones', { game: gameName(game) }) : t('contestInRoom')}</strong>
      <span>{game ? t('gameHow', { howToPlay: gameHowToPlay(game) }) : t('contestHow')}</span>
      <button type="button" className="small-button" onClick={() => setPicking(true)}>{t('changeWon')}</button></div>
    {picking && <ChoiceDialog title={t('howWon')} value={game ?? 'host'} choices={duelChoices()}
      onPick={next => { setPicking(false); if (next !== (game ?? 'host')) onChange(withDuelContest(stage, next), 'contest'); }} onClose={() => setPicking(false)} />}
    <Segmented label={t('whoDuels')} value={String(stage['pick'] ?? 'random')} choices={[{ value: 'random', label: t('twoRandom') }, { value: 'host', label: t('hostPicks') }]} onChange={pick => set({ pick }, 'pick')} />
    {game === 'creature-duel' && <Segmented label={c('teamSize')} inline
      value={String((contest as { settings?: { size?: number } }).settings?.size ?? 1)}
      choices={[{ value: '1', label: c('solo') }, { value: '3', label: c('team') }]}
      onChange={size => set({ contest: { kind: 'game', game: 'creature-duel', settings: { size: Number(size) } } }, 'team-size')} />}
    {game === 'rps' && <Segmented label={t('winsNeeded')} inline value={String((contest as { settings?: { firstTo?: number } }).settings?.firstTo ?? HEAD_TO_HEAD_DEFAULTS.rps.firstTo)}
      choices={['1', '2', '3', '4', '5'].map(count => ({ value: count, label: count }))} onChange={count => set({ contest: { kind: 'game', game: 'rps', settings: { firstTo: Number(count) } } }, 'first-to')} />}
  </div>;
}
