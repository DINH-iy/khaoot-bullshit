import { useState } from 'react';
import { DraftSchema, type DefinitionIssue, type HostMenu } from '@party/contracts';
import { newId, roomApi } from '../network/api.js';

const failures: Record<string, string> = {
  REVISION_CONFLICT: 'This game was changed elsewhere. The list is up to date again; try once more.',
  INVALID_DEFINITION: 'This game still has problems. Fix them before publishing.',
  NOT_FOUND: 'Publish the game before opening a room for it.',
};
const explain = (cause: unknown) => failures[cause instanceof Error ? cause.message : ''] ?? 'That did not work. Check the server is running and try again.';
const status = (game: HostMenu['myGames'][number]) => [
  game.published ? `Published version ${game.published.number}${game.published.matchesDraft ? '' : ' · draft has newer changes'}` : 'Not published yet',
  game.issueCount ? `${game.issueCount} ${game.issueCount === 1 ? 'problem' : 'problems'} to fix` : 'Ready to publish',
].join(' · ');

/** The owner's own games: create, see problems per scene, publish, and open a room for the published version. */
export function MyGames({ menu, reload, openRoom }: { menu: HostMenu; reload: () => void; openRoom: (gameId: string) => void }) {
  const [title, setTitle] = useState(''); const [startFrom, setStartFrom] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [problems, setProblems] = useState<Record<string, DefinitionIssue[]>>({}); const [removing, setRemoving] = useState<string | null>(null);
  const run = (work: Promise<unknown>) => { setBusy(true); setError(''); void work.then(reload).catch(cause => { setError(explain(cause)); reload(); }).finally(() => setBusy(false)); };
  const showProblems = (gameId: string) => { void roomApi(`/api/host/games/${gameId}`).then(data => setProblems(current => ({ ...current, [gameId]: DraftSchema.parse(data).issues }))).catch(cause => setError(explain(cause))); };
  return <section aria-labelledby="my-games-heading"><h2 id="my-games-heading">Your games</h2>
    {error && <p role="alert" className="error">{error}</p>}
    {menu.myGames.length === 0 ? <p>You have not made a game yet.</p> : <ul className="plain-list my-games">{menu.myGames.map(game => <li key={game.gameId} className="team-card">
      <strong>{game.title}</strong><p>{status(game)}</p>
      <div className="actions">
        <a className="button-link" href={`/?edit=${game.gameId}`}>Edit {game.title}</a>
        {game.issueCount > 0 && <button className="small-button" onClick={() => showProblems(game.gameId)}>Show problems in {game.title}</button>}
        {game.issueCount === 0 && !game.published?.matchesDraft && <button disabled={busy} onClick={() => run(roomApi(`/api/host/games/${game.gameId}/publish`, { expectedRevision: game.revision }))}>Publish {game.title}</button>}
        {game.published && <button disabled={busy} onClick={() => openRoom(game.gameId)}>Open room for {game.title}</button>}
        {removing === game.gameId
          ? <><button disabled={busy} onClick={() => { setRemoving(null); run(roomApi(`/api/host/games/${game.gameId}/archive`, {})); }}>Yes, remove {game.title}</button><button onClick={() => setRemoving(null)}>Keep it</button></>
          : <button className="small-button" onClick={() => setRemoving(game.gameId)}>Remove {game.title}</button>}
      </div>
      {removing === game.gameId && <p>Removing hides the game from this list. Rooms already playing it keep working.</p>}
      {problems[game.gameId] && <ul aria-label={`Problems in ${game.title}`}>{problems[game.gameId]!.map((issue, index) => <li key={index}>{issue.nodeKey ? `Scene “${issue.nodeKey}”${issue.stageIndex !== null ? `, part ${issue.stageIndex + 1}` : ''}: ` : ''}{issue.message}</li>)}</ul>}
    </li>)}</ul>}
    <form onSubmit={event => { event.preventDefault(); run(roomApi('/api/host/games', { gameId: newId(), title: title.trim(), startFrom: startFrom || null }).then(() => setTitle(''))); }}>
      <label>Name of your new game<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} required /></label>
      <label>Start from<select value={startFrom} onChange={event => setStartFrom(event.target.value)}>
        <option value="">A blank game</option>{menu.games.map(game => <option key={game.key} value={game.key}>A copy of {game.title}</option>)}</select></label>
      <button disabled={busy || !title.trim()}>Create game</button>
    </form>
  </section>;
}
