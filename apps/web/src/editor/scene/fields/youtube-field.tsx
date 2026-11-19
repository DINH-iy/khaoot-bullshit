import { useState } from 'react';
import { YouTubeClipSchema, youtubeVideoId, youtubeWatchUrl, type YouTubeClip } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { YOUTUBE_TEXTS } from '../../../presentation/youtube.text.js';

export function YouTubeField({ clip, save, cancel }: { clip: YouTubeClip | undefined; save: (clip: YouTubeClip) => void; cancel: () => void }) {
  const t = useTexts(YOUTUBE_TEXTS);
  const [link, setLink] = useState(clip ? youtubeWatchUrl(clip.videoId) : '');
  const [start, setStart] = useState(clip?.startSeconds?.toString() ?? '');
  const [end, setEnd] = useState(clip?.endSeconds?.toString() ?? '');
  const [error, setError] = useState<'invalidLink' | 'invalidTimes'>();
  const apply = () => {
    const videoId = youtubeVideoId(link);
    if (!videoId) { setError('invalidLink'); return; }
    const result = YouTubeClipSchema.safeParse({
      videoId,
      ...(start !== '' ? { startSeconds: Number(start) } : {}),
      ...(end !== '' ? { endSeconds: Number(end) } : {}),
    });
    if (!result.success) { setError('invalidTimes'); return; }
    save(result.data);
  };
  return <div className="youtube-fields" onKeyDown={event => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); apply(); }
    if (event.key === 'Escape') { event.stopPropagation(); cancel(); }
  }}>
    <label>{t('link')}<input type="url" maxLength={512} value={link} autoFocus onChange={event => setLink(event.target.value)} /></label>
    <div className="youtube-times">
      <label>{t('start')}<input type="number" min={0} max={86400} step={1} value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>{t('end')}<input type="number" min={0} max={86400} step={1} value={end} onChange={event => setEnd(event.target.value)} /></label>
    </div>
    <p className="hint">{t('optional')}</p>
    {error && <p role="alert" className="error">{t(error)}</p>}
    <div className="actions">
      <button type="button" className="primary" onClick={apply}>{t('use')}</button>
      <button type="button" onClick={cancel}>{t('cancel')}</button>
    </div>
  </div>;
}
