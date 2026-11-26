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
  </div>;
}

/**
 * The built-in games, as compact rows under the host's own games: a small cover, the name and length, and
 * Open room. The owner may also change one (their own version, edited and published like any game) or go back
 * to the original. `onOpen` is null when this person may not host real rooms.
 */
export function BuiltInGames({ games, busy, onOpen, onEdit, onRestore }: { games: Game[]; busy: boolean; onOpen: ((key: string) => void) | null; onEdit?: ((key: string) => void) | undefined; onRestore?: ((key: string) => void) | undefined }) {
  const [restoring, setRestoring] = useState<string | null>(null); const t = useTexts(HOSTING_TEXTS);
  return <ul className="plain-list builtin-games">{games.map(game => <li key={game.key} className="builtin-game" title={game.description}>
    <GameCover game={game} size="small" />
    <span className="builtin-game-text"><strong>{game.title}</strong><small>{t(game.branches ? 'cardRoundsUpTo' : 'cardRounds', { count: game.stageCount, minutes: game.minutes })}</small>
      {game.custom && <small className="custom-badge">{customLabel(game.custom, t)}</small>}</span>
    <span className="builtin-game-actions">
      {restoring === game.key && onRestore
        ? <span className="restore-confirm">{t('restoreAsk')}<button type="button" className="danger" onClick={() => { setRestoring(null); onRestore(game.key); }}>{t('yesRestore')}</button><button type="button" onClick={() => setRestoring(null)}>{t('keepMine')}</button></span>
        : <>
          {onEdit && <button type="button" disabled={busy} aria-label={t('editLabel', { title: game.title })} onClick={() => onEdit(game.key)}><Icon name="edit" size={16} /><span className="builtin-edit-label">{t('edit')}</span></button>}
          {game.custom && onRestore && <button type="button" disabled={busy} onClick={() => setRestoring(game.key)}>{t('restoreOriginal')}</button>}
          {onOpen && <button type="button" className="primary" disabled={busy} aria-label={t('openRoomLabel', { title: game.title })} onClick={() => onOpen(game.key)}><span className="open-long">{t('openRoom')}</span><span className="open-short">{t('openShort')}</span></button>}
        </>}
    </span>
  </li>)}</ul>;
}
