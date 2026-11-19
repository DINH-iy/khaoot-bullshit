import { useEffect, useId, useRef, useState } from 'react';
import { LIBRARY_ACCEPT, LIBRARY_LIMITS, LibraryItemSchema, MediaLibrarySchema, sceneMediaUrl, type LibraryItem, type MediaLibrary, type SceneMediaKind } from '@party/contracts';
import { roomApi } from '../../../room/api.js';
import { Icon } from '../../controls/icons.js';
import type { Stage } from '../../model.js';

// A scene's picture, video or song (contracts/media.ts), from the media library shared by the owner and editors.
export const KIND_NAMES: Record<SceneMediaKind, string> = { image: 'Picture', video: 'Video', audio: 'Song or sound' };
const WHERE: Record<SceneMediaKind, string> = { image: 'Shows on the shared screen and the phones.', video: 'Plays on the shared screen (or the host’s screen without one); phones say to watch it.', audio: 'Plays on the shared screen (or the host’s screen without one); phones say to listen.' };
const problems: Record<string, string> = {
  UNSUPPORTED_MEDIA: 'That file is not a picture (PNG, JPEG, WebP, GIF), video (MP4, WebM, MOV) or song (MP3, M4A, Ogg, WAV, FLAC).',
  FILE_TOO_LARGE: `Too large: pictures up to ${LIBRARY_LIMITS.image / 1048576} MB, songs up to ${LIBRARY_LIMITS.audio / 1048576} MB, videos up to ${LIBRARY_LIMITS.video / 1048576} MB.`,
  STORAGE_FULL: 'The media library is full. Remove files no game uses any more.', MEDIA_IN_USE: 'A game still uses this file (its draft or its published version). Take it out of those scenes first.',
  RATE_LIMITED: 'Too many uploads at once. Wait a moment and try again.', UNAUTHORIZED: 'You are not signed in as the owner or an editor any more.',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Try again.';
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

/** Uploads one file as it is (streamed by the browser), named after the file. */
async function uploadFile(file: File): Promise<LibraryItem> {
  const response = await fetch(`/api/host/media?name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-party-request': '1', 'content-type': 'application/octet-stream' }, body: file });
  const reply = await response.json().catch(() => ({ ok: false, error: { code: response.status === 413 ? 'FILE_TOO_LARGE' : 'GAME_UNAVAILABLE' } })) as { ok: boolean; data?: unknown; error?: { code: string } };
  if (!reply.ok) throw new Error(reply.error?.code ?? 'GAME_UNAVAILABLE');
  return LibraryItemSchema.parse(reply.data);
}

/** A small preview of a library file. */
function Preview({ kind, id, name }: { kind: SceneMediaKind; id: string; name: string }) {
  const url = sceneMediaUrl(id);
  if (kind === 'image') return <img className="media-preview" src={url} alt={name} />;
  if (kind === 'video') return <video className="media-preview" src={url} controls preload="metadata" aria-label={name} />;
  return <audio className="media-preview audio" src={url} controls preload="none" aria-label={name} />;
}

/** In a scene's Content group: the picture, video or song shown with its text, and where it plays. */
export function MediaField({ stage, readOnly, onChange }: { stage: Stage; readOnly?: boolean; onChange: (next: Stage) => void }) {
  const media = stage['media'] as { id: string; kind: SceneMediaKind } | undefined;
  const [choosing, setChoosing] = useState(false); const [name, setName] = useState<string>();
  useEffect(() => { setName(undefined); if (media) void roomApi('/api/host/media').then(data => setName(MediaLibrarySchema.parse(data).items.find(item => item.id === media.id)?.name ?? 'No longer in the library')).catch(() => undefined); }, [media?.id]);
  const set = (next: { id: string; kind: SceneMediaKind } | null) => { const copy: Stage = { ...stage }; if (next) copy['media'] = next; else delete copy['media']; onChange(copy); };
  return <fieldset className="media-field"><legend>Picture, video or song</legend>
    {media ? <>
      <Preview kind={media.kind} id={media.id} name={name ?? KIND_NAMES[media.kind]} />
      <p className="hint"><strong>{KIND_NAMES[media.kind]}</strong>{name ? `: ${name}` : ''}. {WHERE[media.kind]}</p>
      <div className="actions"><button type="button" className="small-button" disabled={readOnly} onClick={() => setChoosing(true)}>Change…</button>
        <button type="button" className="small-button" disabled={readOnly} onClick={() => set(null)}>Remove from this scene</button></div>
    </> : <button type="button" className="small-button with-icon" disabled={readOnly} onClick={() => setChoosing(true)}><Icon name="plus" size={16} />Add a picture, video or song</button>}
    {choosing && <MediaLibraryDialog current={media?.id} onPick={item => { set({ id: item.id, kind: item.kind }); setChoosing(false); }} onClose={() => setChoosing(false)} />}
  </fieldset>;
}

/** The media library: upload a file or pick one; files no game uses can be removed. */
export function MediaLibraryDialog({ current, only, title = 'Media library', onPick, onClose }: { current: string | undefined; only?: SceneMediaKind; title?: string; onPick: (item: LibraryItem) => void; onClose: () => void }) {
  const [library, setLibrary] = useState<MediaLibrary>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<SceneMediaKind | 'all'>(only ?? 'all');
  const id = useId(); const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const load = () => roomApi('/api/host/media').then(data => setLibrary(MediaLibrarySchema.parse(data))).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('button')?.focus(); return () => previous?.focus?.(); }, []);
  const upload = (files: FileList | null) => {
    const file = files?.[0]; if (!file) return; setBusy(true); setError('');
    void uploadFile(file).then(item => { if (only && item.kind !== only) { setError(`That is a ${KIND_NAMES[item.kind].toLowerCase()}, not a ${KIND_NAMES[only].toLowerCase()}. It is in the library for other scenes.`); setBusy(false); void load(); return; } onPick(item); }).catch(cause => { setError(explain(cause)); setBusy(false); }).finally(() => { if (input.current) input.current.value = ''; });
  };
  const remove = (item: LibraryItem) => {
    if (!confirm(`Remove “${item.name}” from the media library? Only possible when no game uses it.`)) return;
    setBusy(true); setError(''); void roomApi(`/api/host/media/${item.id}/remove`, {}).then(load).catch(cause => setError(explain(cause))).finally(() => setBusy(false));
  };
  const shown = library?.items.filter(item => filter === 'all' || item.kind === filter) ?? [];
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className="ed-dialog media-library" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p>Pictures, videos and songs for your games, shared with your editors. Files are used as they are, so keep them small: they travel to every phone and the shared screen.</p>
      <div className="actions media-upload">
        <input ref={input} type="file" accept={only === 'audio' ? 'audio/*,.mp3,.m4a,.ogg,.wav,.flac' : LIBRARY_ACCEPT} hidden onChange={event => upload(event.target.files)} />
        <button type="button" className="primary with-icon" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" size={16} />{busy ? 'Uploading…' : 'Upload a file'}</button>
        {library && <span className="hint">{size(library.usedBytes)} of {size(library.limitBytes)} used</span>}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {library && library.items.length > 0 && !only && <div className="choice-tabs" role="tablist" aria-label="Kind of file">{(['all', 'image', 'video', 'audio'] as const).map(kind =>
        <button key={kind} type="button" role="tab" aria-selected={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? 'All' : `${KIND_NAMES[kind]}s`}</button>)}</div>}
      {!library && !error && <p role="status">Loading the library…</p>}
      {library && !shown.length && (only || !library.items.length) && <p>{only === 'audio' ? 'No songs yet. Upload one (MP3, M4A, Ogg, WAV or FLAC).' : 'Nothing here yet. Upload a picture, video or song to use it in a scene.'}</p>}
      {shown.length > 0 && <ul className="media-items">{shown.map(item => <li key={item.id} className={item.id === current ? 'current' : undefined}>
        <Preview kind={item.kind} id={item.id} name={item.name} />
        <span className="media-item-name" title={item.name}>{item.name}</span><span className="hint">{KIND_NAMES[item.kind]} · {size(item.byteSize)}</span>
        {/* Who made it and its licence: shown on the shared screen when a song plays (a CC BY file must be credited). */}
        <label className="media-credit">Credit<input defaultValue={item.credit ?? ''} maxLength={300} placeholder="Composer, licence" disabled={busy}
          onBlur={event => { const credit = event.target.value.trim(); if (credit !== (item.credit ?? '')) void roomApi(`/api/host/media/${item.id}`, { credit }, 'PUT').then(load).catch(cause => setError(explain(cause))); }} /></label>
        <div className="actions"><button type="button" className="small-button" disabled={busy} aria-pressed={item.id === current} onClick={() => onPick(item)}>{item.id === current ? 'In this scene' : 'Use this'}</button>
          <button type="button" className="icon-only" disabled={busy} aria-label={`Remove ${item.name} from the library`} title="Remove from the library" onClick={() => remove(item)}><Icon name="trash" size={16} /></button></div>
      </li>)}</ul>}
      <div className="actions"><button type="button" onClick={onClose}>Close</button></div>
    </div>
  </div>;
}
