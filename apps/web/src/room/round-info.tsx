import type { RefObject } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { StageTimer } from './stage-timer.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
const PLAY_TEXT: Record<NonNullable<Stage['teams']>['answers'], string> = { everyone: 'Team round · everyone answers', captain: 'Team round · captains answer' };

/**
 * What everyone needs to know about the round, in one slim strip under the top bar:
 * what to do now, the time, and whether it is a team round. Small chips instead
 * of big text, so "No time limit" never takes over the screen.
 */
export function RoundInfo({ stage, phase, remaining, timerRef }: { stage: Stage; phase: string | null; remaining: number | null; timerRef: RefObject<HTMLDivElement | null> }) {
  const forming = Boolean(stage.teams?.forming);
  const teamText = stage.teams && !forming ? PLAY_TEXT[stage.teams.answers] : null;
  if (!phase && !teamText && (forming || stage.status !== 'ACTIVE')) return null;
  return <div className="round-info" role="group" aria-label="This round">
    {phase && <p className={`chip phase-pill${forming ? ' teams' : ''}`} role="status">{phase}</p>}
    {teamText && <p className="chip">{teamText}</p>}
    {stage.input?.kind === 'drawing' && stage.input.blind && <p className="chip chip-warn"><span aria-hidden="true">🙈</span> Blind round</p>}
    {!forming && <div ref={timerRef} className={`chip chip-timer${remaining === null ? ' no-limit' : ''}`}><StageTimer stage={stage} remaining={remaining} /></div>}
  </div>;
}
