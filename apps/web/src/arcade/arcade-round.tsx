import { useEffect, useState } from 'react';
import type { ArcadeAction, RoomSnapshot } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { navigate } from '../navigation.js';
import { Popover } from '../room/room-chrome.js';
import { FaIcon, type IconName } from '../presentation/icons.js';
import { arcadeProblem } from './arcade-text.js';
import './arcade.css';

// An arcade round has no host: the lobby's leader runs it while playing along. The leader gets one big button
// only when the round waits for them; the occasional tools (shuffle, end now, stop) sit in a menu in the round bar.

const HERE_MS = 15_000;
const NEXT_ICON: Partial<Record<ArcadeAction, IconName>> = { begin: 'play', resume: 'play', 'confirm-teams': 'check', start: 'play', reveal: 'trophy', end: 'arrow-rotate-left' };

/** Keeps this phone's member present in the lobby, and brings everyone back to the lobby when the round ends. */
export function useArcadeRound(state: RoomSnapshot | undefined) {
  const lobbyId = state?.arcade?.lobbyId; const finished = state?.view.status === 'FINISHED';
  useEffect(() => {
    if (!lobbyId) return;
    const here = () => { void roomApi(`/api/arcade/lobbies/${lobbyId}/here`, {}).catch(() => {}); };
    here(); const timer = setInterval(here, HERE_MS); return () => clearInterval(timer);
  }, [lobbyId]);
  useEffect(() => { if (lobbyId && finished) navigate(`/?arcade=${lobbyId}`, { replace: true }); }, [lobbyId, finished]);
}

/** Sends one of the leader's steps; shared by the big button and the menu. */
function useLeaderStep(state: RoomSnapshot) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const act = (action: ArcadeAction) => {
    setBusy(true); setError('');
    void roomApi(`/api/arcade/rounds/${state.view.sessionId}/act`, { action, stageRunId: action === 'begin' || action === 'resume' || action === 'end' ? null : state.view.stage?.id ?? null })
      .catch(cause => setError(arcadeProblem(cause))).finally(() => setBusy(false));
  };
  return { act, busy, error };
}

/** The step the round is waiting on the leader for, if any. While everyone plays there is none. */
function waitingStep(state: RoomSnapshot): { action: ArcadeAction; label: string; blocked?: boolean } | null {
  const stage = state.view.stage;
  if (state.view.status === 'LOBBY') return { action: 'begin', label: 'Start the round' };
  if (state.view.status === 'PAUSED') return { action: 'resume', label: 'Continue' };
  if (!stage || state.view.status !== 'RUNNING') return null;
  if (stage.teams?.forming) return { action: 'confirm-teams', label: 'Start round', blocked: stage.teams.teams.every(team => team.memberIds.length === 0) };
  if (stage.status === 'ACTIVE' && stage.explain) return { action: 'start', label: `Start (${stage.explain.readyIds.length} of ${state.players.length} ready)` };
  if (stage.status === 'CLOSED' && !stage.revealed) return { action: 'reveal', label: 'Show the results' };
  if (stage.revealed) return { action: 'end', label: 'Back to the lobby' };
  return null;
}

/** Above the round: the leader's one big button when the round waits for them; for the others, a way back after the results. */
export function ArcadeLeaderNext({ state, disabled }: { state: RoomSnapshot; disabled: boolean }) {
  const { act, busy, error } = useLeaderStep(state);
  const arcade = state.arcade!; const stage = state.view.stage;
  if (state.view.status === 'FINISHED') return <p role="status" className="arcade-round">Back to the lobby…</p>;
  if (!arcade.leader) return stage?.revealed ? <p className="arcade-round wait-note">Waiting for the leader to go back to the lobby… <button type="button" className="ghost" onClick={() => navigate(`/?arcade=${arcade.lobbyId}`, { replace: true })}>Go now</button></p> : null;
  const next = waitingStep(state);
  if (!next && !error) return null;
  return <div className="arcade-round" role="group" aria-label="Leader">
    {error && <p role="alert" className="error">{error}</p>}
    {next && <button type="button" className="primary arcade-next" disabled={disabled || busy || next.blocked} onClick={() => act(next.action)}>
      {NEXT_ICON[next.action] && <FaIcon name={NEXT_ICON[next.action]!} />}{next.label}</button>}
  </div>;
}

/** The leader's menu in the round bar (next to the ⓘ): the tools needed now and then. */
export function ArcadeLeaderMenu({ state, disabled }: { state: RoomSnapshot; disabled: boolean }) {
  const { act, busy, error } = useLeaderStep(state); const [stopping, setStopping] = useState(false);
  const stage = state.view.stage; const off = disabled || busy;
  const playing = state.view.status === 'RUNNING' && stage?.status === 'ACTIVE' && !stage.teams?.forming && !stage.explain;
  return <Popover label="Leader tools" icon="bars" className="round-tools" closeOnAction>
    <p className="arcade-round-label"><FaIcon name="star" /> You lead this round</p>
    {error && <p role="alert" className="error">{error}</p>}
    {stage?.teams?.forming && stage.teams.formation === 'random' && <button type="button" disabled={off} onClick={() => act('shuffle-teams')}><FaIcon name="rotate" /> Shuffle the teams</button>}
    {playing && <button type="button" disabled={off} onClick={() => act('close')}><FaIcon name="stopwatch" /> End now and count the results</button>}
    {!stopping ? <button type="button" className="ghost" data-keep-open disabled={off} onClick={() => setStopping(true)}><FaIcon name="xmark" /> Stop the round</button>
      // Stopping asks first: one tap too many must not end everyone's round.
      : <div className="arcade-round-confirm" role="group" aria-label="Stop the round"><p>Stop this round for everyone and go back to the lobby?</p>
        <div className="actions"><button type="button" className="danger" disabled={off} onClick={() => { setStopping(false); act('end'); }}>Yes, stop</button><button type="button" className="ghost" data-keep-open onClick={() => setStopping(false)}>Keep playing</button></div></div>}
  </Popover>;
}
