import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { howToPlayKey, isStepMinigame, type MinigameKey, type MinigameSettings, type RoomSnapshot } from '@party/contracts';
import { FaIcon, type IconName } from '../presentation/icons.js';
import './room-chrome.css';
import { StageTimer } from './stage-timer.js';
import { useText } from '../presentation/look.js';
import { nameList, teamColor } from './teams.js';

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
  return <div className="room-connection" role="region" aria-label="Connection">
    {/* Sending an action shows as a small spinner here, so nothing on the page moves. */}
    {saving && <span className="saving-spinner" role="status" aria-label="Saving"><span aria-hidden="true" /></span>}
    {/* Green: connected; orange: connected but slow; red: not connected. */}
    <Popover label={`Connection: ${busy ? 'verifying access' : status}${ok && slow ? ' (slow)' : ''}`} className="conn-menu" text={<span className={`conn-dot ${ok ? (slow ? 'slow' : 'ok') : 'bad'}`} aria-hidden="true" />}>
      <p role="status" aria-label="Connection status" className={`conn ${ok ? 'conn-ok' : 'conn-bad'}`}>{busy ? 'Verifying access…' : status}</p>
      {ok && slow && <p className="conn-slow">The connection is slow: actions may take a moment.</p>}
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
  if (mine) { const mates = mine.memberIds.filter(id => id !== state.selfPlayerId); const captain = teams?.answers === 'captain' && mine.captainId ? ` Captain: ${mine.captainId === state.selfPlayerId ? 'you' : state.players.find(player => player.id === mine.captainId)?.displayName ?? 'someone'}.` : '';
    details.unshift(['flag', `You are in ${mine.name}${mates.length ? ` with ${nameList(state, mates)}` : ''}.${captain}`]); }
  if (!phase && !mine && !details.length && !tools && (forming || stage.status !== 'ACTIVE')) return null;
  return <div className="round-info" role="group" aria-label="This round">
    {phase && <p className={`chip phase-pill${forming ? ' teams' : ''}`} role="status">{KIND_ICON[stage.kind] && <FaIcon name={KIND_ICON[stage.kind]!} />}{phase}</p>}
    {mine && <p className="chip team-flag" style={{ '--team': teamColor(mine.name, mine.index) } as React.CSSProperties} title={`Your team: ${mine.name}`}>
      <FaIcon name="flag" /><span className="visually-hidden">Your team: </span>{mine.name}{mine.captainId === state.selfPlayerId && <span className="team-captain" title="You are the captain"><FaIcon name="star" label="captain" /></span>}</p>}
    {stage.input?.kind === 'drawing' && stage.input.blind && <p className="chip chip-warn"><span aria-hidden="true">🙈</span> Blind</p>}
    {!forming && !stage.explain && <div ref={timerRef} className={`chip chip-timer${remaining === null ? ' no-limit' : ''}`}><StageTimer stage={stage} remaining={remaining} /></div>}
    {details.length > 0 && <Popover label="About this round" icon="circle-info" className="round-about" align="end">
      <ul className="round-details">{details.map(([icon, text]) => <li key={text}><FaIcon name={icon} />{text}</li>)}</ul></Popover>}
    {/* Extra tools at the right end, after the ⓘ (an arcade round's leader menu). */}
    {tools}
  </div>;
}

/** What the (i) explains about the round. */
function roundDetails(stage: Stage, t: ReturnType<typeof useText>): [IconName, string][] {
  const rows: [IconName, string][] = [];
  if (stage.teams && !stage.teams.forming) rows.push(['users', `Team round · ${stage.teams.answers === 'captain' ? 'the captains answer for their team' : 'everyone answers'}`]);
  const minigame = stage.minigame;
  if (minigame) {
    const game = minigame.game as MinigameKey; rows.push(['circle-info', t(howToPlayKey(game))]);
    if (isStepMinigame(game) && stage.teams && minigame.steps) rows.push(['users', minigame.steps.decides === 'vote' ? 'Your team votes on every choice; who does not vote in time is not counted.' : minigame.steps.decides === 'captain' ? 'The captain makes every choice for the team.' : 'Anyone in the team taps the choice you agree on.']);
    if (game === 'bus') {
      const settings = minigame.settings as MinigameSettings<'bus'>;
      rows.push(['beer-mug-empty', `Sips when wrong: ${settings.sips.join(', ')} (rounds 1 to 4)`]);
      if (settings.rainbow !== false) rows.push(['star', 'Rainbow (four different suits): the other teams drink the last round’s sips.']);
    }
  }
  if (stage.input?.kind === 'drawing' && stage.input.blind) rows.push(['circle-info', 'Blind round: you see your drawing only once it is sent.']);
  return rows;
}

/**
 * The scores as a small card: floating in a corner of the shared screen, docked at the bottom of the host panel: rank, face, name,
 * points. It can be folded to a single line with the leader; that choice is remembered here.
 */
export function FloatingScores({ children, leader, docked = false }: { children: ReactNode; leader: ReactNode; docked?: boolean }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('party_scores_open') !== 'false'; } catch { return true; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem('party_scores_open', String(!open)); } catch { /* remembered for this visit */ } };
  return <section className={`floating-scores${docked ? ' docked' : ''}${open ? '' : ' folded'}`} aria-label="Scores">
    <button type="button" className="floating-scores-head" aria-expanded={open} onClick={toggle}>
      <FaIcon name="trophy" /><span className="floating-scores-title">{open ? 'Scores' : leader}</span><FaIcon name={open ? 'chevron-down' : 'chevron-up'} /></button>
    {open && <div className="floating-scores-body">{children}</div>}
  </section>;
}

/**
 * A wide popup over the host screen for the less frequent things (room settings, shared screen & invite,
 * players during the game), so the host panel stays short. Escape, the × or a click outside closes it.
 */
export function HostDialog({ title, icon, onClose, children, size = 'wide' }: { title: string; icon: IconName; onClose: () => void; children: ReactNode; size?: 'wide' | 'compact' }) {
  const box = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; box.current?.focus(); return () => previous?.focus?.(); }, []);
  // Escape closes it wherever focus is (a button inside may have been replaced, leaving focus on the page).
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, []);
  return <div className="host-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} tabIndex={-1} className={`host-dialog ${size}`} role="dialog" aria-modal="true" aria-labelledby={id}>
      <header className="host-dialog-head"><h2 id={id}><FaIcon name={icon} /> {title}</h2>
        <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={onClose}><FaIcon name="xmark" /></button></header>
      <div className="host-dialog-body">{children}</div>
    </div>
  </div>;
}
