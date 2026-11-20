import { useLayoutEffect, useRef } from 'react';
import type { MinigameSettings } from '@party/contracts';
import { Countdown, type ControllerProps } from '../shared/countdown.js';
import { useText } from '../../presentation/look.js';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import './reaction.css';

/**
 * Wait for GO, then tap. GO is never known in advance: it appears when the
 * server announces it, and the phone times the tap from the first frame that shows it.
 */
export function ReactionPad({ startsAt, goAt, offset, disabled, onResult }: ControllerProps<MinigameSettings<'reaction'>>) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const go = goAt !== null;
  const phase = t(go ? 'minigame.go' : 'minigame.wait');
  const cue = c(go ? 'reactionTap' : 'reactionWait');
  const shownAt = useRef<number | null>(null); const done = useRef(false);
  // The moment GO is put on screen (before any tap can be handled), not a frame later.
  useLayoutEffect(() => { if (go && shownAt.current === null) shownAt.current = performance.now(); }, [go]);
  const tap = () => {
    if (done.current || disabled) return; done.current = true;
    const reacted = go && shownAt.current !== null ? Math.round(performance.now() - shownAt.current) : null;
    // Faster than a person can react means the tap was already on its way: a false start, as in a sprint.
    if (reacted === null || reacted < 80) onResult({ value: 0, early: true });
    else onResult({ value: reacted });
  };
  return <Countdown startsAt={startsAt} offset={offset}>
    <button type="button" className={`mg-pad reaction-pad ${go ? 'go' : 'wait'}`} aria-label={`${phase} ${cue}`} disabled={disabled}
      onPointerDown={event => { if (event.isPrimary && event.button === 0) tap(); }}
      onClick={event => { if (event.detail === 0) tap(); }}
      onKeyDown={event => { if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); tap(); } }}>
      <span className="reaction-cue"><strong>{phase}</strong><small>{cue}</small></span>
    </button>
    <span className="visually-hidden" role="status">{phase} {cue}</span>
  </Countdown>;
}

