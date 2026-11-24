import { DEFAULT_POOL_START, HEAD_TO_HEAD_DEFAULTS, HEAD_TO_HEAD_KEYS, isHeadToHeadKey, placePoints, PoolBallBehaviorSchema, PoolFeltSchema, PoolMatchSecondsSchema, DEFAULT_POOL_FELT, POOL_MATCH_MAX_SECONDS, PoolStartSchema, type Places } from '@party/contracts';
import { PlacesFields } from './places-fields.js';
import { useState } from 'react';
import { ChoiceDialog, type CardChoice } from '../../controls/choice-dialog.js';
import { withDuelContest, type Stage } from '../../model.js';
import { CREATURE_TEXTS } from '../../../head-to-head/creature-board.js';
import { HOSTED_POOL_TEXTS } from '../../../head-to-head/eight-ball/hosted.text.js';
import { PoolBehaviorFields } from '../../../head-to-head/eight-ball/behavior-fields.js';
import { PoolStartFields } from '../../../head-to-head/eight-ball/start-fields.js';
import { PoolFeltFields } from '../../../head-to-head/eight-ball/felt-fields.js';
import { translate, useTexts } from '../../../i18n/texts.js';
import { FIELDS_TEXTS } from '../fields.text.js';
import { gameDescription, gameHowToPlay, gameName } from '../../../presentation/catalog.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import { Segmented } from '../../controls/segmented.js';
import { Icon } from '../../controls/icons.js';
import './pool-matchup.css';

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
export function DuelFields({ part, stage, onChange, addTeams }: { part: 'settings' | 'points' | 'contest' | 'matchup' | 'table'; stage: Stage; onChange: (next: Stage, field: string) => void; addTeams?: (() => void) | undefined }) {
  const c = useTexts(CREATURE_TEXTS);
  const pool = useTexts(HOSTED_POOL_TEXTS);
  const contest = (stage['contest'] as { kind: 'host' } | { kind: 'game'; game: string; settings?: Record<string, unknown> } | undefined) ?? { kind: 'host' };
  const game = contest.kind === 'game' && isHeadToHeadKey(contest.game) ? contest.game : null;
  const settings = contest.kind === 'game' ? contest.settings ?? {} : {};
  const ballBehavior = PoolBallBehaviorSchema.safeParse(settings['ballBehavior']);
  const poolStart = PoolStartSchema.safeParse(settings['start']);
  const felt = PoolFeltSchema.safeParse(settings['felt']);
  const set = (change: Partial<Stage>, field: string) => onChange({ ...stage, ...change }, field);
  const [picking, setPicking] = useState(false);
  const teamPool = game === 'eight-ball' && stage['pick'] === 'teams';
  if (part === 'points' && game === 'eight-ball') {
    const value = stage['places'] as Places | undefined;
    return <>
      <label className="ed-inline">{pool(teamPool ? 'teamAward' : 'winnerAward')}
        <input type="number" min={0} value={points(value ? placePoints(value)[0] : '10000')}
          onChange={event => set({ places: { kind: 'list', pointsMilli: [milli(event.currentTarget.value)] } }, 'places')} /></label>
      {!teamPool && <label className="ed-inline">{pool('pickAward')}<input type="number" min={0} value={points(stage['betMilli'])}
        onChange={event => set({ betMilli: milli(event.currentTarget.value) }, 'bet')} /></label>}
    </>;
  }
  if (part === 'points') return <>
    <PlacesFields legend={t('duelists')} hint={t('duelistsHint')} required fallback={['10000']}
      value={stage['places'] as Places | undefined} onChange={places => { const copy: Stage = { ...stage }; if (places) copy['places'] = places; else delete copy['places']; onChange(copy, 'places'); }} />
    <label className="ed-inline">{t('perBet')}<input type="number" min={0} value={points(stage['betMilli'])} onChange={event => set({ betMilli: milli(event.target.value) }, 'bet')} /></label>
  </>;
  const contestChoice = <>
    {part === 'contest' ? <button type="button" className="pool-contest-change" aria-haspopup="dialog"
      onClick={() => setPicking(true)}>{t('changeDuelGame')}</button>
      : <button type="button" className="small-button" onClick={() => setPicking(true)}>{t('changeWon')}</button>}
    {picking && <ChoiceDialog title={t('howWon')} value={game ?? 'host'} choices={duelChoices()}
      onPick={next => { setPicking(false); if (next !== (game ?? 'host')) onChange(withDuelContest(stage, next), 'contest'); }} onClose={() => setPicking(false)} />}
  </>;
  if (part === 'contest') return contestChoice;
  const matchup = <div className={game === 'eight-ball' ? 'pool-matchup' : undefined}>
      <Segmented label={t('whoDuels')} value={String(stage['pick'] ?? 'random')} choices={[{ value: 'random', label: t('twoRandom') }, { value: 'host', label: t('hostPicks') },
        ...(game === 'eight-ball' ? [{ value: 'teams', label: pool('teams') }] : [])]} onChange={pick => set({ pick }, 'pick')} />
      {teamPool && (addTeams ? <button type="button" className="pool-team-setup" onClick={addTeams}>
        <span className="pool-team-setup-icon"><Icon name="teams" size={18} /></span>
        <span>{pool('addTeams')}</span>
        <Icon name="plus" size={18} />
      </button> : <p className="pool-team-setup" role="status">
        <span className="pool-team-setup-icon"><Icon name="check" size={18} /></span>
        <span>{pool('teamsReady')}</span>
      </p>)}
    </div>;
  if (part === 'table') return <>
    <PoolFeltFields value={felt.data ?? DEFAULT_POOL_FELT} onChange={next =>
      set({ contest: { kind: 'game', game: 'eight-ball', settings: { ...settings, felt: next } } }, 'pool-felt')} />
    <div className="configuration-timing"><PoolStartFields value={poolStart.data ?? DEFAULT_POOL_START} onChange={start =>
      set({ contest: { kind: 'game', game: 'eight-ball', settings: { ...settings, start } } }, 'pool-start')} /></div>
    <PoolBehaviorFields value={ballBehavior.data ?? { preset: 'arcade' }} onChange={behavior =>
      set({ contest: { kind: 'game', game: 'eight-ball', settings: { ...settings, ballBehavior: behavior } } }, 'ballBehavior')} />
  </>;
  if (part === 'matchup') return <>
    {matchup}
    <label className="ed-inline">{pool('matchSeconds')}
      <input type="number" min={1} max={POOL_MATCH_MAX_SECONDS} placeholder={pool('unlimited')}
        value={typeof stage['matchSeconds'] === 'number' ? stage['matchSeconds'] : ''} onChange={event => {
          const next = { ...stage };
          if (!event.currentTarget.value) delete next['matchSeconds'];
          else {
            const parsed = PoolMatchSecondsSchema.safeParse(event.currentTarget.valueAsNumber);
            if (!parsed.success) return;
            next['matchSeconds'] = parsed.data;
          }
          onChange(next, 'matchSeconds');
        }} />
    </label>
  </>;
  return <div className="duel-fields">
    <div className="ed-chosen"><strong>{game ? t('gameOnPhones', { game: gameName(game) }) : t('contestInRoom')}</strong>
      <span>{game ? t('gameHow', { howToPlay: gameHowToPlay(game) }) : t('contestHow')}</span>
      {contestChoice}
    </div>
    {matchup}
    {game === 'creature-duel' && <Segmented label={c('teamSize')} inline
      value={String((contest as { settings?: { size?: number } }).settings?.size ?? 1)}
      choices={[{ value: '1', label: c('solo') }, { value: '3', label: c('team') }]}
      onChange={size => set({ contest: { kind: 'game', game: 'creature-duel', settings: { size: Number(size) } } }, 'team-size')} />}
    {game === 'rps' && <Segmented label={t('winsNeeded')} inline value={String((contest as { settings?: { firstTo?: number } }).settings?.firstTo ?? HEAD_TO_HEAD_DEFAULTS.rps.firstTo)}
      choices={['1', '2', '3', '4', '5'].map(count => ({ value: count, label: count }))} onChange={count => set({ contest: { kind: 'game', game: 'rps', settings: { firstTo: Number(count) } } }, 'first-to')} />}
  </div>;
}
