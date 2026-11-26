import { useEffect, useRef, useState } from 'react';
import { Loader } from '../ui/loader.js';
import { formatRoomCode, HostMenuSchema, type HostMenu } from '@party/contracts';
import { newId, roomApi } from '../room/api.js';
import { MyGames } from './my-games.js';
import { BuiltInGames } from './game-picker.js';
import { OwnerNav } from '../owner/owner-nav.js';
import { PatchNotesButton } from '../patch-notes/patch-notes.js';
import { Icon } from '../editor/controls/icons.js';
import { isLocalOwnerPage } from '../owner/owner-session.js';
import { isUnavailablePageError, replaceWithHome } from '../navigation.js';
import { pendingClaim } from '../people/use-me.js';
import { translate, useTexts } from '../i18n/texts.js';
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
  const t = useTexts(HOSTING_TEXTS);
  // One request identity per page load: a repeated click or retry returns the same room.
  const [request] = useState(() => ({ sessionId: newId(), commandId: newId() }));
  const [tryoutRequest] = useState(() => ({ sessionId: newId(), commandId: newId() }));
  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (ownerToken) await roomApi('/api/host/claim', { token: ownerToken });
      else if (isLocalOwnerPage() && initial.searchParams.get('localOwner') === '1') {
        await roomApi('/api/host/claim-local', {});
        const url = new URL(location.href);
        url.searchParams.delete('localOwner');
        history.replaceState(null, '', url);
      } else await pendingClaim();
      if (!mounted) return;
      const loaded = HostMenuSchema.parse(await roomApi('/api/host'));
      if (mounted) setMenu(loaded);
    })().catch(cause => {
      if (!mounted) return;
      if (isUnavailablePageError(cause)) {
        replaceWithHome();
      } else setError(explain(cause));
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
  const reload = () => { void roomApi('/api/host').then(data => setMenu(HostMenuSchema.parse(data))).catch(cause => {
    if (isUnavailablePageError(cause)) {
      replaceWithHome();
    } else setError(explain(cause));
  }); };
  const open = (work: Promise<{ sessionId: string }>, screen: 'room' | 'bench' = 'room') => {
    setBusy(true); setError('');
    work.then(result => location.assign(`/?${screen}=${result.sessionId}`)).catch(cause => { setError(explain(cause)); setBusy(false); });
  };
  // Closing a room asks first (the game ends for everyone in it); afterwards the list is loaded again.
  const [closing, setClosing] = useState<string | null>(null);
  const closeRoom = (sessionId: string) => {
    setBusy(true); setError('');
    roomApi(`/api/host/rooms/${sessionId}/close`, {}).then(() => { setClosing(null); reload(); }).catch(cause => setError(explain(cause))).finally(() => setBusy(false));
  };
  // Editors (people with editor rights) work on the games only: no hosting, no open rooms, no admin.
  if (!menu) return error ? <main className="load-problem">
    <p role="alert" className="error">{error}</p>
    <button type="button" className="primary" onClick={() => location.reload()}>{t('retryLoading')}</button>
    <p><a href="/">{t('joinAsPlayer')}</a></p>
  </main> : <Loader full label={t('loadingGames')} />;
  const owner = menu.role === 'owner';
  // What a role allows (the server checks it again): hosting real rooms, and the minigame tryout.
  const may = (permission: string) => owner || Boolean(menu.permissions?.includes(permission)); const host = may('rooms.host');
  return <><OwnerNav current="host" role={menu.role} permissions={menu.permissions}
    mainAction={may('rooms.rehearse') ? <button type="button" disabled={busy}
      onClick={() => open(roomApi('/api/host/minigame-tryout', tryoutRequest), 'bench')}>{t('minigameTryout')}</button> : undefined} /><main className="host-page">
    {/* One short title row: what this page is for, and what is new. */}
    <header className="host-head"><div><h1>{t(host ? 'heroHost' : 'heroEditor')}</h1><p>{t(host ? 'hostSubtitle' : 'editorSubtitle')}</p></div>
      <PatchNotesButton /></header>
    {error && <p role="alert" className="error">{error}</p>}
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
      <MyGames menu={menu} reload={reload} openRoom={host ? gameId => open(roomApi('/api/host/rooms', { gameId, sessionId: newId(), commandId: newId() })) : null}
        builtIn={host || owner ? <BuiltInGames games={menu.games} busy={busy} onOpen={host ? key => open(roomApi('/api/host/rooms', { gameKey: key, ...request })) : null}
          onEdit={!owner ? undefined : key => { setBusy(true); void roomApi<{ gameId: string }>(`/api/host/builtins/${key}/edit`, {}).then(result => location.assign(`/?edit=${result.gameId}`)).catch(cause => { setError(explain(cause)); setBusy(false); }); }}
          onRestore={!owner ? undefined : key => { void roomApi(`/api/host/builtins/${key}/restore`, {}).then(reload).catch(cause => setError(explain(cause))); }} /> : null} />
  </main></>;
}
