import { useEffect, useRef } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { playCue } from './sounds.js';

/**
 * The shared screen's short cues (on the host's screen without one), when the room allows them: a tick for each
 * of a round's last five seconds, a gong when it closes, a chime at the reveal (brighter when there is a right
 * answer), and a fanfare when the game ends. Each plays once; nothing plays while the room is paused.
 */
export function EventSounds({ state, offset }: { state: RoomSnapshot; offset: number }) {
  const stage = state.view.stage; const on = state.settings.eventSounds !== false;
  const seen = useRef<{ stage?: string | undefined; status?: string | undefined; revealed?: boolean; game?: string | undefined; ticked: Set<string> }>({ ticked: new Set() });
  // Round end, reveal and winner: when the state changes, not when a screen first loads it.
  useEffect(() => {
    const before = seen.current; const status = state.view.status;
    if (on && before.stage === stage?.id) {
      if (before.status === 'ACTIVE' && stage?.status === 'CLOSED') playCue('end');
      if (before.revealed === false && stage?.revealed) playCue(stage.reveal?.answer?.kind === 'choice' && stage.reveal.answer.correctChoiceKey ? 'correct' : 'reveal');
    }
    if (on && before.game !== undefined && before.game !== 'FINISHED' && status === 'FINISHED') playCue('winner');
    seen.current = { ...before, stage: stage?.id, status: stage?.status, revealed: stage?.revealed ?? false, game: status };
  }, [on, stage?.id, stage?.status, stage?.revealed, state.view.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // The last five seconds of a running round.
  useEffect(() => {
    if (!on || !stage?.deadlineAt || stage.status !== 'ACTIVE' || state.view.status !== 'RUNNING') return;
    const deadline = Date.parse(stage.deadlineAt);
    const timer = setInterval(() => {
      const left = Math.ceil((deadline - (Date.now() + offset)) / 1000);
      const key = `${stage.id}:${left}`;
      if (left >= 1 && left <= 5 && !seen.current.ticked.has(key)) { seen.current.ticked.add(key); playCue('tick'); }
    }, 200);
    return () => clearInterval(timer);
  }, [on, stage?.id, stage?.deadlineAt, stage?.status, state.view.status, offset]);
  return null;
}
