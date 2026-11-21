import { useState } from 'react';
import { isMinigameKey, MINIGAME_KEYS, TEAM_MINIGAMES, type MinigameKey } from '@party/contracts';
import { gameName } from '../../presentation/catalog.text.js';
import { newId } from '../api.js';
import { useRoom } from '../use-room.js';

export function TryoutControls({ sessionId, phones }: { sessionId: string; phones: number }) {
  const room = useRoom(sessionId);
  const current = room.snapshot?.view.stage?.minigame?.game;
  const [selection, setSelection] = useState<MinigameKey>();
  const picked = selection ?? current ?? MINIGAME_KEYS[0]!;
  const active = room.snapshot?.tryout && room.snapshot.view.status !== 'FINISHED' && room.connection === 'Connected';
  const connected = room.snapshot?.players.filter(player => player.connected).length ?? 0;
  const minPlayers = (game: MinigameKey) => Math.max(phones, TEAM_MINIGAMES.includes(game) ? 2 : 1);
  const canPlay = (game: MinigameKey) => active && !room.pending && !room.saving && connected >= minPlayers(game);
  const tryGame = (game: MinigameKey) => {
    if (!room.snapshot || !canPlay(game)) return;
    room.send({ formatVersion: 1, type: 'minigame.tryout', commandId: newId(), sessionId, expectedRevision: room.snapshot.view.revision, game });
    setSelection(undefined);
  };
  return <section className="bench-tryout" aria-label="Minigame Tryout">
    <label>Minigame<select value={picked} onChange={event => {
      if (isMinigameKey(event.currentTarget.value)) setSelection(event.currentTarget.value);
    }}>{MINIGAME_KEYS.map(game => <option value={game} key={game}>{gameName(game)}</option>)}</select></label>
    <button type="button" className="bench-play" disabled={!canPlay(picked)} onClick={() => tryGame(picked)}>Play selected</button>
    <button type="button" disabled={!current || !canPlay(current)} onClick={() => { if (current) tryGame(current); }}>Replay</button>
    <div className="bench-tryout-status">
      {!room.snapshot ? 'Connecting to the rehearsal…'
        : room.snapshot.view.status === 'FINISHED' ? 'This rehearsal has closed.'
        : connected < minPlayers(picked) ? `Waiting for ${minPlayers(picked) - connected} more ${minPlayers(picked) - connected === 1 ? 'player' : 'players'}…`
        : current ? `Current round: ${gameName(current)}` : 'Choose a minigame and press Play.'}
      {room.saving && <span role="status">Opening round…</span>}
    </div>
    {room.message && <p className="bench-tryout-error" role="status">{room.message}</p>}
    {room.pending && room.message && !room.saving && <div className="bench-tryout-recovery">
      <button type="button" disabled={!active} onClick={room.retry}>Retry</button>
      <button type="button" onClick={room.discard}>Clear pending action</button>
    </div>}
  </section>;
}
