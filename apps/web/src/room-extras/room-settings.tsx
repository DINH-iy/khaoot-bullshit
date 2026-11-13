import { useState } from 'react';
import { REACTIONS, type RoomSnapshot } from '@party/contracts';
import { roomApi } from '../network/api.js';
import './room-extras.css';

type Setting = 'showScores' | 'reactions' | 'autoClose';
const LABELS: Record<Setting, string> = {
  showScores: 'Players see the scores during the game',
  reactions: 'Players can send reactions to the screen',
  autoClose: 'End a round 3 seconds after everyone answered',
};

/** Host: how the room behaves. Changes apply straight away for everyone. */
export function RoomSettings({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(state.settings.reactionLimit);
  const change = (setting: Setting | 'reactionLimit' | 'reactionChoices', value: boolean | number | number[]) => {
    setBusy(true);
    void roomApi(`/api/rooms/${sessionId}/settings`, { [setting]: value }).catch(() => onError('The setting could not be changed. Try again.')).finally(() => setBusy(false));
  };
  return <fieldset className="room-settings"><legend>Room settings</legend>
    {(Object.keys(LABELS) as Setting[]).map(setting => <label key={setting} className="choice"><input type="checkbox" checked={state.settings[setting]} disabled={busy}
      onChange={event => change(setting, event.target.checked)} />{LABELS[setting]}</label>)}
    {state.settings.reactions && <div className="reaction-settings">
      <label>Reactions per player · {limit} every 10 seconds
        <input type="range" min={1} max={30} value={limit} disabled={busy} onChange={event => setLimit(Number(event.target.value))}
          onPointerUp={() => { if (limit !== state.settings.reactionLimit) change('reactionLimit', limit); }} onKeyUp={() => { if (limit !== state.settings.reactionLimit) change('reactionLimit', limit); }} /></label>
      <p className="field-title" id="allowed-reactions">Allowed reactions</p>
      <div className="reaction-picks" role="group" aria-labelledby="allowed-reactions">{REACTIONS.map((value, index) => {
        const on = state.settings.reactionChoices.includes(index); const last = on && state.settings.reactionChoices.length === 1;
        return <button key={value} type="button" aria-pressed={on} disabled={busy || last} aria-label={`${value}${on ? ', allowed' : ', not allowed'}`}
          onClick={() => change('reactionChoices', on ? state.settings.reactionChoices.filter(entry => entry !== index) : [...state.settings.reactionChoices, index].sort((a, b) => a - b))}>{value}</button>;
      })}</div>
    </div>}
    {!state.settings.showScores && <p className="hint">Scores stay secret on phones and the shared screen until a scoreboard scene or the end of the game.</p>}
  </fieldset>;
}
