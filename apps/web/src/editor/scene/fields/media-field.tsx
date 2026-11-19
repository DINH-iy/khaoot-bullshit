import { Dropdown } from '../../../ui/dropdown.js';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_MEDIA_LAYOUT, LIBRARY_ACCEPT, LIBRARY_LIMITS, LibraryItemSchema, MEDIA_POSITIONS, MEDIA_SIZES, MediaLibrarySchema, MediaLayoutSchema, SceneMediaSchema, sceneMediaUrl, youtubeWatchUrl, type MediaLayout, type SceneMedia, type YouTubeClip, type LibraryItem, type MediaLibrary, type SceneMediaKind } from '@party/contracts';
import { roomApi } from '../../../room/api.js';
import { StageMedia } from '../../../room/stage-media.js';
import { Icon } from '../../controls/icons.js';
import { ConfirmDialog } from '../../controls/confirm-dialog.js';
import { translate, useTexts } from '../../../i18n/texts.js';
import { AudioEditForm, type AudioEdit } from './audio-edit.js';
import { AUDIO_EDIT_TEXTS } from './audio-edit.text.js';
import { MEDIA_TEXTS } from './media.text.js';
import { YOUTUBE_TEXTS } from '../../../presentation/youtube.text.js';
import { SceneMediaEdit } from './scene-media-edit.js';
import { SCENE_MEDIA_EDIT_TEXTS } from './scene-media-edit.text.js';
import { YouTubeField } from './youtube-field.js';
import { SCENE_PRESENTATION_TEXTS } from '../scene-presentation.text.js';
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
function Preview({ kind, id, name, source }: { kind: SceneMediaKind; id: string; name: string; source?: SceneMedia }) {
  const url = sceneMediaUrl(id);
  if (kind === 'image') return <img className="media-preview" src={url} alt={name} />;
  if (kind === 'video') return <video className="media-preview" src={url} controls preload="metadata" aria-label={name} />;
  return <StageMedia media={{ ...source, id, kind, url }} label={name} role="display" displayConnected={false} preview />;
}

/** In a scene's Content group: the picture, video or song shown with its text, and where it plays. */
export function MediaField({ stage, open, onOpen, onClose, onChange }: { stage: Stage; open: boolean; onOpen: () => void; onClose: () => void; onChange: (next: Stage) => void }) {
  const yt = useTexts(YOUTUBE_TEXTS);
  const layoutText = useTexts(SCENE_PRESENTATION_TEXTS);
  const sceneMediaText = useTexts(SCENE_MEDIA_EDIT_TEXTS);
  const media = SceneMediaSchema.safeParse(stage['media']).data;
  const clip = stage['youtube'] as YouTubeClip | undefined;
  const layout = MediaLayoutSchema.safeParse(stage['mediaLayout']).data ?? DEFAULT_MEDIA_LAYOUT;
  const [pendingRemoval, setPendingRemoval] = useState<string>();
  const sourceKey = media?.id ?? clip?.videoId;
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!media) return;
    let current = true;
    void roomApi('/api/host/media').then(data => {
      const name = MediaLibrarySchema.parse(data).items.find(item => item.id === media.id)?.name;
      if (current && name) setNames({ [media.id]: name });
    }).catch(() => undefined);
    return () => { current = false; };
  }, [media?.id]);
  const name = media ? names[media.id] : undefined;
  const setSource = (source: { media?: SceneMedia; youtube?: YouTubeClip }) => {
    const copy = { ...stage };
    delete copy['media']; delete copy['youtube'];
    onChange({ ...copy, ...source });
    onClose();
  };
  const setLayout = (next: MediaLayout) => {
    const copy = { ...stage };
    if (next.position === DEFAULT_MEDIA_LAYOUT.position && next.size === DEFAULT_MEDIA_LAYOUT.size) delete copy['mediaLayout'];
    else copy['mediaLayout'] = next;
    onChange(copy);
  };
  return <fieldset className="media-field"><legend>{t('legend')}</legend>
    {clip && <><a href={youtubeWatchUrl(clip.videoId, clip.startSeconds)} target="_blank" rel="noreferrer">{yt('open')}</a><p className="hint">{yt('where')}</p></>}
    {media && <>
      <Preview kind={media.kind} id={media.id} name={name ?? kindName(media.kind)} source={media} />
      <p className="hint"><strong>{kindName(media.kind)}</strong>{name ? `: ${name}` : ''}. {where(media.kind)}</p>
    </>}
    <div className="actions">
      <button type="button" className="small-button with-icon" aria-haspopup="dialog" onClick={onOpen}>
        <Icon name={media || clip ? 'edit' : 'plus'} size={16} />{layoutText(media || clip ? 'editMedia' : 'addMedia')}
      </button>
      {sourceKey && <button type="button" className="small-button icon-only danger-icon" aria-label={t('removeFromScene')} title={t('removeFromScene')}
        onClick={() => setPendingRemoval(sourceKey)}><Icon name="trash" size={16} /></button>}
    </div>
    <div className="scene-media-layout">
      <div className="media-placement" role="group" aria-label={layoutText('position')}>
        <span className="field-title">{layoutText('position')}</span>
        <div className="media-placement-options">{MEDIA_POSITIONS.map(position => <button type="button" key={position} aria-label={layoutText(position)} title={layoutText(position)} aria-pressed={layout.position === position}
          onClick={() => setLayout({ ...layout, position })}>
          <span className={`layout-thumbnail layout-${position}`} aria-hidden="true"><i /><b /></span><span>{layoutText(`short-${position}`)}</span>
        </button>)}</div>
      </div>
      <label>{layoutText('size')}<Dropdown value={layout.size} onChange={value => setLayout({ ...layout, size: value as MediaLayout['size'] })}
        options={MEDIA_SIZES.map(value => ({ value, label: layoutText(value) }))} /></label>
      {media?.kind === 'audio' && <label className="choice"><input type="checkbox" checked={media.waveform !== false} onChange={event => {
        const { waveform: _waveform, ...source } = media;
        onChange({ ...stage, media: event.target.checked ? source : { ...source, waveform: false } });
      }} />{sceneMediaText('waveform')}</label>}
      {(clip || (media && media.kind !== 'image')) && <p className="hint">{layoutText('roomPause')}</p>}
    </div>
    {sourceKey && pendingRemoval === sourceKey && <ConfirmDialog title={t('removeSceneAsk')} text={t(media ? 'staysInLibrary' : 'removeSceneClip')}
      confirm={t('removeFromScene')} onConfirm={() => { setPendingRemoval(undefined); setSource({}); }} onCancel={() => setPendingRemoval(undefined)} />}
    {open && <MediaLibraryDialog current={media?.id} scene={{
      media, clip,
      onMedia: selected => setSource({ media: selected }), onYouTube: selected => setSource({ youtube: selected }),
    }} onClose={onClose} />}
  </fieldset>;
}

interface ScenePicker {
  media: SceneMedia | undefined;
  clip: YouTubeClip | undefined;
  onMedia: (media: SceneMedia) => void;
  onYouTube: (clip: YouTubeClip) => void;
}

/** The shared media library. With onPick, choosing or uploading a file also adds it to the scene or playlist. */
export function MediaLibraryDialog({ current, only, title, onPick, scene, onClose, readOnly = false }: {
  current?: string | undefined; only?: SceneMediaKind; title?: string; onPick?: (item: LibraryItem) => void; scene?: ScenePicker; onClose: () => void; readOnly?: boolean;
}) {
  const mediaText = useTexts(MEDIA_TEXTS);
  const audioText = useTexts(AUDIO_EDIT_TEXTS);
  const yt = useTexts(YOUTUBE_TEXTS);
  const sceneText = useTexts(SCENE_MEDIA_EDIT_TEXTS);
  const [sceneFile, setSceneFile] = useState<SceneMedia | undefined>(scene?.media);
  const [youtube, setYouTube] = useState(Boolean(scene?.clip));
  const [library, setLibrary] = useState<MediaLibrary>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<AudioEdit>();
  const [added, setAdded] = useState<LibraryItem>();
  const [detailIds, setDetailIds] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<SceneMediaKind | 'all'>(only ?? 'all');
  const id = useId(); const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const load = () => roomApi('/api/host/media').then(data => setLibrary(MediaLibrarySchema.parse(data))).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('button')?.focus(); return () => previous?.focus?.(); }, []);
  const close = () => { if (!busy) onClose(); };
  const back = () => { setEdit(undefined); setSceneFile(undefined); setYouTube(false); setError(''); };
  const useItem = (item: LibraryItem) => {
    if (scene) scene.onMedia(item.id === scene.media?.id ? scene.media : { id: item.id, kind: item.kind });
    else onPick?.(item);
  };
  const editorOpen = Boolean(edit || sceneFile || youtube);
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
    const file = files?.[0];
    if (!file) return;
    setBusy(true); setError(''); setAdded(undefined);
    void uploadFile(file).then(item => {
      if (only && item.kind !== only) {
        setError(t('wrongKind'));
      } else if (onPick || scene) {
        useItem(item);
        return;
      } else {
        setAdded(item);
        setFilter(currentFilter => currentFilter === 'all' ? currentFilter : item.kind);
      }
      return load();
    }).catch(cause => setError(explain(cause))).finally(() => {
      setBusy(false);
      if (input.current) input.current.value = '';
    });
  };
  const remove = (item: LibraryItem) => {
    if (!confirm(t('removeAsk', { name: item.name }))) return;
    setBusy(true); setError(''); void roomApi(`/api/host/media/${item.id}/remove`, {}).then(load).catch(cause => setError(explain(cause))).finally(() => setBusy(false));
  };
  const shown = library?.items.filter(item => filter === 'all' || item.kind === filter) ?? [];
  return createPortal(<div className="ed-dialog-backdrop media-library-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={box} className={`ed-dialog media-library${editorOpen ? ' editing-audio' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); if (editorOpen && !busy) back(); else close(); }
    }}>
      <div className="media-dialog-head"><h2 id={`${id}-title`}>{youtube ? yt(scene?.clip ? 'edit' : 'add') : sceneFile ? sceneText(sceneFile.kind === 'image' ? 'crop' : 'cut') : edit ? audioText(edit.kind === 'youtube' ? 'fromYouTube' : 'trimTitle') : title ?? mediaText('library')}</h2>
        <button type="button" className="small-button icon-only media-dialog-close" aria-label={mediaText('close')} title={mediaText('close')} disabled={busy} onClick={close}><Icon name="close" size={16} /></button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {youtube && scene ? <YouTubeField clip={scene.clip} save={scene.onYouTube} cancel={back} />
      : sceneFile && scene ? <SceneMediaEdit key={sceneFile.id} source={sceneFile} label={library?.items.find(item => item.id === sceneFile.id)?.name ?? kindName(sceneFile.kind)} save={scene.onMedia} back={back} />
      : edit ? <AudioEditForm edit={edit} busy={busy} save={saveAudio} back={back} /> : <>
      <div className="actions media-upload">
        {!readOnly && <>
        <input ref={input} type="file" accept={only === 'audio' ? 'audio/*,.mp3,.m4a,.ogg,.wav,.flac' : LIBRARY_ACCEPT} hidden onChange={event => upload(event.target.files)} />
        <button type="button" className="primary with-icon" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" size={16} />{t(busy ? 'uploading' : 'upload')}</button>
        {scene && <button type="button" disabled={busy} onClick={() => setYouTube(true)}>{yt('add')}</button>}
        {(!only || only === 'audio') && <button type="button" disabled={busy} onClick={() => openAudio({ kind: 'youtube' })}>{audioText('fromYouTube')}</button>}
        </>}
      </div>
      {added && <p role="status" className="hint">{audioText('added', { name: added.name })}</p>}
      {library && !only && <div className="choice-tabs" role="tablist" aria-label={t('kindOfFile')}>{(['all', 'image', 'video', 'audio'] as const).map(kind =>
        <button key={kind} type="button" role="tab" aria-selected={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? t('all') : kindsName(kind)}</button>)}</div>}
      {!library && !error && <p role="status">{t('loading')}</p>}
      {library && !shown.length && <div className="media-empty">{mediaText(only === 'audio' ? 'noSongs' : 'noFiles')}</div>}
      {shown.length > 0 && <ul className="media-items">{shown.map(item => {
        const active = item.id === current;
        return <li key={item.id} className={active ? 'current' : undefined}>
          <div className="media-item-thumb">{item.kind === 'image' ? <Preview kind={item.kind} id={item.id} name={item.name} />
            : <Icon name={item.kind === 'video' ? 'play' : 'sound'} size={20} />}</div>
          <div className="media-item-info">
            <span className="media-item-name" title={item.name}>{item.name}</span>
            <span className="hint">{kindName(item.kind)} · {size(item.byteSize)}</span>
          </div>
          <div className="media-item-actions">
            {active && <span className="media-current"><Icon name="check" size={14} />{t('inThisScene')}</span>}
            {!readOnly && <>
              {(onPick || scene) && !active && <button type="button" className="small-button" disabled={busy} onClick={() => useItem(item)}>{t('useThis')}</button>}
              {scene && <button type="button" className="small-button" disabled={busy} onClick={() => setSceneFile(active && scene.media ? scene.media : { id: item.id, kind: item.kind })}>{sceneText(item.kind === 'image' ? 'crop' : 'cut')}</button>}
              {item.kind === 'audio' && <button type="button" className="small-button" disabled={busy} onClick={() => openAudio({ kind: 'trim', item })}>{audioText('trim')}</button>}
              <button type="button" className="small-button icon-only" disabled={busy} aria-label={t('removeLabel', { name: item.name })} title={t('removeTitle')} onClick={() => remove(item)}><Icon name="trash" size={16} /></button>
            </>}
          </div>
          {(item.kind !== 'image' || !readOnly || item.credit) && <details className="media-item-details" onToggle={event => {
            const open = event.currentTarget.open;
            setDetailIds(current => {
              if (current.has(item.id) === open) return current;
              const next = new Set(current);
              if (open) next.add(item.id); else next.delete(item.id);
              return next;
            });
          }}>
            <summary>{t('details')}</summary>
            {item.kind !== 'image' && detailIds.has(item.id) && <Preview kind={item.kind} id={item.id} name={item.name} />}
            {readOnly ? item.credit && <p className="hint">{item.credit}</p>
              : <label className="media-credit">{t('credit')}<input defaultValue={item.credit ?? ''} maxLength={300} placeholder={t('creditPlaceholder')} disabled={busy}
                onBlur={event => { const credit = event.target.value.trim(); if (credit !== (item.credit ?? '')) void roomApi(`/api/host/media/${item.id}`, { credit }, 'PUT').then(load).catch(cause => setError(explain(cause))); }} /></label>}
          </details>}
        </li>;
      })}</ul>}
      {library && !scene && !only && <p className="media-storage hint">{t('used', { used: size(library.usedBytes), limit: size(library.limitBytes) })}</p>}
      </>}
    </div>
  </div>, document.querySelector('.editor') ?? document.body);
}
