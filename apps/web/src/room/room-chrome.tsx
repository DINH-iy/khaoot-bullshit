import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { isStepMinigame, type MinigameKey, type MinigameSettings, type RoomSnapshot } from '@party/contracts';
import { FaIcon, type IconName } from '../presentation/icons.js';
import './room-chrome.css';
import { StageTimer } from './stage-timer.js';
import { useText } from '../presentation/look.js';
import { howToPlay } from '../minigames/shared/how-to-play.js';
import { translate } from '../i18n/texts.js';
import { CONNECTION_KEYS, ROOM_TEXTS } from './room.text.js';
const r = (key: keyof typeof ROOM_TEXTS.en, values?: Record<string, string | number>) => translate(ROOM_TEXTS, key, values);
import { nameList } from './teams.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;

/**
 * A small button with a panel that opens over the page (not pushing anything down): the
 * room's way of keeping details one tap away. Escape or a tap outside closes it.
 */
export function Popover({ label, icon, text, className, children, align = 'end', closeOnAction = false }: { label: string; icon?: IconName; text?: ReactNode; className?: string; children: ReactNode; align?: 'start' | 'end'; closeOnAction?: boolean }) {
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true); return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  return <div ref={box} className={`popover${className ? ` ${className}` : ''}`} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="popover-button" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={text ? undefined : label} title={label} onClick={() => setOpen(!open)}>
      {icon && <FaIcon name={icon} />}{text}</button>
    {/* `closeOnAction`: a menu of actions closes once one is chosen (a button marked data-keep-open, such as "ask first", keeps it open). */}
    {open && <div id={id} className={`popover-panel align-${align}`} role="dialog" aria-label={label}
      onClick={closeOnAction ? event => { const button = (event.target as HTMLElement).closest('button'); if (button && !button.hasAttribute('data-keep-open')) setOpen(false); } : undefined}>{children}</div>}
  </div>;
}

/** A number with its icon: points (a star) or sips (a glass)… Text for screen readers says what it is. */
export function Badge({ icon, value, label, tone }: { icon: IconName; value: ReactNode; label: string; tone?: 'points' | 'sips' | 'muted' }) {
  return <span className={`badge${tone ? ` badge-${tone}` : ''}`} title={label}><FaIcon name={icon} /><span aria-hidden="true">{value}</span><span className="visually-hidden">{label}</span></span>;
}

/** The connection as a dot (green or red) with a menu: the status in words, reconnect, and the measurements. */
export function ConnectionMenu({ status, ok, slow = false, busy, saving, onReconnect, details }: { status: string; ok: boolean; slow?: boolean; busy: boolean; saving: boolean; onReconnect: () => void; details: ReactNode }) {
  // The state in this device's language (the code keeps comparing the English values).
  const shown = CONNECTION_KEYS[status] ? r(CONNECTION_KEYS[status]!) : status;
  return <div className="room-connection" role="region" aria-label={r('connection')}>
    {/* Sending an action shows as a small spinner here, so nothing on the page moves. */}
    {saving && <span className="saving-spinner" role="status" aria-label={r('saving')}><span aria-hidden="true" /></span>}
    {/* Green: connected; orange: connected but slow; red: not connected. */}
    <Popover label={`${r('connectionLabel', { status: busy ? r('verifying') : shown })}${ok && slow ? r('slow') : ''}`} className="conn-menu" text={<span className={`conn-dot ${ok ? (slow ? 'slow' : 'ok') : 'bad'}`} aria-hidden="true" />}>
      <p role="status" aria-label={r('connectionStatus')} className={`conn ${ok ? 'conn-ok' : 'conn-bad'}`}>{busy ? r('verifyingLong') : shown}</p>
      {ok && slow && <p className="conn-slow">{r('slowNote')}</p>}
      <button type="button" className="ghost" onClick={onReconnect} disabled={busy}><FaIcon name="rotate" /> Reconnect and sync</button>
      {details}
    </Popover>
  </div>;
}

/** The kind of round as an icon. */
const KIND_ICON: Partial<Record<Stage['kind'], IconName>> = { minigame: 'stopwatch', duel: 'users', route: 'flag', vote: 'star', teams: 'users', scoreboard: 'trophy', challenge: 'trophy' };

/**
 * The round in one line: what to do now, your team (a coloured flag), the time; everything
 * else (team rules, how a team decides, sips…) behind the (i).
 */
export function RoundBar({ state, stage, phase, remaining, timerRef, tools }: { state: RoomSnapshot; stage: Stage; phase: string | null; remaining: number | null; timerRef: RefObject<HTMLDivElement | null>; tools?: ReactNode }) {
  const forming = Boolean(stage.teams?.forming); const teams = stage.teams;
  const mine = state.role === 'player' && teams && !forming ? teams.teams.find(team => team.memberIds.includes(state.selfPlayerId ?? '')) : undefined;
  const t = useText(); const details = roundDetails(stage, t);
  if (mine) { const mates = mine.memberIds.filter(id => id !== state.selfPlayerId); const captain = teams?.answers === 'captain' && mine.captainId ? r('captainIs', { name: mine.captainId === state.selfPlayerId ? r('you') : state.players.find(player => player.id === mine.captainId)?.displayName ?? r('someone') }) : '';
    details.unshift(['flag', `${mates.length ? r('youAreInWith', { team: mine.name, mates: nameList(state, mates) }) : r('youAreIn', { team: mine.name })}${captain}`]); }
  if (!phase && !mine && !details.length && !tools && (forming || stage.status !== 'ACTIVE')) return null;
  return <div className="round-info" role="group" aria-label={r('thisRound')}>
    {phase && <p className={`chip phase-pill${forming ? ' teams' : ''}`} role="status">{KIND_ICON[stage.kind] && <FaIcon name={KIND_ICON[stage.kind]!} />}{phase}</p>}
    {/* Phones: how many have answered (voted), next to the phase, compact, so the round keeps the room. The host and the shared screen show it as a line. */}
    {state.role === 'player' && counted(stage) && (() => {
      const text = `${t(stage.kind === 'vote' ? 'progress.voted' : 'progress.answered', { count: stage.submittedCount, total: stage.eligibleCount })}${stage.status === 'CLOSED' ? ` · ${t('progress.locked')}` : ''}`;
      return <p className="chip chip-count" title={text}><FaIcon name={stage.status === 'CLOSED' ? 'lock' : 'check'} /><span aria-hidden="true">{stage.submittedCount}/{stage.eligibleCount}</span><span className="visually-hidden">{text}</span></p>;
    })()}
    {/* Your team as its colour only (the name is read out and shown on hover); the page's top stripe has it too. */}
    {mine && <p className="chip team-flag" style={{ '--team': mine.color } as React.CSSProperties} title={r('yourTeam', { team: mine.name })}>
      <FaIcon name="flag" /><span className="visually-hidden">{r('yourTeamHidden')}{mine.name}</span>{mine.captainId === state.selfPlayerId && <span className="team-captain" title={r('youCaptain')}><FaIcon name="star" label={r('captain')} /></span>}</p>}
    {stage.input?.kind === 'drawing' && stage.input.blind && <p className="chip chip-warn"><span aria-hidden="true">🙈</span> {r('blind')}</p>}
    {!forming && !stage.explain && stage.minigame?.game !== 'stop-clock' && <div ref={timerRef} className={`chip chip-timer${remaining === null ? ' no-limit' : ''}`}><StageTimer stage={stage} remaining={remaining} /></div>}
    {stage.minigame?.game === 'stop-clock' && stage.status === 'ACTIVE' && !stage.explain &&
      stage.pausedRemainingMs === null && remaining === 0 && <p className="chip" role="status">{t('timer.up')}</p>}
    {details.length > 0 && <Popover label={r('aboutRound')} icon="circle-info" className="round-about" align="end">
      <ul className="round-details">{details.map(([icon, text]) => <li key={text}><FaIcon name={icon} />{text}</li>)}</ul></Popover>}
    {/* Extra tools at the right end, after the ⓘ (an arcade round's leader menu). */}
    {tools}
  </div>;
}

/** Rounds where people answer or vote, until the results are shown (with a lock once answers are closed): the top bar counts them. */
export const counted = (stage: Stage) => ['collect', 'vote', 'minigame'].includes(stage.kind) && stage.status !== 'VOID' && !stage.revealed && !stage.explain && !stage.teams?.forming && stage.eligibleCount > 0;
/** What the (i) explains about the round. */
function roundDetails(stage: Stage, t: ReturnType<typeof useText>): [IconName, string][] {
  const rows: [IconName, string][] = [];
  if (stage.teams && !stage.teams.forming) rows.push(['users', r('teamRound', { who: r(stage.teams.answers === 'captain' ? 'captainsAnswer' : 'everyoneAnswers') })]);
  const minigame = stage.minigame;
  if (minigame) {
    const game = minigame.game as MinigameKey; rows.push(['circle-info', howToPlay(t, { ...minigame, game })]);
    if (isStepMinigame(game) && stage.teams && minigame.steps) rows.push(['users', r(minigame.steps.decides === 'vote' ? 'stepsVote' : minigame.steps.decides === 'captain' ? 'stepsCaptain' : 'stepsAnyone')]);
    if (game === 'bus') {
      const settings = minigame.settings as MinigameSettings<'bus'>;
      rows.push(['beer-mug-empty', r('sips', { sips: settings.sips.join(', ') })]);
      if (settings.rainbow !== false) rows.push(['star', r('rainbow')]);
    }
  }
  if (stage.input?.kind === 'drawing' && stage.input.blind) rows.push(['circle-info', r('blindRound')]);
  return rows;
}

/**
 * The scores as a small card: floating in a corner of the shared screen, docked at the bottom of the host panel: rank, face, name,
 * points. It can be folded to a single line with the leader; that choice is remembered here.
 */
export function FloatingScores({ children, leader, docked = false }: { children: ReactNode; leader: ReactNode; docked?: boolean }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('party_scores_open') !== 'false'; } catch { return true; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem('party_scores_open', String(!open)); } catch { /* remembered for this visit */ } };
  return <section className={`floating-scores${docked ? ' docked' : ''}${open ? '' : ' folded'}`} aria-label={r('scores')}>
    <button type="button" className="floating-scores-head" aria-expanded={open} onClick={toggle}>
      <FaIcon name="trophy" /><span className="floating-scores-title">{open ? r('scores') : leader}</span><FaIcon name={open ? 'chevron-down' : 'chevron-up'} /></button>
    {open && <div className="floating-scores-body">{children}</div>}
  </section>;
}

/**
 * A wide popup over the host screen for the less frequent things (room settings, shared screen & invite,
 * players during the game), so the host panel stays short. Escape, the × or a click outside closes it.
 */
export function HostDialog({ title, icon, onClose, children, portal, size = 'wide' }: { portal: HTMLElement | null; title: string; icon: IconName; onClose: () => void; children: ReactNode; size?: 'wide' | 'compact' }) {
  const box = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; box.current?.focus(); return () => previous?.focus?.(); }, []);
  // Escape closes it wherever focus is (a button inside may have been replaced, leaving focus on the page).
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, []);
  const dialog = <div className="host-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} tabIndex={-1} className={`host-dialog ${size}`} role="dialog" aria-modal="true" aria-labelledby={id}>
      <header className="host-dialog-head"><h2 id={id}><FaIcon name={icon} /> {title}</h2>
        <button type="button" className="icon-button" aria-label={r('close')} title={r('close')} onClick={onClose}><FaIcon name="xmark" /></button></header>
      <div className="host-dialog-body">{children}</div>
    </div>
  </div>;
  return portal ? createPortal(dialog, portal) : dialog;
}
