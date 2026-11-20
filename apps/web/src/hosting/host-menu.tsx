import { useEffect, useRef, useState } from 'react';
import { formatRoomCode, HostMenuSchema, type HostMenu } from '@party/contracts';
import { newId, roomApi } from '../room/api.js';
import { MyGames } from './my-games.js';
import { ImportGame } from './import-game.js';
import { GamePicker } from './game-picker.js';
import { OwnerNav } from '../owner/owner-nav.js';
import { Icon } from '../editor/controls/icons.js';
import { isLocalOwnerPage, rememberOwner } from '../owner/owner-session.js';
import { translate, useTexts } from '../i18n/texts.js';
import { rich } from '../i18n/rich.js';
import { OWNER_TEXTS } from '../owner/owner.text.js';
import { HOSTING_TEXTS } from './hosting.text.js';
import './host-menu.css';

const initial = new URL(location.href);
const ownerToken = new URLSearchParams(initial.hash.slice(1)).get('owner');
// Never leave the private owner key in the address bar or history.
if (ownerToken) history.replaceState(null, '', `${initial.pathname}${initial.search}`);

// Messages are looked up when they are shown, so they are in the language chosen at that moment.
const explain = (cause: unknown) => {
  const code = cause instanceof Error ? cause.message : '';
  return code === 'UNAUTHORIZED' ? translate(OWNER_TEXTS, 'signedOut') : translate(HOSTING_TEXTS, code === 'AUTH_UNAVAILABLE' ? 'notSetUp' : code === 'RATE_LIMITED' ? 'tooMany' : 'unreachable');
};
const ROOM_STATUS = { LOBBY: 'statusLobby', RUNNING: 'statusRunning', PAUSED: 'statusPaused', RECOVERING: 'statusRecovering', FINISHED: 'statusFinished' } as const satisfies Record<HostMenu['rooms'][number]['status'], keyof typeof HOSTING_TEXTS.en>;

/** Copies a room code (without the dash, as players type it); a tick shows for a moment once copied. */
function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false); const t = useTexts(HOSTING_TEXTS);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);
  return <button type="button" className={`copy-code${copied ? ' copied' : ''}`} aria-label={copied ? t('codeCopied') : t('copyCodeLabel', { code })} title={copied ? t('copied') : t('copyCode')}
    onClick={() => { void navigator.clipboard.writeText(code).then(() => setCopied(true), () => setCopied(false)); }}><Icon name={copied ? 'check' : 'copy'} size={16} /></button>;
}

export function HostMenu() {
  const [menu, setMenu] = useState<HostMenu>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  const [gameKey, setGameKey] = useState(''); const t = useTexts(HOSTING_TEXTS);
  const ownerText = useTexts(OWNER_TEXTS);
  // One request identity per page load: a repeated click or retry returns the same room.
  const [request] = useState(() => ({ sessionId: newId(), commandId: newId() }));
  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (ownerToken) await roomApi('/api/host/claim', { token: ownerToken });
      else if (isLocalOwnerPage() && initial.searchParams.get('localOwner') === '1') {
        await roomApi('/api/host/claim-local', {});
        const url = new URL(location.href);
        url.searchParams.delete('localOwner');
        history.replaceState(null, '', url);
      }
      const loaded = HostMenuSchema.parse(await roomApi('/api/host'));
      rememberOwner(loaded.role === 'owner');
      if (mounted) { setMenu(loaded); setGameKey(loaded.games[0]?.key ?? ''); }
    })().catch(cause => {
      const signedOut = cause instanceof Error && cause.message === 'UNAUTHORIZED';
      if (signedOut) rememberOwner(false);
      if (mounted && (!signedOut || !isLocalOwnerPage() || ownerToken)) setError(explain(cause));
    }).finally(() => { if (mounted) setBusy(false); });
    // A page restored from the back/forward cache would reuse the previous room request.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
    window.addEventListener('pageshow', restored);
    return () => { mounted = false; window.removeEventListener('pageshow', restored); };
  }, []);
  // "Editor" in the owner bar points at Your games (#my-games). The list appears after loading, so scroll there once it is shown.
  const [hash, setHash] = useState(location.hash);
  const scrolled = useRef(false);
  useEffect(() => { const changed = () => setHash(location.hash); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => { if (menu && hash === '#my-games' && !scrolled.current) { scrolled.current = true; document.getElementById('my-games')?.scrollIntoView(); } }, [menu, hash]);
  const reload = () => { void roomApi('/api/host').then(data => setMenu(HostMenuSchema.parse(data))).catch(cause => setError(explain(cause))); };
  const open = (work: Promise<{ sessionId: string }>) => {
    setBusy(true); setError('');
    work.then(result => location.assign(`/?room=${result.sessionId}`)).catch(cause => { setError(explain(cause)); setBusy(false); });
  };
  // Closing a room asks first (the game ends for everyone in it); afterwards the list is loaded again.
  const [closing, setClosing] = useState<string | null>(null);
  const closeRoom = (sessionId: string) => {
    setBusy(true); setError('');
    roomApi(`/api/host/rooms/${sessionId}/close`, {}).then(() => { setClosing(null); reload(); }).catch(cause => setError(explain(cause))).finally(() => setBusy(false));
  };
  // Editors (people with editor rights) work on the games only: no hosting, no open rooms, no admin.
  const owner = menu?.role === 'owner';
  return <><OwnerNav current={hash === '#my-games' || (menu && !owner) ? 'editor' : 'host'} role={menu?.role ?? null} /><main className="host-page">
    {!menu || owner
      ? <header className="host-hero"><p className="eyebrow">{t('eyebrowHost')}</p><h1>{t('heroHost')}</h1>
        <p>{t('heroHostText')}</p></header>
      : <header className="host-hero"><p className="eyebrow">{t('eyebrowEditor')}</p><h1>{t('heroEditor')}</h1>
        <p>{t('heroEditorText')}</p></header>}
    {error && <p role="alert" className="error">{error}</p>}
    {busy && !menu && <p role="status">{t('loadingGames')}</p>}
    {isLocalOwnerPage() && !owner && !busy && <button type="button" className="primary local-owner-signin"
      onClick={() => location.assign('/?host=1&localOwner=1')}>{ownerText('ownerSignIn')}</button>}
    {menu && <>
      {menu.rooms.length > 0 && <section aria-labelledby="rooms-heading"><div className="my-games-head"><h2 id="rooms-heading">{t('openRooms')}</h2><span className="my-games-count">{menu.rooms.length}</span></div>
        <ul className="open-rooms">{menu.rooms.map(room => <li key={room.sessionId} className={`open-room status-${room.status.toLowerCase()}`}>
          <div className="open-room-info"><div className="open-room-title"><h3>{room.title}</h3><span className="room-code-copy"><span className="room-code" aria-label={t('roomCode', { code: room.roomCode })}>{formatRoomCode(room.roomCode)}</span><CopyCode code={room.roomCode} /></span></div>
            <p className="game-badges"><span className={`badge${room.status === 'RUNNING' ? ' good' : room.status === 'PAUSED' || room.status === 'RECOVERING' ? ' warn' : ''}`}>{t(ROOM_STATUS[room.status])}</span><span className="badge">{t(room.playerCount === 1 ? 'playerOne' : 'playerMany', { count: room.playerCount })}</span></p></div>
          {closing === room.sessionId
            ? <span className="open-room-actions" role="group" aria-label={t('closeAsk', { code: room.roomCode })}><span className="open-room-ask">{t('closeQuestion')}</span>
              <button type="button" className="keep" onClick={() => setClosing(null)}>{t('keepIt')}</button>
              <button type="button" className="danger" disabled={busy} aria-label={t('yesCloseLabel', { code: room.roomCode })} onClick={() => closeRoom(room.sessionId)}>{t('yesClose')}</button></span>
            : <span className="open-room-actions"><button className="primary" disabled={busy} aria-label={t('returnLabel', { code: room.roomCode })} onClick={() => open(roomApi(`/api/host/rooms/${room.sessionId}/enter`, {}))}>{t('returnToRoom')}</button>
              <button type="button" className="danger icon-only" disabled={busy} aria-label={t('closeLabel', { code: room.roomCode })} title={t('closeTitle')} onClick={() => setClosing(room.sessionId)}><Icon name="trash" size={20} /></button></span>}</li>)}</ul>
      </section>}
      {owner && <section className="host-games" aria-labelledby="games-heading"><h2 id="games-heading">{t('chooseGame')}</h2>
        <GamePicker games={menu.games} chosen={gameKey} onChoose={setGameKey} busy={busy} onOpen={() => open(roomApi('/api/host/rooms', { gameKey, ...request }))}
          onEdit={key => { setBusy(true); void roomApi<{ gameId: string }>(`/api/host/builtins/${key}/edit`, {}).then(result => location.assign(`/?edit=${result.gameId}`)).catch(cause => { setError(explain(cause)); setBusy(false); }); }}
          onRestore={key => { void roomApi(`/api/host/builtins/${key}/restore`, {}).then(reload).catch(cause => setError(explain(cause))); }} />
        <p className="hint">{rich(t('builtInHint'), { edit: <strong>{t('editThisGame')}</strong> })}</p>
      </section>}
      <MyGames menu={menu} reload={reload} openRoom={owner ? gameId => open(roomApi('/api/host/rooms', { gameId, sessionId: newId(), commandId: newId() })) : null} />
      <ImportGame />
    </>}
    <p className="host-links"><a href="/">{t('joinAsPlayer')}</a>{owner && <><a href="/?admin">{t('adminFeedback')}</a><a href="/?admin=people">{t('adminPeople')}</a></>}</p>
  </main></>;
}
