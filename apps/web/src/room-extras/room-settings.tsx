import { useState } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { roomApi } from '../network/api.js';

type Setting = 'showScores' | 'reactions' | 'autoClose';
const LABELS: Record<Setting, string> = {
  showScores: 'Players see the scores during the game',
  reactions: 'Players can send reactions to the screen',
  autoClose: 'End a round 3 seconds after everyone answered',
};

/** Host: how the room behaves. Changes apply straight away for everyone. */
export function RoomSettings({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const change = (setting: Setting, value: boolean) => {
    setBusy(true);
    void roomApi(`/api/rooms/${sessionId}/settings`, { [setting]: value }).catch(() => onError('The setting could not be changed. Try again.')).finally(() => setBusy(false));
  };
  return <fieldset className="room-settings"><legend>Room settings</legend>
    {(Object.keys(LABELS) as Setting[]).map(setting => <label key={setting} className="choice"><input type="checkbox" checked={state.settings[setting]} disabled={busy}
      onChange={event => change(setting, event.target.checked)} />{LABELS[setting]}</label>)}
    {!state.settings.showScores && <p className="hint">Scores stay secret on phones and the shared screen until a scoreboard scene or the end of the game.</p>}
  </fieldset>;
}
