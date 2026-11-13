import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { ReactionTray } from './reactions.js';
import { setSound, soundOn, unlockSound } from './celebrate.js';
import './room-extras.css';

type Sheet = 'scores' | 'players' | 'react' | null;

/** A bottom sheet over the phone screen; Escape or the close button closes it, and focus goes into it. */
function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []);
  return <div className="sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      <div className="sheet-head"><h2 id="sheet-heading" ref={heading} tabIndex={-1}>{title}</h2><button type="button" className="ghost small-button" onClick={onClose}>✕<span className="visually-hidden"> Close</span></button></div>
      <div className="sheet-body">{children}</div>
    </div>
  </div>;
}

/**
 * The phone keeps the round on screen and everything else one tap away: the
 * scoreboard (when the host allows it), the players, reactions to the big
 * screen, and sound on or off. Nothing to scroll for.
 */
export function PhoneDock({ state, scores, canSeeScores, onChangeLook, onReact, onBreak }: {
  state: RoomSnapshot; scores: ReactNode; canSeeScores: boolean; onChangeLook: () => void; onReact: (reaction: number) => void; onBreak: (vote: boolean) => void;
}) {
  const t = useText(); const [sheet, setSheet] = useState<Sheet>(null); const [sound, setSoundState] = useState(soundOn);
  // Sound needs a first tap on phones; any tap in the dock (or an answer) prepares it.
  useEffect(() => { const prepare = () => unlockSound(); window.addEventListener('pointerdown', prepare, { once: true }); return () => window.removeEventListener('pointerdown', prepare); }, []);
  const close = () => setSheet(null);
  return <>
    <nav className="phone-dock" aria-label="More">
      {canSeeScores && <button type="button" onClick={() => setSheet('scores')}><span aria-hidden="true">🏆</span><small>{t('scores.title')}</small></button>}
      <button type="button" onClick={() => setSheet('players')}><span aria-hidden="true">👥</span><small>{t('players.title', { count: state.players.length })}</small></button>
      {state.settings.reactions && state.view.status !== 'FINISHED' && <button type="button" onClick={() => setSheet('react')}><span aria-hidden="true">😀</span><small>React</small></button>}
      {state.settings.breakVotes && state.view.status === 'RUNNING' && <button type="button" aria-pressed={state.break.voted} onClick={() => onBreak(!state.break.voted)}>
        <span aria-hidden="true">{t('break.icon')}</span><small>{t('break.vote')} {state.break.votes}/{state.break.needed}</small></button>}
      <button type="button" aria-pressed={sound} onClick={() => { unlockSound(); setSound(!sound); setSoundState(!sound); }}><span aria-hidden="true">{sound ? '🔊' : '🔇'}</span><small>Sound</small></button>
    </nav>
    {sheet === 'scores' && <BottomSheet title={t('scores.title')} onClose={close}>{scores}</BottomSheet>}
    {sheet === 'players' && <BottomSheet title={t('players.title', { count: state.players.length })} onClose={close}>
      <ul className="sheet-players">{state.players.map(player => <li key={player.id}><Avatar look={player.look} size={40} /><span>{player.displayName}{player.id === state.selfPlayerId ? ' (you)' : ''}</span>
        <span className={`dot ${player.connected ? 'on' : 'off'}`} aria-label={player.connected ? 'connected' : 'disconnected'} /></li>)}</ul>
      <button type="button" className="primary" onClick={() => { close(); onChangeLook(); }}>{t('players.changeLook')}</button>
    </BottomSheet>}
    {sheet === 'react' && <BottomSheet title={t('react.open')} onClose={close}><ReactionTray onSend={onReact} choices={state.settings.reactionChoices} limit={state.settings.reactionLimit} /></BottomSheet>}
  </>;
}
