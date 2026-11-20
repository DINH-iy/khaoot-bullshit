import { useEffect, useRef, useState } from 'react';
import { ChatViewSchema, type ChatSend, type RoomSnapshot } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { useTexts } from '../i18n/texts.js';
import { Dropdown } from '../ui/dropdown.js';
import { CHAT_TEXTS } from './chat.text.js';

type Channel = ChatSend['channel'];
const CHANNELS = ['room', 'team', 'private'] as const;

export function RoomChat({ state }: { state: RoomSnapshot }) {
  const t = useTexts(CHAT_TEXTS);
  const path = `/api/rooms/${state.view.sessionId}/chat`;
  const host = state.role === 'host';
  const me = state.selfPlayerId;
  const people = state.players.filter(player => player.id !== me).map(player => ({ value: player.id, label: player.displayName }));
  const [view, setView] = useState<ReturnType<typeof ChatViewSchema.parse>>();
  const [channel, setChannel] = useState<Channel>('room');
  const [picked, selectPlayer] = useState('');
  const recipient = people.find(person => person.value === picked)?.value ?? people[0]?.value;
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [reported, setReported] = useState<string[]>([]);
  const polling = useRef<() => void>(() => {});
  useEffect(() => {
    let mounted = true;
    let busy = false;
    const sync = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const data = ChatViewSchema.parse(await roomApi(path));
        if (mounted) setView(data);
      } catch { /* A temporary disconnect is retried while the chat is open. */ }
      finally { busy = false; }
    };
    const request = () => { void sync(); };
    polling.current = request;
    request();
    const timer = setInterval(request, 3000);
    document.addEventListener('visibilitychange', request);
    return () => { mounted = false; clearInterval(timer); document.removeEventListener('visibilitychange', request); };
  }, [path]);
  const active = channel === 'team' && !view?.canTeam ? 'room' : channel;
  const list = (view?.messages ?? []).filter(message => host || (message.channel === active && (active !== 'private'
    || (message.from === me ? message.recipientId : message.from) === recipient)));
  const blocked = Boolean(me && view?.muted.includes(me));
  const submit = async (url: string, data: unknown, onSuccess: () => void) => {
    setPending(true);
    setNotice('');
    try { await roomApi(url, data); onSuccess(); polling.current(); }
    catch { setNotice(t('failure')); }
    finally { setPending(false); }
  };
  return <div className="room-chat">
    <p className="hint">{t('retention')}</p>
    {!host && <div className="chat-channels" role="group" aria-label={t('title')}>
      {CHANNELS.map(value => <button type="button" key={value} aria-pressed={active === value}
        disabled={value === 'team' ? !view?.canTeam : value === 'private' && !people.length}
        onClick={() => { setChannel(value); setDraft(''); }}>{t(value)}</button>)}
    </div>}
    {(active === 'private' || host) && recipient && <label>{t(host ? 'moderate' : 'to')}
      <Dropdown value={recipient} onChange={id => { selectPlayer(id); setDraft(''); }} options={people} />
    </label>}
    {host && recipient && <button disabled={pending || !view} type="button" onClick={() =>
      void submit(`${path}/moderation`, { action: 'mute', playerId: recipient, muted: !view?.muted.includes(recipient) }, () => {})}>
      {t(view?.muted.includes(recipient) ? 'unmute' : 'mute')}
    </button>}
    <div className="chat-log" role="log" aria-label={t('title')} tabIndex={0}>
      {list.length === 0 && <p className="hint">{t('empty')}</p>}
      <ul>{list.map(message => <li key={message.id}>
        <strong>{message.name}</strong>{host && message.reported && <small>{t('reported')} · {t(message.channel)}</small>}
        <p>{message.text}</p>
        {host && state.view.status === 'FINISHED' && state.settings.reactions && message.channel === 'room' &&
          <button type="button" className="small-button" disabled={pending}
            onClick={() => void submit(`${path}/moderation`, { action: 'show', messageId: message.id }, () => {})}>{t('show')}</button>}
        {!host && message.from !== me && <button type="button" disabled={pending || reported.includes(message.id)} className="small-button"
          onClick={() => void submit(`${path}/moderation`, { action: 'report', messageId: message.id }, () => setReported(previous => [...previous, message.id]))}>
          {t(reported.includes(message.id) ? 'reported' : 'report')}
        </button>}
      </li>)}</ul>
    </div>
    {!host && (blocked ? <p role="status">{t('muted')}</p> : <form onSubmit={event => {
      event.preventDefault();
      if (!draft.trim() || pending) return;
      const data = { channel: active, text: draft, ...(active === 'private' ? { recipientId: recipient } : {}) };
      void submit(path, data, () => setDraft(''));
    }}>
      <input aria-label={t('message')} maxLength={240} value={draft} onChange={event => setDraft(event.target.value)} />
      <button className="primary" disabled={pending || !view || !draft.trim() || (active === 'private' && !recipient)}>{t('send')}</button>
    </form>)}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
