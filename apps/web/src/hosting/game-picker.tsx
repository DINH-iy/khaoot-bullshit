import { useState } from 'react';
import type { HostMenu } from '@party/contracts';
import { Icon } from '../editor/controls/icons.js';
import { useTexts, type Translate } from '../i18n/texts.js';
import { HOSTING_TEXTS } from './hosting.text.js';

type T = Translate<keyof typeof HOSTING_TEXTS.en>;

type Game = HostMenu['games'][number];
type Feature = Game['features'][number];
const FEATURES = {
  quiz: { label: 'fQuiz', icon: 'quiz' }, order: { label: 'fOrder', icon: 'order' }, writing: { label: 'fWriting', icon: 'writing' },
  drawing: { label: 'fDrawing', icon: 'drawing' }, uploads: { label: 'fUploads', icon: 'upload' }, votes: { label: 'fVotes', icon: 'vote' },
  minigames: { label: 'fMinigames', icon: 'minigame' }, challenges: { label: 'fChallenges', icon: 'challenge' }, teams: { label: 'fTeams', icon: 'scoreboard' }, routes: { label: 'fRoutes', icon: 'route' }, duels: { label: 'fDuels', icon: 'duel' },
} as const satisfies Record<Feature, { label: keyof typeof HOSTING_TEXTS.en; icon: string }>;
/** The short line under a game in the list when the owner has their own version of it. */
const customLabel = (custom: NonNullable<Game['custom']>, t: T) => t(custom.inUse ? (custom.unpublished ? 'yourVersionUnpublished' : 'yourVersion') : 'beingEdited');

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
export function GamePicker({ games, chosen, onChoose, busy, onOpen, onEdit, onRestore }: { games: Game[]; chosen: string; onChoose: (key: string) => void; busy: boolean; onOpen: () => void; onEdit?: (key: string) => void; onRestore?: (key: string) => void }) {
  const game = games.find(entry => entry.key === chosen) ?? games[0];
  const [restoring, setRestoring] = useState<string | null>(null); const t = useTexts(HOSTING_TEXTS);
  return <form className="game-picker" onSubmit={event => { event.preventDefault(); onOpen(); }}>
    <fieldset className="game-list"><legend>{t('availableGames')}</legend>
      {games.map(entry => <label key={entry.key} className={`game-card${entry.key === chosen ? ' chosen' : ''}`}>
        <input type="radio" name="game" value={entry.key} checked={entry.key === chosen} onChange={() => onChoose(entry.key)} />
        <GameCover game={entry} size="small" />
        <span className="game-card-text"><strong>{entry.title}</strong><small>{t(entry.branches ? 'cardRoundsUpTo' : 'cardRounds', { count: entry.stageCount, minutes: entry.minutes })}</small>
          {entry.custom && <small className="custom-badge">{customLabel(entry.custom, t)}</small>}</span>
      </label>)}
    </fieldset>
    {game && <article className="game-detail" aria-labelledby="game-detail-title">
      <GameCover game={game} size="large" />
      <div className="game-detail-body">
        <h3 id="game-detail-title">{game.title}</h3>
        <p className="game-detail-text">{game.description}</p>
        <ul className="game-facts">
          <li><strong>{game.branches ? t('upTo', { count: game.stageCount }) : game.stageCount}</strong> {t('rounds')}</li>
          <li>{t('aboutMinutes', { minutes: game.minutes })}</li>
          <li>{t(game.timed ? 'timedRounds' : 'noLimits')}</li>
        </ul>
        <ul className="feature-chips" aria-label={t('inThisGame')}>{game.features.map(feature => <li key={feature}><Icon name={FEATURES[feature].icon} size={16} />{t(FEATURES[feature].label)}</li>)}</ul>
        {game.custom && <p className="custom-note"><Icon name="edit" size={16} /> {t(game.custom.inUse ? (game.custom.unpublished ? 'ownInUseChanged' : 'ownInUse') : 'ownNotPublished')}</p>}
        <button type="submit" className="primary big" disabled={busy}>{t(busy ? 'opening' : 'openRoom')}</button>
        {/* The owner may change a built-in game: their own version, edited and published like any game. */}
        {onEdit && <div className="game-detail-actions">
          <button type="button" className="ghost" disabled={busy} onClick={() => onEdit(game.key)}><Icon name="edit" size={18} /> {t(game.custom ? 'editYourVersion' : 'editThisGame')}</button>
          {game.custom && onRestore && (restoring === game.key
            ? <span className="restore-confirm">{t('restoreAsk')}<button type="button" className="danger" onClick={() => { setRestoring(null); onRestore(game.key); }}>{t('yesRestore')}</button><button type="button" className="ghost" onClick={() => setRestoring(null)}>{t('keepMine')}</button></span>
            : <button type="button" className="ghost" disabled={busy} onClick={() => setRestoring(game.key)}>{t('restoreOriginal')}</button>)}
        </div>}
      </div>
    </article>}
  </form>;
}
