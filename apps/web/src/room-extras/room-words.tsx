import { useState } from 'react';
import { HangmanWordSchema, UndercoverPairSchema, type RoomSnapshot } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { useTexts } from '../i18n/texts.js';
import { FaIcon } from '../presentation/icons.js';
import { ROOM_WORDS_TEXTS } from './room-words.text.js';

const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean);

/**
 * Host only: their own Galgje words and Undercover pairs for this room. The next such round uses them
 * instead of the game's own; the server keeps them from the phones and the shared screen.
 */
export function RoomWords({ state, sessionId }: { state: RoomSnapshot; sessionId: string }) {
  const w = useTexts(ROOM_WORDS_TEXTS); const own = state.ownWords ?? { words: [], pairs: [] };
  const [words, setWords] = useState(own.words.join('\n')); const [pairs, setPairs] = useState(own.pairs.map(pair => pair.join(', ')).join('\n'));
  const [busy, setBusy] = useState(false); const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const save = (next: { words: string; pairs: string }) => {
    const parsedWords = lines(next.words).map(line => HangmanWordSchema.safeParse(line));
    const parsedPairs = lines(next.pairs).map(line => UndercoverPairSchema.safeParse(line.split(',').map(part => part.trim())));
    const skipped = [...parsedWords, ...parsedPairs].filter(entry => !entry.success).length;
    const body = { words: parsedWords.flatMap(entry => entry.success ? [entry.data] : []).slice(0, 200), pairs: parsedPairs.flatMap(entry => entry.success ? [entry.data] : []).slice(0, 100) };
    setBusy(true); setNote(null);
    void roomApi(`/api/rooms/${sessionId}/words`, body)
      .then(() => setNote({ text: [body.words.length || body.pairs.length ? w('saved') : w('cleared'), skipped ? w('skipped', { count: skipped }) : ''].filter(Boolean).join(' ') }))
      .catch(() => setNote({ text: w('failed'), error: true })).finally(() => setBusy(false));
  };
  const using = own.words.length > 0 || own.pairs.length > 0;
  return <details className="room-words">
    <summary>{w('title')}{using && <span className="room-words-count"> · {w('inUse', { words: own.words.length, pairs: own.pairs.length })}</span>}</summary>
    <p className="hint">{w('hint')}</p>
    <label>{w('words')}<textarea rows={4} value={words} autoComplete="off" spellCheck={false} onChange={event => setWords(event.target.value)} /></label>
    <label>{w('pairs')}<textarea rows={4} value={pairs} autoComplete="off" spellCheck={false} onChange={event => setPairs(event.target.value)} /></label>
    <div className="actions">
      <button type="button" disabled={busy} onClick={() => save({ words, pairs })}><FaIcon name="check" /> {w('save')}</button>
      {using && <button type="button" className="danger" disabled={busy} onClick={() => { setWords(''); setPairs(''); save({ words: '', pairs: '' }); }}><FaIcon name="xmark" /> {w('clear')}</button>}
    </div>
    {note && <p role={note.error ? 'alert' : 'status'} className={note.error ? 'error' : 'hint'}>{note.text}</p>}
  </details>;
}
