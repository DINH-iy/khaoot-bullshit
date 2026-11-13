import { useState } from 'react';
import { REACTIONS, type RoomSnapshot } from '@party/contracts';
import { roomApi } from '../network/api.js';
import './room-extras.css';

type Setting = 'showScores' | 'reactions' | 'autoClose' | 'breakVotes';
const LABELS: Record<Setting, string> = {
  showScores: 'Players see the scores during the game',
  reactions: 'Players can send reactions to the screen',
  autoClose: 'End a round soon after everyone answered',
  breakVotes: 'Players can vote for a break',
};

/** Host: how the room behaves. Changes apply straight away for everyone. */
export function RoomSettings({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(state.settings.reactionLimit);
  // A change shows at once and is confirmed by the server; if the server refuses, it goes back.
  const [pending, setPending] = useState<Partial<RoomSnapshot['settings']>>({});
  const shown = { ...state.settings, ...pending };
  const change = (setting: Setting | 'reactionLimit' | 'reactionChoices' | 'autoCloseSeconds' | 'breakPercent', value: boolean | number | number[]) => {
    setBusy(true); setPending(previous => ({ ...previous, [setting]: value }));
    void roomApi(`/api/rooms/${sessionId}/settings`, { [setting]: value }).catch(() => onError('The setting could not be changed. Try again.'))
      // The room update that follows carries the saved value; until then the chosen value stays visible.
      .finally(() => { setBusy(false); setTimeout(() => setPending(previous => { const { [setting]: _done, ...rest } = previous; return rest; }), 1500); });
  };
  return <fieldset className="room-settings"><legend>Room settings</legend>
    {(Object.keys(LABELS) as Setting[]).map(setting => <label key={setting} className="choice"><input type="checkbox" checked={shown[setting]}
      onChange={event => change(setting, event.target.checked)} />{LABELS[setting]}</label>)}
    {shown.autoClose && <label className="inline-setting">Seconds to wait after the last answer
      <input type="number" inputMode="numeric" min={1} max={30} value={shown.autoCloseSeconds} onChange={event => { const value = Math.round(Number(event.target.value)); if (value >= 1 && value <= 30) change('autoCloseSeconds', value); }} /></label>}
    {shown.breakVotes && <label className="inline-setting">Players who must agree (%)
      <input type="number" inputMode="numeric" min={10} max={100} step={10} value={shown.breakPercent} onChange={event => { const value = Math.round(Number(event.target.value)); if (value >= 10 && value <= 100) change('breakPercent', value); }} /></label>}
    {shown.reactions && <div className="reaction-settings">
      <label>Reactions per player · {limit} every 10 seconds
        <input type="range" min={1} max={30} value={limit} disabled={busy} onChange={event => setLimit(Number(event.target.value))}
          onPointerUp={() => { if (limit !== state.settings.reactionLimit) change('reactionLimit', limit); }} onKeyUp={() => { if (limit !== state.settings.reactionLimit) change('reactionLimit', limit); }} /></label>
      <p className="field-title" id="allowed-reactions">Allowed reactions</p>
      <div className="reaction-picks" role="group" aria-labelledby="allowed-reactions">{REACTIONS.map((value, index) => {
        const on = shown.reactionChoices.includes(index); const last = on && shown.reactionChoices.length === 1;
        return <button key={value} type="button" aria-pressed={on} disabled={last} aria-label={`${value}${on ? ', allowed' : ', not allowed'}`}
          onClick={() => change('reactionChoices', on ? shown.reactionChoices.filter(entry => entry !== index) : [...shown.reactionChoices, index].sort((a, b) => a - b))}>{value}</button>;
      })}</div>
    </div>}
    {!shown.showScores && <p className="hint">Scores stay secret on phones and the shared screen until a scoreboard scene or the end of the game.</p>}
  </fieldset>;
}
