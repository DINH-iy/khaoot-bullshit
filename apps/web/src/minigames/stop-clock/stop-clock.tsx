import { useRef } from 'react';
import type { MinigameSettings } from '@party/contracts';
import { Countdown, type ControllerProps } from '../shared/countdown.js';
import { useText } from '../../presentation/look.js';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import { useServerNow } from '../shared/clock.js';
import './stop-clock.css';

/** A clock counts up from the start and vanishes; stop it at the target. */
export function StopClock({ settings, startsAt, offset, disabled, onResult }: ControllerProps<MinigameSettings<'stop-clock'>>) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const now = useServerNow(offset, true); const sent = useRef(false);
  const elapsed = Math.max(0, now - Date.parse(startsAt)); const visible = elapsed < settings.visibleMs;
  const stop = () => { if (sent.current || disabled) return; sent.current = true; onResult({ value: Math.round(Date.now() + offset - Date.parse(startsAt)) }); };
  return <Countdown startsAt={startsAt} offset={offset}>
    <p className="mg-sub">{c('target')} <strong>{(settings.targetMs / 1000).toFixed(2)} s</strong></p>
    <p className="mg-big mg-clock" aria-live="off">{visible ? (elapsed / 1000).toFixed(2) : '??.??'}</p>
    <button type="button" className="mg-pad stop" onClick={stop}>{t('minigame.stop')}</button>
  </Countdown>;
}

