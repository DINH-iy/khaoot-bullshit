import { useState } from 'react';
import { CROP_RATIOS, MediaTrimSchema, sceneMediaUrl, type SceneMedia } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { YOUTUBE_TEXTS } from '../../../presentation/youtube.text.js';
import { StageMedia } from '../../../room/stage-media.js';
import { MEDIA_TEXTS } from './media.text.js';
import { SCENE_MEDIA_EDIT_TEXTS } from './scene-media-edit.text.js';

export function SceneMediaEdit({ source, label, save, back }: { source: SceneMedia; label: string; save: (next: SceneMedia) => void; back: () => void }) {
  const t = useTexts(SCENE_MEDIA_EDIT_TEXTS);
  const times = useTexts(YOUTUBE_TEXTS);
  const media = useTexts(MEDIA_TEXTS);
  const [ratio, setRatio] = useState<keyof typeof CROP_RATIOS | 'original'>(source.crop?.ratio ?? 'original');
  const [x, setX] = useState(source.crop?.x ?? 50);
  const [y, setY] = useState(source.crop?.y ?? 50);
  const [start, setStart] = useState(source.trim?.startSeconds.toString() ?? '');
  const [end, setEnd] = useState(source.trim?.endSeconds?.toString() ?? '');
  const [error, setError] = useState(false);
  const [showWaveform, setShowWaveform] = useState(source.waveform !== false);
  const picture = source.kind === 'image';
  const next: SceneMedia = { id: source.id, kind: source.kind };
  if (source.kind === 'audio' && !showWaveform) next.waveform = false;
  const trim = MediaTrimSchema.safeParse({ startSeconds: Number(start), ...(end === '' ? {} : { endSeconds: Number(end) }) });
  if (picture && ratio !== 'original') next.crop = { ratio, x, y };
  if (!picture && trim.success && (trim.data.startSeconds > 0 || trim.data.endSeconds !== undefined)) next.trim = trim.data;
  const apply = () => {
    if (!picture && !trim.success) { setError(true); return; }
    save(next);
  };
  return <div className="scene-media-edit">
    <div className="scene-media-edit-preview">
      <StageMedia key={picture ? source.id : JSON.stringify(next.trim)} media={{ ...next, url: sceneMediaUrl(source.id) }} role="display" displayConnected={false} label={label} preview />
    </div>
    {picture ? <>
      <label>{t('ratio')}<select value={ratio} onChange={event => setRatio(event.target.value as typeof ratio)}>
        {(['original', 'square', 'landscape', 'portrait'] as const).map(option => <option key={option} value={option}>{t(option)}</option>)}
      </select></label>
      {ratio !== 'original' && <div className="youtube-times">
        <label>{t('horizontal')}<input type="range" min={0} max={100} value={x} onChange={event => setX(Number(event.target.value))} /></label>
        <label>{t('vertical')}<input type="range" min={0} max={100} value={y} onChange={event => setY(Number(event.target.value))} /></label>
      </div>}
    </> : <>
      <div className="youtube-times">
        <label>{times('start')}<input type="number" min={0} max={86400} step={0.1} value={start} onChange={event => { setStart(event.target.value); setError(false); }} /></label>
        <label>{times('end')}<input type="number" min={0} max={86400} step={0.1} value={end} onChange={event => { setEnd(event.target.value); setError(false); }} /></label>
      </div>
      <p className="hint">{t('clipHelp')}</p>
      {error && <p role="alert" className="error">{t('badTimes')}</p>}
    </>}
    {source.kind === 'audio' && <label className="choice"><input type="checkbox" checked={showWaveform} onChange={event => setShowWaveform(event.target.checked)} />{t('waveform')}</label>}
    <div className="actions">
      <button type="button" onClick={back}>{t('back')}</button>
      <button type="button" className="primary" onClick={apply}>{media('useThis')}</button>
    </div>
  </div>;
}
