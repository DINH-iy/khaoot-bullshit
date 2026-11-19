import { useState } from 'react';
import { MAX_OPEN_INVITES, REACTIONS, type RoomSnapshot } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { useTexts } from '../i18n/texts.js';
import { ROUND_CONTROL_TEXTS } from '../room/round-control.text.js';
import { ROOM_MANAGEMENT_TEXTS } from '../room/room-management.text.js';
import { HOST_TEXTS } from '../room/host.text.js';
import './room-extras.css';

type Setting = 'showScores' | 'reactions' | 'autoClose' | 'breakVotes' | 'confirmLooks';
const LABELS = { showScores: 'sShowScores', reactions: 'sReactions', autoClose: 'sAutoClose', breakVotes: 'sBreakVotes', confirmLooks: 'sConfirmLooks' } as const satisfies Record<Setting, keyof typeof HOST_TEXTS.en>;

/** Host: how the room behaves. Changes apply straight away for everyone. */
export function RoomSettings({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false); const h = useTexts(HOST_TEXTS); const management = useTexts(ROOM_MANAGEMENT_TEXTS); const rounds = useTexts(ROUND_CONTROL_TEXTS);
  const [limit, setLimit] = useState(state.settings.reactionLimit); const [volume, setVolume] = useState(state.settings.musicVolume);
  // A change shows at once and is confirmed by the server; if the server refuses, it goes back.
  const [pending, setPending] = useState<Partial<RoomSnapshot['settings']>>({});
  const shown = { ...state.settings, ...pending };
  const change = (setting: Setting | 'reactionLimit' | 'reactionChoices' | 'autoCloseSeconds' | 'breakPercent' | 'quickTimeSeconds' | 'music' | 'musicVolume' | 'keepOpen' | 'autoRevealSeconds', value: boolean | number | number[] | null) => {
    setBusy(true); setPending(previous => ({ ...previous, [setting]: value }));
    void roomApi(`/api/rooms/${sessionId}/settings`, { [setting]: value }).catch(() => onError(h('settingFailed')))
      // The room update that follows carries the saved value; until then the chosen value stays visible.
      .finally(() => { setBusy(false); setTimeout(() => setPending(previous => { const { [setting]: _done, ...rest } = previous; return rest; }), 1500); });
  };
  return <fieldset className="room-settings"><legend>{h('duringGame')}</legend>
    {(Object.keys(LABELS) as Setting[]).map(setting => <label key={setting} className="choice"><input type="checkbox" checked={shown[setting]}
      onChange={event => change(setting, event.target.checked)} />{h(LABELS[setting])}</label>)}
    {Boolean(shown.idleCloseMinutes) && <label className="choice"><input type="checkbox" checked={shown.keepOpen ?? false} disabled={busy}
      onChange={event => change('keepOpen', event.target.checked)} />{management('keepOpen')} · {shown.idleCloseMinutes} min</label>}
    <label className="choice"><input type="checkbox" checked={shown.autoRevealSeconds != null} disabled={busy}
      onChange={event => change('autoRevealSeconds', event.target.checked ? 0 : null)} />{rounds('autoReveal')}</label>
    {shown.autoRevealSeconds != null && <label className="inline-setting">{rounds('delay')}
      <input type="number" inputMode="numeric" min={0} max={120} key={shown.autoRevealSeconds} defaultValue={shown.autoRevealSeconds}
        onBlur={event => {
          const value = event.currentTarget.valueAsNumber;
          if (!Number.isInteger(value) || value < 0 || value > 120) event.currentTarget.value = String(shown.autoRevealSeconds);
          else if (value !== shown.autoRevealSeconds) change('autoRevealSeconds', value);
        }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>}
    {shown.autoClose && <label className="inline-setting">{h('waitSeconds')}
      <input type="number" inputMode="numeric" min={1} max={30} value={shown.autoCloseSeconds} onChange={event => { const value = Math.round(Number(event.target.value)); if (value >= 1 && value <= 30) change('autoCloseSeconds', value); }} /></label>}
    <label className="inline-setting">{h('quickTimeSeconds')}
      <input type="number" inputMode="numeric" min={5} max={600} step={5} value={shown.quickTimeSeconds} onChange={event => { const value = Math.round(Number(event.target.value)); if (value >= 5 && value <= 600) change('quickTimeSeconds', value); }} /></label>
    {/* Only for a game with music: it plays on the shared screen (or this screen without one). */}
    {state.view.music && <div className="music-settings">
      <label className="choice"><input type="checkbox" checked={shown.music} onChange={event => change('music', event.target.checked)} />{h('musicPlays')}</label>
      {shown.music && <label>{h('musicVolume', { volume })}
        <input type="range" min={0} max={100} step={5} value={volume} onChange={event => setVolume(Number(event.target.value))}
          onPointerUp={() => { if (volume !== state.settings.musicVolume) change('musicVolume', volume); }} onKeyUp={() => { if (volume !== state.settings.musicVolume) change('musicVolume', volume); }} /></label>}
    </div>}
    {shown.breakVotes && <label className="inline-setting">{h('mustAgree')}
      <input type="number" inputMode="numeric" min={10} max={100} step={10} value={shown.breakPercent} onChange={event => { const value = Math.round(Number(event.target.value)); if (value >= 10 && value <= 100) change('breakPercent', value); }} /></label>}
    {shown.reactions && <div className="reaction-settings">
      <label>{h('reactionsPer', { count: limit })}
        <input type="range" min={1} max={30} value={limit} disabled={busy} onChange={event => setLimit(Number(event.target.value))}
          onPointerUp={() => { if (limit !== state.settings.reactionLimit) change('reactionLimit', limit); }} onKeyUp={() => { if (limit !== state.settings.reactionLimit) change('reactionLimit', limit); }} /></label>
      <p className="field-title" id="allowed-reactions">{h('allowedReactions')}</p>
      <div className="reaction-picks" role="group" aria-labelledby="allowed-reactions">{REACTIONS.map((value, index) => {
        const on = shown.reactionChoices.includes(index); const last = on && shown.reactionChoices.length === 1;
        return <button key={value} type="button" aria-pressed={on} disabled={last} aria-label={`${value}${h(on ? 'allowed' : 'notAllowed')}`}
          onClick={() => change('reactionChoices', on ? shown.reactionChoices.filter(entry => entry !== index) : [...shown.reactionChoices, index].sort((a, b) => a - b))}>{value}</button>;
      })}</div>
    </div>}
    {!shown.showScores && <p className="hint">{h('scoresSecret')}</p>}
  </fieldset>;
}

/** One on/off switch with a line saying what it means right now. */
function Switch({ label, on, disabled = false, onToggle, hint }: { label: string; on: boolean; disabled?: boolean; onToggle: () => void; hint: string }) {
  return <div className={`side-switch${on ? ' on' : ''}${disabled ? ' disabled' : ''}`}>
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onToggle}><span className="side-switch-track" aria-hidden="true"><span /></span>{label}</button>
    <p className="hint">{hint}</p>
  </div>;
}

/**
 * The phones' extras, as two switches the host always sees (lobby and during the game). Side games
 * (slot machine, blackjack, packs, challenges) are on unless the game says otherwise; chips are an extra on
 * top, off unless the game says otherwise: without them every game is played just for fun.
 */
export function SideGamesSwitch({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const [pending, setPending] = useState<{ sideGames?: boolean; chips?: boolean; openInvites?: number }>({}); const h = useTexts(HOST_TEXTS);
  const games = pending.sideGames ?? state.settings.sideGames; const chips = pending.chips ?? state.settings.chips; const invites = pending.openInvites ?? state.settings.openInvites;
  const change = (setting: 'sideGames' | 'chips' | 'openInvites', value: boolean | number) => {
    setPending(current => ({ ...current, [setting]: value }));
    void roomApi(`/api/rooms/${sessionId}/settings`, { [setting]: value }).catch(() => onError(h('switchFailed')))
      .finally(() => setTimeout(() => setPending(current => { const { [setting]: _done, ...rest } = current; return rest; }), 1500));
  };
  return <div className="side-switches" role="group" aria-label={h('phonesWaiting')}>
    <Switch label={h('sideGames')} on={games} onToggle={() => change('sideGames', !games)}
      hint={h(games ? 'sideGamesOn' : 'sideGamesOff')} />
    <Switch label={h('chips')} on={games && chips} disabled={!games} onToggle={() => change('chips', !chips)}
      hint={h(!games ? 'chipsNeedGames' : chips ? 'chipsOn' : 'chipsOff')} />
    {games && <label className="inline-setting">{h('openInvites')}
      <input type="number" inputMode="numeric" min={1} max={MAX_OPEN_INVITES} value={invites} onChange={event => { const value = Math.round(Number(event.target.value)); if (value >= 1 && value <= MAX_OPEN_INVITES) change('openInvites', value); }} /></label>}
  </div>;
}
