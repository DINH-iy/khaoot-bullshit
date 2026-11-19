import { useEffect, useId, useRef, useState } from 'react';
import { useTexts } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from '../room/extras.text.js';
import { JoinOption } from '../room/join-option.js';

/** "Have a personal key?": type the key the organiser gave you (like K7QM-4XPT-9RWD) and this phone plays as you. */
export function KeySignIn({ onSignIn }: { onSignIn: (key: string) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const t = useTexts(EXTRAS_TEXTS);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  const close = () => { setOpen(false); setError(''); trigger.current?.focus(); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    onSignIn(key).then(() => { setOpen(false); setKey(''); }, (cause: unknown) => {
      setError(t(cause instanceof Error && cause.message === 'RATE_LIMITED' ? 'keyTooMany' : 'keyWrong'));
    }).finally(() => setBusy(false));
  };
  return <div>
    <button type="button" className="join-option" ref={trigger} aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(); else setOpen(true); }}>
      <JoinOption icon="link" title={t('signIn')} detail={t('yourKey')} expandable />
    </button>
    {open && <form className="key-sign-in" id={id} onSubmit={submit}>
      <label>{t('yourKey')}<input ref={input} value={key} onChange={event => setKey(event.target.value)} maxLength={20} required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX" /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy || !key.trim()}>{t(busy ? 'signingIn' : 'signIn')}</button>
        <button type="button" className="ghost" onClick={close}>{t('cancel')}</button>
      </div>
    </form>}
  </div>;
}
