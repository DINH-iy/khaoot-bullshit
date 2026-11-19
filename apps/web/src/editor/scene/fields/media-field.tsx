import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LIBRARY_ACCEPT, LIBRARY_LIMITS, LibraryItemSchema, MediaLibrarySchema, sceneMediaUrl, type LibraryItem, type MediaLibrary, type SceneMediaKind } from '@party/contracts';
import { roomApi } from '../../../room/api.js';
import { Icon } from '../../controls/icons.js';
import { translate, useTexts } from '../../../i18n/texts.js';
import { AudioEditForm, type AudioEdit } from './audio-edit.js';
import { AUDIO_EDIT_TEXTS } from './audio-edit.text.js';
import { MEDIA_TEXTS } from './media.text.js';
const t = (key: keyof typeof MEDIA_TEXTS.en, values?: Record<string, string | number>) => translate(MEDIA_TEXTS, key, values);
import type { Stage } from '../../model.js';

// A scene's picture, video or song (contracts/media.ts), from the media library shared by the owner and editors.
const kindName = (kind: SceneMediaKind) => t(kind); const kindsName = (kind: SceneMediaKind) => t(({ image: 'images', video: 'videos', audio: 'audios' } as const)[kind]);
const where = (kind: SceneMediaKind) => t(({ image: 'whereImage', video: 'whereVideo', audio: 'whereAudio' } as const)[kind]);
const problems: Record<string, () => string> = {
  UNSUPPORTED_MEDIA: () => t('unsupported'), FILE_TOO_LARGE: () => t('tooLarge', { image: LIBRARY_LIMITS.image / 1048576, audio: LIBRARY_LIMITS.audio / 1048576, video: LIBRARY_LIMITS.video / 1048576 }),
  STORAGE_FULL: () => t('full'), MEDIA_IN_USE: () => t('inUse'), RATE_LIMITED: () => t('tooMany'), UNAUTHORIZED: () => t('signedOut'),
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : '']?.() ?? t('unreachable');
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
  useEffect(() => { setName(undefined); if (media) void roomApi('/api/host/media').then(data => setName(MediaLibrarySchema.parse(data).items.find(item => item.id === media.id)?.name ?? t('gone'))).catch(() => undefined); }, [media?.id]);
  const set = (next: { id: string; kind: SceneMediaKind } | null) => { const copy: Stage = { ...stage }; if (next) copy['media'] = next; else delete copy['media']; onChange(copy); };
  return <fieldset className="media-field"><legend>{t('legend')}</legend>
    {media ? <>
      <Preview kind={media.kind} id={media.id} name={name ?? kindName(media.kind)} />
      <p className="hint"><strong>{kindName(media.kind)}</strong>{name ? `: ${name}` : ''}. {where(media.kind)}</p>
      <div className="actions"><button type="button" className="small-button" disabled={readOnly} onClick={() => setChoosing(true)}>{t('change')}</button>
        <button type="button" className="small-button" disabled={readOnly} onClick={() => set(null)}>{t('removeFromScene')}</button></div>
    </> : <button type="button" className="small-button with-icon" disabled={readOnly} onClick={() => setChoosing(true)}><Icon name="plus" size={16} />{t('add')}</button>}
    {choosing && <MediaLibraryDialog current={media?.id} onPick={item => { set({ id: item.id, kind: item.kind }); setChoosing(false); }} onClose={() => setChoosing(false)} />}
  </fieldset>;
}

/** The media library: upload a file or pick one; files no game uses can be removed. */
export function MediaLibraryDialog({ current, only, title = t('library'), onPick, onClose }: { current: string | undefined; only?: SceneMediaKind; title?: string; onPick: (item: LibraryItem) => void; onClose: () => void }) {
  const audioText = useTexts(AUDIO_EDIT_TEXTS);
  const [library, setLibrary] = useState<MediaLibrary>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<AudioEdit>();
  const [added, setAdded] = useState<LibraryItem>();
  const [filter, setFilter] = useState<SceneMediaKind | 'all'>(only ?? 'all');
  const id = useId(); const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const load = () => roomApi('/api/host/media').then(data => setLibrary(MediaLibrarySchema.parse(data))).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('button')?.focus(); return () => previous?.focus?.(); }, []);
  const close = () => { if (!edit || !busy) onClose(); };
  const openAudio = (next: AudioEdit) => { setError(''); setAdded(undefined); setEdit(next); };
  const saveAudio = (path: string, body: object) => {
    setBusy(true);
    setError('');
    void roomApi(path, body, 'POST', 90_000).then(data => {
      const item = LibraryItemSchema.parse(data);
      setAdded(item);
      setFilter('audio');
      setEdit(undefined);
      return load();
    }).catch(cause => {
      const code = cause instanceof Error ? cause.message : '';
      if (code === 'INVALID_COMMAND') setError(audioText(edit?.kind === 'youtube' ? 'invalidLink' : 'invalidTrim'));
      else if (code === 'AUDIO_TOOLS_UNAVAILABLE') setError(audioText('toolsMissing'));
      else if (code === 'AUDIO_IMPORT_FAILED') setError(audioText('importFailed'));
      else if (code === 'AUDIO_TRIM_FAILED') setError(audioText('trimFailed'));
      else if (code === 'RATE_LIMITED') setError(audioText('busy'));
      else setError(explain(cause));
    }).finally(() => setBusy(false));
  };
  const upload = (files: FileList | null) => {
    const file = files?.[0]; if (!file) return; setBusy(true); setError('');
    void uploadFile(file).then(item => { if (only && item.kind !== only) { setError(t('wrongKind')); setBusy(false); void load(); return; } onPick(item); }).catch(cause => { setError(explain(cause)); setBusy(false); }).finally(() => { if (input.current) input.current.value = ''; });
  };
  const remove = (item: LibraryItem) => {
    if (!confirm(t('removeAsk', { name: item.name }))) return;
    setBusy(true); setError(''); void roomApi(`/api/host/media/${item.id}/remove`, {}).then(load).catch(cause => setError(explain(cause))).finally(() => setBusy(false));
  };
  const shown = library?.items.filter(item => filter === 'all' || item.kind === filter) ?? [];
  return createPortal(<div className="ed-dialog-backdrop media-library-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={box} className={`ed-dialog media-library${edit ? ' editing-audio' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); if (edit && !busy) { setEdit(undefined); setError(''); } else close(); }
    }}>
      <h2 id={`${id}-title`}>{edit ? audioText(edit.kind === 'youtube' ? 'fromYouTube' : 'trimTitle') : title}</h2>
      {error && <p role="alert" className="error">{error}</p>}
      {edit ? <AudioEditForm edit={edit} busy={busy} save={saveAudio} back={() => { setEdit(undefined); setError(''); }} /> : <>
      <p>{t('libraryIntro')}</p>
      <div className="actions media-upload">
        <input ref={input} type="file" accept={only === 'audio' ? 'audio/*,.mp3,.m4a,.ogg,.wav,.flac' : LIBRARY_ACCEPT} hidden onChange={event => upload(event.target.files)} />
        <button type="button" className="primary with-icon" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" size={16} />{t(busy ? 'uploading' : 'upload')}</button>
        {(!only || only === 'audio') && <button type="button" disabled={busy} onClick={() => openAudio({ kind: 'youtube' })}>{audioText('fromYouTube')}</button>}
        {library && <span className="hint">{t('used', { used: size(library.usedBytes), limit: size(library.limitBytes) })}</span>}
      </div>
      {added && <p role="status" className="hint">{audioText('added', { name: added.name })}</p>}
      {library && library.items.length > 0 && !only && <div className="choice-tabs" role="tablist" aria-label={t('kindOfFile')}>{(['all', 'image', 'video', 'audio'] as const).map(kind =>
        <button key={kind} type="button" role="tab" aria-selected={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? t('all') : kindsName(kind)}</button>)}</div>}
      {!library && !error && <p role="status">{t('loading')}</p>}
      {library && !shown.length && (only || !library.items.length) && <p>{t(only === 'audio' ? 'noSongs' : 'nothing')}</p>}
      {shown.length > 0 && <ul className="media-items">{shown.map(item => <li key={item.id} className={item.id === current ? 'current' : undefined}>
        <Preview kind={item.kind} id={item.id} name={item.name} />
        <span className="media-item-name" title={item.name}>{item.name}</span><span className="hint">{kindName(item.kind)} · {size(item.byteSize)}</span>
        {/* Who made it and its licence: shown on the shared screen when a song plays (a CC BY file must be credited). */}
        <label className="media-credit">{t('credit')}<input defaultValue={item.credit ?? ''} maxLength={300} placeholder={t('creditPlaceholder')} disabled={busy}
          onBlur={event => { const credit = event.target.value.trim(); if (credit !== (item.credit ?? '')) void roomApi(`/api/host/media/${item.id}`, { credit }, 'PUT').then(load).catch(cause => setError(explain(cause))); }} /></label>
        <div className="actions"><button type="button" className="small-button" disabled={busy} aria-pressed={item.id === current} onClick={() => onPick(item)}>{t(item.id === current ? 'inThisScene' : 'useThis')}</button>
          {item.kind === 'audio' && <button type="button" className="small-button" disabled={busy} onClick={() => openAudio({ kind: 'trim', item })}>{audioText('trim')}</button>}
          <button type="button" className="icon-only" disabled={busy} aria-label={t('removeLabel', { name: item.name })} title={t('removeTitle')} onClick={() => remove(item)}><Icon name="trash" size={16} /></button></div>
      </li>)}</ul>}
      <div className="actions"><button type="button" onClick={onClose}>{t('close')}</button></div>
      </>}
    </div>
  </div>, document.querySelector('.editor') ?? document.body);
}
