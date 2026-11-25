import type { GameRoomSettings } from '@party/contracts';
import { Section } from '../controls/section.js';
import type { Definition } from '../model.js';
import { useTexts } from '../../i18n/texts.js';
import { HOST_TEXTS } from '../../room/host.text.js';
import { SETTINGS_TEXTS } from './settings.text.js';

// The room's standard settings; the game stores only what differs from them (`room` in the definition).
const STANDARD = { showScores: true, reactions: true, reactionLimit: 10, breakVotes: true, breakPercent: 50, autoClose: true, autoCloseSeconds: 3 } satisfies Required<GameRoomSettings>;
type Key = keyof typeof STANDARD;

/** Game settings → Room settings: what a room of this game starts with. The host can change them in the room (closing a round only in the lobby). */
export function RoomStartSettings({ definition, onChange, problems }: { definition: Definition; onChange: (next: Definition) => void; problems: string[] }) {
  const t = useTexts(SETTINGS_TEXTS); const h = useTexts(HOST_TEXTS);
  const room = (definition['room'] ?? {}) as GameRoomSettings;
  const value = <K extends Key>(key: K) => (room[key] ?? STANDARD[key]) as typeof STANDARD[K];
  const set = (key: Key, next: boolean | number) => {
    const changed: Record<string, unknown> = { ...room, [key]: next };
    if (next === STANDARD[key]) delete changed[key];
    const copy = { ...definition };
    if (Object.keys(changed).length) copy['room'] = changed; else delete copy['room'];
    onChange(copy);
  };
  const toggle = (key: 'showScores' | 'reactions' | 'breakVotes' | 'autoClose', label: string) =>
    <label className="choice"><input type="checkbox" checked={value(key)} onChange={event => set(key, event.target.checked)} />{label}</label>;
  const number = (key: 'reactionLimit' | 'breakPercent' | 'autoCloseSeconds', label: string, min: number, max: number, step = 1) =>
    <label className="ed-inline">{label}<span className="ed-unit"><input type="number" inputMode="numeric" min={min} max={max} step={step} value={value(key)}
      onChange={event => { const next = Math.round(Number(event.target.value)); if (next >= min && next <= max) set(key, next); }} /></span></label>;
  return <Section title={t('room')} memory="Room settings" problems={problems} summary={t(Object.keys(room).length ? 'roomOwn' : 'roomStandard')}>
    {toggle('showScores', h('sShowScores'))}
    {toggle('reactions', h('sReactions'))}
    {value('reactions') && number('reactionLimit', t('reactionLimit'), 1, 30)}
    {toggle('breakVotes', h('sBreakVotes'))}
    {value('breakVotes') && number('breakPercent', h('mustAgree'), 10, 100, 10)}
    {toggle('autoClose', h('sAutoClose'))}
    {value('autoClose') && number('autoCloseSeconds', h('waitSeconds'), 1, 30)}
    <p className="hint">{t('roomHint')}</p>
  </Section>;
}
