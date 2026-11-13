import type { HostMenu } from '@party/contracts';
import { Icon } from '../editor/icons.js';

type Game = HostMenu['games'][number];
type Feature = Game['features'][number];
const FEATURES: Record<Feature, { label: string; icon: string }> = {
  quiz: { label: 'Quiz questions', icon: 'quiz' }, order: { label: 'Put in order', icon: 'order' }, writing: { label: 'Writing & jokes', icon: 'writing' },
  drawing: { label: 'Drawing', icon: 'drawing' }, uploads: { label: 'Photos & videos', icon: 'upload' }, votes: { label: 'Voting', icon: 'vote' },
  minigames: { label: 'Minigames', icon: 'minigame' }, challenges: { label: 'Challenges in the room', icon: 'challenge' }, teams: { label: 'Teams', icon: 'scoreboard' }, routes: { label: 'The party picks a route', icon: 'route' },
};
/** A different angle and pattern per game, so covers are told apart even when games share colours. */
const seed = (key: string) => [...key].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

/** A cover drawn from the game itself: its colours and the kinds of rounds in it. */
export function GameCover({ game, size }: { game: Game; size: 'small' | 'large' }) {
  const value = seed(game.key); const angle = 100 + (value % 140); const hue = value % 360;
  const icons = (game.features.length ? game.features : ['quiz' as Feature]).slice(0, size === 'large' ? 4 : 2);
  return <div className={`game-cover ${size}`} aria-hidden="true" style={{ background: `linear-gradient(${angle}deg, ${game.colors.from}, hsl(${hue} 70% 42%) 60%, ${game.colors.to})` }}>
    <svg className="cover-pattern" viewBox="0 0 200 120" preserveAspectRatio="none">{Array.from({ length: 9 }, (_, index) =>
      <circle key={index} cx={(value >>> index) % 200} cy={(value >>> (index + 3)) % 120} r={8 + ((value >>> index) % 30)} fill="#fff" opacity={0.06 + (index % 3) * 0.03} />)}</svg>
    <div className="cover-icons">{icons.map(feature => <span key={feature}><Icon name={FEATURES[feature].icon} size={size === 'large' ? 40 : 22} /></span>)}</div>
    {size === 'large' && <p className="cover-title">{game.title}</p>}
  </div>;
}

/**
 * Built-in games: a list of cards on the left, the chosen game in detail on
 * the right (stacked on a phone). The list is a group of radio buttons, so it
 * works with the keyboard and screen readers like any choice.
 */
export function GamePicker({ games, chosen, onChoose, busy, onOpen }: { games: Game[]; chosen: string; onChoose: (key: string) => void; busy: boolean; onOpen: () => void }) {
  const game = games.find(entry => entry.key === chosen) ?? games[0];
  return <form className="game-picker" onSubmit={event => { event.preventDefault(); onOpen(); }}>
    <fieldset className="game-list"><legend>Available games</legend>
      {games.map(entry => <label key={entry.key} className={`game-card${entry.key === chosen ? ' chosen' : ''}`}>
        <input type="radio" name="game" value={entry.key} checked={entry.key === chosen} onChange={() => onChoose(entry.key)} />
        <GameCover game={entry} size="small" />
        <span className="game-card-text"><strong>{entry.title}</strong><small>{entry.branches ? 'up to ' : ''}{entry.stageCount} rounds · about {entry.minutes} min</small></span>
      </label>)}
    </fieldset>
    {game && <article className="game-detail" aria-labelledby="game-detail-title">
      <GameCover game={game} size="large" />
      <div className="game-detail-body">
        <h3 id="game-detail-title">{game.title}</h3>
        <p className="game-detail-text">{game.description}</p>
        <ul className="game-facts">
          <li><strong>{game.branches ? `Up to ${game.stageCount}` : game.stageCount}</strong> rounds</li>
          <li>About <strong>{game.minutes}</strong> minutes</li>
          <li>{game.timed ? 'Timed rounds' : 'No time limits'}</li>
        </ul>
        <ul className="feature-chips" aria-label="In this game">{game.features.map(feature => <li key={feature}><Icon name={FEATURES[feature].icon} size={16} />{FEATURES[feature].label}</li>)}</ul>
        <button type="submit" className="primary big" disabled={busy}>{busy ? 'Opening…' : 'Open room'}</button>
      </div>
    </article>}
  </form>;
}
