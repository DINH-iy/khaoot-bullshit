import { useEffect, useState } from 'react';
import { GRAPH_REVEAL_MS, graphPlaybackPosition, type GraphPlayback, type GraphPlaybackAction } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { GRAPH_TEXTS } from './graph.text.js';

export function GraphReplayControls({ playback, offset, disabled, onAction }: {
  playback: GraphPlayback; offset: number; disabled: boolean; onAction: (action: GraphPlaybackAction) => void;
}) {
  const t = useTexts(GRAPH_TEXTS);
  const [finishedRun, setFinishedRun] = useState<string>();
  const { playingSince, positionMs } = playback;
  useEffect(() => {
    if (!playingSince) return;
    const remaining = GRAPH_REVEAL_MS - graphPlaybackPosition({ positionMs, playingSince }, Date.now() + offset);
    const timer = window.setTimeout(() => setFinishedRun(playingSince), remaining);
    return () => window.clearTimeout(timer);
  }, [offset, playingSince, positionMs]);

  const finished = positionMs === GRAPH_REVEAL_MS || Boolean(playingSince && playingSince === finishedRun);
  const paused = playingSince === null && !finished;
  return <div className="graph-replay-controls" role="group" aria-label={t('playback')}>
    <button type="button" className="ghost" disabled={disabled} onClick={() => onAction('replay')}>{t('replay')}</button>
    <button type="button" className="ghost" disabled={disabled || finished} onClick={() => onAction(paused ? 'resume' : 'pause')}>
      {t(paused ? 'resume' : 'pause')}
    </button>
    <button type="button" className="ghost" disabled={disabled || finished} onClick={() => onAction('finish')}>{t('finish')}</button>
  </div>;
}
