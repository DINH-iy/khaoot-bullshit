import { useRef, useState } from 'react';
import { ImportYouTubeAudioSchema, MAX_AUDIO_CLIP_SECONDS, TrimAudioSchema, sceneMediaUrl, type LibraryItem } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { AUDIO_EDIT_TEXTS } from './audio-edit.text.js';

export type AudioEdit = { kind: 'youtube' } | { kind: 'trim'; item: LibraryItem };

export function AudioEditForm({ edit, busy, save, back }: {
  edit: AudioEdit;
  busy: boolean;
  save: (path: string, body: object) => void;
  back: () => void;
}) {
  const t = useTexts(AUDIO_EDIT_TEXTS);
  const item = edit.kind === 'trim' ? edit.item : undefined;
  const [name, setName] = useState(item ? `${item.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 115)} clip` : '');
  const [link, setLink] = useState('');
  const [permission, setPermission] = useState(false);
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [duration, setDuration] = useState<number>();
  const [previewing, setPreviewing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const player = useRef<HTMLAudioElement>(null);
  const importing = ImportYouTubeAudioSchema.safeParse({ url: link, name, permission });
  const trimming = TrimAudioSchema.safeParse({ start: start === '' ? NaN : Number(start), end: Number(end), name });
  const canTrim = trimming.success && duration !== undefined && trimming.data.end <= duration;
  const stopPreview = () => { player.current?.pause(); setPreviewing(false); };
  const preview = () => {
    const audio = player.current;
    if (previewing) { stopPreview(); return; }
    if (!audio || !trimming.success) return;
    setPreviewFailed(false);
    audio.currentTime = trimming.data.start;
    setPreviewing(true);
    void audio.play().catch(() => { setPreviewFailed(true); stopPreview(); });
  };

  return <form className="media-audio-form" onSubmit={event => {
    event.preventDefault();
    if (item && canTrim) {
      stopPreview();
      save(`/api/host/media/${item.id}/trim`, trimming.data);
    } else if (!item && importing.success) save('/api/host/media/youtube', importing.data);
  }}>
    <p className="hint">{t(item ? 'trimHelp' : 'importHelp')}</p>
    {!item && <label>{t('url')}<input autoFocus type="url" maxLength={2048} value={link} onChange={event => setLink(event.target.value)} disabled={busy} required /></label>}
    {item && <audio ref={player} className="media-preview audio" controls src={sceneMediaUrl(item.id)} preload="metadata" aria-label={item.name}
      onLoadedMetadata={event => {
        const seconds = Math.floor(event.currentTarget.duration * 1000) / 1000;
        if (Number.isFinite(seconds)) { setDuration(seconds); setEnd(String(Math.min(seconds, MAX_AUDIO_CLIP_SECONDS))); }
      }} onTimeUpdate={event => { if (previewing && event.currentTarget.currentTime >= Number(end)) stopPreview(); }}
      onPause={() => setPreviewing(false)} onEnded={() => setPreviewing(false)} onError={() => setPreviewFailed(true)} />}
    <label>{t('name')}<input autoFocus={Boolean(item)} value={name} maxLength={120} onChange={event => setName(event.target.value)} disabled={busy} required /></label>
    {item ? <>
      <div className="media-trim-times">
        <label>{t('start')}<input type="number" step="0.001" min="0" max={duration} value={start} onChange={event => { stopPreview(); setStart(event.target.value); }} disabled={busy} required /></label>
        <label>{t('end')}<input type="number" step="0.001" min="0.1" max={duration} value={end} onChange={event => { stopPreview(); setEnd(event.target.value); }} disabled={busy} required /></label>
      </div>
      <button type="button" className="small-button" disabled={!canTrim || busy} onClick={preview}>{t(previewing ? 'stop' : 'play')}</button>
      {previewFailed && <p role="alert" className="error">{t('trimFailed')}</p>}
    </> : <label className="media-permission"><input type="checkbox" checked={permission} onChange={event => setPermission(event.target.checked)} disabled={busy} />{t('permission')}</label>}
    <div className="actions">
      <button type="button" disabled={busy} onClick={back}>{t('back')}</button>
      <button type="submit" className="primary" disabled={busy || !(item ? canTrim : importing.success)}>{t(item ? (busy ? 'saving' : 'save') : (busy ? 'importing' : 'import'))}</button>
    </div>
  </form>;
}
