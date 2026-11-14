import { HEAD_TO_HEAD_DEFAULTS, HEAD_TO_HEAD_GAMES, isHeadToHeadKey, type Places } from '@party/contracts';
import { PlacesFields } from './places-fields.js';
import type { Stage } from './model.js';

const points = (milli: unknown) => typeof milli === 'string' ? String(Number(milli) / 1000) : '';
const milli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(Math.min(value, 999_999_999) * 1000) : '0'; };

/**
 * A duel's settings: who duels (a random pair or the host's pick), how it is won
 * (any contest the host judges, or a head-to-head game on the two phones, with
 * its settings), the points for the winner and runner-up, and for each right bet.
 */
export function DuelFields({ part, stage, onChange }: { part: 'settings' | 'points'; stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const contest = (stage['contest'] as { kind: 'host' } | { kind: 'game'; game: string; settings?: Record<string, unknown> } | undefined) ?? { kind: 'host' };
  const game = contest.kind === 'game' && isHeadToHeadKey(contest.game) ? contest.game : null;
  const set = (change: Partial<Stage>, field: string) => onChange({ ...stage, ...change }, field);
  if (part === 'points') return <>
    <PlacesFields legend="Points for the duelists" hint="1st place is the winner, 2nd the runner-up." required fallback={['10000']}
      value={stage['places'] as Places | undefined} onChange={places => { const copy: Stage = { ...stage }; if (places) copy['places'] = places; else delete copy['places']; onChange(copy, 'places'); }} />
    <label className="ed-inline">Points for each right bet<input type="number" min={0} value={points(stage['betMilli'])} onChange={event => set({ betMilli: milli(event.target.value) }, 'bet')} /></label>
  </>;
  // How it is won was chosen when the scene was added (any contest, or a game on the phones).
  return <div className="duel-fields">
    <div className="ed-chosen"><strong>{game ? `${HEAD_TO_HEAD_GAMES[game].name} on the two phones` : 'Any contest in the room'}</strong>
      <span>{game ? `${HEAD_TO_HEAD_GAMES[game].howToPlay} They play once betting closes; on a draw the host names the winner.` : 'Describe the contest above (a game of pool, a dance-off…). The host taps the winner.'}</span></div>
    <label className="ed-inline">Who duels<select value={String(stage['pick'] ?? 'random')} onChange={event => set({ pick: event.target.value }, 'pick')}>
      <option value="random">Two at random</option><option value="host">The host picks</option></select></label>
    {game === 'rps' && <label className="ed-inline">First to<select value={String((contest as { settings?: { firstTo?: number } }).settings?.firstTo ?? HEAD_TO_HEAD_DEFAULTS.rps.firstTo)}
      onChange={event => set({ contest: { kind: 'game', game: 'rps', settings: { firstTo: Number(event.target.value) } } }, 'first-to')}>
      {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count} {count === 1 ? 'win' : 'wins'}</option>)}</select></label>}
  </div>;
}
