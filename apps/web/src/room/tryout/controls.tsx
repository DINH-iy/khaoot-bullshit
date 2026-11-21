import { useState } from 'react';
import { DEFAULT_POOL_START, POOL_MATCH_MAX_SECONDS, PoolMatchSecondsSchema, TEAM_MINIGAMES, MINIGAME_KEYS, TRYOUT_GAME_KEYS, type PoolBallBehavior, type PoolStart, type TryoutGame } from '@party/contracts';
import { gameName } from '../../presentation/catalog.text.js';
import { newId } from '../api.js';
import { useRoom } from '../use-room.js';
import { PoolBehaviorFields } from '../../head-to-head/eight-ball/behavior-fields.js';
import { PoolStartFields } from '../../head-to-head/eight-ball/start-fields.js';

export function TryoutControls({ sessionId, phones }: { sessionId: string; phones: number }) {
  const room = useRoom(sessionId);
  const stage = room.snapshot?.view.stage;
  const current = stage?.duel?.contest.kind === 'game' && stage.duel.contest.game === 'eight-ball' ? 'eight-ball' : stage?.minigame?.game;
  const [selection, setSelection] = useState<TryoutGame>();
  const [poolClock, setPoolClock] = useState('');
  const [poolBehavior, setPoolBehavior] = useState<PoolBallBehavior>({ preset: 'arcade' });
  const [poolStart, setPoolStart] = useState<PoolStart>(DEFAULT_POOL_START);
  const seconds = PoolMatchSecondsSchema.safeParse(Number(poolClock));
  const picked = selection ?? current ?? TRYOUT_GAME_KEYS[0]!;
  const active = room.snapshot?.tryout && room.snapshot.view.status !== 'FINISHED' && room.connection === 'Connected';
  const available = room.snapshot?.players.filter(player => player.connected) ?? [];
  const connected = available.length;
  const minPlayers = (game: TryoutGame) => Math.max(phones, TEAM_MINIGAMES.some(teamGame => teamGame === game) ? 2 : 1);
  const canPlay = (game: TryoutGame, freePlay = false) => active && !room.pending && !room.saving && connected >= (freePlay ? 1 : minPlayers(game)) &&
    (game !== 'eight-ball' || freePlay || !poolClock || seconds.success);
  const defaultFreePlay = picked === 'eight-ball' && phones === 1;
  const replayFreePlay = current === 'eight-ball' && (Boolean(stage?.duel?.practicePlayerId) || phones === 1);
  const tryGame = (game: TryoutGame, freePlay = false) => {
    if (!room.snapshot || !canPlay(game, freePlay)) return;
    const poolPlayers: [string] | [string, string] | undefined = game !== 'eight-ball' ? undefined
      : freePlay ? [available[0]!.id] : [available[0]!.id, available[1]!.id];
    room.send({ formatVersion: 1, type: 'minigame.tryout', commandId: newId(), sessionId, expectedRevision: room.snapshot.view.revision, game,
      ...(poolPlayers ? { poolPlayers, poolBallBehavior: poolBehavior, poolStart } : {}),
      ...(game === 'eight-ball' && !freePlay && seconds.success ? { poolSeconds: seconds.data } : {}) });
    setSelection(undefined);
  };
  return <section className="bench-tryout" aria-label="Minigame Tryout">
    <label>Minigame<select value={picked} onChange={event => {
      const value = event.currentTarget.value;
      setSelection(TRYOUT_GAME_KEYS.find(game => game === value));
    }}>
      <optgroup label="Minigames">{MINIGAME_KEYS.map(game => <option value={game} key={game}>{gameName(game)}</option>)}</optgroup>
      <optgroup label="Head-to-head"><option value="eight-ball">{gameName('eight-ball')}</option></optgroup>
    </select></label>
    {picked === 'eight-ball' && !defaultFreePlay && <label>Match time (seconds)<input type="number" min={1} max={POOL_MATCH_MAX_SECONDS}
      placeholder="Unlimited" value={poolClock} onChange={event => setPoolClock(event.currentTarget.value)} /></label>}
    {picked === 'eight-ball' && <PoolBehaviorFields value={poolBehavior} onChange={setPoolBehavior} />}
    {picked === 'eight-ball' && <PoolStartFields value={poolStart} onChange={setPoolStart} />}
    <button type="button" className="bench-play" disabled={!canPlay(picked, defaultFreePlay)} onClick={() => tryGame(picked, defaultFreePlay)}>{defaultFreePlay ? 'Free play' : 'Play selected'}</button>
    {picked === 'eight-ball' && !defaultFreePlay && <button type="button" disabled={!canPlay(picked, true)} onClick={() => tryGame(picked, true)}>Free play</button>}
    <button type="button" disabled={!current || !canPlay(current, replayFreePlay)} onClick={() => { if (current) tryGame(current, replayFreePlay); }}>Replay</button>
    <div className="bench-tryout-status">
      {!room.snapshot ? 'Connecting to the rehearsal…'
        : room.snapshot.view.status === 'FINISHED' ? 'This rehearsal has closed.'
        : connected < minPlayers(picked) ? `Waiting for ${minPlayers(picked) - connected} more ${minPlayers(picked) - connected === 1 ? 'player' : 'players'}…`
        : current ? `Current round: ${gameName(current)}` : 'Choose a minigame and press Play.'}
      {current === 'eight-ball' && stage?.duel?.practicePlayerId && <span> · Free play</span>}
      {room.saving && <span role="status">Opening round…</span>}
    </div>
    {room.message && <p className="bench-tryout-error" role="status">{room.message}</p>}
    {room.pending && room.message && !room.saving && <div className="bench-tryout-recovery">
      <button type="button" disabled={!active} onClick={room.retry}>Retry</button>
      <button type="button" onClick={room.discard}>Clear pending action</button>
    </div>}
  </section>;
}
