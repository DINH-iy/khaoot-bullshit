import { HEAD_TO_HEAD_DEFAULTS, HEAD_TO_HEAD_GAMES, HEAD_TO_HEAD_KEYS, isHeadToHeadKey, type Places } from '@party/contracts';
import { PlacesFields } from './places-fields.js';
import type { Stage } from './model.js';

const points = (milli: unknown) => typeof milli === 'string' ? String(Number(milli) / 1000) : '';
const milli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(Math.min(value, 999_999_999) * 1000) : '0'; };

/**
 * A duel's settings: who duels (a random pair or the host's pick), how it is won
 * (any contest the host judges, or a head-to-head game on the two phones, with
 * its settings), the points for the winner and runner-up, and for each right bet.
 */
export function DuelFields({ stage, onChange }: { stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const contest = (stage['contest'] as { kind: 'host' } | { kind: 'game'; game: string; settings?: Record<string, unknown> } | undefined) ?? { kind: 'host' };
  const game = contest.kind === 'game' && isHeadToHeadKey(contest.game) ? contest.game : null;
  const set = (change: Partial<Stage>, field: string) => onChange({ ...stage, ...change }, field);
  return <fieldset className="duel-fields"><legend>Duel</legend>
    <label>Who duels<select value={String(stage['pick'] ?? 'random')} onChange={event => set({ pick: event.target.value }, 'pick')}>
      <option value="random">Two players at random</option><option value="host">The host picks two</option></select></label>
    <label>How it is won<select value={game ?? 'host'} onChange={event => { const value = event.target.value; const copy: Stage = { ...stage }; if (value === 'host') delete copy['contest']; else copy['contest'] = { kind: 'game', game: value }; onChange(copy, 'contest'); }}>
      <option value="host">Any contest in the room: the host names the winner</option>
      {HEAD_TO_HEAD_KEYS.map(key => <option key={key} value={key}>{HEAD_TO_HEAD_GAMES[key].name} on the two phones</option>)}</select></label>
    <p className="hint">{game ? `${HEAD_TO_HEAD_GAMES[game].howToPlay} They play once betting closes; the game names the winner (on a draw the host does).` : 'Describe the contest above (rock paper scissors at the table, a game of pool, a dance-off…). The host taps the winner.'}</p>
    {game === 'rps' && <label>First to<select value={String((contest as { settings?: { firstTo?: number } }).settings?.firstTo ?? HEAD_TO_HEAD_DEFAULTS.rps.firstTo)}
      onChange={event => set({ contest: { kind: 'game', game: 'rps', settings: { firstTo: Number(event.target.value) } } }, 'first-to')}>
      {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count} {count === 1 ? 'win' : 'wins'}</option>)}</select></label>}
    <PlacesFields legend="Points for the duelists" hint="1st place is the winner, 2nd the runner-up." required fallback={['10000']}
      value={stage['places'] as Places | undefined} onChange={places => { const copy: Stage = { ...stage }; if (places) copy['places'] = places; else delete copy['places']; onChange(copy, 'places'); }} />
    <label>Points for each right bet<input type="number" min={0} value={points(stage['betMilli'])} onChange={event => set({ betMilli: milli(event.target.value) }, 'bet')} /></label>
  </fieldset>;
}
