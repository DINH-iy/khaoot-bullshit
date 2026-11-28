import { SHARE_TEXTS } from '../editor/shell/share.text.js';
import { Dropdown } from '../ui/dropdown.js';
import { useEffect, useState, type ReactNode } from 'react';
import { DraftSchema, GameActivitySchema, type DefinitionIssue, type HostMenu } from '@party/contracts';
import { newId, roomApi } from '../room/api.js';
import { useLanguage } from '../i18n/language.js';
import { translate, useTexts } from '../i18n/texts.js';
import { HOSTING_TEXTS } from './hosting.text.js';
import { HostDialog } from './host-dialog.js';
import { aiInstructions, ImportGame } from './import-game.js';
import { forgetEditedGame } from '../owner/last-game.js';
import { Icon } from '../editor/controls/icons.js';

const failures = { REVISION_CONFLICT: 'changedElsewhere', INVALID_DEFINITION: 'stillProblems', NOT_FOUND: 'publishFirst' } as const;
const explain = (cause: unknown) => translate(HOSTING_TEXTS, failures[(cause instanceof Error ? cause.message : '') as keyof typeof failures] ?? 'didNotWork');
type Game = HostMenu['myGames'][number];
/** Two short badges: where publishing stands, and whether the draft has problems. */
function Badges({ game }: { game: Game }) {
  const t = useTexts(HOSTING_TEXTS);
  const published = game.published ? `${t('publishedV', { number: game.published.number })}${game.published.matchesDraft ? '' : t('newerDraft')}` : t('notPublished');
  const problems = game.issueCount ? t(game.issueCount === 1 ? 'problemOne' : 'problemMany', { count: game.issueCount }) : t('readyToPublish');
  return <p className="game-badges">
    <span className={game.published ? 'badge good' : 'badge'}>{published}</span>
    <span className={game.issueCount ? 'badge warn' : 'badge good'}>{problems}</span>
  </p>;
}

function useGameActivity(enabled: boolean) {
  const [activity, setActivity] = useState<Map<string, { updatedAt: string; editorOpen: boolean }>>(() => new Map());
  useEffect(() => {
    if (!enabled) return;
    let canceled = false;
    let pending = false;
    const refresh = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const data = GameActivitySchema.parse(await roomApi('/api/host/games/activity'));
        if (!canceled) setActivity(new Map(data.map(game => [game.gameId, game])));
      } catch {
        if (!canceled) setActivity(current => new Map([...current].map(([id, game]) => [id, { ...game, editorOpen: false }])));
      } finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 20_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      canceled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled]);
  return activity;
}

/** The owner's own games: create, see problems per scene, publish, and open a room for the published version. */
/** openRoom is null for editors: they publish and rehearse, but only the owner opens real rooms. */
export function MyGames({ menu, reload, openRoom, builtIn = null }: { menu: HostMenu; reload: () => void; openRoom: ((gameId: string) => void) | null; builtIn?: ReactNode }) {
  const [title, setTitle] = useState(''); const [startFrom, setStartFrom] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const t = useTexts(HOSTING_TEXTS); const s = useTexts(SHARE_TEXTS);
  const activity = useGameActivity(menu.myGames.length > 0);
  const language = useLanguage();
  const editedDate = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const [problems, setProblems] = useState<Record<string, DefinitionIssue[]>>({}); const [removing, setRemoving] = useState<string | null>(null);
  // Making a game and importing one open in a dialog, so the list stays the page.
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null);
  // The instructions an AI needs to write a game, one tap away (the Import dialog explains the whole route).
  const [copied, setCopied] = useState(false);
  const copyAi = () => { void navigator.clipboard.writeText(aiInstructions).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => setError(t('copyBlocked'))); };
  // What each person may do follows their role (and the game's role for them); the server checks it again.
  const make = menu.role === 'owner' || Boolean(menu.permissions?.includes('games.make'));
  const run = (work: Promise<unknown>) => { setBusy(true); setError(''); void work.then(reload).catch(cause => { setError(explain(cause)); reload(); }).finally(() => setBusy(false)); };
  const showProblems = (gameId: string) => { void roomApi(`/api/host/games/${gameId}`).then(data => setProblems(current => ({ ...current, [gameId]: DraftSchema.parse(data).issues }))).catch(cause => setError(explain(cause))); };
  // Visible labels stay short; the accessible names say which game (and start with the visible label).
  return <section id="my-games" className="my-games-section" aria-labelledby="my-games-heading">
    <div className="my-games-head"><h2 id="my-games-heading">{t('yourGames')}</h2>{menu.myGames.length > 0 && <span className="my-games-count">{menu.myGames.length}</span>}
      {make && <span className="my-games-tools">
        <button type="button" className="primary" onClick={() => setDialog('new')}><Icon name="plus" size={18} /> {t('newGame')}</button>
        <button type="button" onClick={() => setDialog('import')}><Icon name="paste" size={18} /> {t('importOpen')}</button>
        <button type="button" onClick={copyAi}><Icon name={copied ? 'check' : 'copy'} size={18} /> {t(copied ? 'instructionsCopied' : 'copyAi')}</button></span>}</div>
    {error && <p role="alert" className="error">{error}</p>}
    {menu.myGames.length === 0 ? <p className="my-games-empty">{t('noGamesYet')}</p> : <ul className="plain-list my-games">{menu.myGames.map(game => {
      const status = activity.get(game.gameId);
      const updatedAt = status && status.updatedAt > game.updatedAt ? status.updatedAt : game.updatedAt;
      return <li key={game.gameId} className="my-game">
      <div className="my-game-info"><h3>{game.title}</h3><Badges game={game} />
        {/* Who made it: the owner sees each editor's games by name; an editor sees who shared a game with them. */}
        <div className="my-game-meta">
          {(game.author || game.shared) && <span className="my-game-author">{game.author?.you ? s('byYou') : game.author ? s('byAuthor', { name: game.author.name }) : s('byOwner')}{game.shared ? ` · ${s('shared')}` : ''}</span>}
          <time dateTime={updatedAt}>{t('lastEdited', { date: editedDate.format(new Date(updatedAt)) })}</time>
          {status?.editorOpen && <span className="game-editor-open">{t('editorOpen')}</span>}
        </div></div>
      <div className="my-game-actions">
        <a className="button-link primary" href={`/?edit=${game.gameId}`} aria-label={t('editLabel', { title: game.title })}>{t('edit')}</a>
        {game.issueCount > 0 && (problems[game.gameId]
          ? <button type="button" aria-expanded="true" onClick={() => setProblems(({ [game.gameId]: _hidden, ...rest }) => rest)} aria-label={t('hideProblemsLabel', { title: game.title })}>{t('hideProblems')}</button>
          : <button type="button" aria-expanded="false" onClick={() => showProblems(game.gameId)} aria-label={t('showProblemsLabel', { title: game.title })}>{t('showProblems')}</button>)}
        {game.issueCount === 0 && !game.published?.matchesDraft && (game.can ?? []).includes('game.publish') && <button type="button" disabled={busy} onClick={() => run(roomApi(`/api/host/games/${game.gameId}/publish`, { expectedRevision: game.revision }))} aria-label={t('publishLabel', { title: game.title })}>{t('publish')}</button>}
        {make && (game.can ?? []).includes('game.copy') && <button type="button" disabled={busy} onClick={() => run(roomApi('/api/host/games', { gameId: newId(), title: t('copyTitle', { title: game.title }).slice(0, 160), startFrom: null, copyOf: game.gameId }))}
          aria-label={t('copyLabel', { title: game.title })}>{t('copy')}</button>}
        {game.published && openRoom && <button type="button" disabled={busy} onClick={() => openRoom(game.gameId)} aria-label={t('openRoomLabel', { title: game.title })}>{t('openRoom')}</button>}
        {/* Its maker or the owner removes a game; someone it was shared with only when their role for it may. */}
        {!(game.can ?? []).includes('game.remove') ? null : removing === game.gameId
          ? <span className="my-game-confirm"><button type="button" className="danger" disabled={busy} onClick={() => { setRemoving(null); forgetEditedGame(game.gameId); run(roomApi(`/api/host/games/${game.gameId}/archive`, {})); }} aria-label={t('yesRemoveLabel', { title: game.title })}>{t('yesRemove')}</button><button type="button" onClick={() => setRemoving(null)}>{t('keepIt')}</button></span>
          : <button type="button" className="quiet-danger" onClick={() => setRemoving(game.gameId)} aria-label={t('removeLabel', { title: game.title })}>{t('remove')}</button>}
      </div>
      {removing === game.gameId && <p className="my-game-note">{t('removeNote')}</p>}
      {problems[game.gameId] && <ul className="my-game-problems" aria-label={t('problemsIn', { title: game.title })}>{problems[game.gameId]!.map((issue, index) => <li key={index}>{issue.nodeKey ? (issue.stageIndex !== null ? t('scenePartProblem', { scene: issue.nodeKey, part: issue.stageIndex + 1 }) : t('sceneProblem', { scene: issue.nodeKey })) : ''}{issue.message}</li>)}</ul>}
    </li>; })}</ul>}
    {/* The built-in games, under the host's own: open a room for one, or (the owner) change it. */}
    {builtIn && <div className="builtin-section"><h3>{t('builtInGames')}</h3>{builtIn}</div>}
    {dialog === 'import' && <HostDialog id="import-heading" title={t('importHeading')} wide onClose={() => setDialog(null)}><ImportGame /></HostDialog>}
    {dialog === 'new' && <HostDialog id="new-game-heading" title={t('newGame')} onClose={() => setDialog(null)}><form className="new-game" onSubmit={event => { event.preventDefault(); const own = startFrom.startsWith('own:') ? startFrom.slice(4) : null;
      run(roomApi('/api/host/games', { gameId: newId(), title: title.trim(), startFrom: own || !startFrom ? null : startFrom, copyOf: own }).then(() => { setTitle(''); setDialog(null); })); }}>
      <label>{t('newGameName')}<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} required placeholder={t('newGamePlaceholder')} /></label>
      <label>{t('startFrom')}<Dropdown value={startFrom} onChange={setStartFrom}
        options={[{ value: '', label: t('blankGame') }, ...menu.games.map(game => ({ value: game.key, label: t('copyOf', { title: game.title }), group: t('builtInGames') })),
          ...menu.myGames.map(game => ({ value: `own:${game.gameId}`, label: t('copyOf', { title: game.title }), group: t('yourGames') }))]} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy || !title.trim()}>{t('createGame')}</button>
    </form></HostDialog>}
  </section>;
}
