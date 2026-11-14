import { useState } from 'react';
import type { PrefabContent } from '@party/contracts';
import { newId, roomApi } from '../network/api.js';

/**
 * "Save as prefab": keeps the selected scenes (and the connections between them)
 * to insert into any game later, from the add menu's Prefabs. One request id per
 * opened form, so a repeated click saves it once.
 */
export function SavePrefab({ content, defaultName }: { content: () => PrefabContent; defaultName: string }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(defaultName); const [prefabId, setPrefabId] = useState(newId);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const start = () => { setName(defaultName); setPrefabId(newId()); setMessage(null); setOpen(true); };
  const save = (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    roomApi('/api/host/prefabs', { prefabId, name: name.trim(), content: content() })
      .then(() => { setOpen(false); setMessage({ text: `Saved as “${name.trim()}”. Find it under Add a scene → Prefabs.`, error: false }); },
        (cause: unknown) => setMessage({ text: cause instanceof Error && cause.message === 'PREFAB_LIMIT' ? 'There are already 200 prefabs. Delete some first.' : cause instanceof Error && cause.message === 'INVALID_COMMAND' ? 'This is too large for a prefab. Select fewer scenes.' : 'Saving did not work. Try again.', error: true }))
      .finally(() => setBusy(false));
  };
  return <div className="save-prefab">
    {open ? <form onSubmit={save}>
      <label>Prefab name<input value={name} maxLength={80} required onChange={event => setName(event.target.value)} autoFocus /></label>
      <div className="actions"><button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save prefab'}</button><button type="button" onClick={() => setOpen(false)}>Cancel</button></div>
    </form> : <button type="button" onClick={start}>Save as prefab…</button>}
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'hint warn' : 'hint'}>{message.text}</p>}
  </div>;
}
