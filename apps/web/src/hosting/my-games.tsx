import { useState } from 'react';
import { DraftSchema, type DefinitionIssue, type HostMenu } from '@party/contracts';
import { newId, roomApi } from '../network/api.js';

const failures: Record<string, string> = {
  REVISION_CONFLICT: 'This game was changed elsewhere. The list is up to date again; try once more.',
  INVALID_DEFINITION: 'This game still has problems. Fix them before publishing.',
  NOT_FOUND: 'Publish the game before opening a room for it.',
};
const explain = (cause: unknown) => failures[cause instanceof Error ? cause.message : ''] ?? 'That did not work. Check the server is running and try again.';
type Game = HostMenu['myGames'][number];
/** Two short badges: where publishing stands, and whether the draft has problems. */
function Badges({ game }: { game: Game }) {
  const published = game.published ? `Published v${game.published.number}${game.published.matchesDraft ? '' : ' · newer draft'}` : 'Not published';
  const problems = game.issueCount ? `${game.issueCount} ${game.issueCount === 1 ? 'problem' : 'problems'}` : 'Ready to publish';
  return <p className="game-badges">
    <span className={game.published ? 'badge good' : 'badge'}>{published}</span>
    <span className={game.issueCount ? 'badge warn' : 'badge good'}>{problems}</span>
  </p>;
}

/** The owner's own games: create, see problems per scene, publish, and open a room for the published version. */
/** openRoom is null for editors: they publish and rehearse, but only the owner opens real rooms. */
export function MyGames({ menu, reload, openRoom }: { menu: HostMenu; reload: () => void; openRoom: ((gameId: string) => void) | null }) {
  const [title, setTitle] = useState(''); const [startFrom, setStartFrom] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [problems, setProblems] = useState<Record<string, DefinitionIssue[]>>({}); const [removing, setRemoving] = useState<string | null>(null);
  const run = (work: Promise<unknown>) => { setBusy(true); setError(''); void work.then(reload).catch(cause => { setError(explain(cause)); reload(); }).finally(() => setBusy(false)); };
  const showProblems = (gameId: string) => { void roomApi(`/api/host/games/${gameId}`).then(data => setProblems(current => ({ ...current, [gameId]: DraftSchema.parse(data).issues }))).catch(cause => setError(explain(cause))); };
  // Visible labels stay short; the accessible names say which game (and start with the visible label).
  return <section id="my-games" className="my-games-section" aria-labelledby="my-games-heading">
    <div className="my-games-head"><h2 id="my-games-heading">Your games</h2>{menu.myGames.length > 0 && <span className="my-games-count">{menu.myGames.length}</span>}</div>
    {error && <p role="alert" className="error">{error}</p>}
    {menu.myGames.length === 0 ? <p className="my-games-empty">No games yet. Make one below, or import one from text.</p> : <ul className="plain-list my-games">{menu.myGames.map(game => <li key={game.gameId} className="my-game">
      <div className="my-game-info"><h3>{game.title}</h3><Badges game={game} /></div>
      <div className="my-game-actions">
        <a className="button-link primary" href={`/?edit=${game.gameId}`} aria-label={`Edit ${game.title}`}>Edit</a>
        {game.issueCount > 0 && <button type="button" onClick={() => showProblems(game.gameId)} aria-label={`Show problems in ${game.title}`}>Show problems</button>}
        {game.issueCount === 0 && !game.published?.matchesDraft && <button type="button" disabled={busy} onClick={() => run(roomApi(`/api/host/games/${game.gameId}/publish`, { expectedRevision: game.revision }))} aria-label={`Publish ${game.title}`}>Publish</button>}
        {game.published && openRoom && <button type="button" disabled={busy} onClick={() => openRoom(game.gameId)} aria-label={`Open room for ${game.title}`}>Open room</button>}
        {removing === game.gameId
          ? <span className="my-game-confirm"><button type="button" className="danger" disabled={busy} onClick={() => { setRemoving(null); run(roomApi(`/api/host/games/${game.gameId}/archive`, {})); }} aria-label={`Yes, remove ${game.title}`}>Yes, remove</button><button type="button" onClick={() => setRemoving(null)}>Keep it</button></span>
          : <button type="button" className="quiet-danger" onClick={() => setRemoving(game.gameId)} aria-label={`Remove ${game.title}`}>Remove</button>}
      </div>
      {removing === game.gameId && <p className="my-game-note">Removing hides the game from this list. Rooms already playing it keep working.</p>}
      {problems[game.gameId] && <ul className="my-game-problems" aria-label={`Problems in ${game.title}`}>{problems[game.gameId]!.map((issue, index) => <li key={index}>{issue.nodeKey ? `Scene “${issue.nodeKey}”${issue.stageIndex !== null ? `, part ${issue.stageIndex + 1}` : ''}: ` : ''}{issue.message}</li>)}</ul>}
    </li>)}</ul>}
    <form className="new-game" aria-labelledby="new-game-heading" onSubmit={event => { event.preventDefault(); run(roomApi('/api/host/games', { gameId: newId(), title: title.trim(), startFrom: startFrom || null }).then(() => setTitle(''))); }}>
      <h3 id="new-game-heading">New game</h3>
      <label>Name of your new game<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} required placeholder="Quiz night" /></label>
      <label>Start from<select value={startFrom} onChange={event => setStartFrom(event.target.value)}>
        <option value="">A blank game</option>{menu.games.map(game => <option key={game.key} value={game.key}>A copy of {game.title}</option>)}</select></label>
      <button className="primary" disabled={busy || !title.trim()}>Create game</button>
    </form>
  </section>;
}
