import { useEffect, useRef, useState } from 'react';
import { CELEBRATION_EMOJI, type RoomSnapshot, type TeamCelebration } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { BottomSheet } from '../room-extras/bottom-sheet.js';
import { playSound } from '../room-extras/sounds.js';
import { SOUND_TEXTS } from '../room-extras/sounds.text.js';
import { CELEBRATION_TEXTS } from './celebration.text.js';
import './celebration.css';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Send = (type: string, extra: Record<string, unknown>) => void;

/** A team's members pick their celebration while teams are made: an emoji, a cheer, and one of the game's sounds. */
export function CelebrationPicker({ state, stage, teamIndex, current, disabled, send, onClose }: {
  state: RoomSnapshot; stage: Stage; teamIndex: number; current: TeamCelebration | null | undefined; disabled: boolean; send: Send; onClose: () => void;
}) {
  const c = useTexts(CELEBRATION_TEXTS); const s = useTexts(SOUND_TEXTS); const sounds = state.view.party?.sounds ?? [];
  const [emoji, setEmoji] = useState(current?.emoji ?? CELEBRATION_EMOJI[0]); const [text, setText] = useState(current?.text ?? ''); const [sound, setSound] = useState<number | null>(current?.sound ?? (sounds.length ? 0 : null));
  const save = () => { send('teams.celebration', { stageRunId: stage.id, teamIndex, celebration: { emoji, text: text.trim(), sound } }); onClose(); };
  return <BottomSheet title={c('ours')} onClose={onClose}>
    <div className="celebration-picker">
      <p className="hint">{c('pick')}</p>
      <div className="celebration-emoji" role="radiogroup" aria-label={c('emoji')}>{CELEBRATION_EMOJI.map(option =>
        <button key={option} type="button" role="radio" aria-checked={emoji === option} onClick={() => setEmoji(option)}>{option}</button>)}</div>
      <label>{c('cheer')}<input value={text} maxLength={24} placeholder={c('placeholder')} onChange={event => setText(event.target.value)} /></label>
      {sounds.length > 0 && <div className="celebration-sounds" role="radiogroup" aria-label={c('sound')}>
        <button type="button" role="radio" aria-checked={sound === null} onClick={() => setSound(null)}>{c('noSound')}</button>
        {sounds.map((option, index) => <button key={index} type="button" role="radio" aria-checked={sound === index}
          onClick={() => { setSound(index); playSound(option); }}>{option.kind === 'builtin' ? s(option.name) : option.label}</button>)}</div>}
      <div className="actions">
        <button type="button" className="primary" disabled={disabled} onClick={save}>{c('save')}</button>
        {current && <button type="button" className="danger" disabled={disabled} onClick={() => { send('teams.celebration', { stageRunId: stage.id, teamIndex, celebration: null }); onClose(); }}>{c('clear')}</button>}
      </div>
    </div>
  </BottomSheet>;
}

/** The team that won the round just revealed: the most team points, and only one team with that many. */
function roundWinner(stage: Stage | null | undefined) {
  if (!stage?.revealed || !stage.teams || stage.teams.forming || !stage.reveal) return null;
  const awards = stage.reveal.teamAwards.map(award => ({ teamId: award.teamId, amount: BigInt(award.amountMilli) })).filter(award => award.amount > 0n).sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  if (!awards.length || (awards[1] && awards[1].amount === awards[0]!.amount)) return null;
  const team = stage.teams.teams.find(entry => entry.teamId === awards[0]!.teamId);
  return team ? { key: `round:${stage.id}`, teamId: team.teamId!, name: team.name, color: team.color, celebration: team.celebration ?? null, memberIds: team.memberIds } : null;
}
/** The team that won the game: first in the team standings at the end, alone. */
function gameWinner(state: RoomSnapshot) {
  if (state.view.status !== 'FINISHED') return null;
  const [first, second] = state.view.teamStandings;
  if (!first || BigInt(first.amountMilli) <= 0n || (second && second.amountMilli === first.amountMilli)) return null;
  return { key: `game:${state.view.sessionId}`, teamId: first.teamId, name: first.name, color: first.color, celebration: first.celebration ?? null, memberIds: first.memberIds };
}

/**
 * The winning team's celebration: on the screen that plays the room's sound (the shared screen, or the host's without one)
 * with its sound, and on the winning team's own phones without sound. Once per round and once at the end.
 */
export function TeamCelebrationShow({ state, playsSound }: { state: RoomSnapshot; playsSound: boolean }) {
  const c = useTexts(CELEBRATION_TEXTS); const shown = useRef(new Set<string>()); const [showing, setShowing] = useState<ReturnType<typeof roundWinner>>(null);
  const winner = gameWinner(state) ?? roundWinner(state.view.stage);
  const forMe = state.role !== 'player' ? playsSound : Boolean(winner && state.selfPlayerId && winner.memberIds.includes(state.selfPlayerId));
  useEffect(() => {
    if (!winner?.celebration || !forMe || shown.current.has(winner.key)) return;
    shown.current.add(winner.key); setShowing(winner);
    const sound = winner.celebration.sound === null ? undefined : state.view.party?.sounds[winner.celebration.sound];
    if (playsSound && sound) playSound(sound);
  }, [winner?.key, forMe]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!showing) return; const timer = setTimeout(() => setShowing(null), 4500); return () => clearTimeout(timer); }, [showing]);
  if (!showing?.celebration) return null;
  const { emoji, text } = showing.celebration;
  return <div className="team-celebration" role="status" style={{ '--team': showing.color } as React.CSSProperties}>
    <div className="team-celebration-burst" aria-hidden="true">{Array.from({ length: 24 }, (_, index) =>
      <i key={index} style={{ '--x': `${(index * 41) % 100}%`, '--delay': `${(index % 8) * 90}ms`, '--turn': `${(index * 53) % 360}deg` } as React.CSSProperties}>{emoji}</i>)}</div>
    <p className="team-celebration-card"><span className="team-celebration-emoji" aria-hidden="true">{emoji}</span><strong>{c('wins', { team: showing.name })}</strong>{text && <span>{text}</span>}</p>
  </div>;
}
