import type { ReactNode } from 'react';
import {
  ARCADE_SECONDS_MAX, ARCADE_SECONDS_MIN, DOT_COUNT_MAX, DOT_VIEW_MAX_SECONDS, DOT_VIEW_MIN_SECONDS, POOL_FELTS, POOL_SHOT_SECONDS, ROULETTE_BET_FLOOR, arcadeSettings,
  isHeadToHeadKey, type ArcadeGame, type ArcadeGameSettings,
} from '@party/contracts';
import { FaIcon } from '../presentation/icons.js';
import { POOL_FELT_COLORS } from '../head-to-head/eight-ball/table.js';

// A game's own settings in the arcade: the main ones of each game (as an author sets them on a scene), in phone-sized
// controls. The leader changes them; everyone else sees them read-only. The server checks them again.

type Values = Record<string, unknown>;
type Change = (next: ArcadeGameSettings) => void;

/** Whether this game has anything to set (every minigame has at least its round time). */
export const hasArcadeSettings = (game: ArcadeGame) => !(game === 'tictactoe' || game === 'chess');

/** The chosen settings that differ from the standard ones, in a few words for the card ("30 s · first to 3"). */
export function arcadeSettingsSummary(game: ArcadeGame, chosen: ArcadeGameSettings | undefined): string {
  if (!chosen || (chosen.seconds === undefined && !Object.keys(chosen.values ?? {}).length)) return '';
  const now = arcadeSettings(game, chosen); if (!now) return '';
  return [now.seconds !== null && chosen.seconds !== undefined ? `${now.seconds} s` : '', Object.keys(chosen.values ?? {}).length ? 'own settings' : ''].filter(Boolean).join(' · ');
}

/** − value + for a number; the value and its unit sit between the buttons. */
function Stepper({ label, value, min, max, step = 1, unit = '', disabled, onChange, format }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled: boolean; onChange: (value: number) => void; format?: (value: number) => string;
}) {
  const shown = format ? format(value) : String(value);
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)));
  return <div className="arcade-stepper" role="group" aria-label={label}>
    <span className="arcade-stepper-label">{label}</span>
    <button type="button" aria-label={`Less ${label.toLowerCase()}`} disabled={disabled || value <= min} onClick={() => set(value - step)}><FaIcon name="minus" /></button>
    <output aria-live="polite">{shown}{unit && ` ${unit}`}</output>
    <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={disabled || value >= max} onClick={() => set(value + step)}><FaIcon name="plus" /></button>
  </div>;
}

/** A short choice of a few named options, one lit. */
function Choice<T extends string | number>({ label, value, options, disabled, onChange }: { label: string; value: T; options: { value: T; text: ReactNode; name?: string }[]; disabled: boolean; onChange: (value: T) => void }) {
  return <div className="arcade-segment-row"><span className="arcade-segment-label" aria-hidden="true">{label}</span>
    <div className="arcade-segments" role="group" aria-label={label}>{options.map(option =>
      <button key={String(option.value)} type="button" aria-pressed={option.value === value} aria-label={option.name} disabled={disabled} onClick={() => onChange(option.value)}>{option.text}</button>)}</div></div>;
}

const seconds = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
const points = (milli: unknown) => Math.round(Number(milli ?? 0) / 1000);

/**
 * The settings of one game. `chosen` is what the leader picked (left out: the standard settings); every change hands
 * the whole new choice to `onChange`. `disabled` for everyone but the leader.
 */
export function ArcadeGameSettingsFields({ game, chosen, disabled, onChange }: { game: ArcadeGame; chosen: ArcadeGameSettings | undefined; disabled: boolean; onChange: Change }) {
  const now = arcadeSettings(game, chosen) ?? arcadeSettings(game)!;
  const values = now.values as Values;
  const own = chosen?.values ?? {};
  // A setting set to undefined goes back to the standard one (a random target, no fixed dot count).
  const setValues = (patch: Values) => onChange({ ...chosen, values: Object.fromEntries(Object.entries({ ...own, ...patch }).filter(([, value]) => value !== undefined)) as ArcadeGameSettings['values'] });
  const fields: ReactNode[] = [];
  const add = (node: ReactNode) => fields.push(node);
  if (now.seconds !== null) add(<Stepper key="seconds" label="Round time" value={now.seconds} min={ARCADE_SECONDS_MIN} max={ARCADE_SECONDS_MAX} step={5} unit="s" disabled={disabled}
    onChange={value => onChange({ ...chosen, seconds: value })} />);
  switch (game) {
    case 'reaction': {
      const min = Number(values['minWaitMs']); const max = Number(values['maxWaitMs']);
      add(<Stepper key="min" label="GO at the earliest" value={min} min={1000} max={Math.min(10_000, max)} step={500} unit="s" format={seconds} disabled={disabled} onChange={minWaitMs => setValues({ minWaitMs })} />);
      add(<Stepper key="max" label="GO at the latest" value={max} min={Math.max(1000, min)} max={15_000} step={500} unit="s" format={seconds} disabled={disabled} onChange={maxWaitMs => setValues({ maxWaitMs })} />);
      break;
    }
    case 'tap-race': add(<Stepper key="race" label="Race length" value={Number(values['seconds'])} min={3} max={60} unit="s" disabled={disabled} onChange={value => setValues({ seconds: value })} />); break;
    case 'perfect-circle': add(<Stepper key="draw" label="Drawing time" value={Number(values['seconds'])} min={3} max={30} unit="s" disabled={disabled} onChange={value => setValues({ seconds: value })} />); break;
    case 'stop-clock': {
      const target = Number(values['targetMs']); const visible = Number(values['visibleMs']);
      add(<Stepper key="target" label="Stop at" value={target} min={2000} max={60_000} step={500} unit="s" format={seconds} disabled={disabled}
        onChange={targetMs => setValues({ targetMs, visibleMs: Math.min(visible, targetMs - 500) })} />);
      add(<Stepper key="visible" label="Clock vanishes after" value={visible} min={0} max={target - 500} step={500} unit="s" format={seconds} disabled={disabled} onChange={visibleMs => setValues({ visibleMs })} />);
      break;
    }
    case 'cut-the-line': {
      const target = values['target'] as { mode: 'exact'; value: number } | undefined;
      add(<Choice key="mode" label="Target" value={target ? 'fixed' : 'random'} disabled={disabled} options={[{ value: 'random', text: 'Random' }, { value: 'fixed', text: 'Fixed' }]}
        onChange={mode => setValues({ target: mode === 'fixed' ? { mode: 'exact', value: 37 } : undefined })} />);
      if (target?.mode === 'exact') add(<Stepper key="value" label="Cut at" value={target.value} min={0} max={100} unit="%" disabled={disabled} onChange={value => setValues({ target: { mode: 'exact', value } })} />);
      break;
    }
    case 'count-the-dots': {
      const count = values['count'] as { mode: 'exact'; value: number } | undefined;
      add(<Choice key="mode" label="Dots" value={count?.mode === 'exact' ? 'fixed' : 'random'} disabled={disabled} options={[{ value: 'random', text: 'Random' }, { value: 'fixed', text: 'Fixed' }]}
        onChange={mode => setValues({ count: mode === 'fixed' ? { mode: 'exact', value: 80 } : undefined })} />);
      if (count?.mode === 'exact') add(<Stepper key="count" label="How many dots" value={count.value} min={1} max={DOT_COUNT_MAX} step={5} disabled={disabled} onChange={value => setValues({ count: { mode: 'exact', value: Math.max(1, value) } })} />);
      add(<Stepper key="view" label="Dots shown for" value={Number(values['viewSeconds'])} min={DOT_VIEW_MIN_SECONDS} max={DOT_VIEW_MAX_SECONDS} unit="s" disabled={disabled} onChange={viewSeconds => setValues({ viewSeconds })} />);
      break;
    }
    case 'lucky-doors': {
      // The doors as a count and the best prize, spread evenly from nothing (the editor sets each door; here a few taps).
      const doors = (values['doorsMilli'] as string[]).map(points); const best = Math.max(1, ...doors);
      const spread = (count: number, top: number) => Array.from({ length: count }, (_, index) => String(Math.round(top * index / (count - 1)) * 1000));
      add(<Stepper key="doors" label="Doors" value={doors.length} min={2} max={8} disabled={disabled} onChange={count => setValues({ doorsMilli: spread(count, best) })} />);
      add(<Stepper key="best" label="Best door" value={best} min={1} max={100} unit="pts" disabled={disabled} onChange={top => setValues({ doorsMilli: spread(doors.length, top) })} />);
      break;
    }
    case 'relay-drawing':
      add(<Stepper key="turn" label="Time per turn" value={Number(values['secondsPerTurn'])} min={5} max={60} step={5} unit="s" disabled={disabled} onChange={secondsPerTurn => setValues({ secondsPerTurn })} />);
      add(<Stepper key="vote" label="Voting time" value={Number(values['voteSeconds'])} min={10} max={120} step={5} unit="s" disabled={disabled} onChange={voteSeconds => setValues({ voteSeconds })} />);
      break;
    case 'bus': {
      const sips = values['sips'] as number[];
      ['Red or black', 'Higher or lower', 'Inside or outside', 'The suit'].forEach((label, index) => add(<Stepper key={`sips-${index}`} label={`${label}: sips`} value={sips[index] ?? 0} min={0} max={20} disabled={disabled}
        onChange={value => setValues({ sips: sips.map((entry, at) => at === index ? value : entry) })} />));
      add(<Choice key="rainbow" label="Rainbow" value={values['rainbow'] === false ? 'off' : 'on'} disabled={disabled} options={[{ value: 'on', text: 'On', name: 'Rainbow on' }, { value: 'off', text: 'Off', name: 'Rainbow off' }]}
        onChange={value => setValues({ rainbow: value === 'on' })} />);
      break;
    }
    case 'red-or-black-roulette': add(<Stepper key="floor" label="Everyone may bet at least" value={Number(values['betFloor'] ?? ROULETTE_BET_FLOOR)} min={0} max={1000} step={5} unit="pts" disabled={disabled} onChange={betFloor => setValues({ betFloor })} />); break;
    case 'rps': add(<Choice key="first" label="First to" value={Number(values['firstTo'])} disabled={disabled} options={[1, 2, 3, 4, 5].map(value => ({ value, text: String(value), name: `First to ${value} wins` }))} onChange={firstTo => setValues({ firstTo })} />); break;
    case 'creature-duel': add(<Choice key="size" label="Creatures" value={Number(values['size'])} disabled={disabled} options={[{ value: 1, text: 'One' }, { value: 3, text: 'Team of 3' }]} onChange={size => setValues({ size })} />); break;
    case 'eight-ball': {
      const behavior = (values['ballBehavior'] as { preset?: string } | undefined)?.preset ?? 'realistic';
      add(<Choice key="felt" label="Table" value={String(values['felt'] ?? 'green')} disabled={disabled}
        options={POOL_FELTS.map(felt => ({ value: felt, text: <span className="arcade-felt" style={{ background: POOL_FELT_COLORS[felt].base }} />, name: `${felt} table` }))} onChange={felt => setValues({ felt })} />);
      add(<Choice key="balls" label="Balls" value={behavior === 'custom' ? 'realistic' : behavior} disabled={disabled}
        options={[{ value: 'realistic', text: 'Real' }, { value: 'arcade', text: 'Arcade' }, { value: 'heavy', text: 'Heavy' }]} onChange={preset => setValues({ ballBehavior: { preset } })} />);
      add(<Choice key="clock" label="Shot clock" value={Number(values['shotSeconds'] ?? 30)} disabled={disabled}
        options={POOL_SHOT_SECONDS.map(value => ({ value, text: value ? `${value}s` : 'Off', name: value ? `${value} seconds per shot` : 'No shot clock' }))} onChange={shotSeconds => setValues({ shotSeconds })} />);
      break;
    }
    default: break;
  }
  const changed = chosen && (chosen.seconds !== undefined || Object.keys(own).length > 0);
  return <div className="arcade-game-settings">
    {fields}
    {!isHeadToHeadKey(game) && fields.length === 1 && <p className="arcade-meta">This game has no other settings.</p>}
    {!disabled && <button type="button" className="ghost" disabled={!changed} onClick={() => onChange({})}><FaIcon name="arrow-rotate-left" /> Standard settings</button>}
  </div>;
}
