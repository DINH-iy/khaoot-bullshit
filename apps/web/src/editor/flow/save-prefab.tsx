import { useState } from 'react';
import type { PrefabContent } from '@party/contracts';
import { translate } from '../../i18n/texts.js';
import { CONTROLS_TEXTS } from '../controls/controls.text.js';
const t = (key: keyof typeof CONTROLS_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROLS_TEXTS, key, values);
import { newId, roomApi } from '../../room/api.js';

/**
 * "Save as prefab": keeps the selected scenes (and the connections between them)
 * to insert into any game later, from the add menu's Prefabs. One request id per
 * opened form, so a repeated click saves it once. With `onClose` (opened from a
 * menu) the form starts open and Cancel closes it there; with `startOpen` it starts open but keeps its own button.
 */
export function SavePrefab({ content, defaultName, onClose, startOpen = false }: { content: () => PrefabContent; defaultName: string; onClose?: () => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(onClose) || startOpen); const [name, setName] = useState(defaultName); const [prefabId, setPrefabId] = useState(newId);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const start = () => { setName(defaultName); setPrefabId(newId()); setMessage(null); setOpen(true); };
  const save = (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    roomApi('/api/host/prefabs', { prefabId, name: name.trim(), content: content() })
      .then(() => { setOpen(false); setMessage({ text: t('saved', { name: name.trim() }), error: false }); },
        (cause: unknown) => setMessage({ text: t(cause instanceof Error && cause.message === 'PREFAB_LIMIT' ? 'limit' : cause instanceof Error && cause.message === 'INVALID_COMMAND' ? 'tooLarge' : 'saveFailed'), error: true }))
      .finally(() => setBusy(false));
  };
  return <div className="save-prefab">
    {open ? <form onSubmit={save}>
      <label>{t('prefabName')}<input value={name} maxLength={80} required onChange={event => setName(event.target.value)} autoFocus /></label>
      <div className="actions"><button type="submit" disabled={busy || !name.trim()}>{t(busy ? 'saving' : 'savePrefab')}</button><button type="button" onClick={() => { setOpen(false); onClose?.(); }}>{t('cancel')}</button></div>
    </form> : !onClose && <button type="button" className="small-button" onClick={start}>{t('saveAsPrefab')}</button>}
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'hint warn' : 'hint'}>{message.text}</p>}
  </div>;
}
