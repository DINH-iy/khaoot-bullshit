import { HEAD_TO_HEAD_DEFAULTS, HEAD_TO_HEAD_GAMES, HEAD_TO_HEAD_KEYS, isHeadToHeadKey, type Places } from '@party/contracts';
import { PlacesFields } from './places-fields.js';
import { useState } from 'react';
import { ChoiceDialog, type CardChoice } from '../../controls/choice-dialog.js';
import { withDuelContest, type Stage } from '../../model.js';
import { Segmented } from '../../controls/segmented.js';

const points = (milli: unknown) => typeof milli === 'string' ? String(Number(milli) / 1000) : '';
const milli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(Math.min(value, 999_999_999) * 1000) : '0'; };

// Every way a duel can be won: a contest in the room, or a game on the two phones.
const DUEL_CHOICES: CardChoice[] = [{ value: 'host', label: 'Any contest', description: 'In the room: pool, a dance-off… the host names the winner.', icon: 'duel' },
  ...HEAD_TO_HEAD_KEYS.map(key => ({ value: key, label: HEAD_TO_HEAD_GAMES[key].name, description: `On the two phones. ${HEAD_TO_HEAD_GAMES[key].description}`, icon: 'duel' }))];

/**
 * A duel's settings: who duels (a random pair or the host's pick), how it is won
 * (any contest the host judges, or a head-to-head game on the two phones, with
 * its settings), the points for the winner and runner-up, and for each right bet.
 */
export function DuelFields({ part, stage, onChange }: { part: 'settings' | 'points'; stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const contest = (stage['contest'] as { kind: 'host' } | { kind: 'game'; game: string; settings?: Record<string, unknown> } | undefined) ?? { kind: 'host' };
  const game = contest.kind === 'game' && isHeadToHeadKey(contest.game) ? contest.game : null;
  const set = (change: Partial<Stage>, field: string) => onChange({ ...stage, ...change }, field);
  const [picking, setPicking] = useState(false);
  if (part === 'points') return <>
    <PlacesFields legend="Points for the duelists" hint="1st place is the winner, 2nd the runner-up." required fallback={['10000']}
      value={stage['places'] as Places | undefined} onChange={places => { const copy: Stage = { ...stage }; if (places) copy['places'] = places; else delete copy['places']; onChange(copy, 'places'); }} />
    <label className="ed-inline">Points for each right bet<input type="number" min={0} value={points(stage['betMilli'])} onChange={event => set({ betMilli: milli(event.target.value) }, 'bet')} /></label>
  </>;
  // How it is won: chosen when the scene was added, changed in a popup with every way.
  return <div className="duel-fields">
    <div className="ed-chosen"><strong>{game ? `${HEAD_TO_HEAD_GAMES[game].name} on the two phones` : 'Any contest in the room'}</strong>
      <span>{game ? `${HEAD_TO_HEAD_GAMES[game].howToPlay} They play once betting closes; on a draw the host names the winner.` : 'Describe the contest above (a game of pool, a dance-off…). The host taps the winner.'}</span>
      <button type="button" className="small-button" onClick={() => setPicking(true)}>Change how it is won…</button></div>
    {picking && <ChoiceDialog title="How is the duel won?" value={game ?? 'host'} choices={DUEL_CHOICES}
      onPick={next => { setPicking(false); if (next !== (game ?? 'host')) onChange(withDuelContest(stage, next), 'contest'); }} onClose={() => setPicking(false)} />}
    <Segmented label="Who duels" value={String(stage['pick'] ?? 'random')} choices={[{ value: 'random', label: 'Two at random' }, { value: 'host', label: 'The host picks' }]} onChange={pick => set({ pick }, 'pick')} />
    {game === 'rps' && <Segmented label="Wins needed" inline value={String((contest as { settings?: { firstTo?: number } }).settings?.firstTo ?? HEAD_TO_HEAD_DEFAULTS.rps.firstTo)}
      choices={['1', '2', '3', '4', '5'].map(count => ({ value: count, label: count }))} onChange={count => set({ contest: { kind: 'game', game: 'rps', settings: { firstTo: Number(count) } } }, 'first-to')} />}
  </div>;
}
