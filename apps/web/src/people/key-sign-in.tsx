import { useState } from 'react';

/** "Have a personal key?": type the key the organiser gave you (like K7QM-4XPT-9RWD) and this phone plays as you. */
export function KeySignIn({ onSignIn }: { onSignIn: (key: string) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!open) return <p className="join-links"><button type="button" className="link-button" onClick={() => setOpen(true)}>Have a personal key? Sign in</button></p>;
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    onSignIn(key).then(() => { setOpen(false); setKey(''); }, (cause: unknown) => {
      setError(cause instanceof Error && cause.message === 'RATE_LIMITED' ? 'Too many tries. Wait a minute and try again.' : 'That key does not work. Check it, or ask the organiser.');
    }).finally(() => setBusy(false));
  };
  return <form className="key-sign-in" onSubmit={submit}>
    <label>Your personal key<input value={key} onChange={event => setKey(event.target.value)} maxLength={20} required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX" /></label>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="actions"><button type="submit" disabled={busy || !key.trim()}>{busy ? 'Signing in…' : 'Sign in'}</button><button type="button" className="ghost" onClick={() => { setOpen(false); setError(''); }}>Cancel</button></div>
  </form>;
}
